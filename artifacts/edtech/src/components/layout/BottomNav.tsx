import { Link, useLocation } from "wouter";
import {
  BookOpen, Home, Timer, CheckSquare,
  FileText, LineChart, User, ShieldCheck, LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent } from "@/components/ui/sheet";

/**
 * Mobile bottom navigation bar.
 *
 * Primary tabs (always visible): Home · Learn · Tasks · Focus · More
 *
 * The notification bell has moved to MobileHeader so it's always visible
 * regardless of which tab is active. "More" opens a bottom sheet with
 * secondary modules plus a prominent Profile shortcut.
 */
export function BottomNav() {
  const [location] = useLocation();
  const { role, user, avatarUrl } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "Student";
  const showImage = !!avatarUrl && !imgError;

  const primaryLinks = [
    { href: "/dashboard", label: "Home",  icon: Home },
    { href: "/subjects",  label: "Learn", icon: BookOpen },
    { href: "/tasks",     label: "Tasks", icon: CheckSquare },
    { href: "/pomodoro",  label: "Focus", icon: Timer },
  ];

  const moreLinks = [
    { href: "/notes",   label: "Notes",   icon: FileText },
    { href: "/tracker", label: "Tracker", icon: LineChart },
    ...(role === "admin" || role === "super_admin"
      ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }]
      : []),
  ];

  const isMoreActive =
    location === "/profile" ||
    moreLinks.some(
      (l) =>
        location === l.href ||
        (l.href !== "/dashboard" && location.startsWith(l.href + "/"))
    );

  return (
    <>
      {/* ── Bottom bar ────────────────────────────────────────────── */}
      <div className="h-16 border-t border-border bg-card/95 backdrop-blur-sm flex items-center justify-around px-1">
        {primaryLinks.map((link) => {
          const Icon = link.icon;
          const isActive =
            location === link.href ||
            (link.href !== "/dashboard" && location.startsWith(link.href + "/"));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{link.label}</span>
            </Link>
          );
        })}

        {/* More button */}
        <button
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors",
            isMoreActive ? "text-primary" : "text-muted-foreground"
          )}
        >
          <LayoutGrid className="w-5 h-5" />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </div>

      {/* ── "More" bottom sheet ───────────────────────────────────── */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl px-0">
          <div className="pb-6">
            {/* Drag handle */}
            <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-5 mt-1" />

            {/* Profile shortcut — tapping navigates to /profile */}
            <Link
              href="/profile"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/50 active:bg-muted transition-colors mx-2 rounded-xl"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 ring-1 ring-border overflow-hidden shrink-0 flex items-center justify-center">
                {showImage ? (
                  <img
                    key={avatarUrl}
                    src={avatarUrl!}
                    alt={firstName}
                    className="w-full h-full object-cover"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <span className="text-sm font-bold text-primary select-none">
                    {firstName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{user?.user_metadata?.full_name || "Student"}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {role === "super_admin" ? "Super Admin" : role === "admin" ? "Admin" : "Student"} · View profile
                </p>
              </div>
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
            </Link>

            <div className="h-px bg-border mx-5 my-3" />

            {/* Secondary navigation grid */}
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-5">
              More modules
            </p>
            <div className="grid grid-cols-3 gap-2.5 px-4">
              {moreLinks.map((link) => {
                const Icon = link.icon;
                const isActive =
                  location === link.href ||
                  (link.href !== "/dashboard" && location.startsWith(link.href + "/"));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMoreOpen(false)}
                  >
                    <div
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors",
                        isActive
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground active:bg-muted"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-medium text-center leading-tight">
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
