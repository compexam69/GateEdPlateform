import { AppLayout } from "@/components/layout/AppLayout";
import { AdminBreadcrumb } from "@/components/layout/AdminBreadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash2, ChevronDown, ChevronRight, BookOpen, ExternalLink, Info } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSubjects, getGetSubjectsUrl,
  useCreateSubject, useUpdateSubject, useDeleteSubject,
  getChapters, getGetChaptersUrl,
  useCreateChapter, useDeleteChapter,
  useCreateTopic, useUpdateTopic,
  getTopics, getGetTopicsUrl,
} from "@workspace/api-client-react";
import type { Subject, Chapter, Topic } from "@workspace/api-client-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";

type EditTarget =
  | { type: "subject"; id?: string; data: { title: string; description: string } }
  | { type: "chapter"; subjectId: string; id?: string; data: { title: string; description: string } }
  | { type: "topic"; chapterId: string; id?: string; data: { title: string; description: string; telegram_chat_id: string; telegram_message_id: string } };

// ── Telegram validation helpers ────────────────────────────────────────────────

/** Chat ID: digits only, or -100 prefix followed by digits (private channels). */
function validateChatId(v: string): string | undefined {
  if (!v.trim()) return undefined;
  if (!/^(-100)?\d+$/.test(v.trim())) {
    return "Must be a numeric ID (e.g. 1234567890 or -1001234567890)";
  }
}

/** Message ID: positive integer only. */
function validateMsgId(v: string): string | undefined {
  if (!v.trim()) return undefined;
  if (!/^\d+$/.test(v.trim())) {
    return "Must be a positive number (e.g. 42)";
  }
}

/**
 * Build the Telegram deep link shown as a live preview.
 * Strips the `-100` prefix that Telegram's Bot API appends to channel IDs —
 * t.me/c/ links use the bare numeric ID without that prefix.
 */
function buildPreviewLink(chatId: string, msgId: string): string | null {
  const cid = chatId.trim();
  const mid = msgId.trim();
  if (!cid || !mid) return null;
  if (validateChatId(cid) || validateMsgId(mid)) return null;
  const cleanId = cid.replace(/^-100/, "");
  return `https://t.me/c/${cleanId}/${mid}`;
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
  const createTopic = useCreateTopic({
    mutation: { onSuccess: (_data, vars) => { queryClient.invalidateQueries({ queryKey: [getGetTopicsUrl(vars.chapterId)] }); toast({ title: "Topic created" }); setEditTarget(null); } },
  });
  const updateTopic = useUpdateTopic({
    mutation: { onSuccess: () => { queryClient.invalidateQueries(); toast({ title: "Topic updated" }); setEditTarget(null); } },
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
        if (validateChatId(d.telegram_chat_id) || validateMsgId(d.telegram_message_id)) {
          toast({ title: "Fix Telegram ID errors first", variant: "destructive" });
          setSaving(false);
          return;
        }
        const topicPayload = {
          title: d.title,
          description: d.description,
          telegram_chat_id: d.telegram_chat_id.trim() || undefined,
          telegram_message_id: d.telegram_message_id.trim() || undefined,
        };
        if (editTarget.id) {
          await updateTopic.mutateAsync({ topicId: editTarget.id, data: topicPayload });
        } else {
          await createTopic.mutateAsync({ chapterId: editTarget.chapterId, data: { ...topicPayload, order_index: 0 } });
        }
      }
    } finally {
      setSaving(false);
    }
  }

  // Derived validation / preview for the open dialog
  const topicData = editTarget?.type === "topic" ? editTarget.data : null;
  const chatIdError = topicData ? validateChatId(topicData.telegram_chat_id) : undefined;
  const msgIdError = topicData ? validateMsgId(topicData.telegram_message_id) : undefined;
  const previewLink = topicData ? buildPreviewLink(topicData.telegram_chat_id, topicData.telegram_message_id) : null;
  const hasErrors = !!chatIdError || !!msgIdError;

  return (
    <AppLayout requireAdmin>
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
                onAddTopic={(chapterId) => setEditTarget({ type: "topic", chapterId, data: { title: "", description: "", telegram_chat_id: "", telegram_message_id: "" } })}
                onEditTopic={(topic) => setEditTarget({
                  type: "topic",
                  chapterId: topic.chapter_id,
                  id: topic.id,
                  data: {
                    title: topic.title,
                    description: topic.description || "",
                    telegram_chat_id: topic.telegram_chat_id || "",
                    telegram_message_id: topic.telegram_message_id || "",
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
        <DialogContent className="max-w-md">
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

              {/* ── Topic-only: Telegram lecture fields ── */}
              {editTarget.type === "topic" && (
                <>
                  {/* Setup hint */}
                  <div className="flex gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2.5">
                    <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="text-xs text-muted-foreground space-y-1 min-w-0">
                      <p className="font-medium text-foreground/80">How to get these IDs</p>
                      <p>
                        Forward the lecture post to{" "}
                        <span className="font-mono bg-muted px-1 rounded">@userinfobot</span> to get the{" "}
                        <span className="font-mono">Chat ID</span> (looks like{" "}
                        <span className="font-mono">-1001234567890</span>).
                      </p>
                      <p>
                        The <span className="font-mono">Message ID</span> is the number at the end of
                        the post's link (right-click → Copy Link in Telegram Desktop).
                      </p>
                    </div>
                  </div>

                  {/* Chat ID */}
                  <div className="space-y-1.5">
                    <Label>Telegram Chat ID</Label>
                    <Input
                      value={editTarget.data.telegram_chat_id}
                      onChange={e => { const v = e.target.value; setEditTarget(prev => prev ? { ...prev, data: { ...prev.data, telegram_chat_id: v } } as EditTarget : null); }}
                      placeholder="-1001234567890"
                      className={chatIdError ? "border-destructive focus-visible:ring-destructive" : ""}
                    />
                    {chatIdError
                      ? <p className="text-xs text-destructive">{chatIdError}</p>
                      : <p className="text-xs text-muted-foreground">Numeric only. Bot API returns <span className="font-mono">-100…</span> prefix for channels — paste as-is.</p>
                    }
                  </div>

                  {/* Message ID */}
                  <div className="space-y-1.5">
                    <Label>Telegram Message ID</Label>
                    <Input
                      value={editTarget.data.telegram_message_id}
                      onChange={e => { const v = e.target.value; setEditTarget(prev => prev ? { ...prev, data: { ...prev.data, telegram_message_id: v } } as EditTarget : null); }}
                      placeholder="e.g. 42"
                      className={msgIdError ? "border-destructive focus-visible:ring-destructive" : ""}
                    />
                    {msgIdError
                      ? <p className="text-xs text-destructive">{msgIdError}</p>
                      : <p className="text-xs text-muted-foreground">Positive integer from the post's share link.</p>
                    }
                  </div>

                  {/* Live deep-link preview */}
                  {previewLink && (
                    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
                      <ExternalLink className="w-3.5 h-3.5 text-primary shrink-0" />
                      <a
                        href={previewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline truncate min-w-0"
                        title="Preview — click to verify this opens the correct Telegram message"
                      >
                        {previewLink}
                      </a>
                    </div>
                  )}
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
          {(topics as Topic[]).map((topic) => (
            <div key={topic.id} className="flex items-center gap-1 py-1 group">
              <span className="text-sm text-muted-foreground flex-1 min-w-0 truncate">• {topic.title}</span>
              {/* Telegram link indicator */}
              {topic.telegram_chat_id && topic.telegram_message_id && (
                <span className="text-xs text-primary/60 font-mono shrink-0 hidden sm:block">tg</span>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onEditTopic(topic as Topic)}
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
