import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { sendWelcomeEmail } from "../lib/email";
import { supabase } from "../lib/supabase";
import { checkRateLimitDb } from "../middlewares/rateLimitDb";

const router = Router();

// ── Welcome email ─────────────────────────────────────────────────────────────
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

// ── Resend verification email (max 3/hour per email) ─────────────────────────
router.post("/auth/verify-email", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const normalised = email.toLowerCase().trim();
  const { allowed, retryAfterMs } = await checkRateLimitDb(`resend:${normalised}`, 3, 60 * 60 * 1000);
  if (!allowed) {
    res.status(429).json({
      error: "Too many requests. You can request up to 3 verification emails per hour.",
      retry_after_ms: retryAfterMs,
    });
    return;
  }

  const { error } = await supabase.auth.resend({ type: "signup", email: normalised });
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ message: "Verification email sent" });
});

// ── Registration proxy (max 10/IP/hour) ───────────────────────────────────────
router.post("/auth/register", async (req, res) => {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    "unknown";

  const { allowed, retryAfterMs } = await checkRateLimitDb(`register:${ip}`, 10, 60 * 60 * 1000);
  if (!allowed) {
    res.status(429).json({
      error: "Too many registration attempts from this IP. Please try again later.",
      retry_after_ms: retryAfterMs,
    });
    return;
  }

  const { email, password, full_name, mobile_number } = req.body as {
    email?: string;
    password?: string;
    full_name?: string;
    mobile_number?: string;
  };

  if (!email || !password || !full_name) {
    res.status(400).json({ error: "Email, password, and full name are required." });
    return;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password,
    user_metadata: {
      full_name: full_name.trim(),
      mobile_number: mobile_number ?? null,
      role: "student",
    },
    email_confirm: false,
  });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json({
    message: "Account created. Please check your email to verify your account.",
    user_id: data.user?.id,
  });
});

// ── Change password (max 3/hour/user, auth required) ─────────────────────────
router.post("/auth/change-password", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const userEmail = req.user!.email!;

  const { allowed, retryAfterMs } = await checkRateLimitDb(`pwd-change:${userId}`, 3, 60 * 60 * 1000);
  if (!allowed) {
    res.status(429).json({
      error: "Too many password change attempts. Please try again in an hour.",
      retry_after_ms: retryAfterMs,
    });
    return;
  }

  const { current_password, new_password } = req.body as {
    current_password?: string;
    new_password?: string;
  };

  if (!current_password || !new_password) {
    res.status(400).json({ error: "current_password and new_password are required." });
    return;
  }

  if (
    new_password.length < 8 ||
    !/[A-Z]/.test(new_password) ||
    !/[a-z]/.test(new_password) ||
    !/[0-9]/.test(new_password) ||
    !/[^A-Za-z0-9]/.test(new_password)
  ) {
    res.status(400).json({
      error: "New password must be at least 8 characters and contain uppercase, lowercase, number, and special character.",
    });
    return;
  }

  if (current_password === new_password) {
    res.status(400).json({ error: "New password cannot be the same as your current password." });
    return;
  }

  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: userEmail,
    password: current_password,
  });
  if (authErr) {
    res.status(401).json({ error: "Current password is incorrect." });
    return;
  }

  const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
    password: new_password,
  });
  if (updateErr) {
    res.status(500).json({ error: updateErr.message });
    return;
  }

  res.json({ message: "Password changed successfully." });
});

export default router;
