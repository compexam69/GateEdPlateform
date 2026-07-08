import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hard75Layout } from "./Hard75Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import {
  CheckCircle2, Circle, Dumbbell, Droplets, BookOpen,
  Salad, Camera, Plus, Trash2, Loader2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type WorkoutType = "indoor" | "outdoor";

interface WorkoutForm { type: WorkoutType; duration: string; notes: string; }

export default function Hard75TodaysTasksPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [showWorkout, setShowWorkout] = useState(false);
  const [workoutForm, setWorkoutForm] = useState<WorkoutForm>({ type: "indoor", duration: "45", notes: "" });

  const { data: todayData, isLoading } = useQuery({
    queryKey: ["hard75-today"],
    queryFn: () => apiFetch("/hard75/today") as Promise<any>,
  });

  const addWorkout = useMutation({
    mutationFn: (body: object) => apiFetch("/hard75/workouts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hard75-today"] });
      setShowWorkout(false);
      setWorkoutForm({ type: "indoor", duration: "45", notes: "" });
      toast({ title: "Workout logged!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteWorkout = useMutation({
    mutationFn: (id: string) => apiFetch(`/hard75/workouts/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hard75-today"] }); toast({ title: "Workout removed" }); },
  });

  const logWater = useMutation({
    mutationFn: (body: object) => apiFetch("/hard75/water", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hard75-today"] }); toast({ title: "Water updated!" }); },
  });

  const logReading = useMutation({
    mutationFn: (body: object) => apiFetch("/hard75/reading", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hard75-today"] }); toast({ title: "Reading logged!" }); },
  });

  const logDiet = useMutation({
    mutationFn: (followed: boolean) => apiFetch("/hard75/diet", { method: "POST", body: JSON.stringify({ followed, date: today }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hard75-today"] }); toast({ title: "Diet status updated!" }); },
  });

  const tasks = todayData?.tasks;
  const workouts = todayData?.workouts ?? [];
  const [waterAmount, setWaterAmount] = useState("");
  const [readingPages, setReadingPages] = useState("");
  const [readingBook, setReadingBook] = useState("");

  const TaskSection = ({
    icon: Icon, label, done, children, badge
  }: { icon: any; label: string; done: boolean; children: React.ReactNode; badge?: string }) => (
    <Card className={cn("transition-all", done && "border-green-500/30")}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-3">
          {done
            ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
            : <Circle className="w-5 h-5 text-muted-foreground/50 shrink-0" />
          }
          <Icon className="w-4 h-4 text-primary shrink-0" />
          <CardTitle className={cn("text-base", done && "line-through text-muted-foreground")}>{label}</CardTitle>
          {badge && <Badge variant="outline" className="ml-auto text-xs">{badge}</Badge>}
          {done && <Badge className="ml-auto bg-green-500/10 text-green-600 border-green-500/30 text-xs">Done</Badge>}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">{children}</CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <Hard75Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Hard75Layout>
    );
  }

  return (
    <Hard75Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Today's Tasks</h1>
            <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
          </div>
          {todayData?.allDone && (
            <Badge className="bg-green-500/10 text-green-600 border-green-500/30 gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> All Complete!
            </Badge>
          )}
        </div>

        {/* Workout 1 */}
        <TaskSection icon={Dumbbell} label="Workout 1 — Indoor (45+ min)" done={tasks?.workout1?.done} badge="Required">
          {workouts.filter((w: any) => w.type === "indoor").map((w: any) => (
            <div key={w.id} className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg mb-2 text-sm">
              <span className="text-muted-foreground">{w.duration_minutes} min{w.notes ? ` — ${w.notes}` : ""}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteWorkout.mutate(w.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => { setWorkoutForm({ type: "indoor", duration: "45", notes: "" }); setShowWorkout(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Log Indoor Workout
          </Button>
        </TaskSection>

        {/* Workout 2 */}
        <TaskSection icon={Dumbbell} label="Workout 2 — Outdoor (45+ min)" done={tasks?.workout2?.done} badge="Must be outdoors">
          {workouts.filter((w: any) => w.type === "outdoor").map((w: any) => (
            <div key={w.id} className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg mb-2 text-sm">
              <span className="text-muted-foreground">{w.duration_minutes} min{w.notes ? ` — ${w.notes}` : ""}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteWorkout.mutate(w.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => { setWorkoutForm({ type: "outdoor", duration: "45", notes: "" }); setShowWorkout(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Log Outdoor Workout
          </Button>
        </TaskSection>

        {/* Water */}
        <TaskSection icon={Droplets} label="Water — 1 Gallon (3.78L)" done={tasks?.water?.done}>
          <div className="space-y-2">
            {tasks?.water?.data && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (tasks.water.data.amount_ml / (tasks.water.data.target_ml || 3785)) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {tasks.water.data.amount_ml}ml / {tasks.water.data.target_ml || 3785}ml
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <Input placeholder="Amount (ml)" value={waterAmount} onChange={e => setWaterAmount(e.target.value)} className="h-8 text-sm" type="number" />
              <Button size="sm" onClick={() => logWater.mutate({ amount_ml: Number(waterAmount) || 0, date: today })} disabled={logWater.isPending}>
                {logWater.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Update"}
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {[250, 500, 750, 1000].map(ml => (
                <Button key={ml} size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => logWater.mutate({ amount_ml: (tasks?.water?.data?.amount_ml ?? 0) + ml, date: today })}>
                  +{ml}ml
                </Button>
              ))}
            </div>
          </div>
        </TaskSection>

        {/* Reading */}
        <TaskSection icon={BookOpen} label="Reading — 10 Pages (non-fiction)" done={tasks?.reading?.done}>
          <div className="space-y-2">
            {tasks?.reading?.data && (
              <p className="text-sm text-muted-foreground">
                {tasks.reading.data.pages_read} pages{tasks.reading.data.book_title ? ` of "${tasks.reading.data.book_title}"` : ""}
              </p>
            )}
            <div className="flex gap-2">
              <Input placeholder="Pages read" value={readingPages} onChange={e => setReadingPages(e.target.value)} className="h-8 text-sm" type="number" />
              <Input placeholder="Book title (optional)" value={readingBook} onChange={e => setReadingBook(e.target.value)} className="h-8 text-sm" />
              <Button size="sm" onClick={() => logReading.mutate({ pages_read: Number(readingPages) || 0, book_title: readingBook, date: today })} disabled={logReading.isPending}>
                {logReading.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Log"}
              </Button>
            </div>
          </div>
        </TaskSection>

        {/* Diet */}
        <TaskSection icon={Salad} label="Diet — No Cheat Meals / No Alcohol" done={tasks?.diet?.done}>
          <div className="flex gap-2">
            <Button
              size="sm"
              className={cn(tasks?.diet?.data?.followed ? "bg-green-600 hover:bg-green-700" : "")}
              onClick={() => logDiet.mutate(true)}
              disabled={logDiet.isPending}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Followed
            </Button>
            <Button size="sm" variant="outline" onClick={() => logDiet.mutate(false)} disabled={logDiet.isPending}>
              Failed
            </Button>
          </div>
        </TaskSection>

        {/* Progress Photo */}
        <TaskSection icon={Camera} label="Progress Photo" done={tasks?.photo?.done}>
          <p className="text-sm text-muted-foreground mb-2">
            {tasks?.photo?.done ? "Photo logged for today." : "Go to Progress Photos to upload today's photo."}
          </p>
          <Button size="sm" variant="outline" onClick={() => window.location.assign("/75hard/photos")}>
            <Camera className="w-3.5 h-3.5 mr-1.5" /> Open Photos
          </Button>
        </TaskSection>
      </div>

      {/* Workout Dialog */}
      <Dialog open={showWorkout} onOpenChange={setShowWorkout}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log {workoutForm.type === "indoor" ? "Indoor" : "Outdoor"} Workout</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex gap-2">
              {(["indoor", "outdoor"] as WorkoutType[]).map(t => (
                <Button
                  key={t} size="sm" variant={workoutForm.type === t ? "default" : "outline"}
                  onClick={() => setWorkoutForm(f => ({ ...f, type: t }))}
                  className="flex-1 capitalize"
                >{t}</Button>
              ))}
            </div>
            <div>
              <Label>Duration (minutes)</Label>
              <Input type="number" value={workoutForm.duration} onChange={e => setWorkoutForm(f => ({ ...f, duration: e.target.value }))} min="1" className="mt-1" />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={workoutForm.notes} onChange={e => setWorkoutForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. HIIT session, running 5km..." className="mt-1 h-20" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowWorkout(false)}>Cancel</Button>
              <Button onClick={() => addWorkout.mutate({ type: workoutForm.type, duration_minutes: Number(workoutForm.duration) || 45, notes: workoutForm.notes, date: today })} disabled={addWorkout.isPending}>
                {addWorkout.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Log Workout
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Hard75Layout>
  );
}
