import { Link, useLocation } from "wouter";
import { Menu } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";

interface Props {
  onMenuClick: () => void;
}

/**
 * Routes reachable only via the slide-out drawer (not in BottomNav).
 * Each entry maps a path prefix to the title shown in the header centre.
 */
const DRAWER_ROUTE_TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: "/admin/users",        title: "Users" },
  { prefix: "/admin/subjects",     title: "Content" },
  { prefix: "/admin/quizzes",      title: "Quizzes" },
  { prefix: "/admin/analytics",    title: "Analytics" },
  { prefix: "/admin/gate",         title: "Gate Config" },
  { prefix: "/admin/rate-limits",  title: "Rate Limits" },
  { prefix: "/admin",              title: "Admin" },
  { prefix: "/notes",              title: "Notes" },
  { prefix: "/tracker",            title: "Test Tracker" },
  { prefix: "/profile",            title: "Profile" },
];

function getDrawerTitle(location: string): string | null {
  for (const { prefix, title } of DRAWER_ROUTE_TITLES) {
    if (location === prefix || location.startsWith(prefix + "/")) return title;
  }
  return null;
}

/**
 * Fixed top header — mobile only (hidden on md+).
 *
 * Left:   hamburger → opens MobileDrawer (turns indigo on drawer pages)
 * Centre: page title, shown only when on a drawer-only route
 * Right:  notification bell + avatar shortcut
 */
export function MobileHeader({ onMenuClick }: Props) {
  const { user, avatarUrl } = useAuth();
  const [location] = useLocation();
  const [imgError, setImgError] = useState(false);

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "S";
  const showImage = !!avatarUrl && !imgError;

  const pageTitle = getDrawerTitle(location);
  const isDrawerRoute = pageTitle !== null;

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-card border-b border-border flex items-center justify-between px-3 md:hidden">

      {/* Hamburger */}
      <button
        onClick={onMenuClick}
        className={cn(
          "relative p-2 rounded-lg transition-colors active:opacity-70 shrink-0",
          isDrawerRoute
            ? "text-primary hover:bg-primary/10"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
        aria-label="Open navigation menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Centred page title — fades in on drawer-only routes.
          Uses absolute positioning so it stays truly centred regardless
          of the varying widths of the left and right controls. */}
      <span
        className={cn(
          "absolute left-1/2 -translate-x-1/2 text-sm font-semibold tracking-tight pointer-events-none select-none transition-all duration-200",
          isDrawerRoute
            ? "opacity-100 text-foreground"
            : "opacity-0"
        )}
        aria-hidden={!isDrawerRoute}
      >
        {pageTitle}
      </span>

      {/* Right side: notification bell + avatar */}
      <div className="flex items-center gap-0.5 shrink-0">
        <NotificationBell />

        <Link href="/profile">
          <div
            className={cn(
              "ml-1 w-8 h-8 rounded-full overflow-hidden flex items-center justify-center active:opacity-70 transition-all cursor-pointer",
              isDrawerRoute
                ? "ring-2 ring-primary bg-primary/10"
                : "ring-1 ring-border bg-primary/10"
            )}
          >
            {showImage ? (
              <img
                key={avatarUrl}
                src={avatarUrl}
                alt={firstName}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <span className="text-xs font-bold text-primary select-none">
                {firstName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        </Link>
      </div>
    </header>
  );
}
