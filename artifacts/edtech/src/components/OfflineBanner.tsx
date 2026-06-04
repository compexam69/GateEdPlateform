import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="You are offline"
      className="flex items-center justify-center gap-2 bg-amber-500/15 border-b border-amber-500/25 px-4 py-2 text-xs font-medium text-amber-600 dark:text-amber-400 select-none"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>You're offline — showing cached data</span>
    </div>
  );
}
