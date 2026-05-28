import { Link, useLocation } from "wouter";
import { Menu, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";

interface Props {
  onMenuClick: () => void;
}

// ── Header behaviour per route ────────────────────────────────────────────────
// Each entry is checked top-to-bottom; first match wins.
// `back: null`          → no back button (root page)
// `back: { href }`      → navigate to explicit parent
// `back: { goBack }`    → browser history back (dynamic/nested pages)
// `title: null`         → no centred title

type BackTarget = { href: string } | { goBack: true };

type HeaderBehavior = {
  title: string | null;
  back: BackTarget | null;
  /** Whether the page is drawer-only (hamburger turns indigo, avatar ring thickens) */
  drawerRoute: boolean;
};

const ROUTE_BEHAVIORS: Array<{
  test: (loc: string) => boolean;
  behavior: HeaderBehavior;
}> = [
  // ── Admin sub-pages (more specific first) ───────────────────────────────
  { test: l => l === "/admin/users",        behavior: { title: "Users",        back: { href: "/admin" }, drawerRoute: true } },
  { test: l => l === "/admin/subjects",     behavior: { title: "Content",      back: { href: "/admin" }, drawerRoute: true } },
  { test: l => l === "/admin/quizzes",      behavior: { title: "Quizzes",      back: { href: "/admin" }, drawerRoute: true } },
  { test: l => l === "/admin/analytics",   behavior: { title: "Analytics",    back: { href: "/admin" }, drawerRoute: true } },
  { test: l => l === "/admin/gate",         behavior: { title: "Gate Config",  back: { href: "/admin" }, drawerRoute: true } },
  { test: l => l === "/admin/rate-limits",  behavior: { title: "Rate Limits",  back: { href: "/admin" }, drawerRoute: true } },
  { test: l => l === "/admin",              behavior: { title: "Admin",        back: null,               drawerRoute: true } },

  // ── Drawer root pages ────────────────────────────────────────────────────
  { test: l => l === "/notes"   || l.startsWith("/notes/"),   behavior: { title: "Notes",        back: null, drawerRoute: true } },
  { test: l => l === "/tracker" || l.startsWith("/tracker/"), behavior: { title: "Test Tracker", back: null, drawerRoute: true } },
  { test: l => l === "/profile" || l.startsWith("/profile/"), behavior: { title: "Profile",      back: null, drawerRoute: true } },

  // ── Learning-path sub-pages (back replaces hamburger) ────────────────────
  // Exam results before exam so `/exam/results/…` doesn't match `/exam/…`
  { test: l => l.startsWith("/exam/results/"),  behavior: { title: "Results",  back: { goBack: true }, drawerRoute: false } },
  // Active exam — no back button (prevent accidental exit), no title clutter
  { test: l => l.startsWith("/exam/"),          behavior: { title: null,       back: null,              drawerRoute: false } },
  { test: l => l.startsWith("/topics/"),        behavior: { title: "Topic",    back: { goBack: true }, drawerRoute: false } },
  { test: l => l.startsWith("/chapters/"),      behavior: { title: "Chapter",  back: { goBack: true }, drawerRoute: false } },
  { test: l => l.startsWith("/subjects/"),      behavior: { title: "Subjects", back: { href: "/subjects" }, drawerRoute: false } },
];

const DEFAULT_BEHAVIOR: HeaderBehavior = { title: null, back: null, drawerRoute: false };

function getHeaderBehavior(location: string): HeaderBehavior {
  return ROUTE_BEHAVIORS.find(({ test }) => test(location))?.behavior ?? DEFAULT_BEHAVIOR;
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fixed top header — mobile only (hidden on md+).
 *
 * Left:   hamburger (root pages) OR back chevron (sub-pages)
 * Centre: page title, shown on drawer pages and learning-path sub-pages
 * Right:  notification bell + avatar shortcut
 */
export function MobileHeader({ onMenuClick }: Props) {
  const { user, avatarUrl } = useAuth();
  const [location, navigate] = useLocation();
  const [imgError, setImgError] = useState(false);

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "S";
  const showImage = !!avatarUrl && !imgError;

  const { title, back, drawerRoute } = getHeaderBehavior(location);

  function handleBack() {
    if (!back) return;
    if ("href" in back) {
      navigate(back.href);
    } else {
      window.history.back();
    }
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-card border-b border-border flex items-center justify-between px-3 md:hidden">

      {/* Left control: back chevron on sub-pages, hamburger on root pages */}
      {back ? (
        <button
          onClick={handleBack}
          className="p-2 rounded-lg text-foreground hover:bg-muted transition-colors active:opacity-70 shrink-0"
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      ) : (
        <button
          onClick={onMenuClick}
          className={cn(
            "p-2 rounded-lg transition-colors active:opacity-70 shrink-0",
            drawerRoute
              ? "text-primary hover:bg-primary/10"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Centred page title — fades in when a title is defined */}
      <span
        className={cn(
          "absolute left-1/2 -translate-x-1/2 text-sm font-semibold tracking-tight pointer-events-none select-none transition-all duration-200",
          title ? "opacity-100 text-foreground" : "opacity-0"
        )}
        aria-hidden={!title}
      >
        {title}
      </span>

      {/* Right: notification bell + avatar */}
      <div className="flex items-center gap-0.5 shrink-0">
        <NotificationBell />

        <Link href="/profile">
          <div
            className={cn(
              "ml-1 w-8 h-8 rounded-full overflow-hidden flex items-center justify-center active:opacity-70 transition-all cursor-pointer",
              drawerRoute
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
