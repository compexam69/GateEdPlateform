import { Link, useLocation } from "wouter";
import { BookOpen, Home, Settings, Timer, CheckSquare, LineChart, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

export function Sidebar() {
  const [location] = useLocation();
  const { role } = useAuth();

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: Home },
    { href: "/subjects", label: "Learning Path", icon: BookOpen },
    { href: "/tasks", label: "Planner", icon: CheckSquare },
    { href: "/pomodoro", label: "Focus Timer", icon: Timer },
    { href: "/notes", label: "Notes", icon: FileText },
    { href: "/tracker", label: "Tracker", icon: LineChart },
    { href: "/profile", label: "Profile", icon: Settings },
  ];

  if (role === 'admin' || role === 'super_admin') {
    links.push({ href: "/admin", label: "Admin Panel", icon: Settings });
  }

  return (
    <div className="w-64 h-full border-r border-border bg-card flex flex-col">
      <div className="p-6">
        <h1 className="text-xl font-bold text-primary flex items-center gap-2">
          <BookOpen className="w-6 h-6" />
          <span>EdTech</span>
        </h1>
      </div>
      <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location === link.href || location.startsWith(link.href + "/");
          return (
            <Link key={link.href} href={link.href} className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors",
              isActive 
                ? "bg-primary text-primary-foreground font-medium" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}>
              <Icon className="w-5 h-5" />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
