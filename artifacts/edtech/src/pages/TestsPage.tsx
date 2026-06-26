import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BookOpenCheck, Clock, Target, ChevronRight, Search,
  Loader2, FileQuestion, BookOpen,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";

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

// ── Page ───────────────────────────────────────────────────────────────────────

export default function TestsPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

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

  // ── Derived data ─────────────────────────────────────────────────────────────

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

  // Group by subject → chapter
  const grouped = useMemo(() => {
    const groups: Record<string, { subject: string; chapters: Record<string, { chapter: string; quizzes: Quiz[] }> }> = {};
    const ungrouped: Quiz[] = [];

    for (const q of filtered) {
      const sid = q.subject_id ?? "__none__";
      const cid = q.chapter_id ?? "__none__";
      const subjectName = q.subject_id ? (subjectMap[q.subject_id] ?? "Unknown Subject") : "General";

      if (!groups[sid]) {
        groups[sid] = { subject: subjectName, chapters: {} };
      }
      if (!groups[sid].chapters[cid]) {
        const chapterName = q.chapter_id ? (chapterMap[q.chapter_id] ?? "Unknown Chapter") : "Subject Level";
        groups[sid].chapters[cid] = { chapter: chapterName, quizzes: [] };
      }
      groups[sid].chapters[cid].quizzes.push(q);
    }

    return { groups, ungrouped };
  }, [filtered, subjectMap, chapterMap]);

  const totalAvailable = quizzes.length;
  const uniqueTypes = useMemo(() => [...new Set(quizzes.map(q => q.type))], [quizzes]);

  // ── Render ────────────────────────────────────────────────────────────────────

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
            {Object.entries(grouped.groups).map(([sid, group]) => (
              <SubjectGroup
                key={sid}
                subjectName={group.subject}
                chapters={group.chapters}
                onStart={id => setLocation(`/exam/${id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ── Subject Group ──────────────────────────────────────────────────────────────

function SubjectGroup({
  subjectName,
  chapters,
  onStart,
}: {
  subjectName: string;
  chapters: Record<string, { chapter: string; quizzes: Quiz[] }>;
  onStart: (id: string) => void;
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
            onStart={onStart}
          />
        ))}
      </div>
    </section>
  );
}

// ── Chapter Group ──────────────────────────────────────────────────────────────

function ChapterGroup({
  chapterName,
  quizzes,
  onStart,
}: {
  chapterName: string;
  quizzes: Quiz[];
  onStart: (id: string) => void;
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
          <TestCard key={q.id} quiz={q} onStart={onStart} />
        ))}
      </div>
    </div>
  );
}

// ── Test Card ─────────────────────────────────────────────────────────────────

function TestCard({ quiz, onStart }: { quiz: Quiz; onStart: (id: string) => void }) {
  const typeLabel = TYPE_LABELS[quiz.type] ?? quiz.type;
  const typeColor = TYPE_COLORS[quiz.type] ?? "bg-muted text-muted-foreground";
  const questionCount = quiz.quiz_questions?.[0]?.count ?? 0;

  return (
    <Card className="bg-card hover:bg-muted/30 transition-colors group border-border">
      <CardContent className="p-4 flex flex-col gap-3 h-full">
        {/* Type badge */}
        <Badge className={`self-start text-xs border ${typeColor}`}>
          {typeLabel}
        </Badge>

        {/* Title */}
        <p className="font-semibold text-sm leading-snug flex-1 group-hover:text-primary transition-colors">
          {quiz.title}
        </p>

        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {quiz.duration_minutes} min
          </span>
          <span className="flex items-center gap-1">
            <Target className="w-3.5 h-3.5" />
            Pass {quiz.passing_score}%
          </span>
          {questionCount > 0 && (
            <span className="flex items-center gap-1">
              <FileQuestion className="w-3.5 h-3.5" />
              {questionCount} Q
            </span>
          )}
        </div>

        {/* Start button */}
        <Button
          size="sm"
          className="w-full mt-auto"
          onClick={() => onStart(quiz.id)}
        >
          Start Test <ChevronRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}
