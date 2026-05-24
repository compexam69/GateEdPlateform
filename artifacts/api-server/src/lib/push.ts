import webpush from "web-push";
import { supabase } from "./supabase";

const VAPID_PUBLIC_KEY = process.env["VAPID_PUBLIC_KEY"];
const VAPID_PRIVATE_KEY = process.env["VAPID_PRIVATE_KEY"];
const VAPID_SUBJECT = process.env["VAPID_SUBJECT"] ?? "mailto:admin@yourdomain.com";

let initialized = false;

export function initWebPush(): void {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.info("[push] VAPID keys not set — web push disabled");
    return;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  initialized = true;
  console.info("[push] Web push active");
}

export function getVapidPublicKey(): string | null {
  return VAPID_PUBLIC_KEY ?? null;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
}

interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!initialized) return;

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, keys_p256dh, keys_auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return;

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? "/favicon.svg",
    badge: payload.badge ?? "/favicon.svg",
    url: payload.url ?? "/",
    tag: payload.tag,
  });

  const sends = subs.map(async (sub: { endpoint: string; keys_p256dh: string; keys_auth: string }) => {
    const subscription: PushSubscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
    };
    try {
      await webpush.sendNotification(subscription, message);
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 410 || status === 404) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", userId)
          .eq("endpoint", sub.endpoint);
      }
    }
  });

  await Promise.allSettled(sends);
}

export async function sendPushToAll(payload: PushPayload): Promise<void> {
  if (!initialized) return;

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("user_id, endpoint, keys_p256dh, keys_auth");

  if (!subs || subs.length === 0) return;

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? "/favicon.svg",
    badge: payload.badge ?? "/favicon.svg",
    url: payload.url ?? "/",
  });

  const sends = subs.map(async (sub: { user_id: string; endpoint: string; keys_p256dh: string; keys_auth: string }) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } }, message);
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 410 || status === 404) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    }
  });

  await Promise.allSettled(sends);
}
