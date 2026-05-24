import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Play, Pause, RotateCcw, Timer } from "lucide-react";
import { usePomodoroStore, getDurationForMode, POMODORO_LABELS, type PomodoroMode } from "@/store/pomodoroStore";
import { useCreatePomodoroSession, getGetPomodoroStatsUrl } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { playChime } from "@/lib/playChime";

const MODE_BG: Record<PomodoroMode, string> = {
  focus: "bg-primary",
  short: "bg-secondary",
  long: "bg-accent",
  custom: "bg-primary",
};

const MODE_TEXT: Record<PomodoroMode, string> = {
  focus: "text-primary",
  short: "text-secondary",
  long: "text-accent",
  custom: "text-primary",
};

const PENDING_QUEUE_KEY = "pending_pomodoro_sessions";

interface PendingSession {
  duration_seconds: number;
  start_time: string;
  end_time: string;
  topic_context?: string;
}

function getPendingQueue(): PendingSession[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_QUEUE_KEY) ?? "[]") as PendingSession[];
  } catch { return []; }
}

function addToPendingQueue(session: PendingSession) {
  try {
    const queue = getPendingQueue();
    queue.push(session);
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue));
    // Register Background Sync if service worker supports it
    void navigator.serviceWorker?.ready.then(reg => {
      const syncReg = reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } };
      return syncReg.sync?.register("pomodoro-session-sync");
    }).catch(() => {});
  } catch { /* non-critical */ }
}

function clearPendingQueue() {
  try { localStorage.removeItem(PENDING_QUEUE_KEY); } catch { /* non-critical */ }
}

export function PomodoroWidget() {
  const [location] = useLocation();
  const store = usePomodoroStore();
  const queryClient = useQueryClient();
  const createSession = useCreatePomodoroSession();

  const { mode, customMinutes, timeLeft, isRunning, startTime, selectedTopicId, sessionCount } = store;
  const totalDuration = getDurationForMode(mode, customMinutes);

  // Retry pending offline sessions on mount and when back online
  useEffect(() => {
    function retryPending() {
      const pending = getPendingQueue();
      if (pending.length === 0) return;
      clearPendingQueue();
      for (const session of pending) {
        createSession.mutate(
          { data: session },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: [getGetPomodoroStatsUrl()] });
            },
            onError: () => {
              addToPendingQueue(session);
            },
          }
        );
      }
    }

    if (navigator.onLine) retryPending();
    window.addEventListener("online", retryPending);

    const handleSWMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string })?.type === "POMODORO_SYNC_RETRY") retryPending();
    };
    void navigator.serviceWorker?.addEventListener("message", handleSWMessage);

    return () => {
      window.removeEventListener("online", retryPending);
      void navigator.serviceWorker?.removeEventListener("message", handleSWMessage);
    };
  }, []);

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

    if ((mode === "focus" || mode === "custom") && startTime) {
      const sessionData: PendingSession = {
        duration_seconds: totalDuration,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date().toISOString(),
        topic_context: selectedTopicId ?? undefined,
      };
      createSession.mutate(
        { data: sessionData },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [getGetPomodoroStatsUrl()] });
          },
          onError: () => {
            addToPendingQueue(sessionData);
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
  const isActive = isRunning || timeLeft < totalDuration;

  if (isOnPomodoroPage || !isActive) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = totalDuration > 0 ? (1 - timeLeft / totalDuration) * 100 : 0;

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
