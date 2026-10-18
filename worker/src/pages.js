// Pages advanced-mode entry point. Deploy the sign-in service with the site so
// a frontend release cannot depend on an out-of-date standalone Worker.
import worker from './index.js';
import { handleChat } from './chat.js';
import { handleStore, withSavedMarks, storeConfigured } from './store.js';

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
      // `setup` says only whether each tutor setting is present — never values —
      // so a missing secret or binding is easy to spot after a deploy.
      return json({
        service: 'TeachAssist', studentSignIn: true, version: 1,
        tutor: !!(env.OPENAI_API_KEY && env.API_KEY),
        setup: { OPENAI_API_KEY: !!env.OPENAI_API_KEY, API_KEY: !!env.API_KEY, CHAT_LIMITS: !!env.CHAT_LIMITS, SUPABASE_URL: !!(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL), SUPABASE_KEY: !!(env.SUPABASE_SERVICE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) },
        cloudSave: storeConfigured(env),
      });
    }
    // School-focused AI tutor (OpenAI). Same-origin was checked above.
    if (url.pathname === '/api/chat' && !url.search) {
      if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
      return handleChat(request, env);
    }
    // Dreams + goals saved to Supabase (per student, token-authenticated).
    if (url.pathname === '/api/store' && !url.search) return handleStore(request, env);
    // The website exposes only student operations, never owner/cache/debug APIs.
    if (!['/api/marks', '/api/assistant'].includes(url.pathname) || url.search) {
      return json({ error: 'Not found.' }, 404);
    }
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    if (url.pathname === '/api/assistant' && (!env.AI || !env.API_KEY)) {
      return json({ error: 'AI is not configured on this site yet. The quick calculator still works.' }, 503);
    }

    // Same-origin was validated above, including on Pages preview domains.
    // Remove that header before calling the standalone Worker's implementation,
    // whose browser CORS policy belongs to its separate public endpoint.
    const headers = new Headers(request.headers);
    headers.delete('Origin');
    headers.delete('x-api-key');
    const internalRequest = new Request(request, { headers });
    const response = await worker.fetch(internalRequest, {
      AI: env.AI,
      API_KEY: env.API_KEY,
      // Deliberately omit owner credentials and the shared MARKS cache.
    }, ctx);
    const result = new Response(response.body, response);
    for (const name of [...result.headers.keys()]) {
      if (name.startsWith('access-control-')) result.headers.delete(name);
    }
    result.headers.set('Cache-Control', 'no-store');
    // Keep each student's last recorded marks in Supabase and fall back to them
    // when TeachAssist comes back empty.
    return url.pathname === '/api/marks' ? withSavedMarks(result, env, ctx) : result;
  },
};
