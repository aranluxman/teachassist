import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { issueSession, subjectFor } from '../src/session.js';
import { mergeMarks, hasMark, cleanDreams, cleanGoals } from '../src/store.js';

// ---- pure helpers -----------------------------------------------------------
const old = [{ code: 'MTH1W1-01', name: 'Math', currentMark: 91, evaluations: [{ name: 'Quiz' }] }, { code: 'ENG1D1-01', name: 'English', currentMark: 85 }];
assert.equal(hasMark({ currentMark: 0 }), true, 'a mark of 0 is still a mark');
assert.deepEqual(mergeMarks([], old), { courses: old, stale: true }, 'empty TeachAssist falls back to the saved marks');
assert.deepEqual(mergeMarks([{ code: 'MTH1W1-01', currentMark: null, midterm: null }], old).courses[0].currentMark, 91, 'a course with no mark keeps its last mark');
assert.equal(mergeMarks([{ code: 'MTH1W1-01', currentMark: 88 }], old).stale, false, 'fresh marks are not replaced');
assert.deepEqual(mergeMarks([], []), { courses: [], stale: false });
{
  const merged = mergeMarks([{ code: 'ENG1D1-01', currentMark: 84 }], old);
  const kept = merged.courses.find((c) => c.code === 'MTH1W1-01');
  assert.equal(kept?.currentMark, 91, 'a course TeachAssist stopped listing keeps its last mark');
  assert.equal(kept?.saved, true, 'and is flagged as a saved mark');
  assert.equal(merged.stale, false, 'the rest of the screen is still live');
}
assert.equal(cleanDreams({ career: ' x '.repeat(100), target: 500, goals: { 'MTH1W1-01': 95, bad: 'x' } }).target, 90, 'out-of-range target resets');
assert.deepEqual(cleanDreams({ goals: { 'MTH1W1-01': 95, '../x': 50 } }).goals, { 'MTH1W1-01': 95 });
assert.equal(cleanGoals([{ title: '  ', type: 'school' }, { title: 'Pass French', type: 'weird', date: '2026-12-01' }]).length, 1);
assert.equal(cleanGoals([{ title: 'Pass French', type: 'weird', date: 'nope' }])[0].type, 'personal');

// ---- worker with a fake Supabase ----------------------------------------------
const script = await readFile(new URL('../../frontend/_worker.js', import.meta.url), 'utf8');
const rows = new Map();
let supabaseDown = false;
let taEmpty = false;
const calls = [];
const upstream = async (request) => {
  const url = new URL(request.url);
  if (url.hostname === 'proj.supabase.co') {
    calls.push(url.pathname);
    assert.equal(request.headers.get('apikey'), 'sb_publishable_test');
    if (supabaseDown) return new Response('down', { status: 500 });
    const body = await request.json();
    if (url.pathname.endsWith('/ta_load')) return Response.json(rows.get(body.p_subject) ?? null);
    if (url.pathname.endsWith('/ta_save')) {
      const cur = rows.get(body.p_subject) || { dreams: {}, goals: [], marks: [], marks_at: null };
      rows.set(body.p_subject, { dreams: body.p_dreams ?? cur.dreams, goals: body.p_goals ?? cur.goals, marks: body.p_marks ?? cur.marks, marks_at: body.p_marks_at ?? cur.marks_at, updated_at: 'now' });
      return new Response(null, { status: 204 });
    }
  }
  if (url.pathname === '/yrdsb/index.php') {
    if (request.method === 'GET') return new Response('<form action="/yrdsb/index.php"><input name="username"><input type="password" name="password"></form>');
    const username = new URLSearchParams(await request.text()).get('username');
    return new Response('', { status: 302, headers: { 'set-cookie': `session_token=${username}; Path=/`, location: `https://ta.yrdsb.ca/live/students/listReports.php?student_id=${username}` } });
  }
  if (url.pathname.endsWith('listReports.php')) {
    return new Response(taEmpty ? '<html><body><table></table></body></html>' : '<table><tr><td>ENG4U-01</td><td>current mark = 81%</td></tr></table>');
  }
  throw new Error(`Unexpected upstream request ${url}`);
};
const base = 'https://teachassist.pages.dev';
const mf = new Miniflare({
  modules: true, script, compatibilityDate: '2025-09-01',
  serviceBindings: { ASSETS: () => new Response('asset') }, outboundService: upstream,
  bindings: { API_KEY: 'server-secret', NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' },
});
const signIn = async (user) => {
  const res = await mf.dispatchFetch(`${base}/api/marks`, { method: 'POST', headers: { Origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ username: user, password: 'pw' }) });
  return { res, token: res.headers.get('X-TeachAssist-Session'), body: await res.clone().json().catch(() => null) };
};
const store = (token, method = 'GET', body) => mf.dispatchFetch(`${base}/api/store`, { method, headers: { Origin: base, Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });

try {
  const status = await (await mf.dispatchFetch(`${base}/api/status`)).json();
  assert.equal(status.cloudSave, true);
  assert.doesNotMatch(JSON.stringify(status), /sb_publishable_test|server-secret/, 'status never reveals values');

  // Auth: no token, forged token.
  assert.equal((await store('', 'GET')).status, 401);
  assert.equal((await store('1.2.3', 'GET')).status, 401);

  // Marks are saved on every good sign-in.
  const first = await signIn('111');
  assert.equal(first.body[0].currentMark, 81);
  await new Promise((r) => setTimeout(r, 50));
  const subject = await subjectFor('server-secret', '111');
  assert.equal(rows.get(subject).marks[0].currentMark, 81, 'marks were saved under the hashed subject');
  assert.ok(![...rows.keys()].includes('111'), 'the student number is never a key');

  // TeachAssist shows nothing → the last saved marks come back.
  taEmpty = true;
  const empty = await signIn('111');
  assert.equal(empty.body[0].currentMark, 81, 'fallback returns the last recorded mark');
  assert.ok(empty.res.headers.get('X-TeachAssist-Saved-At') !== null, 'response says it is a saved copy');
  // Another student never receives it.
  const other = await signIn('222');
  assert.deepEqual(other.body, [], 'no saved marks for a different student');
  assert.equal(other.res.headers.get('X-TeachAssist-Saved-At'), null);
  taEmpty = false;

  // Supabase down → sign-in still works with live marks.
  supabaseDown = true;
  const down = await signIn('111');
  assert.equal(down.body[0].currentMark, 81);
  supabaseDown = false;

  // Dreams + goals round trip, scoped to the student.
  const { token } = await signIn('111');
  const dreams = { career: 'Engineer', school: 'Waterloo', motivation: 'Build things', target: 92, goals: { 'ENG4U-01': 95 }, dreamDone: true, gradesDone: true, updatedAt: 1000, goalsAt: 1000 };
  const goals = [{ id: 'a', type: 'school', title: 'Switch schools', date: '2027-02-01', details: '', done: false }];
  assert.equal((await store(token, 'PUT', { dreams, goals })).status, 200);
  const back = await (await store(token)).json();
  assert.equal(back.dreams.career, 'Engineer');
  assert.equal(back.dreams.target, 92);
  assert.equal(back.goals[0].title, 'Switch schools');
  const { token: t222 } = await signIn('222');
  assert.equal((await (await store(t222)).json()).dreams, null, 'another student sees nothing');
  assert.equal((await store(token, 'PUT', { nope: 1 })).status, 400);
  assert.equal((await store(token, 'PUT', { dreams: 'x' })).status, 400);
  assert.equal((await store(token, 'PUT', { dreams: { career: 'x'.repeat(70000) } })).status, 413, 'oversized bodies are refused');
  assert.equal((await store(token, 'DELETE')).status, 405);
  assert.equal((await mf.dispatchFetch(`${base}/api/store`, { method: 'GET', headers: { Origin: 'https://evil.example' } })).status, 403);
  console.log('Cloud saving: auth, per-student isolation, marks fallback, Supabase outage, dreams and goals passed.');
} finally { await mf.dispose(); }
