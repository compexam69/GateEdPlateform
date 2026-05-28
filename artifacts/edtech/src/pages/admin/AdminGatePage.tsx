import { AppLayout } from "@/components/layout/AppLayout";
import { AdminBreadcrumb } from "@/components/layout/AdminBreadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Settings2, Save, RefreshCw, Info } from "lucide-react";
import { useState, useEffect } from "react";

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

interface GateConfig {
  lecture_quiz_passing_score: number;
  topic_test_passing_score: number;
  chapter_test_passing_score: number;
  subject_test_passing_score: number;
  max_quiz_attempts: number;
  max_exam_pauses: number;
  exam_timeout_warning_mins: number;
  per_user_storage_limit_mb: number;
  global_storage_limit_gb: number;
  require_email_verification: boolean;
}

const FIELDS: Array<{
  key: keyof GateConfig;
  label: string;
  description: string;
  type: "number" | "boolean";
  min?: number;
  max?: number;
}> = [
  { key: "lecture_quiz_passing_score", label: "Lecture Quiz Passing Score (%)", description: "Minimum accuracy to pass the Lecture Quiz and unlock DPP.", type: "number", min: 1, max: 100 },
  { key: "topic_test_passing_score", label: "Topic Test Passing Score (%)", description: "Minimum accuracy to pass the Topic Test and mark topic complete.", type: "number", min: 1, max: 100 },
  { key: "chapter_test_passing_score", label: "Chapter Test Passing Score (%)", description: "Minimum accuracy required for the Chapter Test.", type: "number", min: 1, max: 100 },
  { key: "subject_test_passing_score", label: "Subject Test Passing Score (%)", description: "Minimum accuracy required for the Subject Test.", type: "number", min: 1, max: 100 },
  { key: "max_quiz_attempts", label: "Max Quiz Attempts", description: "Maximum attempts allowed per quiz before lockout.", type: "number", min: 1, max: 10 },
  { key: "max_exam_pauses", label: "Max Exam Pauses", description: "How many times a student can pause during an exam.", type: "number", min: 0, max: 5 },
  { key: "exam_timeout_warning_mins", label: "Exam Timeout Warning (mins)", description: "Show time warning X minutes before exam ends.", type: "number", min: 1, max: 30 },
  { key: "per_user_storage_limit_mb", label: "Per-User Storage Limit (MB)", description: "Maximum PDF storage per student.", type: "number", min: 50, max: 5000 },
  { key: "global_storage_limit_gb", label: "Global Storage Limit (GB)", description: "Total B2 storage limit across all users. Alert at 95%.", type: "number", min: 1, max: 100 },
];

const DEFAULTS: GateConfig = {
  lecture_quiz_passing_score: 60,
  topic_test_passing_score: 70,
  chapter_test_passing_score: 60,
  subject_test_passing_score: 60,
  max_quiz_attempts: 3,
  max_exam_pauses: 2,
  exam_timeout_warning_mins: 5,
  per_user_storage_limit_mb: 500,
  global_storage_limit_gb: 9,
  require_email_verification: true,
};

export default function AdminGatePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<GateConfig>(DEFAULTS);
  const [dirty, setDirty] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-gate-config"],
    queryFn: () => apiFetch("/admin/gate-config"),
  });

  useEffect(() => {
    if (data) {
      setForm({ ...DEFAULTS, ...data });
      setDirty(false);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => apiFetch("/admin/gate-config", { method: "PATCH", body: JSON.stringify(form) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-gate-config"] });
      toast({ title: "Configuration saved!" });
      setDirty(false);
    },
    onError: (err: unknown) => toast({ title: "Save failed", description: (err as Error).message, variant: "destructive" }),
  });

  function handleChange(key: keyof GateConfig, value: string | boolean) {
    setForm(prev => ({ ...prev, [key]: typeof value === "boolean" ? value : Number(value) }));
    setDirty(true);
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl mx-auto">
        <AdminBreadcrumb pageName="Gate Configuration" />
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Settings2 className="w-7 h-7 text-primary" />
              Gate Configuration
            </h1>
            <p className="text-muted-foreground mt-1">
              Adjust passing score thresholds, retry limits, and storage limits. Changes take effect immediately.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {save.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        {dirty && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-warning/10 border border-warning/30 text-warning text-sm">
            <Info className="w-4 h-4 shrink-0" />
            You have unsaved changes. Click Save Changes to apply them.
          </div>
        )}

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Passing Scores */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Passing Score Thresholds</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {FIELDS.filter(f => f.key.includes("passing_score")).map(field => (
                  <div key={field.key} className="space-y-1.5">
                    <Label className="flex items-center justify-between">
                      <span>{field.label}</span>
                      <span className="text-primary font-bold text-lg">{form[field.key]}%</span>
                    </Label>
                    <Input
                      type="range"
                      min={field.min}
                      max={field.max}
                      value={Number(form[field.key])}
                      onChange={e => handleChange(field.key, e.target.value)}
                      className="h-2 cursor-pointer"
                    />
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Limits */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Exam & Attempt Limits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {FIELDS.filter(f => ["max_quiz_attempts", "max_exam_pauses", "exam_timeout_warning_mins"].includes(f.key)).map(field => (
                  <div key={field.key} className="grid grid-cols-3 items-center gap-4">
                    <div className="col-span-2">
                      <Label>{field.label}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{field.description}</p>
                    </div>
                    <Input
                      type="number"
                      min={field.min}
                      max={field.max}
                      value={Number(form[field.key])}
                      onChange={e => handleChange(field.key, e.target.value)}
                      className="text-center font-medium"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Storage */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Storage Limits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {FIELDS.filter(f => f.key.includes("storage")).map(field => (
                  <div key={field.key} className="grid grid-cols-3 items-center gap-4">
                    <div className="col-span-2">
                      <Label>{field.label}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{field.description}</p>
                    </div>
                    <Input
                      type="number"
                      min={field.min}
                      max={field.max}
                      value={Number(form[field.key])}
                      onChange={e => handleChange(field.key, e.target.value)}
                      className="text-center font-medium"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Auth Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Auth Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Require Email Verification</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Block login until email is verified.</p>
                  </div>
                  <button
                    onClick={() => handleChange("require_email_verification", !form.require_email_verification)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${form.require_email_verification ? "bg-primary" : "bg-muted"}`}
                  >
                    <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${form.require_email_verification ? "translate-x-5" : ""}`} />
                  </button>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} size="lg">
                <Save className="w-4 h-4 mr-2" />
                {save.isPending ? "Saving..." : "Save All Changes"}
              </Button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
