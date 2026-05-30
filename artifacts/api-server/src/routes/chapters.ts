import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";

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
  const role = req.user!.role;
  const userId = req.user!.id;

  const allowed = await canAccessSubject(subjectId, userId, role);
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }

  const { data, error } = await supabase
    .from("chapters")
    .select("*")
    .eq("subject_id", subjectId)
    .order("order_index");
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// ── POST /subjects/:subjectId/chapters ────────────────────────────────────────
router.post("/subjects/:subjectId/chapters", requireAdmin, async (req: AuthRequest, res) => {
  const { title, description, order_index, is_active = true } = req.body;
  if (!title) { res.status(400).json({ error: "title required" }); return; }
  const { data, error } = await supabase
    .from("chapters")
    .insert({ subject_id: req.params["subjectId"], title, description, order_index, is_active, creator_id: req.user!.id })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

// ── PATCH /chapters/:chapterId ────────────────────────────────────────────────
router.patch("/chapters/:chapterId", requireAdmin, async (req: AuthRequest, res) => {
  const { title, description, order_index, is_active } = req.body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates["title"] = title;
  if (description !== undefined) updates["description"] = description;
  if (order_index !== undefined) updates["order_index"] = order_index;
  if (is_active !== undefined) updates["is_active"] = is_active;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No valid fields to update" }); return; }
  const { data, error } = await supabase
    .from("chapters")
    .update(updates)
    .eq("id", req.params["chapterId"])
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// ── POST /chapters/reorder ────────────────────────────────────────────────────
router.post("/chapters/reorder", requireAdmin, async (req: AuthRequest, res) => {
  const { chapters } = req.body as { chapters?: Array<{ id: string; order_index: number }> };
  if (!Array.isArray(chapters) || chapters.length === 0) {
    res.status(400).json({ error: "chapters array required" });
    return;
  }
  await Promise.all(
    chapters.map(c => supabase.from("chapters").update({ order_index: c.order_index }).eq("id", c.id))
  );
  res.json({ message: "Reordered" });
});

// ── DELETE /chapters/:chapterId ───────────────────────────────────────────────
router.delete("/chapters/:chapterId", requireAdmin, async (req: AuthRequest, res) => {
  const { error } = await supabase
    .from("chapters")
    .delete()
    .eq("id", req.params["chapterId"]);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: "Deleted" });
});

export default router;
