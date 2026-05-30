-- ============================================================
-- EdTech Study Platform — Complete Production PostgreSQL Schema
-- Generated from full codebase analysis (all routes, types, API spec)
-- Safe to run on a fresh database. Idempotent (safe to re-run).
-- ============================================================

-- ── 1. Extensions ─────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";   -- uuid_generate_v4()
create extension if not exists "pg_trgm";     -- trigram full-text search on notes
create extension if not exists "pg_cron";     -- scheduled cleanup jobs (requires Pro plan)

-- ── 2. Enum Types ─────────────────────────────────────────────────────────────
do $$ begin create type user_role as enum ('super_admin','admin','student');
exception when duplicate_object then null; end $$;

do $$ begin create type user_status as enum ('active','suspended','pending_approval');
exception when duplicate_object then null; end $$;

do $$ begin create type quiz_type as enum (
  'lecture_quiz','dpp','pyqs','topic_test',
  'chapter_test','subject_test','grand_test'
);
exception when duplicate_object then null; end $$;

do $$ begin create type attempt_status as enum (
  'in_progress','paused','submitted','expired','abandoned'
);
exception when duplicate_object then null; end $$;

do $$ begin create type task_status as enum ('pending','in_progress','completed','skipped');
exception when duplicate_object then null; end $$;

do $$ begin create type task_source as enum ('auto','manual');
exception when duplicate_object then null; end $$;

do $$ begin create type task_target_type as enum (
  'platform_subtopic','personal_topic','free_text'
);
exception when duplicate_object then null; end $$;

-- ── 3. profiles ───────────────────────────────────────────────────────────────
-- Linked 1-to-1 with auth.users via Supabase Auth trigger below.
create table if not exists profiles (
  id             uuid        primary key references auth.users(id) on delete cascade,
  full_name      text        not null,
  mobile_number  text,
  email          text,
  role           user_role   not null default 'student',
  is_approved    boolean     not null default false,
  status         user_status not null default 'pending_approval',
  email_verified boolean     not null default false,
  avatar_url     text,                          -- Supabase Storage path: "<userId>/photo.jpg"
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── 3a. Auth trigger — first user = super_admin, rest = student/pending ───────
-- FIX: Do NOT update auth.users inside this trigger.
--   GoTrue holds a row-lock during INSERT; any UPDATE of the same row in the
--   trigger body causes "tuple concurrently updated" → "Database error creating
--   new user". Role/status live in profiles only (source of truth).
-- FIX: SET search_path = '' required for SECURITY DEFINER functions in Supabase.
create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  user_count   int;
  new_role     public.user_role;
  new_status   public.user_status;
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── 4. Content Tables ─────────────────────────────────────────────────────────

create table if not exists subjects (
  id          uuid    primary key default uuid_generate_v4(),
  title       text    not null,
  description text,
  order_index int     not null default 0,
  icon_url    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists chapters (
  id          uuid    primary key default uuid_generate_v4(),
  subject_id  uuid    not null references subjects(id) on delete cascade,
  title       text    not null,
  description text,
  order_index int     not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists topics (
  id                  uuid    primary key default uuid_generate_v4(),
  chapter_id          uuid    not null references chapters(id) on delete cascade,
  title               text    not null,
  description         text,
  order_index         int     not null default 0,
  is_active           boolean not null default true,
  telegram_link       text,              -- Direct private Telegram message URL (e.g. https://t.me/c/1234567890/42)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- lectures: thin wrapper around a topic's study material link.
-- Fields are fetched via topics.select("*, lectures(*)") and
-- lecture_clicks.select("lectures!inner(topic_id, ...)").
create table if not exists lectures (
  id                  uuid    primary key default uuid_generate_v4(),
  topic_id            uuid    not null references topics(id) on delete cascade,
  telegram_link       text,              -- Direct private Telegram message URL
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

-- ── 5. Quizzes & Questions ────────────────────────────────────────────────────

create table if not exists quizzes (
  id               uuid      primary key default uuid_generate_v4(),
  topic_id         uuid      references topics(id)    on delete cascade,   -- null for chapter/subject/grand tests
  chapter_id       uuid      references chapters(id)  on delete cascade,
  subject_id       uuid      references subjects(id)  on delete cascade,
  title            text      not null,
  type             quiz_type not null,
  passing_score    numeric   not null default 60,   -- percentage required to pass
  max_attempts     int       not null default 3,
  duration_minutes int       not null default 30,
  negative_marking numeric   not null default 0,    -- marks deducted per wrong answer
  is_active        boolean   not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists quiz_questions (
  id                 uuid    primary key default uuid_generate_v4(),
  quiz_id            uuid    not null references quizzes(id) on delete cascade,
  question_text      text    not null,
  options            jsonb   not null,         -- {"A":"...", "B":"...", "C":"...", "D":"..."}
  correct_answer     text    not null,         -- one of the options keys: "A","B","C","D"
  explanation        text,
  difficulty         int     not null default 1 check (difficulty between 1 and 5),
  order_index        int     not null default 0,
  video_solution_url text,                    -- YouTube URL for worked solution
  qr_code_url        text,                    -- QR code image URL (generated by /qr/generate)
  created_at         timestamptz not null default now()
);

-- ── 6. Progress Tables ────────────────────────────────────────────────────────
-- Gate logic: lecture → lecture_quiz → dpp → pyqs → topic_test (each requires prior step)

create table if not exists user_topic_progress (
  user_id            uuid    not null references profiles(id) on delete cascade,
  topic_id           uuid    not null references topics(id)   on delete cascade,
  -- gate steps (set by exam submit cascade in exams.ts)
  lecture_clicked    boolean not null default false,
  lecture_quiz_passed boolean not null default false,
  lecture_quiz_score  numeric,
  dpp_completed      boolean not null default false,
  dpp_score          numeric,
  pyqs_completed     boolean not null default false,
  pyqs_score         numeric,
  topic_test_passed  boolean not null default false,
  topic_test_score   numeric,
  topic_complete     boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (user_id, topic_id)
);

create table if not exists user_chapter_progress (
  user_id               uuid    not null references profiles(id)  on delete cascade,
  chapter_id            uuid    not null references chapters(id)   on delete cascade,
  all_topics_complete   boolean not null default false,
  chapter_test_attempted boolean not null default false,
  chapter_test_passed   boolean not null default false,
  pdf_upload_unlocked   boolean not null default false,   -- gated by chapter_test_attempted
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  primary key (user_id, chapter_id)
);

create table if not exists user_subject_progress (
  user_id               uuid    not null references profiles(id)  on delete cascade,
  subject_id            uuid    not null references subjects(id)  on delete cascade,
  all_chapters_complete boolean not null default false,
  subject_test_attempted boolean not null default false,
  subject_test_passed   boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  primary key (user_id, subject_id)
);

-- ── 7. Exam Attempts ──────────────────────────────────────────────────────────

create table if not exists user_attempts (
  id                     uuid           primary key default uuid_generate_v4(),
  user_id                uuid           not null references profiles(id) on delete cascade,
  quiz_id                uuid           not null references quizzes(id)  on delete cascade,
  status                 attempt_status not null default 'in_progress',
  score                  numeric        not null default 0,
  total_marks            int            not null default 0,
  accuracy               numeric        not null default 0,   -- 0–100 percentage
  time_taken_ms          bigint         not null default 0,
  negative_marks_applied numeric        not null default 0,
  is_correct_summary     jsonb,                              -- {correct, incorrect, skipped}
  started_at             timestamptz    not null default now(),
  submitted_at           timestamptz,
  created_at             timestamptz    not null default now()
);

create table if not exists user_answers (
  id                 uuid    primary key default uuid_generate_v4(),
  attempt_id         uuid    not null references user_attempts(id) on delete cascade,
  question_id        uuid    not null references quiz_questions(id) on delete cascade,
  selected_option    text,                  -- null = skipped
  correct_answer     text    not null,
  is_correct         boolean not null default false,
  time_spent_ms      bigint  not null default 0,
  -- Snapshot columns: stored at submit time so results survive question edits
  explanation        text,
  video_solution_url text,
  qr_code_url        text,
  created_at         timestamptz not null default now()
);

-- ── 8. PDF Notes (B2 Storage) ─────────────────────────────────────────────────
-- Upload gated by user_chapter_progress.pdf_upload_unlocked.
-- Files are stored in Backblaze B2; only metadata lives here.

create table if not exists user_notes (
  id              uuid    primary key default uuid_generate_v4(),
  user_id         uuid    not null references profiles(id)  on delete cascade,
  chapter_id      uuid    not null references chapters(id)  on delete cascade,
  title           text    not null,
  b2_storage_path text    not null,              -- path used for presigned URL generation
  b2_file_id      text,                          -- B2 file ID; populated after client confirms upload
  pdf_size_bytes  bigint  not null default 0,
  file_hash       text,                          -- SHA-256; used for duplicate detection
  content_type    text    not null default 'application/pdf',
  content_text    text,                          -- extracted text for full-text search
  content_tsv     tsvector generated always as (to_tsvector('english', coalesce(content_text, ''))) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── 9. Productivity Tables ────────────────────────────────────────────────────

create table if not exists pomodoro_sessions (
  id               uuid  primary key default uuid_generate_v4(),
  user_id          uuid  not null references profiles(id) on delete cascade,
  duration_seconds int   not null default 0,
  topic_context    text,                         -- free-text label for what they studied
  start_time       timestamptz not null,
  end_time         timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists study_tasks (
  id           uuid             primary key default uuid_generate_v4(),
  user_id      uuid             not null references profiles(id) on delete cascade,
  title        text             not null,
  description  text,
  target_type  task_target_type not null default 'free_text',
  target_id    uuid,                            -- topic ID for platform_subtopic tasks
  priority     int              not null default 0,
  due_date     date,
  order_index  int              not null default 0,
  status       task_status      not null default 'pending',
  source       task_source      not null default 'manual',
  completed_at timestamptz,
  created_at   timestamptz      not null default now(),
  updated_at   timestamptz      not null default now()
);

create table if not exists external_tests (
  id              uuid    primary key default uuid_generate_v4(),
  user_id         uuid    not null references profiles(id) on delete cascade,
  exam_name       text    not null,
  exam_date       date    not null,
  score_obtained  numeric not null check (score_obtained >= 0),
  total_marks     numeric not null check (total_marks > 0),
  percentile      numeric check (percentile between 0 and 100),
  rank            int     check (rank > 0),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ext_test_score_valid check (score_obtained <= total_marks)
);

-- ── 10. Lecture Click Tracking ────────────────────────────────────────────────
-- Used for admin CTR analytics and to unlock lecture_quiz gate step.

create table if not exists lecture_clicks (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references profiles(id)  on delete cascade,
  lecture_id uuid          references lectures(id)  on delete set null,
  clicked_at timestamptz   not null default now()
);

-- ── 11. System Tables ─────────────────────────────────────────────────────────

-- Gate configuration: passing scores, attempt limits, storage caps.
-- Keys: lecture_quiz_passing_score, topic_test_passing_score, etc.
create table if not exists system_config (
  key        text    primary key,
  value      jsonb   not null,
  updated_at timestamptz not null default now(),
  updated_by uuid    references profiles(id) on delete set null
);

-- Append-only audit trail for admin actions.
create table if not exists audit_logs (
  id          uuid  primary key default uuid_generate_v4(),
  actor_id    uuid  references profiles(id) on delete set null,
  action      text  not null,        -- e.g. "user_approved", "role_changed", "progress_reset"
  target_type text  not null,        -- e.g. "profile"
  target_id   uuid  not null,
  new_value   jsonb,                 -- snapshot of changed values
  created_at  timestamptz not null default now()
);

-- ── 12. Notifications ─────────────────────────────────────────────────────────

create table if not exists notifications (
  id         uuid    primary key default uuid_generate_v4(),
  user_id    uuid    not null references profiles(id) on delete cascade,
  title      text    not null,
  message    text    not null,
  type       text    not null default 'info',   -- 'info' | 'approval' | 'plan'
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── 13. Push Subscriptions (Web Push / VAPID) ─────────────────────────────────

create table if not exists push_subscriptions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  endpoint    text not null,
  keys_p256dh text not null,
  keys_auth   text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- ── 14. Rate Limits (DB-backed, survives server restarts) ─────────────────────
-- Each row = one request hit. Count rows per key within the window to enforce limits.
-- Prefixes: "exam-start:<userId>", "register:<ip>", "resend:<email>", "pwd-change:<userId>"

create table if not exists rate_limits (
  id         uuid primary key default uuid_generate_v4(),
  key        text        not null,
  created_at timestamptz not null default now()
);

-- ── 15. Indexes ───────────────────────────────────────────────────────────────

-- Content hierarchy traversal
create index if not exists idx_chapters_subject_id    on chapters(subject_id);
create index if not exists idx_topics_chapter_id      on topics(chapter_id);
create index if not exists idx_lectures_topic_id      on lectures(topic_id);

-- Quiz access
create index if not exists idx_quizzes_topic_id       on quizzes(topic_id);
create index if not exists idx_quizzes_chapter_id     on quizzes(chapter_id);
create index if not exists idx_quizzes_subject_id     on quizzes(subject_id);
create index if not exists idx_quizzes_type           on quizzes(type);
create index if not exists idx_quiz_questions_quiz_id on quiz_questions(quiz_id);

-- Exam performance (most-queried joins)
create index if not exists idx_user_attempts_user_id  on user_attempts(user_id);
create index if not exists idx_user_attempts_quiz_id  on user_attempts(quiz_id);
create index if not exists idx_user_attempts_status   on user_attempts(status);
create index if not exists idx_user_answers_attempt   on user_answers(attempt_id);
create index if not exists idx_user_answers_question  on user_answers(question_id);

-- Progress lookups (gate checks are hot paths, < 50ms target)
create index if not exists idx_topic_progress_user    on user_topic_progress(user_id);
create index if not exists idx_chapter_progress_user  on user_chapter_progress(user_id);
create index if not exists idx_subject_progress_user  on user_subject_progress(user_id);

-- Notes (storage quota and dedup checks)
create index if not exists idx_user_notes_user_id     on user_notes(user_id);
create index if not exists idx_user_notes_chapter_id  on user_notes(chapter_id);
create index if not exists idx_user_notes_file_hash   on user_notes(user_id, file_hash) where file_hash is not null;
create index if not exists idx_user_notes_content_tsv on user_notes using gin(content_tsv);

-- Productivity
create index if not exists idx_pomodoro_user_time     on pomodoro_sessions(user_id, start_time desc);
create index if not exists idx_study_tasks_user       on study_tasks(user_id, order_index asc);
create index if not exists idx_external_tests_user    on external_tests(user_id, exam_date desc);

-- Notifications
create index if not exists idx_notifications_user_id  on notifications(user_id);
create index if not exists idx_notifications_unread   on notifications(user_id, is_read) where is_read = false;

-- Lecture CTR analytics
create index if not exists idx_lecture_clicks_user    on lecture_clicks(user_id);
create index if not exists idx_lecture_clicks_lecture on lecture_clicks(lecture_id);

-- Push subscriptions
create index if not exists idx_push_subscriptions_user on push_subscriptions(user_id);

-- Rate limiting (key + time window lookups are the critical query pattern)
create index if not exists idx_rate_limits_key_time   on rate_limits(key, created_at desc);

-- Audit log filtering
create index if not exists idx_audit_logs_actor       on audit_logs(actor_id);
create index if not exists idx_audit_logs_target      on audit_logs(target_type, target_id);
create index if not exists idx_audit_logs_created_at  on audit_logs(created_at desc);

-- ── 16. Row Level Security ────────────────────────────────────────────────────

alter table profiles           enable row level security;
alter table subjects           enable row level security;
alter table chapters           enable row level security;
alter table topics             enable row level security;
alter table lectures           enable row level security;
alter table lecture_clicks     enable row level security;
alter table quizzes            enable row level security;
alter table quiz_questions     enable row level security;
alter table user_topic_progress    enable row level security;
alter table user_chapter_progress  enable row level security;
alter table user_subject_progress  enable row level security;
alter table user_attempts      enable row level security;
alter table user_answers       enable row level security;
alter table user_notes         enable row level security;
alter table pomodoro_sessions  enable row level security;
alter table study_tasks        enable row level security;
alter table external_tests     enable row level security;
alter table lecture_clicks     enable row level security;
alter table system_config      enable row level security;
alter table audit_logs         enable row level security;
alter table notifications      enable row level security;
alter table push_subscriptions enable row level security;
alter table rate_limits        enable row level security;

-- Helper: is the calling user an admin or super_admin?
create or replace function is_admin()
returns boolean language sql security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','super_admin')
  );
$$;

-- Helper: is the calling user specifically a super_admin?
create or replace function is_super_admin()
returns boolean language sql security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin'
  );
$$;

-- Add old_value column to audit_logs for before/after change tracking
alter table audit_logs add column if not exists old_value jsonb;

-- ── profiles ─────────────────────────────────
drop policy if exists "profiles_own_read"    on profiles;
drop policy if exists "profiles_admin_read"  on profiles;
drop policy if exists "profiles_own_update"  on profiles;
drop policy if exists "profiles_admin_update" on profiles;

create policy "profiles_own_read"    on profiles for select using (auth.uid() = id);
create policy "profiles_admin_read"  on profiles for select using (is_admin());
create policy "profiles_own_update"  on profiles for update using (auth.uid() = id);
-- Admins can only update student profiles; super_admins can update any profile.
-- NOTE: `role` in the expression below refers to the TARGET row's role column.
create policy "profiles_admin_update" on profiles for update using (
  is_super_admin()
  or (
    is_admin()
    and role = 'student'
  )
);

-- ── subjects / chapters / topics / lectures ───
drop policy if exists "subjects_read"         on subjects;
drop policy if exists "subjects_admin_write"  on subjects;
drop policy if exists "chapters_read"         on chapters;
drop policy if exists "chapters_admin_write"  on chapters;
drop policy if exists "topics_read"           on topics;
drop policy if exists "topics_admin_write"    on topics;
drop policy if exists "lectures_read"         on lectures;
drop policy if exists "lectures_admin_write"  on lectures;

create policy "subjects_read"        on subjects       for select using (auth.role() = 'authenticated');
create policy "subjects_admin_write" on subjects       for all    using (is_admin());
create policy "chapters_read"        on chapters       for select using (auth.role() = 'authenticated');
create policy "chapters_admin_write" on chapters       for all    using (is_admin());
create policy "topics_read"          on topics         for select using (auth.role() = 'authenticated');
create policy "topics_admin_write"   on topics         for all    using (is_admin());
create policy "lectures_read"        on lectures       for select using (auth.role() = 'authenticated');
create policy "lectures_admin_write" on lectures       for all    using (is_admin());

-- ── quizzes / quiz_questions ──────────────────
drop policy if exists "quizzes_read"               on quizzes;
drop policy if exists "quizzes_admin_write"        on quizzes;
drop policy if exists "quiz_questions_read"        on quiz_questions;
drop policy if exists "quiz_questions_admin_write" on quiz_questions;

create policy "quizzes_read"               on quizzes        for select using (auth.role() = 'authenticated');
create policy "quizzes_admin_write"        on quizzes        for all    using (is_admin());
create policy "quiz_questions_read"        on quiz_questions  for select using (auth.role() = 'authenticated');
create policy "quiz_questions_admin_write" on quiz_questions  for all    using (is_admin());

-- ── progress tables ───────────────────────────
drop policy if exists "topic_progress_own"    on user_topic_progress;
drop policy if exists "topic_progress_admin"  on user_topic_progress;
drop policy if exists "chapter_progress_own"  on user_chapter_progress;
drop policy if exists "chapter_progress_admin" on user_chapter_progress;
drop policy if exists "subject_progress_own"  on user_subject_progress;
drop policy if exists "subject_progress_admin" on user_subject_progress;

create policy "topic_progress_own"    on user_topic_progress   for all    using (user_id = auth.uid());
create policy "topic_progress_admin"  on user_topic_progress   for select using (is_admin());
create policy "chapter_progress_own"  on user_chapter_progress for all    using (user_id = auth.uid());
create policy "chapter_progress_admin" on user_chapter_progress for select using (is_admin());
create policy "subject_progress_own"  on user_subject_progress for all    using (user_id = auth.uid());
create policy "subject_progress_admin" on user_subject_progress for select using (is_admin());

-- ── exam tables ───────────────────────────────
drop policy if exists "attempts_own"          on user_attempts;
drop policy if exists "attempts_admin"        on user_attempts;
drop policy if exists "answers_own"           on user_answers;
drop policy if exists "answers_admin"         on user_answers;

create policy "attempts_own"   on user_attempts for all    using (user_id = auth.uid());
create policy "attempts_admin" on user_attempts for select using (is_admin());
create policy "answers_own"    on user_answers  for all    using (
  exists (select 1 from user_attempts a where a.id = attempt_id and a.user_id = auth.uid())
);
create policy "answers_admin"  on user_answers  for select using (is_admin());

-- ── notes ─────────────────────────────────────
drop policy if exists "notes_own" on user_notes;
create policy "notes_own" on user_notes for all using (user_id = auth.uid());

-- ── productivity ──────────────────────────────
drop policy if exists "pomodoro_own"   on pomodoro_sessions;
drop policy if exists "tasks_own"      on study_tasks;
drop policy if exists "ext_tests_own"  on external_tests;

create policy "pomodoro_own"  on pomodoro_sessions for all using (user_id = auth.uid());
create policy "tasks_own"     on study_tasks        for all using (user_id = auth.uid());
create policy "ext_tests_own" on external_tests     for all using (user_id = auth.uid());

-- ── lecture clicks ────────────────────────────
drop policy if exists "lecture_clicks_own"   on lecture_clicks;
drop policy if exists "lecture_clicks_admin" on lecture_clicks;

create policy "lecture_clicks_own"   on lecture_clicks for all    using (user_id = auth.uid());
create policy "lecture_clicks_admin" on lecture_clicks for select using (is_admin());

-- ── system_config ─────────────────────────────
drop policy if exists "system_config_read"         on system_config;
drop policy if exists "system_config_admin_write"  on system_config;

create policy "system_config_read"        on system_config for select using (auth.role() = 'authenticated');
create policy "system_config_admin_write" on system_config for all    using (is_admin());

-- ── audit_logs ────────────────────────────────
-- Written only by the Express server (service role key). Admins can read.
drop policy if exists "audit_logs_admin_read" on audit_logs;
create policy "audit_logs_admin_read" on audit_logs for select using (is_admin());

-- ── notifications ─────────────────────────────
drop policy if exists "notifications_select" on notifications;
drop policy if exists "notifications_update" on notifications;

create policy "notifications_select" on notifications for select using (user_id = auth.uid());
create policy "notifications_update" on notifications for update using (user_id = auth.uid());
-- INSERT is done server-side via service role key (bypasses RLS)

-- ── push_subscriptions ────────────────────────
drop policy if exists "push_own"    on push_subscriptions;
create policy "push_own" on push_subscriptions for all using (user_id = auth.uid());
-- SELECT for sending pushes is done via service role key (bypasses RLS)

-- ── rate_limits ───────────────────────────────
-- Entirely server-managed (service role key). No user-facing RLS needed.
drop policy if exists "rate_limits_service" on rate_limits;
create policy "rate_limits_service" on rate_limits for all using (false);
-- Service role bypasses RLS; no authenticated user should access this table directly.

-- ── 17. Seed: system_config defaults ──────────────────────────────────────────
insert into system_config (key, value) values
  ('lecture_quiz_passing_score',   '60'::jsonb),
  ('topic_test_passing_score',     '70'::jsonb),
  ('chapter_test_passing_score',   '60'::jsonb),
  ('subject_test_passing_score',   '60'::jsonb),
  ('max_quiz_attempts',            '3'::jsonb),
  ('max_exam_pauses',              '2'::jsonb),
  ('exam_timeout_warning_mins',    '5'::jsonb),
  ('per_user_storage_limit_mb',    '500'::jsonb),
  ('global_storage_limit_gb',      '10'::jsonb),
  ('require_email_verification',   'true'::jsonb)
on conflict (key) do nothing;

-- ── 18. Seed: sample subjects (JEE/NEET starter content) ─────────────────────
insert into subjects (title, description, order_index, is_active) values
  ('Physics',   'Mechanics, Thermodynamics, Optics, Electrostatics, Modern Physics', 1, true),
  ('Chemistry', 'Organic, Inorganic, Physical Chemistry',                            2, true),
  ('Mathematics','Algebra, Calculus, Coordinate Geometry, Trigonometry',             3, true)
on conflict do nothing;

-- ── 19. pg_cron Scheduled Jobs ────────────────────────────────────────────────
-- Requires the pg_cron extension (Supabase Pro plan).
-- Runs hourly — deletes rate_limit rows older than 2 hours.
-- The app also performs best-effort per-request cleanup, but this
-- guarantees the table never grows unbounded.

select cron.schedule(
  'rate-limits-cleanup',
  '0 * * * *',
  $cron$
    delete from public.rate_limits
    where created_at < now() - interval '2 hours';
  $cron$
);

-- ── 20. Migration-safe additive columns (safe to run on existing DBs) ─────────
-- These were added after the initial schema — `if not exists` makes them safe.
alter table study_tasks   add column if not exists order_index int not null default 0;
alter table user_notes    add column if not exists content_text text;
alter table user_notes    add column if not exists file_hash    text;
alter table user_notes    add column if not exists b2_file_id   text;

-- ── 21. Supabase Storage: avatars bucket ──────────────────────────────────────
-- Profile photos are stored here. Bucket is public so permanent public URLs
-- are served via getPublicUrl() — no signing, no expiry.
-- Path convention: "<userId>/photo.jpg"
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  524288,   -- 512 KB max per photo
  '{image/jpeg,image/png,image/webp}'
)
on conflict (id) do update set
  public           = excluded.public,
  file_size_limit  = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS: authenticated users can upload/overwrite only their own folder
do $$ begin
  create policy "avatars: owner upload"
    on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "avatars: owner update"
    on storage.objects for update
    to authenticated
    using (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "avatars: owner delete"
    on storage.objects for delete
    to authenticated
    using (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "avatars: public read"
    on storage.objects for select
    to public
    using (bucket_id = 'avatars');
exception when duplicate_object then null; end $$;

-- ── 22. Role-Based Content & Exam Access Control ──────────────────────────────
-- Tracks who created each content row (for admin isolation + audit).
-- Enforcement is done in the Express API server (service-role key bypasses RLS,
-- so ownership checks live in route logic, not in RLS policies).

alter table subjects  add column if not exists creator_id uuid references profiles(id) on delete set null;
alter table chapters  add column if not exists creator_id uuid references profiles(id) on delete set null;
alter table topics    add column if not exists creator_id uuid references profiles(id) on delete set null;
alter table quizzes   add column if not exists creator_id uuid references profiles(id) on delete set null;

-- allowed_roles: which user roles can see and start this quiz.
-- Defaults to all roles so all existing quizzes remain accessible.
alter table quizzes add column if not exists allowed_roles text[]
  not null default array['student','admin','super_admin'];

-- Explicit sharing between super_admin accounts.
-- Lets SA1 grant SA2 full management rights over SA1's content.
create table if not exists content_access_grants (
  id           uuid        primary key default uuid_generate_v4(),
  content_type text        not null check (content_type in ('subject','quiz')),
  content_id   uuid        not null,
  granted_to   uuid        not null references profiles(id) on delete cascade,
  granted_by   uuid        not null references profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (content_type, content_id, granted_to)
);

alter table content_access_grants enable row level security;

-- Super admins can read and manage grants; service role bypasses for listing.
do $$ begin
  create policy "grants_super_admin_all"
    on content_access_grants for all
    using (is_super_admin());
exception when duplicate_object then null; end $$;

-- Fast lookup indexes
create index if not exists idx_subjects_creator_id    on subjects(creator_id);
create index if not exists idx_chapters_creator_id    on chapters(creator_id);
create index if not exists idx_topics_creator_id      on topics(creator_id);
create index if not exists idx_quizzes_creator_id     on quizzes(creator_id);
create index if not exists idx_quizzes_allowed_roles  on quizzes using gin(allowed_roles);
create index if not exists idx_grants_type_content    on content_access_grants(content_type, content_id);
create index if not exists idx_grants_grantee         on content_access_grants(granted_to);

-- ============================================================
-- SECTION 23: Topic Lecture Access Control (Checkpoint X)
-- Run in Supabase SQL Editor after Section 22.
-- Safe to re-run (all statements are idempotent).
-- ============================================================
-- NOTE: Section 24 below extends this with subject-level access control.

-- 1. Add role-based visibility to topics.
--    Defaults match existing behaviour: all roles can access all topics.
alter table topics
  add column if not exists allowed_roles text[]
    not null default array['student','admin','super_admin'];

alter table topics
  add column if not exists is_creator_only boolean
    not null default false;

-- 2. Extend the content_access_grants constraint to include topics.
--    Drop the old 2-value check and replace it with a 3-value check.
alter table content_access_grants
  drop constraint if exists content_access_grants_content_type_check;

alter table content_access_grants
  add constraint content_access_grants_content_type_check
    check (content_type in ('subject','quiz','topic'));

-- 3. Performance indexes.
create index if not exists idx_topics_allowed_roles
  on topics using gin(allowed_roles);

create index if not exists idx_topics_is_creator_only
  on topics(is_creator_only);

-- 4. Existing data: nothing to migrate.
--    All topics get the defaults above (all-roles accessible, not creator-only),
--    which exactly matches the pre-migration behaviour.

-- ============================================================
-- SECTION 24: Subject-Level Access Control (Checkpoint X)
-- Run in Supabase SQL Editor after Section 23.
-- Safe to re-run (all statements are idempotent).
-- ============================================================

-- 1. Add visibility fields to subjects.
--    Defaults match existing behaviour: all roles can access all subjects.
alter table subjects
  add column if not exists visibility_roles text[]
    not null default array['student','admin','super_admin'];

alter table subjects
  add column if not exists is_creator_only boolean
    not null default false;

-- 2. Update subjects RLS: replace the broad "any authenticated user" policy
--    with a role-filtered policy that enforces subject-level isolation.
drop policy if exists "subjects_read" on subjects;

create policy "subjects_read" on subjects for select using (
  -- Super admins: see own subjects, explicitly shared subjects, or
  --   openly-visible subjects (is_creator_only=false AND super_admin in visibility_roles)
  (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
    and (
      creator_id = auth.uid()
      or (
        is_creator_only = false
        and visibility_roles @> array['super_admin']
      )
      or exists (
        select 1 from public.content_access_grants g
        where g.content_type = 'subject'
          and g.content_id = id
          and g.granted_to = auth.uid()
      )
    )
  )
  -- Admins: non-creator-only subjects visible to admins
  or (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
    and is_creator_only = false
    and visibility_roles @> array['admin']
  )
  -- Students: non-creator-only subjects visible to students
  or (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'student'
    )
    and is_creator_only = false
    and visibility_roles @> array['student']
  )
);

-- 3. Update chapters RLS: a chapter is only readable if its parent subject is
--    accessible to the calling user (strict inheritance — no override at chapter level).
drop policy if exists "chapters_read" on chapters;

create policy "chapters_read" on chapters for select using (
  exists (
    select 1 from public.subjects s
    where s.id = subject_id
      and (
        -- Super admins
        (
          exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'super_admin'
          )
          and (
            s.creator_id = auth.uid()
            or (s.is_creator_only = false and s.visibility_roles @> array['super_admin'])
            or exists (
              select 1 from public.content_access_grants g
              where g.content_type = 'subject'
                and g.content_id = s.id
                and g.granted_to = auth.uid()
            )
          )
        )
        -- Admins
        or (
          exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin'
          )
          and s.is_creator_only = false
          and s.visibility_roles @> array['admin']
        )
        -- Students
        or (
          exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'student'
          )
          and s.is_creator_only = false
          and s.visibility_roles @> array['student']
        )
      )
  )
);

-- 4. Extend content_access_grants to ensure 'subject' is in the allowed values.
--    (It was already included in the original Section 22 definition, but this
--     guard makes the migration idempotent even if running on older schemas.)
do $$ begin
  alter table content_access_grants
    drop constraint if exists content_access_grants_content_type_check;
  alter table content_access_grants
    add constraint content_access_grants_content_type_check
      check (content_type in ('subject','quiz','topic'));
exception when others then null; end $$;

-- 5. Performance indexes.
create index if not exists idx_subjects_visibility_roles
  on subjects using gin(visibility_roles);

create index if not exists idx_subjects_is_creator_only
  on subjects(is_creator_only);

-- 6. Existing data: no migration needed.
--    All existing subjects get:
--      visibility_roles = ['student','admin','super_admin']  (all roles, open)
--      is_creator_only  = false
--    This exactly preserves the pre-migration "everyone can see everything" behaviour.

-- ============================================================
-- SECTION 24 ROLLBACK (keep commented unless needed):
-- ============================================================
-- alter table subjects drop column if exists visibility_roles;
-- alter table subjects drop column if exists is_creator_only;
-- drop policy if exists "subjects_read"  on subjects;
-- drop policy if exists "chapters_read" on chapters;
-- create policy "subjects_read" on subjects for select using (auth.role() = 'authenticated');
-- create policy "chapters_read" on chapters for select using (auth.role() = 'authenticated');
