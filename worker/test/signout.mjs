import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { openCredential, openCredentialBox } from '../src/vault.js';
import { readSession, readSessionWith } from '../src/session.js';

const script = await readFile(new URL('../../frontend/_worker.js', import.meta.url), 'utf8');
const upstream = async (request) => {
  const url = new URL(request.url);
  if (url.pathname === '/yrdsb/index.php') {
    if (request.method === 'GET') return new Response('<form action="/yrdsb/index.php"><input name="username"><input type="password" name="password"></form>');
    const form = new URLSearchParams(await request.text());
    if (form.get('password') !== 'correct') return new Response('', { status: 302, headers: { location: 'https://ta.yrdsb.ca/yrdsb/index.php?error=1' } });
    const username = form.get('username');
    return new Response('', { status: 302, headers: { 'set-cookie': `session_token=${username}; Path=/`, location: `https://ta.yrdsb.ca/live/students/listReports.php?student_id=${username}` } });
  }
  if (url.pathname.endsWith('listReports.php')) return new Response('<table><tr><td>ENG4U-01</td><td>current mark = 90%</td></tr></table>');
  throw new Error(`Unexpected upstream request ${url}`);
};
const base = 'https://teachassist.pages.dev';
const site = (bindings) => new Miniflare({ modules: true, script, compatibilityDate: '2025-09-01',
  kvNamespaces: ['CHAT_LIMITS'], bindings, serviceBindings: { ASSETS: () => new Response('') }, outboundService: upstream });
const call = (mf, path, body) => mf.dispatchFetch(base + path, { method: 'POST', headers: { Origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const signIn = async (mf, username, secret) => {
  const res = await call(mf, '/api/marks', { username, ...secret });
  return { status: res.status, code: res.status === 200 ? '' : (await res.json()).code, cred: res.headers.get('x-teachassist-cred'), session: res.headers.get('x-teachassist-session') };
};

// ---- Sign-out cancels every copy of that login, and only that login.
const mf = site({ API_KEY: 'k1' });
try {
  const first = await signIn(mf, '111', { password: 'correct' });
  assert.equal(first.status, 200);
  const refreshed = await signIn(mf, '111', { cred: first.cred });
  assert.equal(refreshed.status, 200, 'a saved login refreshes');
  const id = (await openCredentialBox('k1', '111', first.cred)).loginId;
  assert.match(id, /^[a-f0-9]{24}$/);
  assert.equal((await openCredentialBox('k1', '111', refreshed.cred)).loginId, id, 'refreshes keep the login id');

  const other = await signIn(mf, '222', { password: 'correct' });
  const laptop = await signIn(mf, '111', { password: 'correct' }); // the same student on another device

  // A forged or other-student box cancels nothing.
  assert.equal((await call(mf, '/api/signout', { username: '111', cred: 'v1.forged.box' })).status, 204);
  assert.equal((await call(mf, '/api/signout', { username: '111', cred: other.cred })).status, 204);
  assert.equal((await signIn(mf, '111', { cred: refreshed.cred })).status, 200, 'still signed in after forged sign-outs');

  assert.equal((await call(mf, '/api/signout', { username: '111', cred: refreshed.cred })).status, 204);
  for (const copy of [first.cred, refreshed.cred]) {
    const after = await signIn(mf, '111', { cred: copy });
    assert.deepEqual([after.status, after.code], [401, 'TA_CRED_EXPIRED'], 'every copy of the signed-out login stops working');
  }
  assert.equal((await signIn(mf, '111', { cred: laptop.cred })).status, 200, "the student's other device stays signed in");
  assert.equal((await signIn(mf, '222', { cred: other.cred })).status, 200, 'other students are unaffected');
  const again = await signIn(mf, '111', { password: 'correct' });
  assert.equal((await signIn(mf, '111', { cred: again.cred })).status, 200, 'signing in again works');
  assert.equal((await mf.dispatchFetch(`${base}/api/signout`)).status, 405);
} finally { await mf.dispose(); }

// ---- Adding SESSION_SECRET / VAULT_SECRET signs nobody out and keeps ids.
const before = site({ API_KEY: 'k1' });
let old;
try { old = await signIn(before, '111', { password: 'correct' }); } finally { await before.dispose(); }
const after = site({ API_KEY: 'k1', SESSION_SECRET: 's2', VAULT_SECRET: 'v2' });
try {
  const status = await (await after.dispatchFetch(`${base}/api/status`)).json();
  assert.equal(status.setup.SESSION_SECRET, true);
  assert.equal(status.setup.VAULT_SECRET, true);
  const moved = await signIn(after, '111', { cred: old.cred });
  assert.equal(moved.status, 200, 'a box sealed with API_KEY still opens');
  assert.equal(await openCredential('k1', '111', moved.cred), null, 'new boxes are sealed with VAULT_SECRET, not API_KEY');
  assert.equal(await openCredential('v2', '111', moved.cred), 'correct');
  assert.equal((await openCredentialBox('v2', '111', moved.cred)).loginId, (await openCredentialBox('k1', '111', old.cred)).loginId, 'the login id survives the switch');
  assert.equal(await readSession(moved.session, 'k1'), null, 'new sessions are signed with SESSION_SECRET');
  assert.ok(await readSession(moved.session, 's2'));
  assert.ok(await readSessionWith(old.session, ['s2', 'k1']), 'sessions signed before the switch are still accepted');
  const subject = (token) => token.split('.')[2];
  assert.equal(subject(moved.session), subject(old.session), "the student's id (which files their saved data) is unchanged");
} finally { await after.dispose(); }

console.log('Sign-out: cancels every copy of a login, leaves other devices and students signed in, ignores forged boxes; new secrets sign nobody out and keep student ids.');
