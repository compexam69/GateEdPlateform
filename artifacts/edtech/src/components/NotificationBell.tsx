import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { Bell, X, CheckCheck, Info, AlertCircle, Sparkles, UserCheck, BellOff, BellRing } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { getApiBase } from "@/lib/api";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface DropdownPos {
  top: number;
  left: number;
  maxHeight: number;
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(`${getApiBase()}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
  });
}

function typeIcon(type: string) {
  switch (type) {
    case "approval": return <UserCheck className="w-4 h-4 text-success" />;
    case "plan": return <Sparkles className="w-4 h-4 text-accent" />;
    case "warning": return <AlertCircle className="w-4 h-4 text-warning" />;
    default: return <Info className="w-4 h-4 text-primary" />;
  }
}

const DROPDOWN_WIDTH = 320;
const VIEWPORT_PAD = 8;

function calcDropdownPos(btn: HTMLButtonElement): DropdownPos {
  const rect = btn.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const top = rect.bottom + 6;

  // Prefer opening to the right of the button; clamp so it doesn't overflow
  let left = rect.left;
  if (left + DROPDOWN_WIDTH > vw - VIEWPORT_PAD) {
    // Not enough space to the right — align right edge to button right edge instead
    left = rect.right - DROPDOWN_WIDTH;
  }
  // Never go off-screen left
  left = Math.max(VIEWPORT_PAD, left);

  const maxHeight = Math.max(200, vh - top - VIEWPORT_PAD);

  return { top, left, maxHeight };
}

export function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const push = usePushNotifications();

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await apiFetch("/notifications");
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.notifications ?? []);
        setUnreadCount(json.unread_count ?? 0);
      }
    } catch {}
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    fetchNotifications();

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications(prev => [newNotif, ...prev]);
          setUnreadCount(c => c + 1);
        }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const updated = payload.new as Notification;
          setNotifications(prev => prev.map(n => n.id === updated.id ? updated : n));
          if (updated.is_read) setUnreadCount(c => Math.max(0, c - 1));
        }
      )
      .subscribe();

    const fallbackInterval = setInterval(fetchNotifications, 5 * 60 * 1000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(fallbackInterval);
    };
  }, [user, fetchNotifications]);

  // Recalculate position on open and on window resize
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    setPos(calcDropdownPos(buttonRef.current));

    function onResize() {
      if (buttonRef.current) setPos(calcDropdownPos(buttonRef.current));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) fetchNotifications();
  }

  async function markRead(id: string) {
    await apiFetch(`/notifications/${id}/read`, { method: "PATCH" });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
  }

  async function markAllRead() {
    await apiFetch("/notifications/read-all", { method: "PATCH" });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-destructive text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && pos && (
        <div
          ref={dropdownRef}
          role="dialog"
          aria-label="Notifications panel"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: DROPDOWN_WIDTH,
            maxHeight: pos.maxHeight,
            zIndex: 9999,
          }}
          className="flex flex-col bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="text-[10px] h-4 px-1.5">{unreadCount}</Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <CheckCheck className="w-3 h-3" /> All read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground ml-2"
                aria-label="Close notifications"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Push toggle */}
          {push.supported && push.permission !== "denied" && (
            <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {push.isSubscribed
                  ? <BellRing className="w-3.5 h-3.5 text-success shrink-0" />
                  : <BellOff className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                }
                <span className="text-xs text-muted-foreground truncate">
                  {push.isSubscribed ? "Push notifications on" : "Enable push notifications"}
                </span>
              </div>
              <button
                onClick={() => push.isSubscribed ? push.unsubscribe() : push.subscribe()}
                disabled={push.loading}
                className={cn(
                  "text-xs font-medium px-2.5 py-1 rounded-md shrink-0 transition-colors",
                  push.isSubscribed
                    ? "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    : "text-primary hover:bg-primary/10"
                )}
              >
                {push.loading ? "..." : push.isSubscribed ? "Turn off" : "Turn on"}
              </button>
            </div>
          )}

          {/* Notification list — scrollable, fills remaining height */}
          <div className="overflow-y-auto flex-1 min-h-0">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => { if (!n.is_read) markRead(n.id); }}
                  className={cn(
                    "flex gap-3 px-4 py-3 border-b border-border last:border-0 cursor-pointer hover:bg-muted/40 transition-colors",
                    !n.is_read && "bg-primary/5"
                  )}
                >
                  <div className="mt-0.5 shrink-0">{typeIcon(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium leading-tight", !n.is_read && "text-foreground")}>{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {!n.is_read && (
                    <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
