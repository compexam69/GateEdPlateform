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

  // Refetch stats when sessions complete (widget saves them, but page needs fresh data)
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

  return (
    <AppLayout>
      <div className="flex flex-col items-center min-h-[calc(100vh-8rem)]">
        <div className="w-full max-w-md space-y-8 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Pomodoro Timer</h1>
            <p className="text-muted-foreground text-sm mt-1">Stay focused, study smarter.</p>
          </div>

          <div className="flex justify-center gap-2 flex-wrap">
            {(["focus", "short", "long", "custom"] as PomodoroMode[]).map((m) => {
              const Icon = MODE_ICONS[m];
              return (
                <Button
                  key={m}
                  variant={mode === m ? "default" : "outline"}
                  size="sm"
                  onClick={() => switchMode(m)}
                  className="gap-1.5"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {POMODORO_LABELS[m]}
                </Button>
              );
            })}
          </div>

          {mode === "custom" && (
            <div className="flex justify-center">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Duration:</span>
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
                <span className="text-sm text-muted-foreground">min</span>
              </div>
            </div>
          )}

          {mode === "focus" && (
            <div className="flex justify-center">
              <Popover open={topicPickerOpen} onOpenChange={setTopicPickerOpen}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border text-sm text-muted-foreground hover:border-primary hover:text-foreground transition-colors">
                    <Tag className="w-3.5 h-3.5" />
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
                          <div className="font-medium">{t.title}</div>
                          <div className="text-xs text-muted-foreground">{t.chapter_title}</div>
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="flex flex-col items-center">
            <div className="relative w-64 h-64 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90 absolute inset-0" viewBox="0 0 260 260">
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
                <div className="text-6xl font-bold font-mono tracking-tighter">
                  {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
                </div>
                <div className={`text-sm font-medium mt-1 ${MODE_COLOR[mode]}`}>{POMODORO_LABELS[mode]}</div>
                {selectedTopicTitle && mode === "focus" && (
                  <div className="text-xs text-muted-foreground mt-1 max-w-[160px] truncate">{selectedTopicTitle}</div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 mt-6">
              <Button size="icon" variant="outline" className="w-12 h-12 rounded-full" onClick={handleReset}>
                <RotateCcw className="w-5 h-5" />
              </Button>
              <button
                className="w-16 h-16 rounded-full shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
                style={{ backgroundColor: MODE_BG[mode] }}
                onClick={handleToggle}
              >
                {isRunning ? (
                  <svg className="w-7 h-7 text-white fill-white" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                ) : (
                  <svg className="w-7 h-7 text-white fill-white ml-0.5" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
                )}
              </button>
              <div className="w-12 h-12" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-card text-center">
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-primary">{sessionCount}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Today's Sessions</div>
              </CardContent>
            </Card>
            <Card className="bg-card text-center">
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-secondary">
                  {stats ? (stats.today_minutes ?? 0) : 0}m
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Focus Today</div>
              </CardContent>
            </Card>
            <Card className="bg-card text-center">
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-warning">{stats?.streak_days ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Day Streak</div>
              </CardContent>
            </Card>
          </div>

          {/* Focus Master Badge */}
          {(stats?.streak_days ?? 0) >= 7 && (
            <Card className="bg-warning/5 border-warning/30">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center shrink-0">
                  <Trophy className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-warning">Focus Master</p>
                  <p className="text-xs text-muted-foreground">
                    {stats!.streak_days}-day streak achieved. Outstanding dedication!
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {mode === "focus" && (
            <Card className="bg-card/50 border-dashed">
              <CardContent className="p-4 text-center">
                <Clock className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Complete 4 focus sessions per day to maintain your streak.
                  {stats?.streak_days ? ` You're on a ${stats.streak_days}-day streak!` : " Start your first session!"}
                  {(stats?.streak_days ?? 0) > 0 && (stats?.streak_days ?? 0) < 7 && (
                    <span className="text-primary"> {7 - stats!.streak_days} more days to earn Focus Master.</span>
                  )}
                </p>
                {isRunning && (
                  <p className="text-xs text-primary mt-2 font-medium">
                    Timer continues even when you navigate away.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
