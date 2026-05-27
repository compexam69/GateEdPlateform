import express, { Router } from "express";
import { supabase } from "../lib/supabase";
import { getUploadPresignedUrl, getDownloadPresignedUrl, deleteB2File, getB2FileIdByPath, generateStoragePath, generateProfilePhotoPath } from "../lib/b2";
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

router.post("/b2/upload-url", requireAuth, async (req: AuthRequest, res) => {
  const { chapter_id, filename, content_type, size_bytes, file_hash } = req.body;
  const userId = req.user!.id;

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

  const { data: usageData } = await supabase
    .from("user_notes")
    .select("pdf_size_bytes")
    .eq("user_id", userId);
  const usedBytes = (usageData ?? []).reduce((sum: number, n: { pdf_size_bytes: number }) => sum + (n.pdf_size_bytes ?? 0), 0);

  if (usedBytes + size_bytes > PER_USER_LIMIT) {
    res.status(403).json({ error: "Storage quota exceeded (500MB per user)" });
    return;
  }

  const storagePath = generateStoragePath(userId, chapter_id, filename);
  const expiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  try {
    const { uploadUrl, uploadAuthToken } = await getUploadPresignedUrl(storagePath);

    // Create the user_notes record now (with size and hash); b2_file_id populated after client confirms upload
    const cleanName = filename.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
    await supabase.from("user_notes").insert({
      user_id: userId,
      chapter_id,
      title: cleanName,
      b2_storage_path: storagePath,
      pdf_size_bytes: size_bytes,
      file_hash: file_hash ?? null,
      content_type: content_type ?? "application/pdf",
    }).select().single();

    res.json({ upload_url: uploadUrl, upload_auth_token: uploadAuthToken, storage_path: storagePath, expires_at: expiry });
  } catch (e) {
    logger.error({ err: e, userId, chapter_id }, "[storage] Failed to generate upload URL");
    const msg = e instanceof Error ? e.message : "Failed to generate upload URL";
    res.status(500).json({ error: msg });
  }
});

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

// ── Server-side profile photo proxy upload ────────────────────────────────────
// The browser cannot upload directly to Backblaze B2 upload pod domains
// because those pods do not send CORS headers. This endpoint accepts the raw
// image bytes from the browser, uploads to B2 server-side (no CORS involved),
// then updates the profile — one round-trip, no CORS issues.
router.post(
  "/b2/profile-upload",
  requireAuth,
  express.raw({ type: "*/*", limit: "10mb" }),
  async (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const body = req.body as Buffer;

    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "No image data received" });
      return;
    }

    const storagePath = generateProfilePhotoPath(userId);
    try {
      // Delete old profile photo (best-effort, non-blocking failure)
      const { data: profile } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", userId)
        .maybeSingle();

      if (profile?.avatar_url) {
        try {
          const oldFileId = await getB2FileIdByPath(String(profile.avatar_url));
          if (oldFileId) await deleteB2File(String(profile.avatar_url), oldFileId);
        } catch (e) {
          logger.warn({ err: e, userId }, "[storage] Old profile photo cleanup failed (non-fatal)");
        }
      }

      // Get upload URL and push bytes to B2 entirely server-side — no CORS
      const { uploadUrl, uploadAuthToken } = await getUploadPresignedUrl(storagePath);
      logger.info({ userId, storagePath, bytes: body.length }, "[storage] Uploading profile photo to B2...");

      const b2Res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: uploadAuthToken,
          "Content-Type": "image/jpeg",
          "X-Bz-File-Name": encodeURIComponent(storagePath),
          "X-Bz-Content-Sha1": "do_not_verify",
          "Content-Length": String(body.length),
        },
        body: body,
      });

      if (!b2Res.ok) {
        const errText = await b2Res.text().catch(() => "");
        logger.error({ status: b2Res.status, errText, userId }, "[storage] B2 upload failed");
        throw new Error(`B2 upload failed (${b2Res.status})${errText ? ": " + errText : ""}`);
      }

      // Persist the storage path on the profile
      await supabase.from("profiles").update({ avatar_url: storagePath }).eq("id", userId);
      logger.info({ userId, storagePath }, "[storage] Profile photo uploaded and profile updated");
      res.json({ storage_path: storagePath });
    } catch (e) {
      logger.error({ err: e, userId }, "[storage] Failed to upload profile photo");
      const msg = e instanceof Error ? e.message : "Failed to upload profile photo";
      res.status(500).json({ error: msg });
    }
  },
);

// Kept for backward compatibility (PDF notes still use the upload-url flow)
router.post("/b2/profile-upload-url", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;

  const storagePath = generateProfilePhotoPath(userId);
  const expiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.avatar_url) {
      try {
        const oldFileId = await getB2FileIdByPath(String(profile.avatar_url));
        if (oldFileId) {
          await deleteB2File(String(profile.avatar_url), oldFileId);
        }
      } catch (e) {
        logger.warn({ err: e, userId }, "[storage] Old profile photo cleanup failed (non-fatal)");
      }
    }

    const { uploadUrl, uploadAuthToken } = await getUploadPresignedUrl(storagePath);
    logger.info({ userId, storagePath }, "[storage] Profile upload URL generated");
    res.json({ upload_url: uploadUrl, upload_auth_token: uploadAuthToken, storage_path: storagePath, expires_at: expiry });
  } catch (e) {
    logger.error({ err: e, userId }, "[storage] Failed to generate profile upload URL");
    const msg = e instanceof Error ? e.message : "Failed to generate upload URL";
    res.status(500).json({ error: msg });
  }
});

router.delete("/b2/profile-photo", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const storagePath = generateProfilePhotoPath(userId);
  try {
    const fileId = await getB2FileIdByPath(storagePath);
    if (fileId) {
      await deleteB2File(storagePath, fileId);
    }
    await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
    res.json({ message: "Profile photo removed" });
  } catch (e) {
    logger.error({ err: e, userId }, "[storage] Failed to remove profile photo");
    const msg = e instanceof Error ? e.message : "Failed to remove profile photo";
    res.status(500).json({ error: msg });
  }
});

router.post("/b2/profile-download-url", requireAuth, async (req: AuthRequest, res) => {
  const { user_id } = req.body as { user_id: string };
  const storagePath = generateProfilePhotoPath(user_id);
  try {
    const url = await getDownloadPresignedUrl(storagePath);
    res.json({ download_url: url, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
  } catch (e) {
    logger.error({ err: e, user_id, storagePath }, "[storage] Failed to generate profile download URL");
    const msg = e instanceof Error ? e.message : "Failed to generate download URL";
    res.status(500).json({ error: msg });
  }
});

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
