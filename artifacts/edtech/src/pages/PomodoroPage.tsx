import { AppLayout } from "@/components/layout/AppLayout";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, Pause, RotateCcw, Coffee, Brain, Clock } from "lucide-react";
import { useCreatePomodoroSession } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { getPomodoroStats, getGetPomodoroStatsUrl } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const MODES = {
  focus: { label: "Focus", duration: 25 * 60, icon: Brain, color: "text-primary", bgColor: "hsl(var(--primary))" },
  short: { label: "Short Break", duration: 5 * 60, icon: Coffee, color: "text-secondary", bgColor: "hsl(var(--secondary))" },
  long: { label: "Long Break", duration: 15 * 60, icon: Coffee, color: "text-accent", bgColor: "hsl(var(--accent))" },
} as const;

type ModeKey = keyof typeof MODES;

export default function PomodoroPage() {
  const [mode, setMode] = useState<ModeKey>("focus");
  const [timeLeft, setTimeLeft] = useState(MODES.focus.duration);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const { toast } = useToast();

  const createSession = useCreatePomodoroSession();

  const { data: stats } = useQuery({
    queryKey: [getGetPomodoroStatsUrl()],
    queryFn: () => getPomodoroStats(),
    refetchInterval: 30000,
  });

  const ModeObj = MODES[mode];
  const progress = ((ModeObj.duration - timeLeft) / ModeObj.duration) * 100;
  const radius = 120;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (isRunning && timeLeft === 0) {
      setIsRunning(false);
      if (mode === "focus" && startTimeRef.current) {
        const durationSeconds = ModeObj.duration;
        createSession.mutate({
          data: {
            duration_seconds: durationSeconds,
            start_time: new Date(startTimeRef.current).toISOString(),
            end_time: new Date().toISOString(),
          },
        });
        setSessionCount(c => c + 1);
        toast({ title: "🎉 Session Complete!", description: "Great job! Take a break." });
      }
      startTimeRef.current = null;
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft, mode]);

  function toggleTimer() {
    if (!isRunning) {
      if (startTimeRef.current === null) startTimeRef.current = Date.now();
    }
    setIsRunning(v => !v);
  }

  function resetTimer() {
    setIsRunning(false);
    setTimeLeft(MODES[mode].duration);
    startTimeRef.current = null;
  }

  function switchMode(newMode: ModeKey) {
    setMode(newMode);
    setIsRunning(false);
    setTimeLeft(MODES[newMode].duration);
    startTimeRef.current = null;
  }

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

          <div className="flex justify-center gap-2">
            {(Object.entries(MODES) as [ModeKey, typeof MODES[ModeKey]][]).map(([key, m]) => {
              const Icon = m.icon;
              return (
                <Button
                  key={key}
                  variant={mode === key ? "default" : "outline"}
                  size="sm"
                  onClick={() => switchMode(key)}
                  className={`gap-1.5 ${mode === key ? "" : ""}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {m.label}
                </Button>
              );
            })}
          </div>

          <div className="flex flex-col items-center">
            <div className="relative w-64 h-64 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90 absolute inset-0" viewBox="0 0 260 260">
                <circle cx="130" cy="130" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
                <circle
                  cx="130" cy="130" r={radius}
                  fill="none"
                  stroke={ModeObj.bgColor}
                  strokeWidth="10"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - progress / 100)}
                  className="transition-all duration-1000 ease-linear"
                  strokeLinecap="round"
                />
              </svg>
              <div className="text-center z-10">
                <div className="text-6xl font-bold font-mono tracking-tighter">
                  {minutes.toString().padStart(2, "0")}:{seconds.toString().padStart(2, "0")}
                </div>
                <div className={`text-sm font-medium mt-1 ${ModeObj.color}`}>{ModeObj.label}</div>
              </div>
            </div>

            <div className="flex items-center gap-4 mt-6">
              <Button size="icon" variant="outline" className="w-12 h-12 rounded-full" onClick={resetTimer}>
                <RotateCcw className="w-5 h-5" />
              </Button>
              <Button
                size="icon"
                className={`w-16 h-16 rounded-full shadow-lg hover:scale-105 transition-transform`}
                style={{ backgroundColor: ModeObj.bgColor }}
                onClick={toggleTimer}
              >
                {isRunning ? <Pause className="w-7 h-7 text-white" /> : <Play className="w-7 h-7 ml-0.5 text-white" />}
              </Button>
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
                <div className="text-2xl font-bold text-warning flex items-center justify-center gap-1">
                  🔥 {stats?.streak_days ?? 0}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Day Streak</div>
              </CardContent>
            </Card>
          </div>

          {mode === "focus" && (
            <Card className="bg-card/50 border-dashed">
              <CardContent className="p-4 text-center">
                <Clock className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Complete 4 focus sessions per day to maintain your streak.
                  {stats?.streak_days ? ` You're on a ${stats.streak_days}-day streak!` : " Start your first session!"}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
