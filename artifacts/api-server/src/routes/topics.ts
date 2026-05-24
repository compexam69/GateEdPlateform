import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/chapters/:chapterId/topics", requireAuth, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("topics")
    .select("*, lectures(*)")
    .eq("chapter_id", req.params["chapterId"])
    .order("order_index");
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.post("/chapters/:chapterId/topics", requireAdmin, async (req: AuthRequest, res) => {
  const { title, description, order_index, telegram_chat_id, telegram_message_id } = req.body;
  if (!title) { res.status(400).json({ error: "title required" }); return; }
  const { data, error } = await supabase
    .from("topics")
    .insert({ chapter_id: req.params["chapterId"], title, description, order_index, telegram_chat_id, telegram_message_id })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.patch("/topics/:topicId", requireAdmin, async (req: AuthRequest, res) => {
  const { title, description, order_index, is_active, telegram_chat_id, telegram_message_id } = req.body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates["title"] = title;
  if (description !== undefined) updates["description"] = description;
  if (order_index !== undefined) updates["order_index"] = order_index;
  if (is_active !== undefined) updates["is_active"] = is_active;
  if (telegram_chat_id !== undefined) updates["telegram_chat_id"] = telegram_chat_id;
  if (telegram_message_id !== undefined) updates["telegram_message_id"] = telegram_message_id;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No valid fields to update" }); return; }
  const { data, error } = await supabase
    .from("topics")
    .update(updates)
    .eq("id", req.params["topicId"])
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

export default router;
