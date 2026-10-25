-- Lock ta_load / ta_save to the server's secret key.
-- Run once in the Supabase SQL editor (project hcvjiveloioftozvnbhe),
-- ONLY after GET /api/status on the live site shows
--   "SUPABASE_KEY_TYPE": "secret"
-- Running it earlier stops cloud saving until the secret key is set.
-- Touches only the two TeachAssist functions; other apps in the project are
-- unaffected. To undo: grant execute ... to anon, authenticated (see git history).

revoke execute on function public.ta_load(text) from public, anon, authenticated;
revoke execute on function public.ta_save(text, jsonb, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.ta_load(text) to service_role;
grant execute on function public.ta_save(text, jsonb, jsonb, jsonb, timestamptz) to service_role;

-- Check: both rows should say anon_can_call = false, server_can_call = true.
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_call,
       has_function_privilege('service_role', p.oid, 'execute') as server_can_call
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('ta_load', 'ta_save');
