import { ReactNode, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { PomodoroWidget } from "@/components/PomodoroWidget";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationStore } from "@/store/notificationStore";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // Single place that starts and stops the shared notification connection.
  // connect() is idempotent — safe to call on every render where user.id
  // hasn't changed.  disconnect() clears the realtime channel, the fallback
  // interval, and all cached notification data on sign-out.
  useEffect(() => {
    const store = useNotificationStore.getState();
    if (user?.id) {
      store.connect(user.id);
    } else {
      store.disconnect();
    }
  }, [user?.id]);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
          {children}
        </div>
      </main>

      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
        <BottomNav />
      </div>

      <PomodoroWidget />
    </div>
  );
}
