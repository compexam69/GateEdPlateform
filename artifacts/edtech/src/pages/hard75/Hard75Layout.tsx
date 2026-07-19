import { ReactNode, useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, CheckSquare, Droplets, Dumbbell, BookOpen,
  Salad, Camera, BookMarked, CalendarDays, BarChart2,
  Ruler, Trophy, FileText, Settings, ChevronRight, Menu, X,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";

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
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openDrawer  = useCallback(() => setDrawerOpen(true),  []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const activeNav = HARD75_NAV.find(n => n.href === location);

  return (
    <AppLayout fullHeight={fullHeight}>
      <div className="flex flex-col h-full -mx-4 md:-mx-8 -my-6 md:-my-8">

        {/* ── Mobile sub-header (< md) ─────────────────────────────────────── */}
        <div className="md:hidden bg-card border-b border-border px-3 py-2 flex items-center justify-between shrink-0 min-h-[52px]">
          {/* Left: module badge + current page name */}
          <div className="flex items-center gap-2 min-w-0">
            <Trophy className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-semibold truncate">
              {activeNav?.label ?? "75 Hard"}
            </span>
          </div>

          {/* Right: hamburger button — same position & size as the old button */}
          <button
            onClick={openDrawer}
            aria-label="Open 75 Hard navigation"
            aria-expanded={drawerOpen}
            aria-controls="hard75-nav-drawer"
            className="flex items-center justify-center w-11 h-11 rounded-xl text-foreground hover:bg-muted active:bg-muted/70 transition-colors shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* ── Desktop horizontal tab nav (≥ md) ───────────────────────────── */}
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

        {/* ── Right-side navigation drawer (mobile only) ───────────────────── */}
        <Sheet open={drawerOpen} onOpenChange={(v) => { if (!v) closeDrawer(); }}>
          <SheetContent
            id="hard75-nav-drawer"
            side="right"
            className="w-72 sm:w-80 p-0 flex flex-col md:hidden"
          >
            {/* Accessibility */}
            <SheetTitle className="sr-only">75 Hard navigation</SheetTitle>
            <SheetDescription className="sr-only">
              Navigate between 75 Hard challenge sections
            </SheetDescription>

            {/* ── Drawer header ── */}
            <div className="flex items-center justify-between px-4 pt-5 pb-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Trophy className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold leading-tight">75 Hard</p>
                  <p className="text-xs text-muted-foreground leading-tight">Challenge</p>
                </div>
              </div>
              <button
                onClick={closeDrawer}
                aria-label="Close navigation"
                className="flex items-center justify-center w-11 h-11 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/70 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── Nav items ── */}
            <nav
              aria-label="75 Hard sections"
              className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5"
            >
              {HARD75_NAV.map(({ href, label, icon: Icon }) => {
                const isActive = location === href;
                return (
                  <Link key={href} href={href} onClick={closeDrawer}>
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer min-h-[48px]",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/70"
                      )}
                    >
                      <Icon className={cn(
                        "w-4 h-4 shrink-0",
                        isActive ? "text-primary-foreground" : "text-muted-foreground"
                      )} />
                      <span className="truncate">{label}</span>
                      {isActive && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-foreground shrink-0" />
                      )}
                    </div>
                  </Link>
                );
              })}
            </nav>

            {/* ── Drawer footer ── */}
            <div className="px-4 pb-6 pt-3 border-t border-border shrink-0">
              <p className="text-xs text-muted-foreground text-center">
                {HARD75_NAV.length} sections
              </p>
            </div>
          </SheetContent>
        </Sheet>

        {/* ── Page content ─────────────────────────────────────────────────── */}
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
