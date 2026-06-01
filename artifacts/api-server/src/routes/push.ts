import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { getVapidPublicKey } from "../lib/push";

const router = Router();

router.get("/push/vapid-public-key", (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({ error: "Web push not configured" });
    return;
  }
  res.json({ vapid_public_key: key });
});

router.post("/push/subscribe", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { endpoint, keys, user_agent } = req.body as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    user_agent?: string;
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: "endpoint and keys (p256dh + auth) are required" });
    return;
  }

  // Validate field lengths to prevent DB bloat / injection via oversized strings
  if (typeof endpoint !== "string" || endpoint.length > 2048) {
    res.status(400).json({ error: "endpoint must be a string of at most 2048 characters" });
    return;
  }
  if (typeof keys.p256dh !== "string" || keys.p256dh.length > 256) {
    res.status(400).json({ error: "keys.p256dh must be a string of at most 256 characters" });
    return;
  }
  if (typeof keys.auth !== "string" || keys.auth.length > 64) {
    res.status(400).json({ error: "keys.auth must be a string of at most 64 characters" });
    return;
  }
  if (user_agent !== undefined && (typeof user_agent !== "string" || user_agent.length > 512)) {
    res.status(400).json({ error: "user_agent must be a string of at most 512 characters" });
    return;
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint,
        keys_p256dh: keys.p256dh,
        keys_auth: keys.auth,
        user_agent: user_agent ?? null,
      },
      { onConflict: "user_id,endpoint" }
    );

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ message: "Subscribed to push notifications" });
});

router.delete("/push/unsubscribe", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { endpoint } = req.body as { endpoint?: string };

  if (endpoint) {
    if (typeof endpoint !== "string" || endpoint.length > 2048) {
      res.status(400).json({ error: "endpoint must be a string of at most 2048 characters" });
      return;
    }
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint);
    if (error) { res.status(500).json({ error: error.message }); return; }
  } else {
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId);
    if (error) { res.status(500).json({ error: error.message }); return; }
  }

  res.json({ message: "Unsubscribed" });
});

export default router;
