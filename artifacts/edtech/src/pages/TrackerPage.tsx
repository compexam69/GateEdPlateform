import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, TrendingUp, TrendingDown, Minus, Pencil, Info } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  getExternalTests, getGetExternalTestsUrl,
  useCreateExternalTest, useDeleteExternalTest,
} from "@workspace/api-client-react";
import type { ExternalTest } from "@workspace/api-client-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

import { getApiBase } from "@/lib/api";

type TestForm = {
  exam_name: string; exam_date: string; score_obtained: string;
  total_marks: string; percentile: string; rank: string; notes: string;
};

const EMPTY_FORM: TestForm = {
  exam_name: "", exam_date: "", score_obtained: "", total_marks: "",
  percentile: "", rank: "", notes: "",
};

export default function TrackerPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [editingTest, setEditingTest] = useState<ExternalTest | null>(null);
  const [form, setForm] = useState<TestForm>(EMPTY_FORM);

  const { data: tests = [], isLoading } = useQuery({
    queryKey: [getGetExternalTestsUrl()],
    queryFn: () => getExternalTests(),
  });

  const { data: internalScores = [] } = useQuery<Array<{ date: string; avg_score: number }>>({
    queryKey: ["internal-scores-chart", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("user_attempts")
        .select("score, total_marks, submitted_at")
        .eq("user_id", user.id)
        .eq("status", "submitted")
        .gt("total_marks", 0)
        .order("submitted_at", { ascending: true });

      const byDate = new Map<string, number[]>();
      for (const a of (data ?? []) as Array<{ score: number; total_marks: number; submitted_at: string }>) {
        const date = a.submitted_at.split("T")[0];
        const pct = Math.round((a.score / a.total_marks) * 100);
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date)!.push(pct);
      }
      return Array.from(byDate.entries()).map(([date, scores]) => ({
        date,
        avg_score: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
      }));
    },
    enabled: !!user?.id,
  });

  const createTest = useCreateExternalTest({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [getGetExternalTestsUrl()] });
        setShowAdd(false); setForm(EMPTY_FORM); toast({ title: "Test logged!" });
      },
      onError: (err: unknown) => toast({ title: "Error", description: (err as Error).message, variant: "destructive" }),
    },
  });

  const updateTest = useMutation({
    mutationFn: async ({ testId, data }: { testId: string; data: Partial<TestForm> }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${getApiBase()}/external-tests/${testId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          exam_name: data.exam_name, exam_date: data.exam_date,
          score_obtained: Number(data.score_obtained), total_marks: Number(data.total_marks),
          percentile: data.percentile ? Number(data.percentile) : null,
          rank: data.rank ? Number(data.rank) : null, notes: data.notes || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update test");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [getGetExternalTestsUrl()] });
      setEditingTest(null); setForm(EMPTY_FORM); toast({ title: "Test updated!" });
    },
    onError: (err: unknown) => toast({ title: "Error", description: (err as Error).message, variant: "destructive" }),
  });

  const deleteTest = useDeleteExternalTest({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: [getGetExternalTestsUrl()] }); toast({ title: "Test deleted" }); },
    },
  });

  function validateForm() {
    if (!form.exam_name || !form.exam_date || !form.score_obtained || !form.total_marks) {
      toast({ title: "Missing fields", description: "Exam name, date, score and total marks are required.", variant: "destructive" });
      return false;
    }
    if (Number(form.total_marks) <= 0) {
      toast({ title: "Invalid total marks", description: "Total marks must be greater than 0.", variant: "destructive" });
      return false;
    }
    if (Number(form.score_obtained) > Number(form.total_marks)) {
      toast({ title: "Invalid score", description: "Score obtained cannot exceed total marks.", variant: "destructive" });
      return false;
    }
    return true;
  }

  function handleSubmit() {
    if (!validateForm()) return;
    createTest.mutate({
      data: {
        exam_name: form.exam_name, exam_date: form.exam_date,
        score_obtained: Number(form.score_obtained), total_marks: Number(form.total_marks),
        percentile: form.percentile ? Number(form.percentile) : undefined,
        rank: form.rank ? Number(form.rank) : undefined, notes: form.notes || undefined,
      },
    });
  }

  function handleUpdate() {
    if (!validateForm() || !editingTest) return;
    updateTest.mutate({ testId: editingTest.id, data: form });
  }

  function openEdit(test: ExternalTest) {
    setEditingTest(test);
    setForm({
      exam_name: test.exam_name, exam_date: test.exam_date,
      score_obtained: String(test.score_obtained), total_marks: String(test.total_marks),
      percentile: test.percentile != null ? String(test.percentile) : "",
      rank: test.rank != null ? String(test.rank) : "",
      notes: test.notes ?? "",
    });
  }

  function closeDialog() {
    setShowAdd(false); setEditingTest(null); setForm(EMPTY_FORM);
  }

  const sortedTests = [...tests].sort((a: ExternalTest, b: ExternalTest) => a.exam_date.localeCompare(b.exam_date));
  const sortedTestsDesc = [...sortedTests].reverse();

  // Merge external and internal into unified chart dataset
  const allDates = new Set<string>([
    ...sortedTests.map((t: ExternalTest) => t.exam_date),
    ...internalScores.map(s => s.date),
  ]);
  const chartData = Array.from(allDates).sort().map(date => {
    const ext = sortedTests.find((t: ExternalTest) => t.exam_date === date);
    const int = internalScores.find(s => s.date === date);
    return {
      label: format(new Date(date), "MMM d"),
      external: ext ? Math.round((ext.score_obtained / ext.total_marks) * 100) : null,
      internal: int?.avg_score ?? null,
    };
  });

  const getTrend = (idx: number, arr: ExternalTest[]) => {
    const curr = (arr[idx].score_obtained / arr[idx].total_marks) * 100;
    if (idx === arr.length - 1) return null;
    const prev = (arr[idx + 1].score_obtained / arr[idx + 1].total_marks) * 100;
    return curr > prev ? "up" : curr < prev ? "down" : "same";
  };

  const FormFields = () => (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>Exam Name *</Label>
          <Input placeholder="e.g. Allen AITS #5" value={form.exam_name} onChange={e => setForm(f => ({ ...f, exam_name: e.target.value }))} />
        </div>
        <div className="space-y-1.5"><Label>Date *</Label>
          <Input type="date" value={form.exam_date} onChange={e => setForm(f => ({ ...f, exam_date: e.target.value }))} />
        </div>
        <div className="space-y-1.5"><Label>Percentile</Label>
          <Input type="number" placeholder="e.g. 94.5" value={form.percentile} onChange={e => setForm(f => ({ ...f, percentile: e.target.value }))} />
        </div>
        <div className="space-y-1.5"><Label>Score *</Label>
          <Input type="number" placeholder="Marks scored" value={form.score_obtained} onChange={e => setForm(f => ({ ...f, score_obtained: e.target.value }))} />
        </div>
        <div className="space-y-1.5"><Label>Total Marks *</Label>
          <Input type="number" placeholder="Max marks" value={form.total_marks} onChange={e => setForm(f => ({ ...f, total_marks: e.target.value }))} />
        </div>
        <div className="space-y-1.5"><Label>Rank</Label>
          <Input type="number" placeholder="Your rank" value={form.rank} onChange={e => setForm(f => ({ ...f, rank: e.target.value }))} />
        </div>
        <div className="col-span-2 space-y-1.5"><Label>Notes</Label>
          <Input placeholder="Optional notes..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
      </div>
    </div>
  );

  const hasChartData = chartData.some(d => d.external !== null || d.internal !== null);
  const hasInternalData = internalScores.length > 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Test Tracker</h1>
            <p className="text-muted-foreground mt-1">Log your external mock tests and track progress.</p>
          </div>
          <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-2" /> Log Test</Button>
        </div>

        {hasChartData && (
          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Performance Trend</span>
                {hasInternalData && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground font-normal">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-primary inline-block rounded" /> Platform Tests
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-secondary inline-block rounded" /> External Tests
                    </span>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                    <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                      formatter={(v: number, name: string) => [`${v}%`, name]}
                    />
                    {hasInternalData && (
                      <Line
                        type="monotone" dataKey="internal" name="Platform Tests"
                        stroke="hsl(var(--primary))" strokeWidth={2}
                        dot={{ r: 4, fill: "hsl(var(--primary))" }}
                        connectNulls={false}
                      />
                    )}
                    <Line
                      type="monotone" dataKey="external" name="External Tests"
                      stroke="hsl(var(--secondary))" strokeWidth={2}
                      dot={{ r: 4, fill: "hsl(var(--secondary))" }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {hasInternalData && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Info className="w-3 h-3" /> Internal scores are daily averages across all platform quizzes.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : sortedTestsDesc.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No external tests logged yet. Log your first mock test above.</p>
          </div>
        ) : (
          <Card>
            <CardHeader><CardTitle>External Test History</CardTitle></CardHeader>
            <CardContent>
              {/* Mobile card view */}
              <div className="sm:hidden space-y-3">
                {sortedTestsDesc.map((test: ExternalTest, idx: number) => {
                  const pct = Math.round((test.score_obtained / test.total_marks) * 100);
                  const trend = getTrend(idx, sortedTestsDesc);
                  return (
                    <div key={test.id} className="p-3 rounded-lg border border-border space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{test.exam_name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(test.exam_date), "MMM d, yyyy")}</p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {trend === "up" && <TrendingUp className="w-4 h-4 text-success" />}
                          {trend === "down" && <TrendingDown className="w-4 h-4 text-destructive" />}
                          {trend === "same" && <Minus className="w-4 h-4 text-muted-foreground" />}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => openEdit(test)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteTest.mutate({ testId: test.id })}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm flex-wrap">
                        <span className="font-medium">{test.score_obtained}/{test.total_marks} <span className="text-muted-foreground">({pct}%)</span></span>
                        {test.percentile != null && <span className="text-success font-medium">{test.percentile}ile</span>}
                        {test.rank != null && <span className="text-muted-foreground text-xs">Rank #{test.rank}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Desktop table view */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 rounded-tl-lg">Date</th>
                      <th className="px-4 py-3">Exam Name</th>
                      <th className="px-4 py-3">Score</th>
                      <th className="px-4 py-3">%ile</th>
                      <th className="px-4 py-3">Trend</th>
                      <th className="px-4 py-3 rounded-tr-lg"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTestsDesc.map((test: ExternalTest, idx: number) => {
                      const pct = Math.round((test.score_obtained / test.total_marks) * 100);
                      const trend = getTrend(idx, sortedTestsDesc);
                      return (
                        <tr key={test.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 text-muted-foreground">{format(new Date(test.exam_date), "MMM d, yyyy")}</td>
                          <td className="px-4 py-3 font-medium">{test.exam_name}</td>
                          <td className="px-4 py-3">{test.score_obtained}/{test.total_marks} <span className="text-muted-foreground">({pct}%)</span></td>
                          <td className="px-4 py-3">
                            {test.percentile != null ? <span className="text-success font-medium">{test.percentile}ile</span> : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {trend === "up" && <TrendingUp className="w-4 h-4 text-success" />}
                            {trend === "down" && <TrendingDown className="w-4 h-4 text-destructive" />}
                            {trend === "same" && <Minus className="w-4 h-4 text-muted-foreground" />}
                            {trend === null && <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary h-7 w-7" onClick={() => openEdit(test)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-7 w-7" onClick={() => deleteTest.mutate({ testId: test.id })}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showAdd} onOpenChange={open => { if (!open) closeDialog(); else setShowAdd(true); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log External Test</DialogTitle></DialogHeader>
          <FormFields />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createTest.isPending}>{createTest.isPending ? "Saving..." : "Log Test"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTest} onOpenChange={open => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Test</DialogTitle></DialogHeader>
          <FormFields />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateTest.isPending}>{updateTest.isPending ? "Saving..." : "Save Changes"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
