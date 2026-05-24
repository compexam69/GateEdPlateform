import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { sendWelcomeEmail } from "../lib/email";
import { supabase } from "../lib/supabase";

const router = Router();

// In-memory rate limiter: max 3 resends per email per hour
const resendAttempts = new Map<string, { count: number; resetAt: number }>();

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

router.post("/auth/verify-email", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const normalised = email.toLowerCase().trim();
  const now = Date.now();
  const WINDOW_MS = 60 * 60 * 1000;
  const MAX_ATTEMPTS = 3;

  const existing = resendAttempts.get(normalised);
  if (existing) {
    if (now < existing.resetAt) {
      if (existing.count >= MAX_ATTEMPTS) {
        res.status(429).json({
          error: `Too many requests. You can request up to ${MAX_ATTEMPTS} verification emails per hour.`,
          retry_after_ms: existing.resetAt - now,
        });
        return;
      }
      existing.count++;
    } else {
      resendAttempts.set(normalised, { count: 1, resetAt: now + WINDOW_MS });
    }
  } else {
    resendAttempts.set(normalised, { count: 1, resetAt: now + WINDOW_MS });
  }

  const { error } = await supabase.auth.resend({ type: "signup", email: normalised });
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ message: "Verification email sent" });
});

export default router;
