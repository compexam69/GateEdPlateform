import { Link, useLocation } from "wouter";
import { BookOpen, Home, Timer, CheckSquare, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const [location] = useLocation();

  const links = [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/subjects", label: "Learn", icon: BookOpen },
    { href: "/tasks", label: "Tasks", icon: CheckSquare },
    { href: "/pomodoro", label: "Focus", icon: Timer },
    { href: "/profile", label: "Profile", icon: User },
  ];

  return (
    <div className="h-16 border-t border-border bg-card/95 backdrop-blur-sm flex items-center justify-around px-2">
      {links.map((link) => {
        const Icon = link.icon;
        const isActive = location === link.href || location.startsWith(link.href + "/");
        return (
          <Link key={link.href} href={link.href} className={cn(
            "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
            isActive ? "text-primary" : "text-muted-foreground"
          )}>
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{link.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
