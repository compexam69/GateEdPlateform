import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hard75Layout } from "./Hard75Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { Salad, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function Hard75DietPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [notes, setNotes] = useState("");

  const { data: todayDiet } = useQuery({
    queryKey: ["hard75-diet-today"],
    queryFn: () => apiFetch(`/hard75/diet?date=${today}`) as Promise<any>,
  });

  const { data: allLogs = [] } = useQuery({
    queryKey: ["hard75-calendar"],
    queryFn: () => apiFetch("/hard75/calendar") as Promise<{ logs: any[]; challenge: any }>,
    select: (d: any) => d.logs ?? [],
  });

  const log = useMutation({
    mutationFn: (body: { followed: boolean; notes: string }) =>
      apiFetch("/hard75/diet", { method: "POST", body: JSON.stringify({ ...body, date: today }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hard75-diet-today"] });
      qc.invalidateQueries({ queryKey: ["hard75-today"] });
      qc.invalidateQueries({ queryKey: ["hard75-calendar"] });
      toast({ title: "Diet status saved!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const dietLogs = allLogs
    .filter((l: any) => l.diet_done !== undefined)
    .slice(-30);
  const followed = dietLogs.filter((l: any) => l.diet_done).length;
  const missed = dietLogs.filter((l: any) => !l.diet_done && l.date <= today).length;

  const DIET_RULES = [
    "Follow a specific diet (you choose which one)",
    "No cheat meals or alcohol",
    "No caloric beverages (except protein shakes with your diet)",
    "No unplanned food",
    "Stick to your chosen diet every single day",
  ];

  return (
    <Hard75Layout>
      <div className="space-y-5">
        <h1 className="text-xl font-bold">Diet Tracker</h1>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Days Followed", value: followed, color: "text-green-500" },
            { label: "Days Missed",   value: missed,   color: "text-destructive" },
            { label: "Success Rate",
              value: `${followed + missed > 0 ? Math.round((followed / (followed + missed)) * 100) : 0}%`,
              color: "text-primary" },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <CardContent className="p-4 text-center">
                <p className={cn("text-2xl font-bold", color)}>{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Today */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-base">Today — {format(new Date(), "MMMM d")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {todayDiet && (
              <div className={cn(
                "flex items-center gap-2 p-3.5 rounded-xl text-sm font-medium",
                todayDiet.followed
                  ? "bg-green-500/10 text-green-600"
                  : "bg-destructive/10 text-destructive"
              )}>
                {todayDiet.followed
                  ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                  : <XCircle className="w-4 h-4 shrink-0" />
                }
                {todayDiet.followed ? "Diet followed today" : "Diet not followed"}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Button
                className={cn("min-h-[52px]", todayDiet?.followed === true && "ring-2 ring-green-500")}
                onClick={() => log.mutate({ followed: true, notes })}
                disabled={log.isPending}
              >
                {log.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Followed
              </Button>
              <Button
                variant="outline"
                className={cn("min-h-[52px]", todayDiet?.followed === false && "ring-2 ring-destructive")}
                onClick={() => log.mutate({ followed: false, notes })}
                disabled={log.isPending}
              >
                <XCircle className="w-4 h-4 mr-2" /> Failed
              </Button>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="What did you eat? Any challenges?"
                className="mt-1.5 h-24 text-sm resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Rules */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Salad className="w-4 h-4 text-primary" /> 75 Hard Diet Rules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {DIET_RULES.map(rule => (
                <li key={rule} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  {rule}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* History heatmap */}
        {dietLogs.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-base">Last 30 Days</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {dietLogs.map((l: any) => (
                  <div
                    key={l.date}
                    title={`${format(new Date(l.date + "T00:00:00"), "MMM d")}: ${l.diet_done ? "Followed" : "Missed"}`}
                    className={cn(
                      "w-8 h-8 rounded-lg text-[11px] flex items-center justify-center font-medium",
                      l.diet_done
                        ? "bg-green-500/20 text-green-600"
                        : "bg-destructive/10 text-destructive"
                    )}
                  >
                    {format(new Date(l.date + "T00:00:00"), "d")}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Hard75Layout>
  );
}
