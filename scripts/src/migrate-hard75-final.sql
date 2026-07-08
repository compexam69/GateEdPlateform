-- ============================================================
-- 75 Hard — definitive migration
-- Handles the real database state:
--   • hard75_challenges EXISTS but is missing start_date
--   • hard75_access EXISTS but may be missing enabled_by / enabled_at
--   • all other hard75 tables DO NOT EXIST yet
--
-- Every statement is idempotent — safe to re-run.
-- Run the whole file in one go in the Supabase SQL Editor.
-- ============================================================


-- ──────────────────────────────────────────────────────────
-- 1. hard75_access  (exists — patch missing columns)
-- ──────────────────────────────────────────────────────────
create table if not exists public.hard75_access (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  enabled    boolean not null default false,
  enabled_by uuid references auth.users(id) on delete set null,
  enabled_at timestamptz
);
alter table public.hard75_access
  add column if not exists enabled_by uuid references auth.users(id) on delete set null;
alter table public.hard75_access
  add column if not exists enabled_at timestamptz;

alter table public.hard75_access enable row level security;
drop policy if exists "hard75_access_own" on public.hard75_access;
create policy "hard75_access_own" on public.hard75_access
  for select using (user_id = auth.uid());


-- ──────────────────────────────────────────────────────────
-- 2. hard75_challenges  (exists — add every possibly-missing column)
-- ──────────────────────────────────────────────────────────
alter table public.hard75_challenges
  add column if not exists start_date date not null default now()::date;
-- Keep NOT NULL but drop the transient default so inserts must supply it
alter table public.hard75_challenges
  alter column start_date drop default;

alter table public.hard75_challenges
  add column if not exists status text not null default 'active';
alter table public.hard75_challenges
  add column if not exists created_at timestamptz not null default now();

alter table public.hard75_challenges enable row level security;
drop policy if exists "hard75_challenges_own" on public.hard75_challenges;
create policy "hard75_challenges_own" on public.hard75_challenges
  for select using (user_id = auth.uid());
create index if not exists idx_hard75_challenges_user
  on public.hard75_challenges(user_id, created_at desc);


-- ──────────────────────────────────────────────────────────
-- 3. hard75_daily_logs  (does not exist — create fresh)
-- ──────────────────────────────────────────────────────────
create table if not exists public.hard75_daily_logs (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  date          date        not null,
  workout1_done boolean     not null default false,
  workout2_done boolean     not null default false,
  water_done    boolean     not null default false,
  reading_done  boolean     not null default false,
  diet_done     boolean     not null default false,
  photo_done    boolean     not null default false,
  all_done      boolean     not null default false,
  created_at    timestamptz not null default now(),
  unique(user_id, date)
);
alter table public.hard75_daily_logs enable row level security;
drop policy if exists "hard75_daily_logs_own" on public.hard75_daily_logs;
create policy "hard75_daily_logs_own" on public.hard75_daily_logs
  for select using (user_id = auth.uid());
create index if not exists idx_hard75_daily_logs_user_date
  on public.hard75_daily_logs(user_id, date desc);


-- ──────────────────────────────────────────────────────────
-- 4. hard75_workouts
-- ──────────────────────────────────────────────────────────
create table if not exists public.hard75_workouts (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  date             date        not null,
  type             text        not null check (type in ('indoor', 'outdoor')),
  duration_minutes int         not null default 45,
  notes            text,
  created_at       timestamptz not null default now()
);
alter table public.hard75_workouts enable row level security;
drop policy if exists "hard75_workouts_own" on public.hard75_workouts;
create policy "hard75_workouts_own" on public.hard75_workouts
  for select using (user_id = auth.uid());
create index if not exists idx_hard75_workouts_user_date
  on public.hard75_workouts(user_id, date desc);


-- ──────────────────────────────────────────────────────────
-- 5. hard75_water_logs
-- ──────────────────────────────────────────────────────────
create table if not exists public.hard75_water_logs (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  date       date        not null,
  amount_ml  int         not null default 0,
  target_ml  int         not null default 3785,
  created_at timestamptz not null default now(),
  unique(user_id, date)
);
alter table public.hard75_water_logs enable row level security;
drop policy if exists "hard75_water_logs_own" on public.hard75_water_logs;
create policy "hard75_water_logs_own" on public.hard75_water_logs
  for select using (user_id = auth.uid());
create index if not exists idx_hard75_water_logs_user_date
  on public.hard75_water_logs(user_id, date desc);


-- ──────────────────────────────────────────────────────────
-- 6. hard75_reading_logs
-- ──────────────────────────────────────────────────────────
create table if not exists public.hard75_reading_logs (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  date       date        not null,
  pages_read int         not null default 0,
  book_title text,
  notes      text,
  created_at timestamptz not null default now(),
  unique(user_id, date)
);
alter table public.hard75_reading_logs enable row level security;
drop policy if exists "hard75_reading_logs_own" on public.hard75_reading_logs;
create policy "hard75_reading_logs_own" on public.hard75_reading_logs
  for select using (user_id = auth.uid());
create index if not exists idx_hard75_reading_logs_user_date
  on public.hard75_reading_logs(user_id, date desc);


-- ──────────────────────────────────────────────────────────
-- 7. hard75_diet_logs
-- ──────────────────────────────────────────────────────────
create table if not exists public.hard75_diet_logs (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  date       date        not null,
  followed   boolean     not null default false,
  notes      text,
  created_at timestamptz not null default now(),
  unique(user_id, date)
);
alter table public.hard75_diet_logs enable row level security;
drop policy if exists "hard75_diet_logs_own" on public.hard75_diet_logs;
create policy "hard75_diet_logs_own" on public.hard75_diet_logs
  for select using (user_id = auth.uid());
create index if not exists idx_hard75_diet_logs_user_date
  on public.hard75_diet_logs(user_id, date desc);


-- ──────────────────────────────────────────────────────────
-- 8. hard75_progress_photos
-- ──────────────────────────────────────────────────────────
create table if not exists public.hard75_progress_photos (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  date       date        not null,
  day_number int,
  photo_url  text        not null,
  notes      text,
  created_at timestamptz not null default now()
);
alter table public.hard75_progress_photos enable row level security;
drop policy if exists "hard75_photos_own" on public.hard75_progress_photos;
create policy "hard75_photos_own" on public.hard75_progress_photos
  for select using (user_id = auth.uid());
create index if not exists idx_hard75_photos_user_date
  on public.hard75_progress_photos(user_id, date desc);


-- ──────────────────────────────────────────────────────────
-- 9. hard75_journals
-- ──────────────────────────────────────────────────────────
create table if not exists public.hard75_journals (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  date              date        not null,
  day_number        int,
  mood              smallint    check (mood between 1 and 5),
  energy            smallint    check (energy between 1 and 5),
  rating            smallint    check (rating between 1 and 5),
  biggest_win       text,
  biggest_challenge text,
  notes             text,
  created_at        timestamptz not null default now(),
  unique(user_id, date)
);
alter table public.hard75_journals enable row level security;
drop policy if exists "hard75_journals_own" on public.hard75_journals;
create policy "hard75_journals_own" on public.hard75_journals
  for select using (user_id = auth.uid());
create index if not exists idx_hard75_journals_user_date
  on public.hard75_journals(user_id, date desc);


-- ──────────────────────────────────────────────────────────
-- 10. hard75_measurements
-- ──────────────────────────────────────────────────────────
create table if not exists public.hard75_measurements (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  date             date        not null,
  weight_kg        numeric(5,2),
  target_weight_kg numeric(5,2),
  body_fat_pct     numeric(4,1),
  chest_cm         numeric(5,1),
  waist_cm         numeric(5,1),
  hips_cm          numeric(5,1),
  arms_cm          numeric(5,1),
  thighs_cm        numeric(5,1),
  created_at       timestamptz not null default now()
);
alter table public.hard75_measurements enable row level security;
drop policy if exists "hard75_measurements_own" on public.hard75_measurements;
create policy "hard75_measurements_own" on public.hard75_measurements
  for select using (user_id = auth.uid());
create index if not exists idx_hard75_measurements_user_date
  on public.hard75_measurements(user_id, date desc);


-- ──────────────────────────────────────────────────────────
-- 11. hard75_achievements
-- ──────────────────────────────────────────────────────────
create table if not exists public.hard75_achievements (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  achievement_key text        not null,
  xp              int         not null default 0,
  earned_at       timestamptz not null default now(),
  unique(user_id, achievement_key)
);
alter table public.hard75_achievements enable row level security;
drop policy if exists "hard75_achievements_own" on public.hard75_achievements;
create policy "hard75_achievements_own" on public.hard75_achievements
  for select using (user_id = auth.uid());


-- ──────────────────────────────────────────────────────────
-- 12. hard75_settings  (per-user preferences)
-- ──────────────────────────────────────────────────────────
create table if not exists public.hard75_settings (
  user_id               uuid        primary key references auth.users(id) on delete cascade,
  water_goal_ml         int         not null default 3785,
  units                 text        not null default 'metric' check (units in ('metric', 'imperial')),
  workout_reminder_time text,
  reading_reminder_time text,
  diet_reminder_time    text,
  updated_at            timestamptz not null default now()
);
alter table public.hard75_settings enable row level security;
drop policy if exists "hard75_settings_own" on public.hard75_settings;
create policy "hard75_settings_own" on public.hard75_settings
  for select using (user_id = auth.uid());


-- ──────────────────────────────────────────────────────────
-- 13. hard75_module_settings  (global singleton, id always = 1)
-- ──────────────────────────────────────────────────────────
create table if not exists public.hard75_module_settings (
  id                    int         primary key default 1,
  enabled_globally      boolean     not null default true,
  default_water_goal_ml int         not null default 3785,
  updated_at            timestamptz not null default now(),
  check (id = 1)
);
alter table public.hard75_module_settings enable row level security;
-- No user-facing RLS policy; reads/writes go through service role only.

-- Seed the singleton row so the first SELECT always returns a row.
insert into public.hard75_module_settings (id, enabled_globally, default_water_goal_ml)
values (1, true, 3785)
on conflict (id) do nothing;
