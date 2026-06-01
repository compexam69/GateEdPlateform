/**
 * Input sanitization helpers used across all API routes.
 *
 * Supabase/PostgREST uses parameterized queries, so classic SQL injection via
 * value interpolation is not possible. These guards address:
 *   1. ILIKE wildcard injection — % and _ in search terms alter query semantics
 *   2. Length bombs — unbounded strings waste DB I/O and memory
 *   3. Null bytes — \0 can cause silent truncation in some PG contexts
 *   4. UUID format — invalid UUIDs should return 400, not 500 from PostgREST
 *   5. Enum safety — open-ended filter strings should be validated against
 *      a known set before being passed to .eq()
 */

/** UUID regex — accepts v1–v5, case-insensitive. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Trim, remove null bytes, and cap a free-text string to `maxLen` characters.
 * Returns `null` if the result is empty after trimming.
 */
export function capText(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\0/g, "").trim();
  if (!clean) return null;
  return clean.slice(0, maxLen);
}

/**
 * Like `capText` but always returns a string (falls back to `fallback`).
 */
export function capTextOr(value: unknown, maxLen: number, fallback: string): string {
  return capText(value, maxLen) ?? fallback;
}

/**
 * Escape `%` and `_` wildcards in a search term so it can safely be placed
 * inside a PostgREST `.ilike()` pattern without unintended matching behaviour.
 *
 * Example:  escapeIlike("100% math_fun") → "100\\% math\\_fun"
 * Then caller wraps it:  `%${escapeIlike(q)}%`
 */
export function escapeIlike(q: string): string {
  return q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Validate that `value` is a well-formed UUID.
 * Returns `true` when valid — callers should return 400 when false.
 */
export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Validate that `value` is one of the allowed enum strings.
 * Returns the value typed as `T` when valid, or `null`.
 */
export function sanitizeEnum<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | null {
  if (typeof value !== "string") return null;
  const v = value.trim() as T;
  return allowed.includes(v) ? v : null;
}

/** Standard max lengths used throughout the codebase. */
export const MAX = {
  TITLE: 300,
  DESCRIPTION: 2000,
  SEARCH_QUERY: 200,
  EMAIL: 320,
  NAME: 200,
  PHONE: 30,
  URL: 2000,
  UUID: 36,
  CONTENT_TYPE: 60,
  CONTENT_ID: 36,
  ENUM: 50,
} as const;
