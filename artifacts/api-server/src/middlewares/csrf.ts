import { doubleCsrf } from "csrf-csrf";
import { logger } from "../lib/logger";
import type { Request, Response, NextFunction } from "express";

const isDev = process.env["NODE_ENV"] !== "production";

/**
 * Resolve the CSRF signing secret.
 *
 * In production, set CSRF_SECRET to a stable random 32-byte hex string so
 * tokens survive server restarts.  Without it a new secret is generated each
 * startup, invalidating every existing CSRF cookie on the next mutation.
 */
function resolveSecret(): string {
  const s = process.env["CSRF_SECRET"];
  if (s) return s;

  if (!isDev) {
    logger.warn(
      "CSRF_SECRET env var is not set — using a per-startup random secret. " +
      "All CSRF tokens will be invalidated on every server restart. " +
      "Add CSRF_SECRET to your environment variables."
    );
  }

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("hex");
}

const CSRF_SECRET = resolveSecret();

/**
 * Extract a stable session identifier from the request.
 *
 * For authenticated requests we use the `sub` (user ID) claim from the JWT so
 * the CSRF token is tied to the user's identity and not the raw token bytes
 * (JWT tokens are rotated hourly by Supabase; using the sub keeps the CSRF
 * cookie valid across token refreshes).
 *
 * For unauthenticated requests (e.g. GET /api/csrf-token before login) we fall
 * back to IP + a short UA prefix, which is consistent within a browsing session.
 */
function getSessionId(req: Request): string {
  const auth = req.headers["authorization"] ?? "";
  if (auth.startsWith("Bearer ")) {
    try {
      const parts = auth.slice(7).split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(
          Buffer.from(parts[1]!, "base64url").toString("utf8")
        ) as { sub?: string };
        if (payload.sub) return payload.sub;
      }
    } catch {
      // Fall through to IP-based fallback
    }
  }
  const ip = req.ip ?? "unknown";
  const ua = (req.headers["user-agent"] ?? "").slice(0, 64);
  return `${ip}:${ua}`;
}

export const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => CSRF_SECRET,
  getSessionIdentifier: getSessionId,
  cookieName: isDev ? "x-csrf-token" : "__Host-x-csrf-token",
  cookieOptions: {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: !isDev,
  },
  getCsrfTokenFromRequest: (req) => req.headers["x-csrf-token"],
});

/**
 * Express error handler — converts CSRF validation failures (EBADCSRFTOKEN)
 * into clean 403 JSON responses instead of leaking a 500 stack trace.
 * Must be registered AFTER all route handlers and the Sentry error handler.
 */
export function csrfErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const e = err as { code?: string } | null;
  if (e?.code === "EBADCSRFTOKEN") {
    res.status(403).json({ error: "Invalid or missing CSRF token." });
    return;
  }
  next(err);
}
