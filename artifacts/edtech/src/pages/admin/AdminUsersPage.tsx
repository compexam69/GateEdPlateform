import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  CheckCircle, XCircle, Search, Shield, User, Clock, RotateCcw, ChevronDown,
  Eye, FileText, BookOpen, Timer, TrendingUp,
} from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAdminApproveUser, useAdminRejectUser } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const USERS_KEY = ["admin-users"];

import { getApiBase } from "@/lib/api";

async function apiFetch(path: string, opts: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${getApiBase()}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

interface ResetDialogState {
  userId: string;
  userName: string;
  scope: "all" | "topic" | "chapter" | "subject";
}

interface UserDetail {
  profile: Record<string, unknown>;
  attempts: Array<{
    id: string;
    score: number;
    total_marks: number;
    accuracy: number;
    status: string;
    started_at: string;
    submitted_at?: string;
    quizzes: { title: string; type: string } | null;
  }>;
  notes: Array<{
    id: string;
    title: string;
    pdf_size_bytes: number;
    created_at: string;
    chapters: { title: string } | null;
  }>;
  pomodoro_sessions: Array<{
    id: string;
    duration_seconds: number;
    topic_context?: string;
    start_time: string;
  }>;
  stats: {
    total_attempts: number;
    total_notes: number;
    total_notes_bytes: number;
    total_pomodoro_seconds: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [resetDialog, setResetDialog] = useState<ResetDialogState | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: USERS_KEY,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: userDetail, isLoading: detailLoading } = useQuery<UserDetail>({
    queryKey: ["admin-user-detail", detailUserId],
    queryFn: () => apiFetch(`/admin/users/${detailUserId}/detail`),
    enabled: !!detailUserId,
  });

  const approve = useAdminApproveUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: USERS_KEY });
        toast({ title: "User approved" });
      },
      onError: (err: unknown) => toast({ title: "Error", description: (err as Error).message, variant: "destructive" }),
    },
  });

  const reject = useAdminRejectUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: USERS_KEY });
        toast({ title: "User rejected/suspended" });
      },
      onError: (err: unknown) => toast({ title: "Error", description: (err as Error).message, variant: "destructive" }),
    },
  });

  const { user: currentUser, role: currentRole } = useAuth();

  const resetProgress = useMutation({
    mutationFn: ({ userId, scope }: { userId: string; scope: string }) =>
      apiFetch(`/admin/users/${userId}/reset-progress`, {
        method: "POST",
        body: JSON.stringify({ scope }),
      }),
    onSuccess: () => {
      toast({ title: "Progress reset successfully" });
      setResetDialog(null);
    },
    onError: (err: unknown) => toast({ title: "Error", description: (err as Error).message, variant: "destructive" }),
  });

  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiFetch(`/admin/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      toast({ title: "Role updated successfully" });
    },
    onError: (err: unknown) => toast({ title: "Error", description: (err as Error).message, variant: "destructive" }),
  });

  const filtered = users.filter((u: { full_name?: string; email?: string }) =>
    !search ||
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const pending = filtered.filter((u: { status: string }) => u.status === "pending_approval");
  const active = filtered.filter((u: { status: string }) => u.status === "active");
  const suspended = filtered.filter((u: { status: string }) => u.status === "suspended");

  function statusBadge(status: string) {
    if (status === "active") return <Badge className="bg-success/10 text-success border-success/20">Active</Badge>;
    if (status === "pending_approval") return <Badge className="bg-warning/10 text-warning border-warning/20">Pending</Badge>;
    return <Badge variant="destructive">Suspended</Badge>;
  }

  function roleBadge(role: string) {
    if (role === "super_admin") return <Badge className="bg-primary/10 text-primary border-primary/20"><Shield className="w-3 h-3 mr-1" />Super Admin</Badge>;
    if (role === "admin") return <Badge variant="outline"><Shield className="w-3 h-3 mr-1" />Admin</Badge>;
    return <Badge variant="secondary"><User className="w-3 h-3 mr-1" />Student</Badge>;
  }

  function UserRow({ user }: { user: Record<string, unknown> }) {
    const userId = String(user.id);
    const userName = String(user.full_name || "Unknown");
    const role = String(user.role || "student");
    const status = String(user.status || "pending_approval");

    return (
      <div className="flex items-center justify-between p-4 border border-border rounded-lg gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{userName}</span>
            {roleBadge(role)}
            {statusBadge(status)}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
            <span>{String(user.email || "")}</span>
            {!!user.mobile_number && <span>{String(user.mobile_number)}</span>}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {user.created_at ? format(new Date(String(user.created_at)), "MMM d, yyyy") : ""}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* View details button */}
          <Button
            size="sm"
            variant="ghost"
            className="gap-1"
            onClick={() => setDetailUserId(userId)}
            title="View user details"
          >
            <Eye className="w-3.5 h-3.5" />
          </Button>

          {/* Status actions */}
          {status === "pending_approval" && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10 border-destructive/30"
                onClick={() => reject.mutate({ userId })}
                disabled={reject.isPending}
              >
                <XCircle className="w-4 h-4 mr-1" /> Reject
              </Button>
              <Button
                size="sm"
                className="bg-success hover:bg-success/90 text-white"
                onClick={() => approve.mutate({ userId })}
                disabled={approve.isPending}
              >
                <CheckCircle className="w-4 h-4 mr-1" /> Approve
              </Button>
            </>
          )}
          {status === "active" && role === "student" && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:bg-destructive/10 border-destructive/30"
              onClick={() => reject.mutate({ userId })}
              disabled={reject.isPending}
            >
              <XCircle className="w-4 h-4 mr-1" /> Suspend
            </Button>
          )}
          {status === "suspended" && (
            <Button
              size="sm"
              className="bg-success hover:bg-success/90 text-white"
              onClick={() => approve.mutate({ userId })}
              disabled={approve.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-1" /> Reinstate
            </Button>
          )}

          {/* Role change (super_admin only, not for self) */}
          {currentRole === "super_admin" && userId !== currentUser?.id && (
            <Select
              value={role}
              onValueChange={(newRole) => changeRole.mutate({ userId, role: newRole })}
              disabled={changeRole.isPending}
            >
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Reset Progress dropdown (students only) */}
          {role === "student" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1">
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-warning focus:text-warning"
                  onClick={() => setResetDialog({ userId, userName, scope: "topic" })}
                >
                  Reset Topic Progress
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-warning focus:text-warning"
                  onClick={() => setResetDialog({ userId, userName, scope: "chapter" })}
                >
                  Reset Chapter Progress
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-warning focus:text-warning"
                  onClick={() => setResetDialog({ userId, userName, scope: "subject" })}
                >
                  Reset Subject Progress
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setResetDialog({ userId, userName, scope: "all" })}
                >
                  Reset ALL Progress
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    );
  }

  return (
    <AppLayout requireAdmin>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
            <p className="text-muted-foreground mt-1">{users.length} total users · {pending.length} pending approval</p>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              className="pl-9 w-64"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
              <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
              <TabsTrigger value="suspended">Suspended ({suspended.length})</TabsTrigger>
            </TabsList>

            {[
              { key: "pending", list: pending, empty: "No pending approvals." },
              { key: "active", list: active, empty: "No active users." },
              { key: "suspended", list: suspended, empty: "No suspended users." },
            ].map(({ key, list, empty }) => (
              <TabsContent key={key} value={key} className="space-y-3 mt-4">
                {list.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">{empty}</div>
                ) : (
                  list.map((user: Record<string, unknown>) => (
                    <UserRow key={String(user.id)} user={user} />
                  ))
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>

      {/* Reset Progress Confirmation Dialog */}
      <Dialog open={!!resetDialog} onOpenChange={v => { if (!v) setResetDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <RotateCcw className="w-5 h-5" /> Reset Progress
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              You are about to reset{" "}
              <span className="font-medium text-foreground capitalize">
                {resetDialog?.scope === "all" ? "ALL" : resetDialog?.scope}
              </span>{" "}
              progress for{" "}
              <span className="font-medium text-foreground">{resetDialog?.userName}</span>.
            </p>
            {resetDialog?.scope === "all" && (
              <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
                This will permanently delete all topic, chapter, and subject progress. This cannot be undone.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={resetProgress.isPending}
              onClick={() => {
                if (resetDialog) {
                  resetProgress.mutate({ userId: resetDialog.userId, scope: resetDialog.scope });
                }
              }}
            >
              {resetProgress.isPending ? "Resetting..." : "Confirm Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Detail Modal */}
      <Dialog open={!!detailUserId} onOpenChange={v => { if (!v) setDetailUserId(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              User Details
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : userDetail ? (
            <div className="space-y-5">
              {/* Stats overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: TrendingUp, label: "Attempts", value: String(userDetail.stats.total_attempts) },
                  { icon: FileText, label: "Notes", value: String(userDetail.stats.total_notes) },
                  { icon: BookOpen, label: "Storage", value: formatBytes(userDetail.stats.total_notes_bytes) },
                  { icon: Timer, label: "Focus Time", value: formatDuration(userDetail.stats.total_pomodoro_seconds) },
                ].map(({ icon: Icon, label, value }) => (
                  <Card key={label} className="bg-muted/30">
                    <CardContent className="p-3 text-center">
                      <Icon className="w-4 h-4 text-primary mx-auto mb-1" />
                      <p className="text-lg font-bold">{value}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Recent Attempts */}
              {userDetail.attempts.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Recent Exam Attempts</h3>
                  <div className="space-y-2">
                    {userDetail.attempts.slice(0, 8).map(attempt => (
                      <div key={attempt.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{attempt.quizzes?.title ?? "Unknown Quiz"}</p>
                          <p className="text-xs text-muted-foreground">
                            {attempt.submitted_at ? format(new Date(attempt.submitted_at), "MMM d, yyyy HH:mm") : "In progress"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`font-semibold ${attempt.accuracy >= 60 ? "text-success" : "text-destructive"}`}>
                            {Math.round(attempt.accuracy)}%
                          </span>
                          <Badge variant={attempt.status === "submitted" ? "secondary" : "outline"} className="text-xs">
                            {attempt.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {userDetail.notes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Uploaded Notes</h3>
                  <div className="space-y-2">
                    {userDetail.notes.slice(0, 6).map(note => (
                      <div key={note.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{note.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {note.chapters?.title ?? "Unknown Chapter"} · {format(new Date(note.created_at), "MMM d, yyyy")}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{formatBytes(note.pdf_size_bytes)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {userDetail.attempts.length === 0 && userDetail.notes.length === 0 && (
                <p className="text-center text-muted-foreground py-6 text-sm">No activity recorded for this user yet.</p>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailUserId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
