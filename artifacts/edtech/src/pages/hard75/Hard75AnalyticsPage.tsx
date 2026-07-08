import { useQuery } from "@tanstack/react-query";
import { Hard75Layout } from "./Hard75Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { BarChart2, Flame, Trophy, TrendingUp, Loader2 } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, Legend,
} from "recharts";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

export default function Hard75AnalyticsPage() {
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";

  const { data, isLoading } = useQuery({
    queryKey: ["hard75-analytics"],
    queryFn: () => apiFetch("/hard75/analytics") as Promise<any>,
  });

  const { data: adminData } = useQuery({
    queryKey: ["hard75-admin-analytics"],
    queryFn: () => apiFetch("/hard75/admin/analytics") as Promise<any>,
    enabled: isSuperAdmin,
  });

  if (isLoading) {
    return <Hard75Layout><div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></Hard75Layout>;
  }

  const taskBreakdown = data?.taskBreakdown ?? {};
  const weekly = data?.weeklyBreakdown ?? [];
  const waterHistory = (data?.waterHistory ?? []).slice(-14).map((h: any) => ({
    date: format(new Date(h.date + "T00:00:00"), "M/d"),
    liters: Math.round((h.amount_ml / 1000) * 10) / 10,
    goal: Math.round((h.target_ml / 1000) * 10) / 10,
  }));
  const readingHistory = (data?.readingHistory ?? []).slice(-14).map((h: any) => ({
    date: format(new Date(h.date + "T00:00:00"), "M/d"),
    pages: h.pages_read,
  }));

  const taskData = [
    { name: "Workout 1", value: taskBreakdown.workout1 ?? 0, fill: "#6366f1" },
    { name: "Workout 2", value: taskBreakdown.workout2 ?? 0, fill: "#8b5cf6" },
    { name: "Water",     value: taskBreakdown.water ?? 0,    fill: "#3b82f6" },
    { name: "Reading",   value: taskBreakdown.reading ?? 0,  fill: "#f59e0b" },
    { name: "Diet",      value: taskBreakdown.diet ?? 0,     fill: "#10b981" },
    { name: "Photo",     value: taskBreakdown.photo ?? 0,    fill: "#ec4899" },
  ];

  return (
    <Hard75Layout>
      <div className="space-y-6">
        <h1 className="text-xl font-bold">Analytics</h1>

        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Trophy,    label: "Completion",    value: `${data?.completionPct ?? 0}%`, color: "text-primary" },
            { icon: Flame,     label: "Current Streak", value: `${data?.currentStreak ?? 0}d`, color: "text-orange-500" },
            { icon: TrendingUp,label: "Longest Streak", value: `${data?.longestStreak ?? 0}d`, color: "text-green-500" },
            { icon: BarChart2, label: "Days Complete",  value: `${data?.completedDays ?? 0}/75`, color: "text-foreground" },
          ].map(({ icon: Icon, label, value, color }) => (
            <Card key={label}>
              <CardContent className="p-4 text-center">
                <Icon className={cn("w-4 h-4 mx-auto mb-1", color)} />
                <p className={cn("text-xl font-bold", color)}>{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Task completion breakdown */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Task Completion Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={taskData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [`${v} days`]} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {taskData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Weekly performance */}
        {weekly.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Last 7 Days</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1">
                {weekly.map((day: any) => (
                  <div key={day.date} className="flex flex-col items-center gap-1">
                    <span className="text-xs text-muted-foreground">{format(new Date(day.date + "T00:00:00"), "EEE")}</span>
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                      day.done ? "bg-green-500/20 text-green-600" : "bg-muted text-muted-foreground"
                    )}>
                      {day.done ? "✓" : "✗"}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{format(new Date(day.date + "T00:00:00"), "d")}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Water trend */}
        {waterHistory.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Water Intake (Liters)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={waterHistory} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="liters" stroke="#3b82f6" strokeWidth={2} dot={false} name="Intake" />
                  <Line type="monotone" dataKey="goal" stroke="hsl(var(--primary))" strokeWidth={1} strokeDasharray="4 4" dot={false} name="Goal" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Reading trend */}
        {readingHistory.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Pages Read per Day</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={readingHistory} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [`${v} pages`]} />
                  <Bar dataKey="pages" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Super Admin: Global Analytics */}
        {isSuperAdmin && adminData && (
          <Card className="border-primary/30">
            <CardHeader className="pb-2"><CardTitle className="text-base text-primary">Global Analytics (Admin)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Enabled Users",  value: adminData.enabledUsers },
                  { label: "Active Challenges", value: adminData.activeCount },
                  { label: "Completed",      value: adminData.completedCount },
                  { label: "Weekly Active",  value: adminData.weeklyDau },
                ].map(({ label, value }) => (
                  <div key={label} className="text-center p-3 bg-muted/30 rounded-lg">
                    <p className="text-xl font-bold text-primary">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
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
