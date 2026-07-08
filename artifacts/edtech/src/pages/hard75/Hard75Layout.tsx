import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, CheckSquare, Droplets, Dumbbell, BookOpen,
  Salad, Camera, BookMarked, CalendarDays, BarChart2,
  Ruler, Trophy, FileText, Settings, ChevronRight,
} from "lucide-react";

export const HARD75_NAV = [
  { href: "/75hard",              label: "Dashboard",         icon: LayoutDashboard },
  { href: "/75hard/tasks",        label: "Today's Tasks",     icon: CheckSquare },
  { href: "/75hard/water",        label: "Water",             icon: Droplets },
  { href: "/75hard/workout",      label: "Workout",           icon: Dumbbell },
  { href: "/75hard/reading",      label: "Reading",           icon: BookOpen },
  { href: "/75hard/diet",         label: "Diet",              icon: Salad },
  { href: "/75hard/photos",       label: "Progress Photos",   icon: Camera },
  { href: "/75hard/journal",      label: "Daily Journal",     icon: BookMarked },
  { href: "/75hard/calendar",     label: "Calendar",          icon: CalendarDays },
  { href: "/75hard/analytics",    label: "Analytics",         icon: BarChart2 },
  { href: "/75hard/goals",        label: "Goals & Measurements", icon: Ruler },
  { href: "/75hard/achievements", label: "Achievements",      icon: Trophy },
  { href: "/75hard/reports",      label: "Reports",           icon: FileText },
  { href: "/75hard/settings",     label: "Settings",          icon: Settings },
] as const;

interface Props {
  children: ReactNode;
  fullHeight?: boolean;
}

export function Hard75Layout({ children, fullHeight }: Props) {
  const [location] = useLocation();

  return (
    <AppLayout fullHeight={fullHeight}>
      <div className="flex flex-col h-full -mx-4 md:-mx-8 -my-6 md:-my-8">
        {/* Sub-header: module title + breadcrumb */}
        <div className="bg-card border-b border-border px-4 md:px-8 py-3 flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5 text-primary" />
            75 Hard Challenge
          </span>
          {location !== "/75hard" && (
            <>
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">
                {HARD75_NAV.find(n => n.href === location)?.label ?? ""}
              </span>
            </>
          )}
        </div>

        {/* Horizontal scrollable tab nav */}
        <div className="bg-card border-b border-border shrink-0 overflow-x-auto scrollbar-none">
          <nav className="flex gap-0.5 px-2 md:px-4 py-1.5 min-w-max">
            {HARD75_NAV.map(({ href, label, icon: Icon }) => {
              const isActive = location === href;
              return (
                <Link key={href} href={href}>
                  <div className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer",
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

        {/* Page content */}
        <div className={cn(
          "flex-1 overflow-y-auto",
          fullHeight ? "overflow-hidden flex flex-col" : ""
        )}>
          <div className={cn(
            "mx-auto max-w-5xl w-full",
            fullHeight ? "h-full flex flex-col p-4 md:p-8" : "px-4 py-6 md:px-8 md:py-8"
          )}>
            {children}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
