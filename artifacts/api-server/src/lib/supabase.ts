import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env["SUPABASE_URL"];
const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
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
  const role = data.user.user_metadata?.["role"] ?? "student";
  const emailVerified = !!data.user.email_confirmed_at;
  const isAdmin = role === "admin" || role === "super_admin";
  const isApproved = isAdmin ? true : (data.user.user_metadata?.["is_approved"] === true);
  return {
    id: data.user.id,
    email: data.user.email ?? "",
    role,
    emailVerified,
    isApproved,
  };
}
