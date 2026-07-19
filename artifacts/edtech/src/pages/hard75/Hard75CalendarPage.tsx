import { useQuery } from "@tanstack/react-query";
import { Hard75Layout } from "./Hard75Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { CalendarDays, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDay } from "date-fns";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function Hard75CalendarPage() {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today);

  const { data, isLoading } = useQuery({
    queryKey: ["hard75-calendar"],
    queryFn: () => apiFetch("/hard75/calendar") as Promise<{ logs: any[]; challenge: any }>,
  });

  const logs = data?.logs ?? [];
  const challenge = data?.challenge;
  const logMap = new Map(logs.map((l: any) => [l.date, l]));

  const start = startOfMonth(viewMonth);
  const end = endOfMonth(viewMonth);
  const days = eachDayOfInterval({ start, end });
  const startPad = getDay(start);
  const paddedDays = [...Array(startPad).fill(null), ...days];

  const challengeStart = challenge?.start_date
    ? new Date(challenge.start_date + "T00:00:00")
    : null;

  function getDayStatus(date: Date): "completed" | "missed" | "pending" | "none" {
    const dateStr = date.toISOString().slice(0, 10);
    const log = logMap.get(dateStr);
    const todayStr = today.toISOString().slice(0, 10);
    if (!challengeStart || date < challengeStart) return "none";
    if (dateStr > todayStr) return "pending";
    if (log?.all_done) return "completed";
    if (dateStr <= todayStr && challengeStart && date >= challengeStart) return "missed";
    return "none";
  }

  const completedCount = logs.filter((l: any) => l.all_done).length;
  const missedCount = logs.filter((l: any) => !l.all_done).length;

  const LEGEND = [
    { status: "completed", label: "Completed", color: "bg-green-500" },
    { status: "missed",    label: "Missed",    color: "bg-destructive" },
    { status: "pending",   label: "Upcoming",  color: "bg-muted" },
  ];

  return (
    <Hard75Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Calendar</h1>
          {challenge && (
            <Badge variant="outline" className="gap-1 shrink-0">
              <CalendarDays className="w-3.5 h-3.5" />
              Day {challenge.current_day ?? "?"} of 75
            </Badge>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Completed", value: completedCount,                    color: "text-green-500" },
            { label: "Missed",    value: missedCount,                       color: "text-destructive" },
            { label: "Remaining", value: Math.max(0, 75 - completedCount),  color: "text-primary" },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <CardContent className="p-4 text-center">
                <p className={cn("text-2xl font-bold", color)}>{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Month calendar */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{format(viewMonth, "MMMM yyyy")}</CardTitle>
              <div className="flex gap-1">
                <button
                  className="flex items-center justify-center w-11 h-11 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-lg font-medium"
                  onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <button
                  className="flex items-center justify-center w-11 h-11 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-lg font-medium"
                  onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
                <div key={d} className="text-center text-xs text-muted-foreground py-1 font-medium">{d}</div>
              ))}
            </div>
            {/* Days */}
            <div className="grid grid-cols-7 gap-1">
              {paddedDays.map((day, i) => {
                if (!day) return <div key={`pad-${i}`} />;
                const dateStr = day.toISOString().slice(0, 10);
                const status = getDayStatus(day);
                const isToday = dateStr === today.toISOString().slice(0, 10);

                return (
                  <div
                    key={dateStr}
                    title={dateStr}
                    className={cn(
                      "aspect-square rounded-lg flex flex-col items-center justify-center text-xs font-medium relative",
                      status === "completed" && "bg-green-500/20 text-green-600",
                      status === "missed"    && "bg-destructive/10 text-destructive",
                      status === "pending"   && "bg-muted/40 text-muted-foreground",
                      status === "none"      && "text-muted-foreground/40",
                      isToday               && "ring-2 ring-primary ring-offset-1",
                    )}
                  >
                    <span>{format(day, "d")}</span>
                    {status === "completed" && <CheckCircle2 className="w-2.5 h-2.5 mt-0.5 text-green-500" />}
                    {status === "missed"    && <XCircle className="w-2.5 h-2.5 mt-0.5 text-destructive" />}
                    {status === "pending"   && <Clock className="w-2 h-2 mt-0.5 text-muted-foreground/50" />}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-4 pt-3 border-t border-border flex-wrap">
              {LEGEND.map(({ label, color }) => (
                <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className={cn("w-3 h-3 rounded-sm", color)} />
                  {label}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Challenge timeline */}
        {challenge && (
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-base">Challenge Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                {[
                  { label: "Start Date",    value: challenge.start_date ? format(new Date(challenge.start_date + "T00:00:00"), "MMMM d, yyyy") : "—" },
                  { label: "Current Day",   value: `Day ${challenge.current_day ?? "?"}` },
                  { label: "Status",        value: challenge.status },
                  { label: "Goal End Date", value: challenge.start_date ? format(new Date(new Date(challenge.start_date + "T00:00:00").getTime() + 74 * 86400000), "MMMM d, yyyy") : "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center text-sm py-3 border-b border-border/60 last:border-0">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium capitalize">{value}</span>
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
