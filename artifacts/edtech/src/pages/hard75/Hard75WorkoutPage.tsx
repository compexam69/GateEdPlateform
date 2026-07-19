import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hard75Layout } from "./Hard75Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { Dumbbell, Plus, Trash2, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type WorkoutType = "indoor" | "outdoor";

export default function Hard75WorkoutPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ type: "indoor" as WorkoutType, duration: "45", notes: "", date: today });

  const { data: workouts = [], isLoading } = useQuery({
    queryKey: ["hard75-workouts"],
    queryFn: () => apiFetch("/hard75/workouts") as Promise<any[]>,
  });

  const { data: todayData } = useQuery({
    queryKey: ["hard75-today"],
    queryFn: () => apiFetch("/hard75/today") as Promise<any>,
  });

  const add = useMutation({
    mutationFn: (body: object) => apiFetch("/hard75/workouts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hard75-workouts"] });
      qc.invalidateQueries({ queryKey: ["hard75-today"] });
      setShowAdd(false);
      setForm({ type: "indoor", duration: "45", notes: "", date: today });
      toast({ title: "Workout logged!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/hard75/workouts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hard75-workouts"] });
      qc.invalidateQueries({ queryKey: ["hard75-today"] });
    },
  });

  const indoor1Done = todayData?.tasks?.workout1?.done;
  const outdoor1Done = todayData?.tasks?.workout2?.done;

  // Group by date
  const byDate = workouts.reduce((acc: Record<string, any[]>, w: any) => {
    if (!acc[w.date]) acc[w.date] = [];
    acc[w.date].push(w);
    return acc;
  }, {});

  return (
    <Hard75Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Workout Tracker</h1>
          <Button className="min-h-[44px] shrink-0" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Log Workout
          </Button>
        </div>

        {/* Today's status */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Workout 1", sub: "Indoor", done: indoor1Done },
            { label: "Workout 2", sub: "Outdoor", done: outdoor1Done },
          ].map(({ label, sub, done }) => (
            <Card key={label} className={cn("transition-all", done && "border-green-500/30")}>
              <CardContent className="p-4 flex items-center gap-3 min-h-[64px]">
                {done
                  ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                  : <Circle className="w-5 h-5 text-muted-foreground/40 shrink-0" />
                }
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Workout history */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : workouts.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              <Dumbbell className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No workouts logged yet. Start logging your sessions!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {Object.entries(byDate).slice(0, 14).map(([date, ws]) => (
              <div key={date}>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">
                  {format(new Date(date + "T00:00:00"), "EEEE, MMMM d")}
                </p>
                <div className="space-y-2">
                  {(ws as any[]).map((w: any) => (
                    <Card key={w.id}>
                      <CardContent className="p-4 flex items-center gap-3 min-h-[60px]">
                        <Dumbbell className="w-4 h-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs capitalize",
                                w.type === "outdoor" ? "text-green-600 border-green-600/30" : "text-blue-500 border-blue-500/30"
                              )}
                            >
                              {w.type}
                            </Badge>
                            <span className="text-sm font-medium">{w.duration_minutes} min</span>
                          </div>
                          {w.notes && <p className="text-xs text-muted-foreground truncate mt-0.5">{w.notes}</p>}
                        </div>
                        <Button
                          variant="ghost" size="icon"
                          className="h-10 w-10 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => remove.mutate(w.id)}
                          disabled={remove.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ResponsiveDialog open={showAdd} onOpenChange={setShowAdd} title="Log Workout">
        <div className="space-y-4">
          <div>
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {(["indoor", "outdoor"] as WorkoutType[]).map(t => (
                <Button
                  key={t}
                  variant={form.type === t ? "default" : "outline"}
                  className="min-h-[44px] capitalize"
                  onClick={() => setForm(f => ({ ...f, type: t }))}
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label>Duration (minutes)</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={form.duration}
              onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
              min="1"
              className="mt-1.5 h-11"
            />
          </div>
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="mt-1.5 h-11"
            />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. HIIT, running, weights…"
              className="mt-1.5 h-24 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="min-h-[44px]" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              className="min-h-[44px]"
              onClick={() => add.mutate({ ...form, duration_minutes: Number(form.duration) || 45 })}
              disabled={add.isPending}
            >
              {add.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Log Workout
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
    </Hard75Layout>
  );
}
