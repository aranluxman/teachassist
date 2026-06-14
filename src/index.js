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
const DASHBOARD_ORIGIN = "https://your-dashboard.example.com";

// --- Optional shared-secret gate -------------------------------------------
// When true, every request must send the API_KEY secret in API_KEY_HEADER so
// that only you can call the endpoint. Set the secret with:
//   wrangler secret put API_KEY
const REQUIRE_API_KEY = true;
const API_KEY_HEADER = "x-api-key";

// --- TeachAssist endpoints --------------------------------------------------
// The base origin and the three URLs the login flow touches.
const TA_ORIGIN = "https://ta.yrdsb.ca";

// The form POST target. (Open the login page, submit the form, and read the
// request URL of the POST in the Network tab to confirm.)
const LOGIN_URL = `${TA_ORIGIN}/yrdsb/index.php`;

// The page that lists your courses after a successful login.
const COURSE_LIST_URL = `${TA_ORIGIN}/live/index.php`;

// The per-course report page. The Worker appends ?subject_id=..&student_id=..
// using the IDs scraped from the course-list links, so a relative href in the
// HTML does not matter — only this base path needs to be correct.
const REPORT_URL_BASE = `${TA_ORIGIN}/live/students/viewReport.php`;

// --- Login form field names -------------------------------------------------
// The EXACT form field names submitted by the login <form>. Read these from
// the "Form Data" / "Payload" section of the POST request in DevTools.
//   username / password : your credential fields
//   extra               : any constant hidden / submit fields the form sends
const LOGIN_FIELDS = {
  username: "username",
  password: "password",
  extra: {
    subject_id: "0", // TeachAssist sends subject_id=0 on the login POST
    submit: "Login", // the submit button's name=value pair
  },
};

// --- Session cookie ---------------------------------------------------------
// The cookie TeachAssist uses to carry the logged-in session. On a failed
// login TeachAssist typically (re)sets this to the literal value "deleted",
// which we treat as "not logged in".
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
  dedede: "Other",
  cccccc: "Final",
};

// Regex used to recognise a course code such as "ENG4U", "MHF4U-01",
// "SCH3U7". Adjust if your board uses a different code shape.
const COURSE_CODE_RE = /\b([A-Z]{2,5}\d[A-Z0-9]{1,3}(?:-\d{1,2})?)\b/;

// A normal-looking browser User-Agent. Some sites reject the default fetch UA.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Print non-sensitive structural diagnostics to `wrangler tail`. NEVER logs
// credentials, cookies or page contents.
const DEBUG = false;

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

    // Optional shared-secret gate so only you can call this.
    if (REQUIRE_API_KEY) {
      const provided = request.headers.get(API_KEY_HEADER);
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

    try {
      // 1 + 2: log in and capture the session cookie(s).
      const cookie = await login(env);

      // 3: fetch the course-list page with that cookie.
      const listHtml = await fetchWithSession(COURSE_LIST_URL, cookie, COURSE_LIST_URL);
      assertLoggedIn(listHtml);

      // 4: parse course code, name and current mark.
      const courses = await parseCourseList(listHtml);
      if (DEBUG) console.log(`Parsed ${courses.length} courses`);

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
              const reportHtml = await fetchWithSession(reportUrl, cookie, COURSE_LIST_URL);
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
 * Step 1 + 2: POST the login form (form-url-encoded) and capture the session
 * cookie(s). Returns a ready-to-send `Cookie:` header string.
 *
 * We use `redirect: "manual"` so the redirect that follows a successful login
 * does not strip the Set-Cookie header before we can read it.
 *
 * @param {{ TA_USERNAME: string, TA_PASSWORD: string }} env
 * @returns {Promise<string>} Cookie header value, e.g. "session_token=abc; student_id=123"
 */
async function login(env) {
  const body = new URLSearchParams();
  body.set(LOGIN_FIELDS.username, env.TA_USERNAME);
  body.set(LOGIN_FIELDS.password, env.TA_PASSWORD);
  for (const [k, v] of Object.entries(LOGIN_FIELDS.extra || {})) body.set(k, v);

  const res = await fetch(LOGIN_URL, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": BROWSER_UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      origin: TA_ORIGIN,
      referer: LOGIN_URL,
    },
    body: body.toString(),
  });

  const jar = extractCookies(res);
  const session = jar[SESSION_COOKIE_NAME];

  // A real session_token (not empty, not "deleted") is our success signal.
  if (!session) {
    // Secondary signal: TeachAssist redirects back to the login page with an
    // `error=` query param when credentials are wrong.
    const location = res.headers.get("location") || "";
    if (/error/i.test(location)) {
      throw new AuthError("Login failed: TeachAssist rejected the credentials.");
    }
    throw new AuthError(
      "Login failed: no valid session cookie returned. Check LOGIN_URL, " +
        "LOGIN_FIELDS and SESSION_COOKIE_NAME against your Network tab."
    );
  }

  if (DEBUG) console.log(`Login OK — cookies: ${Object.keys(jar).join(", ")}`);
  return cookieHeader(jar);
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

  // A row is only a course if it has a report link or a recognisable code.
  if (!rowState.subjectId && !code) return;

  // Build a friendly name: the row text minus the "current mark = ..%" phrase.
  let name = text.replace(/current mark\s*=\s*[\d.]+\s*%/i, "").trim();
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

// ============================================================================
// HTML PARSING — EVALUATION ROWS  (Step 5)
// ----------------------------------------------------------------------------
// The report page is a maze of nested <table>s where each assessment is a row
// and each strand (weight category) is a background-coloured <td> containing a
// small inner table like "17 / 20 = 85%" and "weight=10".
//
// We again use HTMLRewriter with state, made nesting-proof by:
//   * a STACK of open <tr> rows (so a nested inner-table <tr> can't clobber the
//     outer assessment row);
//   * an `activeCell` pointer set when we enter a strand-coloured <td> and
//     cleared on its end tag — so all inner text (even inside the nested table)
//     is attributed to that strand;
//   * the universal "*" text handler again, routed to either the active strand
//     cell or, when no strand cell is open, the current row's name buffer.
//
// One evaluation object is emitted per (assessment x strand-with-a-mark):
//   { name, weightCategory, percent, weight }
// ============================================================================

/**
 * @typedef {Object} Evaluation
 * @property {string} name           assessment name
 * @property {string} weightCategory strand label, e.g. "Application"
 * @property {number} percent        strand percent for this assessment
 * @property {number|null} weight    strand weight, when present
 */

/**
 * @param {string} html  a viewReport.php page
 * @returns {Promise<Evaluation[]>}
 */
async function parseEvaluations(html) {
  /** @type {Evaluation[]} */
  const evaluations = [];

  const rowStack = []; // [{ nameBuf, cells: [] }, ...]
  let activeCell = null; // { category, buf } while inside a strand <td>

  const rewriter = new HTMLRewriter()
    .on("tr", {
      element(el) {
        const current = { nameBuf: "", cells: [] };
        rowStack.push(current);
        el.onEndTag(() => {
          // Pop this row (it should be on top in well-formed HTML).
          const idx = rowStack.lastIndexOf(current);
          if (idx !== -1) rowStack.splice(idx, 1);
          flushEvaluationRow(current, evaluations);
        });
      },
    })
    .on("td", {
      element(el) {
        const colour = cellColour(el);
        const category = colour ? STRAND_COLOURS[colour] : null;
        if (!category) return; // not a strand cell (e.g. the name cell)
        const cell = { category, buf: "" };
        const owner = rowStack[rowStack.length - 1];
        if (owner) owner.cells.push(cell);
        activeCell = cell;
        el.onEndTag(() => {
          finalizeStrandCell(cell);
          if (activeCell === cell) activeCell = null;
        });
      },
    })
    .on("*", {
      text(t) {
        if (activeCell) {
          activeCell.buf += t.text;
        } else if (rowStack.length) {
          rowStack[rowStack.length - 1].nameBuf += t.text;
        }
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

/** Parse "17 / 20 = 85%" and "weight=10" out of a strand cell's text. */
function finalizeStrandCell(cell) {
  const pct = cell.buf.match(/=\s*([\d.]+)\s*%/);
  const weight = cell.buf.match(/weight\s*=\s*([\d.]+)/i);
  cell.percent = pct ? parseFloat(pct[1]) : null;
  cell.weight = weight ? parseFloat(weight[1]) : null;
}

/**
 * Emit one Evaluation per strand cell that actually carried a percent. Rows
 * with no name or no marked strands (headers, the summary table) drop out.
 */
function flushEvaluationRow(rowState, out) {
  const name = collapseWhitespace(rowState.nameBuf);
  if (!name) return;
  for (const cell of rowState.cells) {
    if (cell.percent == null) continue;
    out.push({
      name,
      weightCategory: cell.category,
      percent: cell.percent,
      weight: cell.weight ?? null,
    });
  }
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
