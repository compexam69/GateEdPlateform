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
  const { title, description, order_index, telegram_link } = req.body;
  if (!title) { res.status(400).json({ error: "title required" }); return; }

  const { data, error } = await supabase
    .from("topics")
    .insert({ chapter_id: req.params["chapterId"], title, description, order_index, telegram_link: telegram_link || null })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Always create a lectures row so TopicDetailPage can record lecture clicks even
  // before a telegram_link is configured. Without this row, `topic.lectures[0]` is
  // undefined and handleLectureClick always fails with "No lecture" toast.
  await supabase.from("lectures").insert({
    topic_id: data.id,
    telegram_link: telegram_link || null,
  });

  res.status(201).json(data);
});

router.patch("/topics/:topicId", requireAdmin, async (req: AuthRequest, res) => {
  const { title, description, order_index, is_active, telegram_link } = req.body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates["title"] = title;
  if (description !== undefined) updates["description"] = description;
  if (order_index !== undefined) updates["order_index"] = order_index;
  if (is_active !== undefined) updates["is_active"] = is_active;
  if (telegram_link !== undefined) updates["telegram_link"] = telegram_link || null;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No valid fields to update" }); return; }

  const { data, error } = await supabase
    .from("topics")
    .update(updates)
    .eq("id", req.params["topicId"])
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Keep the lectures row in sync whenever telegram_link changes
  if (telegram_link !== undefined) {
    const { data: existingLectures } = await supabase
      .from("lectures")
      .select("id")
      .eq("topic_id", req.params["topicId"])
      .order("created_at")
      .limit(1);

    if (existingLectures && existingLectures.length > 0) {
      await supabase.from("lectures").update({ telegram_link: telegram_link || null }).eq("id", existingLectures[0].id);
    } else {
      await supabase.from("lectures").insert({
        topic_id: req.params["topicId"],
        telegram_link: telegram_link || null,
      });
    }
  }

  res.json(data);
});

export default router;
