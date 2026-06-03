import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";
import { capText, isValidUuid, sanitizeEnum, MAX } from "../lib/sanitize";

const ANNOUNCEMENT_TYPES = ["info", "warning", "success"] as const;

const router = Router();

/**
 * GET /announcements/active
 * Returns all active, non-expired announcements for the current authenticated user.
 */
router.get("/announcements/active", requireAuth, async (_req, res) => {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("is_active", true)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("created_at", { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

/**
 * GET /admin/announcements
 * Returns all announcements (active and inactive) for admin management.
 */
router.get("/admin/announcements", requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

/**
 * POST /admin/announcements
 * Create a new announcement. Defaults to active with no expiry.
 */
router.post("/admin/announcements", requireAdmin, async (req: AuthRequest, res) => {
  const title = capText(req.body["title"], MAX.TITLE);
  if (!title) { res.status(400).json({ error: "title is required" }); return; }

  const body = capText(req.body["body"], MAX.DESCRIPTION);
  if (!body) { res.status(400).json({ error: "body is required" }); return; }

  const type = sanitizeEnum(req.body["type"] ?? "info", ANNOUNCEMENT_TYPES) ?? "info";

  let expiresAt: string | null = null;
  if (req.body["expires_at"] != null) {
    const d = new Date(req.body["expires_at"] as string);
    if (isNaN(d.getTime())) { res.status(400).json({ error: "expires_at is not a valid date" }); return; }
    expiresAt = d.toISOString();
  }

  const { data, error } = await supabase
    .from("announcements")
    .insert({
      title,
      body,
      type,
      is_active: true,
      created_by: req.user!.id,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

/**
 * PATCH /admin/announcements/:id
 * Update title, body, type, is_active, or expires_at. Only provided fields are changed.
 */
router.patch("/admin/announcements/:id", requireAdmin, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!isValidUuid(id)) { res.status(400).json({ error: "Invalid announcement id" }); return; }

  const patch: Record<string, unknown> = {};

  const title = capText(req.body["title"], MAX.TITLE);
  if (title !== null) patch["title"] = title;

  const body = capText(req.body["body"], MAX.DESCRIPTION);
  if (body !== null) patch["body"] = body;

  const type = sanitizeEnum(req.body["type"], ANNOUNCEMENT_TYPES);
  if (type !== null) patch["type"] = type;

  if (typeof req.body["is_active"] === "boolean") {
    patch["is_active"] = req.body["is_active"];
  }

  if ("expires_at" in req.body) {
    if (req.body["expires_at"] === null) {
      patch["expires_at"] = null;
    } else {
      const d = new Date(req.body["expires_at"] as string);
      if (isNaN(d.getTime())) { res.status(400).json({ error: "expires_at is not a valid date" }); return; }
      patch["expires_at"] = d.toISOString();
    }
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const { data, error } = await supabase
    .from("announcements")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  if (!data) { res.status(404).json({ error: "Announcement not found" }); return; }
  res.json(data);
});

/**
 * DELETE /admin/announcements/:id
 * Permanently removes an announcement.
 */
router.delete("/admin/announcements/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (!isValidUuid(id)) { res.status(400).json({ error: "Invalid announcement id" }); return; }

  const { error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", id);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: "Announcement deleted" });
});

export default router;
