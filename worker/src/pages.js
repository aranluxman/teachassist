// Pages advanced-mode entry point. Deploy the sign-in service with the site so
// a frontend release cannot depend on an out-of-date standalone Worker.
import worker from './index.js';
import { handleChat } from './chat.js';

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'Origin not allowed.' }, 403);

    if (url.pathname === '/api/status' && request.method === 'GET') {
      return json({ service: 'TeachAssist', studentSignIn: true, version: 1, tutor: !!(env.OPENAI_API_KEY && env.API_KEY) });
    }
    // School-focused AI tutor (OpenAI). Same-origin was checked above.
    if (url.pathname === '/api/chat' && !url.search) {
      if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
      return handleChat(request, env);
    }
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
    return result;
  },
};
