import { AppLayout } from "@/components/layout/AppLayout";
import { AdminBreadcrumb } from "@/components/layout/AdminBreadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Shield, Trash2, Plus, Lock, Share2, BookOpen, HelpCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
type QuizItem = {
  id: string;
  title: string;
  type: string;
  allowed_roles: string[];
  creator_id: string | null;
};

type TopicItem = {
  id: string;
  title: string;
  allowed_roles: string[];
  is_creator_only: boolean;
  creator_id: string | null;
};

type Grant = {
  id: string;
  content_type: string;
  content_id: string;
  granted_to: string;
  granted_by: string;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function visibilityLabel(roles: string[], creatorOnly = false): string {
  if (creatorOnly) return "Creator only";
  const hasStudent = roles.includes("student");
  const hasAdmin = roles.includes("admin");
  const hasSA = roles.includes("super_admin");
  if (hasStudent && hasAdmin && hasSA) return "All roles";
  if (hasStudent && hasAdmin) return "Students + Admins";
  if (hasStudent) return "Students only";
  if (hasAdmin && hasSA) return "Staff only";
  if (hasSA) return "Super Admin only";
  if (hasAdmin) return "Admins only";
  return "No access";
}

const QUIZ_TYPE_LABELS: Record<string, string> = {
  lecture_quiz: "Lecture Quiz",
  dpp: "DPP",
  pyq: "PYQ",
  topic_test: "Topic Test",
  chapter_test: "Chapter Test",
  subject_test: "Subject Test",
  grand_test: "Grand Test",
};

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminContentAccessPage() {
  const { role, user } = useAuth();
  const isSuperAdmin = role === "super_admin";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"quizzes" | "topics">("quizzes");
  const [grantForm, setGrantForm] = useState<{
    content_type: "quiz" | "topic";
    content_id: string;
    granted_to: string;
  }>({ content_type: "quiz", content_id: "", granted_to: "" });
  const [saving, setSaving] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: quizzes = [], isLoading: loadingQuizzes } = useQuery<QuizItem[]>({
    queryKey: ["content-access-quizzes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("quizzes")
        .select("id, title, type, allowed_roles, creator_id")
        .order("created_at", { ascending: false });
      return (data ?? []) as QuizItem[];
    },
  });

  const { data: topics = [], isLoading: loadingTopics } = useQuery<TopicItem[]>({
    queryKey: ["content-access-topics"],
    queryFn: async () => {
      const { data } = await supabase
        .from("topics")
        .select("id, title, allowed_roles, is_creator_only, creator_id")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      return (data ?? []) as TopicItem[];
    },
  });

  const { data: grants = [], isLoading: loadingGrants } = useQuery<Grant[]>({
    queryKey: ["content-grants"],
    enabled: isSuperAdmin,
    queryFn: async () => apiFetch("/admin/content/grants") as Promise<Grant[]>,
  });

  const { data: adminProfiles = [] } = useQuery<Profile[]>({
    queryKey: ["admin-profiles-access"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .in("role", ["admin", "super_admin"]);
      return (data ?? []) as Profile[];
    },
  });

  // ── Derived data ─────────────────────────────────────────────────────────
  const otherSuperAdmins = adminProfiles.filter(p => p.role === "super_admin" && p.id !== user?.id);

  const myQuizzes = quizzes.filter(q => q.creator_id === user?.id);
  const myTopics = topics.filter(t => t.creator_id === user?.id);

  const studentAccessibleQuizzes = quizzes.filter(q => (q.allowed_roles ?? []).includes("student"));
  const restrictedQuizzes = quizzes.filter(q => !(q.allowed_roles ?? []).includes("student"));

  const studentAccessibleTopics = topics.filter(t => !t.is_creator_only && (t.allowed_roles ?? []).includes("student"));
  const restrictedTopics = topics.filter(t => t.is_creator_only || !(t.allowed_roles ?? []).includes("student"));

  const myContent = grantForm.content_type === "quiz" ? myQuizzes : myTopics;

  function resolveProfile(id: string): Profile | undefined {
    return adminProfiles.find(p => p.id === id);
  }

  function resolveContentLabel(type: string, id: string): string {
    if (type === "quiz") {
      const q = quizzes.find(q => q.id === id);
      return q ? `${q.title} (${QUIZ_TYPE_LABELS[q.type] ?? q.type})` : id.slice(0, 8) + "…";
    }
    if (type === "topic") {
      const t = topics.find(t => t.id === id);
      return t ? t.title : id.slice(0, 8) + "…";
    }
    return id.slice(0, 8) + "…";
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  async function createGrant() {
    if (!grantForm.content_id || !grantForm.granted_to) return;
    setSaving(true);
    try {
      await apiFetch("/admin/content/grants", {
        method: "POST",
        body: JSON.stringify(grantForm),
      });
      queryClient.invalidateQueries({ queryKey: ["content-grants"] });
      setGrantForm(prev => ({ ...prev, content_id: "", granted_to: "" }));
      toast({ title: "Access granted successfully" });
    } catch (err) {
      toast({ title: "Failed to grant access", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function revokeGrant(grantId: string) {
    if (!confirm("Revoke this access grant? The other super admin will lose access to this content.")) return;
    try {
      await apiFetch(`/admin/content/grants/${grantId}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["content-grants"] });
      toast({ title: "Access revoked" });
    } catch (err) {
      toast({ title: "Error revoking grant", description: (err as Error).message, variant: "destructive" });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="space-y-8">
        <AdminBreadcrumb pageName="Content Access" />

        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Content Access Control</h1>
          <p className="text-muted-foreground mt-1">
            Control who can see lectures and take exams. Super admins can share content management rights with each other.
          </p>
        </div>

        {/* ── Visibility Overview ─────────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              Visibility Overview
            </h2>
            {/* Tab toggle */}
            <div className="ml-auto flex gap-1 rounded-lg border border-border p-0.5 bg-muted/30">
              <button
                onClick={() => setActiveTab("quizzes")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === "quizzes"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <HelpCircle className="w-3 h-3" />
                Exams
                <Badge variant="secondary" className="text-xs ml-0.5 font-normal">{quizzes.length}</Badge>
              </button>
              <button
                onClick={() => setActiveTab("topics")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === "topics"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <BookOpen className="w-3 h-3" />
                Lectures
                <Badge variant="secondary" className="text-xs ml-0.5 font-normal">{topics.length}</Badge>
              </button>
            </div>
          </div>

          {/* ── Quizzes tab ── */}
          {activeTab === "quizzes" && (
            <>
              {loadingQuizzes ? (
                <LoadingSpinner />
              ) : quizzes.length === 0 ? (
                <EmptyCard icon={HelpCircle} message="No exams yet. Create them in the Quiz Editor." />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <VisibilityCard
                    title="Student Accessible"
                    count={studentAccessibleQuizzes.length}
                    color="emerald"
                    icon={Eye}
                    items={studentAccessibleQuizzes.map(q => ({
                      id: q.id,
                      label: q.title,
                      badge: QUIZ_TYPE_LABELS[q.type] ?? q.type,
                    }))}
                    emptyMessage="No exams visible to students."
                  />
                  <VisibilityCard
                    title="Restricted"
                    count={restrictedQuizzes.length}
                    color="amber"
                    icon={Shield}
                    items={restrictedQuizzes.map(q => ({
                      id: q.id,
                      label: q.title,
                      badge: visibilityLabel(q.allowed_roles ?? []),
                    }))}
                    emptyMessage="No restricted exams."
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Change an exam's visibility in the{" "}
                <a href="/admin/quizzes" className="text-primary underline hover:text-primary/80">Quiz Editor</a>
                {" "}— open any quiz and update the <strong>Exam Access</strong> checkboxes.
              </p>
            </>
          )}

          {/* ── Topics tab ── */}
          {activeTab === "topics" && (
            <>
              {loadingTopics ? (
                <LoadingSpinner />
              ) : topics.length === 0 ? (
                <EmptyCard icon={BookOpen} message="No lecture topics yet. Create them in the Content Editor." />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <VisibilityCard
                    title="Student Accessible"
                    count={studentAccessibleTopics.length}
                    color="emerald"
                    icon={Eye}
                    items={studentAccessibleTopics.map(t => ({
                      id: t.id,
                      label: t.title,
                      badge: visibilityLabel(t.allowed_roles ?? []),
                    }))}
                    emptyMessage="No lecture topics visible to students."
                  />
                  <VisibilityCard
                    title="Restricted"
                    count={restrictedTopics.length}
                    color="amber"
                    icon={Shield}
                    items={restrictedTopics.map(t => ({
                      id: t.id,
                      label: t.title,
                      badge: visibilityLabel(t.allowed_roles ?? [], t.is_creator_only),
                    }))}
                    emptyMessage="No restricted lecture topics."
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Change a topic's visibility in the{" "}
                <a href="/admin/subjects" className="text-primary underline hover:text-primary/80">Content Editor</a>
                {" "}— open any topic and update the <strong>Access Control</strong> checkboxes.
              </p>
            </>
          )}
        </section>

        {/* ── Super Admin Content Grants ───────────────────────────────────── */}
        {isSuperAdmin ? (
          <section className="space-y-4">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Share2 className="w-4 h-4 text-primary" />
                Super Admin Content Grants
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Share management rights over your quizzes or lecture topics with other super admins.
              </p>
            </div>

            {/* Grant Form */}
            <Card className="bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Grant Access to Another Super Admin
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[auto_1fr_1fr_auto]">
                  {/* Content type */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={grantForm.content_type}
                      onValueChange={(v) =>
                        setGrantForm(prev => ({ ...prev, content_type: v as "quiz" | "topic", content_id: "" }))
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quiz">Exam / Quiz</SelectItem>
                        <SelectItem value="topic">Lecture Topic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Content picker */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Your {grantForm.content_type === "quiz" ? "Quiz" : "Topic"}</Label>
                    <Select
                      value={grantForm.content_id}
                      onValueChange={v => setGrantForm(prev => ({ ...prev, content_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={myContent.length === 0 ? `No ${grantForm.content_type === "quiz" ? "quizzes" : "topics"} created by you` : "Select…"} />
                      </SelectTrigger>
                      <SelectContent>
                        {myContent.map(item => (
                          <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Grantee */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Grant To</Label>
                    <Select
                      value={grantForm.granted_to}
                      onValueChange={v => setGrantForm(prev => ({ ...prev, granted_to: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={otherSuperAdmins.length === 0 ? "No other super admins" : "Select super admin…"} />
                      </SelectTrigger>
                      <SelectContent>
                        {otherSuperAdmins.map(sa => (
                          <SelectItem key={sa.id} value={sa.id}>
                            {sa.full_name}
                            <span className="text-muted-foreground ml-1 text-xs">({sa.email})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end sm:col-span-2 lg:col-span-1">
                    <Button
                      className="w-full"
                      onClick={createGrant}
                      disabled={saving || !grantForm.content_id || !grantForm.granted_to}
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      {saving ? "Granting…" : "Grant"}
                    </Button>
                  </div>
                </div>

                {myContent.length === 0 && (
                  <p className="text-xs text-amber-400/80">
                    You haven't created any {grantForm.content_type === "quiz" ? "quizzes" : "topics"} yet.
                    {grantForm.content_type === "quiz"
                      ? " Create quizzes in the Quiz Editor first."
                      : " Create topics in the Content Editor first."}
                  </p>
                )}
                {otherSuperAdmins.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No other super admin accounts found. Grants are available when multiple super admins exist.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Active Grants */}
            <Card className="bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Active Grants
                  <Badge variant="secondary" className="text-xs ml-auto font-normal">{grants.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingGrants ? (
                  <LoadingSpinner />
                ) : grants.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Lock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No active grants. Use the form above to share content access.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {grants.map(grant => {
                      const grantee = resolveProfile(grant.granted_to);
                      const grantor = resolveProfile(grant.granted_by);
                      const contentLabel = resolveContentLabel(grant.content_type, grant.content_id);
                      const isMyGrant = grant.granted_by === user?.id;
                      return (
                        <div
                          key={grant.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs capitalize">
                                {grant.content_type === "topic" ? "Lecture" : "Exam"}
                              </Badge>
                              <span className="text-sm font-medium truncate">{contentLabel}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {isMyGrant ? "You granted" : `${grantor?.full_name ?? "Someone"} granted`}
                              {" access to "}
                              <span className="text-foreground font-medium">
                                {grantee?.full_name ?? grant.granted_to.slice(0, 8)}
                              </span>
                              {"  ·  "}
                              {new Date(grant.created_at).toLocaleDateString("en-IN", {
                                day: "numeric", month: "short", year: "numeric",
                              })}
                            </p>
                          </div>
                          {isMyGrant && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                              title="Revoke grant"
                              onClick={() => revokeGrant(grant.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        ) : (
          <Card className="bg-card border-border/40">
            <CardContent className="py-10 text-center">
              <Shield className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Content grant management is only available to Super Admins.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

// ── Small shared sub-components ───────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex h-24 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function EmptyCard({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-muted-foreground">
        <Icon className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>{message}</p>
      </CardContent>
    </Card>
  );
}

function VisibilityCard({
  title, count, color, icon: Icon, items, emptyMessage,
}: {
  title: string;
  count: number;
  color: "emerald" | "amber";
  icon: React.ElementType;
  items: { id: string; label: string; badge: string }[];
  emptyMessage: string;
}) {
  const colorClass = color === "emerald" ? "text-emerald-400" : "text-amber-400";
  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className={`text-sm flex items-center gap-2 ${colorClass}`}>
          <Icon className="w-4 h-4" />
          {title}
          <Badge variant="secondary" className="text-xs ml-auto font-normal">{count}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">{emptyMessage}</p>
        ) : (
          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-2 py-1 border-b border-border/40 last:border-0">
                <span className="text-sm flex-1 truncate">{item.label}</span>
                <Badge variant="outline" className="text-xs shrink-0">{item.badge}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
