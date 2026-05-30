import { AppLayout } from "@/components/layout/AppLayout";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RotateCcw, Coffee, Brain, Clock, Tag, X, Trophy, Settings } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getPomodoroStats, getGetPomodoroStatsUrl } from "@workspace/api-client-react";
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

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: [getGetPomodoroStatsUrl()],
    queryFn: () => getPomodoroStats(),
    refetchInterval: 30000,
  });

  useEffect(() => {
    refetchStats();
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

  const ModeIcon = MODE_ICONS[mode];
  const radius = 120;
  const circumference = 2 * Math.PI * radius;
  const totalDuration = getDurationForMode(mode, customMinutes);
  const progress = totalDuration > 0 ? (totalDuration - timeLeft) / totalDuration : 0;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const streakDays = stats?.streak_days ?? 0;

  return (
    <AppLayout noPad>
      {/* Single-screen container — no scrolling */}
      <div className="flex flex-col h-full max-w-md mx-auto px-4 py-3 md:py-5 gap-3">

        {/* ── Header: title + mode selector ──────────────────────────────── */}
        <div className="shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold leading-tight">Focus Timer</h1>
              <p className="text-xs text-muted-foreground">Stay focused, study smarter.</p>
            </div>
            {isRunning && (
              <span className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                Running
              </span>
            )}
          </div>

          {/* Mode selector */}
          <div className="flex gap-1.5 flex-wrap">
            {(["focus", "short", "long", "custom"] as PomodoroMode[]).map((m) => {
              const Icon = MODE_ICONS[m];
              return (
                <Button
                  key={m}
                  variant={mode === m ? "default" : "outline"}
                  size="sm"
                  onClick={() => switchMode(m)}
                  className="gap-1.5 h-8 text-xs px-2.5"
                >
                  <Icon className="w-3 h-3" />
                  {POMODORO_LABELS[m]}
                </Button>
              );
            })}
          </div>

          {/* Custom duration input */}
          {mode === "custom" && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/30">
              <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
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
          )}

          {/* Topic tag (focus mode only) */}
          {mode === "focus" && (
            <div className="flex">
              <Popover open={topicPickerOpen} onOpenChange={setTopicPickerOpen}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors">
                    <Tag className="w-3 h-3" />
                    {selectedTopicTitle ? (
                      <span className="text-foreground font-medium">{selectedTopicTitle}</span>
                    ) : (
                      <span>Tag a topic (optional)</span>
                    )}
                    {selectedTopicTitle && (
                      <span
                        onClick={(e) => { e.stopPropagation(); store.setSelectedTopic(null, null); }}
                        className="ml-0.5 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="start">
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
        </div>

        {/* ── Timer zone — flex-1 so it fills remaining vertical space ──── */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4">

          {/* SVG ring + time display */}
          <div className="relative w-full max-w-[220px] sm:max-w-[256px] aspect-square mx-auto">
            <svg
              className="w-full h-full transform -rotate-90 absolute inset-0"
              viewBox="0 0 260 260"
            >
              <circle
                cx="130" cy="130" r={radius}
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="10"
              />
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
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10">
              <div className="text-5xl sm:text-6xl font-bold font-mono tracking-tighter leading-none">
                {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
              </div>
              <div className={`text-sm font-medium mt-1 ${MODE_COLOR[mode]}`}>
                {POMODORO_LABELS[mode]}
              </div>
              {selectedTopicTitle && mode === "focus" && (
                <div className="text-xs text-muted-foreground mt-0.5 max-w-[150px] truncate">
                  {selectedTopicTitle}
                </div>
              )}
            </div>
          </div>

          {/* Play / Pause + Reset controls */}
          <div className="flex items-center gap-4">
            <Button
              size="icon"
              variant="outline"
              className="w-11 h-11 rounded-full"
              onClick={handleReset}
              aria-label="Reset timer"
            >
              <RotateCcw className="w-5 h-5" />
            </Button>
            <button
              className="w-14 h-14 rounded-full shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
              style={{ backgroundColor: MODE_BG[mode] }}
              onClick={handleToggle}
              aria-label={isRunning ? "Pause timer" : "Start timer"}
            >
              {isRunning ? (
                <svg className="w-6 h-6 text-white fill-white" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-white fill-white ml-0.5" viewBox="0 0 24 24">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              )}
            </button>
            {/* Spacer to keep play button centered */}
            <div className="w-11 h-11" aria-hidden />
          </div>
        </div>

        {/* ── Stats + badges ─────────────────────────────────────────────── */}
        <div className="shrink-0 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Card className="bg-card text-center">
              <CardContent className="p-2">
                <div className="text-xl font-bold text-primary">{sessionCount}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">Sessions</div>
              </CardContent>
            </Card>
            <Card className="bg-card text-center">
              <CardContent className="p-2">
                <div className="text-xl font-bold text-secondary">
                  {stats ? (stats.today_minutes ?? 0) : 0}m
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">Focus Today</div>
              </CardContent>
            </Card>
            <Card className="bg-card text-center">
              <CardContent className="p-2">
                <div className="text-xl font-bold text-warning">{streakDays}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">Day Streak</div>
              </CardContent>
            </Card>
          </div>

          {/* Focus Master badge — compact row, only when earned */}
          {streakDays >= 7 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/5 border border-warning/20">
              <Trophy className="w-4 h-4 text-warning shrink-0" />
              <p className="text-xs">
                <span className="font-semibold text-warning">Focus Master</span>
                <span className="text-muted-foreground ml-1">{streakDays}-day streak. Outstanding!</span>
              </p>
            </div>
          )}

          {/* One-line hint */}
          {mode === "focus" && (
            <p className="text-center text-[11px] text-muted-foreground leading-snug pb-0.5">
              {streakDays > 0 && streakDays < 7
                ? `${7 - streakDays} more day${7 - streakDays !== 1 ? "s" : ""} to Focus Master · `
                : ""}
              4 sessions/day maintains your streak
              {isRunning ? " · Timer runs while you navigate" : ""}
            </p>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
