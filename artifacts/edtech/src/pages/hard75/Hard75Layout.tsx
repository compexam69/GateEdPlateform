import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, CheckSquare, Droplets, Dumbbell, BookOpen,
  Salad, Camera, BookMarked, CalendarDays, BarChart2,
  Ruler, Trophy, FileText, Settings, ChevronRight, LayoutGrid, X,
} from "lucide-react";

export const HARD75_NAV = [
  { href: "/75hard",              label: "Dashboard",            icon: LayoutDashboard },
  { href: "/75hard/tasks",        label: "Today's Tasks",        icon: CheckSquare },
  { href: "/75hard/water",        label: "Water",                icon: Droplets },
  { href: "/75hard/workout",      label: "Workout",              icon: Dumbbell },
  { href: "/75hard/reading",      label: "Reading",              icon: BookOpen },
  { href: "/75hard/diet",         label: "Diet",                 icon: Salad },
  { href: "/75hard/photos",       label: "Progress Photos",      icon: Camera },
  { href: "/75hard/journal",      label: "Daily Journal",        icon: BookMarked },
  { href: "/75hard/calendar",     label: "Calendar",             icon: CalendarDays },
  { href: "/75hard/analytics",    label: "Analytics",            icon: BarChart2 },
  { href: "/75hard/goals",        label: "Goals & Measurements", icon: Ruler },
  { href: "/75hard/achievements", label: "Achievements",         icon: Trophy },
  { href: "/75hard/reports",      label: "Reports",              icon: FileText },
  { href: "/75hard/settings",     label: "Settings",             icon: Settings },
] as const;

interface Props {
  children: ReactNode;
  fullHeight?: boolean;
}

export function Hard75Layout({ children, fullHeight }: Props) {
  const [location] = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeNav = HARD75_NAV.find(n => n.href === location);

  return (
    <AppLayout fullHeight={fullHeight}>
      <div className="flex flex-col h-full -mx-4 md:-mx-8 -my-6 md:-my-8">

        {/* ── Mobile sub-header (< md) ── */}
        <div className="md:hidden bg-card border-b border-border px-4 py-2.5 flex items-center justify-between shrink-0 min-h-[52px]">
          <div className="flex items-center gap-2 min-w-0">
            <Trophy className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-semibold truncate">
              {activeNav?.label ?? "75 Hard"}
            </span>
          </div>
          <button
            onClick={() => setMobileNavOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted/70 text-xs font-medium text-muted-foreground active:bg-muted shrink-0 min-h-[44px]"
            aria-label="Open navigation"
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden xs:inline">All</span>
          </button>
        </div>

        {/* ── Desktop horizontal tab nav (≥ md) ── */}
        <div className="hidden md:block bg-card border-b border-border shrink-0 overflow-x-auto scrollbar-none">
          <nav className="flex gap-0.5 px-4 py-1.5 min-w-max">
            {HARD75_NAV.map(({ href, label, icon: Icon }) => {
              const isActive = location === href;
              return (
                <Link key={href} href={href}>
                  <div className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}>
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Desktop breadcrumb (≥ md) */}
        <div className="hidden md:flex bg-card/50 border-b border-border px-8 py-2 items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Trophy className="w-3 h-3 text-primary" />
            75 Hard Challenge
          </span>
          {location !== "/75hard" && (
            <>
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">
                {activeNav?.label ?? ""}
              </span>
            </>
          )}
        </div>

        {/* ── Mobile nav bottom sheet ── */}
        {mobileNavOpen && (
          <>
            {/* Backdrop */}
            <div
              className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
              aria-hidden="true"
            />
            {/* Sheet */}
            <div className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-2xl shadow-2xl">
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              {/* Sheet header */}
              <div className="flex items-center justify-between px-4 pb-3 pt-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">75 Hard Challenge</span>
                </div>
                <button
                  onClick={() => setMobileNavOpen(false)}
                  className="p-2 rounded-xl hover:bg-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="Close navigation"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {/* Nav grid */}
              <div className="grid grid-cols-3 gap-2 p-4 overflow-y-auto max-h-[60vh]">
                {HARD75_NAV.map(({ href, label, icon: Icon }) => {
                  const isActive = location === href;
                  return (
                    <Link key={href} href={href}>
                      <div
                        onClick={() => setMobileNavOpen(false)}
                        className={cn(
                          "flex flex-col items-center gap-2 p-3 rounded-xl text-center cursor-pointer transition-colors min-h-[72px] justify-center",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/50 hover:bg-muted text-muted-foreground active:bg-muted"
                        )}
                      >
                        <Icon className="w-5 h-5 shrink-0" />
                        <span className="text-[11px] leading-tight font-medium">{label}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
              {/* Safe area bottom padding */}
              <div className="h-6" />
            </div>
          </>
        )}

        {/* ── Page content ── */}
        <div className={cn(
          "flex-1 overflow-y-auto",
          fullHeight ? "overflow-hidden flex flex-col" : ""
        )}>
          <div className={cn(
            "mx-auto max-w-5xl w-full",
            fullHeight ? "h-full flex flex-col p-4 md:p-8" : "px-4 py-5 md:px-8 md:py-8"
          )}>
            {children}
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
