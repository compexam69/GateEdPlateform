import { create } from "zustand";

export type PomodoroMode = "focus" | "short" | "long";

export const POMODORO_DURATIONS: Record<PomodoroMode, number> = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60,
};

export const POMODORO_LABELS: Record<PomodoroMode, string> = {
  focus: "Focus",
  short: "Short Break",
  long: "Long Break",
};

interface PomodoroState {
  mode: PomodoroMode;
  timeLeft: number;
  isRunning: boolean;
  startTime: number | null;
  selectedTopicId: string | null;
  selectedTopicTitle: string | null;
  sessionCount: number;

  setMode: (mode: PomodoroMode) => void;
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
  timeLeft: POMODORO_DURATIONS.focus,
  isRunning: false,
  startTime: null,
  selectedTopicId: null,
  selectedTopicTitle: null,
  sessionCount: 0,

  setMode: (mode) => set({ mode, timeLeft: POMODORO_DURATIONS[mode], isRunning: false, startTime: null }),
  setTimeLeft: (t) => set(state => ({ timeLeft: typeof t === "function" ? t(state.timeLeft) : t })),
  setIsRunning: (isRunning) => set({ isRunning }),
  setStartTime: (startTime) => set({ startTime }),
  setSelectedTopic: (selectedTopicId, selectedTopicTitle) => set({ selectedTopicId, selectedTopicTitle }),
  incrementSessionCount: () => set(state => ({ sessionCount: state.sessionCount + 1 })),
  reset: () => set(state => ({ timeLeft: POMODORO_DURATIONS[state.mode], isRunning: false, startTime: null })),
  start: () => {
    const state = get();
    set({ isRunning: true, startTime: state.startTime ?? Date.now() });
  },
  pause: () => set({ isRunning: false }),
}));
