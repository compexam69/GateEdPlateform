import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hard75Layout } from "./Hard75Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { BookOpen, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { cn } from "@/lib/utils";

export default function Hard75ReadingPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [pages, setPages] = useState("");
  const [book, setBook] = useState("");
  const [notes, setNotes] = useState("");

  const { data: todayReading } = useQuery({
    queryKey: ["hard75-reading-today"],
    queryFn: () => apiFetch(`/hard75/reading?date=${today}`) as Promise<any>,
  });

  const { data: history = [] } = useQuery({
    queryKey: ["hard75-reading-history"],
    queryFn: () => apiFetch("/hard75/reading/history") as Promise<any[]>,
  });

  const log = useMutation({
    mutationFn: (body: object) => apiFetch("/hard75/reading", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hard75-reading-today"] });
      qc.invalidateQueries({ queryKey: ["hard75-reading-history"] });
      qc.invalidateQueries({ queryKey: ["hard75-today"] });
      toast({ title: "Reading logged!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const totalPagesRead = history.reduce((sum, h: any) => sum + h.pages_read, 0);
  const daysGoalMet = history.filter((h: any) => h.pages_read >= 10).length;
  const last7 = history.slice(0, 7).reverse().map((h: any) => ({
    date: format(new Date(h.date + "T00:00:00"), "M/d"),
    pages: h.pages_read,
  }));

  return (
    <Hard75Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Reading Tracker</h1>
          {(todayReading?.pages_read ?? 0) >= 10 && (
            <div className="flex items-center gap-1.5 text-green-500 text-sm font-medium shrink-0">
              <CheckCircle2 className="w-4 h-4" /> Goal met!
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Today",         value: `${todayReading?.pages_read ?? 0}` , sub: "pages" },
            { label: "Days with 10+", value: `${daysGoalMet}`,                    sub: "days" },
            { label: "Total Pages",   value: `${totalPagesRead}`,                 sub: "pages" },
          ].map(({ label, value, sub }) => (
            <Card key={label}>
              <CardContent className="p-4 text-center">
                <BookOpen className="w-4 h-4 text-primary mx-auto mb-1" />
                <p className="text-xl font-bold">{value}</p>
                <p className="text-[11px] text-muted-foreground leading-tight">{sub}<br />{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Today's log form */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-base">Log Today's Reading</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {todayReading && (
              <div className="p-3.5 bg-muted/40 rounded-xl text-sm">
                <p className="font-medium">{todayReading.pages_read} pages read today</p>
                {todayReading.book_title && (
                  <p className="text-muted-foreground mt-0.5">{todayReading.book_title}</p>
                )}
              </div>
            )}
            {/* Single column on mobile, 2 cols on sm+ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Pages Read</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={pages}
                  onChange={e => setPages(e.target.value)}
                  placeholder="e.g. 15"
                  min="0"
                  className="mt-1.5 h-11"
                />
              </div>
              <div>
                <Label>Book Title (optional)</Label>
                <Input
                  value={book}
                  onChange={e => setBook(e.target.value)}
                  placeholder="Book name…"
                  className="mt-1.5 h-11"
                />
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Key takeaway or insight…"
                className="mt-1.5 h-11"
              />
            </div>
            <Button
              className="w-full min-h-[48px]"
              onClick={() => log.mutate({ pages_read: Number(pages) || 0, book_title: book, notes, date: today })}
              disabled={log.isPending || !pages}
            >
              {log.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Log Reading
            </Button>
          </CardContent>
        </Card>

        {/* Chart */}
        {last7.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-base">Last 7 Days</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={last7} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [`${v} pages`]} />
                  <ReferenceLine
                    y={10}
                    stroke="hsl(var(--primary))"
                    strokeDasharray="3 3"
                    label={{ value: "Goal", position: "right", fontSize: 10 }}
                  />
                  <Bar dataKey="pages" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* History */}
        {history.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-base">Reading History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {history.slice(0, 20).map((h: any) => (
                  <div key={h.date} className="flex items-center gap-3 text-sm py-1.5">
                    <span className="text-muted-foreground text-xs w-14 shrink-0">
                      {format(new Date(h.date + "T00:00:00"), "MMM d")}
                    </span>
                    <div className="flex-1 min-w-0">
                      {h.book_title && (
                        <span className="text-foreground truncate text-sm">{h.book_title}</span>
                      )}
                    </div>
                    <span className={cn("font-medium shrink-0 text-sm", h.pages_read >= 10 ? "text-green-500" : "text-muted-foreground")}>
                      {h.pages_read} pg
                    </span>
                    {h.pages_read >= 10 && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
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
