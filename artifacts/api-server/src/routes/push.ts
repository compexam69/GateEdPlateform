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
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint);
  } else {
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId);
  }

  res.json({ message: "Unsubscribed" });
});

export default router;
