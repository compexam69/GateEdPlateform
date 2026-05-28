import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const supabaseUrl = process.env["SUPABASE_URL"];
const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

// Node.js 20 does not have native WebSocket — ws must be supplied as the
// realtime transport so the Supabase client can initialise without crashing,
// even though this server never opens any realtime subscriptions.
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  realtime: {
    transport: ws as unknown as typeof globalThis.WebSocket,
  },
});

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  emailVerified: boolean;
  isApproved: boolean;
}

export async function getUserFromRequest(
  authHeader: string | undefined
): Promise<AuthUser | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  // Always read role and is_approved from the profiles table.
  // user_metadata is never updated by our trigger — reading it gives wrong values.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_approved")
    .eq("id", data.user.id)
    .single();

  const role = profile?.role ?? "student";
  const isApproved = profile?.is_approved ?? false;
  const emailVerified = !!data.user.email_confirmed_at;

  return {
    id: data.user.id,
    email: data.user.email ?? "",
    role,
    emailVerified,
    isApproved,
  };
}
