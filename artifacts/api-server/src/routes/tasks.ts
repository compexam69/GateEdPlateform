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
  if (req.body.title !== undefined) updates["title"] = req.body.title;
  if (req.body.description !== undefined) updates["description"] = req.body.description;
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

// Smart auto-task generation
router.post("/tasks/generate", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;

  // Find recent exam attempts (last 3 per topic), compute weak topics
  const { data: attempts } = await supabase
    .from("user_attempts")
    .select("quiz_id, accuracy, submitted_at, quizzes(topic_id, type, title, topics(title, chapter_id, chapters(title, subject_id, subjects(title))))")
    .eq("user_id", userId)
    .eq("status", "submitted")
    .not("accuracy", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(100);

  // Group by topic_id, compute avg accuracy for last 3 attempts
  const topicMap = new Map<string, {
    topicId: string;
    topicTitle: string;
    chapterTitle: string;
    subjectTitle: string;
    accuracies: number[];
    quizType: string;
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
    if (entry.accuracies.length < 3) {
      entry.accuracies.push(attempt["accuracy"] as number);
    }
  }

  // Filter to weak topics (avg accuracy < 60%)
  const weakTopics = Array.from(topicMap.values()).filter(t => {
    const avg = t.accuracies.reduce((s, a) => s + a, 0) / Math.max(t.accuracies.length, 1);
    return avg < 60;
  }).slice(0, 5);

  if (weakTopics.length === 0) {
    // Also try topics with no progress yet
    const { data: allTopics } = await supabase
      .from("topics")
      .select("id, title, chapters(title, subjects(title))")
      .eq("is_active", true)
      .limit(5);

    const { data: progressData } = await supabase
      .from("user_topic_progress")
      .select("topic_id")
      .eq("user_id", userId);

    const progressSet = new Set((progressData ?? []).map((p: { topic_id: string }) => p.topic_id));
    const unstarted = ((allTopics ?? []) as Array<Record<string, unknown>>)
      .filter(t => !progressSet.has(t["id"] as string))
      .slice(0, 3);

    if (unstarted.length === 0) {
      res.json({ created: 0, message: "No weak topics found. Keep up the great work!" });
      return;
    }

    // Delete old auto tasks first
    await supabase.from("study_tasks").delete().eq("user_id", userId).eq("source", "auto").eq("status", "pending");

    const newTasks = [];
    for (const topic of unstarted) {
      const chapter = topic["chapters"] as Record<string, unknown> | null;
      const subject = chapter?.["subjects"] as Record<string, unknown> | null;
      const chapterTitle = chapter?.["title"] as string || "";
      const subjectTitle = subject?.["title"] as string || "";
      const { data: task } = await supabase.from("study_tasks").insert({
        user_id: userId,
        title: `Start: ${topic["title"] as string}`,
        description: `${subjectTitle} › ${chapterTitle} — Watch the lecture to begin`,
        target_type: "platform_subtopic",
        target_id: topic["id"] as string,
        priority: 1,
        status: "pending",
        source: "auto",
      }).select().single();
      if (task) newTasks.push(task);
    }

    await createNotification(userId, "Study Plan Updated", `${newTasks.length} new tasks added to your study plan.`, "plan");
    res.json({ created: newTasks.length, tasks: newTasks, message: `${newTasks.length} tasks added to help you get started.` });
    return;
  }

  // Delete old pending auto tasks
  await supabase.from("study_tasks").delete().eq("user_id", userId).eq("source", "auto").eq("status", "pending");

  const newTasks = [];
  for (const topic of weakTopics) {
    const avg = topic.accuracies.reduce((s, a) => s + a, 0) / Math.max(topic.accuracies.length, 1);
    const { data: task } = await supabase.from("study_tasks").insert({
      user_id: userId,
      title: `Revise: ${topic.topicTitle}`,
      description: `${topic.subjectTitle} › ${topic.chapterTitle} — Avg accuracy: ${Math.round(avg)}%. Redo DPP or Topic Test to improve.`,
      target_type: "platform_subtopic",
      target_id: topic.topicId,
      priority: Math.round((60 - avg) / 10), // higher priority for worse accuracy
      status: "pending",
      source: "auto",
    }).select().single();
    if (task) newTasks.push(task);
  }

  await createNotification(
    userId,
    "Smart Plan Ready",
    `${newTasks.length} weak topic${newTasks.length !== 1 ? "s" : ""} added to your study plan — ${weakTopics.map(t => t.topicTitle).join(", ")}.`,
    "plan"
  );

  res.json({
    created: newTasks.length,
    tasks: newTasks,
    weak_topics: weakTopics.map(t => ({ topicId: t.topicId, title: t.topicTitle, avg_accuracy: Math.round(t.accuracies.reduce((s, a) => s + a, 0) / Math.max(t.accuracies.length, 1)) })),
    message: `${newTasks.length} weak topic${newTasks.length !== 1 ? "s" : ""} added to your study plan.`,
  });
});

export default router;
