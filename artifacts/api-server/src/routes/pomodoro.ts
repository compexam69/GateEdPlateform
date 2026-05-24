import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

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
  const { duration_seconds, topic_context, start_time, end_time } = req.body;
  const { data, error } = await supabase
    .from("pomodoro_sessions")
    .insert({ user_id: req.user!.id, duration_seconds, topic_context, start_time, end_time })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
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
