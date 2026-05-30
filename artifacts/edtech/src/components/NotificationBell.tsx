import { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { Bell, X, CheckCheck, Info, AlertCircle, Sparkles, UserCheck, BellOff, BellRing, Settings, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useNotificationStore, type Notification } from "@/store/notificationStore";
import { supabase } from "@/lib/supabase";

interface DropdownPos {
  top: number;
  left: number;
  maxHeight: number;
}

interface NotifPrefs {
  daily_plan: boolean;
  streak: boolean;
  exam_reminders: boolean;
}

const DEFAULT_PREFS: NotifPrefs = { daily_plan: true, streak: true, exam_reminders: true };

const PREF_OPTIONS: Array<{ key: keyof NotifPrefs; label: string; desc: string }> = [
  { key: "daily_plan",      label: "Daily Study Plan",  desc: "Notify when your smart study plan is generated" },
  { key: "streak",          label: "Streak Reminders",  desc: "Alert when your focus streak is about to break" },
  { key: "exam_reminders",  label: "Exam Reminders",    desc: "Reminders before scheduled tests start" },
];

function typeIcon(type: string) {
  switch (type) {
    case "approval": return <UserCheck className="w-4 h-4 text-success" />;
    case "plan":     return <Sparkles  className="w-4 h-4 text-accent" />;
    case "warning":  return <AlertCircle className="w-4 h-4 text-warning" />;
    default:         return <Info      className="w-4 h-4 text-primary" />;
  }
}

const DROPDOWN_WIDTH = 320;
const VIEWPORT_PAD   = 8;

function calcDropdownPos(btn: HTMLButtonElement): DropdownPos {
  const rect = btn.getBoundingClientRect();
  const vw   = window.innerWidth;
  const vh   = window.innerHeight;
  const top  = rect.bottom + 6;

  let left = rect.left;
  if (left + DROPDOWN_WIDTH > vw - VIEWPORT_PAD) {
    left = rect.right - DROPDOWN_WIDTH;
  }
  left = Math.max(VIEWPORT_PAD, left);

  const maxHeight = Math.max(200, vh - top - VIEWPORT_PAD);
  return { top, left, maxHeight };
}

export function NotificationBell() {
  const [open, setOpen]               = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pos, setPos]                 = useState<DropdownPos | null>(null);
  const buttonRef                     = useRef<HTMLButtonElement>(null);
  const dropdownRef                   = useRef<HTMLDivElement>(null);
  const push                          = usePushNotifications();

  const { notifications, unreadCount, loading, refresh, markRead, markAllRead } =
    useNotificationStore();

  // ── Notification preferences ────────────────────────────────────────────────
  const [notifPrefs, setNotifPrefs]   = useState<NotifPrefs>(DEFAULT_PREFS);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Load prefs from Supabase auth metadata whenever the settings panel opens
  useEffect(() => {
    if (!showSettings) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const raw = user.user_metadata?.notification_prefs as Partial<NotifPrefs> | undefined;
      setNotifPrefs({
        daily_plan:    raw?.daily_plan    ?? DEFAULT_PREFS.daily_plan,
        streak:        raw?.streak        ?? DEFAULT_PREFS.streak,
        exam_reminders: raw?.exam_reminders ?? DEFAULT_PREFS.exam_reminders,
      });
    });
  }, [showSettings]);

  const handlePrefChange = useCallback(async (key: keyof NotifPrefs, value: boolean) => {
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    setSavingPrefs(true);
    try {
      await supabase.auth.updateUser({ data: { notification_prefs: updated } });
    } catch {
      setNotifPrefs(notifPrefs);
    } finally {
      setSavingPrefs(false);
    }
  }, [notifPrefs]);

  // ── Position ────────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    setPos(calcDropdownPos(buttonRef.current));

    function onResize() {
      if (buttonRef.current) setPos(calcDropdownPos(buttonRef.current));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  // ── Outside click ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        buttonRef.current   && !buttonRef.current.contains(target)
      ) {
        setOpen(false);
        setShowSettings(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  // ── Escape key ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showSettings) { setShowSettings(false); return; }
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, showSettings]);

  function handleToggle() {
    const next = !open;
    setOpen(next);
    setShowSettings(false);
    if (next) {
      refresh();
      if (unreadCount > 0) markAllRead();
    }
  }

  function handleClose() {
    setOpen(false);
    setShowSettings(false);
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
          aria-label={showSettings ? "Notification settings" : "Notifications panel"}
          style={{
            position:  "fixed",
            top:       pos.top,
            left:      pos.left,
            width:     DROPDOWN_WIDTH,
            maxHeight: pos.maxHeight,
            zIndex:    9999,
          }}
          className="flex flex-col bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            {showSettings ? (
              <>
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                  aria-label="Back to notifications"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Notification Settings
                </button>
                <button
                  onClick={handleClose}
                  className="p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
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
                    onClick={() => setShowSettings(true)}
                    className="p-1 text-muted-foreground hover:text-foreground ml-1"
                    aria-label="Notification settings"
                    title="Notification settings"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleClose}
                    className="p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Close notifications"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ── Settings panel ── */}
          {showSettings && (
            <div className="overflow-y-auto flex-1 min-h-0">
              {/* Push Notifications */}
              <div className="px-4 pt-4 pb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  Browser Push
                </p>
                {!push.supported || push.permission === "denied" ? (
                  <div className="flex items-start gap-2.5 py-2">
                    <BellOff className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Push Notifications</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {push.permission === "denied"
                          ? "Blocked in browser settings — allow notifications to enable"
                          : "Not supported in this browser"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {push.isSubscribed
                        ? <BellRing className="w-4 h-4 text-success shrink-0" />
                        : <BellOff  className="w-4 h-4 text-muted-foreground shrink-0" />
                      }
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Push Notifications</p>
                        <p className="text-xs text-muted-foreground">
                          {push.isSubscribed ? "Enabled for this device" : "Get alerts even when app is closed"}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={push.isSubscribed}
                      onCheckedChange={() => push.isSubscribed ? push.unsubscribe() : push.subscribe()}
                      disabled={push.loading}
                      aria-label="Toggle push notifications"
                    />
                  </div>
                )}
              </div>

              <div className="mx-4 border-t border-border my-2" />

              {/* In-app preference toggles */}
              <div className="px-4 pb-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  Alert Preferences
                </p>
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                  System alerts (account approved, email verification) cannot be disabled.
                </p>
                <div className="space-y-4">
                  {PREF_OPTIONS.map(opt => (
                    <div key={opt.key} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{opt.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                      </div>
                      <Switch
                        checked={notifPrefs[opt.key]}
                        onCheckedChange={v => handlePrefChange(opt.key, v)}
                        disabled={savingPrefs}
                        aria-label={opt.label}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Notifications list (when not in settings) ── */}
          {!showSettings && (
            <>
              {/* Push quick-status strip */}
              {push.supported && push.permission !== "denied" && (
                <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {push.isSubscribed
                      ? <BellRing className="w-3.5 h-3.5 text-success shrink-0" />
                      : <BellOff  className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
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

              {/* Notification list — scrollable */}
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
                  notifications.map((n: Notification) => (
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
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug break-words">{n.message}</p>
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
            </>
          )}
        </div>
      )}
    </>
  );
}
