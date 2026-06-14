# Student Grade Dashboard (frontend)

A clean, mobile-first grade dashboard built as **plain static files** — no
framework, no build step. The student enters course and grade data manually.
It uses **Supabase** for auth + storage and deploys on **Cloudflare Pages**.

> This frontend contains **no scraping, external login, or password handling**.
> It only talks to Supabase using the public anon key (protected by RLS).

## Setup

1. **Create the database.** Open your Supabase project → SQL Editor, paste the
   contents of [`schema.sql`](./schema.sql), and run it. This creates the
   `profiles`, `courses`, `categories`, `evaluations` tables with Row Level
   Security so each user only sees their own data.

2. **Point the app at your project.** Edit [`js/config.js`](./js/config.js) and
   set `SUPABASE_URL` and `SUPABASE_ANON_KEY` to your project's values
   (Supabase → Project Settings → API). Use the **anon / publishable** key only
   — never a service-role key.

3. **(Optional) Email confirmation.** In Supabase → Authentication → Providers →
   Email, turn "Confirm email" on or off to taste. The login screen handles both.

## Run locally

ES modules require HTTP (not `file://`). Serve the folder with any static server:

```bash
# from this frontend/ directory
python3 -m http.server 8080
# then open http://localhost:8080/
```

## Deploy on Cloudflare Pages

In the Cloudflare Pages project settings:

- **Build command:** *(leave empty)*
- **Build output directory:** `frontend`

These are static files, so there is nothing to build.

## Structure

```
frontend/
  index.html        login / signup
  app.html          main shell (tab bar + screens) after login
  schema.sql        Supabase tables + RLS policies
  css/style.css     design system
  js/config.js      Supabase URL + anon key, colors, defaults
  js/supabase.js    Supabase client (from CDN)
  js/auth.js        login/signup + session gate
  js/courses.js     courses list, add/edit course, shared helpers + calculations
  js/course-detail.js  gauge / chart / info carousel, evaluations, breakdown
  js/links.js       Student Tools links (stored locally, editable)
  js/settings.js    email, term dates, theme placeholder, sign out
```

## How marks are calculated

- **Evaluation %** = `score_earned / score_total × 100`
- **Category average** = simple average of that category's evaluation percentages
- **Course current mark** = `Σ(category average × weight) / Σ(weights of categories
  that have at least one evaluation)` — empty categories are excluded
- **Overall average** = simple average of all course current marks
- Displayed percentages are rounded to one decimal place

Each new course is seeded with the Ontario achievement categories
(Knowledge/Understanding, Thinking, Communication, Application, Other) with
editable weights.
