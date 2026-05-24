import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/tasks", requireAuth, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("study_tasks")
    .select("*")
    .eq("user_id", req.user!.id)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post("/tasks", requireAuth, async (req: AuthRequest, res) => {
  const { title, description, target_type = "free_text", target_id, priority = 0, due_date } = req.body;
  if (!title) { res.status(400).json({ error: "title required" }); return; }
  const { data, error } = await supabase
    .from("study_tasks")
    .insert({
      user_id: req.user!.id,
      title,
      description,
      target_type,
      target_id,
      priority,
      due_date,
      status: "pending",
      source: "manual",
    })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.patch("/tasks/:taskId", requireAuth, async (req: AuthRequest, res) => {
  const updates: Record<string, unknown> = {};
  if (req.body.title) updates["title"] = req.body.title;
  if (req.body.status) {
    updates["status"] = req.body.status;
    if (req.body.status === "completed") updates["completed_at"] = new Date().toISOString();
  }
  if (req.body.priority !== undefined) updates["priority"] = req.body.priority;

  const { data, error } = await supabase
    .from("study_tasks")
    .update(updates)
    .eq("id", req.params["taskId"])
    .eq("user_id", req.user!.id)
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.delete("/tasks/:taskId", requireAuth, async (req: AuthRequest, res) => {
  const { error } = await supabase
    .from("study_tasks")
    .delete()
    .eq("id", req.params["taskId"])
    .eq("user_id", req.user!.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: "Deleted" });
});

export default router;
