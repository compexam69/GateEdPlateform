import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/subjects/:subjectId/chapters", requireAuth, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("chapters")
    .select("*")
    .eq("subject_id", req.params["subjectId"])
    .order("order_index");
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

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

router.delete("/chapters/:chapterId", requireAdmin, async (req: AuthRequest, res) => {
  const { error } = await supabase
    .from("chapters")
    .delete()
    .eq("id", req.params["chapterId"]);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: "Deleted" });
});

export default router;
