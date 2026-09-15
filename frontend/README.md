# TeachAssist Dashboard (frontend)

A clean, mobile-first dashboard for **YRDSB TeachAssist** marks, built as
**plain static files** — no framework, no build step. Marks come from the
companion Cloudflare Worker (see [`../worker`](../worker)), which signs into
`ta.yrdsb.ca` and returns them as JSON.

## Two ways to use it

1. **Live** — sign in with your YRDSB student number + password. The
   credentials are POSTed only to *your own* Worker, which scrapes TeachAssist
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
- **Settings** — 9 colour themes (including two dark modes, all
  WCAG-AA-contrast checked), Worker connection settings, refresh, sign out.

## Run locally

ES modules require HTTP (not `file://`). Serve the folder with any static server:

```bash
# from this frontend/ directory
python3 -m http.server 8080
# then open http://localhost:8080/
```

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
  js/science-analytics.js  Science deep-dive page
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
- The Links tab is replaced by Dreams and Assistant; existing Guidance and Science views remain.
- Assistant arithmetic and explicit grade commands work locally. Examples: `sqrt(144) + 2^3`, `Current 85, target 90, remaining 30`, and `Current 88, score 95, remaining 20`.
- Natural-language questions require deploying the updated Worker with its `AI` binding. The model extracts inputs; shared code validates and calculates results. Missing inputs produce clarification. Only the question is sent to the model, never account credentials or the course snapshot. Demo mode does not call AI.
- This assistant handles arithmetic, target grades, projected grades, and weighted averages; it is not a general symbolic algebra tutor. Decimal arithmetic uses JavaScript numbers and displays up to 12 significant digits. Grade predictions assume supplied final-grade weights and a 100% maximum.

### Validation

Run `npm test` at the repository root for frontend, grade math, AI validation, and route authorization tests. Run `npm test` in `worker/` for the existing parser and cache suites.

### Release

Publish `frontend/` through the existing Cloudflare Pages configuration. Deploy the Worker separately from `worker/` using its existing deployment workflow; `[ai] binding = "AI"` is included in `wrangler.toml`. Workers AI usage is billed/limited under the Cloudflare account. Until that Worker is deployed, local calculations remain available and natural-language questions cannot use the new endpoint.
