import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { workerUrl, resetSignInService, login } from '../frontend/js/ta-client.js';
import { WORKER_URL } from '../frontend/js/config.js';
const memoryStorage = () => {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k) };
};
beforeEach(() => {
  globalThis.localStorage = memoryStorage();
  globalThis.sessionStorage = memoryStorage();
});
test('sign-in always uses this site; saved custom servers and API keys are cleared', () => {
  localStorage.setItem('ta_worker_url', 'https://attacker.example');
  localStorage.setItem('ta_api_key', 'old-key');
  assert.equal(workerUrl(), WORKER_URL);
  assert.equal(localStorage.getItem('ta_worker_url'), null);
  assert.equal(localStorage.getItem('ta_api_key'), null);
  localStorage.setItem('ta_worker_url', 'https://custom.example');
  resetSignInService();
  assert.equal(localStorage.getItem('ta_worker_url'), null);
  assert.equal(workerUrl(), WORKER_URL);
});
test('old API-key gate, invalid passwords, and missing Pages backend have distinct errors', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [status, body, expected] of [
      [401, {error:'Unauthorized'}, /server is out of date/],
      [401, {error:'TeachAssist rejected your credentials'}, /TeachAssist rejected your credentials/],
      [404, {error:'Not found'}, /sign-in service is not available/],
      [200, null, /sign-in service is not available/],
    ]) {
      globalThis.fetch = async () => Response.json(body, {status});
      await assert.rejects(() => login('111','incorrect'), expected);
      assert.equal(localStorage.getItem('ta_password'), null, 'failed login stores no credentials');
    }
  } finally { globalThis.fetch = originalFetch; }
});
test('the phone keeps a sealed credential, never the password, and old phones migrate', async () => {
  const { getCourses } = await import('../frontend/js/ta-client.js');
  const originalFetch = globalThis.fetch;
  const sent = [];
  const reply = (cred) => async (_url, init) => {
    sent.push(JSON.parse(init.body));
    return Response.json([{ code: 'ENG2D1', currentMark: 90 }], { headers: cred ? { 'X-TeachAssist-Cred': cred } : {} });
  };
  try {
    globalThis.fetch = reply('v1.box.one');
    await login('111', 'secret-pw');
    assert.equal(localStorage.getItem('ta_password'), null, 'the password is not stored');
    assert.equal(localStorage.getItem('ta_cred'), 'v1.box.one');

    globalThis.fetch = reply('v1.box.two');
    await getCourses({ refresh: true });
    assert.deepEqual(sent.at(-1), { username: '111', cred: 'v1.box.one' }, 'refresh sends the box, not a password');
    assert.equal(localStorage.getItem('ta_cred'), 'v1.box.two', 'the fresh box replaces the old one');

    // A phone from before sealing: password in storage, no box yet.
    localStorage.removeItem('ta_cred');
    localStorage.setItem('ta_password', 'old-pw');
    globalThis.fetch = reply('v1.box.three');
    await getCourses({ refresh: true });
    assert.deepEqual(sent.at(-1), { username: '111', password: 'old-pw' }, 'the old password is sent once');
    assert.equal(localStorage.getItem('ta_password'), null, 'and then deleted');
    assert.equal(localStorage.getItem('ta_cred'), 'v1.box.three');

    // A backend that can't seal keeps the password for this tab only.
    localStorage.removeItem('ta_cred');
    globalThis.fetch = reply('');
    await login('111', 'tab-pw');
    assert.equal(localStorage.getItem('ta_password'), null, 'never written to localStorage');
    assert.equal(sessionStorage.getItem('ta_password'), 'tab-pw', 'kept for this tab only');
    globalThis.fetch = reply('v1.box.four');
    await getCourses({ refresh: true });
    assert.equal(sessionStorage.getItem('ta_password'), null, 'dropped once a box is issued');
    assert.equal(localStorage.getItem('ta_cred'), 'v1.box.four');

    // Sign Out asks the server to cancel the saved login, then clears the device.
    const calls = [];
    let left = '';
    globalThis.window = { location: { replace: (to) => { left = to; } }, dispatchEvent() {}, addEventListener() {} };
    globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 204 }); };
    const { signOut } = await import('../frontend/js/ta-client.js');
    const box = localStorage.getItem('ta_cred');
    signOut();
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/signout$/);
    assert.deepEqual(JSON.parse(calls[0].init.body), { username: '111', cred: box });
    assert.equal(calls[0].init.keepalive, true, 'the request survives leaving the page');
    assert.equal(localStorage.getItem('ta_cred'), null, 'the device copy is removed');
    assert.equal(left, 'index.html');
    delete globalThis.window;
    localStorage.setItem('ta_student_number', '111');
    localStorage.setItem('ta_cred', box);

    // An expired or forged box signs the phone out.
    let redirected = '';
    globalThis.window = { location: { replace: (to) => { redirected = to; } }, dispatchEvent() {}, addEventListener() {} };
    globalThis.fetch = async () => Response.json({ error: 'Please sign in again.', code: 'TA_CRED_EXPIRED' }, { status: 401 });
    await assert.rejects(() => getCourses({ refresh: true }), /sign in again/);
    assert.equal(localStorage.getItem('ta_cred'), null, 'the dead box is removed');
    assert.equal(redirected, 'index.html');
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window;
  }
});
