import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/dashboard/summary", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;

  const [subjectsRes, topicsRes, topicProgressRes, tasksRes, attemptsRes, pomodoroRes] = await Promise.all([
    supabase.from("subjects").select("id, title").eq("is_active", true),
    supabase.from("topics").select("id, chapter_id, chapters(subject_id)").eq("is_active", true),
    supabase.from("user_topic_progress").select("topic_id, topic_complete").eq("user_id", userId),
    supabase.from("study_tasks").select("id, status").eq("user_id", userId).in("status", ["pending", "in_progress"]),
    supabase
      .from("user_attempts")
      .select("score, total_marks, submitted_at")
      .eq("user_id", userId)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(1),
    supabase
      .from("pomodoro_sessions")
      .select("duration_seconds, start_time")
      .eq("user_id", userId)
      .gte("start_time", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
  ]);

  const allTopics = topicsRes.data ?? [];
  const completedTopicIds = new Set(
    (topicProgressRes.data ?? []).filter((p: { topic_complete: boolean }) => p.topic_complete).map((p: { topic_id: string }) => p.topic_id)
  );

  const todayPomodoro = (pomodoroRes.data ?? []).reduce((sum: number, s: { duration_seconds: number }) => sum + s.duration_seconds, 0);

  const subjects = subjectsRes.data ?? [];
  const subjectsProgress = subjects.map((subject: { id: string; title: string }) => {
    const subjectTopics = allTopics.filter((t: { chapters: { subject_id: string } | null }) => t.chapters?.subject_id === subject.id);
    const completedCount = subjectTopics.filter((t: { id: string }) => completedTopicIds.has(t.id)).length;
    return {
      subject_id: subject.id,
      subject_title: subject.title,
      chapters_complete: 0,
      chapters_total: 0,
      topics_complete: completedCount,
      topics_total: subjectTopics.length,
    };
  });

  const recentAttempt = attemptsRes.data?.[0];
  const recentScore = recentAttempt
    ? Math.round((recentAttempt.score / Math.max(recentAttempt.total_marks, 1)) * 100)
    : null;

  res.json({
    focus_streak_days: 0,
    focus_time_today_minutes: Math.floor(todayPomodoro / 60),
    total_topics_complete: completedTopicIds.size,
    total_topics: allTopics.length,
    pending_tasks: tasksRes.data?.length ?? 0,
    recent_exam_score: recentScore,
    subjects_progress: subjectsProgress,
  });
});

export default router;
