import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

// Converts a Supabase Storage path ("<userId>/photo.jpg") to a public URL.
// Returns null for legacy B2 paths, blobs, or missing values.
// The optional `version` param is appended as ?v=<n> to bust the browser cache.
export function resolveAvatarUrl(path: string | null, version?: number): string | null {
  if (!path) return null;
  if (path.startsWith("blob:") || path.startsWith("http")) return path;
  if (path.startsWith("users/")) return null; // legacy B2 path — not resolvable in browser
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  if (!data.publicUrl) return null;
  return version != null ? `${data.publicUrl}?v=${version}` : data.publicUrl;
}

interface UseAvatarUrlReturn {
  /** Resolved, cache-busted public URL (or null if no photo). */
  photoUrl: string | null;
  /** Set the URL directly (e.g. blob URL during upload, permanent URL after). */
  setPhotoUrl: (url: string | null) => void;
  /**
   * Bump the internal cache-buster to `Date.now()`.
   * Call this after a successful upload or delete so the next resolved URL
   * bypasses the browser cache.  Returns the new version number.
   */
  bumpVersion: () => number;
  /**
   * Resolve an arbitrary storage path using the current version number.
   * Useful for building revert URLs (error paths) or explicit URL construction.
   */
  buildUrl: (path: string | null) => string | null;
}

/**
 * Manages the resolved avatar URL for a given Supabase user.
 *
 * Sources (in order of precedence at mount time):
 *   1. `user.user_metadata.avatar_url` — cached in the Zustand auth store.
 *   2. `profiles.avatar_url` — authoritative DB value, fetched on mount as a
 *      belt-and-suspenders fallback for stale JWTs after a hard reload.
 *
 * Stays live automatically: the sync effect fires whenever the auth store
 * propagates a USER_UPDATED event (e.g. right after an upload).
 */
export function useAvatarUrl(user: User | null): UseAvatarUrlReturn {
  const storedAvatarPath: string | null = user?.user_metadata?.avatar_url || null;

  // Initialised to Date.now() on each mount so revisiting the page always
  // fetches the latest image (bypasses stale browser / CDN cache).
  const avatarVersionRef = useRef<number>(Date.now());

  const [photoUrl, setPhotoUrl] = useState<string | null>(() =>
    resolveAvatarUrl(storedAvatarPath, avatarVersionRef.current)
  );

  // Sync when the auth store's user_metadata changes (USER_UPDATED event).
  // avatarVersionRef is read via ref — intentionally not in deps — so this
  // effect only fires when storedAvatarPath changes, not on every version bump.
  useEffect(() => {
    setPhotoUrl(resolveAvatarUrl(storedAvatarPath, avatarVersionRef.current));
  }, [storedAvatarPath]);

  // Belt-and-suspenders: fetch from profiles table on mount so the photo shows
  // even when the JWT metadata is stale (e.g. hard reload before token rotated).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const dbPath = (data?.avatar_url as string | null) ?? null;
        setPhotoUrl(resolveAvatarUrl(dbPath, avatarVersionRef.current));
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function bumpVersion(): number {
    avatarVersionRef.current = Date.now();
    return avatarVersionRef.current;
  }

  function buildUrl(path: string | null): string | null {
    return resolveAvatarUrl(path, avatarVersionRef.current);
  }

  return { photoUrl, setPhotoUrl, bumpVersion, buildUrl };
}
