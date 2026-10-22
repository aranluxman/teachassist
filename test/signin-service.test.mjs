import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { workerUrl, setWorkerUrl, resetSignInService, login } from '../frontend/js/ta-client.js';
import { WORKER_URL, LEGACY_WORKER_URL } from '../frontend/js/config.js';
beforeEach(() => {
  const data = new Map();
  globalThis.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k) };
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
});
test('old default service and API key migrate to same-origin sign-in once', () => {
  localStorage.setItem('ta_worker_url', LEGACY_WORKER_URL + '/');
  localStorage.setItem('ta_api_key', 'old-key');
  assert.equal(workerUrl(), WORKER_URL);
  assert.equal(localStorage.getItem('ta_api_key'), null);
  setWorkerUrl('https://custom.example');
  assert.equal(workerUrl(), 'https://custom.example');
  resetSignInService();
  assert.equal(workerUrl(), WORKER_URL);
});
test('an existing custom server is retained, and an explicit later choice is respected', () => {
  localStorage.setItem('ta_worker_url', 'https://custom.example');
  assert.equal(workerUrl(), 'https://custom.example');
  setWorkerUrl(LEGACY_WORKER_URL);
  assert.equal(workerUrl(), LEGACY_WORKER_URL);
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
