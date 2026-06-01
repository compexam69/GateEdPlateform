import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";
import { isValidUuid, capText, MAX } from "../lib/sanitize";

const router = Router();

// ── Subject access guard ──────────────────────────────────────────────────────
// Returns true if the calling user may access the given subject (and therefore
// its chapters). Mirrors the logic in subjects.ts.
async function canAccessSubject(subjectId: string, userId: string, role: string): Promise<boolean> {
  const { data: subject } = await supabase
    .from("subjects")
    .select("creator_id, is_creator_only, visibility_roles")
    .eq("id", subjectId)
    .single();

  if (!subject) return false;

  if (role === "super_admin") {
    if (subject.creator_id === userId) return true;
    if (!subject.is_creator_only && (subject.visibility_roles ?? []).includes("super_admin")) return true;
    // Check explicit grant
    const { data: grant } = await supabase
      .from("content_access_grants")
      .select("id")
      .eq("content_type", "subject")
      .eq("content_id", subjectId)
      .eq("granted_to", userId)
      .maybeSingle();
    return !!grant;
  }
  if (role === "admin") {
    return !subject.is_creator_only && (subject.visibility_roles ?? []).includes("admin");
  }
  // student
  return !subject.is_creator_only && (subject.visibility_roles ?? []).includes("student");
}

// ── GET /subjects/:subjectId/chapters ─────────────────────────────────────────
router.get("/subjects/:subjectId/chapters", requireAuth, async (req: AuthRequest, res) => {
  const subjectId = req.params["subjectId"] as string;
  if (!isValidUuid(subjectId)) { res.status(400).json({ error: "Invalid subject ID" }); return; }

  const role = req.user!.role;
  const userId = req.user!.id;

  const allowed = await canAccessSubject(subjectId, userId, role);
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }

  const { data, error } = await supabase
    .from("chapters")
    .select("id, subject_id, title, description, order_index, is_active, creator_id, created_at, updated_at")
    .eq("subject_id", subjectId)
    .order("order_index");
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// ── POST /subjects/:subjectId/chapters ────────────────────────────────────────
router.post("/subjects/:subjectId/chapters", requireAdmin, async (req: AuthRequest, res) => {
  const subjectId = req.params["subjectId"] as string;
  if (!isValidUuid(subjectId)) { res.status(400).json({ error: "Invalid subject ID" }); return; }

  const title = capText(req.body["title"], MAX.TITLE);
  if (!title) { res.status(400).json({ error: "title required" }); return; }

  const description = capText(req.body["description"], MAX.DESCRIPTION);
  const order_index = req.body["order_index"] != null ? Math.floor(Number(req.body["order_index"])) : 0;
  const is_active = req.body["is_active"] !== false;

  const { data, error } = await supabase
    .from("chapters")
    .insert({ subject_id: subjectId, title, description, order_index, is_active, creator_id: req.user!.id })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

// ── PATCH /chapters/:chapterId ────────────────────────────────────────────────
router.patch("/chapters/:chapterId", requireAdmin, async (req: AuthRequest, res) => {
  const chapterId = req.params["chapterId"] as string;
  if (!isValidUuid(chapterId)) { res.status(400).json({ error: "Invalid chapter ID" }); return; }

  const updates: Record<string, unknown> = {};
  if (req.body["title"] !== undefined) {
    const title = capText(req.body["title"], MAX.TITLE);
    if (!title) { res.status(400).json({ error: "title must be a non-empty string" }); return; }
    updates["title"] = title;
  }
  if (req.body["description"] !== undefined) updates["description"] = capText(req.body["description"], MAX.DESCRIPTION);
  if (req.body["order_index"] !== undefined) {
    const idx = Math.floor(Number(req.body["order_index"]));
    if (Number.isFinite(idx)) updates["order_index"] = idx;
  }
  if (req.body["is_active"] !== undefined) updates["is_active"] = Boolean(req.body["is_active"]);

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No valid fields to update" }); return; }

  const { data, error } = await supabase
    .from("chapters")
    .update(updates)
    .eq("id", chapterId)
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  if (!data) { res.status(404).json({ error: "Chapter not found" }); return; }
  res.json(data);
});

// ── POST /chapters/reorder ────────────────────────────────────────────────────
router.post("/chapters/reorder", requireAdmin, async (req: AuthRequest, res) => {
  const { chapters } = req.body as { chapters?: Array<{ id: string; order_index: number }> };
  if (!Array.isArray(chapters) || chapters.length === 0) {
    res.status(400).json({ error: "chapters array required" });
    return;
  }

  // Validate all IDs are UUIDs and order_index values are numbers
  const validChapters = chapters.filter(c => isValidUuid(c.id) && Number.isFinite(Number(c.order_index)));
  if (validChapters.length === 0) {
    res.status(400).json({ error: "No valid chapters to reorder" });
    return;
  }

  await Promise.all(
    validChapters.map(c =>
      supabase.from("chapters").update({ order_index: Math.floor(Number(c.order_index)) }).eq("id", c.id)
    )
  );
  res.json({ message: "Reordered" });
});

// ── DELETE /chapters/:chapterId ───────────────────────────────────────────────
router.delete("/chapters/:chapterId", requireAdmin, async (req: AuthRequest, res) => {
  const chapterId = req.params["chapterId"] as string;
  if (!isValidUuid(chapterId)) { res.status(400).json({ error: "Invalid chapter ID" }); return; }

  const { error } = await supabase
    .from("chapters")
    .delete()
    .eq("id", chapterId);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: "Deleted" });
});

export default router;
