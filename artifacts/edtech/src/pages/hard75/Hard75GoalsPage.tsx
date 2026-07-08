import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hard75Layout } from "./Hard75Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { Ruler, Plus, Trash2, Loader2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type MeasurementField = {
  key: string; label: string; unit: string; icon?: string;
};

const FIELDS: MeasurementField[] = [
  { key: "weight_kg",        label: "Weight",        unit: "kg" },
  { key: "target_weight_kg", label: "Target Weight", unit: "kg" },
  { key: "body_fat_pct",     label: "Body Fat",      unit: "%" },
  { key: "chest_cm",         label: "Chest",         unit: "cm" },
  { key: "waist_cm",         label: "Waist",         unit: "cm" },
  { key: "hips_cm",          label: "Hips",          unit: "cm" },
  { key: "arms_cm",          label: "Arms",          unit: "cm" },
  { key: "thighs_cm",        label: "Thighs",        unit: "cm" },
];

type Form = { date: string } & Record<string, string>;

function emptyForm(): Form {
  const f: Form = { date: new Date().toISOString().slice(0, 10) };
  for (const field of FIELDS) f[field.key] = "";
  return f;
}

export default function Hard75GoalsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm());

  const { data: measurements = [], isLoading } = useQuery({
    queryKey: ["hard75-measurements"],
    queryFn: () => apiFetch("/hard75/measurements") as Promise<any[]>,
  });

  const add = useMutation({
    mutationFn: (body: object) => apiFetch("/hard75/measurements", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hard75-measurements"] });
      setShowAdd(false);
      setForm(emptyForm());
      toast({ title: "Measurements saved!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/hard75/measurements/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hard75-measurements"] }); },
  });

  const sorted = [...measurements].sort((a: any, b: any) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const first = sorted[0];

  function trend(key: string) {
    if (!latest || !previous) return null;
    const l = Number(latest[key]);
    const p = Number(previous[key]);
    if (!l || !p) return null;
    if (l < p) return "down";
    if (l > p) return "up";
    return "same";
  }

  const weightChartData = sorted.filter((m: any) => m.weight_kg).map((m: any) => ({
    date: format(new Date(m.date + "T00:00:00"), "M/d"),
    weight: Number(m.weight_kg),
  }));

  return (
    <Hard75Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Goals & Measurements</h1>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Log Measurements
          </Button>
        </div>

        {/* Current snapshot */}
        {latest && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Latest — {format(new Date(latest.date + "T00:00:00"), "MMM d, yyyy")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {FIELDS.filter(f => latest[f.key] != null && latest[f.key] !== "").map(({ key, label, unit }) => {
                  const t = trend(key);
                  return (
                    <div key={key} className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <p className="text-lg font-bold">{Number(latest[key]).toFixed(1)}<span className="text-xs text-muted-foreground ml-0.5">{unit}</span></p>
                        {t === "down" && <TrendingDown className="w-3.5 h-3.5 text-green-500" />}
                        {t === "up" && <TrendingUp className="w-3.5 h-3.5 text-orange-500" />}
                        {t === "same" && <Minus className="w-3.5 h-3.5 text-muted-foreground" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Weight chart */}
        {weightChartData.length > 1 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Weight Over Time</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={weightChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip formatter={(v: any) => [`${v} kg`]} />
                  <Line type="monotone" dataKey="weight" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* History table */}
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : measurements.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <Ruler className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground">No measurements yet. Start tracking your progress!</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">History</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs">
                      <th className="text-left py-2 pr-3 font-medium">Date</th>
                      {FIELDS.slice(0, 5).map(f => <th key={f.key} className="text-right py-2 pr-3 font-medium">{f.label}</th>)}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {[...measurements].slice(0, 15).map((m: any) => (
                      <tr key={m.id} className="border-t border-border/50">
                        <td className="py-2 pr-3 text-muted-foreground">{format(new Date(m.date + "T00:00:00"), "MMM d")}</td>
                        {FIELDS.slice(0, 5).map(f => (
                          <td key={f.key} className="py-2 pr-3 text-right">
                            {m[f.key] != null ? `${Number(m[f.key]).toFixed(1)}${f.unit}` : "—"}
                          </td>
                        ))}
                        <td className="py-2 text-right">
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => remove.mutate(m.id)} disabled={remove.isPending}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Measurements</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto">
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map(({ key, label, unit }) => (
                <div key={key}>
                  <Label className="text-xs">{label} ({unit})</Label>
                  <Input
                    type="number" step="0.1" placeholder="Optional"
                    value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowAdd(false); setForm(emptyForm()); }}>Cancel</Button>
              <Button onClick={() => add.mutate(form)} disabled={add.isPending}>
                {add.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Hard75Layout>
  );
}
