# TeachAssist Dashboard (frontend)

A clean, mobile-first dashboard for **YRDSB TeachAssist** marks, built as
**static frontend files with a bundled Pages sign-in service** — no framework
or deployment build command needed. The checked-in `_worker.js` signs into
`ta.yrdsb.ca` on the server and returns each student’s own marks as JSON. Its
source and rebuild command live in [`../worker`](../worker).

## Two ways to use it

1. **Live** — sign in with your YRDSB student number + password. The
   credentials are POSTed to the configured sign-in service, which scrapes TeachAssist
   and returns your courses and evaluations.
2. **Demo** — tap **Explore the demo** on the sign-in screen. A complete,
   bundled Grade 9 TeachAssist snapshot loads instantly: 8 courses with every
   assignment-level evaluation, weighted by Ontario's achievement categories
   (Knowledge/Understanding, Thinking, Communication, Application,
   Final/Culminating). No network or login needed.

## Screens

- **Courses** — overall-average gauge, per-course cards with progress bars,
  and a "Recent updates" feed of day-over-day mark changes.
- **Course detail** — semicircular mark gauge, grade-progression chart, course
  info, an **Evaluations** list (category pill, weight, date, teacher
  feedback), and a **Breakdown** tab with weighted per-category strand bars in
  TeachAssist's classic strand colours.
- **Guidance** — curated YRDSB / Ontario planning, academic, and support links.
- **Science** — a static analytics deep-dive for the Grade 9 Science course.
- **Links** — an editable, locally-stored list of student tools.
- **Settings** — 15 colour themes, notification preferences, advanced server settings, diagnostic reports, refresh, and sign out.
- **Profile** — editable name, school, photo and cover; customizable quick actions, volunteer log, exam calculator, and student ID reference.

## Run locally

ES modules require HTTP (not `file://`). For demo/UI work, serve the folder with any static server:

```bash
# from this frontend/ directory
python3 -m http.server 8080
# then open http://localhost:8080/
```

For local student sign-in, run `npx wrangler pages dev ../frontend` from `worker/`
instead of the static server. Live sign-in needs network access to TeachAssist;
regression tests simulate that upstream.

## Deploy on Cloudflare Pages

- **Build command:** *(leave empty)*
- **Build output directory:** `frontend`

## Structure

```
frontend/
  index.html          sign in (live) or enter demo mode
  app.html            main shell (tab bar + screens)
  css/style.css       design system: tokens, 9 themes, strand colours
  js/config.js        Worker URL, icon colours, default links
  js/ta-client.js     auth + live data + demo mode + local snapshots
  js/demo-data.js     bundled TeachAssist snapshot (8 courses, all evaluations)
  js/courses.js       course list, overall gauge, updates feed, shared helpers
  js/course-detail.js gauge/chart/info carousel, evaluations, strand breakdown
  js/guidance.js      YRDSB / Ontario guidance resources
  js/links.js         Student Tools links (stored locally, editable)
  js/settings.js      account, data refresh, themes, Worker connection
```

## Colour & contrast

Every theme's accent is chosen to keep at least **4.5:1** contrast when used
as text on cards, and the Ontario achievement-strand colours (yellow, green,
periwinkle, orange, grey — the same families TeachAssist uses on its report
pages) each ship in a text-safe shade plus a tint for pills and bars, in both
light and dark themes.


## Dashboard refresh (v4)

- Responsive course dashboard, book-and-spark SVG logo, gentle transitions, and 15 themes.
- Dreams: career, destination, motivation, average target, and individual course targets.
- Personalization: name, compact layout, larger text, reduced animation, opaque navigation, and visual grade concealment on the dashboard. Preferences stay in this browser and are scoped by student number (demo uses a separate profile).
- The Links tab is replaced by Dreams and Assistant; Guidance remains. Science is available through its regular course card; the separate Science page has been removed.
- Assistant arithmetic and explicit grade commands work locally. Examples: `sqrt(144) + 2^3`, `Current 85, target 90, remaining 30`, and `Current 88, score 95, remaining 20`.
- Natural-language questions require deploying the updated Worker with its `AI` binding. The model extracts inputs; shared code validates and calculates results. Missing inputs produce clarification. Only the question is sent to the model, never account credentials or the course snapshot. Demo mode does not call AI.
- This assistant handles arithmetic, target grades, projected grades, and weighted averages; it is not a general symbolic algebra tutor. Decimal arithmetic uses JavaScript numbers and displays up to 12 significant digits. Grade predictions assume supplied final-grade weights and a 100% maximum.

### Validation

Run `npm test` at the repository root for frontend, grade math, AI validation, and route authorization tests. Run `npm test` in `worker/` for the existing parser and cache suites.

### Release

Publish `frontend/` through the existing Cloudflare Pages configuration. The Pages backend now deploys with these files; see “Publishing the sign-in fix” below for optional AI bindings and rebuilding the bundle. Workers AI usage is billed/limited under the Cloudflare account.


### Phone layout

`css/mobile.css` loads after the shared design system. Below 768px, the dashboard uses a compact average and dream summary, full-width course cards with wrapping names, 44px or larger controls, and bottom navigation padded for the phone home indicator. Inputs use 16px text to avoid iOS focus zoom. Course overview panels have Grade / Trend / Info buttons as well as swipe navigation. Forms, evaluation rows, and sheets adapt to narrow screens; sheets use the dynamic viewport height for the onscreen keyboard.


## Student sign-in and tools (v4.1)

The home page asks only for a student number and password. Users do not need a
Worker URL or API key. The default service is this website’s own origin, configured in `js/config.js`.
Credentials remain in browser localStorage until sign-out (including for reload
and foreground refresh); students using a shared device should sign out.

Every live request posts the current student's credentials. The frontend no
longer reads the shared owner `/api/cached` endpoint. Student POSTs do not write
to the owner cache, and malformed requests never fall back to owner credentials.
The existing server-side `API_KEY` signs one-hour assistant capabilities; the
browser receives that limited token, never the API key. Owner GET/cache/debug
routes retain their existing administrative gate.

- Grade history records up to 60 snapshots per account and server on this device,
  including intraday changes. The chart follows currently displayed courses and
  honors Hide grades. Legacy unscoped snapshots are not imported because their
  account cannot be established.
- Profile, quick-action visibility, volunteer entries, appointments, and
  notification preferences are separate for each account and demo mode. They do
  not sync across devices. Uploaded profile/cover images accept PNG/JPEG/WebP up
  to 750 KB each. Student ID is a personal reference, not an official credential.
- Teacher search searches teacher names supplied with courses. The current live
  parser may not return teacher details; students can add/remove personal teacher
  contacts on this device. These are labeled as personal contacts, not an official
  staff directory. The bundled demo includes sample teachers.
- Volunteer hours are a personal log; school approval is separate. The exam
  calculator supports required exam marks and projected final grades.
- Guidance lets students record already-booked appointments. It does not make a
  booking with their school. Reminders trigger within 15 minutes before the saved
  appointment while the page is active.
- Mark checks run every five minutes while the page is visible. In-page alerts
  work without permission. Device notifications require browser permission and
  may require home-screen installation on phones. The service worker displays
  notifications only: it does not cache student information or perform closed-app
  background checks. Failed requests do not generate “no change” notifications.
- Advanced notifications include no-change alerts (dependent on mark alerts).
  Existing translucent-surface settings provide the website's glass option.
  Native Liquid Glass and secret experiment codes have no website backend and
  are not presented as functioning features.
- Advanced settings validate custom server URLs and offer Reset default. Only
  choose a trusted compatible server because it receives the login credentials.
  Diagnostic reports are previewed before downloading/sharing and exclude student
  numbers, grades, credentials, profile data, and server URLs.

### Publishing the sign-in fix

Deploy `frontend/` through the existing Cloudflare Pages Git integration. Pages
recognizes its bundled `_worker.js` automatically; `_routes.json` sends `/api/*`
requests to it and serves the rest as static assets. Frontend and sign-in backend
now deploy together. No separate Worker deployment, API key, KV binding, or owner
school credentials are needed for students to sign in.

The default API is the website's own origin, including on preview domains. Old
saved references to the standalone `teachassist-marks.aran-luxman.workers.dev`
service migrate once to that default. Other custom servers are preserved. A
failed sign-in offers **Reset sign-in connection** without exposing configuration
fields. Legacy API keys are removed from browser storage during migration.

The Pages backend exposes only student marks, the assistant, and a public
`GET /api/status` health check. Owner/cache/debug APIs are not accessible there.
AI questions require an `AI` binding and a server-only `API_KEY` on the Pages
project. Without those optional bindings, ordinary sign-in and local calculators
still work, and AI requests explain that setup is missing. The standalone Worker
remains available for the optional owner cron and custom installations.

After changing backend source, run `npm --prefix worker run build:pages` and
commit `frontend/_worker.js`. `npm --prefix worker test` checks the bundle matches
its source and exercises both production and preview sign-in with two simulated
students and no secrets. Root tests and browser checks cover connection migration,
invalid-password recovery, and account isolation. Real school login must still
be checked on the published site; no real school credentials are in these tests.
