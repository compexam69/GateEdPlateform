import { ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { PomodoroWidget } from "@/components/PomodoroWidget";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationStore } from "@/store/notificationStore";

// ── Tab title helpers ────────────────────────────────────────────────────────
const APP_NAME = "GateED";
const DEFAULT_TITLE = "EdTech Study Platform";

const EXACT_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/subjects":  "Subjects",
  "/notes":     "Notes",
  "/pomodoro":  "Pomodoro",
  "/tasks":     "Tasks",
  "/tracker":   "Test Tracker",
  "/profile":   "Profile",
  "/admin":              "Admin",
  "/admin/users":        "Admin — Users",
  "/admin/subjects":     "Admin — Content",
  "/admin/quizzes":      "Admin — Quizzes",
  "/admin/analytics":    "Admin — Analytics",
  "/admin/gate":         "Admin — Gate Config",
  "/admin/rate-limits":  "Admin — Rate Limits",
};

function pageLabel(location: string): string {
  if (EXACT_TITLES[location]) return EXACT_TITLES[location];
  if (location.startsWith("/subjects/"))      return "Subjects";
  if (location.startsWith("/chapters/"))      return "Chapter";
  if (location.startsWith("/topics/"))        return "Topic";
  if (location.startsWith("/exam/results/"))  return "Exam Results";
  if (location.startsWith("/exam/"))          return "Exam";
  return APP_NAME;
}
// ────────────────────────────────────────────────────────────────────────────

export function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [location] = useLocation();
  const { unreadCount } = useNotificationStore();

  // Manage the shared notification connection: one realtime channel + one
  // fallback interval for the entire authenticated session.
  useEffect(() => {
    const store = useNotificationStore.getState();
    if (user?.id) {
      store.connect(user.id);
    } else {
      store.disconnect();
    }
  }, [user?.id]);

  // Keep the browser tab title in sync with the current page and unread count.
  // Format: "(3) Dashboard — GateED"  |  "Dashboard — GateED"
  // Restores the default HTML title when AppLayout unmounts (i.e. on sign-out).
  useEffect(() => {
    const label = pageLabel(location);
    const badge = unreadCount > 0
      ? `(${unreadCount > 99 ? "99+" : unreadCount}) `
      : "";
    document.title = `${badge}${label} — ${APP_NAME}`;
    return () => { document.title = DEFAULT_TITLE; };
  }, [location, unreadCount]);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
          {children}
        </div>
      </main>

      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
        <BottomNav />
      </div>

      <PomodoroWidget />
    </div>
  );
}
