import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminBackButton } from "@/components/layout/AdminBackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  useAdminListAnnouncements,
  useAdminCreateAnnouncement,
  useAdminUpdateAnnouncement,
  useAdminDeleteAnnouncement,
} from "@workspace/api-client-react";
import type { Announcement } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Eye, EyeOff, Info, AlertTriangle, CheckCircle2, Megaphone } from "lucide-react";
import { format } from "date-fns";

type AnnouncementType = Announcement["type"];

const TYPE_OPTIONS: { value: AnnouncementType; label: string; icon: React.ElementType; badge: string }[] = [
  { value: "info", label: "Info", icon: Info, badge: "bg-primary/10 text-primary border-primary/20" },
  { value: "warning", label: "Warning", icon: AlertTriangle, badge: "bg-warning/10 text-warning border-warning/20" },
  { value: "success", label: "Success", icon: CheckCircle2, badge: "bg-success/10 text-success border-success/20" },
];

function TypeBadge({ type }: { type: AnnouncementType }) {
  const opt = TYPE_OPTIONS.find((t) => t.value === type) ?? TYPE_OPTIONS[0]!;
  const Icon = opt.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${opt.badge}`}>
      <Icon className="h-3 w-3" />
      {opt.label}
    </span>
  );
}

const QUERY_KEY = ["admin-announcements"];

export default function AdminAnnouncementsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: announcements = [], isLoading } = useAdminListAnnouncements({
    query: { queryKey: QUERY_KEY },
  });

  const { mutateAsync: create, isPending: creating } = useAdminCreateAnnouncement();
  const { mutateAsync: update } = useAdminUpdateAnnouncement();
  const { mutateAsync: remove } = useAdminDeleteAnnouncement();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<AnnouncementType>("info");
  const [expiresAt, setExpiresAt] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });

  const handleCreate = async () => {
    if (!title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    if (!body.trim()) { toast({ title: "Body is required", variant: "destructive" }); return; }
    try {
      await create({
        data: {
          title: title.trim(),
          body: body.trim(),
          type,
          expires_at: expiresAt || null,
        },
      });
      toast({ title: "Announcement posted" });
      setTitle("");
      setBody("");
      setType("info");
      setExpiresAt("");
      await invalidate();
    } catch {
      toast({ title: "Failed to post announcement", variant: "destructive" });
    }
  };

  const handleToggleActive = async (a: Announcement) => {
    try {
      await update({ id: a.id, data: { is_active: !a.is_active } });
      await invalidate();
    } catch {
      toast({ title: "Failed to update announcement", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove({ id });
      toast({ title: "Announcement deleted" });
      await invalidate();
    } catch {
      toast({ title: "Failed to delete announcement", variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <AdminBackButton />
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-primary" />
              Announcements
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Post platform-wide banners visible on every student's dashboard.
            </p>
          </div>
        </div>

        {/* Compose form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Announcement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder="Short headline, e.g. 'Scheduled maintenance on Sunday'"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={300}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Message</label>
              <Textarea
                placeholder="Full message shown below the title…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                maxLength={2000}
              />
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type</label>
                <div className="flex gap-2">
                  {TYPE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setType(opt.value)}
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                          type === opt.value
                            ? opt.badge + " ring-2 ring-offset-1 ring-current"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Expires at <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-auto"
                />
              </div>
            </div>

            <Button onClick={handleCreate} disabled={creating} className="gap-2">
              <Plus className="h-4 w-4" />
              {creating ? "Posting…" : "Post Announcement"}
            </Button>
          </CardContent>
        </Card>

        {/* Existing announcements */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            All Announcements ({announcements.length})
          </h2>

          {isLoading ? (
            <div className="flex h-24 items-center justify-center text-muted-foreground text-sm">
              Loading…
            </div>
          ) : announcements.length === 0 ? (
            <div className="flex h-24 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground text-sm">
              <Megaphone className="h-6 w-6 opacity-30" />
              <p>No announcements yet</p>
            </div>
          ) : (
            announcements.map((a) => (
              <div
                key={a.id}
                className={`rounded-lg border p-4 flex items-start gap-4 transition-opacity ${
                  a.is_active ? "" : "opacity-50"
                }`}
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <TypeBadge type={a.type} />
                    {!a.is_active && (
                      <Badge variant="secondary" className="text-xs">Inactive</Badge>
                    )}
                    {a.expires_at && (
                      <span className="text-xs text-muted-foreground">
                        Expires {format(new Date(a.expires_at), "MMM d, yyyy HH:mm")}
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-sm leading-snug">{a.title}</p>
                  <p className="text-sm text-muted-foreground leading-snug">{a.body}</p>
                  <p className="text-xs text-muted-foreground">
                    Posted {format(new Date(a.created_at), "MMM d, yyyy 'at' HH:mm")}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleActive(a)}
                    className="gap-1.5 text-xs"
                    title={a.is_active ? "Deactivate" : "Activate"}
                  >
                    {a.is_active ? (
                      <><EyeOff className="h-3.5 w-3.5" /> Hide</>
                    ) : (
                      <><Eye className="h-3.5 w-3.5" /> Show</>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(a.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 text-xs"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}
