import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/user/export", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;

  const [
    profileRes,
    topicProgressRes,
    chapterProgressRes,
    attemptsRes,
    notesRes,
    tasksRes,
    externalTestsRes,
    pomodoroRes,
    notificationsRes,
  ] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, mobile_number, role, status, created_at").eq("id", userId).maybeSingle(),
    supabase.from("user_topic_progress").select("*").eq("user_id", userId),
    supabase.from("user_chapter_progress").select("*").eq("user_id", userId),
    supabase.from("user_attempts").select("id, quiz_id, status, score, total_marks, accuracy, time_taken_ms, started_at, submitted_at").eq("user_id", userId),
    supabase.from("user_notes").select("id, title, chapter_id, pdf_size_bytes, content_type, created_at").eq("user_id", userId),
    supabase.from("study_tasks").select("*").eq("user_id", userId),
    supabase.from("external_tests").select("*").eq("user_id", userId),
    supabase.from("pomodoro_sessions").select("*").eq("user_id", userId),
    supabase.from("notifications").select("id, title, message, type, is_read, created_at").eq("user_id", userId),
  ]);

  const exportData = {
    exported_at: new Date().toISOString(),
    user_id: userId,
    profile: profileRes.data ?? null,
    topic_progress: topicProgressRes.data ?? [],
    chapter_progress: chapterProgressRes.data ?? [],
    exam_attempts: attemptsRes.data ?? [],
    notes_metadata: notesRes.data ?? [],
    study_tasks: tasksRes.data ?? [],
    external_tests: externalTestsRes.data ?? [],
    pomodoro_sessions: pomodoroRes.data ?? [],
    notifications: notificationsRes.data ?? [],
  };

  const filename = `gateed-my-data-${new Date().toISOString().split("T")[0]}.json`;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.json(exportData);
});

export default router;
