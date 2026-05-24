import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckCircle, XCircle, Search, Shield, User, Clock } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminApproveUser, useAdminRejectUser } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const USERS_KEY = ["admin-users"];

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data: users = [], isLoading } = useQuery({
    queryKey: USERS_KEY,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const approve = useAdminApproveUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: USERS_KEY });
        toast({ title: "User approved" });
      },
      onError: (err: unknown) => toast({ title: "Error", description: (err as Error).message, variant: "destructive" }),
    },
  });

  const reject = useAdminRejectUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: USERS_KEY });
        toast({ title: "User rejected/banned" });
      },
      onError: (err: unknown) => toast({ title: "Error", description: (err as Error).message, variant: "destructive" }),
    },
  });

  const filtered = users.filter((u: { full_name?: string; email?: string }) =>
    !search ||
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const pending = filtered.filter((u: { status: string }) => u.status === "pending_approval");
  const active = filtered.filter((u: { status: string }) => u.status === "active");
  const suspended = filtered.filter((u: { status: string }) => u.status === "suspended");

  function statusBadge(status: string) {
    if (status === "active") return <Badge className="bg-success/10 text-success border-success/20">Active</Badge>;
    if (status === "pending_approval") return <Badge className="bg-warning/10 text-warning border-warning/20">Pending</Badge>;
    return <Badge variant="destructive">Suspended</Badge>;
  }

  function roleBadge(role: string) {
    if (role === "super_admin") return <Badge className="bg-primary/10 text-primary border-primary/20"><Shield className="w-3 h-3 mr-1" />Super Admin</Badge>;
    if (role === "admin") return <Badge variant="outline"><Shield className="w-3 h-3 mr-1" />Admin</Badge>;
    return <Badge variant="secondary"><User className="w-3 h-3 mr-1" />Student</Badge>;
  }

  function UserRow({ user }: { user: Record<string, unknown> }) {
    return (
      <div className="flex items-center justify-between p-4 border border-border rounded-lg">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{String(user.full_name || "Unknown")}</span>
            {roleBadge(String(user.role || "student"))}
            {statusBadge(String(user.status || "pending_approval"))}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
            <span>{String(user.email || "")}</span>
            {!!user.mobile_number && <span>{String(user.mobile_number)}</span>}
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{user.created_at ? format(new Date(String(user.created_at)), "MMM d, yyyy") : ""}</span>
          </div>
        </div>
        {user.status === "pending_approval" && (
          <div className="flex gap-2 shrink-0 ml-3">
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:bg-destructive/10 border-destructive/30"
              onClick={() => reject.mutate({ userId: String(user.id) })}
              disabled={reject.isPending}
            >
              <XCircle className="w-4 h-4 mr-1" /> Reject
            </Button>
            <Button
              size="sm"
              className="bg-success hover:bg-success/90 text-white"
              onClick={() => approve.mutate({ userId: String(user.id) })}
              disabled={approve.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-1" /> Approve
            </Button>
          </div>
        )}
        {user.status === "active" && user.role === "student" && (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:bg-destructive/10 border-destructive/30 shrink-0 ml-3"
            onClick={() => reject.mutate({ userId: String(user.id) })}
            disabled={reject.isPending}
          >
            <XCircle className="w-4 h-4 mr-1" /> Ban
          </Button>
        )}
        {user.status === "suspended" && (
          <Button
            size="sm"
            className="bg-success hover:bg-success/90 text-white shrink-0 ml-3"
            onClick={() => approve.mutate({ userId: String(user.id) })}
            disabled={approve.isPending}
          >
            <CheckCircle className="w-4 h-4 mr-1" /> Reinstate
          </Button>
        )}
      </div>
    );
  }

  return (
    <AppLayout requireAdmin>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
            <p className="text-muted-foreground mt-1">{users.length} total users · {pending.length} pending approval</p>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              className="pl-9 w-64"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
              <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
              <TabsTrigger value="suspended">Suspended ({suspended.length})</TabsTrigger>
            </TabsList>

            {[
              { key: "pending", list: pending, empty: "No pending approvals." },
              { key: "active", list: active, empty: "No active users." },
              { key: "suspended", list: suspended, empty: "No suspended users." },
            ].map(({ key, list, empty }) => (
              <TabsContent key={key} value={key} className="space-y-3 mt-4">
                {list.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">{empty}</div>
                ) : (
                  list.map((user: Record<string, unknown>) => (
                    <UserRow key={String(user.id)} user={user} />
                  ))
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
