/**
 * CSRF token management for the SPA.
 *
 * The server uses the double-submit cookie pattern (csrf-csrf package):
 *  1. GET /api/csrf-token  → server sets an HttpOnly cookie + returns the
 *     plaintext token in JSON
 *  2. Every state-mutating request includes the plaintext token in the
 *     `x-csrf-token` header; the server validates it against the cookie
 *
 * We pass the current auth token to the token endpoint so the server can tie
 * the CSRF token to the authenticated user's session ID (JWT sub).  This
 * keeps the cookie valid across Supabase's hourly JWT refresh while still
 * binding it to the correct user.
 *
 * Cached until clearCsrfToken() is called — typically on auth state changes
 * (login / logout) so the token is re-fetched for the new session.
 */

import { getApiBase } from "./api";
import { supabase } from "./supabase";

let _token: string | null = null;
let _pending: Promise<string> | null = null;

export async function getCsrfToken(): Promise<string> {
  if (_token) return _token;
  if (_pending) return _pending;

  const promise = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const authHeader = session?.access_token
      ? `Bearer ${session.access_token}`
      : undefined;

    const res = await fetch(`${getApiBase()}/csrf-token`, {
      headers: authHeader ? { Authorization: authHeader } : {},
    });
    if (!res.ok) throw new Error(`CSRF token fetch failed: ${res.status}`);
    const { token } = await res.json() as { token: string };
    _token = token;
    _pending = null;
    return token;
  })();

  promise.catch(() => { _pending = null; });
  _pending = promise;
  return _pending;
}

/** Call on auth state changes (login / logout) to force a fresh token fetch. */
export function clearCsrfToken(): void {
  _token = null;
  _pending = null;
}
