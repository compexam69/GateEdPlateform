import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hard75Layout } from "./Hard75Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { Droplets, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { cn } from "@/lib/utils";

const QUICK_AMOUNTS = [200, 250, 350, 500, 750, 1000];

export default function Hard75WaterPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [customAmount, setCustomAmount] = useState("");

  const { data: waterData, isLoading } = useQuery({
    queryKey: ["hard75-water-today"],
    queryFn: () => apiFetch(`/hard75/water?date=${today}`) as Promise<{ amount_ml: number; target_ml: number; date: string }>,
  });

  const { data: history = [] } = useQuery({
    queryKey: ["hard75-water-history"],
    queryFn: () => apiFetch("/hard75/water/history") as Promise<Array<{ date: string; amount_ml: number; target_ml: number }>>,
  });

  const update = useMutation({
    mutationFn: (amount_ml: number) =>
      apiFetch("/hard75/water", { method: "POST", body: JSON.stringify({ amount_ml, target_ml: waterData?.target_ml ?? 3785, date: today }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hard75-water-today"] }); qc.invalidateQueries({ queryKey: ["hard75-water-history"] }); qc.invalidateQueries({ queryKey: ["hard75-today"] }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const amount = waterData?.amount_ml ?? 0;
  const target = waterData?.target_ml ?? 3785;
  const pct = Math.min(100, Math.round((amount / target) * 100));
  const done = amount >= target;

  const last7 = history.slice(0, 7).reverse().map(h => ({
    date: format(new Date(h.date + "T00:00:00"), "M/d"),
    amount: Math.round(h.amount_ml / 100) / 10,
    target: Math.round(h.target_ml / 100) / 10,
    done: h.amount_ml >= h.target_ml,
  }));

  return (
    <Hard75Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Water Tracker</h1>
          {done && (
            <div className="flex items-center gap-1.5 text-blue-500 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" /> Goal reached!
            </div>
          )}
        </div>

        {/* Circular progress */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-8">
              {/* Progress ring */}
              <div className="relative w-32 h-32 shrink-0">
                <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
                  <circle
                    cx="60" cy="60" r="50" fill="none"
                    stroke={done ? "#22c55e" : "hsl(var(--primary))"}
                    strokeWidth="10"
                    strokeDasharray={`${2 * Math.PI * 50}`}
                    strokeDashoffset={`${2 * Math.PI * 50 * (1 - pct / 100)}`}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <Droplets className="w-5 h-5 text-blue-500 mb-0.5" />
                  <span className="text-xl font-bold">{pct}%</span>
                </div>
              </div>
              <div className="flex-1">
                <p className="text-3xl font-bold">{amount.toLocaleString()}<span className="text-lg text-muted-foreground">ml</span></p>
                <p className="text-sm text-muted-foreground">of {target.toLocaleString()}ml goal</p>
                <p className="text-sm text-muted-foreground mt-1">{Math.max(0, target - amount).toLocaleString()}ml remaining</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick add buttons */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Quick Add</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
              {QUICK_AMOUNTS.map(ml => (
                <Button key={ml} variant="outline" size="sm"
                  className={cn("text-xs", done && "opacity-50")}
                  onClick={() => update.mutate(amount + ml)}
                  disabled={update.isPending}
                >
                  +{ml}ml
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                type="number" placeholder="Custom amount (ml)"
                value={customAmount} onChange={e => setCustomAmount(e.target.value)}
                className="h-9 text-sm"
              />
              <Button size="sm" onClick={() => { if (customAmount) { update.mutate(amount + Number(customAmount)); setCustomAmount(""); } }} disabled={update.isPending || !customAmount}>
                {update.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => update.mutate(0)} disabled={update.isPending}>
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 7-day chart */}
        {last7.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Last 7 Days</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={last7} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="L" />
                  <Tooltip formatter={(v: any) => [`${v}L`]} />
                  <ReferenceLine y={Math.round(target / 100) / 10} stroke="hsl(var(--primary))" strokeDasharray="3 3" label={{ value: "Goal", position: "right", fontSize: 10 }} />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* History */}
        {history.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">History</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {history.slice(0, 14).map(h => {
                  const p = Math.min(100, Math.round((h.amount_ml / h.target_ml) * 100));
                  const d = h.amount_ml >= h.target_ml;
                  return (
                    <div key={h.date} className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground w-16 shrink-0">{format(new Date(h.date + "T00:00:00"), "MMM d")}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", d ? "bg-green-500" : "bg-primary")} style={{ width: `${p}%` }} />
                      </div>
                      <span className={cn("w-16 text-right shrink-0", d ? "text-green-500" : "text-muted-foreground")}>
                        {h.amount_ml}ml
                      </span>
                      {d && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Hard75Layout>
  );
}
