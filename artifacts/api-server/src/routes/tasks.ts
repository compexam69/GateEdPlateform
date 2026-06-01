import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { createNotification } from "./notifications";
import { sendPushToUser } from "../lib/push";
import { capText, isValidUuid, MAX } from "../lib/sanitize";

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
  const title = capText(req.body["title"], MAX.TITLE);
  if (!title) { res.status(400).json({ error: "title required" }); return; }

  const description = capText(req.body["description"], MAX.DESCRIPTION);
  const target_type = req.body["target_type"] ?? "free_text";
  const VALID_TARGET_TYPES = ["free_text", "platform_subtopic", "personal_topic"];
  if (!VALID_TARGET_TYPES.includes(String(target_type))) {
    res.status(400).json({ error: `target_type must be one of: ${VALID_TARGET_TYPES.join(", ")}` });
    return;
  }

  const target_id = req.body["target_id"] ?? null;
  if (target_id && !isValidUuid(String(target_id))) {
    res.status(400).json({ error: "Invalid target_id" });
    return;
  }

  const rawPriority = Number(req.body["priority"] ?? 0);
  const priority = Number.isFinite(rawPriority) ? Math.max(0, Math.min(5, Math.floor(rawPriority))) : 0;

  const rawDueDate = req.body["due_date"];
  const due_date = rawDueDate && !isNaN(Date.parse(String(rawDueDate)))
    ? new Date(String(rawDueDate)).toISOString()
    : null;

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

const VALID_TASK_STATUSES = ["pending", "in_progress", "completed", "skipped"] as const;

router.patch("/tasks/:taskId", requireAuth, async (req: AuthRequest, res) => {
  const taskId = req.params["taskId"] as string;
  if (!isValidUuid(taskId)) { res.status(400).json({ error: "Invalid task ID" }); return; }

  const updates: Record<string, unknown> = {};
  if (req.body.title !== undefined) {
    const title = capText(req.body.title, MAX.TITLE);
    if (!title) {
      res.status(400).json({ error: "title must be a non-empty string" }); return;
    }
    updates["title"] = title;
  }
  if (req.body.description !== undefined) {
    updates["description"] = capText(req.body.description, MAX.DESCRIPTION);
  }
  if (req.body.status) {
    if (!VALID_TASK_STATUSES.includes(req.body.status as typeof VALID_TASK_STATUSES[number])) {
      res.status(400).json({ error: `status must be one of: ${VALID_TASK_STATUSES.join(", ")}` }); return;
    }
    updates["status"] = req.body.status;
    if (req.body.status === "completed") updates["completed_at"] = new Date().toISOString();
  }
  if (req.body.priority !== undefined) {
    const p = Number(req.body.priority);
    if (!Number.isFinite(p) || p < 0 || p > 5) {
      res.status(400).json({ error: "priority must be a number between 0 and 5" }); return;
    }
    updates["priority"] = Math.floor(p);
  }
  if (req.body.order_index !== undefined) {
    const idx = Math.floor(Number(req.body.order_index));
    if (Number.isFinite(idx)) updates["order_index"] = idx;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const { data, error } = await supabase
    .from("study_tasks")
    .update(updates)
    .eq("id", taskId)
    .eq("user_id", req.user!.id)
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  if (!data) { res.status(404).json({ error: "Task not found" }); return; }
  res.json(data);
});

router.delete("/tasks/:taskId", requireAuth, async (req: AuthRequest, res) => {
  const taskId = req.params["taskId"] as string;
  if (!isValidUuid(taskId)) { res.status(400).json({ error: "Invalid task ID" }); return; }

  const { error } = await supabase
    .from("study_tasks")
    .delete()
    .eq("id", taskId)
    .eq("user_id", req.user!.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: "Deleted" });
});

router.post("/tasks/reorder", requireAuth, async (req: AuthRequest, res) => {
  const { tasks } = req.body as { tasks: Array<{ id: string; order_index: number }> };
  if (!Array.isArray(tasks)) { res.status(400).json({ error: "tasks array required" }); return; }

  const validTasks = tasks.filter(t => isValidUuid(t.id) && Number.isFinite(Number(t.order_index)));
  if (validTasks.length === 0) { res.json({ message: "No valid tasks to reorder" }); return; }

  const updates = validTasks.map(t =>
    supabase.from("study_tasks").update({ order_index: Math.floor(Number(t.order_index)) }).eq("id", t.id).eq("user_id", req.user!.id)
  );
  await Promise.all(updates);
  res.json({ message: "Reordered" });
});

router.post("/tasks/generate", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;

  const { data: attempts } = await supabase
    .from("user_attempts")
    .select("accuracy, submitted_at, quizzes(topic_id, type, topics(title, chapters(title, subjects(title))))")
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

    // Build new tasks first — only delete old ones after successful generation
    const newTasks = [];
    for (const topic of unstarted) {
      const chapter = topic["chapters"] as Record<string, unknown> | null;
      const subject = chapter?.["subjects"] as Record<string, unknown> | null;
      const insertRes1: { data: Record<string, unknown> | null } = await supabase.from("study_tasks").insert({
        user_id: userId,
        title: capText(`Start: ${topic["title"] as string}`, MAX.TITLE) ?? `Start: ${String(topic["id"]).slice(0, 8)}`,
        description: capText(`${subject?.["title"] as string || ""} › ${chapter?.["title"] as string || ""} — Watch the lecture to begin`, MAX.DESCRIPTION),
        target_type: "platform_subtopic", target_id: topic["id"] as string,
        priority: 1, order_index: newTasks.length, status: "pending", source: "auto",
      }).select().single();
      if (insertRes1.data) newTasks.push(insertRes1.data);
    }

    // Only clear old auto-tasks after new ones are successfully inserted
    if (newTasks.length > 0) {
      await supabase.from("study_tasks").delete().eq("user_id", userId).eq("source", "auto").eq("status", "pending")
        .not("id", "in", `(${newTasks.map((t) => `'${(t as Record<string, unknown>)["id"]}'`).join(",")})`);
    }

    await createNotification(userId, "Study Plan Updated", `${newTasks.length} new tasks added to your study plan.`, "plan");
    await sendPushToUser(userId, {
      title: "Your Daily Plan is Ready",
      body: `${newTasks.length} new task${newTasks.length !== 1 ? "s" : ""} added to your study plan.`,
      url: "/tasks",
      tag: "daily-plan",
    }).catch(() => {});

    res.json({ created: newTasks.length, tasks: newTasks, message: `${newTasks.length} tasks added to help you get started.` });
    return;
  }

  // Build new tasks first — only delete old ones after successful generation
  const newTasks = [];
  for (const topic of weakTopics) {
    const avg = topic.accuracies.reduce((s, a) => s + a, 0) / Math.max(topic.accuracies.length, 1);
    const insertRes2: { data: Record<string, unknown> | null } = await supabase.from("study_tasks").insert({
      user_id: userId,
      title: capText(`Revise: ${topic.topicTitle}`, MAX.TITLE) ?? `Revise: ${topic.topicId.slice(0, 8)}`,
      description: capText(`${topic.subjectTitle} › ${topic.chapterTitle} — Avg accuracy: ${Math.round(avg)}%. Redo DPP or Topic Test.`, MAX.DESCRIPTION),
      target_type: "platform_subtopic", target_id: topic.topicId,
      priority: Math.min(5, Math.round((60 - avg) / 10)), order_index: newTasks.length,
      status: "pending", source: "auto",
    }).select().single();
    if (insertRes2.data) newTasks.push(insertRes2.data);
  }

  // Only clear old auto-tasks after new ones are successfully inserted
  if (newTasks.length > 0) {
    await supabase.from("study_tasks").delete().eq("user_id", userId).eq("source", "auto").eq("status", "pending")
      .not("id", "in", `(${newTasks.map((t) => `'${(t as Record<string, unknown>)["id"]}'`).join(",")})`);
  }

  await createNotification(userId, "Smart Plan Ready",
    `${newTasks.length} weak topic${newTasks.length !== 1 ? "s" : ""} added — ${weakTopics.map(t => t.topicTitle).join(", ")}.`, "plan");

  await sendPushToUser(userId, {
    title: "Your Daily Study Plan is Ready",
    body: `${newTasks.length} weak topic${newTasks.length !== 1 ? "s" : ""} identified: ${weakTopics.slice(0, 2).map(t => t.topicTitle).join(", ")}${weakTopics.length > 2 ? "..." : ""}.`,
    url: "/tasks",
    tag: "daily-plan",
  }).catch(() => {});

  res.json({
    created: newTasks.length, tasks: newTasks,
    weak_topics: weakTopics.map(t => ({ topicId: t.topicId, title: t.topicTitle, avg_accuracy: Math.round(t.accuracies.reduce((s, a) => s + a, 0) / Math.max(t.accuracies.length, 1)) })),
    message: `${newTasks.length} weak topic${newTasks.length !== 1 ? "s" : ""} added to your study plan.`,
  });
});

export default router;
