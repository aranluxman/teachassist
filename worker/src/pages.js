// Pages advanced-mode entry point. Deploy the sign-in service with the site so
// a frontend release cannot depend on an out-of-date standalone Worker.
import worker from './index.js';
import { handleStore, withSavedMarks, storeConfigured, storeKeyKind } from './store.js';
import { loginBlocked, recordLoginFailure } from './login-limit.js';
import { openCredentialBox, revokeLogin } from './vault.js';
import { vaultKeys } from './keys.js';

/** A small JSON body read from a copy of the request; null if missing, over 8 KB or not JSON. */
async function peekJson(request) {
  try {
    const reader = request.clone().body?.getReader();
    if (!reader) return null;
    let text = '';
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      // The sign-in handler rejects bodies this large itself.
      if (text.length > 8192) { await reader.cancel(); return null; }
    }
    return JSON.parse(text);
  } catch { return null; }
}
const studentNumberIn = (body) => {
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  return /^\d{1,20}$/.test(username) ? username : '';
};

/** The student number of a password sign-in (else ''). */
async function passwordSignIn(request) {
  const body = await peekJson(request);
  return typeof body?.password === 'string' && body.password ? studentNumberIn(body) : '';
}

/**
 * POST /api/signout { username, cred }: cancel that saved login everywhere.
 * Opening the box proves the caller holds it; its login id then goes on the
 * revoked list, so copies of the box stop working too. Always 204, so the
 * answer says nothing about whether a box was genuine.
 */
async function signOut(request, env) {
  const body = await peekJson(request);
  const username = studentNumberIn(body);
  if (username && typeof body.cred === 'string') {
    const opened = await openCredentialBox(vaultKeys(env), username, body.cred);
    if (opened?.loginId) await revokeLogin(env.CHAT_LIMITS, opened.loginId).catch(() => {});
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
// Google Search Console ownership file. Served here (not as a static asset)
// because Pages redirects any "*.html" URL to its extension-less form and
// Google wants the exact file with a 200. Keep this, or verification lapses.
const GOOGLE_SITE_VERIFICATION = 'googlecca61e9d43d944ee';
const VERIFICATION_PATHS = new Set([`/${GOOGLE_SITE_VERIFICATION}.html`, `/app/${GOOGLE_SITE_VERIFICATION}.html`]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (VERIFICATION_PATHS.has(url.pathname)) {
      return new Response(`google-site-verification: ${GOOGLE_SITE_VERIFICATION}.html`, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'Origin not allowed.' }, 403);

    if (url.pathname === '/api/status' && request.method === 'GET') {
      // `setup` says only whether each setting is present — never values —
      // so a missing secret or binding is easy to spot after a deploy.
      return json({
        service: 'TeachAssist', studentSignIn: true, version: 1,
        setup: { API_KEY: !!env.API_KEY, CHAT_LIMITS: !!env.CHAT_LIMITS, SUPABASE_URL: !!(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL), SUPABASE_KEY: !!(env.SUPABASE_SERVICE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY), SUPABASE_KEY_TYPE: storeKeyKind(env), SESSION_SECRET: !!env.SESSION_SECRET, VAULT_SECRET: !!env.VAULT_SECRET },
        cloudSave: storeConfigured(env),
      });
    }
    if (url.pathname === '/api/signout' && !url.search) {
      if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
      return signOut(request, env);
    }
    // Dreams + goals saved to Supabase (per student, token-authenticated).
    if (url.pathname === '/api/store' && !url.search) return handleStore(request, env);
    // The website exposes only student operations, never owner/cache/debug APIs.
    if (url.pathname !== '/api/marks' || url.search) {
      return json({ error: 'Not found.' }, 404);
    }
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);

    // Limit wrong-password attempts so the site can't be used to guess passwords.
    const student = await passwordSignIn(request);
    const address = request.headers.get('CF-Connecting-IP') || '';
    if (student && await loginBlocked(env.CHAT_LIMITS, student, address)) {
      return json({ error: 'Too many wrong passwords. For your account\'s safety, wait an hour, then try again.', code: 'TA_TOO_MANY_ATTEMPTS' }, 429);
    }

    // Same-origin was validated above, including on Pages preview domains.
    // Remove that header before calling the standalone Worker's implementation,
    // whose browser CORS policy belongs to its separate public endpoint.
    const headers = new Headers(request.headers);
    headers.delete('Origin');
    headers.delete('x-api-key');
    const internalRequest = new Request(request, { headers });
    const response = await worker.fetch(internalRequest, {
      API_KEY: env.API_KEY,
      SESSION_SECRET: env.SESSION_SECRET,
      VAULT_SECRET: env.VAULT_SECRET,
      // Signed-out logins (see /api/signout) live in the same KV namespace.
      REVOCATIONS: env.CHAT_LIMITS,
      // Deliberately omit owner credentials and the shared MARKS cache.
    }, ctx);
    const result = new Response(response.body, response);
    for (const name of [...result.headers.keys()]) {
      if (name.startsWith('access-control-')) result.headers.delete(name);
    }
    result.headers.set('Cache-Control', 'no-store');
    if (student && result.status === 401) {
      const counted = recordLoginFailure(env.CHAT_LIMITS, student, address).catch(() => {});
      if (ctx?.waitUntil) ctx.waitUntil(counted); else await counted;
    }
    // Keep each student's last recorded marks in Supabase and fall back to them
    // when TeachAssist comes back empty.
    return url.pathname === '/api/marks' ? withSavedMarks(result, env, ctx) : result;
  },
};
