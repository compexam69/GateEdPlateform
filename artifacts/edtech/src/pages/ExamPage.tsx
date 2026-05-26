import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Pause, Play, ChevronLeft, ChevronRight, AlertTriangle, RotateCcw, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStartExam, useSubmitExam } from "@workspace/api-client-react";
import type { ExamSession, Question } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { MathText } from "@/components/MathText";
import { playChime } from "@/lib/playChime";
import { saveDraftIdb, loadDraftIdb, clearDraftIdb, type DraftState } from "@/lib/examDraftDb";
import { apiFetch } from "@/lib/api";

type QuestionStatus = "not-visited" | "unanswered" | "answered" | "marked" | "answered-marked";

interface QuestionState {
  question: Question;
  selectedOption: string | null;
  isMarked: boolean;
  timeSpentMs: number;
  status: QuestionStatus;
}


export default function ExamPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [session, setSession] = useState<ExamSession | null>(null);
  const [questionStates, setQuestionStates] = useState<QuestionState[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseCount, setPauseCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState<string | null>(null);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);

  const questionStartTime = useRef(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionRef = useRef<ExamSession | null>(null);
  const questionStatesRef = useRef<QuestionState[]>([]);
  const currentIdxRef = useRef(0);
  const timeLeftRef = useRef(0);
  const pauseCountRef = useRef(0);
  const touchStartX = useRef<number | null>(null);

  const startExam = useStartExam();
  const submitExam = useSubmitExam();

  // Keep refs in sync for use inside closures
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { questionStatesRef.current = questionStates; }, [questionStates]);
  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);
  useEffect(() => { pauseCountRef.current = pauseCount; }, [pauseCount]);

  // Save draft whenever answers change
  useEffect(() => {
    if (!quizId || !session || loading) return;
    const d: DraftState = {
      quizId,
      attempt_id: session.attempt_id,
      questions: questionStates.map(qs => ({
        question_id: qs.question.id,
        selectedOption: qs.selectedOption,
        isMarked: qs.isMarked,
        timeSpentMs: qs.timeSpentMs,
        status: qs.status,
      })),
      currentIdx,
      timeLeft,
      pauseCount,
      savedAt: Date.now(),
    };
    void saveDraftIdb(d);
  }, [questionStates, currentIdx, timeLeft, pauseCount, quizId, session, loading]);

  // Check for existing draft on mount (async IndexedDB)
  useEffect(() => {
    if (!quizId) return;
    loadDraftIdb(quizId).then(existing => {
      if (existing) {
        setDraft(existing);
        setShowResumeBanner(true);
      }
    });
  }, [quizId]);

  const handleSubmit = useCallback(async () => {
    const s = sessionRef.current;
    const qs = questionStatesRef.current;
    if (!s || submitting) return;
    setSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);

    const answers = qs.map(q => ({
      question_id: q.question.id,
      selected_option: q.selectedOption ?? undefined,
      time_spent_ms: q.timeSpentMs,
      is_marked_for_review: q.isMarked,
    }));

    if (quizId) void clearDraftIdb(quizId);

    submitExam.mutate(
      { data: { attempt_id: s.attempt_id, answers } },
      {
        onSuccess: (result: { attempt_id: string }) => {
          setLocation(`/exam/results/${result.attempt_id}`);
        },
        onError: (err: unknown) => {
          toast({ title: "Submit failed", description: (err as Error)?.message, variant: "destructive" });
          setSubmitting(false);
        },
      }
    );
  }, [submitting, submitExam, setLocation, toast, quizId]);

  function initExam(data: ExamSession, savedDraft?: DraftState) {
    setSession(data);
    sessionRef.current = data;

    const baseQuestions: QuestionState[] = (data.questions ?? []).map((q: Question, i: number) => ({
      question: q,
      selectedOption: null,
      isMarked: false,
      timeSpentMs: 0,
      status: i === 0 ? "unanswered" : "not-visited",
    }));

    if (savedDraft) {
      // Restore saved answers
      const restored = baseQuestions.map((qs) => {
        const saved = savedDraft.questions.find(sq => sq.question_id === qs.question.id);
        if (!saved) return qs;
        return { ...qs, selectedOption: saved.selectedOption, isMarked: saved.isMarked, timeSpentMs: saved.timeSpentMs, status: saved.status };
      });
      setQuestionStates(restored);
      setCurrentIdx(savedDraft.currentIdx);
      setTimeLeft(savedDraft.timeLeft);
      setPauseCount(savedDraft.pauseCount);
    } else {
      setQuestionStates(baseQuestions);
      setTimeLeft((data.duration_minutes ?? 30) * 60);
    }

    setLoading(false);
    questionStartTime.current = Date.now();
  }

  function startFreshExam() {
    if (!quizId) return;
    void clearDraftIdb(quizId);
    setShowResumeBanner(false);
    setDraft(null);
    startExam.mutate(
      { data: { quiz_id: quizId } },
      {
        onSuccess: (data: ExamSession) => initExam(data),
        onError: (err: unknown) => {
          setError((err as Error)?.message || "Failed to start exam");
          setLoading(false);
        },
      }
    );
  }

  function resumeFromDraft() {
    if (!quizId || !draft) return;
    setShowResumeBanner(false);
    startExam.mutate(
      { data: { quiz_id: quizId } },
      {
        onSuccess: (data: ExamSession) => initExam(data, draft),
        onError: (err: unknown) => {
          setError((err as Error)?.message || "Failed to start exam");
          setLoading(false);
        },
      }
    );
  }

  useEffect(() => {
    if (!quizId) return;
    loadDraftIdb(quizId).then(existing => {
      if (!existing) {
        // Start fresh immediately if no draft
        startExam.mutate(
          { data: { quiz_id: quizId } },
          {
            onSuccess: (data: ExamSession) => initExam(data),
            onError: (err: unknown) => {
              setError((err as Error)?.message || "Failed to start exam");
              setLoading(false);
            },
          }
        );
      }
    });
  }, [quizId]);

  // Timer
  useEffect(() => {
    if (loading || !session) return;
    timerRef.current = setInterval(() => {
      if (isPaused) return;
      setTimeLeft(t => {
        if (t <= 1) {
          handleSubmit();
          return 0;
        }
        if (t === 300) { setShowWarning("5 minutes remaining!"); playChime("break"); }
        if (t === 60) { setShowWarning("1 minute remaining!"); playChime("break"); }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading, session, isPaused, handleSubmit]);

  // Server-time sync: poll every 60s to detect and correct clock drift >30s
  useEffect(() => {
    if (loading || !session) return;
    const poll = setInterval(async () => {
      try {
        const data = await apiFetch(`/exam/time-remaining/${session.attempt_id}`) as { time_remaining_seconds: number };
        const drift = Math.abs(data.time_remaining_seconds - timeLeftRef.current);
        if (drift > 30) setTimeLeft(data.time_remaining_seconds);
      } catch { /* silent — never interrupt the exam */ }
    }, 60_000);
    return () => clearInterval(poll);
  }, [loading, session]);

  useEffect(() => {
    if (showWarning) {
      toast({ title: "Time Warning", description: showWarning, variant: "destructive" });
      setShowWarning(null);
    }
  }, [showWarning, toast]);

  // Auto-submit on prolonged network disconnect (>10 minutes)
  useEffect(() => {
    if (loading || !session) return;
    let offlineSince: number | null = null;

    const handleOffline = () => { offlineSince = Date.now(); };
    const handleOnline = () => { offlineSince = null; };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    const disconnectCheck = setInterval(() => {
      if (offlineSince && Date.now() - offlineSince > 10 * 60 * 1000) {
        toast({ title: "Auto-submitted", description: "Exam submitted after 10 minutes offline.", variant: "destructive" });
        handleSubmit();
      }
    }, 30_000);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      clearInterval(disconnectCheck);
    };
  }, [loading, session, handleSubmit, toast]);

  // Tab-switch detection
  useEffect(() => {
    if (loading) return;
    const handleVisibility = () => {
      if (document.hidden) {
        setTabSwitchCount(c => {
          const next = c + 1;
          if (next === 1) {
            toast({ title: "Tab switch detected", description: "Stay on the exam tab. Further switches will be recorded.", variant: "destructive" });
          } else if (next >= 3) {
            toast({ title: "Multiple tab switches", description: `You have switched away ${next} times. This is recorded.`, variant: "destructive" });
          }
          return next;
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [loading, toast]);

  // Keyboard shortcuts
  useEffect(() => {
    if (loading || isPaused) return;
    const handleKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      const total = questionStatesRef.current.length;
      const idx = currentIdxRef.current;
      if (e.key === "ArrowRight" && idx < total - 1) {
        goToQuestion(idx + 1);
      } else if (e.key === "ArrowLeft" && idx > 0) {
        goToQuestion(idx - 1);
      } else if (e.key === "m" || e.key === "M") {
        toggleMark();
      } else if (e.key === "Enter") {
        if (idx < total - 1) goToQuestion(idx + 1);
      } else if (["1", "2", "3", "4"].includes(e.key)) {
        const optKeys = Object.keys((questionStatesRef.current[idx]?.question?.options as Record<string, string>) ?? {});
        const opt = optKeys[parseInt(e.key) - 1];
        if (opt) selectOption(opt);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [loading, isPaused, currentIdx]);

  function updateCurrentTimeSpent() {
    const elapsed = Date.now() - questionStartTime.current;
    setQuestionStates(prev => prev.map((qs, i) =>
      i === currentIdx ? { ...qs, timeSpentMs: qs.timeSpentMs + elapsed } : qs
    ));
    questionStartTime.current = Date.now();
  }

  function goToQuestion(idx: number) {
    updateCurrentTimeSpent();
    setCurrentIdx(idx);
    currentIdxRef.current = idx;
    setQuestionStates(prev => prev.map((qs, i) => {
      if (i === idx && qs.status === "not-visited") {
        return { ...qs, status: "unanswered" };
      }
      return qs;
    }));
  }

  function selectOption(option: string) {
    setQuestionStates(prev => prev.map((qs, i) => {
      if (i !== currentIdx) return qs;
      const isMarked = qs.isMarked;
      return { ...qs, selectedOption: option, status: isMarked ? "answered-marked" : "answered" };
    }));
  }

  function toggleMark() {
    setQuestionStates(prev => prev.map((qs, i) => {
      if (i !== currentIdx) return qs;
      const isMarked = !qs.isMarked;
      let status: QuestionStatus = qs.status;
      if (qs.selectedOption) status = isMarked ? "answered-marked" : "answered";
      else status = isMarked ? "marked" : "unanswered";
      return { ...qs, isMarked, status };
    }));
  }

  function clearResponse() {
    setQuestionStates(prev => prev.map((qs, i) => {
      if (i !== currentIdx) return qs;
      const isMarked = qs.isMarked;
      return { ...qs, selectedOption: null, status: isMarked ? "marked" : "unanswered" };
    }));
  }

  function handlePause() {
    if (pauseCount >= 2) {
      toast({ title: "Pause limit reached", description: "You can only pause twice per exam.", variant: "destructive" });
      return;
    }
    setIsPaused(v => !v);
    if (!isPaused) setPauseCount(c => c + 1);
  }

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
      : `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const statusColor: Record<QuestionStatus, string> = {
    "not-visited": "bg-muted text-muted-foreground border-border",
    "unanswered": "bg-destructive/20 text-destructive border-destructive/30",
    "answered": "bg-success/20 text-success border-success/30",
    "marked": "bg-warning/20 text-warning border-warning/30",
    "answered-marked": "bg-warning/20 text-warning border-warning/30",
  };

  // Resume banner (before loading)
  if (showResumeBanner && draft) {
    const savedDate = new Date(draft.savedAt);
    const answered = draft.questions.filter(q => q.selectedOption).length;
    return (
      <div className="flex h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mx-auto">
            <RotateCcw className="w-8 h-8 text-warning" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Resume Exam?</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              You have an unfinished exam saved from{" "}
              <strong>{savedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>.
            </p>
            <p className="text-muted-foreground text-sm mt-1">
              {answered} question{answered !== 1 ? "s" : ""} answered · {formatTime(draft.timeLeft)} remaining
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={startFreshExam}>
              Start Fresh
            </Button>
            <Button onClick={resumeFromDraft}>
              Resume Exam
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-muted-foreground">Preparing your exam...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md px-4">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
          <h2 className="text-xl font-bold">Couldn't start exam</h2>
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={() => window.history.back()}>Go Back</Button>
        </div>
      </div>
    );
  }

  if (isPaused) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-6">
          <h2 className="text-3xl font-bold">Exam Paused</h2>
          <p className="text-muted-foreground">Take a short break. ({pauseCount}/2 pauses used)</p>
          <Button size="lg" onClick={() => setIsPaused(false)}>
            <Play className="w-5 h-5 mr-2" /> Resume Exam
          </Button>
        </div>
      </div>
    );
  }

  const qs = questionStates[currentIdx];
  if (!qs) return null;

  const answered = questionStates.filter(q => q.selectedOption).length;
  const notAnswered = questionStates.filter(q => !q.selectedOption && q.status !== "not-visited").length;
  const markedForReview = questionStates.filter(q => q.isMarked).length;
  const notVisited = questionStates.filter(q => q.status === "not-visited").length;

  return (
    <div
      className="min-h-screen bg-background flex flex-col select-none"
      onCopy={e => e.preventDefault()}
      onPaste={e => e.preventDefault()}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Header */}
      <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 sm:px-6 shrink-0">
        <div className="font-bold text-base hidden sm:block truncate max-w-xs">
          {session ? "Exam in Progress" : "Exam"}
        </div>
        <div className="flex items-center gap-4 mx-auto sm:mx-0">
          <div className={`font-mono text-xl font-bold ${timeLeft < 300 ? "text-destructive animate-pulse" : timeLeft < 600 ? "text-warning" : "text-primary"}`}>
            {formatTime(timeLeft)}
          </div>
          {tabSwitchCount > 0 && (
            <span className="text-xs text-destructive font-medium hidden sm:inline">
              {tabSwitchCount} switch{tabSwitchCount !== 1 ? "es" : ""} detected
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handlePause}>
            <Pause className="w-4 h-4 mr-1.5" /> Pause ({2 - pauseCount} left)
          </Button>
        </div>
        <Button variant="destructive" size="sm" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Submitting..." : "Submit"}
        </Button>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Main question area */}
        <main
          className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col"
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null) return;
            const delta = e.changedTouches[0].clientX - touchStartX.current;
            touchStartX.current = null;
            if (Math.abs(delta) < 50) return;
            if (delta < 0 && currentIdx < questionStates.length - 1) goToQuestion(currentIdx + 1);
            else if (delta > 0 && currentIdx > 0) goToQuestion(currentIdx - 1);
          }}
        >
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-lg font-bold">Question {currentIdx + 1} of {questionStates.length}</h2>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={qs.isMarked}
                onChange={toggleMark}
                className="w-4 h-4 rounded border-border accent-warning"
              />
              <span className="text-sm text-muted-foreground">Mark for Review <span className="text-muted-foreground/60 text-xs">(M)</span></span>
            </label>
          </div>

          <div className="prose prose-invert max-w-none mb-6 text-base leading-relaxed">
            <MathText text={qs.question.question_text} />
          </div>

          <div className="space-y-3">
            {Object.entries((qs.question.options as Record<string, string>) ?? {}).map(([key, value], optIdx) => {
              const isSelected = qs.selectedOption === key;
              return (
                <label
                  key={key}
                  className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted/60"
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${currentIdx}`}
                    checked={isSelected}
                    onChange={() => selectOption(key)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="font-semibold text-muted-foreground w-5 shrink-0">{key}.</span>
                  <span className="flex-1 min-w-0"><MathText text={value} /></span>
                  <span className="text-xs text-muted-foreground/40 shrink-0">{optIdx + 1}</span>
                </label>
              );
            })}
          </div>

          <div className="mt-6 flex justify-between border-t border-border pt-4">
            <Button
              variant="outline"
              onClick={() => goToQuestion(Math.max(0, currentIdx - 1))}
              disabled={currentIdx === 0}
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Prev
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={clearResponse} disabled={!qs.selectedOption}>
                Clear
              </Button>
              <Button
                onClick={() => goToQuestion(Math.min(questionStates.length - 1, currentIdx + 1))}
                disabled={currentIdx === questionStates.length - 1}
              >
                Save & Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>

          {/* Keyboard hint */}
          <p className="text-xs text-muted-foreground/50 text-center mt-4 hidden sm:block">
            Arrow keys to navigate · 1–4 to select option · M to mark · Enter to save & next
          </p>

          {/* Mobile Question Palette */}
          <div className="md:hidden mt-4 border-t border-border pt-3">
            <button
              onClick={() => setMobilePaletteOpen(v => !v)}
              className="w-full flex items-center justify-between text-sm font-medium py-1"
            >
              <span className="text-muted-foreground">
                Palette · <span className={answered === questionStates.length ? "text-success" : "text-foreground"}>{answered}/{questionStates.length}</span> answered
              </span>
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", mobilePaletteOpen && "rotate-180")} />
            </button>
            {mobilePaletteOpen && (
              <div className="mt-3 space-y-4 pb-2">
                <div className="grid grid-cols-6 gap-1.5">
                  {questionStates.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => { goToQuestion(i); setMobilePaletteOpen(false); }}
                      className={cn(
                        "h-9 rounded text-xs font-medium border transition-all",
                        statusColor[q.status],
                        i === currentIdx ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : ""
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-success/20 border border-success/30 shrink-0" /><span>{answered} Answered</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-destructive/20 border border-destructive/30 shrink-0" /><span>{notAnswered} Not Answered</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-warning/20 border border-warning/30 shrink-0" /><span>{markedForReview} Marked</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-muted border border-border shrink-0" /><span>{notVisited} Not Visited</span></div>
                </div>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? "Submitting..." : `Submit (${answered}/${questionStates.length})`}
                </Button>
              </div>
            )}
          </div>
        </main>

        {/* Sidebar palette — desktop only */}
        <aside className="hidden md:flex md:w-72 md:border-l border-border bg-card p-4 shrink-0 overflow-y-auto flex-col gap-4">
          <div>
            <p className="font-semibold mb-3 text-sm">Question Palette</p>
            <div className="grid grid-cols-5 gap-1.5">
              {questionStates.map((q, i) => (
                <button
                  key={i}
                  onClick={() => goToQuestion(i)}
                  className={`w-9 h-9 rounded text-xs font-medium border transition-all ${statusColor[q.status]} ${
                    i === currentIdx ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : ""
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-3 space-y-2 text-xs">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-success/20 border border-success/30 shrink-0"></div><span>{answered} Answered</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-destructive/20 border border-destructive/30 shrink-0"></div><span>{notAnswered} Not Answered</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-warning/20 border border-warning/30 shrink-0"></div><span>{markedForReview} Marked</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-muted border border-border shrink-0"></div><span>{notVisited} Not Visited</span></div>
          </div>

          <Button
            variant="destructive"
            className="w-full mt-auto"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Submitting..." : `Submit Exam (${answered}/${questionStates.length} answered)`}
          </Button>
        </aside>
      </div>
    </div>
  );
}
