// Browser-like TeachAssist login transport. Cookie state is private to one
// request/account, and credentials/cookies never follow an off-site redirect.
export class TeachAssistError extends Error {
  constructor(code, message, { status = 502, retryable = false } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}
const failure = (code, message, retryable = false) => new TeachAssistError(code, message, { retryable });
const rejection = () => new TeachAssistError('TA_LOGIN_REJECTED',
  "TeachAssist didn't accept that student number and password. Check them and try again; they're the same ones you use on ta.yrdsb.ca.", { status: 401 });
const UNREACHABLE = "TeachAssist isn't answering the sign-in server right now. The official site may still work. Please try again in a few minutes.";
// Network-level failures end a sign-in at once: retrying only makes students
// wait longer and adds load to TeachAssist.
const TRANSPORT_CODES = new Set(['TA_CONNECTION_FAILED', 'TA_TIMEOUT', 'TA_RATE_LIMITED',
  'TA_UPSTREAM_BLOCKED', 'TA_UPSTREAM_UNAVAILABLE', 'TA_REDIRECT_INVALID']);

function cookieLines(response) {
  const headers = response.headers;
  const lines = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie') || ''];
  // A combined header may contain Expires=Wed, 21 Oct ...; split only before
  // another cookie name, never at that date's comma.
  return lines.flatMap(line => line.split(/,(?=\s*[^\s;,=]+\s*=)/));
}
// Tolerant like the original working client: a cookie is removed only when it
// is explicitly deleted, never because the server clock makes Expires look a
// little stale.
export function mergeCookies(jar, response) {
  for (const raw of cookieLines(response)) {
    const [pair, ...attributes] = raw.split(';');
    const at = pair.indexOf('=');
    if (at < 1) continue;
    const name = pair.slice(0, at).trim(), value = pair.slice(at + 1).trim();
    const maxAge = attributes.find(a => /^\s*max-age\s*=/i.test(a))?.split('=')[1];
    const expiryAttribute = attributes.find(a => /^\s*expires\s*=/i.test(a));
    const expires = expiryAttribute ? Date.parse(expiryAttribute.slice(expiryAttribute.indexOf('=') + 1)) : NaN;
    const cleared = !value || value.toLowerCase() === 'deleted' ||
      (maxAge !== undefined && Number(maxAge) <= 0) ||
      (Number.isFinite(expires) && new Date(expires).getUTCFullYear() < 2000);
    if (cleared) delete jar[name];
    else jar[name] = value;
  }
  return jar;
}
export function extractCookies(response) { return mergeCookies(Object.create(null), response); }
export function cookieHeader(jar) { return Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; '); }

function decode(value) {
  return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#(?:0*39|x0*27);/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : '');
}
function attributes(tag) {
  const values = Object.create(null);
  for (const match of tag.matchAll(/\b([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))
    values[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
  return values;
}
const inputsIn = html => [...html.matchAll(/<input\b[^>]*>/gi)].map(([tag]) => attributes(tag));
const typeOf = input => (input.type || 'text').toLowerCase();
const isPassword = input => typeOf(input) === 'password';
const isUserField = input => !['password', 'hidden', 'submit', 'button', 'checkbox', 'radio', 'image', 'reset'].includes(typeOf(input)) && !!input.name;
// A sign-in page has both a password box and a user-name box. A lone password
// input elsewhere (e.g. a settings widget) is not the login page.
function looksLikeLogin(html) {
  const inputs = inputsIn(html);
  return inputs.some(isPassword) && inputs.some(isUserField);
}
const REJECT_TEXT = /(?:invalid|incorrect|wrong)\s+(?:student\s+(?:number|id)|user\s*name|username|password|credentials|login)|(?:user\s*name|username|password)\s+(?:is\s+|was\s+)?(?:invalid|incorrect|wrong)|access denied|login failed/i;
export function assertLoggedIn(html) {
  if (looksLikeLogin(html)) throw failure('TA_SESSION_REJECTED',
    'TeachAssist returned to its login page before your marks loaded. Please try signing in again.', true);
  if (/cf-chl-|<title>\s*Just a moment/i.test(html)) throw failure('TA_UPSTREAM_BLOCKED',
    'TeachAssist is asking this server for a browser verification. You can still use the official TeachAssist site.');
}
// Any "error" in a post-login redirect (e.g. ?error_message=3) is TeachAssist's
// rejection signal, matching the original client's /error/i check.
function isErrorRedirect(url) {
  return [...url.searchParams].some(([key, value]) => /error/i.test(key) || /error/i.test(value));
}
const numericId = value => typeof value === 'string' && /^\d+$/.test(value) ? value : null;

// A secret-free record of what TeachAssist did: methods, statuses, paths,
// query parameter NAMES, cookie NAMES and form input names/types. It never
// contains credentials, student numbers, cookie values, query values or HTML.
function describe(url) {
  if (!url) return '';
  const keys = [...new Set(url.searchParams.keys())];
  return url.pathname + (keys.length ? `?${keys.join('&')}` : '');
}
function note(trace, line) { if (trace && trace.length < 20) trace.push(line); }
function notePage(trace, url, html) {
  const inputs = inputsIn(html).map(i => `${typeOf(i)}:${(i.name || '?').slice(0, 30)}`).slice(0, 12);
  const kind = looksLikeLogin(html) ? 'login form' : 'page';
  note(trace, `${describe(url)} → ${kind}${inputs.length ? ` [${inputs.join(', ')}]` : ''}${REJECT_TEXT.test(html) ? ' · rejection text' : ''}`);
}

export function createTeachAssistSession({ origin, loginUrl, courseListUrl, fields, userAgent }) {
  const listPath = new URL(courseListUrl).pathname;
  function safeUrl(value, base) {
    let url;
    try { url = new URL(value, base); } catch { throw failure('TA_REDIRECT_INVALID', 'TeachAssist returned an unsupported sign-in redirect.'); }
    if (url.origin !== origin || url.username || url.password)
      throw failure('TA_REDIRECT_INVALID', 'TeachAssist returned an unsupported sign-in redirect.');
    url.hash = '';
    return url;
  }
  async function request(url, options, deadline = Date.now() + 10000, trace) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw failure('TA_TIMEOUT', UNREACHABLE);
    let response;
    try {
      response = await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(Math.min(10000, remaining)),
        headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml', ...options.headers } });
    } catch (err) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      note(trace, `${options.method} ${describe(new URL(url))} → ${timedOut ? 'timeout' : 'connection failed'}`);
      throw failure(timedOut ? 'TA_TIMEOUT' : 'TA_CONNECTION_FAILED', UNREACHABLE);
    }
    const location = response.headers.get('location');
    let next = '';
    if (location) { try { next = ` → ${new URL(location, url).origin === origin ? describe(new URL(location, url)) : 'off-site'}`; } catch { next = ' → invalid'; } }
    const set = cookieLines(response).map(c => c.split('=')[0].trim()).filter(Boolean);
    note(trace, `${options.method} ${describe(new URL(url))} ${response.status}${next}${set.length ? ` · sets ${set.join(',')}` : ''}`);
    if (response.status === 429) throw new TeachAssistError('TA_RATE_LIMITED',
      'TeachAssist is limiting sign-in attempts. Please wait a few minutes before trying again.', { status: 503 });
    if (response.status === 401 || response.status === 403) throw failure('TA_UPSTREAM_BLOCKED',
      'TeachAssist refused the server connection. Your password has not been verified. Please use the official site for now.');
    if (response.status >= 400) throw failure('TA_UPSTREAM_UNAVAILABLE',
      'TeachAssist is temporarily unavailable to this server. Please try again shortly.');
    return response;
  }
  function idFrom(url, jar, html = '') {
    const input = inputsIn(html).find(a => a.name === 'student_id');
    const candidates = [url.searchParams.get('student_id'), jar.student_id, input?.value];
    // Some successful forms carry the internal student ID in a report link.
    for (const [tag] of html.matchAll(/<a\b[^>]*>/gi)) {
      const href = attributes(tag).href;
      if (!href) continue;
      try { const link = safeUrl(href, url); if (link.pathname.startsWith('/live/students/')) candidates.push(link.searchParams.get('student_id')); } catch { /* Ignore unrelated external links. */ }
    }
    return candidates.find(numericId) || null;
  }
  async function follow(response, url, jar, { deadline, trace, afterLogin = false, method = 'GET', body } = {}) {
    let studentId = null;
    for (let redirects = 0; ; redirects++) {
      mergeCookies(jar, response);
      studentId = idFrom(url, jar) || studentId;
      if (response.status < 300 || response.status >= 400) {
        const html = await response.text();
        notePage(trace, url, html);
        return { url, html, studentId: idFrom(url, jar, html) || studentId };
      }
      if (redirects >= 5 || !response.headers.get('location'))
        throw failure('TA_REDIRECT_LIMIT', 'TeachAssist did not finish its sign-in redirects. Please try again.');
      const next = safeUrl(response.headers.get('location'), url);
      if (afterLogin && isErrorRedirect(next)) throw rejection();
      // Browser redirect semantics: 307/308 preserve the form POST; 301/302/303
      // switch a submitted form to GET. Cookies are merged at every hop.
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
        method = 'GET'; body = undefined;
      }
      const referer = url.href;
      url = next;
      response = await request(url.href, { method, body, headers: {
        cookie: cookieHeader(jar), referer,
        ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded', origin } : {}),
      } }, deadline, trace);
    }
  }
  // Reads the real sign-in form, so renamed fields and hidden tokens are sent
  // exactly as a browser would send them.
  function formFor(html, base) {
    const forms = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi)].map(m => m[0]);
    const form = forms.find(f => inputsIn(f).some(isPassword)) || (looksLikeLogin(html) ? html : '');
    const hidden = Object.create(null);
    const result = { action: new URL(loginUrl), hidden, names: { username: fields.username, password: fields.password } };
    if (!form) return result;
    const formTag = form.match(/<form\b[^>]*>/i)?.[0];
    if (formTag) result.action = safeUrl(attributes(formTag).action || base.href, base);
    const inputs = inputsIn(form);
    const password = inputs.find(isPassword);
    const users = inputs.filter(isUserField);
    const user = users.find(i => i.name === fields.username) || users.find(i => /user|login|student|name/i.test(i.name)) || users[0];
    if (password?.name) result.names.password = password.name;
    if (user?.name) result.names.username = user.name;
    for (const input of inputs) {
      if (typeOf(input) === 'hidden' && input.name && ![result.names.username, result.names.password].includes(input.name))
        hidden[input.name] = input.value || '';
    }
    return result;
  }
  function formBody(env, creds, hidden = {}, names = fields) {
    const body = new URLSearchParams({ ...fields.extra, ...hidden });
    body.set(names.username, creds?.username ?? env.TA_USERNAME ?? '');
    body.set(names.password, creds?.password ?? env.TA_PASSWORD ?? '');
    return body.toString();
  }
  // Kept for the owner's raw-login diagnostics and contract test.
  async function loginResponse(env, creds) {
    return request(loginUrl, { method: 'POST', headers: {
      'content-type': 'application/x-www-form-urlencoded', origin, referer: loginUrl,
    }, body: formBody(env, creds) });
  }
  async function login(env, creds) {
    const deadline = Date.now() + 20000;
    const trace = [];
    // One submitted sign-in: POST the form, then open the marks list the way
    // the original working client did, falling back to the redirect chain.
    async function submit(action, body, jar, headers) {
      const response = await request(action.href, { method: 'POST', body, headers: {
        'content-type': 'application/x-www-form-urlencoded', origin, ...headers,
      } }, deadline, trace);
      mergeCookies(jar, response);
      const location = response.headers.get('location');
      const next = location ? safeUrl(location, action) : null;
      if (next && isErrorRedirect(next)) throw rejection();
      const directId = numericId(jar.student_id) || numericId(next?.searchParams.get('student_id'));
      if (directId && Object.keys(jar).length) {
        const saved = Object.assign(Object.create(null), jar);
        const listUrl = new URL(`${courseListUrl}?student_id=${encodeURIComponent(directId)}`);
        const listed = await follow(await request(listUrl.href, { method: 'GET', headers: {
          cookie: cookieHeader(jar), referer: action.href,
        } }, deadline, trace), listUrl, jar, { deadline, trace });
        if (!looksLikeLogin(listed.html)) {
          assertLoggedIn(listed.html);
          const session = { jar, cookie: cookieHeader(jar), studentId: directId, trace };
          if (listed.url.pathname === listPath) session.listHtml = listed.html;
          return session;
        }
        note(trace, 'direct marks list returned the login form; following TeachAssist redirects');
        for (const key of Object.keys(jar)) delete jar[key];
        Object.assign(jar, saved);
      }
      const landed = await follow(response, action, jar, { deadline, trace, afterLogin: true, method: 'POST', body });
      if (looksLikeLogin(landed.html)) throw rejection();
      assertLoggedIn(landed.html);
      if (!Object.keys(jar).length) throw failure('TA_SESSION_MISSING',
        'TeachAssist did not create a sign-in session. Please try again; your password has not been verified.', true);
      if (!landed.studentId) throw failure('TA_STUDENT_ID_MISSING',
        'TeachAssist did not return your student record after sign-in. Please try again.', true);
      const session = { jar, cookie: cookieHeader(jar), studentId: landed.studentId, trace };
      if (landed.url.pathname === listPath && landed.url.searchParams.get('student_id') === landed.studentId)
        session.listHtml = landed.html;
      return session;
    }
    let firstError;
    try {
      try {
        // The original working route: a direct form POST, no login-page GET.
        note(trace, 'attempt 1: direct sign-in');
        return await submit(new URL(loginUrl), formBody(env, creds), Object.create(null), { referer: loginUrl });
      } catch (err) {
        if (!(err instanceof TeachAssistError) || TRANSPORT_CODES.has(err.code) || Date.now() + 1000 >= deadline) throw err;
        firstError = err;
      }
      try {
        // A fresh, isolated browser session carries pre-login cookies, hidden
        // fields and the form's real input names into the credential POST.
        note(trace, 'attempt 2: sign-in through the login form');
        const jar = Object.create(null);
        const page = await follow(await request(loginUrl, { method: 'GET', headers: {} }, deadline, trace),
          new URL(loginUrl), jar, { deadline, trace });
        const form = formFor(page.html, page.url);
        return await submit(form.action, formBody(env, creds, form.hidden, form.names), jar,
          { referer: page.url.href, cookie: cookieHeader(jar) });
      } catch (err) {
        // A network hiccup on the retry must not hide TeachAssist's real answer.
        throw err instanceof TeachAssistError && TRANSPORT_CODES.has(err.code) ? firstError : err;
      }
    } catch (err) {
      if (err instanceof TeachAssistError) err.trace = trace;
      throw err;
    }
  }
  async function fetchWithSession(targetUrl, session, referer) {
    const trace = session.trace;
    try {
      const url = safeUrl(targetUrl, origin);
      const deadline = Date.now() + 12000;
      const response = await request(url.href, { method: 'GET', headers: { cookie: cookieHeader(session.jar), referer } }, deadline, trace);
      const landed = await follow(response, url, session.jar, { deadline, trace });
      session.cookie = cookieHeader(session.jar);
      if (landed.url.pathname.startsWith('/yrdsb/')) throw failure('TA_SESSION_REJECTED',
        'TeachAssist redirected back to sign-in before your marks loaded. Please try again.', true);
      assertLoggedIn(landed.html);
      return landed.html;
    } catch (err) {
      if (err instanceof TeachAssistError && trace) err.trace = trace;
      throw err;
    }
  }
  return { login, loginResponse, fetchWithSession, assertLoggedIn };
}
