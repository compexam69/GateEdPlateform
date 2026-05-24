import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getApiBase } from "@/lib/api";

async function apiFetch(path: string, opts: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(`${getApiBase()}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}`, ...(opts.headers ?? {}) },
  });
}

async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${getApiBase()}/push/vapid-public-key`);
    if (!res.ok) return null;
    const json = await res.json() as { vapid_public_key?: string };
    return json.vapid_public_key ?? null;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map(char => char.charCodeAt(0))).buffer;
}

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const isSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(isSupported);
    if (!isSupported) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PushPermission);

    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    });
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    setLoading(true);

    try {
      const vapidKey = await getVapidPublicKey();
      if (!vapidKey) {
        console.warn("[push] VAPID public key not available — push not configured on server");
        setLoading(false);
        return false;
      }

      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== "granted") {
        setLoading(false);
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const subJson = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };

      const res = await apiFetch("/push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: { p256dh: subJson.keys?.p256dh ?? "", auth: subJson.keys?.auth ?? "" },
          user_agent: navigator.userAgent,
        }),
      });

      if (res.ok) {
        setIsSubscribed(true);
        setLoading(false);
        return true;
      }
    } catch (err) {
      console.error("[push] Subscription failed:", err);
    }

    setLoading(false);
    return false;
  }, [supported]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiFetch("/push/unsubscribe", {
          method: "DELETE",
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
        setIsSubscribed(false);
      }
    } catch (err) {
      console.error("[push] Unsubscribe failed:", err);
    }
    setLoading(false);
  }, []);

  return { permission, isSubscribed, loading, supported, subscribe, unsubscribe };
}
