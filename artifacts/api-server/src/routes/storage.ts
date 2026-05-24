import { Router } from "express";
import { supabase } from "../lib/supabase";
import { getUploadPresignedUrl, getDownloadPresignedUrl, deleteB2File, generateStoragePath, generateProfilePhotoPath } from "../lib/b2";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

const PER_USER_LIMIT = 500 * 1024 * 1024; // 500 MB

// In-memory rate limiters (reset on server restart, adequate for single-instance)
const pdfUploadLog = new Map<string, number[]>();
const photoUploadLog = new Map<string, number[]>();

function checkRateLimit(log: Map<string, number[]>, key: string, maxCount: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (log.get(key) ?? []).filter(t => now - t < windowMs);
  if (hits.length >= maxCount) return false;
  hits.push(now);
  log.set(key, hits);
  return true;
}

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

  // Rate limit: 5 PDF uploads per user per hour
  if (!checkRateLimit(pdfUploadLog, userId, 5, 60 * 60 * 1000)) {
    res.status(429).json({ error: "Too many upload requests. Maximum 5 PDF uploads per hour." });
    return;
  }

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
    const { uploadUrl } = await getUploadPresignedUrl(storagePath);

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

    res.json({ upload_url: uploadUrl, storage_path: storagePath, expires_at: expiry });
  } catch (e) {
    res.status(500).json({ error: "Failed to generate upload URL" });
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
  } catch {
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

router.post("/b2/profile-upload-url", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;

  // Rate limit: 5 profile photo uploads per user per hour
  if (!checkRateLimit(photoUploadLog, userId, 5, 60 * 60 * 1000)) {
    res.status(429).json({ error: "Too many upload requests. Maximum 5 photo uploads per hour." });
    return;
  }

  const storagePath = generateProfilePhotoPath(userId);
  const expiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  try {
    const { uploadUrl } = await getUploadPresignedUrl(storagePath);
    res.json({ upload_url: uploadUrl, storage_path: storagePath, expires_at: expiry });
  } catch {
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.post("/b2/profile-download-url", requireAuth, async (req: AuthRequest, res) => {
  const { user_id } = req.body as { user_id: string };
  const storagePath = generateProfilePhotoPath(user_id);
  try {
    const url = await getDownloadPresignedUrl(storagePath);
    res.json({ download_url: url, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
  } catch {
    res.status(500).json({ error: "Failed to generate download URL" });
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
