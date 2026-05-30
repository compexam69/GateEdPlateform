import { AppLayout } from "@/components/layout/AppLayout";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RotateCcw, Coffee, Brain, Clock, Tag, X, Trophy, Settings, History } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getPomodoroStats, getGetPomodoroStatsUrl, getPomodoroSessions, getGetPomodoroSessionsUrl } from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
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
  long: Coffee,
  custom: Settings,
};

const MODE_COLOR: Record<PomodoroMode, string> = {
  focus: "text-primary",
  short: "text-secondary",
  long: "text-accent",
  custom: "text-primary",
};

const MODE_BG: Record<PomodoroMode, string> = {
  focus: "hsl(var(--primary))",
  short: "hsl(var(--secondary))",
  long: "hsl(var(--accent))",
  custom: "hsl(var(--primary))",
};

interface TopicOption {
  id: string;
  title: string;
  chapter_title: string;
}

export default function PomodoroPage() {
  const { user } = useAuth();
  const store = usePomodoroStore();
  const { mode, customMinutes, timeLeft, isRunning, startTime, sessionCount, selectedTopicId, selectedTopicTitle } = store;
  const [customInput, setCustomInput] = useState(String(customMinutes));

  const [topicSearch, setTopicSearch] = useState("");
  const [topicPickerOpen, setTopicPickerOpen] = useState(false);

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

  const { data: topicOptions = [] } = useQuery<TopicOption[]>({
    queryKey: ["topics-for-pomodoro", user?.id, topicSearch],
    queryFn: async () => {
      const query = supabase
        .from("topics")
        .select("id, title, chapters!inner(title)")
        .eq("is_active", true)
        .limit(8);
      if (topicSearch.trim()) query.ilike("title", `%${topicSearch.trim()}%`);
      const { data } = await query;
      return (data ?? []).map((t: { id: string; title: string; chapters: { title: string } | { title: string }[] }) => ({
        id: t.id,
        title: t.title,
        chapter_title: Array.isArray(t.chapters) ? (t.chapters[0]?.title ?? "") : (t.chapters as { title: string }).title,
      }));
    },
    enabled: topicPickerOpen,
  });

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

  const radius = 120;
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
            {(["focus", "short", "long", "custom"] as PomodoroMode[]).map((m) => {
              const Icon = MODE_ICONS[m];
              return (
                <Button
                  key={m}
                  variant={mode === m ? "default" : "outline"}
                  size="sm"
                  onClick={() => switchMode(m)}
                  className="gap-1 h-7 text-xs px-2.5 md:h-8 md:text-sm md:px-3"
                >
                  <Icon className="w-3 h-3 md:w-3.5 md:h-3.5" />
                  {POMODORO_LABELS[m]}
                </Button>
              );
            })}
          </div>

          {/* Custom duration input */}
          {mode === "custom" && (
            <div className="flex justify-center">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/30">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Duration:</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={customInput}
                  onChange={(e) => {
                    setCustomInput(e.target.value);
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 1 && v <= 120) store.setCustomMinutes(v);
                  }}
                  onBlur={() => {
                    const v = parseInt(customInput, 10);
                    if (isNaN(v) || v < 1) { store.setCustomMinutes(1); setCustomInput("1"); }
                    else if (v > 120) { store.setCustomMinutes(120); setCustomInput("120"); }
                  }}
                  disabled={isRunning}
                  className="w-14 bg-transparent text-center font-mono font-bold text-sm border-b border-border focus:outline-none focus:border-primary disabled:opacity-50"
                />
                <span className="text-xs text-muted-foreground">min</span>
              </div>
            </div>
          )}

          {/* Topic tagger — focus mode only */}
          {mode === "focus" && (
            <div className="flex justify-center">
              <Popover open={topicPickerOpen} onOpenChange={setTopicPickerOpen}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors md:text-sm">
                    <Tag className="w-3 h-3 md:w-3.5 md:h-3.5" />
                    {selectedTopicTitle ? (
                      <span className="text-foreground font-medium">{selectedTopicTitle}</span>
                    ) : (
                      <span>Tag a topic (optional)</span>
                    )}
                    {selectedTopicTitle && (
                      <span
                        onClick={(e) => { e.stopPropagation(); store.setSelectedTopic(null, null); }}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="center">
                  <Input
                    placeholder="Search topics..."
                    value={topicSearch}
                    onChange={(e) => setTopicSearch(e.target.value)}
                    className="mb-2 h-8 text-sm"
                    autoFocus
                  />
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {topicOptions.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">No topics found</p>
                    ) : (
                      topicOptions.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => { store.setSelectedTopic(t.id, t.title); setTopicPickerOpen(false); setTopicSearch(""); }}
                          className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors ${selectedTopicId === t.id ? "bg-primary/10 text-primary" : ""}`}
                        >
                          <div className="font-medium truncate">{t.title}</div>
                          <div className="text-xs text-muted-foreground truncate">{t.chapter_title}</div>
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Timer circle — flex-1 on mobile so it fills remaining space proportionally */}
          <div className="flex flex-col items-center flex-1 md:flex-none justify-center min-h-0">
            {/*
              Mobile: circle size = min(42vw, 190px) → ~157–190px, adapts to screen width
              Desktop: fixed 220px
            */}
            <div
              className="relative flex items-center justify-center md:w-56 md:h-56"
              style={{ width: "min(38vw, 175px)", height: "min(38vw, 175px)" }}
            >
              <svg
                className="w-full h-full transform -rotate-90 absolute inset-0"
                viewBox="0 0 260 260"
              >
                <circle cx="130" cy="130" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
                <circle
                  cx="130" cy="130" r={radius}
                  fill="none"
                  stroke={MODE_BG[mode]}
                  strokeWidth="10"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - progress)}
                  className="transition-all duration-1000 ease-linear"
                  strokeLinecap="round"
                />
              </svg>
              <div className="text-center z-10">
                <div className="font-bold font-mono tracking-tighter text-3xl sm:text-4xl md:text-5xl">
                  {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
                </div>
                <div className={`text-xs font-medium mt-0.5 md:text-sm ${MODE_COLOR[mode]}`}>
                  {POMODORO_LABELS[mode]}
                </div>
                {selectedTopicTitle && mode === "focus" && (
                  <div className="text-[10px] text-muted-foreground mt-0.5 max-w-[120px] truncate md:text-xs">
                    {selectedTopicTitle}
                  </div>
                )}
              </div>
            </div>

            {/* Controls — always visible directly below timer */}
            <div className="flex items-center gap-4 mt-3 md:mt-5">
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
                className="w-14 h-14 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-transform flex items-center justify-center md:w-16 md:h-16"
                style={{ backgroundColor: MODE_BG[mode] }}
                onClick={handleToggle}
                aria-label={isRunning ? "Pause timer" : "Start timer"}
              >
                {isRunning ? (
                  <svg className="w-6 h-6 text-white fill-white md:w-7 md:h-7" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-white fill-white ml-0.5 md:w-7 md:h-7" viewBox="0 0 24 24">
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                )}
              </button>
              {/* Spacer to balance reset button and keep play centred */}
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
    </AppLayout>
  );
}
