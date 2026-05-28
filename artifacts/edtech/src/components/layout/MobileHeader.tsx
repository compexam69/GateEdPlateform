import { Link } from "wouter";
import { BookOpen } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/NotificationBell";

/**
 * Fixed top header shown only on mobile (hidden on md+).
 * Provides the avatar, notification bell, and app logo that are otherwise
 * buried inside the desktop-only sidebar.
 */
export function MobileHeader() {
  const { user, avatarUrl } = useAuth();
  const [imgError, setImgError] = useState(false);

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "S";
  const showImage = !!avatarUrl && !imgError;

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-card border-b border-border flex items-center justify-between px-4 md:hidden">
      {/* App logo */}
      <div className="flex items-center gap-2 text-primary font-bold select-none">
        <BookOpen className="w-5 h-5" />
        <span className="text-base tracking-tight">EdTech</span>
      </div>

      {/* Right side: notification bell + avatar shortcut */}
      <div className="flex items-center gap-0.5">
        <NotificationBell />

        {/* Tapping the avatar navigates to Profile */}
        <Link href="/profile">
          <div className="ml-1 w-8 h-8 rounded-full bg-primary/10 ring-1 ring-border overflow-hidden flex items-center justify-center active:opacity-70 transition-opacity cursor-pointer">
            {showImage ? (
              <img
                key={avatarUrl}
                src={avatarUrl}
                alt={firstName}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <span className="text-xs font-bold text-primary select-none">
                {firstName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        </Link>
      </div>
    </header>
  );
}
