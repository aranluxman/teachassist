import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
const script = await readFile(new URL('../../frontend/_worker.js', import.meta.url), 'utf8');
let upstreamRequests = 0;
const upstream = async request => {
  upstreamRequests++;
  const url = new URL(request.url);
  if (url.pathname === '/yrdsb/index.php') {
    if (request.method === 'GET') return new Response('<form action="/yrdsb/index.php"><input name="username"><input type="password" name="password"></form>');
    const form = new URLSearchParams(await request.text());
    assert.notEqual(form.get('username'), 'owner');
    if (form.get('password') !== 'correct') {
      return new Response('', { status: 302, headers: { location: 'https://ta.yrdsb.ca/yrdsb/index.php?error=1' } });
    }
    const username = form.get('username');
    return new Response('', { status: 302, headers: {
      'set-cookie': `session_token=${username}; Path=/; HttpOnly`,
      location: `https://ta.yrdsb.ca/live/students/listReports.php?student_id=${username}`,
    } });
  }
  if (url.pathname.endsWith('listReports.php')) {
    const mark = request.headers.get('cookie').includes('111') ? 81 : 94;
    return new Response(`<html><body><table><tr><td>ENG4U-01</td><td>current mark = ${mark}%</td></tr></table></body></html>`);
  }
  throw new Error('Unexpected upstream request');
};
const mf = new Miniflare({ modules: true, script, compatibilityDate: '2025-09-01',
  // No API_KEY, owner secrets, AI binding, or KV required for student sign-in.
  serviceBindings: { ASSETS: () => new Response('<h1>TeachAssist static asset</h1>') },
  outboundService: upstream,
});
try {
  for (const host of ['teachassist.pages.dev', 'preview.teachassist.pages.dev']) {
    const base = `https://${host}`;
    const post = body => mf.dispatchFetch(`${base}/api/marks`, { method: 'POST',
      headers: { Origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await (await mf.dispatchFetch(`${base}/api/status`)).json()).studentSignIn, true);
    const before = upstreamRequests;
    for (const body of [{}, null, { username: '111' }]) assert.equal((await post(body)).status, 400);
    assert.equal(upstreamRequests, before, 'invalid POST never reaches upstream');
    assert.equal((await post({ username: '111', password: 'wrong' })).status, 401);
    for (const [username, mark] of [['111', 81], ['222', 94]]) {
      const response = await post({ username, password: 'correct' });
      assert.equal(response.status, 200, 'student sign-in works with no secrets or API key');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('access-control-allow-origin'), null);
      assert.equal((await response.json())[0].currentMark, mark);
    }
    for (const path of ['/api/cached', '/api/marks?debug=login', '/api/marks?key=anything']) {
      assert.equal((await mf.dispatchFetch(base + path)).status, 404, 'owner/debug routes are not exposed');
    }
    assert.equal((await mf.dispatchFetch(`${base}/api/marks`)).status, 405);
    assert.equal((await mf.dispatchFetch(`${base}/api/marks`, { method: 'POST', headers: { Origin: 'https://other.example' }, body: '{}' })).status, 403);
    assert.equal((await mf.dispatchFetch(`${base}/api/assistant`, { method: 'POST', body: '{}' })).status, 503, 'unconfigured AI has a clear fallback');
  }
  assert.match(await (await mf.dispatchFetch('https://teachassist.pages.dev/app.html')).text(), /static asset/);
  const routes = JSON.parse(await readFile(new URL('../../frontend/_routes.json', import.meta.url), 'utf8'));
  assert.deepEqual(routes.include, ['/api/*', '/googlecca61e9d43d944ee.html', '/app/googlecca61e9d43d944ee.html']);
  // Google Search Console file: exact text with a 200, no redirect.
  for (const path of routes.include.slice(1)) {
    const res = await mf.dispatchFetch('https://teachassist.pages.dev' + path, { redirect: 'manual' });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'google-site-verification: googlecca61e9d43d944ee.html');
  }
  console.log('Bundled Pages backend: production/preview sign-in, two-student isolation, no-secret operation, protected owner routes, CORS, static assets, and missing-AI fallback passed.');
} finally { await mf.dispose(); }

// Wrong-password limit: after 10 misses in an hour a student number is locked,
// without reaching TeachAssist; other students and addresses are unaffected.
const limited = new Miniflare({ modules: true, script, compatibilityDate: '2025-09-01',
  kvNamespaces: ['CHAT_LIMITS'],
  serviceBindings: { ASSETS: () => new Response('') },
  outboundService: upstream,
});
try {
  const base = 'https://teachassist.pages.dev';
  const post = (body, ip = '203.0.113.7') => limited.dispatchFetch(`${base}/api/marks`, { method: 'POST',
    headers: { Origin: base, 'content-type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(body) });
  for (let i = 0; i < 10; i++) assert.equal((await post({ username: '333', password: 'wrong' })).status, 401);
  const before = upstreamRequests;
  const blocked = await post({ username: '333', password: 'correct' });
  assert.equal(blocked.status, 429, 'locked after 10 wrong passwords, even with the right one');
  assert.equal((await blocked.json()).code, 'TA_TOO_MANY_ATTEMPTS');
  assert.equal((await post({ username: '333', password: 'correct' }, '198.51.100.9')).status, 429, 'the lock follows the student number, not the address');
  assert.equal(upstreamRequests, before, 'blocked attempts never reach TeachAssist');
  assert.equal((await post({ username: '222', password: 'correct' })).status, 200, 'other students still sign in');
  // One address guessing across many student numbers is stopped at 100 misses.
  for (let i = 0; i < 100; i++) assert.equal((await post({ username: String(5000 + i), password: 'wrong' }, '192.0.2.1')).status, 401);
  assert.equal((await post({ username: '6000', password: 'correct' }, '192.0.2.1')).status, 429, 'address locked after 100 misses');
  assert.equal((await post({ username: '6000', password: 'correct' }, '192.0.2.2')).status, 200, 'other addresses still sign in');
  console.log('Wrong-password limit: per-student and per-address locks, no upstream calls while locked, others unaffected.');
} finally { await limited.dispose(); }
