-- TeachAssist Notes: notebooks and notes, backed up per student.
-- Same model as schema.sql: a student is only their one-way 16-hex subject
-- (HMAC of the student number, made inside the Worker). Both tables are locked
-- (RLS on, no policies, no grants); all access goes through the functions
-- below, which only the Worker's secret (service_role) key may call.
-- Applied to the Supabase project as migration "teachassist_notes".

create table if not exists public.teachassist_notes (
  subject    text not null check (subject ~ '^[a-f0-9]{16}$'),
  id         text not null check (id ~ '^[A-Za-z0-9-]{8,64}$'),
  notebook   text not null default 'general' check (length(notebook) between 1 and 64),
  title      text not null default '' check (length(title) <= 200),
  body       text not null default '' check (length(body) <= 200000),
  tags       jsonb not null default '[]'::jsonb check (jsonb_typeof(tags) = 'array' and length(tags::text) <= 2000),
  favorite   boolean not null default false,
  course     text not null default '' check (length(course) <= 40),
  deleted    boolean not null default false,  -- a tombstone, so other devices drop it too
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (subject, id)
);
alter table public.teachassist_notes enable row level security;
revoke all on public.teachassist_notes from public, anon, authenticated;

create table if not exists public.teachassist_notebooks (
  subject    text primary key check (subject ~ '^[a-f0-9]{16}$'),
  notebooks  jsonb not null default '[]'::jsonb check (jsonb_typeof(notebooks) = 'array' and length(notebooks::text) <= 20000),
  updated_at timestamptz not null default now()
);
alter table public.teachassist_notebooks enable row level security;
revoke all on public.teachassist_notebooks from public, anon, authenticated;

-- Everything one student has: their notebooks and every note (tombstones too,
-- with no body), newest first.
create or replace function public.ta_notes_load(p_subject text) returns jsonb
language sql security definer set search_path = public as $$
  select case when p_subject !~ '^[a-f0-9]{16}$' then null else jsonb_build_object(
    'notebooks', (select n.notebooks from public.teachassist_notebooks n where n.subject = p_subject),
    'notebooksAt', (select n.updated_at from public.teachassist_notebooks n where n.subject = p_subject),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'notebook', t.notebook, 'title', t.title,
        'body', case when t.deleted then '' else t.body end,
        'tags', t.tags, 'favorite', t.favorite, 'course', t.course, 'deleted', t.deleted,
        'createdAt', t.created_at, 'updatedAt', t.updated_at
      ) order by t.updated_at desc)
      from public.teachassist_notes t where t.subject = p_subject
    ), '[]'::jsonb)
  ) end
$$;

-- Save up to 50 notes (and optionally the notebook list). A note only
-- replaces the stored one when it is newer, so an old phone can't undo a
-- newer edit. At most 1000 notes per student.
create or replace function public.ta_notes_save(
  p_subject text, p_notes jsonb default '[]'::jsonb,
  p_notebooks jsonb default null, p_notebooks_at timestamptz default null
) returns integer language plpgsql security definer set search_path = public as $$
declare
  n jsonb;
  saved integer := 0;
begin
  if p_subject !~ '^[a-f0-9]{16}$' then raise exception 'invalid subject'; end if;
  if jsonb_typeof(coalesce(p_notes, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_notes, '[]'::jsonb)) > 50 then
    raise exception 'too many notes in one save';
  end if;

  if p_notebooks is not null then
    insert into public.teachassist_notebooks as b (subject, notebooks, updated_at)
    values (p_subject, p_notebooks, coalesce(p_notebooks_at, now()))
    on conflict (subject) do update set notebooks = excluded.notebooks, updated_at = excluded.updated_at
    where b.updated_at <= excluded.updated_at;
  end if;

  for n in select * from jsonb_array_elements(coalesce(p_notes, '[]'::jsonb)) loop
    if not exists (select 1 from public.teachassist_notes t where t.subject = p_subject and t.id = n->>'id')
       and (select count(*) from public.teachassist_notes t where t.subject = p_subject) >= 1000 then
      raise exception 'note limit reached';
    end if;
    insert into public.teachassist_notes as t
      (subject, id, notebook, title, body, tags, favorite, course, deleted, created_at, updated_at)
    values (
      p_subject, n->>'id', coalesce(n->>'notebook', 'general'), coalesce(n->>'title', ''),
      case when coalesce((n->>'deleted')::boolean, false) then '' else coalesce(n->>'body', '') end,
      coalesce(n->'tags', '[]'::jsonb), coalesce((n->>'favorite')::boolean, false),
      coalesce(n->>'course', ''), coalesce((n->>'deleted')::boolean, false),
      coalesce((n->>'createdAt')::timestamptz, now()), coalesce((n->>'updatedAt')::timestamptz, now())
    )
    on conflict (subject, id) do update set
      notebook = excluded.notebook, title = excluded.title, body = excluded.body, tags = excluded.tags,
      favorite = excluded.favorite, course = excluded.course, deleted = excluded.deleted,
      updated_at = excluded.updated_at
    where t.updated_at < excluded.updated_at;
    saved := saved + 1;
  end loop;
  return saved;
end; $$;

revoke all on function public.ta_notes_load(text) from public, anon, authenticated;
revoke all on function public.ta_notes_save(text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.ta_notes_load(text) to service_role;
grant execute on function public.ta_notes_save(text, jsonb, jsonb, timestamptz) to service_role;

-- "Delete my data" now removes notes and notebooks as well as the backup row.
create or replace function public.ta_delete(p_subject text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  removed integer := 0;
  n integer;
begin
  if p_subject !~ '^[a-f0-9]{16}$' then return false; end if;
  delete from public.teachassist_student_data where subject = p_subject; get diagnostics n = row_count; removed := removed + n;
  delete from public.teachassist_notes where subject = p_subject;        get diagnostics n = row_count; removed := removed + n;
  delete from public.teachassist_notebooks where subject = p_subject;    get diagnostics n = row_count; removed := removed + n;
  return removed > 0;
end; $$;
revoke all on function public.ta_delete(text) from public, anon, authenticated;
grant execute on function public.ta_delete(text) to service_role;
