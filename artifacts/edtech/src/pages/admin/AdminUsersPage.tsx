import { AppLayout } from "@/components/layout/AppLayout";
import { AdminBreadcrumb } from "@/components/layout/AdminBreadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckCircle, XCircle, Search, Shield, User, Clock, RotateCcw,
  Eye, FileText, BookOpen, Timer, TrendingUp, UserPlus, Upload, Download,
  AlertCircle, CheckCircle2, Loader2, Pencil, MoreVertical, X,
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ── Constants & helpers ────────────────────────────────────────────────────────

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

function canActorEditTarget(actorRole: string, targetRole: string): boolean {
  if (actorRole === "super_admin") return targetRole === "student" || targetRole === "admin";
  if (actorRole === "admin") return targetRole === "student";
  return false;
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
  const fi = colIndex("full_name"), ei = colIndex("email"), pi = colIndex("password");
  const ri = colIndex("role"), mi = colIndex("mobile_number"), si = colIndex("status");
  if (fi === -1 || ei === -1 || pi === -1)
    throw new Error("CSV must have columns: full_name, email, password (plus optional: role, mobile_number, status)");
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

function statusBadge(status: string) {
  if (status === "active")
    return <Badge className="bg-success/15 text-success border-success/25 text-[10px] px-1.5 py-0">Active</Badge>;
  if (status === "pending_approval")
    return <Badge className="bg-warning/15 text-warning border-warning/25 text-[10px] px-1.5 py-0">Pending</Badge>;
  return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Suspended</Badge>;
}

function roleBadge(role: string) {
  if (role === "super_admin")
    return <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5 py-0"><Shield className="w-2.5 h-2.5 mr-1" />Super Admin</Badge>;
  if (role === "admin")
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0"><Shield className="w-2.5 h-2.5 mr-1" />Admin</Badge>;
  return <Badge variant="secondary" className="text-[10px] px-1.5 py-0"><User className="w-2.5 h-2.5 mr-1" />Student</Badge>;
}

const CSV_TEMPLATE = `full_name,email,password,role,mobile_number,status
Riya Sharma,riya@example.com,Pass@1234,student,+919876543210,active
Arjun Mehta,arjun@example.com,Pass@5678,student,,active`;

const EMPTY_FORM: CreateUserForm = {
  full_name: "", email: "", password: "", role: "student", mobile_number: "", status: "active",
};

// ── Interfaces ─────────────────────────────────────────────────────────────────

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

interface UserDetail {
  profile: Record<string, unknown>;
  attempts: Array<{
    id: string; score: number; total_marks: number; accuracy: number;
    status: string; started_at: string; submitted_at?: string;
    quizzes: { title: string; type: string } | null;
  }>;
  notes: Array<{
    id: string; title: string; pdf_size_bytes: number;
    created_at: string; chapters: { title: string } | null;
  }>;
  pomodoro_sessions: Array<{
    id: string; duration_seconds: number; topic_context?: string; start_time: string;
  }>;
  stats: {
    total_attempts: number; total_notes: number;
    total_notes_bytes: number; total_pomodoro_seconds: number;
  };
}

interface ImportUser {
  full_name: string; email: string; password: string;
  role: string; mobile_number: string; status: string; _rowError?: string;
}

interface ImportResult {
  created: number; failed: number; errors: Array<{ email: string; error: string }>;
}

interface CreateUserForm {
  full_name: string; email: string; password: string;
  role: string; mobile_number: string; status: string;
}

// ── BulkActionBar (module-level component) ─────────────────────────────────────

interface BulkActionBarProps {
  list: Record<string, unknown>[];
  selectedIds: Set<string>;
  activeTab: string;
  bulkLoading: boolean;
  onClear: () => void;
  onSelectAll: () => void;
  onBulkApprove: (ids: string[]) => void;
  onBulkReject: (ids: string[]) => void;
}

function BulkActionBar({
  list, selectedIds, activeTab, bulkLoading,
  onClear, onSelectAll, onBulkApprove, onBulkReject,
}: BulkActionBarProps) {
  if (selectedIds.size === 0) return null;

  const selectedArr = Array.from(selectedIds);
  const eligibleForSuspend = list
    .filter(u => selectedIds.has(String(u.id)) && String(u.role) === "student")
    .map(u => String(u.id));
  const allSelected = list.length > 0 && list.every(u => selectedIds.has(String(u.id)));

  return (
    <div className="flex items-center gap-2 bg-primary/8 border border-primary/25 rounded-xl px-3 py-2.5 mb-3">
      <button
        onClick={onClear}
        className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-border transition-colors shrink-0"
        aria-label="Clear selection"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <span className="text-sm font-semibold text-foreground">
        {selectedIds.size} selected
      </span>

      <button
        onClick={allSelected ? onClear : onSelectAll}
        className="text-xs text-primary hover:text-primary/80 font-medium underline underline-offset-2 transition-colors ml-1 shrink-0"
      >
        {allSelected ? "Deselect all" : `Select all ${list.length}`}
      </button>

      <div className="flex-1" />

      {bulkLoading ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Working…
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          {activeTab === "pending" && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs gap-1 text-destructive hover:bg-destructive/10 border-destructive/30 font-medium"
                onClick={() => onBulkReject(selectedArr)}
              >
                <XCircle className="w-3.5 h-3.5" /> Reject
              </Button>
              <Button
                size="sm"
                className="h-8 px-3 text-xs gap-1 bg-success hover:bg-success/90 text-white font-medium"
                onClick={() => onBulkApprove(selectedArr)}
              >
                <CheckCircle className="w-3.5 h-3.5" /> Approve
              </Button>
            </>
          )}
          {activeTab === "active" && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs gap-1 text-destructive hover:bg-destructive/10 border-destructive/30 font-medium"
              onClick={() => onBulkReject(eligibleForSuspend)}
              disabled={eligibleForSuspend.length === 0}
              title={eligibleForSuspend.length === 0 ? "Only student accounts can be suspended" : undefined}
            >
              <XCircle className="w-3.5 h-3.5" /> Suspend
              {eligibleForSuspend.length !== selectedIds.size && eligibleForSuspend.length > 0 && (
                <span className="ml-0.5 opacity-70">({eligibleForSuspend.length})</span>
              )}
            </Button>
          )}
          {activeTab === "suspended" && (
            <Button
              size="sm"
              className="h-8 px-3 text-xs gap-1 bg-success hover:bg-success/90 text-white font-medium"
              onClick={() => onBulkApprove(selectedArr)}
            >
              <CheckCircle className="w-3.5 h-3.5" /> Reinstate
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── UserRow (module-level component) ──────────────────────────────────────────

interface UserRowProps {
  user: Record<string, unknown>;
  currentUserId: string | undefined;
  currentRole: string | null | undefined;
  isSelected: boolean;
  approveIsPending: boolean;
  rejectIsPending: boolean;
  changeRoleIsPending: boolean;
  onToggle: (id: string) => void;
  onViewDetail: (id: string) => void;
  onEditProfile: (state: EditProfileDialogState, form: { full_name: string; email: string; mobile_number: string }) => void;
  onChangeRole: (userId: string, role: string) => void;
  onResetDialog: (state: ResetDialogState) => void;
  onApprove: (userId: string) => void;
  onReject: (userId: string) => void;
}

function UserRow({
  user, currentUserId, currentRole, isSelected,
  approveIsPending, rejectIsPending, changeRoleIsPending,
  onToggle, onViewDetail, onEditProfile, onChangeRole, onResetDialog, onApprove, onReject,
}: UserRowProps) {
  const userId   = String(user.id);
  const userName = String(user.full_name || "Unknown");
  const role     = String(user.role || "student");
  const status   = String(user.status || "pending_approval");

  const canView = role !== "super_admin" || currentRole === "super_admin";
  const canEdit =
    (userId !== currentUserId || currentRole === "super_admin") &&
    canActorEditTarget(currentRole ?? "", role);
  const isSelf       = userId === currentUserId;
  const isSuperAdmin = role === "super_admin";

  const hasOverflowItems =
    canView || canEdit ||
    (currentRole === "super_admin" && !isSelf) ||
    role === "student";

  const hasPrimaryAction =
    status === "pending_approval" ||
    (status === "active" && role === "student") ||
    status === "suspended";

  return (
    <div className={cn(
      "border rounded-xl bg-card overflow-hidden transition-colors",
      isSelected ? "border-primary/60 bg-primary/5" : "border-border",
    )}>
      {/* Status colour bar */}
      <div className={cn("h-[3px]",
        status === "pending_approval" && "bg-warning",
        status === "active"           && "bg-success",
        status === "suspended"        && "bg-destructive/70",
      )} />

      {/* ── Info row ────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 p-4">
        {/* Checkbox */}
        <div className="pt-0.5 shrink-0">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggle(userId)}
            aria-label={`Select ${userName}`}
            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
        </div>

        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 select-none">
          <span className="text-sm font-bold text-primary">{userName.charAt(0).toUpperCase()}</span>
        </div>

        {/* Name + badges + contact */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm leading-snug">{userName}</span>
            {roleBadge(role)}
            {statusBadge(status)}
          </div>
          {isSuperAdmin && currentRole !== "super_admin" ? (
            <span className="text-xs text-muted-foreground/60 italic flex items-center gap-1 mt-1">
              <Shield className="w-3 h-3" /> Details restricted
            </span>
          ) : (
            <div className="flex flex-col mt-1.5 gap-0.5 text-xs text-muted-foreground">
              {!!user.email && <span className="truncate">{String(user.email)}</span>}
              <div className="flex items-center gap-3 flex-wrap">
                {!!user.mobile_number && <span>{String(user.mobile_number)}</span>}
                {!!user.created_at && (
                  <span className="flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3" />
                    {format(new Date(String(user.created_at)), "MMM d, yyyy")}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ⋮ Overflow menu */}
        {hasOverflowItems && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon" variant="ghost"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="More actions"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {canView && (
                <DropdownMenuItem onClick={() => onViewDetail(userId)}>
                  <Eye className="w-4 h-4 mr-2 shrink-0" /> View Details
                </DropdownMenuItem>
              )}
              {canEdit && (
                <DropdownMenuItem onClick={() => onEditProfile(
                  {
                    userId, userName, targetRole: role,
                    current: {
                      full_name: String(user.full_name ?? ""),
                      email: String(user.email ?? ""),
                      mobile_number: String(user.mobile_number ?? ""),
                    },
                  },
                  {
                    full_name: String(user.full_name ?? ""),
                    email: String(user.email ?? ""),
                    mobile_number: String(user.mobile_number ?? ""),
                  },
                )}>
                  <Pencil className="w-4 h-4 mr-2 shrink-0" /> Edit Profile
                </DropdownMenuItem>
              )}

              {currentRole === "super_admin" && !isSelf && (
                <>
                  {(canView || canEdit) && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-medium px-2 py-1.5">
                    Change Role
                  </DropdownMenuLabel>
                  {(["student", "admin", "super_admin"] as const).map(r => (
                    <DropdownMenuItem
                      key={r}
                      disabled={role === r || changeRoleIsPending}
                      className={role === r ? "text-primary font-medium" : ""}
                      onClick={() => role !== r && onChangeRole(userId, r)}
                    >
                      {role === r
                        ? <CheckCircle2 className="w-4 h-4 mr-2 shrink-0 text-primary" />
                        : <span className="w-4 h-4 mr-2 shrink-0 inline-block" />}
                      {r === "super_admin" ? "Super Admin" : r.charAt(0).toUpperCase() + r.slice(1)}
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {role === "student" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-medium px-2 py-1.5">
                    Reset Progress
                  </DropdownMenuLabel>
                  {(["topic", "chapter", "subject"] as const).map(scope => (
                    <DropdownMenuItem
                      key={scope}
                      className="text-warning focus:text-warning"
                      onClick={() => onResetDialog({ userId, userName, scope })}
                    >
                      <RotateCcw className="w-4 h-4 mr-2 shrink-0" />
                      {scope.charAt(0).toUpperCase() + scope.slice(1)}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onResetDialog({ userId, userName, scope: "all" })}
                  >
                    <RotateCcw className="w-4 h-4 mr-2 shrink-0" /> All Progress
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* ── Primary action footer ────────────────────────────────────── */}
      {hasPrimaryAction && (
        <>
          <div className="h-px bg-border mx-4" />
          <div className="px-4 py-3">
            {status === "pending_approval" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-9 gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/30 font-medium"
                  onClick={() => onReject(userId)}
                  disabled={rejectIsPending}
                >
                  <XCircle className="w-4 h-4 shrink-0" /> Reject
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-9 gap-1.5 bg-success hover:bg-success/90 text-white font-medium"
                  onClick={() => onApprove(userId)}
                  disabled={approveIsPending}
                >
                  <CheckCircle className="w-4 h-4 shrink-0" /> Approve
                </Button>
              </div>
            )}
            {status === "active" && role === "student" && (
              <Button
                size="sm"
                variant="outline"
                className="w-full h-9 gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/30 font-medium"
                onClick={() => onReject(userId)}
                disabled={rejectIsPending}
              >
                <XCircle className="w-4 h-4 shrink-0" /> Suspend User
              </Button>
            )}
            {status === "suspended" && (
              <Button
                size="sm"
                className="w-full h-9 gap-1.5 bg-success hover:bg-success/90 text-white font-medium"
                onClick={() => onApprove(userId)}
                disabled={approveIsPending}
              >
                <CheckCircle className="w-4 h-4 shrink-0" /> Reinstate User
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Page component ─────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [resetDialog, setResetDialog] = useState<ResetDialogState | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [editProfileDialog, setEditProfileDialog] = useState<EditProfileDialogState | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", email: "", mobile_number: "" });
  const [createDialog, setCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>(EMPTY_FORM);
  const [importDialog, setImportDialog] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportUser[] | null>(null);
  const [importParseError, setImportParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Bulk selection ───────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("pending");
  const [bulkLoading, setBulkLoading] = useState(false);

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function clearSelection() { setSelectedIds(new Set()); }

  function handleTabChange(tab: string) { setActiveTab(tab); clearSelection(); }

  async function bulkApprove(ids: string[]) {
    if (!ids.length) return;
    setBulkLoading(true);
    const results = await Promise.allSettled(
      ids.map(userId => apiFetch(`/admin/users/${userId}/approve`, { method: "POST" }))
    );
    const failed = results.filter(r => r.status === "rejected").length;
    queryClient.invalidateQueries({ queryKey: USERS_KEY });
    clearSelection();
    setBulkLoading(false);
    if (failed > 0) {
      toast({ title: `${ids.length - failed} approved, ${failed} failed`, variant: "destructive" });
    } else {
      toast({ title: `${ids.length} user${ids.length > 1 ? "s" : ""} approved` });
    }
  }

  async function bulkReject(ids: string[]) {
    if (!ids.length) return;
    setBulkLoading(true);
    const results = await Promise.allSettled(
      ids.map(userId => apiFetch(`/admin/users/${userId}/reject`, { method: "POST" }))
    );
    const failed = results.filter(r => r.status === "rejected").length;
    queryClient.invalidateQueries({ queryKey: USERS_KEY });
    clearSelection();
    setBulkLoading(false);
    const label = activeTab === "active" ? "suspended" : "rejected";
    if (failed > 0) {
      toast({ title: `${ids.length - failed} ${label}, ${failed} failed`, variant: "destructive" });
    } else {
      toast({ title: `${ids.length} user${ids.length > 1 ? "s" : ""} ${label}` });
    }
  }

  // ── Data / mutations ─────────────────────────────────────────────────────
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
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: USERS_KEY }); toast({ title: "User approved" }); },
      onError: (err: unknown) => toast({ title: "Error", description: (err as Error).message, variant: "destructive" }),
    },
  });

  const reject = useAdminRejectUser({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: USERS_KEY }); toast({ title: "User rejected/suspended" }); },
      onError: (err: unknown) => toast({ title: "Error", description: (err as Error).message, variant: "destructive" }),
    },
  });

  const { user: currentUser, role: currentRole } = useAuth();

  const resetProgress = useMutation({
    mutationFn: ({ userId, scope }: { userId: string; scope: string }) =>
      apiFetch(`/admin/users/${userId}/reset-progress`, { method: "POST", body: JSON.stringify({ scope }) }),
    onSuccess: () => { toast({ title: "Progress reset successfully" }); setResetDialog(null); },
    onError: (err: unknown) => toast({ title: "Error", description: (err as Error).message, variant: "destructive" }),
  });

  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiFetch(`/admin/users/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: USERS_KEY }); toast({ title: "Role updated successfully" }); },
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
    setImportParseError(null); setImportPreview(null); setImportResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        const parsed = file.name.endsWith(".json") ? parseJSON(text) : parseCSV(text);
        if (parsed.length === 0) { setImportParseError("No valid rows found in the file."); return; }
        setImportPreview(parsed);
      } catch (err) { setImportParseError(String((err as Error).message)); }
    };
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "user_import_template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function resetImportDialog() {
    setImportDialog(false); setImportPreview(null); setImportParseError(null); setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Filtered lists ───────────────────────────────────────────────────────
  const filtered = users.filter((u: { full_name?: string; email?: string }) =>
    !search ||
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );
  const pending   = filtered.filter((u: { status: string }) => u.status === "pending_approval");
  const active    = filtered.filter((u: { status: string }) => u.status === "active");
  const suspended = filtered.filter((u: { status: string }) => u.status === "suspended");

  // ── Shared UserRow props ─────────────────────────────────────────────────
  const rowSharedProps = {
    currentUserId: currentUser?.id,
    currentRole,
    approveIsPending: approve.isPending,
    rejectIsPending: reject.isPending,
    changeRoleIsPending: changeRole.isPending,
    onToggle: toggleSelect,
    onViewDetail: setDetailUserId,
    onEditProfile: (state: EditProfileDialogState, form: { full_name: string; email: string; mobile_number: string }) => {
      setEditProfileDialog(state);
      setEditForm(form);
    },
    onChangeRole: (userId: string, role: string) => changeRole.mutate({ userId, role }),
    onResetDialog: setResetDialog,
    onApprove: (userId: string) => approve.mutate({ userId }),
    onReject: (userId: string) => reject.mutate({ userId }),
  };

  // ── Shared BulkActionBar props ───────────────────────────────────────────
  const bulkBarSharedProps = {
    selectedIds,
    activeTab,
    bulkLoading,
    onClear: clearSelection,
    onBulkApprove: bulkApprove,
    onBulkReject: bulkReject,
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        <AdminBreadcrumb pageName="User Management" />

        {/* ── Page header ───────────────────────────────────────────── */}
        <div className="space-y-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">User Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {users.length} total users · {pending.length} pending approval
            </p>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by name or email…"
                className="pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button
              variant="outline" size="sm" className="gap-1.5 h-10 px-3 shrink-0"
              onClick={() => setImportDialog(true)}
            >
              <Upload className="w-4 h-4 shrink-0" />
              <span className="hidden xs:inline sm:inline">Import Users</span>
            </Button>
          </div>

          <Button size="sm" className="gap-1.5 h-9" onClick={() => setCreateDialog(true)}>
            <UserPlus className="w-4 h-4 shrink-0" /> Create User
          </Button>
        </div>

        {/* ── User list ─────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:flex h-auto p-1 gap-1 rounded-xl">
              {[
                { key: "pending",   label: "Pending",   count: pending.length,   cc: "bg-warning/20 text-warning" },
                { key: "active",    label: "Active",    count: active.length,    cc: "bg-success/20 text-success" },
                { key: "suspended", label: "Suspended", count: suspended.length, cc: "bg-destructive/20 text-destructive" },
              ].map(({ key, label, count, cc }) => (
                <TabsTrigger
                  key={key} value={key}
                  className="rounded-lg text-xs sm:text-sm py-2 px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  {label}
                  {count > 0 && (
                    <span className={cn(
                      "ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1",
                      cc,
                    )}>
                      {count}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {([
              { key: "pending",   list: pending,   empty: "No pending approvals." },
              { key: "active",    list: active,    empty: "No active users." },
              { key: "suspended", list: suspended, empty: "No suspended users." },
            ] as const).map(({ key, list, empty }) => (
              <TabsContent key={key} value={key} className="mt-4 space-y-2.5">
                <BulkActionBar
                  {...bulkBarSharedProps}
                  list={list}
                  onSelectAll={() => setSelectedIds(new Set(list.map((u: Record<string, unknown>) => String(u.id))))}
                />
                {list.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">{empty}</div>
                ) : (
                  (list as Record<string, unknown>[]).map(user => (
                    <UserRow
                      key={String(user.id)}
                      user={user}
                      isSelected={selectedIds.has(String(user.id))}
                      {...rowSharedProps}
                    />
                  ))
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>

      {/* ── Create User Dialog ─────────────────────────────────────────────── */}
      <Dialog open={createDialog} onOpenChange={v => { if (!v) { setCreateDialog(false); setCreateForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" /> Create User
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-xs text-muted-foreground">
              Admin-created users can log in immediately — no email verification required.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="cf-name">Full Name <span className="text-destructive">*</span></Label>
                <Input id="cf-name" placeholder="Riya Sharma" value={createForm.full_name}
                  onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="cf-email">Email <span className="text-destructive">*</span></Label>
                <Input id="cf-email" type="email" placeholder="riya@example.com" value={createForm.email}
                  onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="cf-password">Password <span className="text-destructive">*</span></Label>
                <Input id="cf-password" type="password" placeholder="Min 8 characters" value={createForm.password}
                  onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} />
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
                <Input id="cf-mobile" placeholder="+919876543210 (optional)" value={createForm.mobile_number}
                  onChange={e => setCreateForm(f => ({ ...f, mobile_number: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDialog(false); setCreateForm(EMPTY_FORM); }}>Cancel</Button>
            <Button
              disabled={createUser.isPending || !createForm.full_name || !createForm.email || !createForm.password}
              onClick={() => createUser.mutate(createForm)}
            >
              {createUser.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Import Users Dialog ───────────────────────────────────────────────── */}
      <Dialog open={importDialog} onOpenChange={v => { if (!v) resetImportDialog(); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" /> Import Users
            </DialogTitle>
          </DialogHeader>
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
              <DialogFooter><Button onClick={resetImportDialog}>Done</Button></DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-1">
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2 text-sm">
                <p className="font-medium">File format</p>
                <p className="text-muted-foreground">
                  Upload a <span className="font-mono text-foreground">.csv</span> or{" "}
                  <span className="font-mono text-foreground">.json</span> file.
                  Required: <span className="font-mono text-foreground">full_name</span>,{" "}
                  <span className="font-mono text-foreground">email</span>,{" "}
                  <span className="font-mono text-foreground">password</span>.
                  Optional: <span className="font-mono text-foreground">role</span>,{" "}
                  <span className="font-mono text-foreground">mobile_number</span>,{" "}
                  <span className="font-mono text-foreground">status</span>.
                </p>
                <p className="text-muted-foreground text-xs">Imported users can log in immediately. Maximum 500 users per import.</p>
                <Button variant="outline" size="sm" className="gap-1.5 mt-1" onClick={downloadTemplate}>
                  <Download className="w-3.5 h-3.5" /> Download CSV Template
                </Button>
              </div>
              <div
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">Click to select file</p>
                <p className="text-xs text-muted-foreground mt-1">CSV or JSON</p>
                <input ref={fileInputRef} type="file" accept=".csv,.json" className="hidden" onChange={handleFileChange} />
              </div>
              {importParseError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{importParseError}</span>
                </div>
              )}
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
                              <td className="px-3 py-2"><Badge variant="secondary" className="text-xs capitalize">{u.role || "student"}</Badge></td>
                              <td className="px-3 py-2"><Badge variant={u.status === "active" ? "outline" : "secondary"} className="text-xs">{u.status || "active"}</Badge></td>
                              <td className="px-3 py-2 text-muted-foreground">{u.mobile_number || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <DialogFooter className="pt-2">
                    <Button variant="outline" onClick={resetImportDialog}>Cancel</Button>
                    <Button disabled={bulkImport.isPending} onClick={() => bulkImport.mutate(importPreview)}>
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

      {/* ── Reset Progress Dialog ─────────────────────────────────────────────── */}
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
              progress for <span className="font-medium text-foreground">{resetDialog?.userName}</span>.
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
              variant="destructive" disabled={resetProgress.isPending}
              onClick={() => { if (resetDialog) resetProgress.mutate({ userId: resetDialog.userId, scope: resetDialog.scope }); }}
            >
              {resetProgress.isPending ? "Resetting..." : "Confirm Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Profile Dialog ───────────────────────────────────────────────── */}
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
                Editing <span className="font-medium text-foreground">{editProfileDialog.userName}</span>
                {roleBadge(editProfileDialog.targetRole)}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ep-name">Full Name</Label>
                <Input id="ep-name" placeholder="Full name" value={editForm.full_name}
                  onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ep-mobile">Mobile Number</Label>
                <Input id="ep-mobile" placeholder="+919876543210" value={editForm.mobile_number}
                  onChange={e => setEditForm(f => ({ ...f, mobile_number: e.target.value }))} />
              </div>
              {currentRole === "super_admin" && (
                <div className="space-y-1.5">
                  <Label htmlFor="ep-email">
                    Email <span className="text-xs text-muted-foreground font-normal">(super admin only)</span>
                  </Label>
                  <Input id="ep-email" type="email" placeholder="user@example.com" value={editForm.email}
                    onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              )}
              <div className="rounded-lg bg-muted/30 border border-border px-3 py-2 text-xs text-muted-foreground">
                Changes are logged to the audit trail.
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
                if (Object.keys(body).length === 0) { setEditProfileDialog(null); return; }
                editProfile.mutate({ userId: editProfileDialog.userId, body });
              }}
            >
              {editProfile.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── User Detail Modal ─────────────────────────────────────────────────── */}
      <Dialog open={!!detailUserId} onOpenChange={v => { if (!v) setDetailUserId(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" /> User Details
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
                  { icon: TrendingUp, label: "Attempts",   value: String(userDetail.stats.total_attempts) },
                  { icon: FileText,   label: "Notes",      value: String(userDetail.stats.total_notes) },
                  { icon: BookOpen,   label: "Storage",    value: formatBytes(userDetail.stats.total_notes_bytes) },
                  { icon: Timer,      label: "Focus Time", value: formatDuration(userDetail.stats.total_pomodoro_seconds) },
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
                        <div className="text-right shrink-0 ml-3">
                          <p className="font-semibold">{attempt.score}/{attempt.total_marks}</p>
                          <p className="text-xs text-muted-foreground">{attempt.accuracy.toFixed(0)}%</p>
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
                          <p className="text-xs text-muted-foreground">{note.chapters?.title ?? "Unknown Chapter"}</p>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-xs text-muted-foreground">{formatBytes(note.pdf_size_bytes)}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(note.created_at), "MMM d")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {userDetail.pomodoro_sessions.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Recent Focus Sessions</h3>
                  <div className="space-y-2">
                    {userDetail.pomodoro_sessions.slice(0, 5).map(session => (
                      <div key={session.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{session.topic_context ?? "General Focus"}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(session.start_time), "MMM d, yyyy HH:mm")}</p>
                        </div>
                        <p className="text-sm font-semibold shrink-0 ml-3">{formatDuration(session.duration_seconds)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">No details available.</div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
