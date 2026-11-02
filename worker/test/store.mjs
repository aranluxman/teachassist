import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { issueSession, subjectFor } from '../src/session.js';
import { mergeMarks, hasMark, savedCourses, cleanDreams, cleanGoals, storeKeyKind } from '../src/store.js';

// ---- pure helpers -----------------------------------------------------------
// Which key cloud saving uses is reported by type only, never by value.
// Fake legacy JWT keys, built here so no key-shaped string sits in the repo.
const fakeJwt = (role) => ['header', btoa(JSON.stringify({ role })).replace(/=+$/, ''), 'sig'].join('.');
assert.equal(storeKeyKind({}), 'none');
assert.equal(storeKeyKind({ SUPABASE_SERVICE_KEY: 'sb_secret_fake' }), 'secret');
assert.equal(storeKeyKind({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fake' }), 'publishable');
assert.equal(storeKeyKind({ SUPABASE_SERVICE_KEY: 'sb_secret_fake', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fake' }), 'secret', 'the secret key wins');
assert.equal(storeKeyKind({ SUPABASE_SERVICE_KEY: 'sb_publishable_fake' }), 'publishable', 'a publishable key pasted in the secret slot is caught');
assert.equal(storeKeyKind({ SUPABASE_SERVICE_KEY: fakeJwt('service_role') }), 'secret', 'legacy service_role key');
assert.equal(storeKeyKind({ SUPABASE_SERVICE_KEY: fakeJwt('anon') }), 'publishable', 'legacy anon key');
const old = [{ code: 'MTH1W1-01', name: 'Math', currentMark: 91, evaluations: [{ name: 'Quiz' }] }, { code: 'ENG1D1-01', name: 'English', currentMark: 85 }];
assert.equal(hasMark({ currentMark: 0 }), false, 'a 0% from TeachAssist is not a real mark');
{
  // A teacher's 0% must not replace the last real mark, in Supabase or on screen.
  const zero = mergeMarks([{ code: 'MTH1W1-01', currentMark: 0, midterm: null }, { code: 'ENG1D1-01', currentMark: 88 }], old);
  const math = zero.courses.find((c) => c.code === 'MTH1W1-01');
  assert.equal(math.currentMark, 91, 'a 0% shows the last saved mark instead');
  assert.equal(math.saved, true, 'and is labelled as the last saved mark');
  assert.equal(zero.stale, false, 'the other courses are live, so the screen is not a saved copy');
  const none = mergeMarks([{ code: 'CHC2DF-01', currentMark: 0, midterm: 0 }, { code: 'ENG1D1-01', currentMark: 88 }], old);
  assert.equal(none.courses.find((c) => c.code === 'CHC2DF-01').currentMark, null, 'a 0% with no saved mark becomes "No Mark"');
  assert.equal(none.courses.find((c) => c.code === 'CHC2DF-01').midterm, null);
  const poisoned = [{ code: 'CHC2DF-01', currentMark: 0, midterm: 0 }, { code: 'SNC2D1-01', currentMark: 0, midterm: 82 }];
  assert.deepEqual(savedCourses(poisoned), [{ code: 'SNC2D1-01', currentMark: null, midterm: 82 }], 'old 0% values saved in Supabase are dropped');
  assert.equal(mergeMarks([{ code: 'CHC2DF-01', currentMark: 0 }, { code: 'ENG1D1-01', currentMark: 88 }], poisoned).courses.find((c) => c.code === 'CHC2DF-01').currentMark, null, 'a saved 0% is never brought back');
}
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
let taZero = false;
let taCalls = 0;
const calls = [];
const upstream = async (request) => {
  const url = new URL(request.url);
  if (url.hostname === 'proj.supabase.co') {
    calls.push(url.pathname);
    assert.equal(request.headers.get('apikey'), 'sb_publishable_test');
    if (supabaseDown) return new Response('down', { status: 500 });
    const body = await request.json();
    if (url.pathname.endsWith('/ta_load')) return Response.json(rows.get(body.p_subject) ?? null);
    if (url.pathname.endsWith('/ta_delete')) return Response.json(rows.delete(body.p_subject));
    if (url.pathname.endsWith('/ta_save')) {
      const cur = rows.get(body.p_subject) || { dreams: {}, goals: [], marks: [], marks_at: null };
      rows.set(body.p_subject, { dreams: body.p_dreams ?? cur.dreams, goals: body.p_goals ?? cur.goals, marks: body.p_marks ?? cur.marks, marks_at: body.p_marks_at ?? cur.marks_at, updated_at: 'now' });
      return new Response(null, { status: 204 });
    }
  }
  if (url.pathname === '/yrdsb/index.php') {
    taCalls++;
    if (request.method === 'GET') return new Response('<form action="/yrdsb/index.php"><input name="username"><input type="password" name="password"></form>');
    const username = new URLSearchParams(await request.text()).get('username');
    return new Response('', { status: 302, headers: { 'set-cookie': `session_token=${username}; Path=/`, location: `https://ta.yrdsb.ca/live/students/listReports.php?student_id=${username}` } });
  }
  if (url.pathname.endsWith('listReports.php')) {
    if (taZero) return new Response('<table><tr><td>ENG4U-01</td><td>current mark = 0%</td></tr><tr><td>SNC2D1-01</td><td>current mark = 90%</td></tr></table>');
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

  // A teacher's 0% → the last real mark is shown, and Supabase keeps it.
  taZero = true;
  const zeroed = await signIn('111');
  const eng = zeroed.body.find((c) => c.code === 'ENG4U');
  assert.equal(eng.currentMark, 81, 'a 0% shows the last saved mark');
  assert.equal(eng.saved, true, 'labelled as the last saved mark');
  assert.equal(zeroed.body.find((c) => c.code === 'SNC2D1').currentMark, 90, 'other live marks are untouched');
  assert.equal(zeroed.res.headers.get('X-TeachAssist-Saved-At'), null, 'the screen still reads as live, not a saved copy');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(rows.get(subject).marks.find((c) => c.code === 'ENG4U').currentMark, 81, 'the 0% never overwrites the saved mark');
  taZero = false;

  // Supabase down → sign-in still works with live marks.
  supabaseDown = true;
  const down = await signIn('111');
  assert.equal(down.body[0].currentMark, 81);
  supabaseDown = false;

  // Saved marks load instantly with a saved login, without calling TeachAssist.
  const savedMarks = (body) => mf.dispatchFetch(`${base}/api/saved-marks`, { method: 'POST', headers: { Origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const cred111 = first.res.headers.get('X-TeachAssist-Cred');
  assert.ok(cred111, 'sign-in issues a saved login');
  const before = taCalls;
  const quick = await savedMarks({ username: '111', cred: cred111 });
  assert.equal(quick.status, 200);
  const quickBody = await quick.json();
  assert.equal(quickBody.courses[0].currentMark, 81, 'the last saved marks come back');
  assert.ok(quickBody.savedAt, 'with when they were saved');
  assert.equal(taCalls, before, 'TeachAssist is never contacted');
  assert.equal((await savedMarks({ username: '222', cred: cred111 })).status, 401, "one student's login can't read another's marks");
  assert.equal((await savedMarks({ username: '111', cred: 'forged' })).status, 401, 'a forged login is refused');
  assert.equal((await savedMarks({ username: '111' })).status, 400);
  assert.equal((await mf.dispatchFetch(`${base}/api/saved-marks`, { method: 'GET', headers: { Origin: base } })).status, 405);
  supabaseDown = true;
  assert.deepEqual((await (await savedMarks({ username: '111', cred: cred111 })).json()).courses, [], 'Supabase down: nothing saved, no error');
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

  // Delete my data: removes only the signed-in student's backup.
  assert.equal((await store(t222, 'PUT', { dreams: { ...dreams, career: 'Doctor' } })).status, 200);
  const deleted = await store(token, 'DELETE');
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).deleted, true);
  assert.equal((await (await store(token)).json()).dreams, null, 'the backup is gone');
  assert.equal((await (await store(t222)).json()).dreams.career, 'Doctor', "another student's backup is untouched");
  assert.equal((await store(token, 'DELETE')).status, 200, 'deleting again is fine');
  assert.equal((await mf.dispatchFetch(`${base}/api/store`, { method: 'DELETE', headers: { Origin: base } })).status, 401, 'needs a signed-in session');
  supabaseDown = true;
  assert.equal((await store(t222, 'DELETE')).status, 502, 'a failed delete says so');
  supabaseDown = false;
  assert.equal((await store(token, 'POST', {})).status, 405, 'other methods are refused');
  assert.equal((await mf.dispatchFetch(`${base}/api/store`, { method: 'GET', headers: { Origin: 'https://evil.example' } })).status, 403);
  console.log('Cloud saving: auth, per-student isolation, marks fallback, instant saved marks, Supabase outage, dreams and goals, and delete-my-data passed.');
} finally { await mf.dispose(); }
