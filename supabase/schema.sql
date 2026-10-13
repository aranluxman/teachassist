-- TeachAssist cloud saving (dreams, goals, last-known marks).
-- Already applied to the Supabase project; kept here so it can be re-created.
-- Students are identified only by a one-way 16-hex subject (HMAC of the student
-- number made inside the Worker). The table is locked: all access goes through
-- ta_load / ta_save, which accept only that subject.

create table if not exists public.teachassist_student_data (
  subject text primary key check (subject ~ '^[a-f0-9]{16}$'),
  dreams jsonb not null default '{}'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  marks jsonb not null default '[]'::jsonb,
  marks_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.teachassist_student_data enable row level security;
revoke all on public.teachassist_student_data from anon, authenticated;

create or replace function public.ta_load(p_subject text) returns jsonb
language sql security definer set search_path = public as $$
  select to_jsonb(t) - 'subject' from public.teachassist_student_data t
  where p_subject ~ '^[a-f0-9]{16}$' and t.subject = p_subject
$$;

create or replace function public.ta_save(
  p_subject text, p_dreams jsonb default null, p_goals jsonb default null,
  p_marks jsonb default null, p_marks_at timestamptz default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_subject !~ '^[a-f0-9]{16}$' then raise exception 'invalid subject'; end if;
  if p_marks is not null and length(p_marks::text) > 300000 then raise exception 'marks too large'; end if;
  insert into public.teachassist_student_data as t (subject, dreams, goals, marks, marks_at, updated_at)
  values (p_subject, coalesce(p_dreams, '{}'::jsonb), coalesce(p_goals, '[]'::jsonb), coalesce(p_marks, '[]'::jsonb), p_marks_at, now())
  on conflict (subject) do update set
    dreams = coalesce(p_dreams, t.dreams), goals = coalesce(p_goals, t.goals),
    marks = coalesce(p_marks, t.marks), marks_at = coalesce(p_marks_at, t.marks_at), updated_at = now();
end; $$;

revoke all on function public.ta_load(text) from public;
revoke all on function public.ta_save(text, jsonb, jsonb, jsonb, timestamptz) from public;
grant execute on function public.ta_load(text) to anon, authenticated, service_role;
grant execute on function public.ta_save(text, jsonb, jsonb, jsonb, timestamptz) to anon, authenticated, service_role;
