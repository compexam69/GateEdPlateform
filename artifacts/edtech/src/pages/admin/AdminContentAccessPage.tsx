import { AppLayout } from "@/components/layout/AppLayout";
import { AdminBreadcrumb } from "@/components/layout/AdminBreadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Shield, Trash2, Plus, Lock, Share2, BookOpen } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

type QuizItem = {
  id: string;
  title: string;
  type: string;
  allowed_roles: string[];
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

function visibilityLabel(roles: string[]): string {
  const hasStudent = roles.includes("student");
  const hasAdmin = roles.includes("admin");
  const hasSA = roles.includes("super_admin");
  if (hasStudent && hasAdmin && hasSA) return "All roles";
  if (hasStudent && hasAdmin) return "Students + Admins";
  if (hasStudent) return "Students only";
  if (hasAdmin && hasSA) return "Staff only";
  if (hasSA) return "Super Admin only";
  if (hasAdmin) return "Admins only";
  return "Restricted";
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

export default function AdminContentAccessPage() {
  const { role, user } = useAuth();
  const isSuperAdmin = role === "super_admin";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [grantForm, setGrantForm] = useState<{
    content_type: "quiz";
    content_id: string;
    granted_to: string;
  }>({ content_type: "quiz", content_id: "", granted_to: "" });
  const [saving, setSaving] = useState(false);

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

  const otherSuperAdmins = adminProfiles.filter(p => p.role === "super_admin" && p.id !== user?.id);

  function resolveProfile(id: string): Profile | undefined {
    return adminProfiles.find(p => p.id === id);
  }

  function getQuizTitle(id: string): string {
    const q = quizzes.find(q => q.id === id);
    return q ? q.title : id.slice(0, 8) + "…";
  }

  const myQuizzes = quizzes.filter(q => q.creator_id === user?.id);
  const studentAccessible = quizzes.filter(q => (q.allowed_roles ?? []).includes("student"));
  const restricted = quizzes.filter(q => !(q.allowed_roles ?? []).includes("student"));

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
    if (!confirm("Revoke this access grant? The other admin will lose access to this content.")) return;
    try {
      await apiFetch(`/admin/content/grants/${grantId}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["content-grants"] });
      toast({ title: "Access revoked" });
    } catch (err) {
      toast({ title: "Error revoking grant", description: (err as Error).message, variant: "destructive" });
    }
  }

  return (
    <AppLayout>
      <div className="space-y-8">
        <AdminBreadcrumb pageName="Content Access" />

        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Content Access Control</h1>
          <p className="text-muted-foreground mt-1">
            Control who can see and take each exam. Super admins can also share content management rights with each other.
          </p>
        </div>

        {/* ── Exam Visibility Overview ─────────────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            Exam Visibility Overview
            <Badge variant="secondary" className="text-xs font-normal">{quizzes.length} total</Badge>
          </h2>

          {loadingQuizzes ? (
            <div className="flex h-24 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : quizzes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No quizzes yet. Create them in the Quiz Editor.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-emerald-400">
                    <Eye className="w-4 h-4" />
                    Student Accessible
                    <Badge variant="secondary" className="text-xs ml-auto font-normal">{studentAccessible.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {studentAccessible.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">None — all exams are currently restricted.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {studentAccessible.map(q => (
                        <div key={q.id} className="flex items-center gap-2 py-1 border-b border-border/40 last:border-0">
                          <span className="text-sm flex-1 truncate">{q.title}</span>
                          <Badge variant="outline" className="text-xs shrink-0">{QUIZ_TYPE_LABELS[q.type] ?? q.type}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-amber-400">
                    <Shield className="w-4 h-4" />
                    Restricted
                    <Badge variant="secondary" className="text-xs ml-auto font-normal">{restricted.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {restricted.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No restricted exams — all are student-accessible.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {restricted.map(q => (
                        <div key={q.id} className="flex items-center gap-2 py-1 border-b border-border/40 last:border-0">
                          <span className="text-sm flex-1 truncate">{q.title}</span>
                          <Badge variant="secondary" className="text-xs text-amber-400 shrink-0">
                            {visibilityLabel(q.allowed_roles ?? [])}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            To change a quiz's visibility, go to the{" "}
            <a href="/admin/quizzes" className="text-primary underline hover:text-primary/80">
              Quiz Editor
            </a>
            , open any quiz, and update the <strong>Exam Access</strong> checkboxes.
          </p>
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
                Share management rights over your quizzes with other super admins. Useful when multiple super admins co-manage the platform.
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
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Your Quiz</Label>
                    <Select
                      value={grantForm.content_id}
                      onValueChange={v => setGrantForm(prev => ({ ...prev, content_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={myQuizzes.length === 0 ? "No quizzes created by you" : "Select a quiz…"} />
                      </SelectTrigger>
                      <SelectContent>
                        {myQuizzes.map(q => (
                          <SelectItem key={q.id} value={q.id}>{q.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

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
                      className="w-full lg:w-auto"
                      onClick={createGrant}
                      disabled={saving || !grantForm.content_id || !grantForm.granted_to}
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      {saving ? "Granting…" : "Grant Access"}
                    </Button>
                  </div>
                </div>

                {myQuizzes.length === 0 && (
                  <p className="text-xs text-amber-400/80">
                    You haven't created any quizzes yet. Quizzes you create from the Quiz Editor will appear here.
                  </p>
                )}
                {otherSuperAdmins.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No other super admin accounts found. Grants become available when there are multiple super admins.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Grants List */}
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
                  <div className="flex h-16 items-center justify-center">
                    <div className="h-5 w-5 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  </div>
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
                      const contentLabel = getQuizTitle(grant.content_id);
                      const isMyGrant = grant.granted_by === user?.id;
                      return (
                        <div
                          key={grant.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs capitalize">{grant.content_type}</Badge>
                              <span className="text-sm font-medium truncate">{contentLabel}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {isMyGrant ? "You granted" : `${grantor?.full_name ?? "Unknown"} granted`}
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
