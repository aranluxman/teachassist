import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { workerUrl, setWorkerUrl, resetSignInService, login } from '../frontend/js/ta-client.js';
import { WORKER_URL, LEGACY_WORKER_URL } from '../frontend/js/config.js';
beforeEach(() => {
  const data = new Map();
  globalThis.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k) };
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
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
      [401, {error:'TeachAssist rejected your credentials'}, /Check your student number and password/],
      [404, {error:'Not found'}, /sign-in service is not available/],
      [200, null, /sign-in service is not available/],
    ]) {
      globalThis.fetch = async () => Response.json(body, {status});
      await assert.rejects(() => login('111','incorrect'), expected);
      assert.equal(localStorage.getItem('ta_password'), null, 'failed login stores no credentials');
    }
  } finally { globalThis.fetch = originalFetch; }
});
