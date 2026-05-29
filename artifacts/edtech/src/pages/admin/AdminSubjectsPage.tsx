import { AppLayout } from "@/components/layout/AppLayout";
import { AdminBreadcrumb } from "@/components/layout/AdminBreadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit, Trash2, ChevronDown, ChevronRight, BookOpen, ExternalLink, Info, Link, Eye, Shield, Lock } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSubjects, getGetSubjectsUrl,
  useCreateSubject, useUpdateSubject, useDeleteSubject,
  getChapters, getGetChaptersUrl,
  useCreateChapter, useDeleteChapter,
  getTopics, getGetTopicsUrl,
} from "@workspace/api-client-react";
import type { Subject, Chapter, Topic } from "@workspace/api-client-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { Separator } from "@/components/ui/separator";

// ── Augmented topic type with access-control fields ───────────────────────────
type TopicWithAccess = Topic & {
  telegram_link?: string;
  allowed_roles?: string[];
  is_creator_only?: boolean;
  creator_id?: string | null;
};

type EditTarget =
  | { type: "subject"; id?: string; data: { title: string; description: string } }
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
  if (allRoles) return null; // default — no badge needed
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

// ── Page component ─────────────────────────────────────────────────────────────

export default function AdminSubjectsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: [getGetSubjectsUrl()],
    queryFn: () => getSubjects(),
  });

  const createSubject = useCreateSubject({
    mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: [getGetSubjectsUrl()] }); toast({ title: "Subject created" }); setEditTarget(null); } },
  });
  const updateSubject = useUpdateSubject({
    mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: [getGetSubjectsUrl()] }); toast({ title: "Subject updated" }); setEditTarget(null); } },
  });
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
        if (editTarget.id) {
          await updateSubject.mutateAsync({ subjectId: editTarget.id, data: d });
        } else {
          await createSubject.mutateAsync({ data: { ...d, order_index: subjects.length } });
        }
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
          await apiFetch(`/topics/${editTarget.id}`, {
            method: "PATCH",
            body: JSON.stringify(topicPayload),
          });
          queryClient.invalidateQueries();
          toast({ title: "Topic updated" });
        } else {
          await apiFetch(`/chapters/${editTarget.chapterId}/topics`, {
            method: "POST",
            body: JSON.stringify(topicPayload),
          });
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

  // Derived validation / preview for the open dialog
  const topicData = editTarget?.type === "topic" ? editTarget.data : null;
  const linkError = topicData ? validateTelegramLink(topicData.telegram_link) : undefined;
  const previewLink = topicData?.telegram_link.trim() && !linkError ? topicData.telegram_link.trim() : null;
  const hasErrors = !!linkError || (!topicData?.is_creator_only && (topicData?.allowed_roles.length ?? 1) === 0);

  function setTopicField<K extends keyof NonNullable<typeof topicData>>(key: K, value: NonNullable<typeof topicData>[K]) {
    setEditTarget(prev => {
      if (!prev || prev.type !== "topic") return prev;
      return { ...prev, data: { ...prev.data, [key]: value } } as EditTarget;
    });
  }

  function toggleRole(role: string) {
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
          <Button onClick={() => setEditTarget({ type: "subject", data: { title: "", description: "" } })}>
            <Plus className="w-4 h-4 mr-2" /> Add Subject
          </Button>
        </div>

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : subjects.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No subjects yet. Add one above.</div>
        ) : (
          <div className="space-y-3">
            {(subjects as Subject[]).map((subject) => (
              <SubjectRow
                key={subject.id}
                subject={subject}
                expanded={expandedSubjects.has(subject.id)}
                expandedChapters={expandedChapters}
                onToggle={() => toggleSubject(subject.id)}
                onToggleChapter={toggleChapter}
                onEdit={() => setEditTarget({ type: "subject", id: subject.id, data: { title: subject.title, description: subject.description || "" } })}
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
                  placeholder="e.g. Newton's Laws of Motion"
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

                  {/* ── Access Control ── */}
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-primary" />
                      <span className="text-sm font-medium">Access Control</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Control who can view and access this lecture topic. Changes take effect immediately for all users.
                    </p>

                    {/* Creator Only toggle */}
                    <label className="flex items-start gap-3 cursor-pointer rounded-md border border-border bg-muted/20 px-3 py-2.5 hover:bg-muted/40 transition-colors">
                      <Checkbox
                        id="creator-only"
                        checked={editTarget.data.is_creator_only}
                        onCheckedChange={(checked) => setTopicField("is_creator_only", checked === true)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-amber-400" />
                          Creator Only
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Only you (the creator) can access this topic. Super admins with an explicit grant can also access it.
                        </p>
                      </div>
                    </label>

                    {/* Role checkboxes (disabled when creator-only) */}
                    {!editTarget.data.is_creator_only && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground font-medium">Visible to:</p>
                        {[
                          { role: "student", label: "Students", desc: "Regular enrolled students can view and take this topic." },
                          { role: "admin", label: "Admins", desc: "Admin accounts can access and manage this topic." },
                          { role: "super_admin", label: "Super Admins", desc: "Super admin accounts can access this topic." },
                        ].map(({ role, label, desc }) => (
                          <label key={role} className="flex items-start gap-3 cursor-pointer rounded-md px-3 py-2 hover:bg-muted/30 transition-colors">
                            <Checkbox
                              id={`role-${role}`}
                              checked={editTarget.data.allowed_roles.includes(role)}
                              onCheckedChange={() => toggleRole(role)}
                              className="mt-0.5"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{label}</p>
                              <p className="text-xs text-muted-foreground">{desc}</p>
                            </div>
                          </label>
                        ))}
                        {editTarget.data.allowed_roles.length === 0 && (
                          <p className="text-xs text-destructive px-3">Select at least one role.</p>
                        )}
                      </div>
                    )}

                    {/* Preview */}
                    <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">Current visibility: </span>
                      {visibilityLabel(editTarget.data.allowed_roles, editTarget.data.is_creator_only)}
                    </div>
                  </div>
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
    </AppLayout>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SubjectRow({
  subject, expanded, expandedChapters, onToggle, onToggleChapter, onEdit, onDelete,
  onAddChapter, onDeleteChapter, onAddTopic, onEditTopic, onDeleteTopic,
}: {
  subject: Subject;
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
}) {
  const { data: chapters = [] } = useQuery({
    queryKey: [getGetChaptersUrl(subject.id)],
    queryFn: () => getChapters(subject.id),
    enabled: expanded,
  });

  return (
    <Card className="bg-card">
      <CardContent className="p-0">
        <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={onToggle}>
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
          <BookOpen className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{subject.title}</h3>
            {subject.description && <p className="text-sm text-muted-foreground truncate">{subject.description}</p>}
          </div>
          <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit}><Edit className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-border bg-muted/20 p-4 space-y-2">
            {(chapters as Chapter[]).map((ch) => (
              <ChapterRow
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
            <Button size="sm" variant="outline" onClick={onAddChapter} className="mt-2">
              <Plus className="w-3 h-3 mr-1" /> Add Chapter
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChapterRow({ chapter, expanded, onToggle, onDelete, onAddTopic, onEditTopic, onDeleteTopic }: {
  chapter: Chapter;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onAddTopic: () => void;
  onEditTopic: (topic: Topic) => void;
  onDeleteTopic: (id: string) => void;
}) {
  const { data: topics = [] } = useQuery({
    queryKey: [getGetTopicsUrl(chapter.id)],
    queryFn: () => getTopics(chapter.id),
    enabled: expanded,
  });

  return (
    <div className="border border-border rounded-md bg-card">
      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={onToggle}>
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
