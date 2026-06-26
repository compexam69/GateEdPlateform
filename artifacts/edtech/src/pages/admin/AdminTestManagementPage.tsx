import { AppLayout } from "@/components/layout/AppLayout";
import { AdminBreadcrumb } from "@/components/layout/AdminBreadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ClipboardList, Plus, Trash2, Eye, Shield, Upload, Download,
  AlertCircle, CheckCircle2, Loader2, ChevronRight, ChevronDown,
  BookOpen, FileText, Copy, RotateCcw, History, ArrowLeft,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type View = "list" | "create" | "logs";
type WizardStep = 1 | 2 | 3 | 4;

interface TestRecord {
  id: string;
  title: string;
  type: string;
  subject_id: string | null;
  chapter_id: string | null;
  topic_id: string | null;
  passing_score: number;
  duration_minutes: number;
  negative_marking: number;
  max_attempts: number;
  is_active: boolean;
  allowed_roles: string[];
  creator_id: string | null;
  created_at: string;
}

interface Subject { id: string; title: string; }
interface Chapter { id: string; title: string; subject_id: string; }

interface WizardData {
  subject_id: string;
  chapter_id: string;
  title: string;
  type: string;
  duration_minutes: number;
  passing_score: number;
  negative_marking: number;
  max_attempts: number;
  csv: string;
  allowed_roles: string[];
}

type QuestionPreviewRow = {
  valid: boolean;
  question_text: string;
  correct_answer: string;
  difficulty: number;
  error?: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const QUIZ_TYPES = [
  { value: "chapter_test", label: "Chapter Test" },
  { value: "subject_test", label: "Subject Test" },
  { value: "grand_test", label: "Grand Test" },
  { value: "topic_test", label: "Topic Test" },
  { value: "dpp", label: "DPP (Daily Practice)" },
  { value: "pyq", label: "PYQ" },
  { value: "lecture_quiz", label: "Lecture Quiz" },
];

const ALL_ROLES = ["student", "admin", "super_admin"] as const;
type RoleId = typeof ALL_ROLES[number];
const ROLE_LABELS: Record<RoleId, string> = {
  student: "Students",
  admin: "Admins",
  super_admin: "Super Admins",
};

const QUESTION_CSV_TEMPLATE = `question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,video_solution_url,difficulty
"What is the SI unit of force?","Joule","Newton","Watt","Pascal","B","Force is measured in Newtons (N).","",2
"Acceleration due to gravity on Earth is:","9.8 m/s²","8.9 m/s²","10 m/s²","11 m/s²","A","Standard gravity is 9.8 m/s².","https://youtube.com/watch?v=example",1`;

const WIZARD_STEPS = [
  { n: 1, label: "Hierarchy" },
  { n: 2, label: "Details" },
  { n: 3, label: "Questions" },
  { n: 4, label: "Preview" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

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
      video_solution_url: get("video_solution_url") || null,
      difficulty: parseInt(get("difficulty") || "3", 10) || 3,
      order_index: idx,
    };
  });
}

function validateQuestionClient(q: unknown, idx: number): QuestionPreviewRow {
  const raw = q as Record<string, unknown>;
  const opts = raw.options as Record<string, string> | undefined;
  const question_text = typeof raw.question_text === "string" ? raw.question_text.trim() : "";
  const correct_answer = typeof raw.correct_answer === "string" ? raw.correct_answer.trim().toUpperCase() : "";
  const difficulty = Math.round(Number(raw.difficulty ?? 3) || 3);
  const base = { question_text, correct_answer, difficulty };
  if (!question_text) return { ...base, valid: false, error: `Row ${idx + 1}: Question text is missing` };
  if (!opts?.A?.trim()) return { ...base, valid: false, error: `Row ${idx + 1}: Option A is required` };
  if (!opts?.B?.trim()) return { ...base, valid: false, error: `Row ${idx + 1}: Option B is required` };
  if (!["A", "B", "C", "D"].includes(correct_answer))
    return { ...base, valid: false, error: `Row ${idx + 1}: Correct answer must be A, B, C, or D (got "${String(raw.correct_answer)}")` };
  return { ...base, valid: true };
}

function visibilityLabel(roles: string[]): string {
  const s = roles.includes("student"), a = roles.includes("admin"), sa = roles.includes("super_admin");
  if (s && a && sa) return "All roles";
  if (s && a) return "Students + Admins";
  if (s) return "Students only";
  if (a && sa) return "Staff only";
  if (sa) return "Super Admin only";
  if (a) return "Admins only";
  return "Restricted";
}

function downloadTemplate() {
  const blob = new Blob([QUESTION_CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "test_management_question_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Query keys ─────────────────────────────────────────────────────────────────

const TESTS_KEY = ["tm-tests"];
const SUBJECTS_KEY = ["tm-subjects"];
const LOGS_KEY = ["tm-import-logs"];

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AdminTestManagementPage() {
  const { toast } = useToast();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();

  const [view, setView] = useState<View>("list");
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [wizardData, setWizardData] = useState<WizardData>({
    subject_id: "", chapter_id: "",
    title: "", type: "chapter_test",
    duration_minutes: 30, passing_score: 60,
    negative_marking: 0, max_attempts: 3,
    csv: "",
    allowed_roles: ["student", "admin", "super_admin"],
  });
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{
    quiz_id: string; imported: number; skipped: number; errors: string[];
  } | null>(null);

  const [visibilityDialog, setVisibilityDialog] = useState<{
    open: boolean; quiz?: TestRecord;
  }>({ open: false });

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: SUBJECTS_KEY,
    queryFn: async () => {
      const { data } = await supabase
        .from("subjects").select("id, title").order("order_index");
      return data ?? [];
    },
  });

  const { data: allChapters = [] } = useQuery<Chapter[]>({
    queryKey: ["tm-chapters-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("chapters").select("id, title, subject_id").order("order_index");
      return data ?? [];
    },
  });

  const { data: tests = [], isLoading } = useQuery<TestRecord[]>({
    queryKey: TESTS_KEY,
    queryFn: async () => {
      let q = supabase
        .from("quizzes")
        .select("id, title, type, subject_id, chapter_id, topic_id, passing_score, duration_minutes, negative_marking, max_attempts, is_active, allowed_roles, creator_id, created_at")
        .order("created_at", { ascending: false });
      if (role !== "super_admin") {
        q = q.eq("creator_id", user?.id ?? "");
      }
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: importLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: LOGS_KEY,
    queryFn: async () => {
      const res = await apiFetch("/admin/test-management/import-logs") as unknown[];
      return res ?? [];
    },
    enabled: view === "logs",
  });

  // ── Wizard helpers ────────────────────────────────────────────────────────────

  const setWd = <K extends keyof WizardData>(k: K, v: WizardData[K]) =>
    setWizardData(prev => ({ ...prev, [k]: v }));

  const resetWizard = () => {
    setWizardStep(1);
    setWizardData({
      subject_id: "", chapter_id: "",
      title: "", type: "chapter_test",
      duration_minutes: 30, passing_score: 60,
      negative_marking: 0, max_attempts: 3,
      csv: "",
      allowed_roles: ["student", "admin", "super_admin"],
    });
    setCreateResult(null);
  };

  const parsedQuestions = wizardData.csv.trim() ? parseCsvToQuestions(wizardData.csv) : [];
  const validatedQuestions: QuestionPreviewRow[] = parsedQuestions.map((q, i) => validateQuestionClient(q, i));
  const validCount = validatedQuestions.filter(r => r.valid).length;
  const invalidCount = validatedQuestions.filter(r => !r.valid).length;

  async function handleCreate() {
    setCreating(true);
    try {
      const questions = parsedQuestions;
      const result = await apiFetch("/admin/test-management/create", {
        method: "POST",
        body: JSON.stringify({
          subject_id: wizardData.subject_id,
          chapter_id: wizardData.chapter_id || undefined,
          title: wizardData.title,
          type: wizardData.type,
          duration_minutes: wizardData.duration_minutes,
          passing_score: wizardData.passing_score,
          negative_marking: wizardData.negative_marking,
          max_attempts: wizardData.max_attempts,
          allowed_roles: wizardData.allowed_roles,
          questions,
        }),
      }) as { quiz_id: string; imported: number; skipped: number; errors: string[] };
      setCreateResult(result);
      queryClient.invalidateQueries({ queryKey: TESTS_KEY });
      queryClient.invalidateQueries({ queryKey: LOGS_KEY });
    } catch (e: unknown) {
      toast({ title: "Create failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(test: TestRecord) {
    if (!confirm(`Delete "${test.title}" and all its questions?`)) return;
    try {
      await apiFetch(`/admin/test-management/${test.id}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: TESTS_KEY });
      toast({ title: "Test deleted" });
    } catch (e: unknown) {
      toast({ title: "Delete failed", description: (e as Error).message, variant: "destructive" });
    }
  }

  async function handleDuplicate(test: TestRecord) {
    try {
      await apiFetch(`/admin/test-management/${test.id}/duplicate`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: TESTS_KEY });
      toast({ title: "Test duplicated" });
    } catch (e: unknown) {
      toast({ title: "Duplicate failed", description: (e as Error).message, variant: "destructive" });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const selectedSubject = subjects.find(s => s.id === wizardData.subject_id);
  const filteredChapters = allChapters.filter(c => c.subject_id === wizardData.subject_id);
  const selectedChapter = allChapters.find(c => c.id === wizardData.chapter_id);

  return (
    <AppLayout>
      <div className="space-y-6">
        <AdminBreadcrumb pageName="Test Management" />

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <ClipboardList className="w-7 h-7 text-primary" /> Test Management
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Create tests via Subject → Chapter hierarchy with CSV bulk question import.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {view !== "logs" ? (
              <Button variant="outline" size="sm" onClick={() => setView("logs")}>
                <History className="w-4 h-4 mr-1.5" /> Import Logs
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setView("list")}>
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Tests
              </Button>
            )}
            {view === "list" && (
              <Button onClick={() => { resetWizard(); setView("create"); }}>
                <Plus className="w-4 h-4 mr-1.5" /> Create Test
              </Button>
            )}
            {view === "create" && (
              <Button variant="outline" onClick={() => { resetWizard(); setView("list"); }}>
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Cancel
              </Button>
            )}
          </div>
        </div>

        {/* ── Create Wizard ── */}
        {view === "create" && (
          <div className="space-y-6">
            <WizardProgressBar currentStep={wizardStep} />

            {!createResult ? (
              <>
                {wizardStep === 1 && (
                  <Step1_Hierarchy
                    subjects={subjects}
                    filteredChapters={filteredChapters}
                    wizardData={wizardData}
                    setWd={setWd}
                    onNext={() => setWizardStep(2)}
                  />
                )}
                {wizardStep === 2 && (
                  <Step2_Details
                    wizardData={wizardData}
                    setWd={setWd}
                    onBack={() => setWizardStep(1)}
                    onNext={() => setWizardStep(3)}
                  />
                )}
                {wizardStep === 3 && (
                  <Step3_Import
                    wizardData={wizardData}
                    setWd={setWd}
                    parsedQuestions={parsedQuestions}
                    validatedQuestions={validatedQuestions}
                    validCount={validCount}
                    invalidCount={invalidCount}
                    onBack={() => setWizardStep(2)}
                    onNext={() => setWizardStep(4)}
                  />
                )}
                {wizardStep === 4 && (
                  <Step4_Preview
                    wizardData={wizardData}
                    setWd={setWd}
                    selectedSubject={selectedSubject}
                    selectedChapter={selectedChapter}
                    validCount={validCount}
                    invalidCount={invalidCount}
                    creating={creating}
                    onBack={() => setWizardStep(3)}
                    onCreate={handleCreate}
                  />
                )}
              </>
            ) : (
              <CreateSuccessView
                result={createResult}
                onCreateAnother={() => { resetWizard(); }}
                onGoToList={() => { resetWizard(); setView("list"); }}
              />
            )}
          </div>
        )}

        {/* ── Import Logs ── */}
        {view === "logs" && (
          <ImportLogsView logs={importLogs as LogEntry[]} loading={logsLoading} />
        )}

        {/* ── Test List ── */}
        {view === "list" && (
          <TestListView
            tests={tests}
            subjects={subjects}
            allChapters={allChapters}
            isLoading={isLoading}
            role={role ?? "admin"}
            userId={user?.id}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onEditAccess={(t) => setVisibilityDialog({ open: true, quiz: t })}
          />
        )}
      </div>

      {/* ── Visibility Dialog ── */}
      <VisibilityDialog
        open={visibilityDialog.open}
        quiz={visibilityDialog.quiz}
        onClose={() => setVisibilityDialog({ open: false })}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: TESTS_KEY });
          setVisibilityDialog({ open: false });
          toast({ title: "Access updated" });
        }}
      />
    </AppLayout>
  );
}

// ── Wizard Progress Bar ────────────────────────────────────────────────────────

function WizardProgressBar({ currentStep }: { currentStep: WizardStep }) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {WIZARD_STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center shrink-0">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            currentStep === s.n
              ? "bg-primary text-primary-foreground"
              : currentStep > s.n
              ? "bg-primary/20 text-primary"
              : "text-muted-foreground"
          }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border ${
              currentStep > s.n
                ? "bg-primary border-primary text-primary-foreground"
                : currentStep === s.n
                ? "bg-primary-foreground border-primary-foreground text-primary"
                : "border-muted-foreground"
            }`}>
              {currentStep > s.n ? "✓" : s.n}
            </span>
            {s.label}
          </div>
          {i < WIZARD_STEPS.length - 1 && (
            <ChevronRight className="w-4 h-4 text-muted-foreground mx-1 shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Hierarchy ─────────────────────────────────────────────────────────

function Step1_Hierarchy({ subjects, filteredChapters, wizardData, setWd, onNext }: {
  subjects: Subject[];
  filteredChapters: Chapter[];
  wizardData: WizardData;
  setWd: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  onNext: () => void;
}) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-1">Step 1 — Select Hierarchy</h2>
          <p className="text-sm text-muted-foreground">Choose the Subject and Chapter this test belongs to.</p>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Subject <span className="text-destructive">*</span></Label>
            <Select
              value={wizardData.subject_id || "none"}
              onValueChange={v => {
                setWd("subject_id", v === "none" ? "" : v);
                setWd("chapter_id", "");
              }}
            >
              <SelectTrigger><SelectValue placeholder="Select a subject…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select a subject…</SelectItem>
                {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {wizardData.subject_id && (
            <div className="space-y-1.5">
              <Label>Chapter <span className="text-muted-foreground font-normal text-xs">(optional — leave unset for a subject-level test)</span></Label>
              <Select
                value={wizardData.chapter_id || "none"}
                onValueChange={v => setWd("chapter_id", v === "none" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="No chapter selected (subject-level test)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No chapter (subject-level test)</SelectItem>
                  {filteredChapters.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {wizardData.subject_id && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary shrink-0" />
              <span className="text-muted-foreground">Hierarchy: </span>
              <span className="font-medium text-foreground">
                {subjects.find(s => s.id === wizardData.subject_id)?.title}
                {wizardData.chapter_id && (
                  <> <ChevronRight className="inline w-3.5 h-3.5" /> {filteredChapters.find(c => c.id === wizardData.chapter_id)?.title}</>
                )}
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={onNext} disabled={!wizardData.subject_id}>
            Next: Test Details <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Step 2: Test Details ──────────────────────────────────────────────────────

function Step2_Details({ wizardData, setWd, onBack, onNext }: {
  wizardData: WizardData;
  setWd: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-1">Step 2 — Test Details</h2>
          <p className="text-sm text-muted-foreground">Configure the test name, type, and scoring rules.</p>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Test Name <span className="text-destructive">*</span></Label>
            <Input
              value={wizardData.title}
              onChange={e => setWd("title", e.target.value)}
              placeholder="e.g. Chapter 1 – Motion in a Straight Line Test"
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Test Type</Label>
            <Select value={wizardData.type} onValueChange={v => setWd("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUIZ_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Duration (minutes)</Label>
              <Input
                type="number" min={1} max={600}
                value={wizardData.duration_minutes}
                onChange={e => setWd("duration_minutes", Math.max(1, Number(e.target.value)))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Passing Score (%)</Label>
              <Input
                type="number" min={0} max={100}
                value={wizardData.passing_score}
                onChange={e => setWd("passing_score", Math.min(100, Math.max(0, Number(e.target.value))))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Negative Marking (per wrong)</Label>
              <Input
                type="number" min={0} step={0.25}
                value={wizardData.negative_marking}
                onChange={e => setWd("negative_marking", Math.max(0, Number(e.target.value)))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max Attempts</Label>
              <Input
                type="number" min={1} max={99}
                value={wizardData.max_attempts}
                onChange={e => setWd("max_attempts", Math.max(1, Number(e.target.value)))}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          <Button onClick={onNext} disabled={!wizardData.title.trim()}>
            Next: Import Questions <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Step 3: Import Questions ──────────────────────────────────────────────────

function Step3_Import({ wizardData, setWd, parsedQuestions, validatedQuestions, validCount, invalidCount, onBack, onNext }: {
  wizardData: WizardData;
  setWd: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  parsedQuestions: unknown[];
  validatedQuestions: QuestionPreviewRow[];
  validCount: number;
  invalidCount: number;
  onBack: () => void;
  onNext: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setWd("csv", ev.target?.result as string ?? "");
    reader.readAsText(file);
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold mb-1">Step 3 — Import Questions</h2>
          <p className="text-sm text-muted-foreground">Upload a CSV file or paste CSV content. Max 500 rows.</p>
        </div>

        {/* Format info + download */}
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-sm">
          <p className="font-medium">CSV Format</p>
          <p className="text-muted-foreground text-xs">
            Required: <code className="text-foreground">question_text</code>, <code className="text-foreground">option_a</code>, <code className="text-foreground">option_b</code>, <code className="text-foreground">correct_answer</code> (A/B/C/D).
            Optional: <code className="text-foreground">option_c</code>, <code className="text-foreground">option_d</code>, <code className="text-foreground">explanation</code>, <code className="text-foreground">video_solution_url</code>, <code className="text-foreground">difficulty</code> (1–5).
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Download CSV Template
            </Button>
          </div>
        </div>

        {/* File drop zone */}
        <div
          className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">Click to select CSV file</p>
          <p className="text-xs text-muted-foreground mt-1">or paste CSV below</p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
        </div>

        <Textarea
          rows={6}
          value={wizardData.csv}
          onChange={e => setWd("csv", e.target.value)}
          placeholder={QUESTION_CSV_TEMPLATE}
          className="font-mono text-xs"
        />

        {/* Validation preview */}
        {validatedQuestions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{validatedQuestions.length} row{validatedQuestions.length !== 1 ? "s" : ""} parsed</span>
              {validCount > 0 && <Badge className="bg-green-500/15 text-green-400 border-green-800/30 text-xs">{validCount} valid</Badge>}
              {invalidCount > 0 && <Badge variant="destructive" className="text-xs">{invalidCount} invalid</Badge>}
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr>
                      {["#", "Question", "Answer", "Diff", "Status"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {validatedQuestions.map((r, i) => (
                      <tr key={i} className={`${!r.valid ? "bg-destructive/5" : "hover:bg-muted/20"}`}>
                        <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-1.5 max-w-[200px] truncate" title={r.question_text}>{r.question_text || "—"}</td>
                        <td className="px-3 py-1.5 font-mono font-bold text-primary">{r.correct_answer || "—"}</td>
                        <td className="px-3 py-1.5 text-center">{r.difficulty}</td>
                        <td className="px-3 py-1.5">
                          {r.valid
                            ? <Badge className="bg-green-500/15 text-green-400 border-green-800/30 text-[10px] px-1.5 py-0">Valid</Badge>
                            : <Badge variant="destructive" className="text-[10px] px-1.5 py-0" title={r.error}>Error</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {invalidCount > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 max-h-32 overflow-y-auto space-y-1">
                <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-1">Errors ({invalidCount})</p>
                {validatedQuestions.filter(r => !r.valid).map((r, i) => (
                  <p key={i} className="text-xs text-destructive">{r.error}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          <Button onClick={onNext} disabled={validCount === 0}>
            Next: Preview <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Step 4: Preview & Access Control ─────────────────────────────────────────

function Step4_Preview({ wizardData, setWd, selectedSubject, selectedChapter, validCount, invalidCount, creating, onBack, onCreate }: {
  wizardData: WizardData;
  setWd: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  selectedSubject?: Subject;
  selectedChapter?: Chapter;
  validCount: number;
  invalidCount: number;
  creating: boolean;
  onBack: () => void;
  onCreate: () => void;
}) {
  const typeLabel = QUIZ_TYPES.find(t => t.value === wizardData.type)?.label ?? wizardData.type;

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-1">Step 4 — Preview & Access Control</h2>
          <p className="text-sm text-muted-foreground">Review the test before creating. Configure who can view and attempt it.</p>
        </div>

        {/* Summary */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hierarchy</p>
            <div className="flex items-center gap-1.5 flex-wrap text-sm font-medium">
              <BookOpen className="w-4 h-4 text-primary" />
              <span>{selectedSubject?.title ?? "—"}</span>
              {selectedChapter && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{selectedChapter.title}</span>
                </>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Test Settings</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">Name</span><span className="font-medium truncate">{wizardData.title}</span>
              <span className="text-muted-foreground">Type</span><span>{typeLabel}</span>
              <span className="text-muted-foreground">Duration</span><span>{wizardData.duration_minutes} min</span>
              <span className="text-muted-foreground">Passing</span><span>{wizardData.passing_score}%</span>
              <span className="text-muted-foreground">Negative</span><span>{wizardData.negative_marking || "None"}</span>
              <span className="text-muted-foreground">Attempts</span><span>{wizardData.max_attempts}</span>
            </div>
          </div>
        </div>

        {/* Question count */}
        <div className="rounded-lg border border-border bg-muted/20 p-4 flex items-center gap-4 flex-wrap">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{validCount}</p>
            <p className="text-xs text-muted-foreground">Valid questions</p>
          </div>
          {invalidCount > 0 && (
            <div className="text-center">
              <p className="text-2xl font-bold text-destructive">{invalidCount}</p>
              <p className="text-xs text-muted-foreground">Skipped (invalid)</p>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="w-4 h-4" />
            {invalidCount > 0 && <span className="text-amber-400">{invalidCount} rows will be skipped</span>}
            {invalidCount === 0 && <span className="text-green-400">All rows valid</span>}
          </div>
        </div>

        {/* Access Control */}
        <div className="space-y-3">
          <p className="text-sm font-semibold">Access Control</p>
          <p className="text-xs text-muted-foreground">Choose which roles can view and attempt this test.</p>
          <div className="flex flex-col gap-2">
            {ALL_ROLES.map(role => (
              <label key={role} className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-primary"
                  checked={wizardData.allowed_roles.includes(role)}
                  onChange={e => {
                    const updated = e.target.checked
                      ? [...wizardData.allowed_roles, role]
                      : wizardData.allowed_roles.filter(r => r !== role);
                    setWd("allowed_roles", updated);
                  }}
                />
                <span className="text-sm">{ROLE_LABELS[role]}</span>
              </label>
            ))}
          </div>
          {wizardData.allowed_roles.length === 0 && (
            <p className="text-xs text-destructive">At least one role must be selected</p>
          )}
        </div>

        {/* Create button */}
        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack} disabled={creating}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          <Button
            onClick={onCreate}
            disabled={creating || wizardData.allowed_roles.length === 0 || validCount === 0}
            className="min-w-[160px]"
          >
            {creating
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating…</>
              : <><CheckCircle2 className="w-4 h-4 mr-2" /> Create Test</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Create Success View ───────────────────────────────────────────────────────

function CreateSuccessView({ result, onCreateAnother, onGoToList }: {
  result: { quiz_id: string; imported: number; skipped: number; errors: string[] };
  onCreateAnother: () => void;
  onGoToList: () => void;
}) {
  return (
    <Card>
      <CardContent className="pt-8 pb-8 flex flex-col items-center text-center space-y-4">
        <CheckCircle2 className="w-14 h-14 text-green-400" />
        <div>
          <p className="text-xl font-bold">Test Created</p>
          <p className="text-muted-foreground mt-1">
            <span className="text-green-400 font-semibold">{result.imported} question{result.imported !== 1 ? "s" : ""}</span> imported successfully.
            {result.skipped > 0 && <> · <span className="text-muted-foreground">{result.skipped} skipped</span></>}
            {result.errors.length > 0 && <> · <span className="text-destructive">{result.errors.length} failed</span></>}
          </p>
        </div>
        {result.errors.length > 0 && (
          <div className="w-full max-w-lg text-left rounded-lg border border-destructive/30 bg-destructive/5 p-3 max-h-40 overflow-y-auto space-y-1">
            <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-1">Import errors</p>
            {result.errors.map((e, i) => <p key={i} className="text-xs text-destructive">{e}</p>)}
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onCreateAnother}>
            <RotateCcw className="w-4 h-4 mr-1.5" /> Create Another
          </Button>
          <Button onClick={onGoToList}>
            View All Tests
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          You can add more questions or edit settings in the Quiz &amp; Question Editor using the test's quiz ID.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Test List View ─────────────────────────────────────────────────────────────

function TestListView({
  tests, subjects, allChapters, isLoading, role, userId, onDelete, onDuplicate, onEditAccess,
}: {
  tests: TestRecord[];
  subjects: Subject[];
  allChapters: Chapter[];
  isLoading: boolean;
  role: string;
  userId?: string;
  onDelete: (t: TestRecord) => void;
  onDuplicate: (t: TestRecord) => void;
  onEditAccess: (t: TestRecord) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = tests.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  );

  const subjectMap = Object.fromEntries(subjects.map(s => [s.id, s.title]));
  const chapterMap = Object.fromEntries(allChapters.map(c => [c.id, c.title]));

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tests.length > 0 && (
        <Input
          placeholder="Search tests…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm"
        />
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          {tests.length === 0
            ? <p>No tests yet. Click <strong>Create Test</strong> to get started.</p>
            : <p>No tests match your search.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(test => (
            <TestRow
              key={test.id}
              test={test}
              subjectName={test.subject_id ? subjectMap[test.subject_id] : null}
              chapterName={test.chapter_id ? chapterMap[test.chapter_id] : null}
              expanded={expandedId === test.id}
              onToggle={() => setExpandedId(prev => prev === test.id ? null : test.id)}
              role={role}
              userId={userId}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onEditAccess={onEditAccess}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Test Row ──────────────────────────────────────────────────────────────────

function TestRow({ test, subjectName, chapterName, expanded, onToggle, role, userId, onDelete, onDuplicate, onEditAccess }: {
  test: TestRecord;
  subjectName: string | null;
  chapterName: string | null;
  expanded: boolean;
  onToggle: () => void;
  role: string;
  userId?: string;
  onDelete: (t: TestRecord) => void;
  onDuplicate: (t: TestRecord) => void;
  onEditAccess: (t: TestRecord) => void;
}) {
  const isOwner = test.creator_id === userId;
  const canEdit = role === "super_admin" || isOwner;
  const typeLabel = QUIZ_TYPES.find(t => t.value === test.type)?.label ?? test.type;
  const isPublic = test.allowed_roles?.includes("student");

  const { data: questions = [], isLoading: qLoading } = useQuery({
    queryKey: ["tm-questions", test.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("quiz_questions")
        .select("id, question_text, correct_answer, difficulty")
        .eq("quiz_id", test.id)
        .order("order_index");
      return data ?? [];
    },
    enabled: expanded,
  });

  return (
    <Card className="bg-card">
      <CardContent className="p-0">
        {/* Header row */}
        <div className="flex items-start gap-3 p-4 cursor-pointer" onClick={onToggle}>
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />}
          <ClipboardList className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold truncate">{test.title}</span>
              <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
              {!test.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
              <Badge
                variant="secondary"
                className={`text-xs flex items-center gap-1 ${isPublic ? "text-green-400 border border-green-800/30" : "text-amber-400 border border-amber-800/30"}`}
              >
                {isPublic ? <Eye className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                {visibilityLabel(test.allowed_roles ?? [])}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {subjectName ?? "No subject"}{chapterName ? ` › ${chapterName}` : ""}
              {" · "}{test.duration_minutes}min · Pass: {test.passing_score}% · {fmtDate(test.created_at)}
            </p>
          </div>
          <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            {canEdit && (
              <>
                <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit Access" onClick={() => onEditAccess(test)}>
                  <Shield className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" title="Duplicate" onClick={() => onDuplicate(test)}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" title="Delete" onClick={() => onDelete(test)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Expanded questions */}
        {expanded && (
          <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-2">
            {qLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading questions…
              </div>
            ) : questions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No questions yet.</p>
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground mb-2">{questions.length} question{questions.length !== 1 ? "s" : ""}</p>
                {(questions as { id: string; question_text: string; correct_answer: string; difficulty: number }[]).slice(0, 5).map((q, i) => (
                  <div key={q.id} className="text-xs flex items-center gap-2 py-1 border-b border-border/50 last:border-0">
                    <span className="text-muted-foreground w-5 shrink-0">{i + 1}.</span>
                    <span className="flex-1 truncate">{q.question_text}</span>
                    <Badge variant="outline" className="text-[10px] px-1">Ans: {q.correct_answer}</Badge>
                    <Badge variant="secondary" className="text-[10px] px-1">D{q.difficulty}</Badge>
                  </div>
                ))}
                {questions.length > 5 && (
                  <p className="text-xs text-muted-foreground pt-1">+ {questions.length - 5} more questions</p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Import Logs View ──────────────────────────────────────────────────────────

interface LogEntry {
  id: string;
  actor_id: string;
  target_id: string;
  new_value: {
    title?: string;
    imported?: number;
    skipped?: number;
    failed?: number;
    errors?: string[];
    subject_id?: string;
    chapter_id?: string;
  } | null;
  created_at: string;
  actor?: { full_name?: string; email?: string } | null;
}

function ImportLogsView({ logs, loading }: { logs: LogEntry[]; loading: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>No import logs yet. Create a test to see logs here.</p>
      </div>
    );
  }

  function downloadErrors(log: LogEntry) {
    const errs = log.new_value?.errors ?? [];
    if (errs.length === 0) return;
    const content = errs.join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import_errors_${log.id.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Showing the last {logs.length} import{logs.length !== 1 ? "s" : ""}.
      </p>
      {logs.map(log => {
        const meta = log.new_value ?? {};
        const status = (meta.failed ?? 0) === 0 ? "success" : "partial";
        const expanded = expandedId === log.id;
        return (
          <Card key={log.id} className="bg-card">
            <CardContent className="p-0">
              <div
                className="flex items-start gap-3 p-4 cursor-pointer"
                onClick={() => setExpandedId(prev => prev === log.id ? null : log.id)}
              >
                {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
                <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${status === "success" ? "bg-green-400" : "bg-amber-400"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{meta.title ?? "Unnamed Test"}</span>
                    <Badge
                      className={`text-[10px] px-1.5 ${status === "success" ? "bg-green-500/15 text-green-400 border-green-800/30" : "bg-amber-500/15 text-amber-400 border-amber-800/30"}`}
                    >
                      {status === "success" ? "All imported" : "Partial"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {fmtDate(log.created_at)}
                    {log.actor && <> · {log.actor.full_name ?? log.actor.email ?? "Unknown"}</>}
                    {" · "}
                    <span className="text-green-400">{meta.imported ?? 0} imported</span>
                    {(meta.skipped ?? 0) > 0 && <>, <span className="text-muted-foreground">{meta.skipped} skipped</span></>}
                    {(meta.failed ?? 0) > 0 && <>, <span className="text-destructive">{meta.failed} failed</span></>}
                  </p>
                </div>
              </div>
              {expanded && (
                <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div><p className="text-xs text-muted-foreground">Imported</p><p className="font-semibold text-green-400">{meta.imported ?? 0}</p></div>
                    <div><p className="text-xs text-muted-foreground">Skipped</p><p className="font-semibold">{meta.skipped ?? 0}</p></div>
                    <div><p className="text-xs text-muted-foreground">Failed</p><p className="font-semibold text-destructive">{meta.failed ?? 0}</p></div>
                    <div><p className="text-xs text-muted-foreground">Quiz ID</p><p className="font-mono text-[10px] text-muted-foreground truncate">{log.target_id}</p></div>
                  </div>
                  {(meta.errors ?? []).length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-destructive uppercase tracking-wider">Import Errors ({meta.errors?.length})</p>
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => downloadErrors(log)}>
                          <Download className="w-3 h-3 mr-1" /> Download
                        </Button>
                      </div>
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 max-h-32 overflow-y-auto space-y-0.5">
                        {(meta.errors ?? []).map((e, i) => (
                          <p key={i} className="text-xs text-destructive">{e}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Visibility Dialog ─────────────────────────────────────────────────────────

function VisibilityDialog({ open, quiz, onClose, onSaved }: {
  open: boolean;
  quiz?: TestRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [roles, setRoles] = useState<string[]>(quiz?.allowed_roles ?? ["student", "admin", "super_admin"]);
  const [saving, setSaving] = useState(false);

  const currentRoles = quiz?.allowed_roles ?? ["student", "admin", "super_admin"];

  const handleOpen = (o: boolean) => {
    if (o && quiz) setRoles(currentRoles);
    if (!o) onClose();
  };

  async function handleSave() {
    if (!quiz) return;
    if (roles.length === 0) { toast({ title: "Select at least one role", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await apiFetch(`/admin/test-management/${quiz.id}/visibility`, {
        method: "PATCH",
        body: JSON.stringify({ allowed_roles: roles }),
      });
      onSaved();
    } catch (e: unknown) {
      toast({ title: "Update failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" /> Edit Access — {quiz?.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">Choose which roles can view and attempt this test.</p>
          <div className="flex flex-col gap-2.5">
            {ALL_ROLES.map(role => (
              <label key={role} className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-primary"
                  checked={roles.includes(role)}
                  onChange={e => {
                    setRoles(prev =>
                      e.target.checked ? [...prev, role] : prev.filter(r => r !== role)
                    );
                  }}
                />
                <span className="text-sm">{ROLE_LABELS[role]}</span>
              </label>
            ))}
          </div>
          {roles.length === 0 && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> At least one role is required
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || roles.length === 0}>
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
