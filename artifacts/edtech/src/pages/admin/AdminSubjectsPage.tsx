import { AppLayout } from "@/components/layout/AppLayout";
import { AdminBreadcrumb } from "@/components/layout/AdminBreadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, ChevronDown, ChevronRight, BookOpen, ExternalLink, Info, Link, Eye, Shield, Lock, Upload, Download, AlertCircle, CheckCircle2, Loader2, GripVertical } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSubjects, getGetSubjectsUrl,
  getChapters, getGetChaptersUrl,
  useDeleteSubject,
  useCreateChapter, useDeleteChapter,
  getTopics, getGetTopicsUrl,
} from "@workspace/api-client-react";
import type { Subject, Chapter, Topic } from "@workspace/api-client-react";
import { useState, useRef, useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { Separator } from "@/components/ui/separator";

// ── Augmented subject type with access-control fields ─────────────────────────
type SubjectWithAccess = Subject & {
  visibility_roles?: string[];
  is_creator_only?: boolean;
  creator_id?: string | null;
};

// ── Augmented topic type with access-control fields ───────────────────────────
type TopicWithAccess = Topic & {
  telegram_link?: string;
  allowed_roles?: string[];
  is_creator_only?: boolean;
  creator_id?: string | null;
};

type EditTarget =
  | {
      type: "subject";
      id?: string;
      data: {
        title: string;
        description: string;
        visibility_roles: string[];
        is_creator_only: boolean;
      };
    }
  | { type: "chapter"; subjectId: string; id?: string; data: { title: string; description: string } }
  | {
      type: "topic";
      chapterId: string;
      id?: string;
      data: {
        title: string;
        description: string;
        telegram_link: string;
        allowed_roles: string[];
        is_creator_only: boolean;
      };
    };

// ── Telegram link validation ───────────────────────────────────────────────────
function validateTelegramLink(v: string): string | undefined {
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.hostname !== "t.me") {
      return 'Must be a t.me URL — e.g. https://t.me/c/1234567890/42';
    }
  } catch {
    return 'Must be a valid URL starting with https://t.me/';
  }
  return undefined;
}

// ── Visibility helpers ────────────────────────────────────────────────────────
const ALL_ROLES = ["student", "admin", "super_admin"];

function visibilityLabel(roles: string[], creatorOnly: boolean): string {
  if (creatorOnly) return "Creator only";
  if (roles.length === 0) return "No access";
  if (ALL_ROLES.every(r => roles.includes(r))) return "All roles";
  const labels: string[] = [];
  if (roles.includes("student")) labels.push("Students");
  if (roles.includes("admin")) labels.push("Admins");
  if (roles.includes("super_admin")) labels.push("Super Admins");
  return labels.join(" + ");
}

function VisibilityBadge({ roles, creatorOnly }: { roles: string[]; creatorOnly: boolean }) {
  if (creatorOnly) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-400 shrink-0" title="Creator only">
        <Lock className="w-3 h-3" /> Creator only
      </span>
    );
  }
  const allRoles = ALL_ROLES.every(r => roles.includes(r));
  if (allRoles) return null;
  const studentAccess = roles.includes("student");
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs shrink-0 ${studentAccess ? "text-emerald-400" : "text-amber-400"}`}
      title={visibilityLabel(roles, creatorOnly)}
    >
      {studentAccess ? <Eye className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
      {visibilityLabel(roles, creatorOnly)}
    </span>
  );
}

// ── Visibility Settings section (reused for both subjects and topics) ─────────
function VisibilitySettings({
  isCreatorOnly,
  allowedRoles,
  onToggleCreatorOnly,
  onToggleRole,
  label = "Access Control",
  description = "Control who can view and access this content. Changes take effect immediately.",
  creatorOnlyDesc = "Only you (the creator) can access this. Super admins with an explicit grant can also access it.",
}: {
  isCreatorOnly: boolean;
  allowedRoles: string[];
  onToggleCreatorOnly: (v: boolean) => void;
  onToggleRole: (role: string) => void;
  label?: string;
  description?: string;
  creatorOnlyDesc?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Lock className="w-3.5 h-3.5 text-primary" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>

      {/* Creator Only toggle */}
      <label className="flex items-start gap-3 cursor-pointer rounded-md border border-border bg-muted/20 px-3 py-2.5 hover:bg-muted/40 transition-colors">
        <Checkbox
          checked={isCreatorOnly}
          onCheckedChange={(checked) => onToggleCreatorOnly(checked === true)}
          className="mt-0.5"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            Creator Only
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{creatorOnlyDesc}</p>
        </div>
      </label>

      {/* Role checkboxes (hidden when creator-only) */}
      {!isCreatorOnly && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Visible to:</p>
          {[
            { role: "student", label: "Students", desc: "Regular enrolled students can view this content." },
            { role: "admin", label: "Admins", desc: "Admin accounts can access and manage this content." },
            { role: "super_admin", label: "Super Admins", desc: "Super admin accounts can access this content." },
          ].map(({ role, label: roleLabel, desc }) => (
            <label key={role} className="flex items-start gap-3 cursor-pointer rounded-md px-3 py-2 hover:bg-muted/30 transition-colors">
              <Checkbox
                checked={allowedRoles.includes(role)}
                onCheckedChange={() => onToggleRole(role)}
                className="mt-0.5"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">{roleLabel}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </label>
          ))}
          {allowedRoles.length === 0 && (
            <p className="text-xs text-destructive px-3">Select at least one role.</p>
          )}
        </div>
      )}

      {/* Preview */}
      <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">Current visibility: </span>
        {visibilityLabel(allowedRoles, isCreatorOnly)}
      </div>
    </div>
  );
}

// ── Subject bulk import ───────────────────────────────────────────────────────

const SUBJECT_CSV_TEMPLATE = `subject_name,description,display_order
Physics,Study of matter energy and forces,1
Chemistry,Study of elements compounds and reactions,2
Mathematics,Study of numbers equations and proofs,3`;

type ImportSubject = { subject_name: string; description: string; display_order: number };
type SubjectImportResult = {
  message: string;
  imported: number;
  duplicates: number;
  failed: number;
  errors: Array<{ subject_name: string; error: string }>;
};

function parseSubjectCSV(text: string): ImportSubject[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const ni = headers.indexOf("subject_name");
  const di = headers.indexOf("description");
  const oi = headers.indexOf("display_order");
  if (ni === -1) throw new Error("CSV must have a 'subject_name' column");
  return lines.slice(1).map((line, idx) => {
    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    return {
      subject_name: cols[ni] ?? "",
      description: di !== -1 ? (cols[di] ?? "") : "",
      display_order: oi !== -1 ? (parseInt(cols[oi] ?? "", 10) || idx + 1) : idx + 1,
    };
  }).filter(s => s.subject_name.trim());
}

function SubjectImportDialog({ open, onClose, onImported }: {
  open: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportSubject[] | null>(null);
  const [importResult, setImportResult] = useState<SubjectImportResult | null>(null);

  function downloadTemplate() {
    const blob = new Blob([SUBJECT_CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "subject_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetDialog() {
    setCsv("");
    setParseError(null);
    setPreview(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setPreview(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        const parsed = parseSubjectCSV(text);
        if (parsed.length === 0) { setParseError("No valid rows found. Check the CSV format."); return; }
        setCsv(text);
        setPreview(parsed);
      } catch (err) { setParseError((err as Error).message); }
    };
    reader.readAsText(file);
  }

  function handleCsvChange(text: string) {
    setCsv(text);
    setParseError(null);
    setPreview(null);
    if (!text.trim()) return;
    try {
      const parsed = parseSubjectCSV(text);
      if (parsed.length > 0) setPreview(parsed);
    } catch (err) { setParseError((err as Error).message); }
  }

  async function handleImport() {
    if (!preview || preview.length === 0) return;
    setImporting(true);
    try {
      const result = await apiFetch("/admin/subjects/bulk-import", {
        method: "POST",
        body: JSON.stringify({
          subjects: preview.map(s => ({
            title: s.subject_name,
            description: s.description || null,
            order_index: s.display_order,
          })),
        }),
      }) as SubjectImportResult;
      setImportResult(result);
    } catch (err) {
      setParseError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { resetDialog(); onClose(); } }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" /> Bulk Import Subjects
          </DialogTitle>
        </DialogHeader>

        {importResult ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-success shrink-0" />
              <div>
                <p className="font-semibold text-lg">Import Complete</p>
                <p className="text-sm text-muted-foreground">
                  <span className="text-success font-medium">{importResult.imported} created</span>
                  {importResult.duplicates > 0 && <>, <span className="text-warning font-medium">{importResult.duplicates} duplicate{importResult.duplicates !== 1 ? "s" : ""} skipped</span></>}
                  {importResult.failed > 0 && <>, <span className="text-destructive font-medium">{importResult.failed} failed</span></>}
                </p>
              </div>
            </div>
            {importResult.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1 max-h-52 overflow-y-auto">
                <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-2">Skipped / Failed rows</p>
                {importResult.errors.map((e, i) => (
                  <div key={i} className="text-xs flex gap-2">
                    {e.subject_name && <span className="text-muted-foreground font-medium shrink-0">{e.subject_name}</span>}
                    <span className="text-destructive">{e.error}</span>
                  </div>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => { resetDialog(); onImported(importResult.imported); onClose(); }}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2 text-sm">
              <p className="font-medium">File format</p>
              <p className="text-muted-foreground text-xs">
                Upload a <span className="font-mono text-foreground">.csv</span> file.
                Required column: <span className="font-mono text-foreground">subject_name</span>.
                Optional: <span className="font-mono text-foreground">description</span>, <span className="font-mono text-foreground">display_order</span> (integer).
                Duplicate subjects are automatically skipped. Maximum 500 rows per import.
              </p>
              <Button variant="outline" size="sm" className="gap-1.5 mt-1" onClick={downloadTemplate}>
                <Download className="w-3.5 h-3.5" /> Download CSV Template
              </Button>
            </div>

            <div
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">Click to select CSV file</p>
              <p className="text-xs text-muted-foreground mt-1">or paste below</p>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            </div>

            <div>
              <textarea
                rows={4}
                value={csv}
                onChange={e => handleCsvChange(e.target.value)}
                placeholder={SUBJECT_CSV_TEMPLATE}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>

            {parseError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{parseError}</span>
              </div>
            )}

            {preview && preview.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{preview.length} subject{preview.length !== 1 ? "s" : ""} ready to import</p>
                  <Badge variant="outline" className="text-xs">{preview.length} row{preview.length !== 1 ? "s" : ""}</Badge>
                </div>
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-60 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 sticky top-0">
                        <tr>
                          {["#", "Subject Name", "Description", "Display Order"].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {preview.map((s, i) => (
                          <tr key={i} className="hover:bg-muted/20">
                            <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                            <td className="px-3 py-2 font-medium truncate max-w-[160px]">{s.subject_name}</td>
                            <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{s.description || "—"}</td>
                            <td className="px-3 py-2 text-center text-muted-foreground">{s.display_order}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <DialogFooter className="pt-2">
                  <Button variant="outline" onClick={() => { resetDialog(); onClose(); }}>Cancel</Button>
                  <Button disabled={importing} onClick={handleImport}>
                    {importing
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing…</>
                      : `Import ${preview.length} Subject${preview.length !== 1 ? "s" : ""}`}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Chapter, Topic & Hierarchy import ─────────────────────────────────────────

const CHAPTER_CSV_TEMPLATE = `subject_name,chapter_name,description,display_order
Physics,Mechanics,Study of motion and forces,1
Physics,Thermodynamics,Study of heat and temperature,2
Mathematics,Calculus,Study of derivatives and integrals,1`;

const TOPIC_CSV_TEMPLATE = `subject_name,chapter_name,topic_name,description,display_order
Physics,Mechanics,Newton's Laws,Understanding Newton's three laws of motion,1
Physics,Mechanics,Work Energy Power,Conservation of energy and work-energy theorem,2
Physics,Thermodynamics,Heat Transfer,Conduction convection and radiation,1`;

const HIERARCHY_CSV_TEMPLATE = `subject,chapter,topic,description
Physics,Mechanics,Newton's Laws,Understanding Newton's three laws
Physics,Mechanics,Friction,Study of frictional forces
Physics,Thermodynamics,Heat Transfer,Conduction convection radiation
Chemistry,Atomic Structure,Bohr's Model,Quantum mechanical model of atom
Mathematics,Calculus,Derivatives,Rate of change and differentiation`;

type ImportChapter = { subject_name: string; chapter_name: string; description: string; display_order: number };
type ChapterImportResult = { message: string; imported: number; duplicates: number; failed: number; errors: Array<{ row: number; chapter_name: string; error: string }> };

type ImportTopic = { subject_name: string; chapter_name: string; topic_name: string; description: string; display_order: number };
type TopicImportResult = { message: string; imported: number; duplicates: number; failed: number; errors: Array<{ row: number; topic_name: string; error: string }> };

type ImportHierarchyRow = { subject: string; chapter: string; topic: string; description: string };
type HierarchyImportResult = { message: string; subjects_created: number; chapters_created: number; topics_created: number; topics_skipped: number; errors: Array<{ row: number; error: string }> };

function parseChapterCSV(text: string): ImportChapter[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const si = headers.indexOf("subject_name");
  const ci = headers.indexOf("chapter_name");
  const di = headers.indexOf("description");
  const oi = headers.indexOf("display_order");
  if (si === -1) throw new Error("CSV must have a 'subject_name' column");
  if (ci === -1) throw new Error("CSV must have a 'chapter_name' column");
  return lines.slice(1).map((line, idx) => {
    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    return {
      subject_name: cols[si] ?? "",
      chapter_name: cols[ci] ?? "",
      description: di !== -1 ? (cols[di] ?? "") : "",
      display_order: oi !== -1 ? (parseInt(cols[oi] ?? "", 10) || idx + 1) : idx + 1,
    };
  }).filter(c => c.subject_name.trim() && c.chapter_name.trim());
}

function parseTopicCSV(text: string): ImportTopic[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const si = headers.indexOf("subject_name");
  const chi = headers.indexOf("chapter_name");
  const ti = headers.indexOf("topic_name");
  const di = headers.indexOf("description");
  const oi = headers.indexOf("display_order");
  if (si === -1) throw new Error("CSV must have a 'subject_name' column");
  if (chi === -1) throw new Error("CSV must have a 'chapter_name' column");
  if (ti === -1) throw new Error("CSV must have a 'topic_name' column");
  return lines.slice(1).map((line, idx) => {
    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    return {
      subject_name: cols[si] ?? "",
      chapter_name: cols[chi] ?? "",
      topic_name: cols[ti] ?? "",
      description: di !== -1 ? (cols[di] ?? "") : "",
      display_order: oi !== -1 ? (parseInt(cols[oi] ?? "", 10) || idx + 1) : idx + 1,
    };
  }).filter(t => t.subject_name.trim() && t.chapter_name.trim() && t.topic_name.trim());
}

function parseHierarchyCSV(text: string): ImportHierarchyRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const si = headers.indexOf("subject");
  const ci = headers.indexOf("chapter");
  const ti = headers.indexOf("topic");
  const di = headers.indexOf("description");
  if (si === -1) throw new Error("CSV must have a 'subject' column");
  if (ci === -1) throw new Error("CSV must have a 'chapter' column");
  if (ti === -1) throw new Error("CSV must have a 'topic' column");
  return lines.slice(1).map(line => {
    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    return {
      subject: cols[si] ?? "",
      chapter: cols[ci] ?? "",
      topic: cols[ti] ?? "",
      description: di !== -1 ? (cols[di] ?? "") : "",
    };
  }).filter(r => r.subject.trim() && r.chapter.trim() && r.topic.trim());
}

function dlCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ImportErrorList({ errors }: { errors: Array<{ error: string } & Record<string, unknown>> }) {
  if (!errors.length) return null;
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1 max-h-44 overflow-y-auto">
      <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-2">
        Skipped / Failed rows ({errors.length})
      </p>
      {errors.map((e, i) => (
        <p key={i} className="text-xs text-destructive">{e.error}</p>
      ))}
    </div>
  );
}

function UploadArea({ fileRef, onFile }: { fileRef: React.RefObject<HTMLInputElement>; onFile: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div
      className="border-2 border-dashed border-border rounded-lg p-5 text-center cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => fileRef.current?.click()}
    >
      <Upload className="w-7 h-7 text-muted-foreground mx-auto mb-1.5" />
      <p className="text-sm font-medium">Click to select CSV file</p>
      <p className="text-xs text-muted-foreground mt-0.5">or paste below</p>
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
    </div>
  );
}

function ContentBulkImportDialog({ open, onClose, onImported }: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [tab, setTab] = useState("subjects");

  // ── Subjects ──────────────────────────────────────────────────────────────────
  const sRef = useRef<HTMLInputElement>(null);
  const [sCsv, setSCsv] = useState(""); const [sPreview, setSPreview] = useState<ImportSubject[] | null>(null);
  const [sErr, setSErr] = useState<string | null>(null); const [sImporting, setSImporting] = useState(false);
  const [sResult, setSResult] = useState<SubjectImportResult | null>(null);

  // ── Chapters ──────────────────────────────────────────────────────────────────
  const cRef = useRef<HTMLInputElement>(null);
  const [cCsv, setCCsv] = useState(""); const [cPreview, setCPreview] = useState<ImportChapter[] | null>(null);
  const [cErr, setCErr] = useState<string | null>(null); const [cImporting, setCImporting] = useState(false);
  const [cResult, setCResult] = useState<ChapterImportResult | null>(null);

  // ── Topics ────────────────────────────────────────────────────────────────────
  const tRef = useRef<HTMLInputElement>(null);
  const [tCsv, setTCsv] = useState(""); const [tPreview, setTPreview] = useState<ImportTopic[] | null>(null);
  const [tErr, setTErr] = useState<string | null>(null); const [tImporting, setTImporting] = useState(false);
  const [tResult, setTResult] = useState<TopicImportResult | null>(null);

  // ── Hierarchy ─────────────────────────────────────────────────────────────────
  const hRef = useRef<HTMLInputElement>(null);
  const [hCsv, setHCsv] = useState(""); const [hPreview, setHPreview] = useState<ImportHierarchyRow[] | null>(null);
  const [hErr, setHErr] = useState<string | null>(null); const [hImporting, setHImporting] = useState(false);
  const [hResult, setHResult] = useState<HierarchyImportResult | null>(null);

  function resetAll() {
    setSCsv(""); setSPreview(null); setSErr(null); setSResult(null); if (sRef.current) sRef.current.value = "";
    setCCsv(""); setCPreview(null); setCErr(null); setCResult(null); if (cRef.current) cRef.current.value = "";
    setTCsv(""); setTPreview(null); setTErr(null); setTResult(null); if (tRef.current) tRef.current.value = "";
    setHCsv(""); setHPreview(null); setHErr(null); setHResult(null); if (hRef.current) hRef.current.value = "";
    setTab("subjects");
  }

  // ── Subject handlers ──────────────────────────────────────────────────────────
  function handleSCsv(text: string) {
    setSCsv(text); setSErr(null); setSPreview(null);
    if (!text.trim()) return;
    try { const p = parseSubjectCSV(text); if (p.length > 0) setSPreview(p); } catch (e) { setSErr((e as Error).message); }
  }
  function handleSFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setSErr(null); setSPreview(null);
    const r = new FileReader(); r.onload = ev => { try { handleSCsv(ev.target?.result as string); } catch {} }; r.readAsText(f);
  }
  async function handleSImport() {
    if (!sPreview?.length) return;
    setSImporting(true);
    try {
      const res = await apiFetch("/admin/subjects/bulk-import", { method: "POST", body: JSON.stringify({ subjects: sPreview.map(s => ({ title: s.subject_name, description: s.description || null, order_index: s.display_order })) }) }) as SubjectImportResult;
      setSResult(res);
    } catch (e) { setSErr((e as Error).message); } finally { setSImporting(false); }
  }

  // ── Chapter handlers ──────────────────────────────────────────────────────────
  function handleCCsv(text: string) {
    setCCsv(text); setCErr(null); setCPreview(null);
    if (!text.trim()) return;
    try { const p = parseChapterCSV(text); if (p.length > 0) setCPreview(p); } catch (e) { setCErr((e as Error).message); }
  }
  function handleCFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setCErr(null); setCPreview(null);
    const r = new FileReader(); r.onload = ev => { try { handleCCsv(ev.target?.result as string); } catch {} }; r.readAsText(f);
  }
  async function handleCImport() {
    if (!cPreview?.length) return;
    setCImporting(true);
    try {
      const res = await apiFetch("/admin/chapters/bulk-import", { method: "POST", body: JSON.stringify({ chapters: cPreview.map(c => ({ subject_name: c.subject_name, chapter_name: c.chapter_name, description: c.description || null, display_order: c.display_order })) }) }) as ChapterImportResult;
      setCResult(res);
    } catch (e) { setCErr((e as Error).message); } finally { setCImporting(false); }
  }

  // ── Topic handlers ────────────────────────────────────────────────────────────
  function handleTCsv(text: string) {
    setTCsv(text); setTErr(null); setTPreview(null);
    if (!text.trim()) return;
    try { const p = parseTopicCSV(text); if (p.length > 0) setTPreview(p); } catch (e) { setTErr((e as Error).message); }
  }
  function handleTFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setTErr(null); setTPreview(null);
    const r = new FileReader(); r.onload = ev => { try { handleTCsv(ev.target?.result as string); } catch {} }; r.readAsText(f);
  }
  async function handleTImport() {
    if (!tPreview?.length) return;
    setTImporting(true);
    try {
      const res = await apiFetch("/admin/topics/bulk-import", { method: "POST", body: JSON.stringify({ topics: tPreview.map(t => ({ subject_name: t.subject_name, chapter_name: t.chapter_name, topic_name: t.topic_name, description: t.description || null, display_order: t.display_order })) }) }) as TopicImportResult;
      setTResult(res);
    } catch (e) { setTErr((e as Error).message); } finally { setTImporting(false); }
  }

  // ── Hierarchy handlers ────────────────────────────────────────────────────────
  function handleHCsv(text: string) {
    setHCsv(text); setHErr(null); setHPreview(null);
    if (!text.trim()) return;
    try { const p = parseHierarchyCSV(text); if (p.length > 0) setHPreview(p); } catch (e) { setHErr((e as Error).message); }
  }
  function handleHFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setHErr(null); setHPreview(null);
    const r = new FileReader(); r.onload = ev => { try { handleHCsv(ev.target?.result as string); } catch {} }; r.readAsText(f);
  }
  async function handleHImport() {
    if (!hPreview?.length) return;
    setHImporting(true);
    try {
      const res = await apiFetch("/admin/hierarchy/bulk-import", { method: "POST", body: JSON.stringify({ rows: hPreview }) }) as HierarchyImportResult;
      setHResult(res);
    } catch (e) { setHErr((e as Error).message); } finally { setHImporting(false); }
  }

  const sCount = sPreview?.length ?? 0;
  const cCount = cPreview?.length ?? 0;
  const tCount = tPreview?.length ?? 0;
  const hCount = hPreview?.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { resetAll(); onClose(); } }}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" /> Bulk Import Content
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          {/* Mobile: dropdown selector */}
          <div className="md:hidden">
            <select
              value={tab}
              onChange={e => setTab(e.target.value)}
              className="w-full rounded-md border border-border bg-muted px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="subjects">Subjects</option>
              <option value="chapters">Chapters</option>
              <option value="topics">Topics</option>
              <option value="hierarchy">Full Hierarchy</option>
            </select>
          </div>
          {/* Desktop: full tab row */}
          <TabsList className="hidden md:grid w-full grid-cols-4">
            <TabsTrigger value="subjects">Subjects</TabsTrigger>
            <TabsTrigger value="chapters">Chapters</TabsTrigger>
            <TabsTrigger value="topics">Topics</TabsTrigger>
            <TabsTrigger value="hierarchy">Full Hierarchy</TabsTrigger>
          </TabsList>

          {/* ── SUBJECTS ──────────────────────────────────────────────────────── */}
          <TabsContent value="subjects" className="mt-4 space-y-4">
            {sResult ? (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-8 h-8 text-success shrink-0" />
                  <div>
                    <p className="font-semibold text-lg">Import Complete</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="text-success font-medium">{sResult.imported} created</span>
                      {sResult.duplicates > 0 && <>, <span className="text-warning font-medium">{sResult.duplicates} duplicate{sResult.duplicates !== 1 ? "s" : ""} skipped</span></>}
                      {sResult.failed > 0 && <>, <span className="text-destructive font-medium">{sResult.failed} failed</span></>}
                    </p>
                  </div>
                </div>
                <ImportErrorList errors={sResult.errors} />
                <DialogFooter><Button onClick={() => { resetAll(); onImported(); onClose(); }}>Done</Button></DialogFooter>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <p className="font-medium">File format — Subjects</p>
                    <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => dlCsv(SUBJECT_CSV_TEMPLATE, "subject_import_template.csv")}>
                      <Download className="w-3.5 h-3.5" /> Download CSV Template
                    </Button>
                  </div>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/60">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap">Column</th>
                          <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap">Required</th>
                          <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        <tr><td className="px-3 py-1.5 font-mono text-primary">subject_name</td><td className="px-3 py-1.5 text-success font-medium">Yes</td><td className="px-3 py-1.5 text-muted-foreground">Unique subject title (e.g. Physics)</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono text-muted-foreground">description</td><td className="px-3 py-1.5 text-muted-foreground">No</td><td className="px-3 py-1.5 text-muted-foreground">Short description shown to students</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono text-muted-foreground">display_order</td><td className="px-3 py-1.5 text-muted-foreground">No</td><td className="px-3 py-1.5 text-muted-foreground">Number controlling sort order (default: 0)</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5 font-medium">Example rows:</p>
                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="w-full text-xs font-mono">
                        <thead className="bg-muted/60">
                          <tr>
                            <th className="px-3 py-1.5 text-left text-muted-foreground font-normal">subject_name</th>
                            <th className="px-3 py-1.5 text-left text-muted-foreground font-normal">description</th>
                            <th className="px-3 py-1.5 text-left text-muted-foreground font-normal">display_order</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          <tr className="hover:bg-muted/20"><td className="px-3 py-1.5">Physics</td><td className="px-3 py-1.5 text-muted-foreground">Study of matter and forces</td><td className="px-3 py-1.5 text-muted-foreground">1</td></tr>
                          <tr className="hover:bg-muted/20"><td className="px-3 py-1.5">Chemistry</td><td className="px-3 py-1.5 text-muted-foreground">Study of elements and reactions</td><td className="px-3 py-1.5 text-muted-foreground">2</td></tr>
                          <tr className="hover:bg-muted/20"><td className="px-3 py-1.5">Mathematics</td><td className="px-3 py-1.5 text-muted-foreground"></td><td className="px-3 py-1.5 text-muted-foreground">3</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Duplicates skipped. Max 500 rows.</p>
                </div>
                <UploadArea fileRef={sRef} onFile={handleSFile} />
                <textarea rows={4} value={sCsv} onChange={e => handleSCsv(e.target.value)} placeholder={SUBJECT_CSV_TEMPLATE}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
                {sErr && <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{sErr}</span></div>}
                {sPreview && sPreview.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{sCount} subject{sCount !== 1 ? "s" : ""} ready to import</p>
                      <Badge variant="outline" className="text-xs">{sCount} rows</Badge>
                    </div>
                    <div className="border border-border rounded-lg overflow-hidden">
                      <div className="overflow-x-auto max-h-52 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/40 sticky top-0">
                            <tr>{["#","Subject Name","Description","Order"].map(h => <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}</tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {sPreview.map((s, i) => (
                              <tr key={i} className="hover:bg-muted/20">
                                <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                                <td className="px-3 py-2 font-medium">{s.subject_name}</td>
                                <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{s.description || "—"}</td>
                                <td className="px-3 py-2 text-center text-muted-foreground">{s.display_order}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <DialogFooter className="pt-1">
                      <Button variant="outline" onClick={() => { resetAll(); onClose(); }}>Cancel</Button>
                      <Button disabled={sImporting} onClick={handleSImport}>
                        {sImporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing…</> : `Import ${sCount} Subject${sCount !== 1 ? "s" : ""}`}
                      </Button>
                    </DialogFooter>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* ── CHAPTERS ──────────────────────────────────────────────────────── */}
          <TabsContent value="chapters" className="mt-4 space-y-4">
            {cResult ? (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-8 h-8 text-success shrink-0" />
                  <div>
                    <p className="font-semibold text-lg">Import Complete</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="text-success font-medium">{cResult.imported} created</span>
                      {cResult.duplicates > 0 && <>, <span className="text-warning font-medium">{cResult.duplicates} duplicate{cResult.duplicates !== 1 ? "s" : ""} skipped</span></>}
                      {cResult.failed > 0 && <>, <span className="text-destructive font-medium">{cResult.failed} failed</span></>}
                    </p>
                  </div>
                </div>
                <ImportErrorList errors={cResult.errors} />
                <DialogFooter><Button onClick={() => { resetAll(); onImported(); onClose(); }}>Done</Button></DialogFooter>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <p className="font-medium">File format — Chapters</p>
                    <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => dlCsv(CHAPTER_CSV_TEMPLATE, "chapter_import_template.csv")}>
                      <Download className="w-3.5 h-3.5" /> Download CSV Template
                    </Button>
                  </div>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/60">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap">Column</th>
                          <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap">Required</th>
                          <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        <tr><td className="px-3 py-1.5 font-mono text-primary">subject_name</td><td className="px-3 py-1.5 text-success font-medium">Yes</td><td className="px-3 py-1.5 text-muted-foreground">Must match an existing subject exactly</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono text-primary">chapter_name</td><td className="px-3 py-1.5 text-success font-medium">Yes</td><td className="px-3 py-1.5 text-muted-foreground">Chapter title (unique within its subject)</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono text-muted-foreground">description</td><td className="px-3 py-1.5 text-muted-foreground">No</td><td className="px-3 py-1.5 text-muted-foreground">Short description shown to students</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono text-muted-foreground">display_order</td><td className="px-3 py-1.5 text-muted-foreground">No</td><td className="px-3 py-1.5 text-muted-foreground">Number controlling sort order (default: 0)</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5 font-medium">Example rows:</p>
                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="w-full text-xs font-mono">
                        <thead className="bg-muted/60">
                          <tr>
                            <th className="px-3 py-1.5 text-left text-muted-foreground font-normal">subject_name</th>
                            <th className="px-3 py-1.5 text-left text-muted-foreground font-normal">chapter_name</th>
                            <th className="px-3 py-1.5 text-left text-muted-foreground font-normal">description</th>
                            <th className="px-3 py-1.5 text-left text-muted-foreground font-normal">display_order</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          <tr className="hover:bg-muted/20"><td className="px-3 py-1.5">Physics</td><td className="px-3 py-1.5">Mechanics</td><td className="px-3 py-1.5 text-muted-foreground">Laws of motion and forces</td><td className="px-3 py-1.5 text-muted-foreground">1</td></tr>
                          <tr className="hover:bg-muted/20"><td className="px-3 py-1.5">Physics</td><td className="px-3 py-1.5">Thermodynamics</td><td className="px-3 py-1.5 text-muted-foreground"></td><td className="px-3 py-1.5 text-muted-foreground">2</td></tr>
                          <tr className="hover:bg-muted/20"><td className="px-3 py-1.5">Mathematics</td><td className="px-3 py-1.5">Calculus</td><td className="px-3 py-1.5 text-muted-foreground">Differentiation and integration</td><td className="px-3 py-1.5 text-muted-foreground">1</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Subject must already exist. Duplicates skipped. Max 500 rows.</p>
                </div>
                <UploadArea fileRef={cRef} onFile={handleCFile} />
                <textarea rows={4} value={cCsv} onChange={e => handleCCsv(e.target.value)} placeholder={CHAPTER_CSV_TEMPLATE}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
                {cErr && <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{cErr}</span></div>}
                {cPreview && cPreview.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{cCount} chapter{cCount !== 1 ? "s" : ""} ready to import</p>
                      <Badge variant="outline" className="text-xs">{cCount} rows</Badge>
                    </div>
                    <div className="border border-border rounded-lg overflow-hidden">
                      <div className="overflow-x-auto max-h-52 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/40 sticky top-0">
                            <tr>{["#","Subject","Chapter","Description","Order"].map(h => <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}</tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {cPreview.map((c, i) => (
                              <tr key={i} className="hover:bg-muted/20">
                                <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                                <td className="px-3 py-2 text-muted-foreground">{c.subject_name}</td>
                                <td className="px-3 py-2 font-medium">{c.chapter_name}</td>
                                <td className="px-3 py-2 text-muted-foreground truncate max-w-[160px]">{c.description || "—"}</td>
                                <td className="px-3 py-2 text-center text-muted-foreground">{c.display_order}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <DialogFooter className="pt-1">
                      <Button variant="outline" onClick={() => { resetAll(); onClose(); }}>Cancel</Button>
                      <Button disabled={cImporting} onClick={handleCImport}>
                        {cImporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing…</> : `Import ${cCount} Chapter${cCount !== 1 ? "s" : ""}`}
                      </Button>
                    </DialogFooter>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* ── TOPICS ────────────────────────────────────────────────────────── */}
          <TabsContent value="topics" className="mt-4 space-y-4">
            {tResult ? (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-8 h-8 text-success shrink-0" />
                  <div>
                    <p className="font-semibold text-lg">Import Complete</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="text-success font-medium">{tResult.imported} created</span>
                      {tResult.duplicates > 0 && <>, <span className="text-warning font-medium">{tResult.duplicates} duplicate{tResult.duplicates !== 1 ? "s" : ""} skipped</span></>}
                      {tResult.failed > 0 && <>, <span className="text-destructive font-medium">{tResult.failed} failed</span></>}
                    </p>
                  </div>
                </div>
                <ImportErrorList errors={tResult.errors} />
                <DialogFooter><Button onClick={() => { resetAll(); onImported(); onClose(); }}>Done</Button></DialogFooter>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <p className="font-medium">File format — Topics</p>
                    <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => dlCsv(TOPIC_CSV_TEMPLATE, "topic_import_template.csv")}>
                      <Download className="w-3.5 h-3.5" /> Download CSV Template
                    </Button>
                  </div>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/60">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap">Column</th>
                          <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap">Required</th>
                          <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        <tr><td className="px-3 py-1.5 font-mono text-primary">subject_name</td><td className="px-3 py-1.5 text-success font-medium">Yes</td><td className="px-3 py-1.5 text-muted-foreground">Must match an existing subject exactly</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono text-primary">chapter_name</td><td className="px-3 py-1.5 text-success font-medium">Yes</td><td className="px-3 py-1.5 text-muted-foreground">Must match an existing chapter under that subject</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono text-primary">topic_name</td><td className="px-3 py-1.5 text-success font-medium">Yes</td><td className="px-3 py-1.5 text-muted-foreground">Topic title (unique within its chapter)</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono text-muted-foreground">description</td><td className="px-3 py-1.5 text-muted-foreground">No</td><td className="px-3 py-1.5 text-muted-foreground">Short description shown to students</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono text-muted-foreground">display_order</td><td className="px-3 py-1.5 text-muted-foreground">No</td><td className="px-3 py-1.5 text-muted-foreground">Number controlling sort order (default: 0)</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5 font-medium">Example rows:</p>
                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="w-full text-xs font-mono">
                        <thead className="bg-muted/60">
                          <tr>
                            <th className="px-3 py-1.5 text-left text-muted-foreground font-normal">subject_name</th>
                            <th className="px-3 py-1.5 text-left text-muted-foreground font-normal">chapter_name</th>
                            <th className="px-3 py-1.5 text-left text-muted-foreground font-normal">topic_name</th>
                            <th className="px-3 py-1.5 text-left text-muted-foreground font-normal">display_order</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          <tr className="hover:bg-muted/20"><td className="px-3 py-1.5">Physics</td><td className="px-3 py-1.5">Mechanics</td><td className="px-3 py-1.5">Newton's Laws</td><td className="px-3 py-1.5 text-muted-foreground">1</td></tr>
                          <tr className="hover:bg-muted/20"><td className="px-3 py-1.5">Physics</td><td className="px-3 py-1.5">Mechanics</td><td className="px-3 py-1.5">Work Energy Power</td><td className="px-3 py-1.5 text-muted-foreground">2</td></tr>
                          <tr className="hover:bg-muted/20"><td className="px-3 py-1.5">Physics</td><td className="px-3 py-1.5">Thermodynamics</td><td className="px-3 py-1.5">Heat Transfer</td><td className="px-3 py-1.5 text-muted-foreground">1</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Subject and Chapter must already exist. Max 1000 rows.</p>
                </div>
                <UploadArea fileRef={tRef} onFile={handleTFile} />
                <textarea rows={4} value={tCsv} onChange={e => handleTCsv(e.target.value)} placeholder={TOPIC_CSV_TEMPLATE}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
                {tErr && <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{tErr}</span></div>}
                {tPreview && tPreview.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{tCount} topic{tCount !== 1 ? "s" : ""} ready to import</p>
                      <Badge variant="outline" className="text-xs">{tCount} rows</Badge>
                    </div>
                    <div className="border border-border rounded-lg overflow-hidden">
                      <div className="overflow-x-auto max-h-52 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/40 sticky top-0">
                            <tr>{["#","Subject","Chapter","Topic","Description"].map(h => <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}</tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {tPreview.map((t, i) => (
                              <tr key={i} className="hover:bg-muted/20">
                                <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                                <td className="px-3 py-2 text-muted-foreground">{t.subject_name}</td>
                                <td className="px-3 py-2 text-muted-foreground">{t.chapter_name}</td>
                                <td className="px-3 py-2 font-medium">{t.topic_name}</td>
                                <td className="px-3 py-2 text-muted-foreground truncate max-w-[160px]">{t.description || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <DialogFooter className="pt-1">
                      <Button variant="outline" onClick={() => { resetAll(); onClose(); }}>Cancel</Button>
                      <Button disabled={tImporting} onClick={handleTImport}>
                        {tImporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing…</> : `Import ${tCount} Topic${tCount !== 1 ? "s" : ""}`}
                      </Button>
                    </DialogFooter>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* ── FULL HIERARCHY ────────────────────────────────────────────────── */}
          <TabsContent value="hierarchy" className="mt-4 space-y-4">
            {hResult ? (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-8 h-8 text-success shrink-0" />
                  <div>
                    <p className="font-semibold text-lg">Hierarchy Import Complete</p>
                    <div className="text-sm text-muted-foreground space-y-0.5 mt-1">
                      {hResult.subjects_created > 0 && <p><span className="text-success font-medium">{hResult.subjects_created} subject{hResult.subjects_created !== 1 ? "s" : ""}</span> created</p>}
                      {hResult.chapters_created > 0 && <p><span className="text-success font-medium">{hResult.chapters_created} chapter{hResult.chapters_created !== 1 ? "s" : ""}</span> created</p>}
                      <p>
                        <span className="text-success font-medium">{hResult.topics_created} topic{hResult.topics_created !== 1 ? "s" : ""}</span> created
                        {hResult.topics_skipped > 0 && <>, <span className="text-muted-foreground">{hResult.topics_skipped} skipped (already exist)</span></>}
                      </p>
                      {hResult.subjects_created === 0 && hResult.chapters_created === 0 && <p className="text-muted-foreground text-xs">All subjects and chapters already existed.</p>}
                    </div>
                  </div>
                </div>
                <ImportErrorList errors={hResult.errors} />
                <DialogFooter><Button onClick={() => { resetAll(); onImported(); onClose(); }}>Done</Button></DialogFooter>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-medium text-primary">Recommended: Full Hierarchy Import</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Creates subjects, chapters, and topics in one pass. Missing entries are auto-created; existing ones are safely skipped.</p>
                    </div>
                    <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => dlCsv(HIERARCHY_CSV_TEMPLATE, "hierarchy_import_template.csv")}>
                      <Download className="w-3.5 h-3.5" /> Download CSV Template
                    </Button>
                  </div>
                  <div className="overflow-x-auto rounded-md border border-primary/20">
                    <table className="w-full text-xs">
                      <thead className="bg-primary/10">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap">Column</th>
                          <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap">Required</th>
                          <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        <tr><td className="px-3 py-1.5 font-mono text-primary">subject</td><td className="px-3 py-1.5 text-success font-medium">Yes</td><td className="px-3 py-1.5 text-muted-foreground">Subject name — created automatically if missing</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono text-primary">chapter</td><td className="px-3 py-1.5 text-success font-medium">Yes</td><td className="px-3 py-1.5 text-muted-foreground">Chapter name — created under subject if missing</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono text-primary">topic</td><td className="px-3 py-1.5 text-success font-medium">Yes</td><td className="px-3 py-1.5 text-muted-foreground">Topic name — created under chapter if missing</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono text-muted-foreground">description</td><td className="px-3 py-1.5 text-muted-foreground">No</td><td className="px-3 py-1.5 text-muted-foreground">Topic description shown to students</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5 font-medium">Example rows:</p>
                    <div className="overflow-x-auto rounded-md border border-primary/20">
                      <table className="w-full text-xs font-mono">
                        <thead className="bg-primary/10">
                          <tr>
                            <th className="px-3 py-1.5 text-left text-muted-foreground font-normal">subject</th>
                            <th className="px-3 py-1.5 text-left text-muted-foreground font-normal">chapter</th>
                            <th className="px-3 py-1.5 text-left text-muted-foreground font-normal">topic</th>
                            <th className="px-3 py-1.5 text-left text-muted-foreground font-normal">description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          <tr className="hover:bg-primary/5"><td className="px-3 py-1.5">Physics</td><td className="px-3 py-1.5">Mechanics</td><td className="px-3 py-1.5">Newton's Laws</td><td className="px-3 py-1.5 text-muted-foreground">Forces and motion</td></tr>
                          <tr className="hover:bg-primary/5"><td className="px-3 py-1.5">Physics</td><td className="px-3 py-1.5">Mechanics</td><td className="px-3 py-1.5">Friction</td><td className="px-3 py-1.5 text-muted-foreground"></td></tr>
                          <tr className="hover:bg-primary/5"><td className="px-3 py-1.5">Physics</td><td className="px-3 py-1.5">Thermodynamics</td><td className="px-3 py-1.5">Heat Transfer</td><td className="px-3 py-1.5 text-muted-foreground"></td></tr>
                          <tr className="hover:bg-primary/5"><td className="px-3 py-1.5">Chemistry</td><td className="px-3 py-1.5">Organic</td><td className="px-3 py-1.5">Hydrocarbons</td><td className="px-3 py-1.5 text-muted-foreground"></td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Max 1000 rows. No duplicates created.</p>
                </div>
                <UploadArea fileRef={hRef} onFile={handleHFile} />
                <textarea rows={5} value={hCsv} onChange={e => handleHCsv(e.target.value)} placeholder={HIERARCHY_CSV_TEMPLATE}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
                {hErr && <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{hErr}</span></div>}
                {hPreview && hPreview.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{hCount} row{hCount !== 1 ? "s" : ""} ready to import</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{new Set(hPreview.map(r => r.subject)).size} subjects</Badge>
                        <Badge variant="outline" className="text-xs">{new Set(hPreview.map(r => `${r.subject}:${r.chapter}`)).size} chapters</Badge>
                        <Badge variant="outline" className="text-xs">{hCount} topics</Badge>
                      </div>
                    </div>
                    <div className="border border-border rounded-lg overflow-hidden">
                      <div className="overflow-x-auto max-h-52 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/40 sticky top-0">
                            <tr>{["#","Subject","Chapter","Topic","Description"].map(h => <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}</tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {hPreview.map((r, i) => (
                              <tr key={i} className="hover:bg-muted/20">
                                <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                                <td className="px-3 py-2 text-muted-foreground">{r.subject}</td>
                                <td className="px-3 py-2 text-muted-foreground">{r.chapter}</td>
                                <td className="px-3 py-2 font-medium">{r.topic}</td>
                                <td className="px-3 py-2 text-muted-foreground truncate max-w-[160px]">{r.description || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <DialogFooter className="pt-1">
                      <Button variant="outline" onClick={() => { resetAll(); onClose(); }}>Cancel</Button>
                      <Button disabled={hImporting} onClick={handleHImport}>
                        {hImporting
                          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing…</>
                          : `Import ${hCount} Row${hCount !== 1 ? "s" : ""}`}
                      </Button>
                    </DialogFooter>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── Page component ─────────────────────────────────────────────────────────────

export default function AdminSubjectsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [importDialog, setImportDialog] = useState(false);

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: [getGetSubjectsUrl()],
    queryFn: () => getSubjects(),
  });

  const [subjectOrder, setSubjectOrder] = useState<string[] | null>(null);
  const prevSubjectCount = useRef(0);
  useEffect(() => {
    const count = (subjects as SubjectWithAccess[]).length;
    if (count !== prevSubjectCount.current) {
      prevSubjectCount.current = count;
      setSubjectOrder(null);
    }
  }, [subjects]);

  const displaySubjects = useMemo(() => {
    const list = subjects as SubjectWithAccess[];
    if (!subjectOrder) return list;
    const map = new Map(list.map(s => [s.id, s]));
    const ordered = subjectOrder.map(id => map.get(id)).filter((s): s is SubjectWithAccess => !!s);
    const extra = list.filter(s => !subjectOrder.includes(s.id));
    return [...ordered, ...extra];
  }, [subjects, subjectOrder]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  async function handleSubjectDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = displaySubjects.findIndex(s => s.id === active.id);
    const newIdx = displaySubjects.findIndex(s => s.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(displaySubjects, oldIdx, newIdx);
    setSubjectOrder(reordered.map(s => s.id));
    try {
      await apiFetch("/subjects/reorder", {
        method: "POST",
        body: JSON.stringify({ subjects: reordered.map((s, i) => ({ id: s.id, order_index: i + 1 })) }),
      });
    } catch {
      setSubjectOrder(null);
      toast({ title: "Failed to save order", variant: "destructive" });
    }
  }

  const deleteSubject = useDeleteSubject({
    mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: [getGetSubjectsUrl()] }); toast({ title: "Subject deleted" }); } },
  });
  const createChapter = useCreateChapter({
    mutation: { onSuccess: (_data, vars) => { queryClient.invalidateQueries({ queryKey: [getGetChaptersUrl(vars.subjectId)] }); toast({ title: "Chapter created" }); setEditTarget(null); } },
  });
  const deleteChapter = useDeleteChapter({
    mutation: { onSuccess: () => { queryClient.invalidateQueries(); toast({ title: "Chapter deleted" }); } },
  });

  function toggleSubject(id: string) {
    setExpandedSubjects(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleChapter(id: string) {
    setExpandedChapters(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function handleDeleteTopic(topicId: string) {
    try {
      await supabase.from("topics").update({ is_active: false }).eq("id", topicId);
      queryClient.invalidateQueries();
      toast({ title: "Topic removed" });
    } catch {
      toast({ title: "Error deleting topic", variant: "destructive" });
    }
  }

  async function handleSave() {
    if (!editTarget) return;
    setSaving(true);
    try {
      if (editTarget.type === "subject") {
        const d = editTarget.data;
        if (!d.title) { toast({ title: "Title required", variant: "destructive" }); setSaving(false); return; }
        if (!d.is_creator_only && d.visibility_roles.length === 0) {
          toast({ title: "Access control error", description: "Select at least one role, or enable Creator Only.", variant: "destructive" });
          setSaving(false);
          return;
        }
        const payload = {
          title: d.title,
          description: d.description,
          visibility_roles: d.is_creator_only ? ["super_admin"] : d.visibility_roles,
          is_creator_only: d.is_creator_only,
          order_index: subjects.length,
        };
        if (editTarget.id) {
          await apiFetch(`/subjects/${editTarget.id}`, { method: "PATCH", body: JSON.stringify(payload) });
          queryClient.invalidateQueries({ queryKey: [getGetSubjectsUrl()] });
          toast({ title: "Subject updated" });
        } else {
          await apiFetch("/subjects", { method: "POST", body: JSON.stringify(payload) });
          queryClient.invalidateQueries({ queryKey: [getGetSubjectsUrl()] });
          toast({ title: "Subject created" });
        }
        setEditTarget(null);
      } else if (editTarget.type === "chapter") {
        const d = editTarget.data;
        if (!d.title) { toast({ title: "Title required", variant: "destructive" }); setSaving(false); return; }
        await createChapter.mutateAsync({ subjectId: editTarget.subjectId, data: { ...d, order_index: 0 } });
      } else if (editTarget.type === "topic") {
        const d = editTarget.data;
        if (!d.title) { toast({ title: "Title required", variant: "destructive" }); setSaving(false); return; }
        const linkError = validateTelegramLink(d.telegram_link);
        if (linkError) {
          toast({ title: "Invalid Telegram link", description: linkError, variant: "destructive" });
          setSaving(false);
          return;
        }
        if (!d.is_creator_only && d.allowed_roles.length === 0) {
          toast({ title: "Access control error", description: "Select at least one role, or enable Creator Only.", variant: "destructive" });
          setSaving(false);
          return;
        }

        const topicPayload = {
          title: d.title,
          description: d.description,
          telegram_link: d.telegram_link.trim() || undefined,
          allowed_roles: d.is_creator_only ? ["super_admin"] : d.allowed_roles,
          is_creator_only: d.is_creator_only,
          order_index: 0,
        };

        if (editTarget.id) {
          await apiFetch(`/topics/${editTarget.id}`, { method: "PATCH", body: JSON.stringify(topicPayload) });
          queryClient.invalidateQueries();
          toast({ title: "Topic updated" });
        } else {
          await apiFetch(`/chapters/${editTarget.chapterId}/topics`, { method: "POST", body: JSON.stringify(topicPayload) });
          queryClient.invalidateQueries({ queryKey: [getGetTopicsUrl(editTarget.chapterId)] });
          toast({ title: "Topic created" });
        }
        setEditTarget(null);
      }
    } catch (err) {
      toast({ title: "Error saving", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  // ── Derived validation ─────────────────────────────────────────────────────
  const topicData = editTarget?.type === "topic" ? editTarget.data : null;
  const subjectData = editTarget?.type === "subject" ? editTarget.data : null;
  const linkError = topicData ? validateTelegramLink(topicData.telegram_link) : undefined;
  const previewLink = topicData?.telegram_link.trim() && !linkError ? topicData.telegram_link.trim() : null;

  const hasErrors =
    (editTarget?.type === "topic" && (!!linkError || (!topicData?.is_creator_only && (topicData?.allowed_roles.length ?? 1) === 0)))
    || (editTarget?.type === "subject" && !subjectData?.is_creator_only && (subjectData?.visibility_roles.length ?? 1) === 0);

  function setSubjectField<K extends keyof NonNullable<typeof subjectData>>(key: K, value: NonNullable<typeof subjectData>[K]) {
    setEditTarget(prev => {
      if (!prev || prev.type !== "subject") return prev;
      return { ...prev, data: { ...prev.data, [key]: value } } as EditTarget;
    });
  }

  function toggleSubjectRole(role: string) {
    if (!subjectData) return;
    const current = subjectData.visibility_roles;
    const next = current.includes(role) ? current.filter(r => r !== role) : [...current, role];
    setSubjectField("visibility_roles", next);
  }

  function setTopicField<K extends keyof NonNullable<typeof topicData>>(key: K, value: NonNullable<typeof topicData>[K]) {
    setEditTarget(prev => {
      if (!prev || prev.type !== "topic") return prev;
      return { ...prev, data: { ...prev.data, [key]: value } } as EditTarget;
    });
  }

  function toggleTopicRole(role: string) {
    if (!topicData) return;
    const current = topicData.allowed_roles;
    const next = current.includes(role) ? current.filter(r => r !== role) : [...current, role];
    setTopicField("allowed_roles", next);
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <AdminBreadcrumb pageName="Content Editor" />
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Content Editor</h1>
            <p className="text-muted-foreground mt-1">Manage subjects, chapters, and topics.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportDialog(true)}>
              <Upload className="w-4 h-4 mr-2" /> Bulk Import
            </Button>
            <Button onClick={() => setEditTarget({ type: "subject", data: { title: "", description: "", visibility_roles: [...ALL_ROLES], is_creator_only: false } })}>
              <Plus className="w-4 h-4 mr-2" /> Add Subject
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : displaySubjects.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No subjects yet. Add one above.</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSubjectDragEnd}>
            <SortableContext items={displaySubjects.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {displaySubjects.map((subject) => (
                  <SortableSubjectRow
                    key={subject.id}
                    subject={subject}
                    expanded={expandedSubjects.has(subject.id)}
                    expandedChapters={expandedChapters}
                    onToggle={() => toggleSubject(subject.id)}
                    onToggleChapter={toggleChapter}
                    onEdit={() => setEditTarget({
                      type: "subject",
                      id: subject.id,
                      data: {
                        title: subject.title,
                        description: subject.description || "",
                        visibility_roles: subject.visibility_roles ?? [...ALL_ROLES],
                        is_creator_only: subject.is_creator_only ?? false,
                      },
                    })}
                    onDelete={() => deleteSubject.mutate({ subjectId: subject.id })}
                    onAddChapter={() => setEditTarget({ type: "chapter", subjectId: subject.id, data: { title: "", description: "" } })}
                    onDeleteChapter={(id) => deleteChapter.mutate({ chapterId: id })}
                    onAddTopic={(chapterId) => setEditTarget({
                      type: "topic",
                      chapterId,
                      data: { title: "", description: "", telegram_link: "", allowed_roles: [...ALL_ROLES], is_creator_only: false },
                    })}
                    onEditTopic={(topic) => setEditTarget({
                      type: "topic",
                      chapterId: topic.chapter_id,
                      id: topic.id,
                      data: {
                        title: topic.title,
                        description: topic.description || "",
                        telegram_link: (topic as TopicWithAccess).telegram_link || "",
                        allowed_roles: (topic as TopicWithAccess).allowed_roles ?? [...ALL_ROLES],
                        is_creator_only: (topic as TopicWithAccess).is_creator_only ?? false,
                      },
                    })}
                    onDeleteTopic={handleDeleteTopic}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget?.type === "subject"
                ? (editTarget.id ? "Edit Subject" : "New Subject")
                : editTarget?.type === "chapter"
                ? "New Chapter"
                : editTarget?.id ? "Edit Topic" : "New Topic"}
            </DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input
                  value={editTarget.data.title}
                  onChange={e => { const v = e.target.value; setEditTarget(prev => prev ? { ...prev, data: { ...prev.data, title: v } } as EditTarget : null); }}
                  placeholder={editTarget.type === "subject" ? "e.g. Physics" : "e.g. Newton's Laws of Motion"}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input
                  value={editTarget.data.description}
                  onChange={e => { const v = e.target.value; setEditTarget(prev => prev ? { ...prev, data: { ...prev.data, description: v } } as EditTarget : null); }}
                  placeholder="Optional description"
                />
              </div>

              {/* ── Subject-only: Visibility Settings ── */}
              {editTarget.type === "subject" && (
                <>
                  <Separator />
                  <VisibilitySettings
                    isCreatorOnly={editTarget.data.is_creator_only}
                    allowedRoles={editTarget.data.visibility_roles}
                    onToggleCreatorOnly={(v) => setSubjectField("is_creator_only", v)}
                    onToggleRole={toggleSubjectRole}
                    label="Subject Visibility"
                    description="Control which roles can see this subject and all its chapters and topics. Changes apply to the entire subject hierarchy."
                    creatorOnlyDesc="Only you (the creator) can see this subject and its contents. Super admins with an explicit grant can also access it."
                  />
                </>
              )}

              {/* ── Topic-only fields ── */}
              {editTarget.type === "topic" && (
                <>
                  {/* Setup hint */}
                  <div className="flex gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2.5">
                    <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="text-xs text-muted-foreground space-y-1 min-w-0">
                      <p className="font-medium text-foreground/80">How to get the lecture link</p>
                      <p>
                        In Telegram Desktop: open the lecture message in your private channel/group,
                        right-click the message → <span className="font-medium">Copy Link</span>.
                        The link looks like{" "}
                        <span className="font-mono bg-muted px-1 rounded">https://t.me/c/1234567890/42</span>.
                      </p>
                      <p>On mobile: long-press the message → <span className="font-medium">Copy Link</span>.</p>
                    </div>
                  </div>

                  {/* Telegram Lecture Link */}
                  <div className="space-y-1.5">
                    <Label>Telegram Lecture Link</Label>
                    <Input
                      value={editTarget.data.telegram_link}
                      onChange={e => { const v = e.target.value; setEditTarget(prev => prev ? { ...prev, data: { ...prev.data, telegram_link: v } } as EditTarget : null); }}
                      placeholder="https://t.me/c/1234567890/42"
                      className={linkError ? "border-destructive focus-visible:ring-destructive" : ""}
                    />
                    {linkError
                      ? <p className="text-xs text-destructive">{linkError}</p>
                      : <p className="text-xs text-muted-foreground">Paste the direct Telegram message link. Leave blank to configure later.</p>
                    }
                  </div>

                  {/* Live link preview */}
                  {previewLink && (
                    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
                      <ExternalLink className="w-3.5 h-3.5 text-primary shrink-0" />
                      <a
                        href={previewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline truncate min-w-0"
                        title="Click to verify this opens the correct Telegram message"
                      >
                        {previewLink}
                      </a>
                    </div>
                  )}

                  {/* ── Topic Access Control ── */}
                  <Separator />
                  <VisibilitySettings
                    isCreatorOnly={editTarget.data.is_creator_only}
                    allowedRoles={editTarget.data.allowed_roles}
                    onToggleCreatorOnly={(v) => setTopicField("is_creator_only", v)}
                    onToggleRole={toggleTopicRole}
                    label="Access Control"
                    description="Control who can view and access this lecture topic. Changes take effect immediately for all users."
                    creatorOnlyDesc="Only you (the creator) can access this topic. Super admins with an explicit grant can also access it."
                  />
                </>
              )}

              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || !editTarget.data.title.trim() || hasErrors}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Bulk Import Dialog ── */}
      <ContentBulkImportDialog
        open={importDialog}
        onClose={() => setImportDialog(false)}
        onImported={() => {
          queryClient.invalidateQueries();
        }}
      />
    </AppLayout>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

type SubjectRowProps = {
  subject: SubjectWithAccess;
  expanded: boolean;
  expandedChapters: Set<string>;
  onToggle: () => void;
  onToggleChapter: (id: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddChapter: () => void;
  onDeleteChapter: (id: string) => void;
  onAddTopic: (chapterId: string) => void;
  onEditTopic: (topic: Topic) => void;
  onDeleteTopic: (id: string) => void;
  dragListeners?: Record<string, unknown>;
  dragAttributes?: Record<string, unknown>;
  isDragging?: boolean;
};

function SortableSubjectRow(props: SubjectRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.subject.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined }}
    >
      <SubjectRow {...props} dragListeners={listeners as Record<string, unknown>} dragAttributes={attributes as Record<string, unknown>} isDragging={isDragging} />
    </div>
  );
}

function SubjectRow({
  subject, expanded, expandedChapters, onToggle, onToggleChapter, onEdit, onDelete,
  onAddChapter, onDeleteChapter, onAddTopic, onEditTopic, onDeleteTopic,
  dragListeners, dragAttributes, isDragging,
}: SubjectRowProps) {
  const { data: chaptersRaw } = useQuery({
    queryKey: [getGetChaptersUrl(subject.id)],
    queryFn: () => getChapters(subject.id),
    enabled: expanded,
  });

  const [chapterOrder, setChapterOrder] = useState<string[] | null>(null);
  const prevChapterCount = useRef(0);
  useEffect(() => {
    const count = (chaptersRaw as Chapter[] | undefined)?.length ?? 0;
    if (count !== prevChapterCount.current) {
      prevChapterCount.current = count;
      setChapterOrder(null);
    }
  }, [chaptersRaw]);

  const displayChapters = useMemo(() => {
    const list = (chaptersRaw as Chapter[] | undefined) ?? [];
    if (!chapterOrder) return list;
    const map = new Map(list.map(c => [c.id, c]));
    const ordered = chapterOrder.map(id => map.get(id)).filter((c): c is Chapter => !!c);
    const extra = list.filter(c => !chapterOrder.includes(c.id));
    return [...ordered, ...extra];
  }, [chaptersRaw, chapterOrder]);

  const chapterSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  async function handleChapterDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = displayChapters.findIndex(c => c.id === active.id);
    const newIdx = displayChapters.findIndex(c => c.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(displayChapters, oldIdx, newIdx);
    setChapterOrder(reordered.map(c => c.id));
    try {
      await apiFetch("/chapters/reorder", {
        method: "POST",
        body: JSON.stringify({ chapters: reordered.map((c, i) => ({ id: c.id, order_index: i + 1 })) }),
      });
    } catch {
      setChapterOrder(null);
    }
  }

  return (
    <Card className={`bg-card transition-shadow ${isDragging ? "shadow-2xl ring-1 ring-primary/30" : ""}`}>
      <CardContent className="p-0">
        <div className="flex items-center gap-2 p-4 cursor-pointer" onClick={onToggle}>
          <button
            {...(dragAttributes as React.HTMLAttributes<HTMLButtonElement>)}
            {...(dragListeners as React.HTMLAttributes<HTMLButtonElement>)}
            className="cursor-grab active:cursor-grabbing touch-none shrink-0 p-1 rounded hover:bg-muted/60 transition-colors"
            onClick={e => e.stopPropagation()}
            title="Drag to reorder"
            tabIndex={-1}
          >
            <GripVertical className="w-4 h-4 text-muted-foreground/40" />
          </button>
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
          <BookOpen className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <h3 className="font-semibold truncate">{subject.title}</h3>
              <VisibilityBadge
                roles={subject.visibility_roles ?? ALL_ROLES}
                creatorOnly={subject.is_creator_only ?? false}
              />
            </div>
            {subject.description && <p className="text-sm text-muted-foreground truncate">{subject.description}</p>}
          </div>
          <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit}><Edit className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-border bg-muted/20 p-4 space-y-2">
            <DndContext sensors={chapterSensors} collisionDetection={closestCenter} onDragEnd={handleChapterDragEnd}>
              <SortableContext items={displayChapters.map(c => c.id)} strategy={verticalListSortingStrategy}>
                {displayChapters.map((ch) => (
                  <SortableChapterRow
                    key={ch.id}
                    chapter={ch}
                    expanded={expandedChapters.has(ch.id)}
                    onToggle={() => onToggleChapter(ch.id)}
                    onDelete={() => onDeleteChapter(ch.id)}
                    onAddTopic={() => onAddTopic(ch.id)}
                    onEditTopic={onEditTopic}
                    onDeleteTopic={onDeleteTopic}
                  />
                ))}
              </SortableContext>
            </DndContext>
            <Button size="sm" variant="outline" onClick={onAddChapter} className="mt-2">
              <Plus className="w-3 h-3 mr-1" /> Add Chapter
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type ChapterRowProps = {
  chapter: Chapter;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onAddTopic: () => void;
  onEditTopic: (topic: Topic) => void;
  onDeleteTopic: (id: string) => void;
  dragListeners?: Record<string, unknown>;
  dragAttributes?: Record<string, unknown>;
};

function SortableChapterRow(props: ChapterRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.chapter.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined, opacity: isDragging ? 0.75 : 1 }}
    >
      <ChapterRow {...props} dragListeners={listeners as Record<string, unknown>} dragAttributes={attributes as Record<string, unknown>} />
    </div>
  );
}

function ChapterRow({ chapter, expanded, onToggle, onDelete, onAddTopic, onEditTopic, onDeleteTopic, dragListeners, dragAttributes }: ChapterRowProps) {
  const { data: topics = [] } = useQuery({
    queryKey: [getGetTopicsUrl(chapter.id)],
    queryFn: () => getTopics(chapter.id),
    enabled: expanded,
  });

  return (
    <div className="border border-border rounded-md bg-card">
      <div className="flex items-center gap-2 p-3 cursor-pointer" onClick={onToggle}>
        <button
          {...(dragAttributes as React.HTMLAttributes<HTMLButtonElement>)}
          {...(dragListeners as React.HTMLAttributes<HTMLButtonElement>)}
          className="cursor-grab active:cursor-grabbing touch-none shrink-0 p-0.5 rounded hover:bg-muted/60 transition-colors"
          onClick={e => e.stopPropagation()}
          title="Drag to reorder"
          tabIndex={-1}
        >
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40" />
        </button>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        <span className="font-medium text-sm flex-1 min-w-0 truncate">{chapter.title}</span>
        <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="w-3 h-3" /></Button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border px-4 pb-3 pt-2 space-y-1">
          {(topics as TopicWithAccess[]).map((topic) => (
            <div key={topic.id} className="flex items-center gap-1.5 py-1 group">
              <span className="text-sm text-muted-foreground flex-1 min-w-0 truncate">• {topic.title}</span>

              {/* Visibility badge */}
              <VisibilityBadge
                roles={topic.allowed_roles ?? ALL_ROLES}
                creatorOnly={topic.is_creator_only ?? false}
              />

              {/* Telegram link indicator */}
              {topic.telegram_link && (
                <Link className="w-3 h-3 text-primary/60 shrink-0 hidden sm:block" />
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onEditTopic(topic as unknown as Topic)}
                title="Edit topic"
              >
                <Edit className="w-3 h-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onDeleteTopic(topic.id)}
                title="Remove topic"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" className="text-xs h-7 mt-1" onClick={onAddTopic}>
            <Plus className="w-3 h-3 mr-1" /> Add Topic
          </Button>
        </div>
      )}
    </div>
  );
}
