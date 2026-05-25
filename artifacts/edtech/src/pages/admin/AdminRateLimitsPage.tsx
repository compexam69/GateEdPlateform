import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, RefreshCw, CheckCircle, Clock, Ban } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getApiBase } from "@/lib/api";
import { supabase } from "@/lib/supabase";

interface RateLimitEntry {
  key: string;
  type: string;
  hits_in_window: number;
  limit: number | null;
  throttled: boolean;
  resets_at: string | null;
  last_hit_at: string | null;
}

interface RateLimitsResponse {
  total_keys: number;
  entries: RateLimitEntry[];
}

const KEY_PREFIX_COLORS: Record<string, string> = {
  "exam-start":  "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "register":    "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "resend":      "bg-purple-500/10 text-purple-400 border-purple-500/20",
  "pwd-change":  "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

function parseKey(key: string): { prefix: string; identifier: string } {
  const colonIdx = key.indexOf(":");
  if (colonIdx === -1) return { prefix: key, identifier: "" };
  return {
    prefix: key.slice(0, colonIdx),
    identifier: key.slice(colonIdx + 1),
  };
}

function truncateIdentifier(id: string): string {
  if (id.includes("@")) return id;
  if (id.includes(".")) return id;
  if (id.length > 16) return id.slice(0, 8) + "…" + id.slice(-4);
  return id;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "now";
  const s = Math.ceil(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.ceil(m / 60)}h`;
}

function formatAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function AdminRateLimitsPage() {
  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery<RateLimitsResponse>({
    queryKey: ["admin-rate-limits"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${getApiBase()}/admin/rate-limits`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch rate limit data");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const throttledCount = data?.entries.filter(e => e.throttled).length ?? 0;
  const totalKeys = data?.total_keys ?? 0;
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—";

  return (
    <AppLayout requireAdmin>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Rate Limit Monitor</h1>
            <p className="text-muted-foreground mt-1">
              Live view of active rate-limit windows. Throttled entries sort first.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-muted-foreground hidden sm:block">
              Updated {lastUpdated}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Keys</CardTitle>
              <ShieldAlert className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{isLoading ? "—" : totalKeys}</div>
              <p className="text-xs text-muted-foreground mt-1">keys with activity in last 2h</p>
            </CardContent>
          </Card>

          <Card className={`bg-card ${throttledCount > 0 ? "border-destructive/40" : ""}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Currently Throttled</CardTitle>
              <Ban className={`w-4 h-4 ${throttledCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${throttledCount > 0 ? "text-destructive" : ""}`}>
                {isLoading ? "—" : throttledCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {throttledCount === 0 ? "no one blocked right now" : "users/IPs currently blocked"}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Auto-Refresh</CardTitle>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">30s</div>
              <p className="text-xs text-muted-foreground mt-1">polling interval</p>
            </CardContent>
          </Card>
        </div>

        {/* Main table */}
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" />
              Rate Limit Entries
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex h-40 items-center justify-center">
                <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : !data || data.entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <CheckCircle className="w-10 h-10 text-success" />
                <p className="text-muted-foreground text-sm">No active rate-limit entries in the last 2 hours.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/40">
                    <tr>
                      <th className="px-4 py-3 text-left">Key</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left">Usage</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-right">Resets In</th>
                      <th className="px-4 py-3 text-right">Last Hit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((entry) => {
                      const { prefix, identifier } = parseKey(entry.key);
                      const keyColor = KEY_PREFIX_COLORS[prefix] ?? "bg-muted/40 text-muted-foreground border-border";
                      const pct = entry.limit ? Math.min((entry.hits_in_window / entry.limit) * 100, 100) : 0;
                      const barColor = entry.throttled
                        ? "bg-destructive"
                        : pct >= 80
                        ? "bg-warning"
                        : "bg-primary";

                      return (
                        <tr
                          key={entry.key}
                          className={`border-b border-border last:border-0 ${entry.throttled ? "bg-destructive/5" : ""}`}
                        >
                          {/* Key */}
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex items-center self-start text-xs font-medium px-1.5 py-0.5 rounded border ${keyColor}`}>
                                {prefix}
                              </span>
                              <span className="font-mono text-xs text-muted-foreground break-all max-w-[200px]">
                                {truncateIdentifier(identifier)}
                              </span>
                            </div>
                          </td>

                          {/* Type */}
                          <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                            {entry.type}
                          </td>

                          {/* Usage bar */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-[120px]">
                              <div className="flex-1 bg-muted rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${barColor}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium tabular-nums whitespace-nowrap">
                                {entry.hits_in_window}{entry.limit ? `/${entry.limit}` : ""}
                              </span>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            {entry.throttled ? (
                              <Badge variant="destructive" className="gap-1 text-xs">
                                <Ban className="w-3 h-3" /> Blocked
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1 text-xs bg-success/10 text-success border-success/20">
                                <CheckCircle className="w-3 h-3" /> OK
                              </Badge>
                            )}
                          </td>

                          {/* Resets in */}
                          <td className="px-4 py-3 text-right text-sm tabular-nums">
                            {entry.throttled && entry.resets_at ? (
                              <span className="text-destructive font-medium">
                                {formatRelativeTime(entry.resets_at)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>

                          {/* Last hit */}
                          <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                            {formatAgo(entry.last_hit_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {Object.entries(KEY_PREFIX_COLORS).map(([prefix, cls]) => (
            <span key={prefix} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${cls}`}>
              {prefix}
            </span>
          ))}
          <span className="self-center">— key prefix colours</span>
        </div>
      </div>
    </AppLayout>
  );
}
