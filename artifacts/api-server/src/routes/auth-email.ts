import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { sendWelcomeEmail } from "../lib/email";
import { supabase } from "../lib/supabase";

const router = Router();

router.post("/auth/welcome", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  await sendWelcomeEmail(profile.email, profile.full_name ?? "Student");
  res.json({ message: "Welcome email sent" });
});

export default router;
