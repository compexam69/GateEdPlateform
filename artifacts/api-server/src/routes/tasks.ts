import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { createNotification } from "./notifications";

const router = Router();

router.get("/tasks", requireAuth, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("study_tasks")
    .select("*")
    .eq("user_id", req.user!.id)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post("/tasks", requireAuth, async (req: AuthRequest, res) => {
  const { title, description, target_type = "free_text", target_id, priority = 0, due_date } = req.body;
  if (!title) { res.status(400).json({ error: "title required" }); return; }

  const { data: existing } = await supabase
    .from("study_tasks")
    .select("order_index")
    .eq("user_id", req.user!.id)
    .order("order_index", { ascending: false })
    .limit(1);
  const nextOrder = existing?.[0] ? (existing[0].order_index + 1) : 0;

  const { data, error } = await supabase
    .from("study_tasks")
    .insert({
      user_id: req.user!.id,
      title, description, target_type, target_id, priority,
      due_date, order_index: nextOrder,
      status: "pending", source: "manual",
    })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.patch("/tasks/:taskId", requireAuth, async (req: AuthRequest, res) => {
  const updates: Record<string, unknown> = {};
  if (req.body.title !== undefined) updates["title"] = req.body.title;
  if (req.body.description !== undefined) updates["description"] = req.body.description;
  if (req.body.status) {
    updates["status"] = req.body.status;
    if (req.body.status === "completed") updates["completed_at"] = new Date().toISOString();
  }
  if (req.body.priority !== undefined) updates["priority"] = req.body.priority;
  if (req.body.order_index !== undefined) updates["order_index"] = req.body.order_index;

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

router.post("/tasks/reorder", requireAuth, async (req: AuthRequest, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    res.status(400).json({ error: "orderedIds array required" });
    return;
  }
  const userId = req.user!.id;
  await Promise.all(
    orderedIds.map((id: string, idx: number) =>
      supabase.from("study_tasks").update({ order_index: idx }).eq("id", id).eq("user_id", userId)
    )
  );
  res.json({ message: "Reordered" });
});

router.post("/tasks/generate", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;

  const { data: attempts } = await supabase
    .from("user_attempts")
    .select("quiz_id, accuracy, submitted_at, quizzes(topic_id, type, title, topics(title, chapter_id, chapters(title, subject_id, subjects(title))))")
    .eq("user_id", userId)
    .eq("status", "submitted")
    .not("accuracy", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(100);

  const topicMap = new Map<string, {
    topicId: string; topicTitle: string; chapterTitle: string;
    subjectTitle: string; accuracies: number[]; quizType: string;
  }>();

  for (const attempt of (attempts ?? []) as Array<Record<string, unknown>>) {
    const quiz = attempt["quizzes"] as Record<string, unknown> | null;
    if (!quiz) continue;
    const topic = quiz["topics"] as Record<string, unknown> | null;
    if (!quiz["topic_id"] || !topic) continue;
    const topicId = quiz["topic_id"] as string;
    const topicTitle = topic["title"] as string || "Unknown Topic";
    const chapter = topic["chapters"] as Record<string, unknown> | null;
    const chapterTitle = chapter?.["title"] as string || "Unknown Chapter";
    const subject = chapter?.["subjects"] as Record<string, unknown> | null;
    const subjectTitle = subject?.["title"] as string || "Unknown Subject";

    if (!topicMap.has(topicId)) {
      topicMap.set(topicId, { topicId, topicTitle, chapterTitle, subjectTitle, accuracies: [], quizType: quiz["type"] as string });
    }
    const entry = topicMap.get(topicId)!;
    if (entry.accuracies.length < 3) entry.accuracies.push(attempt["accuracy"] as number);
  }

  const weakTopics = Array.from(topicMap.values()).filter(t => {
    const avg = t.accuracies.reduce((s, a) => s + a, 0) / Math.max(t.accuracies.length, 1);
    return avg < 60;
  }).slice(0, 5);

  if (weakTopics.length === 0) {
    const { data: allTopics } = await supabase
      .from("topics")
      .select("id, title, chapters(title, subjects(title))")
      .eq("is_active", true).limit(5);

    const { data: progressData } = await supabase
      .from("user_topic_progress").select("topic_id").eq("user_id", userId);

    const progressSet = new Set((progressData ?? []).map((p: { topic_id: string }) => p.topic_id));
    const unstarted = ((allTopics ?? []) as Array<Record<string, unknown>>)
      .filter(t => !progressSet.has(t["id"] as string)).slice(0, 3);

    if (unstarted.length === 0) {
      res.json({ created: 0, message: "No weak topics found. Keep up the great work!" });
      return;
    }

    await supabase.from("study_tasks").delete().eq("user_id", userId).eq("source", "auto").eq("status", "pending");

    const newTasks = [];
    for (const topic of unstarted) {
      const chapter = topic["chapters"] as Record<string, unknown> | null;
      const subject = chapter?.["subjects"] as Record<string, unknown> | null;
      const insertRes1: { data: Record<string, unknown> | null } = await supabase.from("study_tasks").insert({
        user_id: userId,
        title: `Start: ${topic["title"] as string}`,
        description: `${subject?.["title"] as string || ""} › ${chapter?.["title"] as string || ""} — Watch the lecture to begin`,
        target_type: "platform_subtopic", target_id: topic["id"] as string,
        priority: 1, order_index: newTasks.length, status: "pending", source: "auto",
      }).select().single();
      if (insertRes1.data) newTasks.push(insertRes1.data);
    }
    await createNotification(userId, "Study Plan Updated", `${newTasks.length} new tasks added to your study plan.`, "plan");
    res.json({ created: newTasks.length, tasks: newTasks, message: `${newTasks.length} tasks added to help you get started.` });
    return;
  }

  await supabase.from("study_tasks").delete().eq("user_id", userId).eq("source", "auto").eq("status", "pending");

  const newTasks = [];
  for (const topic of weakTopics) {
    const avg = topic.accuracies.reduce((s, a) => s + a, 0) / Math.max(topic.accuracies.length, 1);
    const insertRes2: { data: Record<string, unknown> | null } = await supabase.from("study_tasks").insert({
      user_id: userId,
      title: `Revise: ${topic.topicTitle}`,
      description: `${topic.subjectTitle} › ${topic.chapterTitle} — Avg accuracy: ${Math.round(avg)}%. Redo DPP or Topic Test.`,
      target_type: "platform_subtopic", target_id: topic.topicId,
      priority: Math.round((60 - avg) / 10), order_index: newTasks.length,
      status: "pending", source: "auto",
    }).select().single();
    if (insertRes2.data) newTasks.push(insertRes2.data);
  }

  await createNotification(userId, "Smart Plan Ready",
    `${newTasks.length} weak topic${newTasks.length !== 1 ? "s" : ""} added — ${weakTopics.map(t => t.topicTitle).join(", ")}.`, "plan");

  res.json({
    created: newTasks.length, tasks: newTasks,
    weak_topics: weakTopics.map(t => ({ topicId: t.topicId, title: t.topicTitle, avg_accuracy: Math.round(t.accuracies.reduce((s, a) => s + a, 0) / Math.max(t.accuracies.length, 1)) })),
    message: `${newTasks.length} weak topic${newTasks.length !== 1 ? "s" : ""} added to your study plan.`,
  });
});

export default router;
