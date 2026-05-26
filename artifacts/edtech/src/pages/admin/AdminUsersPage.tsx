import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle, XCircle, Search, Shield, User, Clock, RotateCcw, ChevronDown,
  Eye, FileText, BookOpen, Timer, TrendingUp, UserPlus, Upload, Download,
  AlertCircle, CheckCircle2, Loader2, Pencil,
} from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAdminApproveUser, useAdminRejectUser } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";
import { useState, useRef } from "react";
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

interface EditProfileDialogState {
  userId: string;
  userName: string;
  targetRole: string;
  current: { full_name: string; email: string; mobile_number: string };
}

/**
 * Mirrors the backend canActorEditTarget logic.
 * super_admin → can edit student and admin
 * admin       → can edit student ONLY
 */
function canActorEditTarget(actorRole: string, targetRole: string): boolean {
  if (actorRole === "super_admin") return targetRole === "student" || targetRole === "admin";
  if (actorRole === "admin") return targetRole === "student";
  return false;
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

interface ImportUser {
  full_name: string;
  email: string;
  password: string;
  role: string;
  mobile_number: string;
  status: string;
  _rowError?: string;
}

interface ImportResult {
  created: number;
  failed: number;
  errors: Array<{ email: string; error: string }>;
}

interface CreateUserForm {
  full_name: string;
  email: string;
  password: string;
  role: string;
  mobile_number: string;
  status: string;
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

function parseCSV(text: string): ImportUser[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const colIndex = (name: string) => headers.indexOf(name);

  const fi = colIndex("full_name");
  const ei = colIndex("email");
  const pi = colIndex("password");
  const ri = colIndex("role");
  const mi = colIndex("mobile_number");
  const si = colIndex("status");

  if (fi === -1 || ei === -1 || pi === -1) {
    throw new Error('CSV must have columns: full_name, email, password (plus optional: role, mobile_number, status)');
  }

  return lines.slice(1).map(line => {
    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    return {
      full_name: cols[fi] ?? "",
      email: cols[ei] ?? "",
      password: cols[pi] ?? "",
      role: (ri !== -1 ? cols[ri] : "") || "student",
      mobile_number: mi !== -1 ? (cols[mi] ?? "") : "",
      status: (si !== -1 ? cols[si] : "") || "active",
    };
  }).filter(u => u.full_name || u.email);
}

function parseJSON(text: string): ImportUser[] {
  const parsed = JSON.parse(text);
  const arr = Array.isArray(parsed) ? parsed : parsed.users;
  if (!Array.isArray(arr)) throw new Error("JSON must be an array of user objects (or { users: [...] })");
  return arr.map((u: Record<string, unknown>) => ({
    full_name: String(u.full_name ?? ""),
    email: String(u.email ?? ""),
    password: String(u.password ?? ""),
    role: String(u.role ?? "student"),
    mobile_number: String(u.mobile_number ?? ""),
    status: String(u.status ?? "active"),
  }));
}

const CSV_TEMPLATE = `full_name,email,password,role,mobile_number,status
Riya Sharma,riya@example.com,Pass@1234,student,+919876543210,active
Arjun Mehta,arjun@example.com,Pass@5678,student,,active`;

const EMPTY_FORM: CreateUserForm = {
  full_name: "", email: "", password: "", role: "student", mobile_number: "", status: "active",
};

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [resetDialog, setResetDialog] = useState<ResetDialogState | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [editProfileDialog, setEditProfileDialog] = useState<EditProfileDialogState | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", email: "", mobile_number: "" });

  // Create user state
  const [createDialog, setCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>(EMPTY_FORM);

  // Import state
  const [importDialog, setImportDialog] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportUser[] | null>(null);
  const [importParseError, setImportParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const editProfile = useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: Record<string, string> }) =>
      apiFetch(`/admin/users/${userId}/profile`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      toast({ title: "Profile updated successfully" });
      setEditProfileDialog(null);
    },
    onError: (err: unknown) => toast({ title: "Update failed", description: (err as Error).message, variant: "destructive" }),
  });

  const createUser = useMutation({
    mutationFn: (form: CreateUserForm) =>
      apiFetch("/admin/users/create", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      toast({ title: "User created successfully" });
      setCreateDialog(false);
      setCreateForm(EMPTY_FORM);
    },
    onError: (err: unknown) => toast({ title: "Error", description: (err as Error).message, variant: "destructive" }),
  });

  const bulkImport = useMutation({
    mutationFn: (users: ImportUser[]) =>
      apiFetch("/admin/users/bulk-import", { method: "POST", body: JSON.stringify({ users }) }),
    onSuccess: (result: ImportResult) => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      setImportResult(result);
      setImportPreview(null);
    },
    onError: (err: unknown) => toast({ title: "Import failed", description: (err as Error).message, variant: "destructive" }),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportParseError(null);
    setImportPreview(null);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        let parsed: ImportUser[];
        if (file.name.endsWith(".json")) {
          parsed = parseJSON(text);
        } else {
          parsed = parseCSV(text);
        }
        if (parsed.length === 0) {
          setImportParseError("No valid rows found in the file.");
          return;
        }
        setImportPreview(parsed);
      } catch (err) {
        setImportParseError(String((err as Error).message));
      }
    };
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "user_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetImportDialog() {
    setImportDialog(false);
    setImportPreview(null);
    setImportParseError(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

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
          {/* Admins see only name + role for super_admin rows; sensitive fields are masked at the API level */}
          {role === "super_admin" && currentRole !== "super_admin" ? (
            <div className="mt-1">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/60 italic">
                <Shield className="w-3 h-3" /> Details restricted
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
              {!!user.email && <span>{String(user.email)}</span>}
              {!!user.mobile_number && <span>{String(user.mobile_number)}</span>}
              {!!user.created_at && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(String(user.created_at)), "MMM d, yyyy")}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Eye (detail view) button is hidden for super_admin rows when actor is not super_admin */}
          {(role !== "super_admin" || currentRole === "super_admin") && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1"
              onClick={() => setDetailUserId(userId)}
              title="View user details"
            >
              <Eye className="w-3.5 h-3.5" />
            </Button>
          )}

          {/* Edit profile button — visible when actor has permission to edit this target.
              Super admins may also edit their own row from the admin dashboard. */}
          {(userId !== currentUser?.id || currentRole === "super_admin") && canActorEditTarget(currentRole ?? "", role) && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1"
              title="Edit profile fields"
              onClick={() => {
                setEditProfileDialog({
                  userId,
                  userName,
                  targetRole: role,
                  current: {
                    full_name: String(user.full_name ?? ""),
                    email: String(user.email ?? ""),
                    mobile_number: String(user.mobile_number ?? ""),
                  },
                });
                setEditForm({
                  full_name: String(user.full_name ?? ""),
                  email: String(user.email ?? ""),
                  mobile_number: String(user.mobile_number ?? ""),
                });
              }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}

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
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">User Management</h1>
            <p className="text-muted-foreground mt-1">{users.length} total users · {pending.length} pending approval</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                className="pl-9 w-56"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setImportDialog(true)}>
              <Upload className="w-4 h-4" /> Import Users
            </Button>
            <Button size="sm" className="gap-2" onClick={() => setCreateDialog(true)}>
              <UserPlus className="w-4 h-4" /> Create User
            </Button>
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

      {/* ── Create User Dialog ──────────────────────────────────────────────── */}
      <Dialog open={createDialog} onOpenChange={v => { if (!v) { setCreateDialog(false); setCreateForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" /> Create User
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-xs text-muted-foreground">
              Admin-created users can log in immediately with their email and password — no email verification required.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="cf-name">Full Name <span className="text-destructive">*</span></Label>
                <Input
                  id="cf-name"
                  placeholder="Riya Sharma"
                  value={createForm.full_name}
                  onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="cf-email">Email <span className="text-destructive">*</span></Label>
                <Input
                  id="cf-email"
                  type="email"
                  placeholder="riya@example.com"
                  value={createForm.email}
                  onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="cf-password">Password <span className="text-destructive">*</span></Label>
                <Input
                  id="cf-password"
                  type="password"
                  placeholder="Min 8 characters"
                  value={createForm.password}
                  onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={createForm.role} onValueChange={v => setCreateForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={createForm.status} onValueChange={v => setCreateForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending_approval">Pending Approval</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="cf-mobile">Mobile Number</Label>
                <Input
                  id="cf-mobile"
                  placeholder="+919876543210 (optional)"
                  value={createForm.mobile_number}
                  onChange={e => setCreateForm(f => ({ ...f, mobile_number: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDialog(false); setCreateForm(EMPTY_FORM); }}>
              Cancel
            </Button>
            <Button
              disabled={createUser.isPending || !createForm.full_name || !createForm.email || !createForm.password}
              onClick={() => createUser.mutate(createForm)}
            >
              {createUser.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Import Users Dialog ─────────────────────────────────────────────── */}
      <Dialog open={importDialog} onOpenChange={v => { if (!v) resetImportDialog(); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" /> Import Users
            </DialogTitle>
          </DialogHeader>

          {/* Result screen */}
          {importResult ? (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-success shrink-0" />
                <div>
                  <p className="font-semibold text-lg">Import Complete</p>
                  <p className="text-sm text-muted-foreground">
                    <span className="text-success font-medium">{importResult.created} created</span>
                    {importResult.failed > 0 && <>, <span className="text-destructive font-medium">{importResult.failed} failed</span></>}
                  </p>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1 max-h-48 overflow-y-auto">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-2">Failed rows</p>
                  {importResult.errors.map((e, i) => (
                    <div key={i} className="text-xs flex gap-2">
                      <span className="text-muted-foreground font-medium shrink-0">{e.email}</span>
                      <span className="text-destructive">{e.error}</span>
                    </div>
                  ))}
                </div>
              )}
              <DialogFooter>
                <Button onClick={resetImportDialog}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-1">
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2 text-sm">
                <p className="font-medium">File format</p>
                <p className="text-muted-foreground">
                  Upload a <span className="font-mono text-foreground">.csv</span> or <span className="font-mono text-foreground">.json</span> file.
                  Required columns: <span className="font-mono text-foreground">full_name</span>, <span className="font-mono text-foreground">email</span>, <span className="font-mono text-foreground">password</span>.
                  Optional: <span className="font-mono text-foreground">role</span> (student/admin/super_admin), <span className="font-mono text-foreground">mobile_number</span>, <span className="font-mono text-foreground">status</span> (active/pending_approval).
                </p>
                <p className="text-muted-foreground text-xs">
                  Imported users can log in immediately — no email verification required. Maximum 500 users per import.
                </p>
                <Button variant="outline" size="sm" className="gap-1.5 mt-1" onClick={downloadTemplate}>
                  <Download className="w-3.5 h-3.5" /> Download CSV Template
                </Button>
              </div>

              {/* File picker */}
              <div
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">Click to select file</p>
                <p className="text-xs text-muted-foreground mt-1">CSV or JSON</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {/* Parse error */}
              {importParseError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{importParseError}</span>
                </div>
              )}

              {/* Preview table */}
              {importPreview && importPreview.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{importPreview.length} users ready to import</p>
                    <Badge variant="outline" className="text-xs">{importPreview.length} rows</Badge>
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-60 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40 sticky top-0">
                          <tr>
                            {["Full Name", "Email", "Password", "Role", "Status", "Mobile"].map(h => (
                              <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {importPreview.map((u, i) => (
                            <tr key={i} className="hover:bg-muted/20">
                              <td className="px-3 py-2 font-medium truncate max-w-[120px]">{u.full_name}</td>
                              <td className="px-3 py-2 text-muted-foreground truncate max-w-[140px]">{u.email}</td>
                              <td className="px-3 py-2 text-muted-foreground">{"•".repeat(Math.min(u.password.length, 8))}</td>
                              <td className="px-3 py-2">
                                <Badge variant="secondary" className="text-xs capitalize">{u.role || "student"}</Badge>
                              </td>
                              <td className="px-3 py-2">
                                <Badge variant={u.status === "active" ? "outline" : "secondary"} className="text-xs">{u.status || "active"}</Badge>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{u.mobile_number || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <DialogFooter className="pt-2">
                    <Button variant="outline" onClick={resetImportDialog}>Cancel</Button>
                    <Button
                      disabled={bulkImport.isPending}
                      onClick={() => bulkImport.mutate(importPreview)}
                    >
                      {bulkImport.isPending
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing…</>
                        : `Import ${importPreview.length} Users`}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Reset Progress Dialog ───────────────────────────────────────────── */}
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

      {/* ── Edit Profile Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!editProfileDialog} onOpenChange={v => { if (!v) setEditProfileDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" /> Edit Profile
            </DialogTitle>
          </DialogHeader>
          {editProfileDialog && (
            <div className="space-y-4 py-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Editing{" "}
                <span className="font-medium text-foreground">{editProfileDialog.userName}</span>
                {roleBadge(editProfileDialog.targetRole)}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ep-name">Full Name</Label>
                <Input
                  id="ep-name"
                  placeholder="Full name"
                  value={editForm.full_name}
                  onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ep-mobile">Mobile Number</Label>
                <Input
                  id="ep-mobile"
                  placeholder="+919876543210"
                  value={editForm.mobile_number}
                  onChange={e => setEditForm(f => ({ ...f, mobile_number: e.target.value }))}
                />
              </div>

              {/* Email is only editable by super_admin */}
              {currentRole === "super_admin" && (
                <div className="space-y-1.5">
                  <Label htmlFor="ep-email">
                    Email{" "}
                    <span className="text-xs text-muted-foreground font-normal">(super admin only)</span>
                  </Label>
                  <Input
                    id="ep-email"
                    type="email"
                    placeholder="user@example.com"
                    value={editForm.email}
                    onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>
              )}

              <div className="rounded-lg bg-muted/30 border border-border px-3 py-2 text-xs text-muted-foreground">
                Changes are logged to the audit trail including previous and updated values.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProfileDialog(null)}>Cancel</Button>
            <Button
              disabled={editProfile.isPending || !editForm.full_name.trim()}
              onClick={() => {
                if (!editProfileDialog) return;
                const body: Record<string, string> = {};
                if (editForm.full_name.trim() !== editProfileDialog.current.full_name)
                  body["full_name"] = editForm.full_name.trim();
                if (editForm.mobile_number !== editProfileDialog.current.mobile_number)
                  body["mobile_number"] = editForm.mobile_number;
                if (currentRole === "super_admin" && editForm.email !== editProfileDialog.current.email)
                  body["email"] = editForm.email;
                if (Object.keys(body).length === 0) {
                  setEditProfileDialog(null);
                  return;
                }
                editProfile.mutate({ userId: editProfileDialog.userId, body });
              }}
            >
              {editProfile.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── User Detail Modal ───────────────────────────────────────────────── */}
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
