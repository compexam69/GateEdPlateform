import { useQuery } from "@tanstack/react-query";
import { Hard75Layout } from "./Hard75Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { FileText, Download, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

function exportCsv(filename: string, rows: string[][], headers: string[]) {
  const lines = [headers.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function Hard75ReportsPage() {
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";

  const { data, isLoading } = useQuery({
    queryKey: ["hard75-analytics"],
    queryFn: () => apiFetch("/hard75/analytics") as Promise<any>,
  });

  const { data: challenge } = useQuery({
    queryKey: ["hard75-challenge"],
    queryFn: () => apiFetch("/hard75/challenge") as Promise<{ challenge: any }>,
    select: (d: any) => d.challenge,
  });

  if (isLoading) {
    return <Hard75Layout><div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></Hard75Layout>;
  }

  function exportWeeklyReport() {
    const weekly = data?.weeklyBreakdown ?? [];
    const rows = weekly.map((d: any) => [
      d.date,
      d.done ? "Yes" : "No",
      d.workout ? "Yes" : "No",
      d.water ? "Yes" : "No",
      d.reading ? "Yes" : "No",
      d.diet ? "Yes" : "No",
    ]);
    exportCsv("75hard-weekly-report.csv", rows, ["Date", "All Done", "Workout", "Water", "Reading", "Diet"]);
  }

  function exportWaterReport() {
    const hist = data?.waterHistory ?? [];
    const rows = hist.map((h: any) => [h.date, h.amount_ml, h.target_ml, h.amount_ml >= h.target_ml ? "Yes" : "No"]);
    exportCsv("75hard-water-report.csv", rows, ["Date", "Amount (ml)", "Target (ml)", "Goal Met"]);
  }

  function exportReadingReport() {
    const hist = data?.readingHistory ?? [];
    const rows = hist.map((h: any) => [h.date, h.pages_read, h.book_title ?? ""]);
    exportCsv("75hard-reading-report.csv", rows, ["Date", "Pages Read", "Book"]);
  }

  function exportFullReport() {
    const wb = data?.weeklyBreakdown ?? [];
    const rows = wb.map((d: any) => [
      d.date,
      d.done ? "Yes" : "No",
      d.workout ? "Yes" : "No",
      d.water ? "Yes" : "No",
      d.reading ? "Yes" : "No",
      d.diet ? "Yes" : "No",
    ]);
    exportCsv("75hard-full-report.csv", rows, ["Date", "Complete", "Workout", "Water", "Reading", "Diet"]);
  }

  const REPORTS = [
    { title: "Weekly Summary",       desc: "Last 7 days overview",                   action: exportWeeklyReport,  badge: "CSV" },
    { title: "Water Intake Log",     desc: "Full water tracking history",             action: exportWaterReport,   badge: "CSV" },
    { title: "Reading Log",          desc: "All reading sessions with pages & books", action: exportReadingReport, badge: "CSV" },
    { title: "Full 75 Hard Report",  desc: "Complete challenge data export",          action: exportFullReport,    badge: "CSV" },
  ];

  return (
    <Hard75Layout>
      <div className="space-y-6">
        <h1 className="text-xl font-bold">Reports</h1>

        {/* Summary card */}
        {challenge && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Challenge Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                {[
                  { label: "Start Date",    value: challenge.start_date ? format(new Date(challenge.start_date + "T00:00:00"), "MMM d, yyyy") : "—" },
                  { label: "Current Day",   value: `Day ${challenge.current_day ?? "?"}` },
                  { label: "Days Complete", value: `${data?.completedDays ?? 0} days` },
                  { label: "Completion",    value: `${data?.completionPct ?? 0}%` },
                  { label: "Streak",        value: `${data?.currentStreak ?? 0} days` },
                  { label: "Best Streak",   value: `${data?.longestStreak ?? 0} days` },
                ].map(({ label, value }) => (
                  <div key={label} className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-semibold mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Report downloads */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Export Reports</h2>
          {REPORTS.map(({ title, desc, action, badge }) => (
            <Card key={title}>
              <CardContent className="p-4 flex items-center gap-3">
                <FileText className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{title}</p>
                    <Badge variant="outline" className="text-xs">{badge}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <Button size="sm" variant="outline" onClick={action}>
                  <Download className="w-3.5 h-3.5 mr-1.5" /> Export
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Super Admin extra note */}
        {isSuperAdmin && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-primary mb-1">Super Admin Reports</p>
              <p className="text-xs text-muted-foreground">
                Global user analytics are available in the Analytics section. For bulk user exports,
                use the User Management page in the Admin Panel.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </Hard75Layout>
  );
}
