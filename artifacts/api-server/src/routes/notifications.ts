import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/notifications", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (error.code === "42P01") {
      res.json({ notifications: [], unread_count: 0 });
      return;
    }
    res.status(500).json({ error: error.message });
    return;
  }
  const unread_count = (data ?? []).filter((n: { is_read: boolean }) => !n.is_read).length;
  res.json({ notifications: data ?? [], unread_count });
});

router.patch("/notifications/:notifId/read", requireAuth, async (req: AuthRequest, res) => {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", req.params["notifId"])
    .eq("user_id", req.user!.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: "Marked as read" });
});

router.patch("/notifications/read-all", requireAuth, async (req: AuthRequest, res) => {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", req.user!.id)
    .eq("is_read", false);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: "All marked as read" });
});

router.delete("/notifications/:notifId", requireAuth, async (req: AuthRequest, res) => {
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", req.params["notifId"] as string)
    .eq("user_id", req.user!.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

router.delete("/notifications", requireAuth, async (req: AuthRequest, res) => {
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", req.user!.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: string = "info"
) {
  try {
    await supabase.from("notifications").insert({
      user_id: userId,
      title,
      message,
      type,
      is_read: false,
      created_at: new Date().toISOString(),
    });
  } catch {}
}

export default router;
