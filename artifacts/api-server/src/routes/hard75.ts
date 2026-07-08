import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, requireAdmin, requireSuperAdmin, type AuthRequest } from "../middlewares/auth";
import { capText, isValidUuid, sanitizeEnum, MAX } from "../lib/sanitize";
import { logger } from "../lib/logger";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function hasHard75Access(userId: string, role: string): Promise<boolean> {
  if (role === "super_admin") return true;
  // Check global kill-switch first
  const { data: mod } = await supabase
    .from("hard75_module_settings")
    .select("enabled_globally")
    .limit(1)
    .maybeSingle();
  if (mod && mod.enabled_globally === false) return false;

  const { data } = await supabase
    .from("hard75_access")
    .select("enabled")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.enabled === true;
}

async function getActiveChallenge(userId: string) {
  const { data } = await supabase
    .from("hard75_challenges")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["active", "completed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Access check middleware ───────────────────────────────────────────────────

async function requireHard75Access(req: AuthRequest, res: any, next: any) {
  const user = req.user!;
  const ok = await hasHard75Access(user.id, user.role);
  if (!ok) {
    res.status(403).json({ error: "75 Hard access not enabled for your account." });
    return;
  }
  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCESS
// ═══════════════════════════════════════════════════════════════════════════════

/** GET /api/hard75/access — check own access */
router.get("/hard75/access", requireAuth, async (req: AuthRequest, res) => {
  const user = req.user!;
  const isSuperAdmin = user.role === "super_admin";

  if (isSuperAdmin) {
    res.json({ enabled: true, role: user.role });
    return;
  }

  const { data } = await supabase
    .from("hard75_access")
    .select("enabled, enabled_at")
    .eq("user_id", user.id)
    .maybeSingle();

  res.json({ enabled: data?.enabled ?? false, enabled_at: data?.enabled_at ?? null, role: user.role });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHALLENGE
// ═══════════════════════════════════════════════════════════════════════════════

/** GET /api/hard75/challenge — get current challenge */
router.get("/hard75/challenge", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const challenge = await getActiveChallenge(user.id);
  if (!challenge) {
    res.json({ challenge: null });
    return;
  }

  // Compute current day from start_date
  const start = new Date(challenge.start_date);
  const today = new Date();
  const diffMs = today.getTime() - start.getTime();
  const currentDay = Math.min(75, Math.max(1, Math.floor(diffMs / 86400000) + 1));

  res.json({ challenge: { ...challenge, current_day: currentDay } });
});

/** POST /api/hard75/challenge/start — start a new challenge */
router.post("/hard75/challenge/start", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;

  // Check if there's already an active challenge
  const existing = await getActiveChallenge(user.id);
  if (existing && existing.status === "active") {
    res.status(400).json({ error: "You already have an active challenge. Restart it first." });
    return;
  }

  const startDate = todayDate();
  const { data, error } = await supabase
    .from("hard75_challenges")
    .insert({ user_id: user.id, start_date: startDate, status: "active" })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ challenge: data });
});

/** POST /api/hard75/challenge/restart — restart (mark old as restarted, create new) */
router.post("/hard75/challenge/restart", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;

  // Mark any active/failed as restarted
  await supabase
    .from("hard75_challenges")
    .update({ status: "restarted" })
    .eq("user_id", user.id)
    .in("status", ["active", "failed"]);

  const startDate = todayDate();
  const { data, error } = await supabase
    .from("hard75_challenges")
    .insert({ user_id: user.id, start_date: startDate, status: "active" })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ challenge: data });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TODAY'S LOG
// ═══════════════════════════════════════════════════════════════════════════════

/** GET /api/hard75/today — today's task status */
router.get("/hard75/today", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const date = (req.query["date"] as string) || todayDate();

  const [logRes, workoutsRes, waterRes, readingRes, dietRes, photoRes] = await Promise.all([ // photoRes is an array (limit 1)
    supabase.from("hard75_daily_logs").select("*").eq("user_id", user.id).eq("date", date).maybeSingle(),
    supabase.from("hard75_workouts").select("id,type,duration_minutes,notes,created_at").eq("user_id", user.id).eq("date", date),
    supabase.from("hard75_water_logs").select("amount_ml,target_ml").eq("user_id", user.id).eq("date", date).maybeSingle(),
    supabase.from("hard75_reading_logs").select("pages_read,book_title,notes").eq("user_id", user.id).eq("date", date).maybeSingle(),
    supabase.from("hard75_diet_logs").select("followed,notes").eq("user_id", user.id).eq("date", date).maybeSingle(),
    supabase.from("hard75_progress_photos").select("id,photo_url,notes").eq("user_id", user.id).eq("date", date).limit(1),
  ]);

  const log = logRes.data;
  const workouts = workoutsRes.data ?? [];
  const water = waterRes.data;
  const reading = readingRes.data;
  const diet = dietRes.data;
  const photo = Array.isArray(photoRes.data) ? (photoRes.data[0] ?? null) : photoRes.data;

  const workout1Done = workouts.some((w: any) => w.type === "indoor");
  const workout2Done = workouts.some((w: any) => w.type === "outdoor");
  const waterDone = log?.water_done ?? (water?.amount_ml != null && water.amount_ml >= (water?.target_ml ?? 3785));
  const readingDone = log?.reading_done ?? (reading != null && reading.pages_read >= 10);
  const dietDone = log?.diet_done ?? (diet?.followed === true);
  const photoDone = log?.photo_done ?? (photo != null);
  const allDone = workout1Done && workout2Done && waterDone && readingDone && dietDone && photoDone;

  res.json({
    date,
    tasks: {
      workout1: { done: workout1Done, data: workouts.filter((w: any) => w.type === "indoor")[0] ?? null },
      workout2: { done: workout2Done, data: workouts.filter((w: any) => w.type === "outdoor")[0] ?? null },
      water: { done: waterDone, data: water },
      reading: { done: readingDone, data: reading },
      diet: { done: dietDone, data: diet },
      photo: { done: photoDone, data: photo },
    },
    allDone,
    workouts,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// WORKOUTS
// ═══════════════════════════════════════════════════════════════════════════════

const WORKOUT_TYPES = ["indoor", "outdoor"] as const;

router.get("/hard75/workouts", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const date = req.query["date"] as string | undefined;

  let query = supabase
    .from("hard75_workouts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (date) query = query.eq("date", date);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post("/hard75/workouts", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const type = sanitizeEnum(req.body.type, WORKOUT_TYPES);
  if (!type) { res.status(400).json({ error: "Invalid workout type (indoor|outdoor)" }); return; }
  const duration = Number(req.body.duration_minutes) || 45;
  const notes = capText(req.body.notes, MAX.DESCRIPTION);
  const date = capText(req.body.date, 10) ?? todayDate();

  const { data, error } = await supabase
    .from("hard75_workouts")
    .insert({ user_id: user.id, type, duration_minutes: duration, notes, date })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Update daily log
  await updateDailyLog(user.id, date);
  res.status(201).json(data);
});

router.delete("/hard75/workouts/:id", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const id = String(req.params["id"]);
  if (!isValidUuid(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { data: existing } = await supabase.from("hard75_workouts").select("date").eq("id", id).eq("user_id", user.id).maybeSingle();
  const { error } = await supabase.from("hard75_workouts").delete().eq("id", id).eq("user_id", user.id);
  if (error) { res.status(500).json({ error: error.message }); return; }

  if (existing?.date) await updateDailyLog(user.id, existing.date);
  res.json({ message: "Deleted" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// WATER
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hard75/water", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const date = (req.query["date"] as string) || todayDate();
  const { data } = await supabase.from("hard75_water_logs").select("*").eq("user_id", user.id).eq("date", date).maybeSingle();
  res.json(data ?? { date, amount_ml: 0, target_ml: 3785 });
});

router.get("/hard75/water/history", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const { data } = await supabase
    .from("hard75_water_logs")
    .select("date,amount_ml,target_ml")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(30);
  res.json(data ?? []);
});

router.post("/hard75/water", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const amount = Number(req.body.amount_ml) || 0;
  const target = Number(req.body.target_ml) || 3785;
  const date = capText(req.body.date, 10) ?? todayDate();

  const { data, error } = await supabase
    .from("hard75_water_logs")
    .upsert({ user_id: user.id, date, amount_ml: amount, target_ml: target }, { onConflict: "user_id,date" })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  await updateDailyLog(user.id, date);
  res.json(data);
});

// ═══════════════════════════════════════════════════════════════════════════════
// READING
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hard75/reading", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const date = (req.query["date"] as string) || todayDate();
  const { data } = await supabase.from("hard75_reading_logs").select("*").eq("user_id", user.id).eq("date", date).maybeSingle();
  res.json(data ?? null);
});

router.get("/hard75/reading/history", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const { data } = await supabase
    .from("hard75_reading_logs")
    .select("date,pages_read,book_title")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(30);
  res.json(data ?? []);
});

router.post("/hard75/reading", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const pages = Number(req.body.pages_read) || 0;
  const bookTitle = capText(req.body.book_title, MAX.TITLE);
  const notes = capText(req.body.notes, MAX.DESCRIPTION);
  const date = capText(req.body.date, 10) ?? todayDate();

  const { data, error } = await supabase
    .from("hard75_reading_logs")
    .upsert({ user_id: user.id, date, pages_read: pages, book_title: bookTitle, notes }, { onConflict: "user_id,date" })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  await updateDailyLog(user.id, date);
  res.json(data);
});

// ═══════════════════════════════════════════════════════════════════════════════
// DIET
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hard75/diet", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const date = (req.query["date"] as string) || todayDate();
  const { data } = await supabase.from("hard75_diet_logs").select("*").eq("user_id", user.id).eq("date", date).maybeSingle();
  res.json(data ?? null);
});

router.post("/hard75/diet", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const followed = req.body.followed === true || req.body.followed === "true";
  const notes = capText(req.body.notes, MAX.DESCRIPTION);
  const date = capText(req.body.date, 10) ?? todayDate();

  const { data, error } = await supabase
    .from("hard75_diet_logs")
    .upsert({ user_id: user.id, date, followed, notes }, { onConflict: "user_id,date" })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  await updateDailyLog(user.id, date);
  res.json(data);
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS PHOTOS
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hard75/photos", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const { data, error } = await supabase
    .from("hard75_progress_photos")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: true });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post("/hard75/photos", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const photoUrl = capText(req.body.photo_url, MAX.URL);
  if (!photoUrl) { res.status(400).json({ error: "photo_url required" }); return; }
  const notes = capText(req.body.notes, MAX.DESCRIPTION);
  const date = capText(req.body.date, 10) ?? todayDate();
  const dayNumber = Number(req.body.day_number) || 1;

  const { data, error } = await supabase
    .from("hard75_progress_photos")
    .insert({ user_id: user.id, date, day_number: dayNumber, photo_url: photoUrl, notes })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  await updateDailyLog(user.id, date);
  res.status(201).json(data);
});

router.delete("/hard75/photos/:id", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const id = String(req.params["id"]);
  if (!isValidUuid(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  // Fetch date before deleting so we can recompute the daily log
  const { data: existing } = await supabase.from("hard75_progress_photos").select("date").eq("id", id).eq("user_id", user.id).maybeSingle();
  const { error } = await supabase.from("hard75_progress_photos").delete().eq("id", id).eq("user_id", user.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  if (existing?.date) await updateDailyLog(user.id, existing.date);
  res.json({ message: "Deleted" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// JOURNAL
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hard75/journal", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const date = (req.query["date"] as string) || todayDate();
  const { data } = await supabase.from("hard75_journals").select("*").eq("user_id", user.id).eq("date", date).maybeSingle();
  res.json(data ?? null);
});

router.get("/hard75/journals", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const { data } = await supabase
    .from("hard75_journals")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(75);
  res.json(data ?? []);
});

router.post("/hard75/journal", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const date = capText(req.body.date, 10) ?? todayDate();
  const mood = Math.min(5, Math.max(1, Number(req.body.mood) || 3));
  const energy = Math.min(5, Math.max(1, Number(req.body.energy) || 3));
  const rating = Math.min(5, Math.max(1, Number(req.body.rating) || 3));
  const biggestWin = capText(req.body.biggest_win, MAX.DESCRIPTION);
  const biggestChallenge = capText(req.body.biggest_challenge, MAX.DESCRIPTION);
  const notes = capText(req.body.notes, 5000);
  const dayNumber = Number(req.body.day_number) || 1;

  const { data, error } = await supabase
    .from("hard75_journals")
    .upsert(
      { user_id: user.id, date, mood, energy, rating, biggest_win: biggestWin, biggest_challenge: biggestChallenge, notes, day_number: dayNumber },
      { onConflict: "user_id,date" }
    )
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// ═══════════════════════════════════════════════════════════════════════════════
// MEASUREMENTS
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hard75/measurements", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const { data } = await supabase
    .from("hard75_measurements")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(50);
  res.json(data ?? []);
});

router.post("/hard75/measurements", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const date = capText(req.body.date, 10) ?? todayDate();
  const fields = ["weight_kg", "target_weight_kg", "body_fat_pct", "chest_cm", "waist_cm", "hips_cm", "arms_cm", "thighs_cm"];
  const values: Record<string, number | null> = {};
  for (const f of fields) {
    const v = req.body[f];
    values[f] = v !== undefined && v !== "" && v !== null ? Number(v) : null;
  }

  const { data, error } = await supabase
    .from("hard75_measurements")
    .insert({ user_id: user.id, date, ...values })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.delete("/hard75/measurements/:id", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const id = String(req.params["id"]);
  if (!isValidUuid(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { error } = await supabase.from("hard75_measurements").delete().eq("id", id).eq("user_id", user.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: "Deleted" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS & CALENDAR
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hard75/calendar", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const { data: logs } = await supabase
    .from("hard75_daily_logs")
    .select("date,all_done,workout1_done,workout2_done,water_done,reading_done,diet_done,photo_done")
    .eq("user_id", user.id)
    .order("date", { ascending: true });

  const challenge = await getActiveChallenge(user.id);
  res.json({ logs: logs ?? [], challenge });
});

router.get("/hard75/analytics", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const challenge = await getActiveChallenge(user.id);

  const startDate = challenge?.start_date;

  let logsQuery = supabase.from("hard75_daily_logs").select("*").eq("user_id", user.id).order("date", { ascending: true });
  let waterHistQuery = supabase.from("hard75_water_logs").select("date,amount_ml,target_ml").eq("user_id", user.id).order("date", { ascending: true }).limit(75);
  let readingHistQuery = supabase.from("hard75_reading_logs").select("date,pages_read").eq("user_id", user.id).order("date", { ascending: true }).limit(75);
  let workoutsQuery = supabase.from("hard75_workouts").select("date,type,duration_minutes").eq("user_id", user.id).order("date", { ascending: true }).limit(150);

  if (startDate) {
    logsQuery = (logsQuery as any).gte("date", startDate);
    waterHistQuery = (waterHistQuery as any).gte("date", startDate);
    readingHistQuery = (readingHistQuery as any).gte("date", startDate);
    workoutsQuery = (workoutsQuery as any).gte("date", startDate);
  }

  const [logsRes, waterHistRes, readingHistRes, workoutsRes] = await Promise.all([
    logsQuery, waterHistQuery, readingHistQuery, workoutsQuery,
  ]);

  const logs = logsRes.data ?? [];
  const completedDays = logs.filter((l: any) => l.all_done).length;
  const totalDays = logs.length;
  const completionPct = totalDays > 0 ? Math.round((completedDays / Math.max(1, challenge ? 75 : totalDays)) * 100) : 0;

  // Streak
  let currentStreak = 0;
  let longestStreak = 0;
  let streak = 0;
  const sortedLogs = [...logs].sort((a: any, b: any) => a.date.localeCompare(b.date));
  for (const log of sortedLogs) {
    if ((log as any).all_done) {
      streak++;
      longestStreak = Math.max(longestStreak, streak);
    } else {
      streak = 0;
    }
  }
  // current streak (count from end)
  for (let i = sortedLogs.length - 1; i >= 0; i--) {
    if ((sortedLogs[i] as any).all_done) currentStreak++;
    else break;
  }

  // Weekly breakdown (last 7 days)
  const last7 = logs.slice(-7).map((l: any) => ({
    date: l.date,
    done: l.all_done,
    workout: l.workout1_done && l.workout2_done,
    water: l.water_done,
    reading: l.reading_done,
    diet: l.diet_done,
  }));

  res.json({
    challenge,
    completedDays,
    totalDays,
    completionPct,
    currentStreak,
    longestStreak,
    weeklyBreakdown: last7,
    waterHistory: waterHistRes.data ?? [],
    readingHistory: readingHistRes.data ?? [],
    workoutHistory: workoutsRes.data ?? [],
    taskBreakdown: {
      workout1: logs.filter((l: any) => l.workout1_done).length,
      workout2: logs.filter((l: any) => l.workout2_done).length,
      water: logs.filter((l: any) => l.water_done).length,
      reading: logs.filter((l: any) => l.reading_done).length,
      diet: logs.filter((l: any) => l.diet_done).length,
      photo: logs.filter((l: any) => l.photo_done).length,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACHIEVEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

const ACHIEVEMENT_DEFS = [
  { key: "day_1",       label: "Day 1",           xp: 50,  description: "Started the 75 Hard challenge" },
  { key: "day_7",       label: "Week Warrior",     xp: 100, description: "Completed 7 days" },
  { key: "day_14",      label: "Two Weeks Strong", xp: 150, description: "Completed 14 days" },
  { key: "day_21",      label: "3-Week Champion",  xp: 200, description: "Completed 21 days" },
  { key: "day_30",      label: "30 Day Titan",     xp: 300, description: "Completed 30 days" },
  { key: "day_45",      label: "Halfway Hero",     xp: 400, description: "Reached the halfway point" },
  { key: "day_60",      label: "60 Day Legend",    xp: 500, description: "Completed 60 days" },
  { key: "day_75",      label: "75 Hard Complete", xp: 1000,description: "Completed the full 75 Hard challenge!" },
  { key: "perfect_week",label: "Perfect Week",     xp: 150, description: "7 consecutive perfect days" },
  { key: "streak_10",   label: "10-Day Streak",    xp: 200, description: "10 consecutive perfect days" },
  { key: "streak_30",   label: "30-Day Streak",    xp: 500, description: "30 consecutive perfect days" },
];

router.get("/hard75/achievements", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const { data: earned } = await supabase
    .from("hard75_achievements")
    .select("achievement_key, earned_at, xp")
    .eq("user_id", user.id);

  const earnedMap = new Map((earned ?? []).map((a: any) => [a.achievement_key, a]));
  const totalXp = (earned ?? []).reduce((sum: number, a: any) => sum + (a.xp ?? 0), 0);
  const level = Math.floor(totalXp / 500) + 1;

  res.json({
    achievements: ACHIEVEMENT_DEFS.map(def => ({
      ...def,
      earned: earnedMap.has(def.key),
      earned_at: earnedMap.get(def.key)?.earned_at ?? null,
    })),
    totalXp,
    level,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hard75/settings", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const { data } = await supabase
    .from("hard75_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  res.json(data ?? { water_goal_ml: 3785, units: "metric" });
});

router.put("/hard75/settings", requireAuth, requireHard75Access, async (req: AuthRequest, res) => {
  const user = req.user!;
  const waterGoal = Number(req.body.water_goal_ml) || 3785;
  const units = sanitizeEnum(req.body.units, ["metric", "imperial"] as const) ?? "metric";
  const workoutReminder = capText(req.body.workout_reminder_time, 10);
  const readingReminder = capText(req.body.reading_reminder_time, 10);
  const dietReminder = capText(req.body.diet_reminder_time, 10);

  const { data, error } = await supabase
    .from("hard75_settings")
    .upsert(
      { user_id: user.id, water_goal_ml: waterGoal, units, workout_reminder_time: workoutReminder, reading_reminder_time: readingReminder, diet_reminder_time: dietReminder, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/** GET /api/hard75/admin/users — list users with 75 Hard access status */
router.get("/hard75/admin/users", requireAdmin, async (req: AuthRequest, res) => {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_approved, status")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) { res.status(500).json({ error: error.message }); return; }

  const { data: accessRows } = await supabase
    .from("hard75_access")
    .select("user_id, enabled, enabled_at");

  const accessMap = new Map((accessRows ?? []).map((a: any) => [a.user_id, a]));

  const users = (profiles ?? []).map((p: any) => ({
    ...p,
    hard75_access: p.role === "super_admin"
      ? { enabled: true, enabled_at: null }
      : (accessMap.get(p.id) ?? { enabled: false, enabled_at: null }),
  }));

  res.json(users);
});

/** POST /api/hard75/admin/access — enable/disable for a user */
router.post("/hard75/admin/access", requireSuperAdmin, async (req: AuthRequest, res) => {
  const actor = req.user!;
  const targetId = capText(req.body.user_id, MAX.UUID);
  if (!targetId || !isValidUuid(targetId)) { res.status(400).json({ error: "Invalid user_id" }); return; }
  const enabled = req.body.enabled === true || req.body.enabled === "true";

  // Verify user exists
  const { data: profile } = await supabase.from("profiles").select("id,role").eq("id", targetId).maybeSingle();
  if (!profile) { res.status(404).json({ error: "User not found" }); return; }
  if (profile.role === "super_admin") { res.status(400).json({ error: "Cannot modify super admin access" }); return; }

  const { error } = await supabase
    .from("hard75_access")
    .upsert(
      { user_id: targetId, enabled, enabled_by: actor.id, enabled_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: `75 Hard access ${enabled ? "enabled" : "disabled"}` });
});

/** POST /api/hard75/admin/bulk — bulk enable/disable */
router.post("/hard75/admin/bulk", requireSuperAdmin, async (req: AuthRequest, res) => {
  const actor = req.user!;
  const userIds: string[] = Array.isArray(req.body.user_ids) ? req.body.user_ids : [];
  const enabled = req.body.enabled === true || req.body.enabled === "true";

  const validIds = userIds.filter(id => isValidUuid(id));
  if (validIds.length === 0) { res.status(400).json({ error: "No valid user IDs" }); return; }

  const rows = validIds.map(id => ({
    user_id: id,
    enabled,
    enabled_by: actor.id,
    enabled_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("hard75_access").upsert(rows, { onConflict: "user_id" });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: `Bulk ${enabled ? "enabled" : "disabled"} for ${validIds.length} users` });
});

/** POST /api/hard75/admin/users/:userId/restart — restart a user's challenge */
router.post("/hard75/admin/users/:userId/restart", requireSuperAdmin, async (req: AuthRequest, res) => {
  const userId = String(req.params["userId"]);
  if (!isValidUuid(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  await supabase.from("hard75_challenges").update({ status: "restarted" }).eq("user_id", userId).in("status", ["active", "failed"]);

  const { data, error } = await supabase
    .from("hard75_challenges")
    .insert({ user_id: userId, start_date: todayDate(), status: "active" })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: "Challenge restarted", challenge: data });
});

/** DELETE /api/hard75/admin/users/:userId/reset — wipe all user data */
router.delete("/hard75/admin/users/:userId/reset", requireSuperAdmin, async (req: AuthRequest, res) => {
  const userId = String(req.params["userId"]);
  if (!isValidUuid(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const tables = [
    "hard75_daily_logs", "hard75_workouts", "hard75_water_logs",
    "hard75_reading_logs", "hard75_diet_logs", "hard75_progress_photos",
    "hard75_journals", "hard75_measurements", "hard75_achievements",
    "hard75_challenges",
  ];

  for (const table of tables) {
    await supabase.from(table).delete().eq("user_id", userId);
  }

  res.json({ message: "User 75 Hard data reset" });
});

/** GET /api/hard75/admin/analytics — global analytics */
router.get("/hard75/admin/analytics", requireAdmin, async (req: AuthRequest, res) => {
  const [accessRes, challengeRes, logRes] = await Promise.all([
    supabase.from("hard75_access").select("user_id,enabled").eq("enabled", true),
    supabase.from("hard75_challenges").select("user_id,status,start_date"),
    supabase.from("hard75_daily_logs").select("user_id,date,all_done").gte("date", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)),
  ]);

  const enabledUsers = (accessRes.data ?? []).length;
  const activeCount = (challengeRes.data ?? []).filter((c: any) => c.status === "active").length;
  const completedCount = (challengeRes.data ?? []).filter((c: any) => c.status === "completed").length;

  // DAU (distinct users with any log in last 7 days)
  const dauSet = new Set((logRes.data ?? []).map((l: any) => l.user_id));

  res.json({
    enabledUsers,
    activeCount,
    completedCount,
    weeklyDau: dauSet.size,
  });
});

/** GET /api/hard75/admin/module-settings — global module settings */
router.get("/hard75/admin/module-settings", requireSuperAdmin, async (req: AuthRequest, res) => {
  const { data } = await supabase.from("hard75_module_settings").select("*").eq("id", 1).maybeSingle();
  res.json(data ?? { enabled_globally: true, default_water_goal_ml: 3785 });
});

/** PUT /api/hard75/admin/module-settings */
router.put("/hard75/admin/module-settings", requireSuperAdmin, async (req: AuthRequest, res) => {
  const enabledGlobally = req.body.enabled_globally !== false;
  const defaultWaterGoal = Number(req.body.default_water_goal_ml) || 3785;

  const { data, error } = await supabase
    .from("hard75_module_settings")
    .upsert({ id: 1, enabled_globally: enabledGlobally, default_water_goal_ml: defaultWaterGoal, updated_at: new Date().toISOString() }, { onConflict: "id" })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: update daily log from task data
// ═══════════════════════════════════════════════════════════════════════════════

async function updateDailyLog(userId: string, date: string) {
  try {
    const [workoutsRes, waterRes, readingRes, dietRes, photoRes] = await Promise.all([
      supabase.from("hard75_workouts").select("type").eq("user_id", userId).eq("date", date),
      supabase.from("hard75_water_logs").select("amount_ml,target_ml").eq("user_id", userId).eq("date", date).maybeSingle(),
      supabase.from("hard75_reading_logs").select("pages_read").eq("user_id", userId).eq("date", date).maybeSingle(),
      supabase.from("hard75_diet_logs").select("followed").eq("user_id", userId).eq("date", date).maybeSingle(),
      supabase.from("hard75_progress_photos").select("id").eq("user_id", userId).eq("date", date).limit(1),
    ]);

    const workouts = workoutsRes.data ?? [];
    const workout1Done = workouts.some((w: any) => w.type === "indoor");
    const workout2Done = workouts.some((w: any) => w.type === "outdoor");
    const water = waterRes.data;
    const waterDone = water != null && water.amount_ml >= (water.target_ml ?? 3785);
    const reading = readingRes.data;
    const readingDone = reading != null && reading.pages_read >= 10;
    const diet = dietRes.data;
    const dietDone = diet?.followed === true;
    const photoDone = (photoRes.data ?? []).length > 0;
    const allDone = workout1Done && workout2Done && waterDone && readingDone && dietDone && photoDone;

    await supabase.from("hard75_daily_logs").upsert(
      {
        user_id: userId, date,
        workout1_done: workout1Done, workout2_done: workout2Done,
        water_done: waterDone, reading_done: readingDone,
        diet_done: dietDone, photo_done: photoDone, all_done: allDone,
      },
      { onConflict: "user_id,date" }
    );

    // Award achievements if all done
    if (allDone) {
      const { data: logs } = await supabase
        .from("hard75_daily_logs")
        .select("all_done,date")
        .eq("user_id", userId)
        .order("date", { ascending: true });

      const completedCount = (logs ?? []).filter((l: any) => l.all_done).length;

      // Streak
      let streak = 0;
      for (let i = (logs ?? []).length - 1; i >= 0; i--) {
        if ((logs as any[])[i].all_done) streak++;
        else break;
      }

      const toAward: Array<{ achievement_key: string; xp: number }> = [];
      const milestones: Record<number, string> = { 1: "day_1", 7: "day_7", 14: "day_14", 21: "day_21", 30: "day_30", 45: "day_45", 60: "day_60", 75: "day_75" };
      if (milestones[completedCount]) toAward.push({ achievement_key: milestones[completedCount], xp: ACHIEVEMENT_DEFS.find(a => a.key === milestones[completedCount])?.xp ?? 100 });
      if (streak === 7) toAward.push({ achievement_key: "perfect_week", xp: 150 });
      if (streak === 10) toAward.push({ achievement_key: "streak_10", xp: 200 });
      if (streak === 30) toAward.push({ achievement_key: "streak_30", xp: 500 });

      for (const a of toAward) {
        await supabase.from("hard75_achievements").upsert(
          { user_id: userId, achievement_key: a.achievement_key, xp: a.xp, earned_at: new Date().toISOString() },
          { onConflict: "user_id,achievement_key" }
        );
      }
    }
  } catch (err) {
    logger.warn({ err }, "hard75 updateDailyLog failed");
  }
}

export default router;
