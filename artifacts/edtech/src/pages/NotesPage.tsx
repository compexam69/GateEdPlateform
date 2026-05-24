import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Download, Trash2, UploadCloud, Lock, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getNotes, getGetNotesUrl,
  useDeleteNote, useGetUploadUrl, useGetDownloadUrl,
  getStorageQuota, getGetStorageQuotaUrl,
} from "@workspace/api-client-react";
import type { Note } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useRef, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface UnlockedChapter {
  chapter_id: string;
  chapter_title: string;
}

export default function NotesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showChapterPicker, setShowChapterPicker] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState<string>("");

  const { data: notes = [], isLoading } = useQuery({
    queryKey: [getGetNotesUrl()],
    queryFn: () => getNotes(),
  });

  const { data: quota } = useQuery({
    queryKey: [getGetStorageQuotaUrl()],
    queryFn: () => getStorageQuota(),
  });

  const { data: unlockedChapters = [], isLoading: chaptersLoading } = useQuery<UnlockedChapter[]>({
    queryKey: ["unlocked-chapters-for-upload", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("user_chapter_progress")
        .select("chapter_id, chapters!inner(title)")
        .eq("user_id", user.id)
        .eq("pdf_upload_unlocked", true);
      if (error || !data) return [];
      return data.map((row: { chapter_id: string; chapters: { title: string } | { title: string }[] }) => ({
        chapter_id: row.chapter_id,
        chapter_title: Array.isArray(row.chapters) ? (row.chapters[0]?.title ?? "") : (row.chapters as { title: string }).title,
      }));
    },
    enabled: !!user?.id,
  });

  const deleteNote = useDeleteNote({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [getGetNotesUrl()] });
        queryClient.invalidateQueries({ queryKey: [getGetStorageQuotaUrl()] });
        toast({ title: "Note deleted" });
      },
    },
  });

  const getUploadUrl = useGetUploadUrl({
    mutation: {
      onError: (err: unknown) => {
        const msg = (err as Error)?.message || "Upload failed";
        if (msg.includes("Complete the Chapter")) {
          toast({ title: "Upload Locked", description: "Complete the Chapter Test to unlock PDF uploads for this chapter.", variant: "destructive" });
        } else if (msg.includes("quota")) {
          toast({ title: "Storage Full", description: "You've reached your 500MB storage limit.", variant: "destructive" });
        } else {
          toast({ title: "Upload Error", description: msg, variant: "destructive" });
        }
        setUploading(false);
      },
    },
  });

  const getDownloadUrl = useGetDownloadUrl();

  function handleUploadClick() {
    if (unlockedChapters.length === 0) {
      toast({
        title: "No chapters unlocked",
        description: "Complete a Chapter Test to unlock PDF uploads for that chapter.",
        variant: "destructive",
      });
      return;
    }
    if (unlockedChapters.length === 1) {
      setSelectedChapterId(unlockedChapters[0].chapter_id);
      fileInputRef.current?.click();
    } else {
      setShowChapterPicker(true);
    }
  }

  function handleChapterSelected() {
    if (!selectedChapterId) return;
    setShowChapterPicker(false);
    fileInputRef.current?.click();
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file", description: "Only PDF files are allowed.", variant: "destructive" });
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 30MB.", variant: "destructive" });
      return;
    }

    if (!selectedChapterId) {
      setPendingFile(file);
      setShowChapterPicker(true);
      return;
    }

    await doUpload(file, selectedChapterId);
  }

  async function computeSha256(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function doUpload(file: File, chapterId: string) {
    setUploading(true);
    let fileHash: string | undefined;
    try {
      fileHash = await computeSha256(file);
    } catch {
      // Hash computation failed — proceed without deduplication check
    }
    try {
      const result = await getUploadUrl.mutateAsync({
        data: { chapter_id: chapterId, filename: file.name, content_type: file.type, size_bytes: file.size, file_hash: fileHash },
      });

      const uploadResp = await fetch(result.upload_url, {
        method: "POST",
        headers: {
          "Authorization": result.upload_url,
          "X-Bz-File-Name": encodeURIComponent(file.name),
          "Content-Type": file.type,
          "Content-Length": String(file.size),
        },
        body: file,
      });

      if (!uploadResp.ok) throw new Error("Upload to storage failed");

      queryClient.invalidateQueries({ queryKey: [getGetNotesUrl()] });
      queryClient.invalidateQueries({ queryKey: [getGetStorageQuotaUrl()] });
      toast({ title: "Uploaded!", description: `${file.name} saved successfully.` });
    } catch (err: unknown) {
      if (!getUploadUrl.isError) {
        toast({ title: "Upload failed", description: (err as Error)?.message, variant: "destructive" });
      }
    } finally {
      setUploading(false);
      setPendingFile(null);
      setSelectedChapterId("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDownload(note: Note) {
    setDownloadingId(note.id);
    try {
      const result = await getDownloadUrl.mutateAsync({ data: { storage_path: note.b2_storage_path } });
      window.open(result.download_url, "_blank");
    } catch (err: unknown) {
      toast({ title: "Download failed", description: (err as Error)?.message, variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  }

  const usedPct = quota ? Math.min((quota.used_percentage ?? 0), 100) : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Study Notes</h1>
            <p className="text-muted-foreground mt-1">
              Upload and manage your PDF notes for completed chapters.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleUploadClick} disabled={uploading || chaptersLoading}>
              <UploadCloud className="w-4 h-4 mr-2" />
              {uploading ? "Uploading..." : "Upload PDF"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </div>

        {quota && (
          <Card className="bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">Storage Used</span>
                <span className="font-medium">{formatBytes(quota.used_bytes ?? 0)} / 500 MB</span>
              </div>
              <Progress value={usedPct} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                {quota.file_count ?? 0} file{(quota.file_count ?? 0) !== 1 ? "s" : ""} uploaded
              </p>
            </CardContent>
          </Card>
        )}

        {unlockedChapters.length === 0 && !chaptersLoading && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 flex items-start gap-2 text-sm text-warning">
            <Lock className="w-4 h-4 shrink-0 mt-0.5" />
            <span>PDF uploads are unlocked chapter by chapter after you attempt the Chapter Test.</span>
          </div>
        )}

        {unlockedChapters.length > 0 && (
          <div className="rounded-lg border border-success/30 bg-success/5 p-3 flex items-start gap-2 text-sm text-success">
            <FolderOpen className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {unlockedChapters.length} chapter{unlockedChapters.length !== 1 ? "s" : ""} unlocked for upload:{" "}
              {unlockedChapters.map(c => c.chapter_title).join(", ")}
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground space-y-2">
            <FileText className="w-12 h-12 mx-auto opacity-30" />
            <p>No notes uploaded yet.</p>
            <p className="text-sm">Complete a Chapter Test to unlock PDF uploads.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {notes.map((note: Note) => (
              <Card key={note.id} className="bg-card">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="w-10 h-10 rounded bg-accent/10 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate text-sm">{note.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {note.created_at ? format(new Date(note.created_at), "MMM d, yyyy") : ""}
                      {note.pdf_size_bytes ? ` · ${formatBytes(note.pdf_size_bytes)}` : ""}
                    </p>
                    {note.tags && note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {note.tags.map((tag: string) => (
                          <span key={tag} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleDownload(note)}
                      disabled={downloadingId === note.id}
                    >
                      <Download className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteNote.mutate({ noteId: note.id })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showChapterPicker} onOpenChange={setShowChapterPicker}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Chapter</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">Choose which chapter this PDF note belongs to.</p>
            <div className="space-y-2">
              <Label>Chapter</Label>
              <div className="space-y-2">
                {unlockedChapters.map(ch => (
                  <button
                    key={ch.chapter_id}
                    onClick={() => setSelectedChapterId(ch.chapter_id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                      selectedChapterId === ch.chapter_id
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {ch.chapter_title}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowChapterPicker(false); setPendingFile(null); }}>Cancel</Button>
              <Button
                onClick={() => {
                  if (pendingFile && selectedChapterId) {
                    setShowChapterPicker(false);
                    doUpload(pendingFile, selectedChapterId);
                  } else {
                    handleChapterSelected();
                  }
                }}
                disabled={!selectedChapterId}
              >
                Continue
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
