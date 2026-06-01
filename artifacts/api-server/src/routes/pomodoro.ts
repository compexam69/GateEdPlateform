import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { sendPushToUser } from "../lib/push";
import { capText } from "../lib/sanitize";

const router = Router();

router.get("/pomodoro/sessions", requireAuth, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("pomodoro_sessions")
    .select("*")
    .eq("user_id", req.user!.id)
    .order("start_time", { ascending: false })
    .limit(100);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post("/pomodoro/sessions", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;

  const rawDuration = Number(req.body["duration_seconds"]);
  if (!Number.isFinite(rawDuration) || rawDuration < 1 || rawDuration > 86400) {
    res.status(400).json({ error: "duration_seconds must be between 1 and 86400" });
    return;
  }
  const duration_seconds = Math.floor(rawDuration);

  const topic_context = capText(req.body["topic_context"], 500);

  const startTimeRaw = req.body["start_time"];
  const endTimeRaw = req.body["end_time"];

  // Validate timestamps are ISO strings
  const start_time = startTimeRaw && !isNaN(Date.parse(String(startTimeRaw)))
    ? new Date(String(startTimeRaw)).toISOString()
    : new Date(Date.now() - duration_seconds * 1000).toISOString();

  const end_time = endTimeRaw && !isNaN(Date.parse(String(endTimeRaw)))
    ? new Date(String(endTimeRaw)).toISOString()
    : new Date().toISOString();

  const { data, error } = await supabase
    .from("pomodoro_sessions")
    .insert({ user_id: userId, duration_seconds, topic_context, start_time, end_time })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  // ── Streak-break alert (best-effort, fire-and-forget) ──────────────────────
  void (async () => {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();

      const { data: recentSessions } = await supabase
        .from("pomodoro_sessions")
        .select("start_time")
        .eq("user_id", userId)
        .gte("start_time", yesterdayStart)
        .order("start_time", { ascending: false })
        .limit(100);

      const sessions = recentSessions ?? [];
      const todaySessions = sessions.filter((s: { start_time: string }) => s.start_time >= todayStart);
      const yesterdaySessions = sessions.filter(
        (s: { start_time: string }) => s.start_time >= yesterdayStart && s.start_time < todayStart
      );

      // Streak is alive if yesterday had ≥4 sessions; alert when today is at exactly 3 (1 more needed)
      const streakAlive = yesterdaySessions.length >= 4;
      if (streakAlive && todaySessions.length === 3) {
        await sendPushToUser(userId, {
          title: "Streak about to break",
          body: "Complete 1 more focus session today to keep your streak alive!",
          url: "/pomodoro",
          tag: "streak-break-warning",
        });
      }
    } catch {
      // best-effort
    }
  })();

  res.status(201).json(data);
});

router.get("/pomodoro/stats", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const { data: sessions } = await supabase
    .from("pomodoro_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("start_time", { ascending: false })
    .limit(500);

  const allSessions = sessions ?? [];

  const todaySessions = allSessions.filter((s: { start_time: string }) => s.start_time >= todayStart);
  const todayMinutes = Math.floor(
    todaySessions.reduce((sum: number, s: { duration_seconds: number }) => sum + s.duration_seconds, 0) / 60
  );
  const sessionsTodayCount = todaySessions.length;

  const weeklyMinutes: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i).toISOString();
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1).toISOString();
    const daySessions = allSessions.filter((s: { start_time: string }) => s.start_time >= dayStart && s.start_time < dayEnd);
    const mins = Math.floor(daySessions.reduce((sum: number, s: { duration_seconds: number }) => sum + s.duration_seconds, 0) / 60);
    weeklyMinutes.push(mins);
  }

  let streakDays = 0;
  for (let i = 0; i < 30; i++) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i).toISOString();
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1).toISOString();
    const daySessions = allSessions.filter((s: { start_time: string }) => s.start_time >= dayStart && s.start_time < dayEnd);
    if (daySessions.length >= 4) streakDays++;
    else if (i > 0) break;
  }

  res.json({ today_minutes: todayMinutes, streak_days: streakDays, sessions_today: sessionsTodayCount, weekly_minutes: weeklyMinutes });
});

export default router;
