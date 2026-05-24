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
      .order("start_time", { ascending: false })
      .limit(200),
  ]);

  const allTopics = topicsRes.data ?? [];
  const completedTopicIds = new Set(
    (topicProgressRes.data ?? []).filter((p: { topic_complete: boolean }) => p.topic_complete).map((p: { topic_id: string }) => p.topic_id)
  );

  // Calculate today's focus time
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const pomodoroSessions = pomodoroRes.data ?? [];
  const todayPomodoro = pomodoroSessions
    .filter((s: { start_time: string }) => new Date(s.start_time) >= todayStart)
    .reduce((sum: number, s: { duration_seconds: number }) => sum + s.duration_seconds, 0);

  // Calculate focus streak (consecutive calendar days with >= 1 pomodoro session)
  const sessionDays = new Set(
    pomodoroSessions.map((s: { start_time: string }) =>
      new Date(s.start_time).toISOString().split("T")[0]
    )
  );
  let focusStreak = 0;
  const now = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().split("T")[0];
    if (sessionDays.has(dayStr)) {
      focusStreak++;
    } else if (i > 0) {
      // Allow today to be incomplete — only break streak if yesterday is missing
      break;
    }
  }

  const subjects = subjectsRes.data ?? [];
  const subjectsProgress = subjects.map((subject: { id: string; title: string }) => {
    const subjectTopics = (allTopics as Array<{ id: string; chapter_id: string; chapters: Array<{ subject_id: string }> | { subject_id: string } | null }>).filter((t) => {
      const ch = Array.isArray(t.chapters) ? t.chapters[0] : t.chapters;
      return ch?.subject_id === subject.id;
    });
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
    focus_streak_days: focusStreak,
    focus_time_today_minutes: Math.floor(todayPomodoro / 60),
    total_topics_complete: completedTopicIds.size,
    total_topics: allTopics.length,
    pending_tasks: tasksRes.data?.length ?? 0,
    recent_exam_score: recentScore,
    subjects_progress: subjectsProgress,
  });
});

export default router;
