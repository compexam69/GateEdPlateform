import { AppLayout } from "@/components/layout/AppLayout";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RotateCcw, Coffee, Brain, Clock, Trophy, Settings, History } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getPomodoroStats, getGetPomodoroStatsUrl, getPomodoroSessions, getGetPomodoroSessionsUrl } from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";
import {
  usePomodoroStore,
  getDurationForMode,
  POMODORO_LABELS,
  type PomodoroMode,
} from "@/store/pomodoroStore";
import { playChime } from "@/lib/playChime";

const MODE_ICONS: Record<PomodoroMode, typeof Brain> = {
  focus: Brain,
  short: Coffee,
  custom: Settings,
};

const MODE_COLOR: Record<PomodoroMode, string> = {
  focus: "text-primary",
  short: "text-secondary",
  custom: "text-primary",
};

const MODE_BG: Record<PomodoroMode, string> = {
  focus: "hsl(var(--primary))",
  short: "hsl(var(--secondary))",
  custom: "hsl(var(--primary))",
};

export default function PomodoroPage() {
  const store = usePomodoroStore();
  const { mode, customMinutes, timeLeft, isRunning, startTime, sessionCount } = store;
  const [customInput, setCustomInput] = useState(String(customMinutes));
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [pendingCustomInput, setPendingCustomInput] = useState(String(customMinutes));

  function openCustomDialog() {
    setPendingCustomInput(String(customMinutes));
    setCustomDialogOpen(true);
  }

  function confirmCustomDialog() {
    const v = parseInt(pendingCustomInput, 10);
    const clamped = isNaN(v) || v < 1 ? 1 : v > 120 ? 120 : v;
    store.setCustomMinutes(clamped);
    setCustomInput(String(clamped));
    store.setMode("custom");
    setCustomDialogOpen(false);
  }

  const GOAL_PRESETS = [2, 4, 6, 8];
  const [dailyGoal, setDailyGoal] = useState<number>(() => {
    try {
      const stored = localStorage.getItem("pomodoro_daily_goal");
      const parsed = stored ? parseInt(stored, 10) : 4;
      return GOAL_PRESETS.includes(parsed) ? parsed : 4;
    } catch {
      return 4;
    }
  });

  function cycleGoal() {
    setDailyGoal((prev) => {
      const next = GOAL_PRESETS[(GOAL_PRESETS.indexOf(prev) + 1) % GOAL_PRESETS.length];
      try { localStorage.setItem("pomodoro_daily_goal", String(next)); } catch {}
      return next;
    });
  }

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: [getGetPomodoroStatsUrl()],
    queryFn: () => getPomodoroStats(),
    refetchInterval: 30000,
  });

  const { data: sessions = [], refetch: refetchSessions } = useQuery({
    queryKey: [getGetPomodoroSessionsUrl()],
    queryFn: () => getPomodoroSessions(),
    refetchInterval: 60000,
  });

  // Sorted newest-first, capped at 5
  const recentSessions = [...sessions]
    .sort((a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime())
    .slice(0, 5);

  useEffect(() => {
    refetchStats();
    refetchSessions();
  }, [store.sessionCount]);

  function handleToggle() {
    if (isRunning) {
      store.pause();
    } else {
      if (!startTime) playChime("start");
      store.start();
    }
  }

  function handleReset() {
    store.reset();
  }

  function switchMode(newMode: PomodoroMode) {
    store.setMode(newMode);
  }

  const radius = 116;
  const circumference = 2 * Math.PI * radius;
  const totalDuration = getDurationForMode(mode, customMinutes);
  const progress = totalDuration > 0 ? (totalDuration - timeLeft) / totalDuration : 0;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const streakDays = stats?.streak_days ?? 0;

  return (
    <AppLayout fullHeight>
      {/*
        Mobile: flex-col, fills exact viewport (no scroll)
        Desktop (md+): 2-column grid — timer left, stats right
      */}
      <div className="h-full flex flex-col gap-2 py-2 md:grid md:grid-cols-2 md:gap-8 md:py-5 md:items-start md:max-w-5xl md:mx-auto md:w-full">

        {/* ── LEFT COLUMN: header + modes + input + timer + controls ────────── */}
        {/* flex-1 min-h-0 on mobile: left column owns all vertical space except stats row */}
        <div className="flex-1 min-h-0 flex flex-col gap-2 md:gap-4 md:flex-none md:h-full md:justify-center">

          {/* Page header — compact */}
          <div className="text-center">
            <h1 className="text-lg font-bold leading-tight md:text-2xl">Pomodoro Timer</h1>
            <p className="text-muted-foreground text-xs mt-0.5 md:text-sm">Stay focused, study smarter.</p>
          </div>

          {/* Mode selector — compact touch-friendly buttons */}
          <div className="flex justify-center gap-1.5 flex-wrap">
            {(["focus", "short", "custom"] as PomodoroMode[]).map((m) => {
              const Icon = MODE_ICONS[m];
              return (
                <Button
                  key={m}
                  variant={mode === m ? "default" : "outline"}
                  size="sm"
                  onClick={() => m === "custom" ? openCustomDialog() : switchMode(m)}
                  className="gap-1 h-7 text-xs px-2.5 md:h-8 md:text-sm md:px-3"
                >
                  <Icon className="w-3 h-3 md:w-3.5 md:h-3.5" />
                  {m === "custom" && mode === "custom" ? `Custom (${customMinutes}m)` : POMODORO_LABELS[m]}
                </Button>
              );
            })}
          </div>

          {/* Timer — circular progress ring */}
          <div className="flex flex-col items-center flex-1 md:flex-none justify-center min-h-0">
            <div
              className="relative flex items-center justify-center md:w-64 md:h-64"
              style={{ width: "min(52vw, 220px)", height: "min(52vw, 220px)" }}
            >
              <svg
                className="w-full h-full -rotate-90 absolute inset-0"
                viewBox="0 0 260 260"
                aria-hidden="true"
              >
                <defs>
                  <filter id="ring-glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="3.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {/* Track */}
                <circle
                  cx="130" cy="130" r={radius}
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth="14"
                  strokeLinecap="round"
                />
                {/* Progress arc */}
                <circle
                  cx="130" cy="130" r={radius}
                  fill="none"
                  stroke={MODE_BG[mode]}
                  strokeWidth="14"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - progress)}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-linear"
                  filter="url(#ring-glow)"
                />
              </svg>

              {/* Center content */}
              <div className="text-center z-10 flex flex-col items-center gap-0.5">
                <div className="font-bold font-mono tracking-tighter text-4xl sm:text-5xl md:text-5xl leading-none">
                  {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
                </div>
                <div className={`text-[11px] font-semibold uppercase tracking-widest mt-1 md:text-xs ${MODE_COLOR[mode]}`}>
                  {POMODORO_LABELS[mode]}
                </div>
              </div>
            </div>

            {/* Controls — directly below ring */}
            <div className="flex items-center gap-4 mt-4 md:mt-6">
              <Button
                size="icon"
                variant="outline"
                className="w-11 h-11 rounded-full md:w-12 md:h-12"
                onClick={handleReset}
                aria-label="Reset timer"
              >
                <RotateCcw className="w-4 h-4 md:w-5 md:h-5" />
              </Button>
              <button
                className="w-16 h-16 rounded-full shadow-xl hover:scale-105 active:scale-95 transition-transform flex items-center justify-center md:w-[4.5rem] md:h-[4.5rem]"
                style={{ backgroundColor: MODE_BG[mode] }}
                onClick={handleToggle}
                aria-label={isRunning ? "Pause timer" : "Start timer"}
              >
                {isRunning ? (
                  <svg className="w-6 h-6 fill-white md:w-7 md:h-7" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 fill-white ml-1 md:w-7 md:h-7" viewBox="0 0 24 24">
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                )}
              </button>
              {/* Spacer mirrors reset button to keep play centred */}
              <div className="w-11 h-11 md:w-12 md:h-12" aria-hidden />
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN (desktop) / bottom section (mobile): stats ──────── */}
        {/* shrink-0 on mobile: stats are never compressed, always fully visible */}
        <div className="shrink-0 flex flex-col gap-2 md:gap-4 md:shrink md:h-full md:justify-center">

          {/* Stats row — 3 compact cards */}
          <div className="grid grid-cols-3 gap-2">
            <Card
              className="bg-card text-center cursor-pointer hover:bg-muted/20 active:scale-95 transition-all select-none"
              onClick={cycleGoal}
              title="Tap to change daily goal"
            >
              <CardContent className="p-2 md:p-3">
                <div className="text-xl font-bold text-primary md:text-2xl tabular-nums leading-none">
                  {sessionCount}
                  <span className="text-[11px] font-normal text-muted-foreground">/{dailyGoal}</span>
                </div>
                <div className="h-1 bg-muted rounded-full overflow-hidden mt-1.5 mb-0.5 mx-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${
                      sessionCount >= dailyGoal ? "bg-emerald-500" : "bg-primary/80"
                    }`}
                    style={{ width: `${Math.min((sessionCount / dailyGoal) * 100, 100)}%` }}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  {sessionCount >= dailyGoal ? "Goal met!" : "Daily Goal"}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card text-center">
              <CardContent className="p-2 md:p-3">
                <div className="text-xl font-bold text-secondary md:text-2xl">
                  {stats ? (stats.today_minutes ?? 0) : 0}m
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 md:text-xs leading-tight">Focus Today</div>
              </CardContent>
            </Card>
            <Card className="bg-card text-center">
              <CardContent className="p-2 md:p-3">
                <div className="text-xl font-bold text-warning md:text-2xl">{streakDays}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 md:text-xs leading-tight">Day Streak</div>
              </CardContent>
            </Card>
          </div>

          {/* Focus Master badge — compact pill on mobile, full card on desktop */}
          {streakDays >= 7 && (
            <>
              {/* Mobile: single-line pill to save vertical space */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-warning/10 border border-warning/25 md:hidden">
                <Trophy className="w-3 h-3 text-warning shrink-0" />
                <span className="text-[11px] font-semibold text-warning">{streakDays}-day streak</span>
                <span className="text-[10px] text-muted-foreground">· Focus Master</span>
              </div>
              {/* Desktop: full card */}
              <Card className="hidden md:block bg-warning/5 border-warning/30">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center shrink-0">
                    <Trophy className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-warning">Focus Master</p>
                    <p className="text-xs text-muted-foreground">
                      {streakDays}-day streak. Outstanding dedication!
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Session history — mobile: last 3, desktop: last 5 */}
          <Card className="bg-card">
            <CardContent className="p-2.5 md:p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <History className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider md:text-xs">
                  Recent Sessions
                </span>
              </div>
              {recentSessions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-1.5">
                  No sessions recorded yet
                </p>
              ) : (
                <div className="space-y-1.5">
                  {recentSessions.map((s, i) => (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between gap-2 min-w-0 ${i >= 3 ? "hidden md:flex" : ""}`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-xs font-bold text-primary tabular-nums shrink-0">
                          {Math.round(s.duration_seconds / 60)}m
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate">
                          {s.topic_context ?? "Free focus"}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground/70 shrink-0 whitespace-nowrap">
                        {formatDistanceToNow(new Date(s.end_time), { addSuffix: true })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Focus tip — desktop only; replaced on mobile by session history */}
          {mode === "focus" && (
            <Card className="hidden md:block bg-card/50 border-dashed">
              <CardContent className="p-4">
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {streakDays > 0
                      ? `${streakDays}-day streak! Complete 4 sessions/day to keep it going.`
                      : "Complete 4 focus sessions per day to build your streak."}
                    {streakDays > 0 && streakDays < 7 && (
                      <span className="text-primary"> {7 - streakDays} more days to Focus Master.</span>
                    )}
                    {isRunning && (
                      <span className="block text-primary font-medium mt-1">
                        Timer continues while you navigate away.
                      </span>
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      {/* Custom duration dialog */}
      {customDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setCustomDialogOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-72 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <h2 className="text-base font-semibold">Set custom duration</h2>
            </div>
            <div className="flex items-center gap-3 justify-center">
              <input
                type="number"
                min={1}
                max={120}
                value={pendingCustomInput}
                autoFocus
                onChange={(e) => setPendingCustomInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmCustomDialog()}
                className="w-20 text-center font-mono font-bold text-3xl bg-muted/40 border border-border rounded-lg py-2 focus:outline-none focus:border-primary"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
            </div>
            <p className="text-xs text-muted-foreground text-center">Enter a value between 1 and 120</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setCustomDialogOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={confirmCustomDialog}>
                OK
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
