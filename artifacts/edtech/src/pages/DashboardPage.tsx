import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Timer, Flame, CheckCircle2, ClipboardList, TrendingUp, BookOpen, ArrowRight } from "lucide-react";
import { useGetDashboardSummary } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { format } from "date-fns";
import { Link, useLocation } from "wouter";

export default function DashboardPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: summary, isLoading } = useGetDashboardSummary({
    query: { queryKey: ["dashboard-summary"] },
  });

  const { data: internalHistory = [] } = useQuery({
    queryKey: ["internal-exam-history"],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_attempts")
        .select("score, total_marks, accuracy, submitted_at, quizzes(title, type)")
        .eq("user_id", user!.id)
        .eq("status", "submitted")
        .order("submitted_at", { ascending: true })
        .limit(20);
      return (data ?? []).map((a: Record<string, unknown>) => ({
        date: format(new Date(a.submitted_at as string), "MMM d"),
        internal: Math.round((a.accuracy as number) ?? 0),
        label: (a.quizzes as { title: string } | null)?.title ?? "Exam",
      }));
    },
    enabled: !!user,
  });

  const { data: externalHistory = [] } = useQuery({
    queryKey: ["external-tests-chart"],
    queryFn: async () => {
      const { data } = await supabase
        .from("external_tests")
        .select("exam_name, exam_date, score_obtained, total_marks")
        .eq("user_id", user!.id)
        .order("exam_date", { ascending: true })
        .limit(20);
      return (data ?? []).map((t: Record<string, unknown>) => ({
        date: format(new Date(t.exam_date as string), "MMM d"),
        external: Math.round(((t.score_obtained as number) / Math.max(t.total_marks as number, 1)) * 100),
        label: t.exam_name as string,
      }));
    },
    enabled: !!user,
  });

  const { data: todayTasks = [] } = useQuery({
    queryKey: ["today-tasks"],
    queryFn: async () => {
      const { data } = await supabase
        .from("study_tasks")
        .select("id, title, status, priority, source")
        .eq("user_id", user!.id)
        .in("status", ["pending", "in_progress"])
        .order("priority", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!user,
  });

  // Merge internal + external into a combined chart timeline
  const allDates = Array.from(new Set([
    ...internalHistory.map(d => d.date),
    ...externalHistory.map(d => d.date),
  ])).sort();

  const chartData = allDates.map(date => {
    const internal = internalHistory.find(d => d.date === date)?.internal ?? null;
    const external = externalHistory.find(d => d.date === date)?.external ?? null;
    return { date, internal, external };
  });

  const hasChart = chartData.length >= 1;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  const statCards = [
    { title: "Focus Streak", value: `${summary?.focus_streak_days ?? 0} Days`, icon: Flame, color: "text-warning" },
    { title: "Today's Focus", value: `${summary?.focus_time_today_minutes ?? 0} Min`, icon: Timer, color: "text-primary" },
    { title: "Topics Mastered", value: summary?.total_topics_complete ?? 0, icon: CheckCircle2, color: "text-success" },
    { title: "Pending Tasks", value: summary?.pending_tasks ?? 0, icon: ClipboardList, color: "text-accent" },
  ];

  const taskStatusColor = (status: string) => {
    if (status === "in_progress") return "bg-primary/20 text-primary border-primary/30";
    return "bg-muted text-muted-foreground border-border";
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Welcome back, {user?.user_metadata?.full_name?.split(" ")[0] || "Student"}
          </h1>
          <p className="text-muted-foreground mt-1">Here's your learning overview for today.</p>
        </div>

        {/* Stat Cards */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className="bg-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2 p-4 sm:p-6">
                  <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight">{stat.title}</CardTitle>
                  <Icon className={`w-4 h-4 ${stat.color} shrink-0`} />
                </CardHeader>
                <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
                  <div className="text-xl sm:text-2xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Performance Trends Chart */}
          <Card className="lg:col-span-2 bg-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" /> Performance Trends
              </CardTitle>
              <Link href="/tracker">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1">
                  View All <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {hasChart ? (
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                      <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", fontSize: 12 }}
                        formatter={(v: number, name: string) => [`${v}%`, name === "internal" ? "Internal Test" : "External Test"]}
                      />
                      <Legend formatter={(v) => v === "internal" ? "Internal Tests" : "External Tests"} wrapperStyle={{ fontSize: 12 }} />
                      <Line
                        type="monotone" dataKey="internal" stroke="hsl(var(--primary))"
                        strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--primary))" }}
                        connectNulls name="internal"
                      />
                      <Line
                        type="monotone" dataKey="external" stroke="hsl(var(--secondary))"
                        strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4, fill: "hsl(var(--secondary))" }}
                        connectNulls name="external"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[220px] flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <TrendingUp className="w-10 h-10 opacity-20" />
                  <p className="text-sm">Take exams to see your performance trend</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Today's Plan */}
          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" /> Today's Plan
              </CardTitle>
              <Link href="/tasks">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1">
                  All <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {todayTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
                  <CheckCircle2 className="w-8 h-8 opacity-20" />
                  <p className="text-sm">No pending tasks</p>
                  <Link href="/tasks">
                    <Button size="sm" variant="outline" className="text-xs mt-1">Add a task</Button>
                  </Link>
                </div>
              ) : (
                <>
                  {(todayTasks as Array<{ id: string; title: string; status: string; source: string }>).map(task => (
                    <div key={task.id} className={`flex items-start gap-2 p-2.5 rounded-lg border text-sm ${taskStatusColor(task.status)}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{task.title}</p>
                      </div>
                      {task.source === "auto" && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">Auto</Badge>
                      )}
                    </div>
                  ))}
                  <Link href="/tasks">
                    <Button size="sm" variant="ghost" className="w-full text-xs mt-1 text-muted-foreground">
                      View all tasks <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Subject Progress */}
          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" /> Subject Progress
              </CardTitle>
              <Link href="/subjects">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1">
                  Browse <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {summary?.subjects_progress?.length ? (
                <div className="space-y-4">
                  {(summary.subjects_progress as Array<{ subject_id: string; subject_title: string; topics_complete: number; topics_total: number }>).map(sub => {
                    const pct = sub.topics_total > 0 ? Math.round((sub.topics_complete / sub.topics_total) * 100) : 0;
                    return (
                      <div key={sub.subject_id} className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{sub.subject_title}</span>
                          <span className="text-muted-foreground">{sub.topics_complete}/{sub.topics_total} topics</span>
                        </div>
                        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
                  <BookOpen className="w-8 h-8 opacity-20" />
                  <p className="text-sm">No subjects yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {[
                { label: "Start Pomodoro", icon: Timer, href: "/pomodoro", color: "text-primary", bg: "bg-primary/10" },
                { label: "Study Tasks", icon: ClipboardList, href: "/tasks", color: "text-accent", bg: "bg-accent/10" },
                { label: "Browse Subjects", icon: BookOpen, href: "/subjects", color: "text-success", bg: "bg-success/10" },
                { label: "Test Tracker", icon: TrendingUp, href: "/tracker", color: "text-warning", bg: "bg-warning/10" },
              ].map(action => {
                const Icon = action.icon;
                return (
                  <Link key={action.href} href={action.href}>
                    <button className="w-full flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-muted/60 transition-all">
                      <div className={`w-10 h-10 rounded-lg ${action.bg} flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 ${action.color}`} />
                      </div>
                      <span className="text-sm font-medium text-center leading-tight">{action.label}</span>
                    </button>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
