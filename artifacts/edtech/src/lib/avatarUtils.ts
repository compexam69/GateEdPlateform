import { supabase } from "./supabase";

/**
 * Converts a Supabase Storage path ("<userId>/photo.jpg") to a public URL.
 * Returns null for legacy B2 paths, blobs, or missing values.
 * The optional `version` param is appended as ?v=<n> to bust the browser cache
 * — only pass it right after an upload/delete to force a fresh download.
 */
export function resolveAvatarUrl(path: string | null, version?: number): string | null {
  if (!path) return null;
  if (path.startsWith("blob:") || path.startsWith("http")) return path;
  if (path.startsWith("users/")) return null;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  if (!data.publicUrl) return null;
  return version != null ? `${data.publicUrl}?v=${version}` : data.publicUrl;
}
