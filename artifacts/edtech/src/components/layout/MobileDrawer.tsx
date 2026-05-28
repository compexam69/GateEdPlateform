import { Link, useLocation } from "wouter";
import {
  BookOpen, Home, Timer, CheckSquare,
  FileText, LineChart, Settings, ShieldCheck, LogOut,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  Sheet, SheetContent, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard",     icon: Home },
  { href: "/subjects",  label: "Learning Path",  icon: BookOpen },
  { href: "/tasks",     label: "Planner",        icon: CheckSquare },
  { href: "/pomodoro",  label: "Focus Timer",    icon: Timer },
  { href: "/notes",     label: "Notes",          icon: FileText },
  { href: "/tracker",   label: "Tracker",        icon: LineChart },
  { href: "/profile",   label: "Profile",        icon: Settings },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Full-height left-edge slide-out drawer for mobile.
 * Mirrors the desktop sidebar — same links, same avatar chip, sign-out button.
 * Opened via the hamburger in MobileHeader or a left-edge swipe gesture
 * (swipe detection lives in AppLayout).
 */
export function MobileDrawer({ open, onClose }: Props) {
  const [location] = useLocation();
  const { user, role, avatarUrl, signOut } = useAuth();
  const [imgError, setImgError] = useState(false);

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "Student";
  const showImage = !!avatarUrl && !imgError;

  const links = [
    ...NAV_LINKS,
    ...(role === "admin" || role === "super_admin"
      ? [{ href: "/admin", label: "Admin Panel", icon: ShieldCheck }]
      : []),
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="left" className="w-72 p-0 flex flex-col md:hidden">
        {/* Accessibility: visible only to screen readers */}
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <SheetDescription className="sr-only">Main navigation links and user profile</SheetDescription>

        {/* ── App logo ─────────────────────────────────────────── */}
        <div className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-2 text-primary font-bold mb-4 select-none">
            <BookOpen className="w-5 h-5" />
            <span className="text-base tracking-tight">EdTech</span>
          </div>

          {/* User profile chip — taps to profile page */}
          <Link href="/profile" onClick={onClose}>
            <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted active:bg-muted/70 transition-colors cursor-pointer">
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
                <p className="text-sm font-semibold truncate">
                  {user?.user_metadata?.full_name || "Student"}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {role === "super_admin"
                    ? "Super Admin"
                    : role === "admin"
                    ? "Admin"
                    : "Student"}
                </p>
              </div>
            </div>
          </Link>
        </div>

        {/* ── Nav links ─────────────────────────────────────────── */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive =
              location === link.href ||
              (link.href !== "/dashboard" &&
                location.startsWith(link.href + "/"));
            return (
              <Link key={link.href} href={link.href} onClick={onClose}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm",
                    isActive
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/70"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{link.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* ── Sign out ──────────────────────────────────────────── */}
        <div className="p-3 border-t border-border">
          <button
            onClick={() => { onClose(); signOut(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/70 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
