import express, { Router } from "express";
import { supabase } from "../lib/supabase";
import { getUploadPresignedUrl, getDownloadPresignedUrl, deleteB2File, generateStoragePath } from "../lib/b2";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const PER_USER_LIMIT = 500 * 1024 * 1024; // 500 MB

router.get("/notes", requireAuth, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("user_notes")
    .select("*")
    .eq("user_id", req.user!.id)
    .order("created_at", { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.delete("/notes/:noteId", requireAuth, async (req: AuthRequest, res) => {
  const { data: note } = await supabase
    .from("user_notes")
    .select("*")
    .eq("id", req.params["noteId"])
    .eq("user_id", req.user!.id)
    .single();
  if (!note) { res.status(404).json({ error: "Not found" }); return; }

  if (note.b2_file_id) {
    await deleteB2File(note.b2_storage_path, note.b2_file_id).catch(() => {});
  }

  await supabase.from("user_notes").delete().eq("id", req.params["noteId"]);
  res.json({ message: "Deleted" });
});

// ── Server-side PDF notes proxy upload ───────────────────────────────────────
// Replaces the broken two-step flow (get upload URL → browser fetches B2 directly).
// Metadata (chapter_id, filename, etc.) arrives as query params; raw PDF bytes
// are the request body. All gate checks, dedup, quota enforcement, DB insert,
// and the actual B2 upload happen here — no browser→B2 CORS issues.
router.post(
  "/b2/notes-upload",
  requireAuth,
  express.raw({ type: "*/*", limit: "50mb" }),
  async (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const body = req.body as Buffer;

    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "No file data received" });
      return;
    }

    const { chapter_id, filename, content_type, size_bytes, file_hash } =
      req.query as Record<string, string>;

    if (!chapter_id || !filename) {
      res.status(400).json({ error: "chapter_id and filename are required" });
      return;
    }

    const sizeBytes = parseInt(size_bytes ?? "0", 10) || body.length;

    // Gate check
    const { data: chapter_progress } = await supabase
      .from("user_chapter_progress")
      .select("pdf_upload_unlocked")
      .eq("user_id", userId)
      .eq("chapter_id", chapter_id)
      .maybeSingle();

    if (!chapter_progress?.pdf_upload_unlocked) {
      res.status(403).json({ error: "Complete the Chapter Test first to unlock PDF uploads" });
      return;
    }

    // SHA-256 deduplication check
    if (file_hash) {
      const { data: existing } = await supabase
        .from("user_notes")
        .select("id, title")
        .eq("user_id", userId)
        .eq("file_hash", file_hash)
        .maybeSingle();
      if (existing) {
        res.status(409).json({ error: `Duplicate file detected. You already uploaded "${existing.title}".` });
        return;
      }
    }

    // Quota check
    const { data: usageData } = await supabase
      .from("user_notes")
      .select("pdf_size_bytes")
      .eq("user_id", userId);
    const usedBytes = (usageData ?? []).reduce(
      (sum: number, n: { pdf_size_bytes: number }) => sum + (n.pdf_size_bytes ?? 0),
      0,
    );
    if (usedBytes + sizeBytes > PER_USER_LIMIT) {
      res.status(403).json({ error: "Storage quota exceeded (500MB per user)" });
      return;
    }

    const storagePath = generateStoragePath(userId, chapter_id, filename);
    const cleanName = filename.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");

    try {
      // Get B2 upload URL and push bytes entirely server-side — no browser CORS involved
      const { uploadUrl, uploadAuthToken } = await getUploadPresignedUrl(storagePath);
      logger.info({ userId, chapter_id, storagePath, bytes: body.length }, "[storage] Uploading PDF to B2...");

      const b2Res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: uploadAuthToken,
          "Content-Type": content_type || "application/pdf",
          "X-Bz-File-Name": encodeURIComponent(storagePath),
          "X-Bz-Content-Sha1": "do_not_verify",
          "Content-Length": String(body.length),
        },
        body: body,
      });

      if (!b2Res.ok) {
        const errText = await b2Res.text().catch(() => "");
        logger.error({ status: b2Res.status, errText, userId }, "[storage] B2 PDF upload failed");
        throw new Error(`B2 upload failed (${b2Res.status})${errText ? ": " + errText : ""}`);
      }

      // Insert the notes DB record after successful B2 upload
      await supabase.from("user_notes").insert({
        user_id: userId,
        chapter_id,
        title: cleanName,
        b2_storage_path: storagePath,
        pdf_size_bytes: sizeBytes,
        file_hash: file_hash ?? null,
        content_type: content_type ?? "application/pdf",
      });

      logger.info({ userId, chapter_id, storagePath }, "[storage] PDF uploaded and DB record created");
      res.json({ storage_path: storagePath, filename });
    } catch (e) {
      logger.error({ err: e, userId, chapter_id }, "[storage] Failed to upload PDF notes");
      const msg = e instanceof Error ? e.message : "Failed to upload PDF";
      res.status(500).json({ error: msg });
    }
  },
);

router.post("/b2/download-url", requireAuth, async (req: AuthRequest, res) => {
  const { storage_path } = req.body as { storage_path: string };
  const userId = req.user!.id;

  if (!storage_path.startsWith(`users/${userId}/`)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const url = await getDownloadPresignedUrl(storage_path);
    res.json({ download_url: url, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
  } catch (e) {
    logger.error({ err: e, userId, storage_path }, "[storage] Failed to generate download URL");
    const msg = e instanceof Error ? e.message : "Failed to generate download URL";
    res.status(500).json({ error: msg });
  }
});

// ── Server-side PDF proxy (for react-pdf inline rendering) ───────────────────
// Fetches the PDF from B2 server-side and streams it to the client.
// This avoids CORS issues when pdfjs-dist fetches PDFs directly from B2.
router.get("/b2/pdf-proxy", requireAuth, async (req: AuthRequest, res) => {
  const { storage_path } = req.query as { storage_path?: string };
  const userId = req.user!.id;

  if (!storage_path || !storage_path.startsWith(`users/${userId}/`)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const url = await getDownloadPresignedUrl(storage_path);
    const b2Res = await fetch(url);

    if (!b2Res.ok) {
      const errText = await b2Res.text().catch(() => "");
      logger.error({ status: b2Res.status, errText, userId }, "[storage] PDF proxy B2 fetch failed");
      res.status(502).json({ error: "Failed to fetch PDF from storage" });
      return;
    }

    if (!b2Res.body) {
      res.status(502).json({ error: "Empty response from storage" });
      return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, max-age=900"); // 15-min cache

    const contentLength = b2Res.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    // Stream B2 body to client — no intermediate buffering in memory
    const { Readable } = await import("stream");
    const nodeStream = Readable.fromWeb(b2Res.body as Parameters<typeof Readable.fromWeb>[0]);
    nodeStream.pipe(res);
    nodeStream.on("error", err => {
      logger.error({ err, userId, storage_path }, "[storage] PDF proxy stream error");
      if (!res.headersSent) res.status(500).end();
    });
  } catch (e) {
    logger.error({ err: e, userId, storage_path }, "[storage] PDF proxy failed");
    const msg = e instanceof Error ? e.message : "Proxy failed";
    if (!res.headersSent) res.status(500).json({ error: msg });
  }
});

// ── Profile photo routes removed ──────────────────────────────────────────────
// Profile photos have been migrated from Backblaze B2 to Supabase Storage.
// The browser uploads directly to the "avatars" Supabase Storage bucket using
// the Supabase JS client. No Express proxy is needed — Supabase Storage handles
// CORS natively. See ProfilePage.tsx for the upload/delete logic.

router.get("/b2/quota", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { data } = await supabase
    .from("user_notes")
    .select("pdf_size_bytes")
    .eq("user_id", userId);
  const used = (data ?? []).reduce((sum: number, n: { pdf_size_bytes: number }) => sum + (n.pdf_size_bytes ?? 0), 0);
  const files = data?.length ?? 0;
  res.json({
    used_bytes: used,
    limit_bytes: PER_USER_LIMIT,
    used_percentage: (used / PER_USER_LIMIT) * 100,
    file_count: files,
  });
});

export default router;
