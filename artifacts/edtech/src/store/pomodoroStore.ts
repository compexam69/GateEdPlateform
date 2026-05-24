import { create } from "zustand";

export type PomodoroMode = "focus" | "short" | "long" | "custom";

export const POMODORO_DURATIONS: Record<Exclude<PomodoroMode, "custom">, number> = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60,
};

export const POMODORO_LABELS: Record<PomodoroMode, string> = {
  focus: "Focus",
  short: "Short Break",
  long: "Long Break",
  custom: "Custom",
};

export function getDurationForMode(mode: PomodoroMode, customMinutes: number): number {
  if (mode === "custom") return customMinutes * 60;
  return POMODORO_DURATIONS[mode];
}

interface PomodoroState {
  mode: PomodoroMode;
  customMinutes: number;
  timeLeft: number;
  isRunning: boolean;
  startTime: number | null;
  selectedTopicId: string | null;
  selectedTopicTitle: string | null;
  sessionCount: number;

  setMode: (mode: PomodoroMode) => void;
  setCustomMinutes: (minutes: number) => void;
  setTimeLeft: (t: number | ((prev: number) => number)) => void;
  setIsRunning: (v: boolean) => void;
  setStartTime: (t: number | null) => void;
  setSelectedTopic: (id: string | null, title: string | null) => void;
  incrementSessionCount: () => void;
  reset: () => void;
  start: () => void;
  pause: () => void;
}

export const usePomodoroStore = create<PomodoroState>((set, get) => ({
  mode: "focus",
  customMinutes: 20,
  timeLeft: POMODORO_DURATIONS.focus,
  isRunning: false,
  startTime: null,
  selectedTopicId: null,
  selectedTopicTitle: null,
  sessionCount: 0,

  setMode: (mode) => {
    const state = get();
    set({ mode, timeLeft: getDurationForMode(mode, state.customMinutes), isRunning: false, startTime: null });
  },
  setCustomMinutes: (customMinutes) => {
    const mins = Math.max(1, Math.min(120, customMinutes));
    const state = get();
    set({ customMinutes: mins, ...(state.mode === "custom" ? { timeLeft: mins * 60 } : {}) });
  },
  setTimeLeft: (t) => set(state => ({ timeLeft: typeof t === "function" ? t(state.timeLeft) : t })),
  setIsRunning: (isRunning) => set({ isRunning }),
  setStartTime: (startTime) => set({ startTime }),
  setSelectedTopic: (selectedTopicId, selectedTopicTitle) => set({ selectedTopicId, selectedTopicTitle }),
  incrementSessionCount: () => set(state => ({ sessionCount: state.sessionCount + 1 })),
  reset: () => {
    const state = get();
    set({ timeLeft: getDurationForMode(state.mode, state.customMinutes), isRunning: false, startTime: null });
  },
  start: () => {
    const state = get();
    set({ isRunning: true, startTime: state.startTime ?? Date.now() });
  },
  pause: () => set({ isRunning: false }),
}));
