-- EdTech Study Platform — Complete Supabase Schema
-- Run this in Supabase SQL Editor

-- ── Extensions ─────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ── Enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type user_role as enum ('super_admin', 'admin', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_status as enum ('active', 'suspended', 'pending_approval');
exception when duplicate_object then null; end $$;

do $$ begin
  create type quiz_type as enum ('lecture_quiz','dpp','pyqs','topic_test','chapter_test','subject_test','grand_test');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attempt_status as enum ('in_progress','paused','submitted','expired','abandoned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('pending','in_progress','completed','skipped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_source as enum ('auto','manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_target_type as enum ('platform_subtopic','personal_topic','free_text');
exception when duplicate_object then null; end $$;

-- ── Profiles ─────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  mobile_number text,
  email         text,
  role          user_role not null default 'student',
  is_approved   boolean not null default false,
  status        user_status not null default 'pending_approval',
  email_verified boolean not null default false,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- First user becomes super_admin trigger
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  user_count int;
  new_role user_role;
  new_status user_status;
  new_approved boolean;
begin
  select count(*) into user_count from profiles;
  if user_count = 0 then
    new_role := 'super_admin';
    new_status := 'active';
    new_approved := true;
  else
    new_role := 'student';
    new_status := 'pending_approval';
    new_approved := false;
  end if;

  insert into profiles (id, full_name, mobile_number, email, role, is_approved, status, email_verified)
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

  -- Store role in user metadata
  update auth.users set raw_user_meta_data = 
    coalesce(raw_user_meta_data, '{}'::jsonb) || 
    jsonb_build_object('role', new_role::text, 'is_approved', new_approved, 'status', new_status::text)
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Content Tables ────────────────────────────────────────────────────────────
create table if not exists subjects (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  description text,
  order_index int not null default 0,
  icon_url    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists chapters (
  id          uuid primary key default uuid_generate_v4(),
  subject_id  uuid not null references subjects(id) on delete cascade,
  title       text not null,
  description text,
  order_index int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists topics (
  id                  uuid primary key default uuid_generate_v4(),
  chapter_id          uuid not null references chapters(id) on delete cascade,
  title               text not null,
  description         text,
  order_index         int not null default 0,
  is_active           boolean not null default true,
  telegram_chat_id    text,
  telegram_message_id text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists lectures (
  id                  uuid primary key default uuid_generate_v4(),
  topic_id            uuid not null references topics(id) on delete cascade,
  telegram_chat_id    text,
  telegram_message_id text,
  is_active           boolean not null default true
);

create table if not exists lecture_clicks (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references profiles(id) on delete cascade,
  lecture_id uuid references lectures(id) on delete set null,
  clicked_at timestamptz not null default now()
);

-- ── Quizzes & Questions ───────────────────────────────────────────────────────
create table if not exists quizzes (
  id               uuid primary key default uuid_generate_v4(),
  topic_id         uuid references topics(id) on delete cascade,
  chapter_id       uuid references chapters(id) on delete cascade,
  subject_id       uuid references subjects(id) on delete cascade,
  title            text not null,
  type             quiz_type not null,
  passing_score    numeric not null default 60,
  max_attempts     int not null default 3,
  duration_minutes int not null default 30,
  negative_marking numeric not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create table if not exists quiz_questions (
  id                 uuid primary key default uuid_generate_v4(),
  quiz_id            uuid not null references quizzes(id) on delete cascade,
  question_text      text not null,
  options            jsonb not null default '{}',
  correct_answer     text not null,
  explanation        text,
  difficulty         int not null default 3 check (difficulty between 1 and 5),
  order_index        int not null default 0,
  video_solution_url text,
  qr_code_url        text
);

-- ── Progress Tables ────────────────────────────────────────────────────────────
create table if not exists user_topic_progress (
  user_id             uuid not null references profiles(id) on delete cascade,
  topic_id            uuid not null references topics(id) on delete cascade,
  lecture_clicked     boolean not null default false,
  lecture_quiz_passed boolean not null default false,
  lecture_quiz_score  numeric,
  dpp_completed       boolean not null default false,
  dpp_score           numeric,
  pyqs_completed      boolean not null default false,
  pyqs_score          numeric,
  topic_test_passed   boolean not null default false,
  topic_test_score    numeric,
  topic_complete      boolean not null default false,
  updated_at          timestamptz not null default now(),
  primary key (user_id, topic_id)
);

create table if not exists user_chapter_progress (
  user_id              uuid not null references profiles(id) on delete cascade,
  chapter_id           uuid not null references chapters(id) on delete cascade,
  all_topics_complete  boolean not null default false,
  chapter_test_attempted boolean not null default false,
  chapter_test_passed  boolean not null default false,
  pdf_upload_unlocked  boolean not null default false,
  updated_at           timestamptz not null default now(),
  primary key (user_id, chapter_id)
);

create table if not exists user_subject_progress (
  user_id              uuid not null references profiles(id) on delete cascade,
  subject_id           uuid not null references subjects(id) on delete cascade,
  all_chapters_complete boolean not null default false,
  subject_test_attempted boolean not null default false,
  subject_test_passed  boolean not null default false,
  updated_at           timestamptz not null default now(),
  primary key (user_id, subject_id)
);

create table if not exists user_attempts (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references profiles(id) on delete cascade,
  quiz_id               uuid not null references quizzes(id) on delete cascade,
  score                 numeric not null default 0,
  total_marks           numeric not null default 0,
  accuracy              numeric not null default 0,
  time_taken_ms         bigint not null default 0,
  negative_marks_applied numeric not null default 0,
  status                attempt_status not null default 'in_progress',
  is_correct_summary    jsonb,
  started_at            timestamptz not null default now(),
  submitted_at          timestamptz
);

create table if not exists user_answers (
  id                  uuid primary key default uuid_generate_v4(),
  attempt_id          uuid not null references user_attempts(id) on delete cascade,
  question_id         uuid not null references quiz_questions(id) on delete cascade,
  selected_option     text,
  is_correct          boolean not null default false,
  time_spent_ms       bigint not null default 0,
  is_marked_for_review boolean not null default false
);

-- ── Storage Tables ─────────────────────────────────────────────────────────────
create table if not exists user_notes (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references profiles(id) on delete cascade,
  chapter_id      uuid not null references chapters(id) on delete cascade,
  title           text not null,
  b2_storage_path text not null,
  b2_file_id      text,
  mime_type       text not null default 'application/pdf',
  pdf_size_bytes  bigint not null default 0,
  pdf_text_index  text,
  file_hash       text,
  tags            text[],
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists user_profile_photos (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid unique not null references profiles(id) on delete cascade,
  b2_storage_path text not null,
  b2_file_id      text,
  mime_type       text not null default 'image/jpeg',
  size_bytes      bigint not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── Productivity Tables ────────────────────────────────────────────────────────
create table if not exists pomodoro_sessions (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references profiles(id) on delete cascade,
  duration_seconds int not null,
  topic_context   text,
  start_time      timestamptz not null,
  end_time        timestamptz not null
);

create table if not exists study_tasks (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references profiles(id) on delete cascade,
  title        text not null,
  description  text,
  target_type  task_target_type not null default 'free_text',
  target_id    uuid,
  status       task_status not null default 'pending',
  priority     int not null default 0,
  due_date     date,
  source       task_source not null default 'manual',
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists external_tests (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references profiles(id) on delete cascade,
  exam_name      text not null,
  exam_date      date not null,
  score_obtained numeric not null,
  total_marks    numeric not null,
  percentile     numeric,
  rank           int,
  notes          text,
  created_at     timestamptz not null default now()
);

-- ── System Tables ─────────────────────────────────────────────────────────────
create table if not exists system_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

create table if not exists audit_logs (
  id          uuid primary key default uuid_generate_v4(),
  actor_id    uuid references profiles(id),
  action      text not null,
  target_type text,
  target_id   text,
  old_value   jsonb,
  new_value   jsonb,
  ip_address  text,
  created_at  timestamptz not null default now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
create index if not exists idx_chapters_subject on chapters(subject_id);
create index if not exists idx_topics_chapter on topics(chapter_id);
create index if not exists idx_quiz_questions_quiz on quiz_questions(quiz_id);
create index if not exists idx_user_attempts_user on user_attempts(user_id);
create index if not exists idx_user_attempts_quiz on user_attempts(quiz_id);
create index if not exists idx_user_answers_attempt on user_answers(attempt_id);
create index if not exists idx_user_notes_user on user_notes(user_id);
create index if not exists idx_user_notes_chapter on user_notes(chapter_id);
create index if not exists idx_pomodoro_user on pomodoro_sessions(user_id);
create index if not exists idx_study_tasks_user on study_tasks(user_id);
create index if not exists idx_external_tests_user on external_tests(user_id);
create index if not exists idx_lecture_clicks_user on lecture_clicks(user_id);

-- ── Row Level Security ─────────────────────────────────────────────────────────
alter table profiles enable row level security;
alter table subjects enable row level security;
alter table chapters enable row level security;
alter table topics enable row level security;
alter table lectures enable row level security;
alter table lecture_clicks enable row level security;
alter table quizzes enable row level security;
alter table quiz_questions enable row level security;
alter table user_topic_progress enable row level security;
alter table user_chapter_progress enable row level security;
alter table user_subject_progress enable row level security;
alter table user_attempts enable row level security;
alter table user_answers enable row level security;
alter table user_notes enable row level security;
alter table user_profile_photos enable row level security;
alter table pomodoro_sessions enable row level security;
alter table study_tasks enable row level security;
alter table external_tests enable row level security;
alter table system_config enable row level security;

-- Profiles: users can read own, admins can read all
create policy if not exists "profiles_own_read" on profiles for select using (auth.uid() = id);
create policy if not exists "profiles_admin_read" on profiles for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','super_admin'))
);
create policy if not exists "profiles_own_update" on profiles for update using (auth.uid() = id);

-- Subjects/Chapters/Topics: all authenticated users can read
create policy if not exists "subjects_read" on subjects for select using (auth.role() = 'authenticated');
create policy if not exists "subjects_admin_write" on subjects for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','super_admin'))
);
create policy if not exists "chapters_read" on chapters for select using (auth.role() = 'authenticated');
create policy if not exists "chapters_admin_write" on chapters for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','super_admin'))
);
create policy if not exists "topics_read" on topics for select using (auth.role() = 'authenticated');
create policy if not exists "topics_admin_write" on topics for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','super_admin'))
);

-- Quizzes and questions: all authenticated can read active ones
create policy if not exists "quizzes_read" on quizzes for select using (auth.role() = 'authenticated' and is_active = true);
create policy if not exists "quizzes_admin_write" on quizzes for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','super_admin'))
);
create policy if not exists "quiz_questions_read" on quiz_questions for select using (auth.role() = 'authenticated');
create policy if not exists "quiz_questions_admin_write" on quiz_questions for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','super_admin'))
);

-- Progress: own only
create policy if not exists "topic_progress_own" on user_topic_progress for all using (user_id = auth.uid());
create policy if not exists "chapter_progress_own" on user_chapter_progress for all using (user_id = auth.uid());
create policy if not exists "subject_progress_own" on user_subject_progress for all using (user_id = auth.uid());
create policy if not exists "attempts_own" on user_attempts for all using (user_id = auth.uid());
create policy if not exists "answers_own" on user_answers for all using (
  attempt_id in (select id from user_attempts where user_id = auth.uid())
);

-- Notes: own only
create policy if not exists "notes_own" on user_notes for all using (user_id = auth.uid());
create policy if not exists "profile_photos_own" on user_profile_photos for all using (user_id = auth.uid());

-- Productivity: own only
create policy if not exists "pomodoro_own" on pomodoro_sessions for all using (user_id = auth.uid());
create policy if not exists "tasks_own" on study_tasks for all using (user_id = auth.uid());
create policy if not exists "ext_tests_own" on external_tests for all using (user_id = auth.uid());

-- System config: read for all, write for admins
create policy if not exists "system_config_read" on system_config for select using (auth.role() = 'authenticated');

-- ── Seed system_config ──────────────────────────────────────────────────────────
insert into system_config (key, value) values
  ('uploads_paused', 'false'),
  ('global_storage_limit_gb', '9'),
  ('per_user_storage_limit_mb', '500'),
  ('lecture_quiz_passing_score', '60'),
  ('topic_test_passing_score', '70'),
  ('max_quiz_attempts', '3'),
  ('max_exam_pauses', '2'),
  ('exam_timeout_warning_mins', '5'),
  ('password_min_length', '8'),
  ('require_email_verification', 'true')
on conflict (key) do nothing;

-- ── Seed sample subjects ────────────────────────────────────────────────────────
insert into subjects (title, description, order_index, is_active) values
  ('Physics', 'Mechanics, Thermodynamics, Optics, Modern Physics', 1, true),
  ('Chemistry', 'Organic, Inorganic, Physical Chemistry', 2, true),
  ('Mathematics', 'Calculus, Algebra, Coordinate Geometry, Statistics', 3, true)
on conflict do nothing;
