-- Notes Access Management
-- Mirrors the hard75_access pattern: one row per user, enabled bool,
-- super_admin always bypasses (checked in code, no row needed).

-- ── notes_access table ────────────────────────────────────────────────────────
create table if not exists public.notes_access (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  enabled    boolean not null default false,
  enabled_by uuid references public.profiles(id) on delete set null,
  enabled_at timestamptz not null default now()
);

-- RLS: users can read their own row only; all writes go through service role
alter table public.notes_access enable row level security;

create policy "notes_access: own row select"
  on public.notes_access
  for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies → only service-role key can write
