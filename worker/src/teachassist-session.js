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
  'TeachAssist declined this sign-in. If these details work on the official site, please try again here.', { status: 401 });

function cookieLines(response) {
  const headers = response.headers;
  const lines = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie') || ''];
  // A combined header may contain Expires=Wed, 21 Oct ...; split only before
  // another cookie name, never at that date's comma.
  return lines.flatMap(line => line.split(/,(?=\s*[^\s;,=]+\s*=)/));
}
export function mergeCookies(jar, response) {
  for (const raw of cookieLines(response)) {
    const [pair, ...attributes] = raw.split(';');
    const at = pair.indexOf('=');
    if (at < 1) continue;
    const name = pair.slice(0, at).trim(), value = pair.slice(at + 1).trim();
    const maxAge = attributes.find(a => /^\s*max-age\s*=/i.test(a))?.split('=')[1];
    const expiryAttribute = attributes.find(a => /^\s*expires\s*=/i.test(a));
    const expires = expiryAttribute?.slice(expiryAttribute.indexOf('=') + 1);
    const cleared = !value || value.toLowerCase() === 'deleted' ||
      (maxAge !== undefined ? Number(maxAge) <= 0 : expires && Date.parse(expires) <= Date.now());
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
function hasPasswordField(html) {
  return [...html.matchAll(/<input\b[^>]*>/gi)].some(([tag]) => {
    const attr = attributes(tag);
    return attr.type?.toLowerCase() === 'password';
  });
}
export function assertLoggedIn(html) {
  if (hasPasswordField(html)) throw failure('TA_SESSION_REJECTED',
    'TeachAssist returned to its login page before your marks loaded. Please try signing in again.', true);
  if (/cf-chl-|<title>\s*Just a moment/i.test(html)) throw failure('TA_UPSTREAM_BLOCKED',
    'TeachAssist is asking this server for a browser verification. You can still use the official TeachAssist site.');
}

export function createTeachAssistSession({ origin, loginUrl, courseListUrl, fields, userAgent }) {
  function safeUrl(value, base) {
    let url;
    try { url = new URL(value, base); } catch { throw failure('TA_REDIRECT_INVALID', 'TeachAssist returned an unsupported sign-in redirect.'); }
    if (url.origin !== origin || url.username || url.password)
      throw failure('TA_REDIRECT_INVALID', 'TeachAssist returned an unsupported sign-in redirect.');
    url.hash = '';
    return url;
  }
  async function request(url, options, deadline = Date.now() + 12000) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw failure('TA_TIMEOUT', 'TeachAssist took too long to respond. Please try again.');
    let response;
    try {
      response = await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(Math.min(12000, remaining)),
        headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml', ...options.headers } });
    } catch {
      throw failure('TA_CONNECTION_FAILED', 'The server could not connect to TeachAssist. Please try again shortly.', true);
    }
    if (response.status === 429) throw new TeachAssistError('TA_RATE_LIMITED',
      'TeachAssist is limiting sign-in attempts. Please wait a few minutes before trying again.', { status: 503 });
    if (response.status === 401 || response.status === 403) throw failure('TA_UPSTREAM_BLOCKED',
      'TeachAssist refused the server connection. Your password has not been verified. Please use the official site for now.');
    if (response.status >= 400) throw failure('TA_UPSTREAM_UNAVAILABLE',
      'TeachAssist is temporarily unavailable to this server. Please try again shortly.', response.status >= 500);
    return response;
  }
  function idFrom(url, jar, html = '') {
    const input = [...html.matchAll(/<input\b[^>]*>/gi)].map(([tag]) => attributes(tag)).find(a => a.name === 'student_id');
    const candidates = [url.searchParams.get('student_id'), jar.student_id, input?.value];
    // Some successful forms carry the internal student ID in a report link.
    for (const [tag] of html.matchAll(/<a\b[^>]*>/gi)) {
      const href = attributes(tag).href;
      if (!href) continue;
      try { const link = safeUrl(href, url); if (link.pathname.startsWith('/live/students/')) candidates.push(link.searchParams.get('student_id')); } catch { /* Ignore unrelated external links. */ }
    }
    return candidates.find(value => typeof value === 'string' && /^\d+$/.test(value)) || null;
  }
  function isErrorRedirect(url) {
    // An error parameter is an upstream rejection, but its value is never
    // interpreted as proof that the supplied password is wrong.
    return [...url.searchParams.keys()].some(key => key.toLowerCase() === 'error');
  }
  async function follow(response, url, jar, { deadline, afterLogin = false, method = 'GET', body } = {}) {
    let studentId = null;
    for (let redirects = 0; ; redirects++) {
      mergeCookies(jar, response);
      studentId = idFrom(url, jar) || studentId;
      if (response.status < 300 || response.status >= 400) {
        const html = await response.text();
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
      } }, deadline);
    }
  }
  function formFor(html, base) {
    const forms = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi)].map(m => m[0]);
    const form = forms.find(hasPasswordField);
    const hidden = Object.create(null);
    let action = new URL(loginUrl);
    if (form) {
      action = safeUrl(attributes(form.slice(0, form.indexOf('>') + 1)).action || base.href, base);
      for (const [tag] of form.matchAll(/<input\b[^>]*>/gi)) {
        const input = attributes(tag);
        if (input.type?.toLowerCase() === 'hidden' && input.name &&
            ![fields.username, fields.password, 'submit'].includes(input.name)) hidden[input.name] = input.value || '';
      }
    }
    return { action, hidden };
  }
  function formBody(env, creds, hidden = {}) {
    const body = new URLSearchParams({ ...fields.extra, ...hidden });
    body.set(fields.username, creds?.username ?? env.TA_USERNAME ?? '');
    body.set(fields.password, creds?.password ?? env.TA_PASSWORD ?? '');
    return body.toString();
  }
  // Kept for the owner's raw-login diagnostics and contract test.
  async function loginResponse(env, creds) {
    return request(loginUrl, { method: 'POST', headers: {
      'content-type': 'application/x-www-form-urlencoded', origin, referer: loginUrl,
    }, body: formBody(env, creds) });
  }
  async function login(env, creds) {
    const deadline = Date.now() + 30000;
    async function complete(response, action, jar, body) {
      const landed = await follow(response, action, jar, { deadline, afterLogin: true, method: 'POST', body });
      if (hasPasswordField(landed.html) && /(?:invalid|incorrect|wrong)\s+(?:student\s+(?:number|id)|username|password|credentials)|(?:username|password)\s+(?:is\s+)?(?:invalid|incorrect)/i.test(landed.html)) throw rejection();
      assertLoggedIn(landed.html);
      if (!Object.keys(jar).length) throw failure('TA_SESSION_MISSING',
        'TeachAssist did not create a sign-in session. Please try again; your password has not been verified.', true);
      if (!landed.studentId) throw failure('TA_STUDENT_ID_MISSING',
        'TeachAssist did not return your student record after sign-in. Please try again.', true);
      const session = { jar, cookie: cookieHeader(jar), studentId: landed.studentId };
      if (landed.url.pathname === new URL(courseListUrl).pathname && landed.url.searchParams.get('student_id') === landed.studentId)
        session.listHtml = landed.html;
      return session;
    }
    // Preserve the previously working direct POST before trying form bootstrap.
    // An upstream error redirect can also mean a missing pre-login cookie or
    // hidden field, so do not conclude the password is wrong from it alone.
    try {
      const jar = Object.create(null);
      const body = formBody(env, creds);
      const response = await request(loginUrl, { method: 'POST', body, headers: {
        'content-type': 'application/x-www-form-urlencoded', origin, referer: loginUrl,
      } }, deadline);
      return await complete(response, new URL(loginUrl), jar, body);
    } catch (err) {
      if (!(err instanceof TeachAssistError) ||
          ['TA_REDIRECT_INVALID', 'TA_RATE_LIMITED'].includes(err.code)) throw err;
    }
    for (let attempt = 1; ; attempt++) {
      try {
        // A fresh, isolated browser session carries pre-login cookies and
        // hidden form fields into the credential POST.
        const jar = Object.create(null);
        const first = await request(loginUrl, { method: 'GET', headers: {} }, deadline);
        const initial = await follow(first, new URL(loginUrl), jar, { deadline });
        const form = formFor(initial.html, initial.url);
        const body = formBody(env, creds, form.hidden);
        const submitted = await request(form.action.href, { method: 'POST', body, headers: {
          'content-type': 'application/x-www-form-urlencoded', origin,
          referer: initial.url.href, cookie: cookieHeader(jar),
        } }, deadline);
        return await complete(submitted, form.action, jar, body);
      } catch (err) {
        if (!(err instanceof TeachAssistError) || !err.retryable || attempt >= 2 || Date.now() + 300 >= deadline) throw err;
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  }
  async function fetchWithSession(targetUrl, session, referer) {
    const url = safeUrl(targetUrl, origin);
    const deadline = Date.now() + 12000;
    const response = await request(url.href, { method: 'GET', headers: { cookie: cookieHeader(session.jar), referer } }, deadline);
    const landed = await follow(response, url, session.jar, { deadline });
    session.cookie = cookieHeader(session.jar);
    if (landed.url.pathname.startsWith('/yrdsb/')) throw failure('TA_SESSION_REJECTED',
      'TeachAssist redirected back to sign-in before your marks loaded. Please try again.', true);
    assertLoggedIn(landed.html);
    return landed.html;
  }
  return { login, loginResponse, fetchWithSession, assertLoggedIn };
}
