import { supabase } from "./supabase";
import { getCsrfToken } from "./csrf";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function getApiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envUrl) return envUrl;
  return `/api`;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const method = (options.method ?? "GET").toUpperCase();

  const csrfHeader: Record<string, string> = {};
  if (!SAFE_METHODS.has(method)) {
    try {
      csrfHeader["x-csrf-token"] = await getCsrfToken();
    } catch {
      // Best-effort: proceed without token; server will reject with 403 if required
    }
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...csrfHeader,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}
