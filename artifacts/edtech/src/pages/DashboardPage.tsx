import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Timer, Flame, CheckCircle2, TrendingUp } from "lucide-react";
import { useGetDashboardSummary } from "@workspace/api-client-react";

export default function DashboardPage() {
  const { user } = useAuth();
  
  // Replace with actual API call when wired
  const { data: summary, isLoading } = useGetDashboardSummary({
    query: {
      queryKey: ["dashboard-summary"]
    }
  });

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
    { title: "Focus Streak", value: `${summary?.focus_streak_days || 0} Days`, icon: Flame, color: "text-warning" },
    { title: "Today's Focus", value: `${summary?.focus_time_today_minutes || 0} Min`, icon: Timer, color: "text-primary" },
    { title: "Topics Mastered", value: summary?.total_topics_complete || 0, icon: CheckCircle2, color: "text-success" },
    { title: "Pending Tasks", value: summary?.pending_tasks || 0, icon: TrendingUp, color: "text-accent" },
  ];

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back, {user?.user_metadata?.full_name?.split(' ')[0] || 'Student'}</h1>
          <p className="text-muted-foreground mt-2">Here's your progress overview.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <Card key={i} className="bg-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <Icon className={`w-4 h-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Subject Progress</CardTitle>
            </CardHeader>
            <CardContent>
              {summary?.subjects_progress?.length ? (
                <div className="space-y-4">
                  {summary.subjects_progress.map((sub: any) => (
                    <div key={sub.subject_id} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{sub.subject_title}</span>
                        <span className="text-muted-foreground">
                          {sub.topics_total > 0 ? Math.round((sub.topics_complete / sub.topics_total) * 100) : 0}%
                        </span>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full transition-all" 
                          style={{ width: `${sub.topics_total > 0 ? (sub.topics_complete / sub.topics_total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No subjects in progress yet.</p>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground mb-4">Jump back into your studies</p>
              <div className="grid grid-cols-2 gap-2">
                <button className="flex flex-col items-center justify-center p-4 rounded-lg border border-border bg-card hover:bg-muted transition-colors">
                  <Timer className="w-6 h-6 mb-2 text-primary" />
                  <span className="text-sm font-medium">Start Pomodoro</span>
                </button>
                <button className="flex flex-col items-center justify-center p-4 rounded-lg border border-border bg-card hover:bg-muted transition-colors">
                  <CheckCircle2 className="w-6 h-6 mb-2 text-success" />
                  <span className="text-sm font-medium">View Tasks</span>
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
