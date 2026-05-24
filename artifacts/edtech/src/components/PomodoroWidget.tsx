import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Play, Pause, RotateCcw, Timer } from "lucide-react";
import { usePomodoroStore, POMODORO_DURATIONS, POMODORO_LABELS, type PomodoroMode } from "@/store/pomodoroStore";
import { useCreatePomodoroSession, getGetPomodoroStatsUrl } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { playChime } from "@/lib/playChime";

const MODE_BG: Record<PomodoroMode, string> = {
  focus: "bg-primary",
  short: "bg-secondary",
  long: "bg-accent",
};

const MODE_TEXT: Record<PomodoroMode, string> = {
  focus: "text-primary",
  short: "text-secondary",
  long: "text-accent",
};

export function PomodoroWidget() {
  const [location] = useLocation();
  const store = usePomodoroStore();
  const queryClient = useQueryClient();
  const createSession = useCreatePomodoroSession();

  const { mode, timeLeft, isRunning, startTime, selectedTopicId, sessionCount } = store;

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      store.setTimeLeft(t => t - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    if (timeLeft > 0 || !isRunning) return;

    store.setIsRunning(false);

    if (mode === "focus" && startTime) {
      createSession.mutate(
        {
          data: {
            duration_seconds: POMODORO_DURATIONS.focus,
            start_time: new Date(startTime).toISOString(),
            end_time: new Date().toISOString(),
            topic_context: selectedTopicId ?? undefined,
          },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [getGetPomodoroStatsUrl()] });
          },
        }
      );
      store.incrementSessionCount();
      playChime("end");
    } else {
      playChime("break");
    }

    store.reset();
  }, [timeLeft, isRunning]);

  const isOnPomodoroPage = location === "/pomodoro";
  const isActive = isRunning || timeLeft < POMODORO_DURATIONS[mode];

  if (isOnPomodoroPage || !isActive) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = (1 - timeLeft / POMODORO_DURATIONS[mode]) * 100;

  return (
    <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 select-none">
      <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden w-52">
        <div
          className={`h-1 transition-all duration-1000 ${MODE_BG[mode]}`}
          style={{ width: `${progress}%` }}
        />

        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {isRunning && (
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${MODE_BG[mode]}`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${MODE_BG[mode]}`} />
                </span>
              )}
              <Timer className={`w-3.5 h-3.5 ${MODE_TEXT[mode]}`} />
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${MODE_TEXT[mode]}`}>
                {POMODORO_LABELS[mode]}
              </span>
            </div>
            {sessionCount > 0 && (
              <span className="text-[10px] text-muted-foreground">{sessionCount} done</span>
            )}
          </div>

          <Link href="/pomodoro">
            <div className="text-3xl font-bold font-mono tracking-tighter cursor-pointer hover:opacity-80 transition-opacity">
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </div>
          </Link>

          {store.selectedTopicTitle && (
            <p className="text-[10px] text-muted-foreground truncate">{store.selectedTopicTitle}</p>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => (isRunning ? store.pause() : store.start())}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90 ${MODE_BG[mode]}`}
            >
              {isRunning ? (
                <><Pause className="w-3 h-3" /> Pause</>
              ) : (
                <><Play className="w-3 h-3" /> Resume</>
              )}
            </button>
            <button
              onClick={() => store.reset()}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Reset timer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
