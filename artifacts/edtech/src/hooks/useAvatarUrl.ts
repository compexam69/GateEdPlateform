import { useState, useRef } from "react";
import { resolveAvatarUrl } from "@/lib/avatarUtils";
import { useAuth } from "@/hooks/useAuth";
import type { User } from "@supabase/supabase-js";

export { resolveAvatarUrl };

interface UseAvatarUrlReturn {
  /** Resolved public URL (or null if no photo). */
  photoUrl: string | null;
  /**
   * Set the URL directly (e.g. blob URL during upload, permanent URL after).
   * Non-blob URLs are also pushed to the global auth store so every avatar
   * component (Sidebar, etc.) stays in sync without an extra round-trip.
   */
  setPhotoUrl: (url: string | null) => void;
  /**
   * Bump the internal cache-buster to Date.now().
   * Call this before computing the final post-upload URL so the browser
   * doesn't serve the old cached image.  Returns the new version number.
   */
  bumpVersion: () => number;
  /**
   * Resolve an arbitrary storage path using the current version number.
   * Use this to build the permanent URL right after bumpVersion().
   */
  buildUrl: (path: string | null) => string | null;
}

/**
 * Manages the avatar URL for ProfilePage upload/removal flows.
 *
 * Key design change — what was fixed and why:
 *
 * OLD behaviour (caused avatar flickering on every navigation):
 *   • avatarVersionRef was initialised to Date.now() on every hook mount.
 *   • Because Sidebar called this hook and AppLayout (with Sidebar) is
 *     re-created on each page, every navigation produced a new ?v=<timestamp>
 *     on the URL.  The browser saw a brand-new URL and re-downloaded the image.
 *   • A profiles DB fetch also fired on every Sidebar mount.
 *
 * NEW behaviour (stable, no flicker):
 *   • The global auth store (useAuth) holds avatarUrl, populated once on login.
 *   • Sidebar reads avatarUrl directly from useAuth — no hook, no DB fetch.
 *   • This hook is used only in ProfilePage for upload/removal flows.
 *   • avatarVersionRef starts at 0; bumped to Date.now() ONLY on upload/remove.
 *   • setPhotoUrl() pushes non-blob URLs to the auth store so Sidebar updates
 *     instantly without any extra fetch.
 */
export function useAvatarUrl(_user: User | null): UseAvatarUrlReturn {
  // Version ref starts at 0; bumped to Date.now() only after actual upload/remove.
  const avatarVersionRef = useRef<number>(0);

  // Read the current avatar URL from the global auth store.
  // useAuth is a Zustand React hook: this component re-renders automatically
  // whenever avatarUrl changes in the store (e.g. after another component
  // calls setAvatarUrl, or after login resolves).
  const storeAvatarUrl = useAuth((state) => state.avatarUrl);

  // Local state holds the blob URL during the upload preview phase and the
  // final permanent URL while this page instance is mounted.
  // Initialised from the store so the image shows immediately without a fetch.
  const [localUrl, setLocalUrl] = useState<string | null>(
    () => useAuth.getState().avatarUrl
  );

  // Displayed URL: local state during upload preview, otherwise store value.
  // Using storeAvatarUrl as a fallback means changes made by the store
  // (e.g. login resolving for the first time) also show up here.
  const photoUrl = localUrl ?? storeAvatarUrl;

  function setPhotoUrl(url: string | null) {
    setLocalUrl(url);
    // Push non-blob URLs to the global store so Sidebar/header avatars
    // update instantly without requiring a page reload or navigation.
    if (!url?.startsWith("blob:")) {
      useAuth.getState().setAvatarUrl(url);
    }
  }

  function bumpVersion(): number {
    avatarVersionRef.current = Date.now();
    return avatarVersionRef.current;
  }

  function buildUrl(path: string | null): string | null {
    return resolveAvatarUrl(path, avatarVersionRef.current || undefined);
  }

  return { photoUrl, setPhotoUrl, bumpVersion, buildUrl };
}
