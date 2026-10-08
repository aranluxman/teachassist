import { createTeachAssistSession, TeachAssistError, extractCookies } from "./teachassist-session.js";
import { issueSession, verifySession } from "./session.js";
import {interpretQuestion} from "./assistant.js";
/**
 * TeachAssist sign-in service. Student POSTs use only the submitted credentials
 * and return that student's marks without storing them in the owner cache.
 * Owner GET/debug/cache routes remain protected by API_KEY. The daily cron is
 * an optional owner-only feature using TA_USERNAME/TA_PASSWORD secrets.
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
// When true, owner GET/debug/cache requests must send API_KEY.
// Student POST sign-ins never require this administrative secret. Set the secret with:
//   wrangler secret put API_KEY
const REQUIRE_API_KEY = true;
const API_KEY_HEADER = "x-api-key";

// --- TeachAssist endpoints --------------------------------------------------
// The base origin and the URLs the login flow touches. Values below are
// verified against the live site's Network tab.
const TA_ORIGIN = "https://ta.yrdsb.ca";

// The login form POST target from the current TeachAssist login redirect.
const LOGIN_URL = `${TA_ORIGIN}/yrdsb/index.php`;

// The marks-list page base. The Worker appends ?student_id=NNNN using the
// student_id TeachAssist assigns at login (read from the login response), so it
// works for whichever account signs in — no hardcoded id.
const COURSE_LIST_URL = `${TA_ORIGIN}/live/students/listReports.php`;

// The per-course report page. The Worker appends ?subject_id=..&student_id=..
// using the subject_id scraped from each course link and your student_id, so a
// relative href in the HTML does not matter — only this base path matters.
const REPORT_URL_BASE = `${TA_ORIGIN}/live/students/viewReport.php`;

// --- Login form field names -------------------------------------------------
// The EXACT form field names submitted by the login <form>. `extra` holds the
// constant hidden/submit fields in the page.
const LOGIN_FIELDS = {
  username: "username",
  password: "password",
  extra: {
    subject_id: "0",
    submit: "Login",
  },
};

// --- Session cookie ---------------------------------------------------------
// The cookie TeachAssist sets to carry the logged-in session. The Worker
// captures it from the login response's Set-Cookie header and sends it on every
// subsequent request.
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

const { login, loginResponse, fetchWithSession, assertLoggedIn } = createTeachAssistSession({
  origin: TA_ORIGIN, loginUrl: LOGIN_URL, courseListUrl: COURSE_LIST_URL,
  fields: LOGIN_FIELDS, userAgent: BROWSER_UA,
});

export default {
  /**
   * @param {Request} request
   * @param {{ TA_USERNAME?: string, TA_PASSWORD?: string, API_KEY?: string, MARKS?: KVNamespace }} env
   * @param {{ waitUntil?: (p: Promise<any>) => void }} [ctx]
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight — answer before any auth so the browser can proceed.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/api/assistant") {
      if (request.method !== "POST") return json({error:"Use POST."},405);
      const provided = request.headers.get(API_KEY_HEADER);
      if (!(env.API_KEY && provided && timingSafeEqual(provided, env.API_KEY)) &&
          !await verifySession(request.headers.get("Authorization")?.replace(/^Bearer /, ""), env.API_KEY))
        return json({error:"Your session expired. Refresh your courses, then try again."},401);
      const origin = request.headers.get("Origin");
      if (origin && origin !== DASHBOARD_ORIGIN) return json({error:"Origin not allowed."},403);
      const result = await interpretQuestion(request, env);
      return json(result.body,result.status,{"Cache-Control":"no-store"});
    }
    // Friendly root + path-normalization helpers.
    if (request.method === "GET" && url.pathname === "/") {
      return json({
        ok: true,
        service: "TeachAssist marks Worker",
        endpoint: `${url.origin}/api/marks`,
        hint: "Sign in from the dashboard; it POSTs your credentials here.",
      });
    }
    if (request.method === "GET" && /^\/api\/marks\/+$/i.test(url.pathname)) {
      return Response.redirect(`${url.origin}/api/marks${url.search}`, 308);
    }
    if (request.method === "GET" && /^\/api\/marks\/api\/marks\/?$/i.test(url.pathname)) {
      return json(
        {
          error: "The endpoint was added twice.",
          hint: "Use your Worker base URL; the app appends the /api/marks endpoint itself.",
        },
        400
      );
    }

    // Cached marks: the snapshot written by the daily Cron Trigger (and by every
    // live scrape). Lets the dashboard render instantly without a fresh, flaky
    // TeachAssist login. Shape: { scrapedAt, courses: [...] }.
    if (request.method === "GET" && url.pathname === "/api/cached") {
      if (REQUIRE_API_KEY) {
        const provided = request.headers.get(API_KEY_HEADER) || url.searchParams.get("key");
        if (!env.API_KEY || !provided || !timingSafeEqual(provided, env.API_KEY)) {
          return json({ error: "Unauthorized" }, 401);
        }
      }
      if (!env.MARKS) return json({ error: "Cache is not configured (no KV binding)." }, 503);
      const raw = await env.MARKS.get("latest");
      if (!raw) {
        return json(
          { error: "No cached marks yet.", hint: "Sign in once, or wait for the daily sync." },
          404
        );
      }
      return new Response(raw, {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders() },
      });
    }

    // Route: GET (uses Worker secrets) or POST (browser sign-in with creds).
    if (url.pathname !== "/api/marks" || (request.method !== "GET" && request.method !== "POST")) {
      return json({ error: "Not found", hint: "Use GET or POST /api/marks" }, 404);
    }

    // Owner-only GET/debug routes keep the API-key gate. Student POSTs authenticate
    // exclusively with the credentials in that request.
    const publicSignIn = request.method === "POST" && !url.searchParams.has("debug");
    const origin = request.headers.get("Origin");
    if (origin && origin !== DASHBOARD_ORIGIN) return json({ error: "Origin not allowed." }, 403);
    if (!publicSignIn && REQUIRE_API_KEY) {
      const provided = request.headers.get(API_KEY_HEADER) || url.searchParams.get("key");
      if (!env.API_KEY || !provided || !timingSafeEqual(provided, env.API_KEY)) {
        return json({ error: "Unauthorized" }, 401);
      }
    }

    // A missing or malformed POST must NEVER fall back to the owner's secrets.
    let creds = null;
    if (request.method === "POST") {
      try {
        const reader = request.body?.getReader();
        if (!reader) throw new Error();
        let size = 0, chunks = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 8192) { await reader.cancel(); return json({ error: "Sign-in request is too large." }, 413); }
          chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        const b = JSON.parse(new TextDecoder().decode(bytes));
        if (typeof b?.username !== "string" || !/^\d{1,20}$/.test(b.username.trim()) ||
            typeof b.password !== "string" || !b.password || b.password.length > 1024) throw new Error();
        creds = { username: b.username.trim(), password: b.password };
      } catch {
        return json({ error: "Enter your student number and password." }, 400);
      }
    } else if (!env.TA_USERNAME || !env.TA_PASSWORD) {
      return json({ error: "Owner credentials are not configured." }, 400);
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
        const res = await loginResponse(env, creds);
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

      // Debug helpers that need the intermediate HTML (all behind the API-key
      // gate; none ever expose the password or the session cookie value).
      if (debug === "courses" || debug === "report") {
        const session = await login(env, creds);
        const listUrl = `${COURSE_LIST_URL}?student_id=${encodeURIComponent(session.studentId)}`;
        const listHtml = session.listHtml ?? await fetchWithSession(listUrl, session, LOGIN_URL);

        // debug=courses returns the raw page so you can verify the HTML structure.
        if (debug === "courses") return text(listHtml);

        // debug=report returns one raw report page. Use &code=SNC (matched
        // against your course codes) or &subject_id=NNN. Open it with &key=.
        assertLoggedIn(listHtml);
        const courses = await parseCourseList(listHtml);
        for (const c of courses) c.studentId = c.studentId || session.studentId;

        let sid = url.searchParams.get("subject_id");
        const code = url.searchParams.get("code");
        if (!sid && code) {
          const match = courses.find(
            (c) => c.subjectId && (c.code || "").toUpperCase().includes(code.toUpperCase())
          );
          if (match) sid = match.subjectId;
        }
        if (!sid) {
          return json(
            {
              error: "Add &code=SNC (or your course code) or &subject_id=NNN.",
              courses: courses.map((c) => ({ code: c.code, subjectId: c.subjectId })),
            },
            400
          );
        }
        const html = await fetchWithSession(
          `${REPORT_URL_BASE}?subject_id=${encodeURIComponent(sid)}&student_id=${encodeURIComponent(session.studentId)}`,
          session,
          listUrl
        );
        return text(html);
      }

      // Scrape only the selected account and return its marks.
      const out = await scrapeMarks(env, creds);
      // Only the owner GET/cron writes the shared owner cache. Student responses
      // are returned directly and are never stored in that cache.
      if (request.method === "GET") storeMarks(env, ctx, out);
      const session = publicSignIn ? await issueSession(env.API_KEY) : "";
      return json(out, 200, session ? { "X-TeachAssist-Session": session } : {});
    } catch (err) {
      if (err instanceof TeachAssistError) {
        return json({ error: err.message, code: err.code }, err.status);
      }
      return json({ error: "TeachAssist could not load your marks. Please try again.", code: "TA_REQUEST_FAILED" }, 502);
    }
  },

  /**
   * Cron Trigger (see [triggers] crons in wrangler.toml). Runs on a schedule,
   * logs into TeachAssist with the Worker secrets, scrapes the marks, and caches
   * them in KV so the dashboard loads instantly and stays current even when
   * nobody opens it. No request/response — failures are logged, not thrown.
   *
   * @param {ScheduledController} event
   * @param {{ TA_USERNAME?: string, TA_PASSWORD?: string, MARKS?: KVNamespace }} env
   * @param {{ waitUntil: (p: Promise<any>) => void }} ctx
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailySync(env));
  },
};

// ============================================================================
// SCRAPE + CACHE
// ----------------------------------------------------------------------------
// The full login -> list -> per-report pipeline, factored out so BOTH the live
// request handler and the daily Cron Trigger run exactly the same scrape. The
// result is the documented course shape: { code, name, currentMark, midterm,
// evaluations }.
// ============================================================================

/**
 * Log in (with request creds or the Worker secrets), fetch the marks list and
 * each course's report, and return the assembled course array.
 *
 * @param {{ TA_USERNAME?: string, TA_PASSWORD?: string }} env
 * @param {{ username: string, password: string }|null} creds
 */
async function scrapeMarks(env, creds) {
  // 1 + 2: log in; capture the session cookie + student_id.
  const session = await login(env, creds);

  // 3: fetch the marks-list page with that cookie (student_id from login).
  const listUrl = `${COURSE_LIST_URL}?student_id=${encodeURIComponent(session.studentId)}`;
  const listHtml = session.listHtml ?? await fetchWithSession(listUrl, session, LOGIN_URL);
  assertLoggedIn(listHtml);

  // 4: parse course code, name and current mark.
  const courses = await parseCourseList(listHtml);
  // Fill in the student_id from the login redirect when a link omits it.
  for (const c of courses) c.studentId = c.studentId || session.studentId;
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
          const reportHtml = await fetchWithSession(reportUrl, session, COURSE_LIST_URL);
          c.evaluations = await parseEvaluations(reportHtml);
          // The report carries the calculated "Course" mark even when the list
          // page only says "please see teacher". Use it as currentMark.
          const cm = parseReportCourseMark(reportHtml);
          if (cm != null && c.currentMark == null) c.currentMark = cm;
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

  // 6: project to the documented shape only.
  return courses.map((c) => ({
    code: c.code,
    name: c.name,
    currentMark: c.currentMark,
    midterm: c.midterm ?? null,
    evaluations: c.evaluations,
    ...(c.reportError ? { reportError: c.reportError } : {}),
  }));
}

/**
 * Best-effort cache of a fresh scrape to KV: a `latest` snapshot the dashboard
 * reads on load, plus a compact per-day `snapshot:YYYY-MM-DD` history row. Never
 * throws — a cache miss must not break the live response. Pass `ctx` to defer
 * the writes past the response (waitUntil); pass null to await them (Cron).
 *
 * @param {{ MARKS?: KVNamespace }} env
 * @param {{ waitUntil?: (p: Promise<any>) => void }|null} ctx
 * @param {Array} out  the course array from scrapeMarks()
 */
function storeMarks(env, ctx, out) {
  if (!env || !env.MARKS || !Array.isArray(out)) return;
  const scrapedAt = new Date().toISOString();
  const day = scrapedAt.slice(0, 10);
  const writes = Promise.all([
    env.MARKS.put("latest", JSON.stringify({ scrapedAt, courses: out })),
    env.MARKS.put(
      `snapshot:${day}`,
      JSON.stringify({ date: scrapedAt, overall: overallOf(out), marks: marksOf(out) }),
      { expirationTtl: 60 * 60 * 24 * 400 } // keep ~13 months of daily history
    ),
  ]).catch((e) => {
    if (DEBUG) console.log("KV write failed:", safeMessage(e));
  });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(writes);
  return writes;
}

/**
 * Cron entrypoint: scrape with the Worker secrets and cache the result. Logs
 * outcomes (never credentials) and swallows errors so a flaky night doesn't
 * surface as an unhandled rejection.
 */
async function runDailySync(env) {
  if (!env || !env.MARKS) {
    if (DEBUG) console.log("Daily sync skipped: no KV (MARKS) binding.");
    return;
  }
  if (!env.TA_USERNAME || !env.TA_PASSWORD) {
    console.log("Daily sync skipped: TA_USERNAME / TA_PASSWORD secrets are not set.");
    return;
  }
  try {
    const out = await scrapeMarks(env, null); // null creds -> use the secrets
    await storeMarks(env, null, out);
    console.log(`Daily sync OK: cached ${out.length} courses.`);
  } catch (err) {
    console.log("Daily sync failed:", safeMessage(err));
  }
}

/** The mark to record for a course: live current mark, else midterm, else null. */
function displayMarkOf(c) {
  if (c && typeof c.currentMark === "number") return c.currentMark;
  if (c && typeof c.midterm === "number") return c.midterm;
  return null;
}

/** Simple average of every course's display mark, rounded to 0.1 (or null). */
function overallOf(courses) {
  const m = (courses || []).map(displayMarkOf).filter((x) => x != null);
  return m.length ? Math.round((m.reduce((a, b) => a + b, 0) / m.length) * 10) / 10 : null;
}

/** { code: mark } map for the compact daily snapshot. */
function marksOf(courses) {
  return Object.fromEntries((courses || []).map((c) => [c.code, displayMarkOf(c)]));
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

/**
 * Pull the calculated "Course" mark out of a viewReport.php page. The report
 * shows it as a big number in the cell immediately before a "Course" label:
 *   <td ...><div ...> 93.4%</div></td><td><div ...>Course</div></td>
 * Returns the percent (number) or null.
 */
function parseReportCourseMark(html) {
  const m = html.match(
    /([\d.]+)\s*%\s*<\/div>\s*<\/td>\s*<td>\s*<div[^>]*>\s*Course\s*<\/div>/i
  );
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": `Content-Type, Authorization, ${API_KEY_HEADER}`,
    "Access-Control-Expose-Headers": "X-TeachAssist-Session",
    "Cache-Control": "no-store",
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
  storeMarks,
  overallOf,
  marksOf,
};
