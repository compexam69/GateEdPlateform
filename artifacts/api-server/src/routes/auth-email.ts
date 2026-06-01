import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { supabase } from "../lib/supabase";
import { checkRateLimitDb } from "../middlewares/rateLimitDb";
import { logger } from "../lib/logger";

const router = Router();

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

  // Server-side password strength check (mirrors client validation)
  if (
    password.length < 8 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    res.status(400).json({
      error: "Password must be at least 8 characters and contain uppercase, lowercase, number, and special character.",
    });
    return;
  }
  if (password.length > 128) {
    res.status(400).json({ error: "Password must not exceed 128 characters." });
    return;
  }

  // Validate mobile_number format if provided
  if (mobile_number !== undefined && mobile_number.trim() !== "") {
    if (!/^\+?\d{7,15}$/.test(mobile_number.trim())) {
      res.status(400).json({ error: "mobile_number must be a valid phone number (7–15 digits, optional leading +)." });
      return;
    }
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedName = full_name.trim().slice(0, 100);

  const { data, error } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password,
    user_metadata: {
      full_name: normalizedName,
      mobile_number: mobile_number ? mobile_number.trim() : null,
      role: "student",
    },
    // email_confirm: false means the user starts unverified.
    // admin.createUser() intentionally does NOT send any emails —
    // we must trigger both emails ourselves below.
    email_confirm: false,
  });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  // ── 1. Supabase verification email ─────────────────────────────────────────
  // admin.createUser() never sends emails. We call auth.resend() immediately
  // after creation to dispatch exactly ONE verification email via Supabase.
  // This call is outside the rate-limiter, so it does NOT consume the
  // user's 3/hour manual-resend quota.
  let emailSent = false;
  try {
    const { error: resendErr } = await supabase.auth.resend({
      type: "signup",
      email: normalizedEmail,
    });
    if (resendErr) {
      logger.warn({ err: resendErr.message }, "[auth/register] verification email failed");
    } else {
      emailSent = true;
    }
  } catch (e) {
    logger.warn({ err: e }, "[auth/register] verification email exception");
  }

  // ── 2. In-app welcome notification ────────────────────────────────────────
  // Resend has been removed. We write a welcome notification directly to the
  // notifications table so the user sees it as soon as they log in.
  // Best-effort — a DB failure here must not block the registration response.
  if (data.user?.id) {
    try {
      await supabase.from("notifications").insert({
        user_id: data.user.id,
        title: "Welcome to EdTech Study Platform",
        message:
          "Your account has been created and is pending admin approval. " +
          "Please verify your email first, then wait for an admin to approve your account (usually within 24 hours).",
        type: "info",
        is_read: false,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      logger.warn({ err: e }, "[auth/register] welcome notification insert failed");
    }
  }

  res.status(201).json({
    message: "Account created. Please check your email to verify your account.",
    user_id: data.user?.id,
    email_sent: emailSent,
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
