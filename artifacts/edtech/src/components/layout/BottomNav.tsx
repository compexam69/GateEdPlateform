import { Link, useLocation } from "wouter";
import { BookOpen, Home, Timer, CheckSquare, MoreHorizontal, FileText, LineChart, User, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { getApiBase } from "@/lib/api";
import { Sheet, SheetContent } from "@/components/ui/sheet";

function useUnreadCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    async function fetch() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const base = getApiBase();
        const res = await globalThis.fetch(`${base}/notifications`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setCount(json.unread_count ?? 0);
        }
      } catch {}
    }
    fetch();
    const interval = setInterval(fetch, 60000);
    return () => clearInterval(interval);
  }, [user]);

  return count;
}

export function BottomNav() {
  const [location] = useLocation();
  const { role } = useAuth();
  const unread = useUnreadCount();
  const [moreOpen, setMoreOpen] = useState(false);

  const primaryLinks = [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/subjects", label: "Learn", icon: BookOpen },
    { href: "/tasks", label: "Tasks", icon: CheckSquare },
    { href: "/pomodoro", label: "Focus", icon: Timer },
  ];

  const moreLinks = [
    { href: "/notes", label: "Notes", icon: FileText },
    { href: "/tracker", label: "Tracker", icon: LineChart },
    { href: "/profile", label: "Profile", icon: User },
    ...(role === "admin" || role === "super_admin"
      ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }]
      : []),
  ];

  const moreActive = moreLinks.some(
    (l) =>
      location === l.href ||
      (l.href !== "/dashboard" && location.startsWith(l.href + "/"))
  );

  return (
    <>
      <div className="h-16 border-t border-border bg-card/95 backdrop-blur-sm flex items-center justify-around px-2">
        {primaryLinks.map((link) => {
          const Icon = link.icon;
          const isActive =
            location === link.href ||
            (link.href !== "/dashboard" &&
              location.startsWith(link.href + "/"));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium truncate w-full text-center">{link.label}</span>
            </Link>
          );
        })}

        <button
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
            moreActive ? "text-primary" : "text-muted-foreground"
          )}
        >
          <div className="relative">
            <MoreHorizontal className="w-5 h-5" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-destructive rounded-full border border-card" />
            )}
          </div>
          <span className="text-[10px] font-medium">More</span>
        </button>
      </div>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <div className="pb-6">
            <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-6" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 px-1">
              More
            </p>
            <div className="grid grid-cols-3 gap-3">
              {moreLinks.map((link) => {
                const Icon = link.icon;
                const isActive =
                  location === link.href ||
                  (link.href !== "/dashboard" &&
                    location.startsWith(link.href + "/"));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMoreOpen(false)}
                  >
                    <div
                      className={cn(
                        "flex flex-col items-center gap-2.5 p-4 rounded-xl border transition-colors",
                        isActive
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      )}
                    >
                      <Icon className="w-6 h-6" />
                      <span className="text-xs font-medium text-center leading-tight truncate w-full">
                        {link.label}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
