import { Link, useLocation } from "wouter";
import { BookOpen, Home, Settings, Timer, CheckSquare, LineChart, FileText, ShieldCheck, BookOpenCheck, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useHard75Access } from "@/hooks/useHard75Access";
import { useNotesAccess } from "@/hooks/useNotesAccess";
import { NotificationBell } from "@/components/NotificationBell";
import { Logo } from "@/components/Logo";
import { useState } from "react";

export function Sidebar() {
  const [location] = useLocation();
  const { role, user, avatarUrl } = useAuth();
  const { hasAccess: hard75Access } = useHard75Access();
  const { hasAccess: notesAccess } = useNotesAccess();

  // Local error flag: if the image fails to load (broken URL, network error)
  // fall back to the initials avatar without touching the global store.
  const [imgError, setImgError] = useState(false);

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: Home },
    { href: "/subjects", label: "Learning Path", icon: BookOpen },
    { href: "/tasks", label: "Planner", icon: CheckSquare },
    { href: "/pomodoro", label: "Focus Timer", icon: Timer },
    { href: "/tests", label: "Tests", icon: BookOpenCheck },
    ...(notesAccess ? [{ href: "/notes", label: "Notes", icon: FileText }] : []),
    { href: "/tracker", label: "Tracker", icon: LineChart },
    { href: "/profile", label: "Profile", icon: Settings },
  ];

  if (hard75Access) {
    links.splice(links.length - 1, 0, { href: "/75hard", label: "75 Hard", icon: Trophy });
  }

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
      <div className="px-4 py-3 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <Logo size={40} className="shrink-0" />
          <div className="leading-tight min-w-0">
            <p className="text-[11px] font-extrabold text-foreground tracking-tight truncate">
              One Step EdPlateform
            </p>
            <p className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase truncate">
              Classes
            </p>
          </div>
        </div>
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
          const isActive = location === link.href || (link.href !== "/dashboard" && location.startsWith(link.href + "/")) || (link.href === "/75hard" && location.startsWith("/75hard"));
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
