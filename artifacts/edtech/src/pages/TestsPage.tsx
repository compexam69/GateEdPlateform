import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  BookOpenCheck, Clock, Target, ChevronRight, Search,
  Loader2, FileQuestion, BookOpen, CheckCircle, XCircle,
  RotateCcw, Trophy, History, Medal, Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Quiz {
  id: string;
  title: string;
  type: string;
  subject_id: string | null;
  chapter_id: string | null;
  duration_minutes: number;
  passing_score: number;
  max_attempts: number;
  is_active: boolean;
  quiz_questions: { count: number }[];
}

interface AttemptHistory {
  attempt_id: string;
  quiz_id: string;
  quiz_title: string;
  score: number;
  total_marks: number;
  accuracy: number;
  passed: boolean;
  submitted_at: string;
}

interface QuizHistory {
  bestAccuracy: number;
  passed: boolean;
  attempts: number;
  bestAttemptId: string;
  lastSubmittedAt: string;
}

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  accuracy: number;
  rank: number;
  is_current_user: boolean;
}

interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  current_user_rank: { rank: number; accuracy: number } | null;
  total_participants: number;
}

interface Subject { id: string; title: string; }
interface Chapter { id: string; title: string; subject_id: string; }

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  chapter_test: "Chapter Test",
  subject_test: "Subject Test",
  grand_test: "Grand Test",
  topic_test: "Topic Test",
  dpp: "DPP",
  pyq: "PYQ",
  lecture_quiz: "Lecture Quiz",
};

const TYPE_COLORS: Record<string, string> = {
  chapter_test: "bg-blue-500/15 text-blue-400 border-blue-800/30",
  subject_test: "bg-violet-500/15 text-violet-400 border-violet-800/30",
  grand_test: "bg-amber-500/15 text-amber-400 border-amber-800/30",
  topic_test: "bg-emerald-500/15 text-emerald-400 border-emerald-800/30",
  dpp: "bg-pink-500/15 text-pink-400 border-pink-800/30",
  pyq: "bg-cyan-500/15 text-cyan-400 border-cyan-800/30",
  lecture_quiz: "bg-slate-500/15 text-slate-400 border-slate-800/30",
};

const RANK_MEDALS: Record<number, { icon: React.ReactNode; color: string }> = {
  1: { icon: <Medal className="w-4 h-4" />, color: "text-amber-400" },
  2: { icon: <Medal className="w-4 h-4" />, color: "text-slate-400" },
  3: { icon: <Medal className="w-4 h-4" />, color: "text-amber-700" },
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function TestsPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [leaderboardQuiz, setLeaderboardQuiz] = useState<{ id: string; title: string } | null>(null);

  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ["tests-page-subjects"],
    queryFn: async () => {
      const { data } = await supabase
        .from("subjects").select("id, title").order("order_index");
      return data ?? [];
    },
  });

  const { data: chapters = [] } = useQuery<Chapter[]>({
    queryKey: ["tests-page-chapters"],
    queryFn: async () => {
      const { data } = await supabase
        .from("chapters").select("id, title, subject_id").order("order_index");
      return data ?? [];
    },
  });

  const { data: quizzes = [], isLoading } = useQuery<Quiz[]>({
    queryKey: ["tests-page-quizzes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("quizzes")
        .select("id, title, type, subject_id, chapter_id, duration_minutes, passing_score, max_attempts, is_active, quiz_questions(count)")
        .contains("allowed_roles", ["student"])
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      return (data ?? []) as Quiz[];
    },
  });

  const { data: historyRaw = [] } = useQuery<AttemptHistory[]>({
    queryKey: ["tests-page-history"],
    queryFn: async () => (await apiFetch("/exam/history")) as AttemptHistory[],
    staleTime: 30_000,
  });

  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["leaderboard", leaderboardQuiz?.id],
    queryFn: async () =>
      (await apiFetch(`/quizzes/${leaderboardQuiz!.id}/leaderboard`)) as LeaderboardResponse,
    enabled: !!leaderboardQuiz,
    staleTime: 60_000,
  });

  // Build per-quiz history summary
  const historyMap = useMemo<Record<string, QuizHistory>>(() => {
    const map: Record<string, QuizHistory> = {};
    for (const a of historyRaw) {
      const existing = map[a.quiz_id];
      if (!existing || a.accuracy > existing.bestAccuracy) {
        map[a.quiz_id] = {
          bestAccuracy: a.accuracy,
          passed: a.passed,
          attempts: (existing?.attempts ?? 0) + 1,
          bestAttemptId: a.attempt_id,
          lastSubmittedAt: a.submitted_at,
        };
      } else {
        existing.attempts++;
        if (new Date(a.submitted_at) > new Date(existing.lastSubmittedAt)) {
          existing.lastSubmittedAt = a.submitted_at;
        }
      }
    }
    return map;
  }, [historyRaw]);

  const subjectMap = useMemo(
    () => Object.fromEntries(subjects.map(s => [s.id, s.title])),
    [subjects]
  );
  const chapterMap = useMemo(
    () => Object.fromEntries(chapters.map(c => [c.id, c.title])),
    [chapters]
  );

  const filtered = useMemo(() => {
    let list = quizzes;
    if (typeFilter !== "all") list = list.filter(q => q.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.subject_id && subjectMap[t.subject_id]?.toLowerCase().includes(q)) ||
        (t.chapter_id && chapterMap[t.chapter_id]?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [quizzes, typeFilter, search, subjectMap, chapterMap]);

  const grouped = useMemo(() => {
    const groups: Record<string, { subject: string; chapters: Record<string, { chapter: string; quizzes: Quiz[] }> }> = {};
    for (const q of filtered) {
      const sid = q.subject_id ?? "__none__";
      const cid = q.chapter_id ?? "__none__";
      const subjectName = q.subject_id ? (subjectMap[q.subject_id] ?? "Unknown Subject") : "General";
      if (!groups[sid]) groups[sid] = { subject: subjectName, chapters: {} };
      if (!groups[sid].chapters[cid]) {
        const chapterName = q.chapter_id ? (chapterMap[q.chapter_id] ?? "Unknown Chapter") : "Subject Level";
        groups[sid].chapters[cid] = { chapter: chapterName, quizzes: [] };
      }
      groups[sid].chapters[cid].quizzes.push(q);
    }
    return groups;
  }, [filtered, subjectMap, chapterMap]);

  const totalAvailable = quizzes.length;
  const totalAttempted = Object.keys(historyMap).length;
  const totalPassed = Object.values(historyMap).filter(h => h.passed).length;
  const uniqueTypes = useMemo(() => [...new Set(quizzes.map(q => q.type))], [quizzes]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <BookOpenCheck className="w-7 h-7 text-primary" />
            Tests
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {totalAvailable} test{totalAvailable !== 1 ? "s" : ""} available — attempt anytime, no prerequisites.
          </p>
        </div>

        {/* Progress summary strip */}
        {historyRaw.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <History className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Attempted</span>
              <span className="font-semibold text-foreground">{totalAttempted}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-muted-foreground">Passed</span>
              <span className="font-semibold text-foreground">{totalPassed}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <Target className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground">Total attempts</span>
              <span className="font-semibold text-foreground">{historyRaw.length}</span>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search tests…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {uniqueTypes.length > 1 && (
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {uniqueTypes.map(t => (
                  <SelectItem key={t} value={t}>{TYPE_LABELS[t] ?? t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground gap-3">
            <FileQuestion className="w-14 h-14 opacity-25" />
            <div>
              <p className="font-medium">No tests found</p>
              <p className="text-sm mt-0.5">
                {totalAvailable === 0
                  ? "Your admin hasn't published any tests yet."
                  : "Try clearing your search or filter."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([sid, group]) => (
              <SubjectGroup
                key={sid}
                subjectName={group.subject}
                chapters={group.chapters}
                historyMap={historyMap}
                onStart={id => setLocation(`/exam/${id}`)}
                onViewResult={attemptId => setLocation(`/exam/results/${attemptId}`)}
                onLeaderboard={(id, title) => setLeaderboardQuiz({ id, title })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Leaderboard modal */}
      <Dialog open={!!leaderboardQuiz} onOpenChange={open => { if (!open) setLeaderboardQuiz(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              Leaderboard
            </DialogTitle>
            {leaderboardQuiz && (
              <p className="text-sm text-muted-foreground truncate">{leaderboardQuiz.title}</p>
            )}
          </DialogHeader>

          {leaderboardLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !leaderboardData || leaderboardData.total_participants === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-3">
              <Users className="w-12 h-12 opacity-20" />
              <p className="text-sm">No one has attempted this test yet. Be the first!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Participant count */}
              <p className="text-xs text-muted-foreground text-right">
                {leaderboardData.total_participants} participant{leaderboardData.total_participants !== 1 ? "s" : ""}
              </p>

              {/* Your rank (if outside top 10) */}
              {leaderboardData.current_user_rank &&
                leaderboardData.leaderboard.filter(r => r.is_current_user).length > 0 &&
                !leaderboardData.leaderboard.slice(0, 10).some(r => r.is_current_user) && (
                <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Your rank</span>
                  <span className="font-semibold text-primary">
                    #{leaderboardData.current_user_rank.rank} · {Math.round(leaderboardData.current_user_rank.accuracy)}%
                  </span>
                </div>
              )}

              {/* Ranked list */}
              <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                {leaderboardData.leaderboard.map((entry, idx) => {
                  const medal = RANK_MEDALS[entry.rank];
                  const isSeparator =
                    !leaderboardData.leaderboard.slice(0, 10).some(r => r.is_current_user) &&
                    idx === 10;
                  return (
                    <div key={entry.user_id}>
                      {isSeparator && (
                        <div className="px-3 py-1 text-center text-xs text-muted-foreground bg-muted/30">
                          · · ·
                        </div>
                      )}
                      <div className={cn(
                        "flex items-center gap-3 px-3 py-2.5 text-sm",
                        entry.is_current_user && "bg-primary/8",
                      )}>
                        {/* Rank */}
                        <span className={cn(
                          "w-8 text-center font-bold shrink-0",
                          medal ? medal.color : "text-muted-foreground text-xs",
                        )}>
                          {medal ? medal.icon : `#${entry.rank}`}
                        </span>

                        {/* Name */}
                        <span className={cn(
                          "flex-1 truncate",
                          entry.is_current_user ? "font-semibold text-primary" : "text-foreground",
                        )}>
                          {entry.display_name}
                          {entry.is_current_user && (
                            <span className="ml-1.5 text-xs text-primary/70">(you)</span>
                          )}
                        </span>

                        {/* Score */}
                        <span className={cn(
                          "font-semibold shrink-0",
                          entry.accuracy >= 60 ? "text-success" : "text-muted-foreground",
                        )}>
                          {Math.round(entry.accuracy)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// ── Subject Group ──────────────────────────────────────────────────────────────

function SubjectGroup({
  subjectName, chapters, historyMap, onStart, onViewResult, onLeaderboard,
}: {
  subjectName: string;
  chapters: Record<string, { chapter: string; quizzes: Quiz[] }>;
  historyMap: Record<string, QuizHistory>;
  onStart: (id: string) => void;
  onViewResult: (attemptId: string) => void;
  onLeaderboard: (id: string, title: string) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-primary shrink-0" />
        <h2 className="text-base font-semibold">{subjectName}</h2>
        <div className="flex-1 h-px bg-border ml-2" />
      </div>
      <div className="space-y-5">
        {Object.entries(chapters).map(([cid, group]) => (
          <ChapterGroup
            key={cid}
            chapterName={group.chapter}
            quizzes={group.quizzes}
            historyMap={historyMap}
            onStart={onStart}
            onViewResult={onViewResult}
            onLeaderboard={onLeaderboard}
          />
        ))}
      </div>
    </section>
  );
}

// ── Chapter Group ──────────────────────────────────────────────────────────────

function ChapterGroup({
  chapterName, quizzes, historyMap, onStart, onViewResult, onLeaderboard,
}: {
  chapterName: string;
  quizzes: Quiz[];
  historyMap: Record<string, QuizHistory>;
  onStart: (id: string) => void;
  onViewResult: (attemptId: string) => void;
  onLeaderboard: (id: string, title: string) => void;
}) {
  const isSubjectLevel = chapterName === "Subject Level";
  return (
    <div className="space-y-2">
      {!isSubjectLevel && (
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pl-1">
          {chapterName}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {quizzes.map(q => (
          <TestCard
            key={q.id}
            quiz={q}
            history={historyMap[q.id] ?? null}
            onStart={onStart}
            onViewResult={onViewResult}
            onLeaderboard={onLeaderboard}
          />
        ))}
      </div>
    </div>
  );
}

// ── Test Card ─────────────────────────────────────────────────────────────────

function TestCard({
  quiz, history, onStart, onViewResult, onLeaderboard,
}: {
  quiz: Quiz;
  history: QuizHistory | null;
  onStart: (id: string) => void;
  onViewResult: (attemptId: string) => void;
  onLeaderboard: (id: string, title: string) => void;
}) {
  const typeLabel = TYPE_LABELS[quiz.type] ?? quiz.type;
  const typeColor = TYPE_COLORS[quiz.type] ?? "bg-muted text-muted-foreground";
  const questionCount = quiz.quiz_questions?.[0]?.count ?? 0;
  const hasHistory = !!history;
  const isPassed = hasHistory && history.passed;

  return (
    <Card className={cn(
      "bg-card hover:bg-muted/30 transition-colors group border-border flex flex-col",
      isPassed && "border-success/30",
    )}>
      <CardContent className="p-4 flex flex-col gap-3 h-full">
        {/* Top row: type badge + pass indicator */}
        <div className="flex items-center justify-between gap-2">
          <Badge className={`self-start text-xs border ${typeColor}`}>
            {typeLabel}
          </Badge>
          {hasHistory && (
            <span className={cn(
              "flex items-center gap-1 text-xs font-medium shrink-0",
              isPassed ? "text-success" : "text-destructive",
            )}>
              {isPassed ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              {isPassed ? "Passed" : "Failed"}
            </span>
          )}
        </div>

        {/* Title */}
        <p className="font-semibold text-sm leading-snug flex-1 group-hover:text-primary transition-colors">
          {quiz.title}
        </p>

        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />{quiz.duration_minutes} min
          </span>
          <span className="flex items-center gap-1">
            <Target className="w-3.5 h-3.5" />Pass {quiz.passing_score}%
          </span>
          {questionCount > 0 && (
            <span className="flex items-center gap-1">
              <FileQuestion className="w-3.5 h-3.5" />{questionCount} Q
            </span>
          )}
        </div>

        {/* History strip */}
        {hasHistory && (
          <div className="rounded-md bg-muted/40 border border-border px-3 py-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Best score</span>
              <span className={cn(
                "font-semibold",
                history.bestAccuracy >= quiz.passing_score ? "text-success" : "text-destructive",
              )}>
                {Math.round(history.bestAccuracy)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{history.attempts} attempt{history.attempts !== 1 ? "s" : ""}</span>
              <button
                className="underline underline-offset-2 hover:text-foreground transition-colors"
                onClick={() => onViewResult(history.bestAttemptId)}
              >
                View results
              </button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 mt-auto">
          <Button
            size="sm"
            variant={hasHistory ? "outline" : "default"}
            className="flex-1"
            onClick={() => onStart(quiz.id)}
          >
            {hasHistory ? (
              <><RotateCcw className="w-3.5 h-3.5 mr-1.5" />Retake</>
            ) : (
              <>Start Test <ChevronRight className="w-3.5 h-3.5 ml-1" /></>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 px-2.5"
            title="Leaderboard"
            onClick={() => onLeaderboard(quiz.id, quiz.title)}
          >
            <Trophy className="w-4 h-4 text-amber-400" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
