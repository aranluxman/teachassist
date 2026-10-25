// ============================================================================
// Student data in Supabase (dreams, goals, last-known marks).
// ----------------------------------------------------------------------------
// Only this Worker talks to Supabase, using the service_role key (a Pages
// secret, never sent to the browser). Rows are keyed by the same one-way
// student subject carried in their session token, so no student number is stored.
// The table has row-level security on and no public policies.
//   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or SUPABASE_SERVICE_KEY)
// ============================================================================

import { readSession } from './session.js';

const MAX_MARKS_JSON = 300000;
const MAX_BODY = 60000;

const json = (body, status = 200, headers = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

// Either key works: the table itself is locked (RLS on, no policies); all
// access goes through two SECURITY DEFINER functions (ta_load / ta_save) that
// only accept a student's one-way subject id.
const apiKey = (env) => env.SUPABASE_SERVICE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || '';
const baseUrl = (env) => (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
export const storeConfigured = (env) => !!(baseUrl(env) && apiKey(env) && env.API_KEY);

async function rpc(env, name, args) {
  return fetch(`${baseUrl(env)}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: apiKey(env), Authorization: `Bearer ${apiKey(env)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(8000),
  });
}

/** The saved row for a student, or null (also null when Supabase is down). */
export async function loadRow(env, subject) {
  if (!storeConfigured(env) || !/^[a-f0-9]{16}$/.test(subject || '')) return null;
  try {
    const res = await rpc(env, 'ta_load', { p_subject: subject });
    if (!res.ok) return null;
    return (await res.json()) || null;
  } catch { return null; }
}

/** Save only the columns provided (dreams, goals, marks, marks_at). */
export async function saveRow(env, subject, columns) {
  if (!storeConfigured(env) || !/^[a-f0-9]{16}$/.test(subject || '')) return false;
  try {
    const res = await rpc(env, 'ta_save', {
      p_subject: subject, p_dreams: columns.dreams ?? null, p_goals: columns.goals ?? null,
      p_marks: columns.marks ?? null, p_marks_at: columns.marks_at ?? null,
    });
    return res.ok;
  } catch { return false; }
}

// ---- marks snapshot --------------------------------------------------------
export const hasMark = (c) => !!c && (Number.isFinite(c.currentMark) || Number.isFinite(c.midterm));

/**
 * Combine fresh TeachAssist data with the last saved snapshot so a student
 * never loses a mark: a course with no mark now keeps its last recorded one,
 * a course TeachAssist stopped listing stays with its last mark, and when
 * TeachAssist returns nothing at all the saved snapshot is returned.
 * `stale` says whether a listed course's mark came from the saved copy.
 */
export function mergeMarks(fresh, saved) {
  const now = Array.isArray(fresh) ? fresh : [];
  const old = Array.isArray(saved) ? saved.filter(hasMark) : [];
  if (!now.some(hasMark)) return old.length ? { courses: old, stale: true } : { courses: now, stale: false };
  let stale = false;
  const courses = now.map((c) => {
    if (hasMark(c)) return c;
    const before = old.find((o) => o.code === c.code);
    if (!before) return c;
    stale = true;
    return { ...c, saved: true, currentMark: before.currentMark ?? null, midterm: before.midterm ?? null, evaluations: c.evaluations?.length ? c.evaluations : before.evaluations || [] };
  });
  // Kept courses are flagged `saved` so the app can say the mark is from
  // TeachAssist's past, without marking the whole screen as a saved copy.
  const gone = old.filter((o) => !now.some((c) => c.code === o.code)).map((o) => ({ ...o, saved: true }));
  return { courses: [...courses, ...gone], stale };
}

/**
 * Called by the Pages entry after a successful student sign-in. Saves the
 * latest marks and, when TeachAssist came back empty, answers with the last
 * saved ones. Never throws: if Supabase is unavailable the original response
 * is returned unchanged.
 */
export async function withSavedMarks(response, env, ctx) {
  try {
    if (!storeConfigured(env) || !response.ok) return response;
    const token = response.headers.get('X-TeachAssist-Session');
    const session = await readSession(token, env.API_KEY);
    if (!session?.subject) return response;
    const fresh = await response.clone().json();
    if (!Array.isArray(fresh)) return response;
    const row = await loadRow(env, session.subject);
    const { courses, stale } = mergeMarks(fresh, row?.marks);
    if (fresh.some(hasMark) && JSON.stringify(courses).length <= MAX_MARKS_JSON) {
      ctx?.waitUntil?.(saveRow(env, session.subject, { marks: courses, marks_at: new Date().toISOString() }));
    }
    if (!stale && courses.length === fresh.length) return response;
    const headers = new Headers(response.headers);
    if (stale) headers.set('X-TeachAssist-Saved-At', row?.marks_at || row?.updated_at || '');
    return new Response(JSON.stringify(courses), { status: 200, headers });
  } catch { return response; }
}

// ---- dreams + goals API ----------------------------------------------------
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v, lo, hi, fallback) => (Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 10) / 10 : fallback);

export function cleanDreams(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const goals = {};
  for (const [code, value] of Object.entries(d.goals && typeof d.goals === 'object' ? d.goals : {}).slice(0, 40)) {
    const n = num(Number(value), 0, 100, null);
    if (n != null && /^[\w.-]{1,24}$/.test(code)) goals[code] = n;
  }
  return {
    name: str(d.name, 50), career: str(d.career, 120), school: str(d.school, 120), motivation: str(d.motivation, 240),
    target: num(Number(d.target), 0, 100, 90), goals,
    dreamDone: d.dreamDone === true, gradesDone: d.gradesDone === true,
    updatedAt: Number.isFinite(d.updatedAt) ? d.updatedAt : Date.now(),
    goalsAt: Number.isFinite(d.goalsAt) ? d.goalsAt : 0,
  };
}

export function cleanGoals(list) {
  if (!Array.isArray(list)) return null;
  return list.slice(0, 50).map((g) => ({
    id: str(g?.id, 40) || crypto.randomUUID(),
    type: g?.type === 'school' ? 'school' : 'personal',
    title: str(g?.title, 120), date: /^\d{4}-\d{2}-\d{2}$/.test(g?.date || '') ? g.date : '',
    details: str(g?.details, 400), done: g?.done === true,
  })).filter((g) => g.title);
}

/** Parse a JSON body, stopping as soon as it passes MAX_BODY bytes. */
async function readJson(request) {
  const tooLarge = () => Object.assign(new Error('too large'), { status: 413 });
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw new Error('empty');
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); throw tooLarge(); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** GET /api/store → saved dreams + goals. PUT /api/store → save them. */
export async function handleStore(request, env) {
  if (!storeConfigured(env)) return json({ error: 'Cloud saving is not set up on this site yet.', configured: false }, 503);
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  const session = await readSession(token, env.API_KEY);
  if (!session?.subject) return json({ error: 'Your session expired. Refresh your courses, then retry.' }, 401);

  if (request.method === 'GET') {
    const row = await loadRow(env, session.subject);
    return json({ dreams: row?.dreams && Object.keys(row.dreams).length ? row.dreams : null, goals: row?.goals ?? null, updatedAt: row?.updated_at || null });
  }
  if (request.method !== 'PUT') return json({ error: 'Use GET or PUT.' }, 405);

  let body;
  try { body = await readJson(request); }
  catch (err) { return json({ error: err.status === 413 ? 'That is too much data.' : 'Invalid data.' }, err.status || 400); }
  const columns = {};
  if ('dreams' in body) { const d = cleanDreams(body.dreams); if (!d) return json({ error: 'Invalid dreams.' }, 400); columns.dreams = d; }
  if ('goals' in body) { const g = cleanGoals(body.goals); if (!g) return json({ error: 'Invalid goals.' }, 400); columns.goals = g; }
  if (!Object.keys(columns).length) return json({ error: 'Nothing to save.' }, 400);
  const ok = await saveRow(env, session.subject, columns);
  return ok ? json({ saved: true }) : json({ error: 'Could not save to the cloud right now.' }, 502);
}
