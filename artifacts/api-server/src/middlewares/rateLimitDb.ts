import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";

/**
 * Supabase-backed rate limiter for critical auth endpoints.
 * Persists rate limit state across server restarts.
 * Requires a `rate_limits` table in Supabase:
 *   CREATE TABLE rate_limits (
 *     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *     key text NOT NULL,
 *     created_at timestamptz DEFAULT NOW()
 *   );
 *   CREATE INDEX rate_limits_key_created_idx ON rate_limits(key, created_at);
 *
 * Fail-open policy: if the DB check fails, the request is allowed through.
 * This avoids blocking legitimate users during DB outages, at the cost of
 * temporarily weakening rate limiting. The failure is always logged as a warning.
 */
export async function checkRateLimitDb(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const windowStart = new Date(Date.now() - windowMs).toISOString();

  const { data: existing, error } = await supabase
    .from("rate_limits")
    .select("id, created_at")
    .eq("key", key)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: true });

  if (error) {
    // Fail-open: allow request but log the DB failure so operators can investigate
    logger.warn({ err: error, key }, "rate_limit_db_check_failed — falling back to allow");
    return { allowed: true, retryAfterMs: 0 };
  }

  const count = (existing ?? []).length;

  if (count >= maxRequests) {
    const oldest = existing![0];
    const retryAfterMs = Math.max(
      0,
      new Date(oldest.created_at).getTime() + windowMs - Date.now()
    );
    return { allowed: false, retryAfterMs };
  }

  const { error: insertError } = await supabase
    .from("rate_limits")
    .insert({ key, created_at: new Date().toISOString() });

  if (insertError) {
    logger.warn({ err: insertError, key }, "rate_limit_db_insert_failed — allowing request");
  }

  // Best-effort cleanup of old entries (keep DB tidy)
  void supabase
    .from("rate_limits")
    .delete()
    .lt("created_at", new Date(Date.now() - windowMs * 2).toISOString())
    .then(() => {}, () => {});

  return { allowed: true, retryAfterMs: 0 };
}
