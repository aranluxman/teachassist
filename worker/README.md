# TeachAssist sign-in service (Cloudflare Worker)

Students POST their own YRDSB student number and password to `/api/marks`.
They do not need a shared API key. The Worker signs into TeachAssist for that
request and returns only that student's marks; it does not store the submitted
credentials or write their results into the shared owner cache.

The owner-only `GET /api/marks`, debug routes, and `GET /api/cached` retain their
API-key gate. The optional owner cron still uses `TA_USERNAME` / `TA_PASSWORD`.
A missing or invalid POST body is rejected, never replaced with owner secrets.
All responses use `Cache-Control: no-store`. Browser requests are restricted to
`DASHBOARD_ORIGIN`, currently `https://teachassist.pages.dev`.

Successful student sign-ins return an `X-TeachAssist-Session` header containing
a one-hour capability for `/api/assistant`. It is signed using the existing
server-side `API_KEY` secret, includes no student identity or credentials, and is
sent by the frontend as a Bearer token. The API key is never sent to students.
Without that secret, marks sign-in still works but the AI assistant is unavailable.

The main website now bundles this implementation into `frontend/_worker.js` so
student sign-in deploys with Cloudflare Pages. It does not need a separate Worker
deployment or any API key for sign-in. `src/pages.js` permits same-origin student
routes only and never passes owner credentials or the owner cache into the handler.
It also works on Pages preview domains.

Rebuild after backend edits with `npm run build:pages`, then commit the generated
file. `npm test` checks that bundle and exercises the Pages service without any
secrets. Optional Pages AI questions require an `AI` binding and a server-side
`API_KEY`; ordinary sign-in and local calculators need neither.

Student login first uses the original direct TeachAssist form POST. If that
cannot complete a session, the server loads the login page, carries its cookies
and hidden fields into a second POST, and follows same-origin redirects. It
returns named error codes for missing/expired sessions, upstream blocks, and
other connection failures. Only an explicit TeachAssist rejection returns a
login-rejected response; the UI displays the safe support code without showing
credentials or cookies.

The standalone Worker deployment remains optional for the owner cron, existing
private integrations, or an explicitly chosen custom server. Its setup and debugging
instructions below apply only to administrators. The browser no longer contacts
that service by default.

## Student endpoint

```http
POST /api/marks
Content-Type: application/json

{"username":"YOUR_STUDENT_NUMBER","password":"YOUR_PASSWORD"}
```

Returns an array of courses:

```json
[
  {
    "code": "ENG4U-01",
    "name": "ENG4U-01 Block: P1 - rm. 213",
    "currentMark": 95.5,
    "evaluations": [
      { "name": "Unit 1 Test", "category": "Knowledge/Understanding", "percent": 88, "weight": 10 },
      { "name": "Unit 1 Test", "category": "Application",            "percent": 91, "weight": 10 }
    ]
  }
]
```

- `currentMark` is a number (or `null` if TeachAssist isn't showing one yet).
- `evaluations` is `[]` when a course has no open report. One entry is emitted
  per assessment × strand (`category`) that has a mark. `weight` is a bonus
  field included when TeachAssist shows it.

### Login flow (confirmed from a real HAR capture)

1. `POST https://ta.yrdsb.ca/yrdsb/index.php` (form-url-encoded) with
   `subject_id=0`, `username`, `password`, `submit=Login`.
2. TeachAssist replies **302** with a `Set-Cookie: session_token=...` and a
   `Location: …/live/students/listReports.php?student_id=NNNN`. The Worker reads
   the cookie and the `student_id` off that 302 (it uses `redirect: "manual"` so
   neither is lost) — `student_id` is **never hardcoded**.
3. It then `GET`s the marks-list page with the cookie and parses it; for each
   course it follows the `viewReport.php` link and parses the evaluations.

### Debug endpoints (behind the API key; never expose your password/cookie)

```bash
# Why did login fail? status + redirect Location + which cookies came back:
curl -H "x-api-key: KEY" ".../api/marks?debug=login"
# Raw HTML of the marks-list page (to adjust selectors):
curl -H "x-api-key: KEY" ".../api/marks?debug=courses"
# Raw HTML of one report page:
curl -H "x-api-key: KEY" ".../api/marks?debug=report&subject_id=NNN"
```

---

## One-time setup

You need Node.js and a Cloudflare account. Install dependencies and log in:

```bash
npm install
npx wrangler login
```

### Set the secrets (never in code)

```bash
npx wrangler secret put TA_USERNAME   # paste your student number, press Enter
npx wrangler secret put TA_PASSWORD   # paste your password, press Enter
```

If you keep the optional API-key gate on (`REQUIRE_API_KEY = true`, the default):

```bash
npx wrangler secret put API_KEY       # paste a long random string
```

> These prompt for the value and store it encrypted in Cloudflare. They are
> **not** written to any file in this repo.

---

## Run locally

For local dev, Wrangler reads secrets from a gitignored `.dev.vars` file:

```bash
cp .dev.vars.example .dev.vars
# edit .dev.vars and fill in your real values
npx wrangler dev
```

Then call it (include the API-key header if the gate is on):

```bash
curl -H "x-api-key: YOUR_API_KEY" http://localhost:8787/api/marks
```

`.dev.vars` is gitignored — don't commit it.

---

## Deploy

```bash
npx wrangler deploy
```

Wrangler prints your Worker URL (e.g. `https://teachassist-marks.<you>.workers.dev`).
Call it the same way:

```bash
curl -H "x-api-key: YOUR_API_KEY" https://teachassist-marks.<you>.workers.dev/api/marks
```

Watch live logs while you tune selectors:

```bash
npx wrangler tail
```

---

## Configure the dashboard origin (CORS)

CORS is **locked to a single origin**. Open `src/index.js` and set the constant
at the top:

```js
const DASHBOARD_ORIGIN = "https://your-dashboard.example.com";
```

Only that origin can call the Worker from a browser. (`curl` ignores CORS, so it
works regardless — CORS only restricts browsers.)

---

## ⚠️ Verify the TeachAssist constants against your own browser

TeachAssist is **unofficial and undocumented**, so the exact URLs, form field
names and cookie name can differ or change. If `/api/marks` returns a login
error or empty data, **do this**:

1. Open `https://ta.yrdsb.ca` in your browser.
2. Open **DevTools → Network** tab (and tick **Preserve log**).
3. Log in normally.
4. Inspect the **login POST** request and copy the real values into the CONFIG
   block at the top of `src/index.js`:
   - `LOGIN_URL` — the POST request's URL.
   - `LOGIN_FIELDS` — the exact field names under **Payload / Form Data**
     (`username`, `password`, and any hidden/submit fields like `subject_id`,
     `submit`).
   - `SESSION_COOKIE_NAME` — the session cookie set on login (Application →
     Cookies, or the `Set-Cookie` response header). Defaults to
     `session_token`.
5. Click into your courses and copy:
   - `COURSE_LIST_URL` — the page that lists your courses.
   - `REPORT_URL_BASE` — the per-course report page path
     (`.../viewReport.php`).

Everything adjustable lives in the clearly-labelled **CONFIG** block at the top
of `src/index.js`. The HTML parsing lives in small, commented functions
(`parseCourseList` for the course list, `parseEvaluations` for the report rows)
so you can fix selectors there if the page structure changes — including the
strand → label colour map (`STRAND_COLOURS`) and the course-code regex
(`COURSE_CODE_RE`).

---

## How it works

1. **POST** the login form (form-url-encoded) to `LOGIN_URL` with the secrets.
2. **Capture** the session cookie from the response (`redirect: "manual"` so the
   `Set-Cookie` isn't lost to a redirect).
3. **GET** `COURSE_LIST_URL` with that cookie.
4. **Parse** course code, name and current mark with `HTMLRewriter`.
5. For each course, optionally **GET** its `viewReport.php` page and parse the
   evaluation rows.
6. **Return** the assembled JSON (CORS-locked to your dashboard origin).

## Tests

The HTML parsing is the part most likely to need tuning, so it has a test that
runs the **real** `HTMLRewriter` (via Miniflare/workerd) against sample
TeachAssist-shaped HTML — including nested report tables, a course with no mark,
and "no mark" strands:

```bash
npm test
```

If you paste a snippet of your own page HTML into `test/run.mjs`, you can confirm
your selector/constant tweaks before deploying.

## Security notes

- Credentials are read only from `env.TA_USERNAME` / `env.TA_PASSWORD` (Worker
  secrets). The password is never logged and never returned; error messages are
  scrubbed before they leave the Worker.
- Optional `API_KEY` shared-secret header (constant-time compared) so only you
  can call the endpoint.
- CORS is restricted to the single `DASHBOARD_ORIGIN`.
- Set `DEBUG = true` in `src/index.js` for structural logs in `wrangler tail`
  (counts only — never credentials, cookies or page contents).

## Files

| File              | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `src/index.js`    | The whole Worker: login, fetch, parse, JSON, CORS. |
| `wrangler.toml`   | Deployment config (no secrets).                    |
| `.dev.vars.example` | Template for local secrets (copy to `.dev.vars`). |
| `package.json`    | `dev` / `deploy` / `tail` / `test` scripts.        |
| `test/`           | Miniflare-based parser tests (sample HTML).        |
