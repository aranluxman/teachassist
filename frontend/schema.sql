-- ============================================================================
-- Student Grade Dashboard — Supabase schema
-- ----------------------------------------------------------------------------
-- Paste this whole block into the Supabase SQL Editor and run it. It is safe to
-- re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS). Row Level Security is
-- enabled on every table, and each user can access ONLY their own rows.
-- ============================================================================

-- 1. PROFILES  (one row per user; the owner column is `id`) -------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  term_start date,
  term_end   date
);

-- 2. COURSES -----------------------------------------------------------------
create table if not exists public.courses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  code        text not null,
  name        text,
  teacher     text,
  period      text,
  room        text,
  start_date  date,
  end_date    date,
  midterm     numeric,
  final       numeric,
  current_mark numeric,   -- live "current mark" reported by TeachAssist (sync)
  color_index int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists courses_user_id_idx on public.courses (user_id);
-- For databases created before current_mark existed (safe to re-run):
alter table public.courses add column if not exists current_mark numeric;

-- 3. CATEGORIES (weighted achievement categories per course) -----------------
create table if not exists public.categories (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  name      text not null,
  weight    numeric not null default 0
);
create index if not exists categories_course_id_idx on public.categories (course_id);

-- 4. EVALUATIONS (individual assessments) ------------------------------------
create table if not exists public.evaluations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete cascade,
  category_id  uuid references public.categories (id) on delete set null,
  name         text not null,
  score_earned numeric not null default 0,
  score_total  numeric not null default 1,
  date         date,
  created_at   timestamptz not null default now()
);
create index if not exists evaluations_course_id_idx on public.evaluations (course_id);

-- ============================================================================
-- Row Level Security
-- Each "FOR ALL" policy below covers SELECT, INSERT, UPDATE and DELETE and only
-- matches rows owned by the current user (auth.uid()).
-- ============================================================================
alter table public.profiles    enable row level security;
alter table public.courses     enable row level security;
alter table public.categories  enable row level security;
alter table public.evaluations enable row level security;

-- profiles: ownership column is `id`
drop policy if exists "profiles_all_own" on public.profiles;
create policy "profiles_all_own" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- courses / categories / evaluations: ownership column is `user_id`
drop policy if exists "courses_all_own" on public.courses;
create policy "courses_all_own" on public.courses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "categories_all_own" on public.categories;
create policy "categories_all_own" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "evaluations_all_own" on public.evaluations;
create policy "evaluations_all_own" on public.evaluations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
