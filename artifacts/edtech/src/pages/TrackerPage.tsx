import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, TrendingUp, TrendingDown, Minus, Pencil } from "lucide-react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Dot,
} from "recharts";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  getExternalTests, getGetExternalTestsUrl,
  useCreateExternalTest, useDeleteExternalTest,
} from "@workspace/api-client-react";
import type { ExternalTest } from "@workspace/api-client-react";
import { useState, useMemo } from "react";
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

type AttemptPoint = {
  idx: number;
  label: string;
  score: number;
  name: string;
  type: "platform" | "external";
  date: string;
  delta: number | null;
};

const IMPROVE_COLOR = "#22c55e";
const DECLINE_COLOR = "#ef4444";
const NEUTRAL_COLOR = "#6366f1";
const PLATFORM_FILL = "#6366f1";
const EXTERNAL_FILL = "#a855f7";

function TrendDot(props: {
  cx?: number; cy?: number; payload?: AttemptPoint; index?: number;
}) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload) return null;
  const delta = payload.delta;
  const fill =
    delta === null ? NEUTRAL_COLOR :
    delta > 0 ? IMPROVE_COLOR :
    delta < 0 ? DECLINE_COLOR :
    NEUTRAL_COLOR;
  const outerR = payload.type === "external" ? 7 : 6;
  return (
    <g>
      <circle cx={cx} cy={cy} r={outerR + 3} fill={fill} opacity={0.15} />
      <circle cx={cx} cy={cy} r={outerR} fill={fill} stroke="hsl(var(--card))" strokeWidth={1.5} />
      {payload.type === "external" && (
        <circle cx={cx} cy={cy} r={outerR - 2} fill="none" stroke="hsl(var(--card))" strokeWidth={1} />
      )}
    </g>
  );
}

function TrendTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: AttemptPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const deltaAbs = d.delta !== null ? Math.abs(d.delta) : null;
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-xl text-sm min-w-[180px]">
      <p className="font-semibold text-foreground truncate max-w-[200px]">{d.name}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{d.date}</p>
      <div className="flex items-center justify-between gap-4 mt-2">
        <span className="text-lg font-bold text-foreground">{d.score}%</span>
        {d.delta !== null && (
          <span
            className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
            style={{
              color: d.delta > 0 ? IMPROVE_COLOR : d.delta < 0 ? DECLINE_COLOR : "hsl(var(--muted-foreground))",
              backgroundColor: d.delta > 0 ? "#dcfce7" : d.delta < 0 ? "#fee2e2" : "hsl(var(--muted))",
            }}
          >
            {d.delta > 0 ? <TrendingUp className="w-3 h-3" /> : d.delta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {d.delta > 0 ? "+" : ""}{d.delta}%
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {d.type === "platform" ? "Platform test" : "External test"}
      </p>
    </div>
  );
}

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

  const { data: internalAttempts = [] } = useQuery<
    Array<{ score: number; total_marks: number; accuracy: number; submitted_at: string; quizzes: { title: string } | null }>
  >({
    queryKey: ["internal-attempts-chart", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("user_attempts")
        .select("score, total_marks, accuracy, submitted_at, quizzes(title)")
        .eq("user_id", user.id)
        .eq("status", "submitted")
        .gt("total_marks", 0)
        .order("submitted_at", { ascending: true });
      return (data ?? []) as unknown as Array<{
        score: number; total_marks: number; accuracy: number;
        submitted_at: string; quizzes: { title: string } | null;
      }>;
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

  const sortedTests = useMemo(
    () => [...tests].sort((a: ExternalTest, b: ExternalTest) => a.exam_date.localeCompare(b.exam_date)),
    [tests]
  );
  const sortedTestsDesc = useMemo(() => [...sortedTests].reverse(), [sortedTests]);

  const chartData = useMemo((): AttemptPoint[] => {
    const raw: Array<{ isoDate: string; score: number; name: string; type: "platform" | "external" }> = [];

    for (const a of internalAttempts) {
      const pct = Math.round((a.score / a.total_marks) * 100);
      raw.push({
        isoDate: a.submitted_at,
        score: pct,
        name: a.quizzes?.title ?? "Platform Test",
        type: "platform",
      });
    }
    for (const t of sortedTests) {
      const pct = Math.round((t.score_obtained / t.total_marks) * 100);
      raw.push({
        isoDate: t.exam_date + "T12:00:00Z",
        score: pct,
        name: t.exam_name,
        type: "external",
      });
    }

    raw.sort((a, b) => a.isoDate.localeCompare(b.isoDate));

    return raw.map((r, i) => {
      const prev = i > 0 ? raw[i - 1].score : null;
      const delta = prev !== null ? r.score - prev : null;
      return {
        idx: i + 1,
        label: `#${i + 1}`,
        score: r.score,
        name: r.name,
        type: r.type,
        date: format(new Date(r.isoDate), "MMM d, yyyy"),
        delta,
      };
    });
  }, [internalAttempts, sortedTests]);

  const getTrend = (idx: number, arr: ExternalTest[]) => {
    const curr = (arr[idx].score_obtained / arr[idx].total_marks) * 100;
    if (idx === arr.length - 1) return null;
    const prev = (arr[idx + 1].score_obtained / arr[idx + 1].total_marks) * 100;
    return curr > prev ? "up" : curr < prev ? "down" : "same";
  };

  const bestScore = useMemo(() => chartData.length ? Math.max(...chartData.map(d => d.score)) : null, [chartData]);
  const latestScore = chartData.length ? chartData[chartData.length - 1].score : null;
  const firstScore = chartData.length ? chartData[0].score : null;
  const overallDelta = latestScore !== null && firstScore !== null ? latestScore - firstScore : null;
  const improvements = chartData.filter(d => d.delta !== null && d.delta > 0).length;
  const declines = chartData.filter(d => d.delta !== null && d.delta < 0).length;

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

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Test Tracker</h1>
            <p className="text-muted-foreground mt-1">Track every attempt and watch your progress grow.</p>
          </div>
          <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-2" /> Log Test</Button>
        </div>

        {chartData.length > 0 && (
          <Card className="bg-card">
            <CardHeader>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <CardTitle>Performance Trend</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Every attempt in chronological order — platform tests and external exams combined.</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: PLATFORM_FILL }} />
                    Platform
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full inline-block border-2" style={{ background: EXTERNAL_FILL }} />
                    External
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: IMPROVE_COLOR }} />
                    Improved
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: DECLINE_COLOR }} />
                    Declined
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {chartData.length >= 2 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                    <p className="text-xs text-muted-foreground">Total Attempts</p>
                    <p className="text-xl font-bold mt-0.5">{chartData.length}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                    <p className="text-xs text-muted-foreground">Best Score</p>
                    <p className="text-xl font-bold mt-0.5" style={{ color: IMPROVE_COLOR }}>{bestScore}%</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                    <p className="text-xs text-muted-foreground">Overall Change</p>
                    <p className="text-xl font-bold mt-0.5" style={{
                      color: overallDelta === null ? undefined : overallDelta > 0 ? IMPROVE_COLOR : overallDelta < 0 ? DECLINE_COLOR : undefined
                    }}>
                      {overallDelta === null ? "—" : `${overallDelta > 0 ? "+" : ""}${overallDelta}%`}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                    <p className="text-xs text-muted-foreground">Up / Down</p>
                    <p className="text-xl font-bold mt-0.5">
                      <span style={{ color: IMPROVE_COLOR }}>{improvements}</span>
                      <span className="text-muted-foreground text-base mx-1">/</span>
                      <span style={{ color: DECLINE_COLOR }}>{declines}</span>
                    </p>
                  </div>
                </div>
              )}

              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fontSize: 11 }}
                      interval={chartData.length > 20 ? Math.floor(chartData.length / 10) : 0}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fontSize: 11 }}
                      domain={[0, 100]}
                      unit="%"
                    />
                    <Tooltip content={<TrendTooltip />} />
                    <ReferenceLine y={60} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "Pass 60%", position: "insideTopRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke={NEUTRAL_COLOR}
                      strokeWidth={2}
                      strokeOpacity={0.4}
                      dot={<TrendDot />}
                      activeDot={{ r: 8, fill: NEUTRAL_COLOR }}
                      connectNulls={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {chartData.length === 0 && !isLoading && (
          <Card className="bg-card">
            <CardContent className="py-12 text-center text-muted-foreground">
              <TrendingUp className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No attempts yet</p>
              <p className="text-sm mt-1">Complete platform quizzes or log an external test to start tracking your trend.</p>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : sortedTestsDesc.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No external tests logged yet. Log your first mock test above.</p>
          </div>
        ) : (
          <Card>
            <CardHeader><CardTitle>External Test History</CardTitle></CardHeader>
            <CardContent>
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
