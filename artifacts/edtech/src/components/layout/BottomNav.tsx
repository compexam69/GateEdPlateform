import { Link, useLocation } from "wouter";
import { BookOpen, Home, Timer, CheckSquare, User, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { getApiBase } from "@/lib/api";

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
  const unread = useUnreadCount();

  const links = [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/subjects", label: "Learn", icon: BookOpen },
    { href: "/tasks", label: "Tasks", icon: CheckSquare },
    { href: "/pomodoro", label: "Focus", icon: Timer },
    { href: "/profile", label: "Profile", icon: User },
  ];

  return (
    <div className="h-16 border-t border-border bg-card/95 backdrop-blur-sm flex items-center justify-around px-2">
      {links.map((link) => {
        const Icon = link.icon;
        const isActive = location === link.href || (link.href !== "/dashboard" && location.startsWith(link.href + "/"));
        return (
          <Link key={link.href} href={link.href} className={cn(
            "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
            isActive ? "text-primary" : "text-muted-foreground"
          )}>
            <div className="relative">
              <Icon className="w-5 h-5" />
              {link.href === "/profile" && unread > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-destructive rounded-full border border-card" />
              )}
            </div>
            <span className="text-[10px] font-medium">{link.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
