-- ============================================================
-- FIX: "Database error creating new user" on registration
-- ============================================================
-- Root cause 1: The trigger did UPDATE auth.users inside an
--   AFTER INSERT trigger on auth.users. GoTrue holds the row
--   lock during its INSERT transaction, so the UPDATE on the
--   same row causes "tuple concurrently updated", which
--   Supabase surfaces as "Database error creating new user".
--
-- Root cause 2: SECURITY DEFINER function lacked
--   SET search_path = '', which newer Supabase projects enforce.
--
-- Fix: Drop the UPDATE auth.users block; add SET search_path = '';
--   fully-qualify all table and type references as public.*.
-- ============================================================

create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  user_count int;
  new_role   public.user_role;
  new_status public.user_status;
  new_approved boolean;
begin
  select count(*) into user_count from public.profiles;

  if user_count = 0 then
    new_role     := 'super_admin';
    new_status   := 'active';
    new_approved := true;
  else
    new_role     := 'student';
    new_status   := 'pending_approval';
    new_approved := false;
  end if;

  insert into public.profiles
    (id, full_name, mobile_number, email, role, is_approved, status, email_verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'mobile_number',
    new.email,
    new_role,
    new_approved,
    new_status,
    coalesce((new.email_confirmed_at is not null), false)
  );

  return new;
end;
$$;

-- Re-create trigger (no-op if already exists with correct definition)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
