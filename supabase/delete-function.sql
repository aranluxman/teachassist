-- Let a student delete their own cloud backup (Settings → Delete my data).
-- Run once in the Supabase SQL editor (project hcvjiveloioftozvnbhe). Only the
-- Worker's secret key may call it, and the Worker passes only the signed-in
-- student's own one-way subject, so nobody can delete someone else's row.
-- Safe to run again.

create or replace function public.ta_delete(p_subject text) returns boolean
language sql security definer set search_path = public as $$
  with gone as (
    delete from public.teachassist_student_data
    where p_subject ~ '^[a-f0-9]{16}$' and subject = p_subject
    returning 1
  )
  select exists (select 1 from gone)
$$;

revoke all on function public.ta_delete(text) from public, anon, authenticated;
grant execute on function public.ta_delete(text) to service_role;

-- Check: one row, anon_can_call = false, server_can_call = true.
select has_function_privilege('anon', 'public.ta_delete(text)', 'execute') as anon_can_call,
       has_function_privilege('service_role', 'public.ta_delete(text)', 'execute') as server_can_call;
