---
name: Auth Role Source
description: Where role/is_approved must be read from — profiles table, not user_metadata
---

## Rule
Always read `role` and `is_approved` from the `profiles` table, never from `user.user_metadata`.

**Why:** The `handle_new_user` trigger only writes to `public.profiles`. It does NOT call `auth.admin.updateUserById()` to set user_metadata (that would cause a GoTrue row-lock deadlock). So `user_metadata.role` and `user_metadata.is_approved` are always null/undefined.

**How to apply:**
- Frontend (`useAuth.ts`): after getting a session, call `supabase.from('profiles').select('role, is_approved').eq('id', userId).single()` and use that data.
- Backend (`lib/supabase.ts` → `getUserFromRequest`): after `supabase.auth.getUser(token)`, do a follow-up query to `profiles` for `role` and `is_approved`.
- Never use `session.user.user_metadata.role` — it will always be null.
