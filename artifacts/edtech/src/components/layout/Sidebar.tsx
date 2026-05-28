import { Link, useLocation } from "wouter";
import { BookOpen, Home, Settings, Timer, CheckSquare, LineChart, FileText, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/NotificationBell";
import { useState } from "react";

export function Sidebar() {
  const [location] = useLocation();
  const { role, user, avatarUrl } = useAuth();

  // Local error flag: if the image fails to load (broken URL, network error)
  // fall back to the initials avatar without touching the global store.
  const [imgError, setImgError] = useState(false);

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: Home },
    { href: "/subjects", label: "Learning Path", icon: BookOpen },
    { href: "/tasks", label: "Planner", icon: CheckSquare },
    { href: "/pomodoro", label: "Focus Timer", icon: Timer },
    { href: "/notes", label: "Notes", icon: FileText },
    { href: "/tracker", label: "Tracker", icon: LineChart },
    { href: "/profile", label: "Profile", icon: Settings },
  ];

  if (role === "admin" || role === "super_admin") {
    links.push({ href: "/admin", label: "Admin Panel", icon: ShieldCheck });
  }

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "Student";

  // Reset error flag when avatarUrl changes (new upload / removal).
  // Using the URL as a key on the <img> element handles this automatically.
  const showImage = !!avatarUrl && !imgError;

  return (
    <div className="w-64 h-full border-r border-border bg-card flex flex-col">
      {/* Logo + Notifications */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-border">
        <h1 className="text-lg font-bold text-primary flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          <span>EdTech</span>
        </h1>
        <NotificationBell />
      </div>

      {/* User chip */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-border">
            {showImage
              ? <img
                  key={avatarUrl}
                  src={avatarUrl}
                  alt={firstName}
                  className="w-full h-full object-cover"
                  onError={() => setImgError(true)}
                />
              : <span className="text-xs font-bold text-primary select-none">
                  {firstName.charAt(0).toUpperCase()}
                </span>
            }
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{firstName}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {role === "super_admin" ? "Super Admin" : role === "admin" ? "Admin" : "Student"}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location === link.href || (link.href !== "/dashboard" && location.startsWith(link.href + "/"));
          return (
            <Link key={link.href} href={link.href} className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm",
              isActive
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}>
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
