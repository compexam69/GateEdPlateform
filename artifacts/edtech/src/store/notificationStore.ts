import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  connect: (userId: string) => void;
  disconnect: () => void;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotif: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

// Module-level singletons — live outside Zustand state so they never
// trigger re-renders and survive component remounts naturally.
let _channel: ReturnType<typeof supabase.channel> | null = null;
let _interval: ReturnType<typeof setInterval> | null = null;
let _connectedUserId: string | null = null;

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  connect: (userId) => {
    // Idempotent — skip silently if already connected for this user
    if (_connectedUserId === userId) return;
    // Tear down any previous connection first
    get().disconnect();
    _connectedUserId = userId;

    // Eagerly load the current list
    get().refresh();

    // Supabase realtime — instant delivery of INSERT/UPDATE events
    _channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as Notification;
          set((state) => ({
            notifications: [n, ...state.notifications],
            unreadCount: state.unreadCount + 1,
          }));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as Notification;
          set((state) => {
            const old = state.notifications.find((n) => n.id === updated.id);
            const wasUnread = old ? !old.is_read : false;
            const nowRead = updated.is_read;
            return {
              notifications: state.notifications.map((n) =>
                n.id === updated.id ? updated : n
              ),
              // Only decrement if the notification transitioned unread → read
              unreadCount: wasUnread && nowRead
                ? Math.max(0, state.unreadCount - 1)
                : state.unreadCount,
            };
          });
        }
      )
      .subscribe();

    // 5-minute fallback poll — keeps the list consistent if a realtime
    // event is missed (e.g. temporary WebSocket drop)
    _interval = setInterval(() => get().refresh(), 5 * 60 * 1000);
  },

  disconnect: () => {
    if (_channel) {
      supabase.removeChannel(_channel);
      _channel = null;
    }
    if (_interval !== null) {
      clearInterval(_interval);
      _interval = null;
    }
    _connectedUserId = null;
    set({ notifications: [], unreadCount: 0, loading: false });
  },

  refresh: async () => {
    set({ loading: true });
    try {
      const json = (await apiFetch("/notifications")) as {
        notifications: Notification[];
        unread_count: number;
      };
      set({
        notifications: json.notifications ?? [],
        unreadCount: json.unread_count ?? 0,
      });
    } catch {
      // Silent failure — stale data remains visible
    } finally {
      set({ loading: false });
    }
  },

  markRead: async (id) => {
    // Optimistic update so the UI responds immediately
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
    try {
      await apiFetch(`/notifications/${id}/read`, { method: "PATCH" });
    } catch {
      // Best-effort — optimistic update is kept even on transient failure
    }
  },

  markAllRead: async () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    }));
    try {
      await apiFetch("/notifications/read-all", { method: "PATCH" });
    } catch {}
  },

  deleteNotif: async (id) => {
    // Optimistic removal — UI responds instantly
    set((state) => {
      const target = state.notifications.find((n) => n.id === id);
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: target && !target.is_read
          ? Math.max(0, state.unreadCount - 1)
          : state.unreadCount,
      };
    });
    try {
      await apiFetch(`/notifications/${id}`, { method: "DELETE" });
    } catch {
      // Best-effort — optimistic removal is kept; a refresh will reconcile
    }
  },

  clearAll: async () => {
    // Optimistic — wipe everything instantly
    set({ notifications: [], unreadCount: 0 });
    try {
      await apiFetch("/notifications", { method: "DELETE" });
    } catch {
      // Best-effort
    }
  },
}));
