import { ReactNode, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { MobileHeader } from "./MobileHeader";
import { MobileDrawer } from "./MobileDrawer";
import { PomodoroWidget } from "@/components/PomodoroWidget";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationStore } from "@/store/notificationStore";

// ── Tab title helpers ────────────────────────────────────────────────────────
const APP_NAME = "GateED";
const DEFAULT_TITLE = "EdTech Study Platform";

const EXACT_TITLES: Record<string, string> = {
  "/dashboard":          "Dashboard",
  "/subjects":           "Subjects",
  "/notes":              "Notes",
  "/pomodoro":           "Pomodoro",
  "/tasks":              "Tasks",
  "/tracker":            "Test Tracker",
  "/profile":            "Profile",
  "/admin":              "Admin",
  "/admin/users":        "Admin — Users",
  "/admin/subjects":     "Admin — Content",
  "/admin/quizzes":      "Admin — Quizzes",
  "/admin/analytics":    "Admin — Analytics",
  "/admin/gate":         "Admin — Gate Config",
  "/admin/rate-limits":  "Admin — Rate Limits",
  "/admin/content-access": "Admin — Content Access",
};

function pageLabel(location: string): string {
  if (EXACT_TITLES[location]) return EXACT_TITLES[location];
  if (location.startsWith("/subjects/"))     return "Subjects";
  if (location.startsWith("/chapters/"))     return "Chapter";
  if (location.startsWith("/topics/"))       return "Topic";
  if (location.startsWith("/exam/results/")) return "Exam Results";
  if (location.startsWith("/exam/"))         return "Exam";
  return APP_NAME;
}
// ────────────────────────────────────────────────────────────────────────────

export function AppLayout({ children, fullHeight = false }: { children: ReactNode; fullHeight?: boolean }) {
  const { user } = useAuth();
  const [location] = useLocation();
  const { unreadCount } = useNotificationStore();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Notification channel ────────────────────────────────────────────────
  useEffect(() => {
    const store = useNotificationStore.getState();
    if (user?.id) {
      store.connect(user.id);
    } else {
      store.disconnect();
    }
  }, [user?.id]);

  // ── Tab title ───────────────────────────────────────────────────────────
  useEffect(() => {
    const label = pageLabel(location);
    const badge = unreadCount > 0
      ? `(${unreadCount > 99 ? "99+" : unreadCount}) `
      : "";
    document.title = `${badge}${label} — ${APP_NAME}`;
    return () => { document.title = DEFAULT_TITLE; };
  }, [location, unreadCount]);

  // ── Left-edge swipe-to-open gesture ────────────────────────────────────
  // Detects a finger starting within 20px of the left edge and dragging
  // at least 60px to the right — opens the drawer without blocking scrolling.
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      swipeStartX.current = e.touches[0].clientX;
      swipeStartY.current = e.touches[0].clientY;
    }
    function onTouchEnd(e: TouchEvent) {
      const dx = e.changedTouches[0].clientX - swipeStartX.current;
      const dy = Math.abs(e.changedTouches[0].clientY - swipeStartY.current);
      // Only fire when swipe starts from left edge AND moves right more than down
      if (swipeStartX.current <= 20 && dx >= 60 && dy < dx) {
        setDrawerOpen(true);
      }
    }
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">

      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile top header + slide-out drawer — hidden on desktop */}
      <MobileHeader onMenuClick={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Main content
          • pt-14 on mobile to clear the fixed MobileHeader (56px)
          • pb-20 on mobile to clear the fixed BottomNav (80px)
          • fullHeight: overflow-hidden + no py so page fills exact viewport
          • Desktop padding handled by flex sidebar layout */}
      <main className={
        fullHeight
          ? "flex-1 overflow-hidden flex flex-col pt-14 pb-16 md:pt-0 md:pb-0"
          : "flex-1 overflow-y-auto pt-14 pb-20 md:pt-0 md:pb-0"
      }>
        <div className={
          fullHeight
            ? "h-full flex flex-col px-4 md:px-8"
            : "mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8"
        }>
          {children}
        </div>
      </main>

      {/* Mobile bottom nav — hidden on desktop */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
        <BottomNav />
      </div>

      <PomodoroWidget />
    </div>
  );
}
