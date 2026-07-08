-- ============================================================
-- Hard75 missing-column migration
-- Run in Supabase SQL Editor if tables were created before
-- start_date / "date" columns were added to the schema.
-- Safe to re-run (all statements are idempotent).
-- ============================================================

-- hard75_challenges
alter table public.hard75_challenges
  add column if not exists start_date date not null default now()::date;

-- Remove the default after adding (it was only needed to satisfy NOT NULL
-- for existing rows; new inserts always supply the value explicitly).
alter table public.hard75_challenges
  alter column start_date drop default;

-- hard75_daily_logs
alter table public.hard75_daily_logs
  add column if not exists "date" date not null default now()::date,
  add column if not exists workout1_done boolean not null default false,
  add column if not exists workout2_done boolean not null default false,
  add column if not exists water_done    boolean not null default false,
  add column if not exists reading_done  boolean not null default false,
  add column if not exists diet_done     boolean not null default false,
  add column if not exists photo_done    boolean not null default false,
  add column if not exists all_done      boolean not null default false;

-- hard75_workouts
alter table public.hard75_workouts
  add column if not exists "date"            date not null default now()::date,
  add column if not exists type              text not null default 'indoor',
  add column if not exists duration_minutes  int  not null default 45,
  add column if not exists notes             text;

-- hard75_water_logs
alter table public.hard75_water_logs
  add column if not exists "date"      date not null default now()::date,
  add column if not exists amount_ml   int  not null default 0,
  add column if not exists target_ml   int  not null default 3785;

-- hard75_reading_logs
alter table public.hard75_reading_logs
  add column if not exists "date"       date not null default now()::date,
  add column if not exists pages_read   int  not null default 0,
  add column if not exists book_title   text,
  add column if not exists notes        text;

-- hard75_diet_logs
alter table public.hard75_diet_logs
  add column if not exists "date"    date    not null default now()::date,
  add column if not exists followed  boolean not null default false,
  add column if not exists notes     text;

-- hard75_progress_photos
alter table public.hard75_progress_photos
  add column if not exists "date"      date not null default now()::date,
  add column if not exists day_number  int,
  add column if not exists photo_url   text not null default '',
  add column if not exists notes       text;

-- hard75_journals
alter table public.hard75_journals
  add column if not exists "date"             date     not null default now()::date,
  add column if not exists day_number         int,
  add column if not exists mood               smallint,
  add column if not exists energy             smallint,
  add column if not exists rating             smallint,
  add column if not exists biggest_win        text,
  add column if not exists biggest_challenge  text,
  add column if not exists notes              text;

-- hard75_measurements
alter table public.hard75_measurements
  add column if not exists "date"            date           not null default now()::date,
  add column if not exists weight_kg         numeric(5,2),
  add column if not exists target_weight_kg  numeric(5,2),
  add column if not exists body_fat_pct      numeric(4,1),
  add column if not exists chest_cm          numeric(5,1),
  add column if not exists waist_cm          numeric(5,1),
  add column if not exists hips_cm           numeric(5,1),
  add column if not exists arms_cm           numeric(5,1),
  add column if not exists thighs_cm         numeric(5,1);

-- Recreate indexes (safe: all use IF NOT EXISTS)
create index if not exists idx_hard75_challenges_user
  on public.hard75_challenges(user_id, created_at desc);

create index if not exists idx_hard75_daily_logs_user_date
  on public.hard75_daily_logs(user_id, "date" desc);

create index if not exists idx_hard75_workouts_user_date
  on public.hard75_workouts(user_id, "date" desc);

create index if not exists idx_hard75_measurements_user
  on public.hard75_measurements(user_id, "date" desc);
