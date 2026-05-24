import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getExternalTests, getGetExternalTestsUrl,
  useCreateExternalTest, useDeleteExternalTest,
} from "@workspace/api-client-react";
import type { ExternalTest } from "@workspace/api-client-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";

type NewTest = {
  exam_name: string;
  exam_date: string;
  score_obtained: string;
  total_marks: string;
  percentile: string;
  rank: string;
  notes: string;
};

export default function TrackerPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<NewTest>({
    exam_name: "", exam_date: "", score_obtained: "", total_marks: "",
    percentile: "", rank: "", notes: "",
  });

  const { data: tests = [], isLoading } = useQuery({
    queryKey: [getGetExternalTestsUrl()],
    queryFn: () => getExternalTests(),
  });

  const createTest = useCreateExternalTest({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [getGetExternalTestsUrl()] });
        setShowAdd(false);
        setForm({ exam_name: "", exam_date: "", score_obtained: "", total_marks: "", percentile: "", rank: "", notes: "" });
        toast({ title: "Test logged!" });
      },
      onError: (err: unknown) => toast({ title: "Error", description: (err as Error).message, variant: "destructive" }),
    },
  });

  const deleteTest = useDeleteExternalTest({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [getGetExternalTestsUrl()] });
        toast({ title: "Test deleted" });
      },
    },
  });

  function handleSubmit() {
    if (!form.exam_name || !form.exam_date || !form.score_obtained || !form.total_marks) {
      toast({ title: "Missing fields", description: "Exam name, date, score and total marks are required.", variant: "destructive" });
      return;
    }
    createTest.mutate({
      data: {
        exam_name: form.exam_name,
        exam_date: form.exam_date,
        score_obtained: Number(form.score_obtained),
        total_marks: Number(form.total_marks),
        percentile: form.percentile ? Number(form.percentile) : undefined,
        rank: form.rank ? Number(form.rank) : undefined,
        notes: form.notes || undefined,
      },
    });
  }

  const chartData = [...tests]
    .sort((a: ExternalTest, b: ExternalTest) => a.exam_date.localeCompare(b.exam_date))
    .map((t: ExternalTest) => ({
      date: format(new Date(t.exam_date), "MMM d"),
      score: Math.round((t.score_obtained / t.total_marks) * 100),
      percentile: t.percentile ?? null,
    }));

  const sortedTests = [...tests].sort((a: ExternalTest, b: ExternalTest) => b.exam_date.localeCompare(a.exam_date));

  const getTrend = (idx: number) => {
    const curr = (sortedTests[idx].score_obtained / sortedTests[idx].total_marks) * 100;
    if (idx === sortedTests.length - 1) return null;
    const prev = (sortedTests[idx + 1].score_obtained / sortedTests[idx + 1].total_marks) * 100;
    if (curr > prev) return "up";
    if (curr < prev) return "down";
    return "same";
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Test Tracker</h1>
            <p className="text-muted-foreground mt-1">Log your external mock tests and track progress.</p>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-2" /> Log Test
          </Button>
        </div>

        {tests.length > 1 && (
          <Card className="bg-card">
            <CardHeader><CardTitle>Performance Trend</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
                    <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} domain={[0, 100]} unit="%" />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
                      formatter={(v: number, name: string) => [name === "score" ? `${v}%` : `${v}ile`, name === "score" ? "Score %" : "Percentile"]}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} name="Score %" dot={{ r: 4 }} />
                    {chartData.some(d => d.percentile !== null) && (
                      <Line type="monotone" dataKey="percentile" stroke="hsl(var(--secondary))" strokeWidth={2} name="Percentile" dot={{ r: 4 }} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : sortedTests.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No tests logged yet. Log your first mock test above.</p>
          </div>
        ) : (
          <Card>
            <CardHeader><CardTitle>Test History</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
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
                    {sortedTests.map((test: ExternalTest, idx: number) => {
                      const trend = getTrend(idx);
                      const pct = Math.round((test.score_obtained / test.total_marks) * 100);
                      return (
                        <tr key={test.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 text-muted-foreground">{format(new Date(test.exam_date), "MMM d, yyyy")}</td>
                          <td className="px-4 py-3 font-medium">{test.exam_name}</td>
                          <td className="px-4 py-3">{test.score_obtained}/{test.total_marks} <span className="text-muted-foreground">({pct}%)</span></td>
                          <td className="px-4 py-3">
                            {test.percentile != null
                              ? <span className="text-success font-medium">{test.percentile}ile</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {trend === "up" && <TrendingUp className="w-4 h-4 text-success" />}
                            {trend === "down" && <TrendingDown className="w-4 h-4 text-destructive" />}
                            {trend === "same" && <Minus className="w-4 h-4 text-muted-foreground" />}
                            {trend === null && <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive h-7 w-7"
                              onClick={() => deleteTest.mutate({ testId: test.id })}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
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

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log External Test</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Exam Name *</Label>
                <Input placeholder="e.g. Allen AITS #5" value={form.exam_name} onChange={e => setForm(f => ({ ...f, exam_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input type="date" value={form.exam_date} onChange={e => setForm(f => ({ ...f, exam_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Percentile</Label>
                <Input type="number" placeholder="e.g. 94.5" value={form.percentile} onChange={e => setForm(f => ({ ...f, percentile: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Score *</Label>
                <Input type="number" placeholder="Marks scored" value={form.score_obtained} onChange={e => setForm(f => ({ ...f, score_obtained: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Total Marks *</Label>
                <Input type="number" placeholder="Max marks" value={form.total_marks} onChange={e => setForm(f => ({ ...f, total_marks: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Rank</Label>
                <Input type="number" placeholder="Your rank" value={form.rank} onChange={e => setForm(f => ({ ...f, rank: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Notes</Label>
                <Input placeholder="Optional notes..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={createTest.isPending}>
                {createTest.isPending ? "Saving..." : "Log Test"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
