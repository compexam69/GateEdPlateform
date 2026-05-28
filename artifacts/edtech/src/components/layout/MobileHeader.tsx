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
 * Routes that are only reachable via the slide-out drawer (not in BottomNav).
 * When the user is on one of these pages, the hamburger shows an indigo dot so
 * they always know which navigation tier is "active".
 */
const DRAWER_ONLY_PREFIXES = [
  "/notes",
  "/tracker",
  "/profile",
  "/admin",
];

/**
 * Fixed top header shown only on mobile (hidden on md+).
 * Left:  hamburger → opens the slide-out MobileDrawer
 *          · shows an indigo dot when current page is drawer-only
 * Right: notification bell + avatar (taps to /profile)
 */
export function MobileHeader({ onMenuClick }: Props) {
  const { user, avatarUrl } = useAuth();
  const [location] = useLocation();
  const [imgError, setImgError] = useState(false);

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "S";
  const showImage = !!avatarUrl && !imgError;

  const isDrawerRoute = DRAWER_ONLY_PREFIXES.some(
    (prefix) => location === prefix || location.startsWith(prefix + "/")
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-card border-b border-border flex items-center justify-between px-3 md:hidden">

      {/* Hamburger — opens the left-side drawer.
          The dot signals "your current page lives in the drawer". */}
      <button
        onClick={onMenuClick}
        className={cn(
          "relative p-2 rounded-lg transition-colors active:opacity-70",
          isDrawerRoute
            ? "text-primary hover:bg-primary/10"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
        aria-label="Open navigation menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Right side: notification bell + avatar shortcut */}
      <div className="flex items-center gap-0.5">
        <NotificationBell />

        {/* Avatar taps to Profile */}
        <Link href="/profile">
          <div
            className={cn(
              "ml-1 w-8 h-8 rounded-full overflow-hidden flex items-center justify-center active:opacity-70 transition-opacity cursor-pointer",
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
