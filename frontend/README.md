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
