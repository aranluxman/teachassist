import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { DEMO_COURSES } from "../frontend/js/demo-data.js";
import { strandKey, strandBreakdown } from "../frontend/js/course-detail.js";
import { courseLabel, courseSubtitle } from "../frontend/js/courses.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Each page as shipped: its HTML plus the boot module it loads (no inline scripts).
const appHtml = read("frontend/app.html") + read("frontend/js/app-main.js");
const indexHtml = read("frontend/index.html") + read("frontend/js/sign-in.js");
const css = read("frontend/css/style.css");
const coursesJs = read("frontend/js/courses.js");
const courseDetailJs = read("frontend/js/course-detail.js");
const guidanceJs = read("frontend/js/guidance.js");
const linksJs = read("frontend/js/links.js");
const settingsJs = read("frontend/js/settings.js");
const taClientJs = read("frontend/js/ta-client.js");
const manifest = JSON.parse(read("frontend/manifest.webmanifest"));

// ---------------------------------------------------------------------------
// App shell + PWA metadata
// ---------------------------------------------------------------------------

test("app exposes PWA metadata and mobile app chrome", () => {
  assert.match(appHtml, /rel="manifest"/);
  assert.match(appHtml, /rel="icon"/);
  assert.match(indexHtml, /rel="manifest"/);
  assert.equal(existsSync(new URL("../frontend/manifest.webmanifest", import.meta.url)), true);
  assert.equal(manifest.short_name, "TeachAssist");
  assert.match(manifest.description, /TeachAssist/);
});

test("app shell includes courses, guidance, dreams, and settings tabs (no AI assistant)", () => {
  for (const tab of ["courses", "guidance", "dreams", "settings"]) {
    assert.match(appHtml, new RegExp(`data-tab="${tab}"`));
  }
  assert.doesNotMatch(appHtml, /screen-science|data-tab="science"|renderScienceAnalytics|toScience/);
  assert.doesNotMatch(appHtml, /data-tab="assistant"|screen-assistant|renderAssistant/);
  assert.match(appHtml, /renderGuidance/);
  assert.match(appHtml, /applyStoredTheme/);
});

// ---------------------------------------------------------------------------
// Sign-in: live Worker flow + bundled demo mode
// ---------------------------------------------------------------------------

test("sign-in uses the live TeachAssist worker flow", () => {
  assert.match(indexHtml, /Student number/);
  assert.doesNotMatch(indexHtml, /Worker URL|API key|worker-url|api-key/);
  assert.match(indexHtml, /login/);
  assert.match(taClientJs, /POST/);
  assert.match(taClientJs, /\/api\/marks/);
  assert.match(taClientJs, /requireLogin/);
});

test("sign-in offers the bundled demo snapshot", () => {
  assert.match(indexHtml, /id="demo-btn"/);
  assert.match(indexHtml, /enterDemo/);
  assert.match(taClientJs, /export function enterDemo/);
  assert.match(taClientJs, /export function isDemo/);
  assert.match(taClientJs, /DEMO_COURSES/);
});

// ---------------------------------------------------------------------------
// Bundled TeachAssist dataset (demo mode)
// ---------------------------------------------------------------------------

const STRANDS = new Set([
  "Knowledge/Understanding",
  "Thinking",
  "Communication",
  "Application",
  "Final/Culminating",
]);

test("demo dataset is a complete TeachAssist snapshot", () => {
  assert.equal(DEMO_COURSES.length, 8, "a full Grade 9 timetable (8 courses)");
  for (const course of DEMO_COURSES) {
    assert.match(course.code, /^[A-Z]{3}\d[A-Z]\w*-\d{2}$/, `${course.code} looks like a YRDSB code`);
    assert.ok(course.name, `${course.code} has a name`);
    assert.ok(course.teacher, `${course.code} has a teacher`);
    assert.equal(typeof course.currentMark, "number");
    assert.equal(typeof course.midterm, "number");
    assert.ok(course.currentMark >= 0 && course.currentMark <= 100);
    assert.ok(course.evaluations.length >= 6, `${course.code} has assignment-level evaluations`);
    for (const ev of course.evaluations) {
      assert.ok(ev.name, `${course.code} evaluation has a name`);
      assert.ok(STRANDS.has(ev.category), `${course.code} "${ev.name}" uses an Ontario achievement category`);
      assert.equal(typeof ev.percent, "number");
      assert.ok(ev.percent >= 0 && ev.percent <= 100);
      assert.ok(ev.weight > 0, `${course.code} "${ev.name}" is weighted`);
      assert.match(ev.date, /^\d{4}-\d{2}-\d{2}$/);
    }
    // Every course carries a culminating/final block, like real TeachAssist.
    assert.ok(
      course.evaluations.some((e) => e.category === "Final/Culminating"),
      `${course.code} includes final/culminating evaluations`
    );
  }
});

test("demo marks are consistent with their weighted evaluations", () => {
  for (const course of DEMO_COURSES) {
    const sumW = course.evaluations.reduce((a, e) => a + e.weight, 0);
    const weighted = course.evaluations.reduce((a, e) => a + e.percent * e.weight, 0) / sumW;
    assert.ok(
      Math.abs(weighted - course.currentMark) < 2.5,
      `${course.code}: weighted ${weighted.toFixed(1)} vs currentMark ${course.currentMark}`
    );
  }
});

// ---------------------------------------------------------------------------
// Course detail: strand mapping + breakdown math
// ---------------------------------------------------------------------------

test("achievement categories map to their strand keys", () => {
  assert.equal(strandKey("Knowledge/Understanding"), "k");
  assert.equal(strandKey("Thinking"), "t");
  assert.equal(strandKey("Communication"), "c");
  assert.equal(strandKey("Application"), "a");
  assert.equal(strandKey("Final/Culminating"), "f");
  assert.equal(strandKey("Other"), "f");
  assert.equal(strandKey(""), "");
});

test("strand breakdown aggregates weighted averages per category", () => {
  const rows = strandBreakdown([
    { category: "Knowledge/Understanding", percent: 80, weight: 10 },
    { category: "Knowledge/Understanding", percent: 90, weight: 30 },
    { category: "Thinking", percent: 70, weight: 10 },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].key, "k");
  assert.equal(rows[0].average, 87.5); // (80*10 + 90*30) / 40
  assert.equal(rows[0].count, 2);
  assert.equal(rows[1].key, "t");
  assert.equal(rows[1].average, 70);
});

test("strand breakdown reads each evaluation's strands", () => {
  // K/T/C/A course: one row per strand across all assignments.
  const ktca = strandBreakdown([
    { name: "Drawing", percent: 95, weight: 4, strands: [
      { category: "Knowledge/Understanding", percent: 95, weight: 1 },
      { category: "Thinking", percent: 90, weight: 1 },
    ] },
    { name: "Keychain", percent: 100, weight: 2, strands: [
      { category: "Knowledge/Understanding", percent: 100, weight: 1 },
    ] },
  ]);
  assert.deepEqual(ktca.map((r) => [r.key, r.average]), [["k", 97.5], ["t", 90]]);

  // Overall Expectation course: rows per expectation; weight-0 formative work
  // doesn't pull the weighted average.
  const oe = strandBreakdown([
    { name: "Quest", percent: 100, weight: 4, strands: [
      { category: "C3", percent: 100, weight: 2 },
      { category: "C2", percent: 100, weight: 2 },
    ] },
    { name: "Formative", percent: 50, weight: 0, strands: [{ category: "C3", percent: 50, weight: 0 }] },
  ]);
  assert.deepEqual(oe.map((r) => [r.name, r.average, r.count]), [["C2", 100, 1], ["C3", 100, 2]]);
});

test("app is installable: manifest, service worker with offline shell, install UI", async () => {
  const sw = readFileSync(new URL("../frontend/notifications-sw.js", import.meta.url), "utf8");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));
  assert.match(sw, /addEventListener\('fetch'/);
  assert.match(sw, /PRECACHE[\s\S]*'app\.html'/);
  assert.match(sw, /startsWith\('\/api\/'\)/); // marks are never cached
  for (const html of [appHtml, indexHtml]) {
    assert.match(html, /rel="manifest"/);
    assert.match(html, /registerServiceWorker\(\)/);
  }
  assert.match(indexHtml, /install-btn/);
  const { parseRoute } = await import("../frontend/js/router.js");
  assert.deepEqual(parseRoute("#assistant"), { screen: "courses", arg: "" });
});

test("courses and detail screens render live marks analytics", () => {
  assert.match(coursesJs, /getCourses/);
  assert.match(coursesJs, /Overall Average/);
  assert.match(coursesJs, /Recent updates/);
  assert.match(courseDetailJs, /Grade Progression/);
  assert.match(courseDetailJs, /trendChartEl\(/);
  assert.match(courseDetailJs, /strandBadge\(/);
  assert.match(courseDetailJs, /openEvaluation\(/);
  assert.match(courseDetailJs, /strandBreakdown/);
});

test("course cards show the course name and a clean class code", () => {
  // "SNC2D1-8" is the timetable code; the card shows the class itself.
  assert.equal(courseLabel({ code: "SNC2D1-8" }), "SNC2D1");
  assert.equal(courseLabel({ code: "FIF2DF-3" }), "FIF2DF");
  assert.equal(courseLabel({ code: "SCH3U7" }), "SCH3U7");
  assert.equal(courseLabel({ code: "", name: "MPM1D-04 : Block: P3" }), "MPM1D");
  assert.equal(courseLabel({}), "");
  // A scraped timetable line is noise, a real course name is not.
  assert.equal(
    courseSubtitle({ code: "SNC2D1-8", name: "SNC2D1-8 : Science Block: P1 - rm. 302 2026-09-08" }),
    "",
  );
  assert.equal(
    courseSubtitle({ code: "ENL1W-01", name: "English, Grade 9 (De-streamed)" }),
    "English, Grade 9 (De-streamed)",
  );
  // No teacher / block / room row is rendered on the dashboard cards.
  assert.doesNotMatch(coursesJs, /cc-name|cc-meta/);
  assert.doesNotMatch(coursesJs, /c\.block|c\.room/);
  assert.match(coursesJs, /<b>\$\{escapeHtml\(title\)\}<\/b>/);
  assert.match(coursesJs, /\[label, teacher(, [^\]]*)?\]/);
});

// ---------------------------------------------------------------------------
// Utility tabs
// ---------------------------------------------------------------------------

test("student utility tabs remain production-ready", () => {
  assert.match(guidanceJs, /YRDSB Guidance/);
  assert.match(guidanceJs, /Kids Help Phone/);
  assert.match(linksJs, /openSheet/);
  assert.match(settingsJs, /Refresh from TeachAssist/);
  assert.match(settingsJs, /confirm\("Sign out/);
});

// ---------------------------------------------------------------------------
// Design system: themes + WCAG contrast
// ---------------------------------------------------------------------------

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours. */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pull a variable's value out of a CSS block. */
function cssVar(block, name) {
  const m = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  return m ? m[1] : null;
}

const v6 = read("frontend/css/v6.css");
const themeJs = read("frontend/js/theme.js");
const COLORS = ["default", "mono", "tide", "olive", "ember", "blossom", "sky", "coral", "lavender", "gold"];

/** Body of the `html[data-mode="m"]...` block for a mode (+ accent). */
function modeBlock(mode, accent = null) {
  const sel = accent
    ? `html\\[data-mode="${mode}"\\]\\[data-accent="${accent}"\\]`
    : `html\\[data-mode="${mode}"\\]`;
  const m = v6.match(new RegExp(`${sel}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : null;
}

test("six colours × dark/light exist in CSS and the Theme page", () => {
  for (const id of COLORS) {
    assert.match(themeJs, new RegExp(`id: "${id}"`), `colour "${id}" is pickable`);
    for (const mode of ["dark", "light"]) assert.ok(modeBlock(mode, id), `${mode} × ${id} is defined in v6.css`);
  }
  for (const id of ["system", "dark", "light"]) assert.match(themeJs, new RegExp(`id: "${id}"`));
  assert.match(themeJs, /\["light", "default"\]/); // first-run default
  assert.match(appHtml, /css\/v6\.css/);
});

test("theme colours and text meet WCAG AA contrast", () => {
  for (const mode of ["dark", "light"]) {
    const base = modeBlock(mode);
    const card = cssVar(base, "--card-solid");
    assert.ok(contrast(cssVar(base, "--text"), card) >= 7, `${mode} text on card`);
    assert.ok(contrast(cssVar(base, "--text-secondary"), card) >= 4.5, `${mode} secondary text on card`);
    assert.ok(contrast(cssVar(base, "--text-faint"), card) >= 4.5, `${mode} faint text on card`);
    for (const id of COLORS) {
      const accent = cssVar(modeBlock(mode, id), "--accent");
      const ratio = contrast(accent, card);
      assert.ok(ratio >= 4.5, `${mode} ${id} accent ${accent} on ${card} is ${ratio.toFixed(2)}:1`);
      const onAccent = cssVar(base, "--accent-contrast");
      assert.ok(contrast(onAccent, accent) >= 4.5, `${mode} ${id}: button text on accent`);
    }
  }
});

test("achievement strand colours meet WCAG AA on their tints", () => {
  const root = css.match(/:root\s*\{([\s\S]*?)\n\}/)[1];
  for (const s of ["k", "t", "c", "a", "f"]) {
    const colour = cssVar(root, `--strand-${s}`);
    const tint = cssVar(root, `--strand-${s}-tint`);
    const ratio = contrast(colour, tint);
    assert.ok(ratio >= 4.5, `strand ${s}: ${colour} on ${tint} is ${ratio.toFixed(2)}:1`);
  }
});

test("mobile layout keeps chrome inside the centered app column", () => {
  assert.match(css, /--max-width:\s*480px/);
  assert.match(css, /width:\s*calc\(min\(100vw,\s*var\(--max-width\)\)\s*-\s*28px\)/);
  assert.match(css, /\.app-topbar/);
  assert.match(css, /\.tabbar/);
});

test("pages run no inline scripts or ads, and the CSP forbids inline scripts", () => {
  const headers = read("frontend/_headers");
  const csp = headers.match(/Content-Security-Policy: (.*)/)[1];
  const scriptSrc = csp.match(/script-src ([^;]*)/)[1];
  assert.doesNotMatch(scriptSrc, /unsafe-inline|unsafe-eval|\*/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  for (const page of ["frontend/app.html", "frontend/index.html", "frontend/legal/privacy.html", "frontend/legal/terms.html"]) {
    const html = read(page);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, `${page} has no inline <script>`);
    assert.doesNotMatch(html, /\son[a-z]+="/, `${page} has no inline event handlers`);
    assert.doesNotMatch(html, /googlesyndication|adsbygoogle/, `${page} loads no ad code`);
  }
  assert.equal(existsSync(new URL("../frontend/ads.txt", import.meta.url)), false);
});
