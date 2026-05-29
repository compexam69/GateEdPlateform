import { AppLayout } from "@/components/layout/AppLayout";
import { AdminBreadcrumb } from "@/components/layout/AdminBreadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2, ChevronDown, ChevronRight, QrCode, FileJson, BookOpen, HelpCircle, ExternalLink, FileText, Upload, Eye, Shield } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSubjects, getGetSubjectsUrl, getChapters, getGetChaptersUrl, getTopics, getGetTopicsUrl } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

const QUIZ_TYPES = [
  { value: "lecture_quiz", label: "Lecture Quiz" },
  { value: "dpp", label: "DPP (Daily Practice)" },
  { value: "pyq", label: "PYQ" },
  { value: "topic_test", label: "Topic Test" },
  { value: "chapter_test", label: "Chapter Test" },
  { value: "subject_test", label: "Subject Test" },
  { value: "grand_test", label: "Grand Test" },
];

type Quiz = {
  id: string;
  title: string;
  type: string;
  topic_id?: string | null;
  chapter_id?: string | null;
  subject_id?: string | null;
  passing_score: number;
  duration_minutes: number;
  negative_marking: number;
  max_attempts: number;
  is_active: boolean;
  allowed_roles: string[];
  creator_id?: string | null;
};

const ALL_ROLES = ["student", "admin", "super_admin"] as const;
type RoleId = typeof ALL_ROLES[number];

const ROLE_LABELS: Record<RoleId, string> = {
  student: "Students",
  admin: "Admins",
  super_admin: "Super Admins",
};

function visibilityLabel(roles: string[]): string {
  const hasStudent = roles.includes("student");
  const hasAdmin = roles.includes("admin");
  const hasSA = roles.includes("super_admin");
  if (hasStudent && hasAdmin && hasSA) return "All roles";
  if (hasStudent && hasAdmin) return "Students + Admins";
  if (hasStudent) return "Students only";
  if (hasAdmin && hasSA) return "Staff only";
  if (hasSA) return "Super Admin only";
  if (hasAdmin) return "Admins only";
  return "Restricted";
}

type Question = {
  id: string;
  quiz_id: string;
  question_text: string;
  options: Record<string, string>;
  correct_answer: string;
  explanation?: string;
  video_solution_url?: string;
  qr_code_url?: string;
  difficulty: number;
  order_index: number;
};

const QUIZZES_KEY = ["admin-quizzes"];

import { apiFetch } from "@/lib/api";

export default function AdminQuizzesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [expandedQuiz, setExpandedQuiz] = useState<string | null>(null);
  const [quizDialog, setQuizDialog] = useState<{ open: boolean; quiz?: Quiz }>({ open: false });
  const [questionDialog, setQuestionDialog] = useState<{ open: boolean; quizId?: string; question?: Question }>({ open: false });
  const [bulkDialog, setBulkDialog] = useState<{ open: boolean; quizId?: string }>({ open: false });
  const [qrDialog, setQrDialog] = useState<{ open: boolean; questionId?: string; currentUrl?: string }>({ open: false });
  const [saving, setSaving] = useState(false);

  const { data: quizzes = [], isLoading } = useQuery<Quiz[]>({
    queryKey: QUIZZES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("quizzes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function deleteQuiz(id: string) {
    if (!confirm("Delete this quiz and all its questions?")) return;
    await supabase.from("quizzes").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: QUIZZES_KEY });
    toast({ title: "Quiz deleted" });
  }

  async function deleteQuestion(id: string, quizId: string) {
    await supabase.from("quiz_questions").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["questions", quizId] });
    toast({ title: "Question deleted" });
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <AdminBreadcrumb pageName="Quiz & Question Editor" />
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Quiz & Question Editor</h1>
            <p className="text-muted-foreground mt-1">Create and manage quizzes, questions, and video solutions.</p>
          </div>
          <Button onClick={() => setQuizDialog({ open: true })}>
            <Plus className="w-4 h-4 mr-2" /> New Quiz
          </Button>
        </div>

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : quizzes.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No quizzes yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {quizzes.map(quiz => (
              <QuizRow
                key={quiz.id}
                quiz={quiz}
                expanded={expandedQuiz === quiz.id}
                onToggle={() => setExpandedQuiz(prev => prev === quiz.id ? null : quiz.id)}
                onEdit={() => setQuizDialog({ open: true, quiz })}
                onDelete={() => deleteQuiz(quiz.id)}
                onAddQuestion={() => setQuestionDialog({ open: true, quizId: quiz.id })}
                onEditQuestion={(q) => setQuestionDialog({ open: true, quizId: quiz.id, question: q })}
                onDeleteQuestion={(id) => deleteQuestion(id, quiz.id)}
                onBulkImport={() => setBulkDialog({ open: true, quizId: quiz.id })}
                onGenerateQr={(questionId, url) => setQrDialog({ open: true, questionId, currentUrl: url })}
                queryClient={queryClient}
              />
            ))}
          </div>
        )}
      </div>

      <QuizDialog
        open={quizDialog.open}
        quiz={quizDialog.quiz}
        onClose={() => setQuizDialog({ open: false })}
        onSaved={() => { queryClient.invalidateQueries({ queryKey: QUIZZES_KEY }); setQuizDialog({ open: false }); toast({ title: quizDialog.quiz ? "Quiz updated" : "Quiz created" }); }}
        saving={saving}
        setSaving={setSaving}
      />

      <QuestionDialog
        open={questionDialog.open}
        quizId={questionDialog.quizId}
        question={questionDialog.question}
        onClose={() => setQuestionDialog({ open: false })}
        onSaved={() => { queryClient.invalidateQueries({ queryKey: ["questions", questionDialog.quizId] }); setQuestionDialog({ open: false }); toast({ title: questionDialog.question ? "Question updated" : "Question added" }); }}
        saving={saving}
        setSaving={setSaving}
        apiFetch={apiFetch}
        session={session}
      />

      <BulkImportDialog
        open={bulkDialog.open}
        quizId={bulkDialog.quizId}
        onClose={() => setBulkDialog({ open: false })}
        onImported={(count) => { queryClient.invalidateQueries({ queryKey: ["questions", bulkDialog.quizId] }); setBulkDialog({ open: false }); toast({ title: `${count} questions imported` }); }}
      />

      <QrDialog
        open={qrDialog.open}
        questionId={qrDialog.questionId}
        currentUrl={qrDialog.currentUrl}
        onClose={() => setQrDialog({ open: false })}
        onSaved={(qrUrl, questionId) => {
          setQrDialog({ open: false });
          toast({ title: "QR code generated" });
          const quizId = quizzes.find(q =>
            q.id === questionDialog.quizId
          )?.id;
          queryClient.invalidateQueries({ queryKey: ["questions", quizId] });
          queryClient.invalidateQueries();
        }}
        apiFetch={apiFetch}
      />
    </AppLayout>
  );
}

function QuizRow({ quiz, expanded, onToggle, onEdit, onDelete, onAddQuestion, onEditQuestion, onDeleteQuestion, onBulkImport, onGenerateQr, queryClient }: {
  quiz: Quiz;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddQuestion: () => void;
  onEditQuestion: (q: Question) => void;
  onDeleteQuestion: (id: string) => void;
  onBulkImport: () => void;
  onGenerateQr: (questionId: string, url?: string) => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { data: questions = [] } = useQuery<Question[]>({
    queryKey: ["questions", quiz.id],
    queryFn: async () => {
      const { data } = await supabase.from("quiz_questions").select("*").eq("quiz_id", quiz.id).order("order_index");
      return data ?? [];
    },
    enabled: expanded,
  });

  const typeLabel = QUIZ_TYPES.find(t => t.value === quiz.type)?.label ?? quiz.type;

  return (
    <Card className="bg-card">
      <CardContent className="p-0">
        <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={onToggle}>
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
          <HelpCircle className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold truncate">{quiz.title}</span>
              <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
              {!quiz.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
              {(() => {
                const roles = quiz.allowed_roles ?? ["student", "admin", "super_admin"];
                const isPublic = roles.includes("student");
                return (
                  <Badge
                    variant="secondary"
                    className={`text-xs flex items-center gap-1 ${isPublic ? "text-emerald-400 border border-emerald-800/40" : "text-amber-400 border border-amber-800/40"}`}
                  >
                    {isPublic ? <Eye className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                    {visibilityLabel(roles)}
                  </Badge>
                );
              })()}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pass: {quiz.passing_score}% · {quiz.duration_minutes}min · Negative: -{quiz.negative_marking} · Max attempts: {quiz.max_attempts}
            </p>
          </div>
          <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit}><Edit className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-border bg-muted/20 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
              <p className="text-sm font-medium text-muted-foreground">{questions.length} question{questions.length !== 1 ? "s" : ""}</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button size="sm" variant="outline" className="w-full sm:w-auto justify-center" onClick={onBulkImport}>
                  <FileJson className="w-3.5 h-3.5 mr-1.5" /> Bulk Import
                </Button>
                <Button size="sm" className="w-full sm:w-auto justify-center" onClick={onAddQuestion}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Question
                </Button>
              </div>
            </div>

            {questions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No questions yet. Add some above.</p>
            ) : (
              <div className="space-y-2">
                {questions.map((q, idx) => (
                  <div key={q.id} className="border border-border rounded-md bg-card p-3">
                    <div className="flex items-start gap-3">
                      <span className="text-xs text-muted-foreground font-medium mt-0.5 shrink-0 w-5">{idx + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug break-words">{q.question_text}</p>
                        <div className="mt-1.5 grid grid-cols-2 gap-1">
                          {Object.entries(q.options ?? {}).map(([key, val]) => (
                            <span key={key} className={`text-xs px-2 py-0.5 rounded ${key === q.correct_answer ? "bg-success/20 text-success font-semibold" : "text-muted-foreground"}`}>
                              {key}: {val}
                            </span>
                          ))}
                        </div>
                        {q.explanation && <p className="text-xs text-muted-foreground mt-1 italic">{q.explanation}</p>}
                        <div className="flex items-center gap-3 mt-1.5">
                          <Badge variant="secondary" className="text-xs">Diff: {q.difficulty}/5</Badge>
                          {q.video_solution_url && (
                            <a href={q.video_solution_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                              <ExternalLink className="w-3 h-3" /> Video
                            </a>
                          )}
                          {q.qr_code_url && <img src={q.qr_code_url} alt="QR" className="w-8 h-8 rounded" />}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Generate QR" onClick={() => onGenerateQr(q.id, q.video_solution_url)}>
                          <QrCode className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEditQuestion(q)}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDeleteQuestion(q.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuizDialog({ open, quiz, onClose, onSaved, saving, setSaving }: {
  open: boolean;
  quiz?: Quiz;
  onClose: () => void;
  onSaved: () => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
}) {
  const { data: subjects = [] } = useQuery({ queryKey: [getGetSubjectsUrl()], queryFn: () => getSubjects() });
  const { user } = useAuth();
  const [form, setForm] = useState<{
    title: string; type: string; passing_score: number; duration_minutes: number;
    negative_marking: number; max_attempts: number; is_active: boolean;
    topic_id: string; chapter_id: string; subject_id: string;
    allowed_roles: string[];
  }>({
    title: quiz?.title ?? "",
    type: quiz?.type ?? "topic_test",
    passing_score: quiz?.passing_score ?? 60,
    duration_minutes: quiz?.duration_minutes ?? 30,
    negative_marking: quiz?.negative_marking ?? 0,
    max_attempts: quiz?.max_attempts ?? 3,
    is_active: quiz?.is_active ?? true,
    topic_id: quiz?.topic_id ?? "",
    chapter_id: quiz?.chapter_id ?? "",
    subject_id: quiz?.subject_id ?? "",
    allowed_roles: quiz?.allowed_roles ?? ["student", "admin", "super_admin"],
  });

  useState(() => {
    if (open) {
      setForm({
        title: quiz?.title ?? "",
        type: quiz?.type ?? "topic_test",
        passing_score: quiz?.passing_score ?? 60,
        duration_minutes: quiz?.duration_minutes ?? 30,
        negative_marking: quiz?.negative_marking ?? 0,
        max_attempts: quiz?.max_attempts ?? 3,
        is_active: quiz?.is_active ?? true,
        topic_id: quiz?.topic_id ?? "",
        chapter_id: quiz?.chapter_id ?? "",
        subject_id: quiz?.subject_id ?? "",
        allowed_roles: quiz?.allowed_roles ?? ["student", "admin", "super_admin"],
      });
    }
  });

  async function handleSave() {
    if (!form.title) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        type: form.type,
        passing_score: form.passing_score,
        duration_minutes: form.duration_minutes,
        negative_marking: form.negative_marking,
        max_attempts: form.max_attempts,
        is_active: form.is_active,
        topic_id: form.topic_id || null,
        chapter_id: form.chapter_id || null,
        subject_id: form.subject_id || null,
        allowed_roles: form.allowed_roles.length > 0 ? form.allowed_roles : ["student", "admin", "super_admin"],
      };
      if (quiz?.id) {
        await supabase.from("quizzes").update(payload).eq("id", quiz.id);
      } else {
        await supabase.from("quizzes").insert({
          ...payload,
          ...(user?.id ? { creator_id: user.id } : {}),
        });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const f = (k: keyof typeof form, v: unknown) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{quiz ? "Edit Quiz" : "New Quiz"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={form.title} onChange={e => f("title", e.target.value)} placeholder="e.g. Chapter 1 Lecture Quiz" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={v => f("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{QUIZ_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Passing Score (%)</Label>
              <Input type="number" min={0} max={100} value={form.passing_score} onChange={e => f("passing_score", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Duration (minutes)</Label>
              <Input type="number" min={1} value={form.duration_minutes} onChange={e => f("duration_minutes", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Negative Marking</Label>
              <Input type="number" min={0} step={0.25} value={form.negative_marking} onChange={e => f("negative_marking", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Max Attempts</Label>
              <Input type="number" min={1} value={form.max_attempts} onChange={e => f("max_attempts", Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Subject (optional)</Label>
            <Select value={form.subject_id || "none"} onValueChange={v => f("subject_id", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(subjects as { id: string; title: string }[]).map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Exam Access</Label>
            <p className="text-xs text-muted-foreground">Which roles can see and take this exam. Super admins can always preview.</p>
            <div className="flex flex-col gap-2 pt-1">
              {ALL_ROLES.map(role => (
                <label key={role} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.allowed_roles.includes(role)}
                    onChange={e => {
                      const updated = e.target.checked
                        ? [...form.allowed_roles, role]
                        : form.allowed_roles.filter(r => r !== role);
                      f("allowed_roles", updated);
                    }}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm">{ROLE_LABELS[role]}</span>
                </label>
              ))}
            </div>
            {form.allowed_roles.length === 0 && (
              <p className="text-xs text-destructive">At least one role must be selected</p>
            )}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.title || form.allowed_roles.length === 0}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuestionDialog({ open, quizId, question, onClose, onSaved, saving, setSaving, apiFetch: _apiFetch, session: _session }: {
  open: boolean;
  quizId?: string;
  question?: Question;
  onClose: () => void;
  onSaved: () => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  apiFetch?: (path: string, options?: RequestInit) => Promise<unknown>;
  session?: { access_token?: string } | null;
}) {
  const [form, setForm] = useState({
    question_text: "",
    optA: "", optB: "", optC: "", optD: "",
    correct_answer: "A",
    explanation: "",
    video_solution_url: "",
    difficulty: 3,
    order_index: 0,
  });

  useState(() => {
    if (open) {
      setForm({
        question_text: question?.question_text ?? "",
        optA: question?.options?.["A"] ?? "",
        optB: question?.options?.["B"] ?? "",
        optC: question?.options?.["C"] ?? "",
        optD: question?.options?.["D"] ?? "",
        correct_answer: question?.correct_answer ?? "A",
        explanation: question?.explanation ?? "",
        video_solution_url: question?.video_solution_url ?? "",
        difficulty: question?.difficulty ?? 3,
        order_index: question?.order_index ?? 0,
      });
    }
  });

  const f = (k: keyof typeof form, v: unknown) => setForm(prev => ({ ...prev, [k]: v }));

  function isYouTubeUrl(url: string) {
    return /youtube\.com\/watch|youtu\.be\//.test(url);
  }

  async function handleSave() {
    if (!form.question_text || !form.optA || !form.optB) return;
    setSaving(true);
    try {
      let qrCodeUrl: string | null = question?.qr_code_url ?? null;

      // Auto-generate QR if YouTube URL is new or changed
      if (form.video_solution_url && isYouTubeUrl(form.video_solution_url)
          && form.video_solution_url !== (question?.video_solution_url ?? "")) {
        try {
          const result = await apiFetch("/qr/generate", {
            method: "POST",
            body: JSON.stringify({ youtube_url: form.video_solution_url, level: "question", reference_id: question?.id ?? "new" }),
          }) as { qr_code_url?: string };
          qrCodeUrl = result.qr_code_url ?? null;
        } catch {
          // QR generation failure is non-fatal
        }
      }

      const payload = {
        quiz_id: quizId,
        question_text: form.question_text,
        options: { A: form.optA, B: form.optB, ...(form.optC ? { C: form.optC } : {}), ...(form.optD ? { D: form.optD } : {}) },
        correct_answer: form.correct_answer,
        explanation: form.explanation || null,
        video_solution_url: form.video_solution_url || null,
        qr_code_url: qrCodeUrl,
        difficulty: form.difficulty,
        order_index: form.order_index,
      };
      if (question?.id) {
        await supabase.from("quiz_questions").update(payload).eq("id", question.id);
      } else {
        await supabase.from("quiz_questions").insert(payload);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{question ? "Edit Question" : "Add Question"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Question Text *</Label>
            <Textarea rows={3} value={form.question_text} onChange={e => f("question_text", e.target.value)} placeholder="Enter the question..." />
          </div>
          <div className="space-y-2">
            <Label>Options *</Label>
            {(["A", "B", "C", "D"] as const).map(opt => (
              <div key={opt} className="flex items-center gap-2">
                <span className={`text-xs font-bold w-5 shrink-0 ${form.correct_answer === opt ? "text-success" : "text-muted-foreground"}`}>{opt}</span>
                <Input
                  value={form[`opt${opt}` as "optA" | "optB" | "optC" | "optD"]}
                  onChange={e => f(`opt${opt}`, e.target.value)}
                  placeholder={`Option ${opt}${opt === "A" || opt === "B" ? " *" : " (optional)"}`}
                />
                <Button
                  size="sm"
                  variant={form.correct_answer === opt ? "default" : "outline"}
                  className={`text-xs shrink-0 ${form.correct_answer === opt ? "bg-success hover:bg-success/90" : ""}`}
                  onClick={() => f("correct_answer", opt)}
                >
                  ✓
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Click ✓ to mark the correct answer</p>
          </div>
          <div className="space-y-1.5">
            <Label>Explanation (optional)</Label>
            <Textarea rows={2} value={form.explanation} onChange={e => f("explanation", e.target.value)} placeholder="Solution explanation..." />
          </div>
          <div className="space-y-1.5">
            <Label>Video Solution URL <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            <Input value={form.video_solution_url} onChange={e => f("video_solution_url", e.target.value)} placeholder="https://youtube.com/watch?v=... (leave blank for text-only)" />
            <p className="text-xs text-muted-foreground">If provided, a QR code is auto-generated. Leave blank for text-only questions.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Difficulty (1–5)</Label>
              <Input type="number" min={1} max={5} value={form.difficulty} onChange={e => f("difficulty", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Order Index</Label>
              <Input type="number" min={0} value={form.order_index} onChange={e => f("order_index", Number(e.target.value))} />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.question_text || !form.optA || !form.optB}>
              {saving ? "Saving..." : "Save Question"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function parseCsvToQuestions(csv: string): unknown[] {
  const lines = csv.trim().split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line, idx) => {
    const cols = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) ?? [];
    const clean = (v?: string) => (v ?? "").replace(/^"|"$/g, "").trim();
    const get = (key: string) => clean(cols[headers.indexOf(key)]);
    const optC = get("option_c") || get("C");
    const optD = get("option_d") || get("D");
    const videoUrl = get("video_solution_url");
    return {
      question_text: get("question_text") || get("question"),
      options: {
        A: get("option_a") || get("A"),
        B: get("option_b") || get("B"),
        ...(optC ? { C: optC } : {}),
        ...(optD ? { D: optD } : {}),
      },
      correct_answer: (get("correct_answer") || get("answer")).toUpperCase(),
      explanation: get("explanation") || null,
      video_solution_url: videoUrl || null,
      difficulty: parseInt(get("difficulty") || "3", 10) || 3,
      order_index: idx,
    };
  });
}

function BulkImportDialog({ open, quizId, onClose, onImported }: {
  open: boolean;
  quizId?: string;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const [json, setJson] = useState("");
  const [csv, setCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("json");

  const exampleJson = JSON.stringify([
    {
      question_text: "What is the SI unit of force?",
      options: { A: "Joule", B: "Newton", C: "Watt", D: "Pascal" },
      correct_answer: "B",
      explanation: "Force is measured in Newtons (N).",
      video_solution_url: "",
      difficulty: 2,
      order_index: 0,
    },
    {
      question_text: "What is the value of standard gravity?",
      options: { A: "9.8 m/s²", B: "8.9 m/s²" },
      correct_answer: "A",
      explanation: "Standard acceleration due to gravity is 9.8 m/s².",
      difficulty: 1,
      order_index: 1,
    },
  ], null, 2);

  const exampleCsv = `question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,video_solution_url,difficulty
"What is the SI unit of force?","Joule","Newton","Watt","Pascal","B","Force is measured in Newtons (N).","",2
"What is the value of g?","9.8 m/s²","8.9 m/s²","","","A","Standard gravity is 9.8 m/s².","https://youtube.com/watch?v=example",1`;

  async function handleImport() {
    setError("");
    let questions: unknown[];
    if (activeTab === "json") {
      try { questions = JSON.parse(json); } catch { setError("Invalid JSON. Please check the format."); return; }
      if (!Array.isArray(questions)) { setError("JSON must be an array of questions."); return; }
    } else {
      questions = parseCsvToQuestions(csv);
      if (questions.length === 0) { setError("No valid rows found. Check the CSV format."); return; }
    }
    setImporting(true);
    try {
      const result = await apiFetch("/questions/bulk-import", { method: "POST", body: JSON.stringify({ quiz_id: quizId, questions }) }) as { imported?: number };
      onImported(result.imported ?? questions.length);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsv(ev.target?.result as string ?? "");
    reader.readAsText(file);
  }

  const inputText = activeTab === "json" ? json : csv;

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Import Questions</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="json"><FileJson className="w-3.5 h-3.5 mr-1.5" />JSON</TabsTrigger>
              <TabsTrigger value="csv"><FileText className="w-3.5 h-3.5 mr-1.5" />CSV</TabsTrigger>
              <TabsTrigger value="format">Format Guide</TabsTrigger>
            </TabsList>
            <TabsContent value="json" className="space-y-3 mt-3">
              <Textarea
                rows={12}
                value={json}
                onChange={e => setJson(e.target.value)}
                placeholder={exampleJson}
                className="font-mono text-xs"
              />
            </TabsContent>
            <TabsContent value="csv" className="space-y-3 mt-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="csv-file" className="cursor-pointer">
                  <div className="flex items-center gap-2 px-3 py-2 border border-border rounded-md text-sm hover:bg-muted transition-colors">
                    <Upload className="w-4 h-4" /> Upload CSV file
                  </div>
                </Label>
                <input id="csv-file" type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />
                <span className="text-xs text-muted-foreground">or paste below</span>
              </div>
              <Textarea
                rows={10}
                value={csv}
                onChange={e => setCsv(e.target.value)}
                placeholder={exampleCsv}
                className="font-mono text-xs"
              />
              {csv && (
                <p className="text-xs text-muted-foreground">
                  {parseCsvToQuestions(csv).length} questions detected
                </p>
              )}
            </TabsContent>
            <TabsContent value="format" className="mt-3">
              <div className="space-y-5 text-sm">

                {/* Section 1: File Formats */}
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <h4 className="font-semibold mb-2">Supported file formats</h4>
                  <ul className="space-y-1 text-muted-foreground">
                    <li><span className="text-primary font-medium">JSON</span> — paste a JSON array directly</li>
                    <li><span className="text-primary font-medium">CSV</span> — upload a .csv file or paste text (Excel exports to CSV via File → Save As)</li>
                    <li className="text-xs">XLSX is not directly supported — open in Excel/Sheets and export as CSV first.</li>
                  </ul>
                </div>

                {/* Section 2: Fields */}
                <div>
                  <h4 className="font-semibold mb-2">Fields reference</h4>
                  <div className="space-y-1.5">
                    {[
                      { name: "question_text / question", req: true, desc: "Full question text. Supports plain text and LaTeX (e.g. $x^2$)." },
                      { name: "option_a / A", req: true, desc: "Option A text." },
                      { name: "option_b / B", req: true, desc: "Option B text." },
                      { name: "option_c / C", req: false, desc: "Option C — leave blank to omit." },
                      { name: "option_d / D", req: false, desc: "Option D — leave blank to omit." },
                      { name: "correct_answer / answer", req: true, desc: "Must be exactly A, B, C, or D (uppercase)." },
                      { name: "explanation", req: false, desc: "Text explanation shown to students after the exam. Can include LaTeX." },
                      { name: "video_solution_url", req: false, desc: "YouTube URL for video solution. Leave blank for text-only questions." },
                      { name: "difficulty", req: false, desc: "Integer 1–5 (1 = easiest). Defaults to 3 if omitted." },
                    ].map(f => (
                      <div key={f.name} className="flex gap-2 text-xs">
                        <span className={`shrink-0 w-16 font-medium rounded px-1 py-0.5 text-center ${f.req ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {f.req ? "required" : "optional"}
                        </span>
                        <div>
                          <code className="text-primary">{f.name}</code>
                          <span className="text-muted-foreground ml-1">— {f.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 3: JSON Example */}
                <div>
                  <h4 className="font-semibold mb-1">JSON example</h4>
                  <pre className="text-xs bg-muted p-2 rounded overflow-auto">{exampleJson}</pre>
                </div>

                {/* Section 4: CSV Example */}
                <div>
                  <h4 className="font-semibold mb-1">CSV example</h4>
                  <p className="text-xs text-muted-foreground mb-1">First row must be the header. Wrap fields containing commas in double-quotes.</p>
                  <pre className="text-xs bg-muted p-2 rounded overflow-auto">{exampleCsv}</pre>
                </div>

                {/* Section 5: PDF Workflow */}
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <h4 className="font-semibold mb-2">Importing questions from a PDF (step-by-step)</h4>
                  <ol className="space-y-2 text-muted-foreground list-decimal list-inside text-xs">
                    <li><strong className="text-foreground">Extract text from the PDF.</strong> Open the PDF and copy-paste questions, or use a free tool like <span className="text-primary">Adobe Acrobat Reader → Edit → Copy</span>, <span className="text-primary">Smallpdf.com</span>, or <span className="text-primary">ilovepdf.com</span> to convert to Word/text first.</li>
                    <li><strong className="text-foreground">Clean the extracted text.</strong> Remove page numbers, headers, footers, and any non-question text. Ensure each MCQ has a clear question stem and 4 options labeled A/B/C/D.</li>
                    <li><strong className="text-foreground">Use AI to structure the questions.</strong> Paste the cleaned text into ChatGPT or any AI tool with this prompt: <em className="text-foreground">"Convert these MCQs into a JSON array with fields: question_text, options (A/B/C/D), correct_answer, explanation, difficulty (1-5). Video_solution_url should be empty string."</em></li>
                    <li><strong className="text-foreground">Review the AI output.</strong> Check that: correct answers match the answer key, LaTeX formulas use $ signs, options C and D are present or properly omitted.</li>
                    <li><strong className="text-foreground">Paste into JSON tab and import.</strong> The importer validates every row and reports errors for individual questions without failing the entire batch.</li>
                  </ol>
                  <div className="mt-3 p-2 rounded bg-destructive/10 border border-destructive/20 text-xs text-muted-foreground">
                    <strong className="text-foreground">Common mistakes to avoid:</strong>
                    {" "}correct_answer must be A/B/C/D (not "Option A" or "1"). Options object must use uppercase keys. Don't include markdown formatting in question text. For large sets (&gt;100 questions), split into batches.
                  </div>
                </div>

                {/* Section 6: What happens in each scenario */}
                <div>
                  <h4 className="font-semibold mb-2">Scenarios</h4>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {[
                      ["Video URL present", "QR code is auto-generated; students see a Watch Video button and QR code."],
                      ["Video URL blank", "No QR generated; students see text-only explanation. The Videos tab is hidden."],
                      ["Explanation blank", "Students see 'No explanation available' placeholder."],
                      ["Invalid correct_answer", "That row is skipped with an error; the rest still import."],
                      ["Missing option A or B", "Row is rejected. C and D can be omitted for True/False questions."],
                      ["Duplicate questions", "Imported as new rows — check manually and delete duplicates if needed."],
                      ["More than 500 rows", "Batch is rejected. Split into multiple imports of ≤ 500 each."],
                    ].map(([scenario, outcome]) => (
                      <div key={scenario} className="flex gap-2">
                        <span className="shrink-0 text-primary font-medium">{scenario}:</span>
                        <span>{outcome}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </TabsContent>
          </Tabs>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleImport} disabled={importing || !inputText.trim()}>
              {importing ? "Importing..." : "Import Questions"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QrDialog({ open, questionId, currentUrl, onClose, onSaved, apiFetch }: {
  open: boolean;
  questionId?: string;
  currentUrl?: string;
  onClose: () => void;
  onSaved: (qrUrl: string, questionId: string) => void;
  apiFetch: (path: string, options?: RequestInit) => Promise<unknown>;
}) {
  const [url, setUrl] = useState(currentUrl ?? "");
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");

  useState(() => { if (open) { setUrl(currentUrl ?? ""); setPreview(null); setError(""); } });

  async function handleGenerate() {
    if (!url || !questionId) return;
    setError("");
    setGenerating(true);
    try {
      const result = await apiFetch("/qr/generate", {
        method: "POST",
        body: JSON.stringify({ youtube_url: url, level: "question", reference_id: questionId }),
      });
      const qrResult = result as { qr_code_url?: string };
      setPreview(qrResult.qr_code_url ?? null);
      await supabase.from("quiz_questions").update({ video_solution_url: url, qr_code_url: qrResult.qr_code_url }).eq("id", questionId);
      onSaved(qrResult.qr_code_url ?? "", questionId);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><QrCode className="w-5 h-5" /> Generate QR Code</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>YouTube Video URL</Label>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {preview && (
            <div className="flex flex-col items-center gap-2 p-4 bg-white rounded-lg">
              <img src={preview} alt="QR Code" className="w-40 h-40" />
              <p className="text-xs text-center text-slate-500">Scan to open video solution</p>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={handleGenerate} disabled={generating || !url}>
              <QrCode className="w-4 h-4 mr-2" />
              {generating ? "Generating..." : "Generate QR"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
