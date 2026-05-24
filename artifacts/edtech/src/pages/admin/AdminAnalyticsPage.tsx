import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BookOpen, Target, Clock, HardDrive, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  adminGetAnalytics, getAdminGetAnalyticsUrl,
  adminGetStorageStats, getAdminGetStorageStatsUrl,
} from "@workspace/api-client-react";
import { Progress } from "@/components/ui/progress";

function formatBytes(bytes: number) {
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(1)} MB`;
}

export default function AdminAnalyticsPage() {
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: [getAdminGetAnalyticsUrl()],
    queryFn: () => adminGetAnalytics(),
    refetchInterval: 30000,
  });

  const { data: storage, isLoading: storageLoading } = useQuery({
    queryKey: [getAdminGetStorageStatsUrl()],
    queryFn: () => adminGetStorageStats(),
    refetchInterval: 60000,
  });

  const isLoading = analyticsLoading || storageLoading;

  const storageUsedPct = storage ? Math.min(storage.used_percentage ?? 0, 100) : 0;
  const storageWarning = (storage?.used_percentage ?? 0) > 80;

  const stats = analytics ? [
    { title: "Total Students", value: analytics.total_students, icon: Users, color: "text-primary" },
    { title: "Pending Approvals", value: analytics.pending_approvals, icon: Clock, color: "text-warning" },
    { title: "Exams Taken", value: analytics.total_exams_taken, icon: BookOpen, color: "text-accent" },
    { title: "Average Accuracy", value: `${analytics.average_accuracy?.toFixed(1) ?? 0}%`, icon: Target, color: "text-success" },
  ] : [];

  return (
    <AppLayout requireAdmin>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Platform Analytics</h1>
          <p className="text-muted-foreground mt-1">Real-time platform overview and metrics.</p>
        </div>

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <Card key={stat.title} className="bg-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                      <Icon className={`w-4 h-4 ${stat.color}`} />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{stat.value}</div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {storage && (
              <Card className={`bg-card ${storageWarning ? "border-warning/50" : ""}`}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HardDrive className="w-5 h-5 text-primary" />
                    B2 Storage Monitor
                    {storageWarning && (
                      <span className="text-xs font-normal text-warning bg-warning/10 px-2 py-0.5 rounded-full">
                        ⚠ High Usage
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Global Storage</span>
                      <span className="font-medium">
                        {formatBytes(storage.total_used_bytes ?? 0)} / {formatBytes(storage.limit_bytes ?? 0)}
                      </span>
                    </div>
                    <Progress
                      value={storageUsedPct}
                      className={`h-3 ${storageWarning ? "[&>div]:bg-warning" : ""}`}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {storageUsedPct.toFixed(1)}% used · {storage.total_files ?? 0} files total
                    </p>
                  </div>

                  {storage.top_users && storage.top_users.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-3 flex items-center gap-1">
                        <TrendingUp className="w-4 h-4 text-muted-foreground" /> Top Storage Users
                      </p>
                      <div className="space-y-2">
                        {(storage.top_users as Array<{ user_id: string; full_name: string; used_bytes: number }>).slice(0, 5).map((u) => (
                          <div key={u.user_id} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground truncate max-w-[200px]">{u.full_name}</span>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="w-24 bg-muted rounded-full h-1.5">
                                <div
                                  className="bg-primary h-1.5 rounded-full"
                                  style={{ width: `${Math.min((u.used_bytes / (storage.limit_bytes ?? 1)) * 100, 100)}%` }}
                                />
                              </div>
                              <span className="font-medium w-16 text-right">{formatBytes(u.used_bytes)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
