import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Timer, Flame, CheckCircle2, ClipboardList,
  TrendingUp, BookOpen, ArrowRight,
} from "lucide-react";
import { useGetDashboardSummary } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { user } = useAuth();

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
        external: Math.round(
          ((t.score_obtained as number) / Math.max(t.total_marks as number, 1)) * 100
        ),
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
  const chartData = useMemo(() => {
    const allDates = Array.from(
      new Set([
        ...internalHistory.map((d) => d.date),
        ...externalHistory.map((d) => d.date),
      ])
    ).sort();
    return allDates.map((date) => {
      const internal = internalHistory.find((d) => d.date === date)?.internal ?? null;
      const external = externalHistory.find((d) => d.date === date)?.external ?? null;
      return { date, internal, external };
    });
  }, [internalHistory, externalHistory]);

  const hasChart = chartData.length >= 1;

  // Only subjects where the user has started at least one topic
  type SubjectProgress = { subject_id: string; subject_title: string; topics_complete: number; topics_total: number };
  const startedSubjects = ((summary?.subjects_progress ?? []) as SubjectProgress[]).filter(
    (s) => s.topics_complete > 0
  );

  // Sparse tick interval so labels don't overlap on narrow screens
  const xTickInterval =
    chartData.length <= 5 ? 0 : chartData.length <= 10 ? 1 : Math.ceil(chartData.length / 5) - 1;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "Student";

  const statCards = [
    {
      title: "Focus Streak",
      value: summary?.focus_streak_days ?? 0,
      unit: "days",
      icon: Flame,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    },
    {
      title: "Today's Focus",
      value: summary?.focus_time_today_minutes ?? 0,
      unit: "min",
      icon: Timer,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      title: "Topics Mastered",
      value: summary?.total_topics_complete ?? 0,
      unit: "topics",
      icon: CheckCircle2,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      title: "Pending Tasks",
      value: summary?.pending_tasks ?? 0,
      unit: "tasks",
      icon: ClipboardList,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
  ];

  const taskStatusStyle = (status: string) =>
    status === "in_progress"
      ? "bg-primary/10 text-primary border-primary/30"
      : "bg-muted/60 text-muted-foreground border-border";

  return (
    <AppLayout>
      {/* ── root container: tighter gap on mobile, wider on desktop ── */}
      <div className="space-y-4 sm:space-y-6">
        <AnnouncementBanner />

        {/* ── Greeting ── */}
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight leading-tight">
            Welcome back, {firstName} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Here's your learning overview for today.
          </p>
        </div>

        {/* ── Stat Cards — 2 col on mobile, 4 col on lg ── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className="overflow-hidden">
                <CardContent className="p-4">
                  {/* Icon + label row */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight">
                      {stat.title}
                    </p>
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", stat.bg)}>
                      <Icon className={cn("w-4 h-4", stat.color)} />
                    </div>
                  </div>
                  {/* Value */}
                  <p className="text-2xl sm:text-3xl font-bold leading-none tabular-nums">
                    {stat.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.unit}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ── Today's Plan + Performance Chart
             Mobile: Today's Plan first (more actionable), chart below
             Desktop (lg): chart spans 2 cols, tasks panel on right      ── */}
        <div className="grid gap-4 lg:grid-cols-3">

          {/* Today's Plan — shown first on mobile via order, right on desktop */}
          <Card className="order-first lg:order-last">
            <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4 px-4 sm:px-6 sm:pt-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
                Today's Plan
              </CardTitle>
              <Link href="/tasks">
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground gap-1 px-2">
                  All <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0 space-y-2">
              {todayTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <CheckCircle2 className="w-8 h-8 opacity-20" />
                  <p className="text-sm">No pending tasks</p>
                  <Link href="/tasks">
                    <Button size="sm" variant="outline" className="text-xs mt-1 min-h-[36px]">
                      Add a task
                    </Button>
                  </Link>
                </div>
              ) : (
                <>
                  {(
                    todayTasks as Array<{
                      id: string;
                      title: string;
                      status: string;
                      source: string;
                    }>
                  ).map((task) => (
                    <div
                      key={task.id}
                      className={cn(
                        "flex items-center gap-2 px-3 py-3 rounded-xl border text-sm min-h-[48px]",
                        taskStatusStyle(task.status)
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium leading-snug line-clamp-2">{task.title}</p>
                      </div>
                      {task.source === "auto" && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          Auto
                        </Badge>
                      )}
                    </div>
                  ))}
                  <Link href="/tasks">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full text-xs mt-1 text-muted-foreground min-h-[40px]"
                    >
                      View all tasks <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                </>
              )}
            </CardContent>
          </Card>

          {/* Performance Chart — full width on mobile, 2-col span on desktop */}
          <Card className="lg:col-span-2 order-last lg:order-first">
            <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4 sm:px-6 sm:pt-6 flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
                Performance Trends
              </CardTitle>
              <Link href="/tracker">
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground gap-1 px-2">
                  View All <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6 pt-0">
              {hasChart ? (
                <>
                  {/* Mobile-only legend strip above chart */}
                  <div className="flex items-center gap-4 mb-3 sm:hidden">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-4 h-0.5 bg-primary rounded" />
                      Internal
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-4 h-0.5 bg-secondary rounded border-dashed border-t border-secondary" style={{ borderTopStyle: "dashed" }} />
                      External
                    </div>
                  </div>
                  {/* Chart — responsive height */}
                  <div className="h-[190px] sm:h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartData}
                        margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="hsl(var(--border))"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 10 }}
                          interval={xTickInterval}
                          tickLine={false}
                        />
                        <YAxis
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 10 }}
                          domain={[0, 100]}
                          unit="%"
                          tickLine={false}
                          axisLine={false}
                          width={36}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            fontSize: 12,
                            borderRadius: "8px",
                          }}
                          formatter={(v: number, name: string) => [
                            `${v}%`,
                            name === "internal" ? "Internal" : "External",
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="internal"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={{ r: 3, fill: "hsl(var(--primary))" }}
                          activeDot={{ r: 5 }}
                          connectNulls
                          name="internal"
                        />
                        <Line
                          type="monotone"
                          dataKey="external"
                          stroke="hsl(var(--secondary))"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={{ r: 3, fill: "hsl(var(--secondary))" }}
                          activeDot={{ r: 5 }}
                          connectNulls
                          name="external"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Desktop legend below chart */}
                  <div className="hidden sm:flex items-center gap-5 mt-2 justify-center">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-5 h-0.5 bg-primary rounded" />
                      Internal Tests
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div
                        className="w-5 h-0"
                        style={{ borderTop: "2px dashed hsl(var(--secondary))" }}
                      />
                      External Tests
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-[190px] sm:h-[220px] flex flex-col items-center justify-center text-muted-foreground gap-3">
                  <TrendingUp className="w-10 h-10 opacity-20" />
                  <p className="text-sm text-center">
                    Take exams to see your performance trend
                  </p>
                  <Link href="/tracker">
                    <Button size="sm" variant="outline" className="text-xs min-h-[36px]">
                      Go to Tracker
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Subject Progress + Quick Actions ── */}
        <div className="grid gap-4 md:grid-cols-2">

          {/* Subject Progress */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4 px-4 sm:px-6 sm:pt-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
                Subject Progress
              </CardTitle>
              <Link href="/subjects">
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground gap-1 px-2">
                  Browse <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
              {startedSubjects.length > 0 ? (
                <div className="space-y-4">
                  {startedSubjects.map((sub) => {
                    const pct =
                      sub.topics_total > 0
                        ? Math.round((sub.topics_complete / sub.topics_total) * 100)
                        : 0;
                    return (
                      <div key={sub.subject_id} className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-2 flex-wrap">
                          <span className="text-sm font-medium leading-snug min-w-0 flex-1">
                            {sub.subject_title}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                            {sub.topics_complete}/{sub.topics_total}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right shrink-0 tabular-nums">
                            {pct}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <BookOpen className="w-8 h-8 opacity-20" />
                  <p className="text-sm">No progress yet</p>
                  <Link href="/subjects">
                    <Button size="sm" variant="outline" className="text-xs mt-1 min-h-[36px]">
                      Browse Subjects
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3 pt-4 px-4 sm:px-6 sm:pt-6">
              <CardTitle className="text-base sm:text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0 grid grid-cols-2 gap-3">
              {[
                {
                  label: "Start Pomodoro",
                  icon: Timer,
                  href: "/pomodoro",
                  color: "text-primary",
                  bg: "bg-primary/10",
                },
                {
                  label: "Study Tasks",
                  icon: ClipboardList,
                  href: "/tasks",
                  color: "text-amber-500",
                  bg: "bg-amber-500/10",
                },
                {
                  label: "Browse Subjects",
                  icon: BookOpen,
                  href: "/subjects",
                  color: "text-green-500",
                  bg: "bg-green-500/10",
                },
                {
                  label: "Test Tracker",
                  icon: TrendingUp,
                  href: "/tracker",
                  color: "text-orange-500",
                  bg: "bg-orange-500/10",
                },
              ].map((action) => {
                const Icon = action.icon;
                return (
                  <Link key={action.href} href={action.href}>
                    <button className="w-full min-h-[80px] flex flex-col items-center justify-center gap-2.5 p-3 sm:p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-muted/60 active:scale-[0.97] transition-all">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                          action.bg
                        )}
                      >
                        <Icon className={cn("w-5 h-5", action.color)} />
                      </div>
                      <span className="text-xs sm:text-sm font-medium text-center leading-tight">
                        {action.label}
                      </span>
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
