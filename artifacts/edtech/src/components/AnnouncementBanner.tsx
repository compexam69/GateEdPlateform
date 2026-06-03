import { useState } from "react";
import { X, Info, AlertTriangle, CheckCircle2, Megaphone } from "lucide-react";
import { useGetActiveAnnouncements } from "@workspace/api-client-react";
import type { Announcement } from "@workspace/api-client-react";

const TYPE_STYLES: Record<
  Announcement["type"],
  { container: string; icon: string; IconComponent: React.ElementType }
> = {
  info: {
    container: "bg-primary/10 border-primary/20 text-primary",
    icon: "text-primary",
    IconComponent: Info,
  },
  warning: {
    container: "bg-warning/10 border-warning/20 text-warning",
    icon: "text-warning",
    IconComponent: AlertTriangle,
  },
  success: {
    container: "bg-success/10 border-success/20 text-success",
    icon: "text-success",
    IconComponent: CheckCircle2,
  },
};

function AnnouncementItem({
  announcement,
  onDismiss,
}: {
  announcement: Announcement;
  onDismiss: (id: string) => void;
}) {
  const style = TYPE_STYLES[announcement.type] ?? TYPE_STYLES.info;
  const { IconComponent } = style;

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${style.container}`}
      role="alert"
    >
      <IconComponent className={`mt-0.5 h-4 w-4 shrink-0 ${style.icon}`} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">{announcement.title}</p>
        {announcement.body && (
          <p className="mt-0.5 opacity-85 leading-snug">{announcement.body}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(announcement.id)}
        className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss announcement"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Fetches and renders active platform announcements at the top of the dashboard.
 * Each announcement can be individually dismissed (session-only — dismissals are
 * not persisted, so they reappear on next page load).
 */
export function AnnouncementBanner() {
  const { data: announcements = [] } = useGetActiveAnnouncements({
    query: {
      queryKey: ["announcements-active"],
      staleTime: 5 * 60 * 1000,
    },
  });

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = announcements.filter((a) => !dismissed.has(a.id));

  if (visible.length === 0) return null;

  const handleDismiss = (id: string) =>
    setDismissed((prev) => new Set([...prev, id]));

  return (
    <div className="space-y-2" role="region" aria-label="Platform announcements">
      {visible.length > 1 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Megaphone className="h-3.5 w-3.5" />
          <span>Announcements</span>
        </div>
      )}
      {visible.map((a) => (
        <AnnouncementItem key={a.id} announcement={a} onDismiss={handleDismiss} />
      ))}
    </div>
  );
}
