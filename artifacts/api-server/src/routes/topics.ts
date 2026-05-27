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

  // Always create a lectures row so TopicDetailPage can record lecture clicks even
  // before telegram IDs are configured. Without this row, `topic.lectures[0]` is
  // undefined and handleLectureClick always fails with "No lecture" toast.
  await supabase.from("lectures").insert({
    topic_id: data.id,
    telegram_chat_id: telegram_chat_id || null,
    telegram_message_id: telegram_message_id || null,
  });

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

  // Keep the lectures row in sync whenever telegram fields change
  if (telegram_chat_id !== undefined || telegram_message_id !== undefined) {
    const { data: existingLectures } = await supabase
      .from("lectures")
      .select("id")
      .eq("topic_id", req.params["topicId"])
      .order("created_at")
      .limit(1);

    const lectureUpdates: Record<string, unknown> = {};
    if (telegram_chat_id !== undefined) lectureUpdates["telegram_chat_id"] = telegram_chat_id || null;
    if (telegram_message_id !== undefined) lectureUpdates["telegram_message_id"] = telegram_message_id || null;

    if (existingLectures && existingLectures.length > 0) {
      await supabase.from("lectures").update(lectureUpdates).eq("id", existingLectures[0].id);
    } else {
      await supabase.from("lectures").insert({
        topic_id: req.params["topicId"],
        telegram_chat_id: telegram_chat_id || null,
        telegram_message_id: telegram_message_id || null,
      });
    }
  }

  res.json(data);
});

export default router;
