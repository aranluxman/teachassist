/**
 * Personal TeachAssist marks fetcher — Cloudflare Worker
 * ----------------------------------------------------------------------------
 * Logs into the YRDSB TeachAssist site (ta.yrdsb.ca) using MY OWN credentials
 * (provided as encrypted Worker secrets) and returns MY marks as JSON.
 *
 * Single route:  GET /api/marks
 *
 * This is a personal, single-user tool. Credentials live ONLY as Worker
 * secrets (TA_USERNAME / TA_PASSWORD). They are never hardcoded, never logged,
 * and never returned to the browser.
 *
 * TeachAssist is an unofficial, undocumented site, so EVERY endpoint, form
 * field name, cookie name and HTML selector that might change is hoisted into
 * the clearly-labelled CONFIG block below. After inspecting your own browser's
 * DevTools → Network tab, correct any value here that doesn't match reality.
 * ============================================================================
 */

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  CONFIG — EDIT THESE AFTER INSPECTING YOUR BROWSER'S NETWORK TAB           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// --- CORS -------------------------------------------------------------------
// Only this single origin (your dashboard) is allowed to call the Worker from
// a browser. Use the exact scheme + host (+ port). Use "*" ONLY for quick
// throwaway testing — locking this down is one of the hard requirements.
// Origin only (scheme + host, no path, no trailing slash) — CORS matches origin.
const DASHBOARD_ORIGIN = "https://teachassist.pages.dev";

// --- Optional shared-secret gate -------------------------------------------
// When true, every request must send the API_KEY secret in API_KEY_HEADER so
// that only you can call the endpoint. Set the secret with:
//   wrangler secret put API_KEY
const REQUIRE_API_KEY = true;
const API_KEY_HEADER = "x-api-key";

// --- TeachAssist endpoints --------------------------------------------------
// The base origin and the URLs the login flow touches. Values below are
// verified against the live site's Network tab.
const TA_ORIGIN = "https://ta.yrdsb.ca";

// The login form POST target (verified — returns 302 on success).
const LOGIN_URL = `${TA_ORIGIN}/yrdsb/index.php`;

// The marks-list page that lists your courses after login. TeachAssist assigns
// your student_id (also set as a cookie on login); this personal tool pins it
// here. If you ever log in as a different account, change the student_id below.
const COURSE_LIST_URL = `${TA_ORIGIN}/live/students/listReports.php?student_id=242965`;

// The per-course report page. The Worker appends ?subject_id=..&student_id=..
// using the subject_id scraped from each course link and your student_id, so a
// relative href in the HTML does not matter — only this base path matters.
const REPORT_URL_BASE = `${TA_ORIGIN}/live/students/viewReport.php`;

// --- Login form field names -------------------------------------------------
// The EXACT form field names submitted by the login <form> (verified: only
// username + password are required). `extra` holds any constant hidden/submit
// fields — left empty per your capture. If a login ever returns the login page
// instead of a 302, uncomment submit (some TA deployments require it).
const LOGIN_FIELDS = {
  username: "username",
  password: "password",
  extra: {
    // submit: "Login",
  },
};

// --- Session cookie ---------------------------------------------------------
// The cookie TeachAssist sets to carry the logged-in session (verified). The
// Worker captures it from the login response's Set-Cookie header and sends it
// on every subsequent request. (TeachAssist also sets a `student_id` cookie.)
const SESSION_COOKIE_NAME = "session_token";

// --- Report fetching --------------------------------------------------------
// When true, the Worker also opens each course's report page and parses the
// per-assessment evaluation rows. Set false for a faster, marks-only response.
const FETCH_REPORTS = true;

// --- HTML parsing knobs -----------------------------------------------------
// TeachAssist colour-codes each strand (weight category) cell on the report
// page with a background colour. Map those colours -> human labels here. These
// four are the long-standing TeachAssist colours; "Other"/"Final" vary, so
// verify them against your own report's HTML if those rows look wrong.
const STRAND_COLOURS = {
  ffffaa: "Knowledge/Understanding",
  c0fea4: "Thinking",
  afafff: "Communication",
  ffd490: "Application",
  eeeeee: "Other", // the real report uses #eeeeee for "Other"
  dedede: "Other", // kept as an alternate
  cccccc: "Final", // "Final/Culminating"
};

// Regex used to recognise a course code such as "ENG4U", "MHF4U-01",
// "SCH3U7". Adjust if your board uses a different code shape.
const COURSE_CODE_RE = /\b([A-Z]{2,5}\d[A-Z0-9]{1,3}(?:-\d{1,2})?)\b/;

// A normal-looking browser User-Agent. Some sites reject the default fetch UA.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Print non-sensitive structural diagnostics to `wrangler tail`. NEVER logs
// credentials, cookies or page contents. (Temporarily ON for debugging.)
const DEBUG = true;

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  END OF CONFIG — you normally don't need to edit below this line           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/** Error type for "could not log in / session rejected" situations. */
class AuthError extends Error {}

export default {
  /**
   * @param {Request} request
   * @param {{ TA_USERNAME?: string, TA_PASSWORD?: string, API_KEY?: string }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight — answer before any auth so the browser can proceed.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Single route: GET /api/marks
    if (request.method !== "GET" || url.pathname !== "/api/marks") {
      return json({ error: "Not found", hint: "Use GET /api/marks" }, 404);
    }

    // Optional shared-secret gate so only you can call this. Accept the key via
    // the x-api-key header OR a ?key= query param, so the debug routes can be
    // opened directly in a browser. (A query-param key is visible in the URL /
    // browser history — acceptable for the temporary debug routes on a personal
    // single-user tool; prefer the header for normal use.)
    if (REQUIRE_API_KEY) {
      const provided = request.headers.get(API_KEY_HEADER) || url.searchParams.get("key");
      if (!env.API_KEY || !provided || !timingSafeEqual(provided, env.API_KEY)) {
        return json({ error: "Unauthorized" }, 401);
      }
    }

    // Secrets must be configured (wrangler secret put ...).
    if (!env.TA_USERNAME || !env.TA_PASSWORD) {
      return json(
        {
          error:
            "Server not configured: missing TA_USERNAME / TA_PASSWORD secrets.",
        },
        500
      );
    }

    // Optional debug switches (all behind the API-key gate above; none of them
    // ever expose your password or the session cookie value):
    //   /api/marks?debug=login            -> login status/redirect metadata
    //   /api/marks?debug=courses          -> raw HTML of the marks-list page
    //   /api/marks?debug=report&subject_id=NNN -> raw HTML of one report page
    const debug = url.searchParams.get("debug");

    try {
      // debug=login runs the POST directly so you can see WHY a login failed
      // (status, redirect Location, which cookies came back) without throwing.
      if (debug === "login") {
        const res = await loginResponse(env);
        const jar = extractCookies(res);
        const location = res.headers.get("location") || "";
        return json({
          status: res.status,
          location,
          setCookieNames: Object.keys(jar),
          sessionCookieName: SESSION_COOKIE_NAME,
          hasSessionCookie: !!jar[SESSION_COOKIE_NAME],
          studentId: (location.match(/student_id=(\d+)/) || [])[1] || null,
          note: "No credentials or cookie values are included in this output.",
        });
      }

      // 1 + 2: log in; capture the session cookie + student_id.
      const session = await login(env);

      // 3: fetch the marks-list page (COURSE_LIST_URL) with that cookie.
      const listHtml = await fetchWithSession(COURSE_LIST_URL, session.cookie, LOGIN_URL);

      // debug=courses returns the raw page so you can verify the HTML structure.
      if (debug === "courses") return text(listHtml);

      assertLoggedIn(listHtml);

      // 4: parse course code, name and current mark.
      const courses = await parseCourseList(listHtml);
      // Fill in the student_id from the login redirect when a link omits it.
      for (const c of courses) c.studentId = c.studentId || session.studentId;
      if (DEBUG) console.log(`Parsed ${courses.length} courses`);

      // debug=report returns one raw report page (needs &subject_id=NNN).
      if (debug === "report") {
        const sid = url.searchParams.get("subject_id");
        if (!sid) return json({ error: "Add &subject_id=NNN (from a course link)." }, 400);
        const html = await fetchWithSession(
          `${REPORT_URL_BASE}?subject_id=${encodeURIComponent(sid)}&student_id=${encodeURIComponent(session.studentId)}`,
          session.cookie,
          COURSE_LIST_URL
        );
        return text(html);
      }

      // 5: optionally fetch + parse each course's evaluation rows.
      if (FETCH_REPORTS) {
        await Promise.all(
          courses.map(async (c) => {
            if (!c.subjectId || !c.studentId) {
              c.evaluations = [];
              return;
            }
            try {
              const reportUrl =
                `${REPORT_URL_BASE}?subject_id=${encodeURIComponent(c.subjectId)}` +
                `&student_id=${encodeURIComponent(c.studentId)}`;
              const reportHtml = await fetchWithSession(reportUrl, session.cookie, COURSE_LIST_URL);
              c.evaluations = await parseEvaluations(reportHtml);
            } catch (err) {
              // One bad report should not sink the whole response.
              c.evaluations = [];
              c.reportError = safeMessage(err);
            }
          })
        );
      } else {
        for (const c of courses) c.evaluations = [];
      }

      // 6: assemble the JSON, exposing only the documented shape.
      const out = courses.map((c) => ({
        code: c.code,
        name: c.name,
        currentMark: c.currentMark,
        midterm: c.midterm ?? null,
        evaluations: c.evaluations,
        ...(c.reportError ? { reportError: c.reportError } : {}),
      }));

      return json(out, 200);
    } catch (err) {
      // Login problems -> 401, everything else (network, parsing) -> 502.
      const status = err instanceof AuthError ? 401 : 502;
      return json({ error: safeMessage(err) }, status);
    }
  },
};

// ============================================================================
// LOGIN + SESSION
// ============================================================================

/**
 * @typedef {Object} Session
 * @property {string} cookie     Cookie header to send on every request
 * @property {string|null} studentId  used to build per-course report URLs
 */

/**
 * Step 1 + 2: POST the login form (form-url-encoded) and capture the session
 * cookie. TeachAssist replies 302 and sets `session_token` (+ a `student_id`
 * cookie). We use `redirect: "manual"` so the Set-Cookie header survives.
 *
 * @param {{ TA_USERNAME: string, TA_PASSWORD: string }} env
 * @returns {Promise<Session>}
 */
async function login(env) {
  const res = await loginResponse(env);

  const jar = extractCookies(res);
  const session = jar[SESSION_COOKIE_NAME];
  const location = res.headers.get("location") || "";

  // A real session cookie (not empty, not "deleted") is the success signal;
  // extractCookies already drops "deleted"/empty values, so absence == failure.
  if (!session) {
    const reason = /error/i.test(location)
      ? "TeachAssist rejected the credentials"
      : `no valid '${SESSION_COOKIE_NAME}' cookie returned`;
    throw new AuthError(
      `Login failed: ${reason}. Check credentials, LOGIN_URL, LOGIN_FIELDS and SESSION_COOKIE_NAME.`
    );
  }

  // student_id for report URLs: prefer the cookie TeachAssist sets; fall back
  // to the one pinned in COURSE_LIST_URL, then the redirect Location.
  const studentId =
    jar.student_id ||
    (COURSE_LIST_URL.match(/student_id=(\d+)/) || [])[1] ||
    (location.match(/student_id=(\d+)/) || [])[1] ||
    null;

  if (DEBUG) {
    console.log(
      `Login OK — cookies: ${Object.keys(jar).join(", ")}; studentId: ${studentId || "(none)"}`
    );
  }
  return { cookie: cookieHeader(jar), studentId };
}

/** Perform the raw login POST (shared by login() and the debug endpoint). */
function loginResponse(env) {
  const body = new URLSearchParams();
  body.set(LOGIN_FIELDS.username, env.TA_USERNAME);
  body.set(LOGIN_FIELDS.password, env.TA_PASSWORD);
  for (const [k, v] of Object.entries(LOGIN_FIELDS.extra || {})) body.set(k, v);

  return fetch(LOGIN_URL, {
    method: "POST",
    redirect: "manual", // we must read Set-Cookie + Location off the 302
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": BROWSER_UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      origin: TA_ORIGIN,
      referer: LOGIN_URL,
    },
    body: body.toString(),
  });
}

/**
 * Step 3 / 5: GET a TeachAssist page using the captured session cookie.
 * Returns the response body as text. Throws AuthError if we get bounced to a
 * login redirect (which means the session was not accepted).
 *
 * @param {string} targetUrl
 * @param {string} cookie    Cookie header value from login()
 * @param {string} referer
 * @returns {Promise<string>}
 */
async function fetchWithSession(targetUrl, cookie, referer) {
  const res = await fetch(targetUrl, {
    method: "GET",
    redirect: "manual",
    headers: {
      cookie,
      "user-agent": BROWSER_UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      referer,
    },
  });

  // A redirect on an authenticated page almost always means "please log in".
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location") || "(unknown)";
    throw new AuthError(`Session not accepted (redirected to ${loc}).`);
  }

  return await res.text();
}

/**
 * Defensive check: if a page that should be behind the login still contains a
 * password field, the session was not accepted.
 */
function assertLoggedIn(html) {
  const looksLikeLogin =
    /type=["']?password["']?/i.test(html) &&
    /name=["']?password["']?/i.test(html);
  if (looksLikeLogin) {
    throw new AuthError(
      "Session not accepted (received the login page). Verify credentials " +
        "and the CONFIG constants."
    );
  }
}

/**
 * Parse all Set-Cookie headers from a response into a { name: value } map,
 * skipping cookies that were cleared (empty or "deleted").
 *
 * Uses Headers.getSetCookie() (multiple Set-Cookie headers as an array) when
 * available, falling back to the single combined header otherwise.
 */
function extractCookies(res) {
  /** @type {Record<string,string>} */
  const jar = {};
  const list =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.get("set-cookie")
      ? [res.headers.get("set-cookie")]
      : [];

  for (const raw of list) {
    const first = raw.split(";", 1)[0]; // "name=value"
    const eq = first.indexOf("=");
    if (eq === -1) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!value || value.toLowerCase() === "deleted") continue;
    jar[name] = value;
  }
  return jar;
}

/** Turn a cookie map into a `Cookie:` header value. */
function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// ============================================================================
// HTML PARSING — COURSE LIST  (Step 4)
// ----------------------------------------------------------------------------
// Isolated, heavily commented and selector-driven so you can adjust it when the
// page structure changes.
//
// Strategy (nesting-proof): we drive Cloudflare's streaming HTMLRewriter in
// document order and keep a tiny bit of state:
//   * an `element` handler on <tr> marks the start/end of a course row;
//   * an `element` handler on the report <a> link extracts subject_id /
//     student_id from its href;
//   * a single `text` handler on the universal selector "*" funnels every text
//     chunk into the current row's buffer (this avoids any ambiguity about
//     whether a text handler sees text nested inside child tags).
// From the accumulated row text we then extract the course code and current
// mark with small, clearly-labelled regexes.
// ============================================================================

/**
 * @typedef {Object} CourseStub
 * @property {string|null} code
 * @property {string} name
 * @property {number|null} currentMark
 * @property {number|null} midterm   "MIDTERM MARK: NN%" shown on the list page
 * @property {string|null} subjectId
 * @property {string|null} studentId
 */

/**
 * @param {string} html  the course-list page HTML
 * @returns {Promise<CourseStub[]>}
 */
async function parseCourseList(html) {
  /** @type {CourseStub[]} */
  const courses = [];
  const seen = new Set();

  // Mutable state shared by the handlers below.
  let row = null; // { textBuf, subjectId, studentId }

  const rewriter = new HTMLRewriter()
    // Row boundaries.
    .on("tr", {
      element(el) {
        const current = { textBuf: "", subjectId: null, studentId: null };
        row = current;
        el.onEndTag(() => {
          finalizeCourseRow(current, courses, seen);
          if (row === current) row = null;
        });
      },
    })
    // The "current mark = NN%" link carries the IDs we need for the report.
    .on('a[href*="viewReport"]', {
      element(el) {
        if (!row) return;
        const href = el.getAttribute("href") || "";
        const sub = href.match(/subject_id=(\d+)/);
        const stu = href.match(/student_id=(\d+)/);
        if (sub) row.subjectId = sub[1];
        if (stu) row.studentId = stu[1];
      },
    })
    // Universal text capture, routed into the active row only.
    .on("*", {
      text(t) {
        if (row) row.textBuf += t.text;
      },
    });

  // Consuming the transformed body drives the handlers to completion.
  await rewriter.transform(new Response(html)).arrayBuffer();
  return courses;
}

/**
 * Turn one accumulated <tr> into a CourseStub (or ignore it). Kept separate so
 * the extraction rules are easy to find and tweak.
 */
function finalizeCourseRow(rowState, out, seen) {
  const text = collapseWhitespace(rowState.textBuf);
  if (!text) return;

  const code = extractCourseCode(text);
  const currentMark = extractCurrentMark(text);
  const midterm = extractMidterm(text);

  // A row is only a course if it has a report link or a recognisable code.
  if (!rowState.subjectId && !code) return;

  // Build a friendly name: row text minus the mark phrases that live in it.
  let name = text
    .replace(/current mark\s*=\s*[\d.]+\s*%/i, "")
    .replace(/midterm mark\s*:?\s*[\d.]+\s*%/i, "")
    .trim();
  name = collapseWhitespace(name).slice(0, 200);
  if (!name) name = code || "Unknown course";

  // Avoid duplicate rows (some pages repeat the link).
  const key = rowState.subjectId || code;
  if (seen.has(key)) return;
  seen.add(key);

  out.push({
    code,
    name,
    currentMark,
    midterm,
    subjectId: rowState.subjectId,
    studentId: rowState.studentId,
  });
}

/** Pull a course code like "ENG4U-01" out of arbitrary row text. */
function extractCourseCode(text) {
  const m = text.match(COURSE_CODE_RE);
  return m ? m[1] : null;
}

/** Pull the "current mark = 95.5%" number out of row text, else null. */
function extractCurrentMark(text) {
  const m = text.match(/current mark\s*=\s*([\d.]+)\s*%/i);
  return m ? parseFloat(m[1]) : null;
}

/** Pull the "MIDTERM MARK: 85%" number out of row text, else null. This value
 *  lives on the course-list page (a red cell), not on the report page. */
function extractMidterm(text) {
  const m = text.match(/midterm\s*mark\s*:?\s*([\d.]+)\s*%/i);
  return m ? parseFloat(m[1]) : null;
}

// ============================================================================
// HTML PARSING — CATEGORY BREAKDOWN  (Step 5)
// ----------------------------------------------------------------------------
// TeachAssist's viewReport.php does not always list individual assignments (for
// this account the "Assignment" table is empty). The per-strand data lives in a
// summary table whose ROWS are background-coloured by strand:
//
//   <tr bgcolor="#ffffaa"><td>Knowledge/Understanding</td>
//       <td>20%</td>      <- Weighting
//       <td>14%</td>      <- Course Weighting
//       <td>0%</td></tr>  <- Student Achievement
//   ...
//   <tr bgcolor="#cccccc"><td colspan=2>Final/Culminating</td><td>30%</td><td>0%</td></tr>
//
// The SAME colours also appear on the "Analysis/Trends" rows, but those contain
// only plot images (no "%"), so we skip any coloured row without a percent.
//
// One entry is emitted per category: { name, category, percent, weight } where
// `weight` = the Weighting column and `percent` = the Student Achievement (the
// last percent in the row). The strand colour is read off the <tr> (not a <td>).
// ============================================================================

/**
 * @typedef {Object} Evaluation
 * @property {string} name      category label, e.g. "Knowledge/Understanding"
 * @property {string} category  strand label from the row's background colour
 * @property {number} percent   student achievement for the category
 * @property {number|null} weight  the category weighting, when present
 */

/**
 * @param {string} html  a viewReport.php page
 * @returns {Promise<Evaluation[]>}
 */
async function parseEvaluations(html) {
  /** @type {Evaluation[]} */
  const evaluations = [];
  let row = null; // { category, buf } for the currently-open <tr>

  const rewriter = new HTMLRewriter()
    .on("tr", {
      element(el) {
        // The strand is identified by the ROW's background colour.
        const colour = cellColour(el);
        const current = { category: colour ? STRAND_COLOURS[colour] : null, buf: "" };
        row = current;
        el.onEndTag(() => {
          flushCategoryRow(current, evaluations);
          if (row === current) row = null;
        });
      },
    })
    // Universal text capture routed into the open row.
    .on("*", {
      text(t) {
        if (row) row.buf += t.text;
      },
    });

  await rewriter.transform(new Response(html)).arrayBuffer();
  return evaluations;
}

/**
 * Read a cell's background colour from either the legacy `bgcolor` attribute or
 * an inline `style="background:#..."`. Returns a lowercase 6-hex string or null.
 */
function cellColour(el) {
  const bg = el.getAttribute("bgcolor");
  if (bg) return normaliseHex(bg);
  const style = el.getAttribute("style");
  if (style) {
    const m = style.match(/background(?:-color)?\s*:\s*#?([0-9a-fA-F]{6})/);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

/** "#FFFFAA" / "FFFFAA" -> "ffffaa"; returns null if not a 6-hex value. */
function normaliseHex(value) {
  const m = String(value).trim().replace(/^#/, "").match(/^[0-9a-fA-F]{6}$/);
  return m ? value.trim().replace(/^#/, "").toLowerCase() : null;
}

/**
 * Turn one strand-coloured summary row into a category Evaluation. Skips rows
 * that are not strand-coloured, and coloured rows with no percent (e.g. the
 * Analysis/Trends plot rows). `weight` = first percent (Weighting column);
 * `percent` = last percent (Student Achievement column).
 */
function flushCategoryRow(rowState, out) {
  if (!rowState.category) return;
  const text = collapseWhitespace(rowState.buf);
  const pcts = [...text.matchAll(/([\d.]+)\s*%/g)].map((m) => parseFloat(m[1]));
  if (!pcts.length) return; // coloured but no marks (e.g. the plot rows)
  const name = (text.split(/[\d.]+\s*%/)[0] || "").trim() || rowState.category;
  out.push({
    name,
    category: rowState.category,
    percent: pcts[pcts.length - 1],
    weight: pcts.length > 1 ? pcts[0] : null,
  });
}

// ============================================================================
// SHARED HELPERS
// ============================================================================

/**
 * Decode the handful of HTML entities TeachAssist actually emits. HTMLRewriter
 * hands text back RAW (un-decoded), so without this "&nbsp;" / "&amp;" leak
 * into course names. Numeric entities are handled for safety.
 */
function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#0*39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => codePoint(parseInt(d, 10)));
}

function codePoint(n) {
  try {
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
  } catch {
    return "";
  }
}

/** Decode entities, then collapse all whitespace (incl. NBSP) and trim. */
function collapseWhitespace(s) {
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}

/** Build the CORS headers (locked to the single dashboard origin). */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": DASHBOARD_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": `Content-Type, ${API_KEY_HEADER}`,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** JSON response helper that always carries the CORS headers. */
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

/** Plain-text response helper (used by the debug=courses/report modes). */
function text(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...corsHeaders() },
  });
}

/**
 * Return an error message that is safe to send to the client: never leak the
 * password even if it somehow appears in an error string.
 */
function safeMessage(err) {
  let msg = (err && err.message) || String(err) || "Unknown error";
  // Defensive: strip anything that looks like our form fields' values.
  msg = msg.replace(/password=[^&\s]*/gi, "password=***");
  return msg;
}

/** Constant-time string comparison for the API key check. */
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Named exports for local testing. Cloudflare Workers only invokes the
// `default` export, so exposing these helpers is harmless in production.
export {
  parseCourseList,
  parseEvaluations,
  extractCourseCode,
  extractCurrentMark,
};
