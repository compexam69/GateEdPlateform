import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/subjects", requireAuth, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("subjects")
    .select("*")
    .eq("is_active", true)
    .order("order_index");
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.post("/subjects", requireAdmin, async (req: AuthRequest, res) => {
  const { title, description, order_index, icon_url, is_active = true } = req.body;
  if (!title) { res.status(400).json({ error: "title required" }); return; }
  const { data, error } = await supabase
    .from("subjects")
    .insert({ title, description, order_index, icon_url, is_active })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.get("/subjects/:subjectId", requireAuth, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("subjects")
    .select("*")
    .eq("id", req.params["subjectId"])
    .single();
  if (error || !data) { res.status(404).json({ error: "Not found" }); return; }
  res.json(data);
});

router.patch("/subjects/:subjectId", requireAdmin, async (req: AuthRequest, res) => {
  const { title, description, order_index, icon_url, is_active } = req.body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates["title"] = title;
  if (description !== undefined) updates["description"] = description;
  if (order_index !== undefined) updates["order_index"] = order_index;
  if (icon_url !== undefined) updates["icon_url"] = icon_url;
  if (is_active !== undefined) updates["is_active"] = is_active;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No valid fields to update" }); return; }
  const { data, error } = await supabase
    .from("subjects")
    .update(updates)
    .eq("id", req.params["subjectId"])
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.delete("/subjects/:subjectId", requireAdmin, async (req: AuthRequest, res) => {
  const { error } = await supabase
    .from("subjects")
    .delete()
    .eq("id", req.params["subjectId"]);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: "Deleted" });
});

export default router;
