import { AppLayout } from "@/components/layout/AppLayout";
import { AdminBreadcrumb } from "@/components/layout/AdminBreadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash2, ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSubjects, getGetSubjectsUrl,
  useCreateSubject, useUpdateSubject, useDeleteSubject,
  getChapters, getGetChaptersUrl,
  useCreateChapter, useDeleteChapter,
  useCreateTopic,
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
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: [getGetSubjectsUrl()] }); toast({ title: "Subject created" }); setEditTarget(null); },
    },
  });
  const updateSubject = useUpdateSubject({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: [getGetSubjectsUrl()] }); toast({ title: "Subject updated" }); setEditTarget(null); },
    },
  });
  const deleteSubject = useDeleteSubject({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: [getGetSubjectsUrl()] }); toast({ title: "Subject deleted" }); },
    },
  });
  const createChapter = useCreateChapter({
    mutation: {
      onSuccess: (_data, vars) => { queryClient.invalidateQueries({ queryKey: [getGetChaptersUrl(vars.subjectId)] }); toast({ title: "Chapter created" }); setEditTarget(null); },
    },
  });
  const deleteChapter = useDeleteChapter({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries(); toast({ title: "Chapter deleted" }); },
    },
  });
  const createTopic = useCreateTopic({
    mutation: {
      onSuccess: (_data, vars) => { queryClient.invalidateQueries({ queryKey: [getGetTopicsUrl(vars.chapterId)] }); toast({ title: "Topic created" }); setEditTarget(null); },
    },
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
        await createTopic.mutateAsync({ chapterId: editTarget.chapterId, data: { title: d.title, description: d.description, telegram_chat_id: d.telegram_chat_id, telegram_message_id: d.telegram_message_id, order_index: 0 } });
      }
    } finally {
      setSaving(false);
    }
  }

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
                onDeleteTopic={handleDeleteTopic}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editTarget?.type === "subject" ? (editTarget.id ? "Edit Subject" : "New Subject")
                : editTarget?.type === "chapter" ? "New Chapter"
                : "New Topic"}
            </DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input
                  value={editTarget.data.title}
                  onChange={e => { const v = e.target.value; setEditTarget(prev => prev ? { ...prev, data: { ...prev.data, title: v } } as EditTarget : null); }}
                  placeholder="e.g. Mechanics"
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
              {editTarget.type === "topic" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Telegram Chat ID</Label>
                    <Input
                      value={editTarget.data.telegram_chat_id}
                      onChange={e => { const v = e.target.value; setEditTarget(prev => prev ? { ...prev, data: { ...prev.data, telegram_chat_id: v } } as EditTarget : null); }}
                      placeholder="Chat ID for lecture link"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Telegram Message ID</Label>
                    <Input
                      value={editTarget.data.telegram_message_id}
                      onChange={e => { const v = e.target.value; setEditTarget(prev => prev ? { ...prev, data: { ...prev.data, telegram_message_id: v } } as EditTarget : null); }}
                      placeholder="Message ID for lecture link"
                    />
                  </div>
                </>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving || !editTarget.data.title}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function SubjectRow({
  subject, expanded, expandedChapters, onToggle, onToggleChapter, onEdit, onDelete,
  onAddChapter, onDeleteChapter, onAddTopic, onDeleteTopic,
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

function ChapterRow({ chapter, expanded, onToggle, onDelete, onAddTopic, onDeleteTopic }: {
  chapter: Chapter;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onAddTopic: () => void;
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
        <div className="border-t border-border px-4 pb-3 pt-2 space-y-1.5">
          {(topics as Topic[]).map((topic) => (
            <div key={topic.id} className="flex items-center justify-between text-sm text-muted-foreground py-1">
              <span className="truncate min-w-0 flex-1">• {topic.title}</span>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => onDeleteTopic(topic.id)}><Trash2 className="w-3 h-3" /></Button>
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
