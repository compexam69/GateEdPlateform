import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import {
  FileText, Download, Trash2, UploadCloud, Lock, FolderOpen,
  Eye, X, AlertCircle, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getNotes, getGetNotesUrl,
  useDeleteNote, useGetDownloadUrl,
  getStorageQuota, getGetStorageQuotaUrl,
} from "@workspace/api-client-react";
import { getApiBase } from "@/lib/api";
import type { Note } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useRef, useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Document, Page, pdfjs } from "react-pdf";

// Configure pdfjs worker — Vite resolves the module URL at build time
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface UnlockedChapter {
  chapter_id: string;
  chapter_title: string;
}

// ── PDF Viewer ────────────────────────────────────────────────────────────────

interface PdfViewerProps {
  note: Note;
  onClose: () => void;
  onDownload: () => void;
  downloading: boolean;
}

function PdfViewer({ note, onClose, onDownload, downloading }: PdfViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(680);

  // Revoke object URL on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lock body scroll while viewer is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Keyboard: Escape closes, arrow keys navigate pages
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowLeft")  setCurrentPage(p => Math.max(1, p - 1));
      if (e.key === "ArrowRight") setCurrentPage(p => Math.min(numPages ?? p, p + 1));
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, numPages]);

  // Fetch PDF bytes through the server proxy (avoids B2 CORS restrictions)
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function load() {
      setFetching(true);
      setFetchError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("Not authenticated");

        const res = await fetch(
          `${getApiBase()}/b2/pdf-proxy?storage_path=${encodeURIComponent(note.b2_storage_path)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Failed to load PDF" }));
          throw new Error((err as { error?: string }).error ?? "Failed to load PDF");
        }
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch (e) {
        if (!cancelled) setFetchError((e as Error).message);
      } finally {
        if (!cancelled) setFetching(false);
      }
    }
    load();
    return () => {
      cancelled = true;
      // Revoke the object URL created during this effect if the component unmounts mid-fetch
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [note.b2_storage_path]);

  // Responsive page width via ResizeObserver on the scroll container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setPageWidth(Math.min(w - 32, 900)); // 16px padding each side, cap at 900px
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [blobUrl]); // re-run once blobUrl is set so the container is rendered

  // Keep page input in sync with currentPage state
  useEffect(() => { setPageInput(String(currentPage)); }, [currentPage]);

  const goToPrev = () => setCurrentPage(p => Math.max(1, p - 1));
  const goToNext = () => setCurrentPage(p => Math.min(numPages ?? p, p + 1));

  function commitPageInput() {
    const n = parseInt(pageInput, 10);
    if (!isNaN(n) && numPages && n >= 1 && n <= numPages) {
      setCurrentPage(n);
    } else {
      setPageInput(String(currentPage));
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-background animate-in fade-in-0 duration-150"
      role="dialog"
      aria-modal="true"
      aria-label={`PDF viewer: ${note.title}`}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <FileText className="w-4 h-4 text-primary shrink-0" />
        <h2 className="flex-1 font-semibold text-sm truncate min-w-0">{note.title}</h2>

        {note.pdf_size_bytes && (
          <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
            {formatBytes(note.pdf_size_bytes)}
          </span>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 shrink-0"
          onClick={onDownload}
          disabled={downloading}
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{downloading ? "Downloading…" : "Download"}</span>
        </Button>

        <button
          onClick={onClose}
          className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Close PDF viewer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Scrollable content area ── */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-y-auto bg-[#404040]"
        // Subtle dark background so PDF pages have clear separation
      >
        {/* Fetch loading overlay */}
        {fetching && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/95 z-10">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading PDF…</p>
          </div>
        )}

        {/* Fetch error state */}
        {fetchError && !fetching && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background p-6 text-center z-10">
            <AlertCircle className="w-12 h-12 text-destructive/50" />
            <div className="space-y-1">
              <p className="font-semibold text-sm">Could not load PDF</p>
              <p className="text-xs text-muted-foreground max-w-[280px]">{fetchError}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={onDownload}
              disabled={downloading}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download instead
            </Button>
          </div>
        )}

        {/* react-pdf Document + Page */}
        {blobUrl && (
          <div className="flex justify-center py-6 px-4 min-h-full">
            <Document
              file={blobUrl}
              onLoadSuccess={({ numPages: n }) => {
                setNumPages(n);
                setCurrentPage(1);
              }}
              onLoadError={err => setFetchError(err.message)}
              loading={
                <div className="flex items-center justify-center h-64">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              }
              error={
                <div className="flex flex-col items-center gap-2 text-white/60 py-16">
                  <AlertCircle className="w-10 h-10" />
                  <p className="text-sm">Failed to parse PDF</p>
                </div>
              }
            >
              <Page
                key={`page_${currentPage}`}
                pageNumber={currentPage}
                width={pageWidth > 0 ? pageWidth : undefined}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                className="shadow-2xl rounded-sm overflow-hidden"
                loading={
                  <div
                    className="flex items-center justify-center bg-white rounded-sm"
                    style={{ width: pageWidth > 0 ? pageWidth : 680, height: Math.round((pageWidth > 0 ? pageWidth : 680) * 1.414) }}
                  >
                    <div className="w-6 h-6 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                  </div>
                }
                error={
                  <div
                    className="flex items-center justify-center bg-white rounded-sm text-sm text-muted-foreground"
                    style={{ width: pageWidth > 0 ? pageWidth : 680, height: 200 }}
                  >
                    Could not render this page
                  </div>
                }
              />
            </Document>
          </div>
        )}
      </div>

      {/* ── Footer — page navigation ── */}
      {numPages !== null && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-card shrink-0">
          {/* Prev */}
          <button
            onClick={goToPrev}
            disabled={currentPage <= 1}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Prev</span>
          </button>

          {/* Page indicator + jump input */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground text-xs">Page</span>
            <input
              type="number"
              min={1}
              max={numPages}
              value={pageInput}
              onChange={e => setPageInput(e.target.value)}
              onBlur={commitPageInput}
              onKeyDown={e => { if (e.key === "Enter") { commitPageInput(); (e.target as HTMLInputElement).blur(); } }}
              className="w-12 h-7 rounded-md border border-border bg-background text-center text-sm focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              aria-label="Go to page"
            />
            <span className="text-muted-foreground text-xs">of {numPages}</span>
          </div>

          {/* Next */}
          <button
            onClick={goToNext}
            disabled={numPages !== null && currentPage >= numPages}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Next page"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

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

  // Inline PDF viewer state
  const [previewNote, setPreviewNote] = useState<Note | null>(null);

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
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated — please sign in again.");

      const params = new URLSearchParams({
        chapter_id: chapterId,
        filename: file.name,
        content_type: file.type || "application/pdf",
        size_bytes: String(file.size),
        ...(fileHash ? { file_hash: fileHash } : {}),
      });

      const uploadResp = await fetch(`${getApiBase()}/b2/notes-upload?${params}`, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/pdf",
          Authorization: `Bearer ${token}`,
        },
        body: file,
      });

      if (!uploadResp.ok) {
        const errData = await uploadResp.json().catch(() => ({}));
        const msg = (errData as { error?: string }).error || `Upload failed (${uploadResp.status})`;
        if (msg.includes("Complete the Chapter")) {
          toast({ title: "Upload Locked", description: "Complete the Chapter Test to unlock PDF uploads for this chapter.", variant: "destructive" });
        } else if (msg.includes("quota")) {
          toast({ title: "Storage Full", description: "You've reached your 500MB storage limit.", variant: "destructive" });
        } else if (uploadResp.status === 409) {
          toast({ title: "Duplicate File", description: msg, variant: "destructive" });
        } else {
          toast({ title: "Upload failed", description: msg, variant: "destructive" });
        }
        return;
      }

      queryClient.invalidateQueries({ queryKey: [getGetNotesUrl()] });
      queryClient.invalidateQueries({ queryKey: [getGetStorageQuotaUrl()] });
      toast({ title: "Uploaded!", description: `${file.name} saved successfully.` });
    } catch (err: unknown) {
      toast({ title: "Upload failed", description: (err as Error)?.message, variant: "destructive" });
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

  // Download the currently-previewed note (called from within the viewer)
  async function handleViewerDownload() {
    if (!previewNote) return;
    await handleDownload(previewNote);
  }

  const usedPct = quota ? Math.min((quota.used_percentage ?? 0), 100) : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Study Notes</h1>
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
                  {/* Clickable icon — opens inline viewer */}
                  <button
                    className="w-10 h-10 rounded bg-accent/10 flex items-center justify-center shrink-0 hover:bg-primary/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() => setPreviewNote(note)}
                    title="View PDF"
                    aria-label={`View ${note.title}`}
                  >
                    <FileText className="w-5 h-5 text-accent" />
                  </button>

                  <div className="flex-1 min-w-0">
                    {/* Clickable title — also opens viewer */}
                    <button
                      className="w-full text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
                      onClick={() => setPreviewNote(note)}
                    >
                      <h3 className="font-semibold truncate text-sm hover:text-primary transition-colors">{note.title}</h3>
                    </button>
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

                  {/* Action buttons */}
                  <div className="flex flex-col gap-1 shrink-0">
                    {/* View inline */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setPreviewNote(note)}
                      title="View PDF"
                    >
                      <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>

                    {/* Download */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleDownload(note)}
                      disabled={downloadingId === note.id}
                      title="Download PDF"
                    >
                      {downloadingId === note.id ? (
                        <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </Button>

                    {/* Delete */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteNote.mutate({ noteId: note.id })}
                      title="Delete note"
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

      {/* ── Chapter picker dialog (unchanged) ── */}
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

      {/* ── Inline PDF viewer — renders over the full app ── */}
      {previewNote && (
        <PdfViewer
          note={previewNote}
          onClose={() => setPreviewNote(null)}
          onDownload={handleViewerDownload}
          downloading={downloadingId === previewNote.id}
        />
      )}
    </AppLayout>
  );
}
