import { Link, useLocation } from "wouter";
import { BookOpen, Home, Timer, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mobile bottom navigation bar — 4 primary tabs only.
 *
 * Overflow/secondary navigation (Notes, Tracker, Profile, Admin, Sign out)
 * is handled exclusively by the slide-out MobileDrawer, opened via the
 * hamburger in MobileHeader or a left-edge swipe gesture.
 */

const PRIMARY_LINKS = [
  { href: "/dashboard", label: "Home",  icon: Home },
  { href: "/subjects",  label: "Learn", icon: BookOpen },
  { href: "/tasks",     label: "Tasks", icon: CheckSquare },
  { href: "/pomodoro",  label: "Focus", icon: Timer },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    <div className="h-16 border-t border-border bg-card/95 backdrop-blur-sm flex items-center px-1">
      {PRIMARY_LINKS.map(({ href, label, icon: Icon }) => {
        const isActive =
          location === href ||
          (href !== "/dashboard" && location.startsWith(href + "/"));

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors",
              isActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
