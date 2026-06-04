/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── NetworkFirst runtime caching for API GET responses ────────────────────────
//
// Strategy: NetworkFirst
//   1. Always attempt the network first.
//   2. On success → return fresh response + update cache.
//   3. On network failure (or timeout > 10 s) → serve cached response.
//   4. No cached response exists → request propagates naturally (React Query
//      will surface an error state; the OfflineBanner explains the situation).
//
// Cache: "edtech-api-v1"
//   • Max 100 entries, 24-hour TTL, auto-purge on quota exceeded.
//
// Endpoints explicitly excluded from caching (security & freshness):
//   /api/auth/*  — session tokens, login/logout, password operations
//   /api/csrf*   — one-time double-submit CSRF tokens
//   /api/push*   — Web Push subscription management
//   /api/b2/*    — presigned Backblaze B2 URLs (contain expiring signatures)
//
// All non-GET methods (POST / PUT / PATCH / DELETE) are unconditionally
// excluded so mutations are always live and never stale.
// ─────────────────────────────────────────────────────────────────────────────

const EXCLUDED_PREFIXES = ["/api/auth/", "/api/csrf", "/api/push", "/api/b2/"];

registerRoute(
  ({ url, request }: { url: URL; request: Request }) => {
    if (request.method !== "GET") return false;
    if (!url.pathname.startsWith("/api/")) return false;
    if (EXCLUDED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return false;
    return true;
  },
  new NetworkFirst({
    cacheName: "edtech-api-v1",
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 24 * 60 * 60, // 24 hours
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// ── Push notification handling ────────────────────────────────────────────────

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
}

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    payload = { title: "New notification", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon ?? "/favicon.svg",
      badge: payload.badge ?? "/favicon.svg",
      tag: payload.tag,
      data: { url: payload.url ?? "/" },
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const notifData = event.notification.data as { url?: string } | undefined;
  const url = notifData?.url ?? "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === url && "focus" in client) {
            return (client as WindowClient).focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});

// ── Background Sync: Pomodoro session retry ───────────────────────────────────

interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
}

self.addEventListener("sync", (event: Event) => {
  const syncEvent = event as SyncEvent;
  if (syncEvent.tag === "pomodoro-session-sync") {
    syncEvent.waitUntil(
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clientList) => {
          clientList.forEach(client => {
            client.postMessage({ type: "POMODORO_SYNC_RETRY" });
          });
        })
    );
  }
});
