import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { DEMO_COURSES } from "../frontend/js/demo-data.js";
import { strandKey, strandBreakdown } from "../frontend/js/course-detail.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const appHtml = read("frontend/app.html");
const indexHtml = read("frontend/index.html");
const css = read("frontend/css/style.css");
const coursesJs = read("frontend/js/courses.js");
const courseDetailJs = read("frontend/js/course-detail.js");
const guidanceJs = read("frontend/js/guidance.js");
const linksJs = read("frontend/js/links.js");
const settingsJs = read("frontend/js/settings.js");
const scienceAnalyticsJs = read("frontend/js/science-analytics.js");
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

test("app shell includes courses, guidance, science, links, and settings tabs", () => {
  for (const tab of ["courses", "guidance", "science", "links", "settings"]) {
    assert.match(appHtml, new RegExp(`data-tab="${tab}"`));
  }
  assert.match(appHtml, /id="screen-science"/);
  assert.match(appHtml, /renderGuidance/);
  assert.match(appHtml, /renderScienceAnalytics/);
  assert.match(appHtml, /applyStoredTheme/);
});

// ---------------------------------------------------------------------------
// Sign-in: live Worker flow + bundled demo mode
// ---------------------------------------------------------------------------

test("sign-in uses the live TeachAssist worker flow", () => {
  assert.match(indexHtml, /Student number/);
  assert.match(indexHtml, /Worker URL/);
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

test("courses and detail screens render live marks analytics", () => {
  assert.match(coursesJs, /getCourses/);
  assert.match(coursesJs, /Overall Average/);
  assert.match(coursesJs, /Recent updates/);
  assert.match(courseDetailJs, /GRADE PROGRESSION/);
  assert.match(courseDetailJs, /new window\.Chart/);
  assert.match(courseDetailJs, /cat-pill/);
  assert.match(courseDetailJs, /strandBreakdown/);
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

test("science course page matches the TeachAssist-style detail view", () => {
  assert.match(scienceAnalyticsJs, /SCIENCE_COURSE/);
  assert.match(scienceAnalyticsJs, /export async function renderScienceAnalytics/);
  assert.match(scienceAnalyticsJs, /Term Work/);
  assert.match(scienceAnalyticsJs, /Culminating Work/);
  assert.match(scienceAnalyticsJs, /overall-expectations-table/);
  assert.match(css, /\.science-course-hero/);
  assert.match(css, /\.expectations-table/);
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

/** Extract the body of a [data-theme="x"] { ... } block. */
function themeBlock(id) {
  const m = css.match(new RegExp(`\\[data-theme="${id}"\\]\\s*\\{([^}]*)\\}`));
  return m ? m[1] : null;
}

const LIGHT_THEMES = ["ocean", "sunset", "rose", "forest", "grape", "slate"];
const DARK_THEMES = ["dark", "midnight"];

test("all 9 themes exist in CSS and the Settings picker", () => {
  for (const id of [...LIGHT_THEMES, ...DARK_THEMES]) {
    assert.ok(themeBlock(id), `theme "${id}" is defined in style.css`);
    assert.match(settingsJs, new RegExp(`id: "${id}"`), `theme "${id}" is pickable in Settings`);
  }
  assert.match(settingsJs, /id: "indigo"/); // the :root default
});

test("theme accents meet WCAG AA contrast (4.5:1) as text", () => {
  const white = "#ffffff";
  const rootAccent = cssVar(css.match(/:root\s*\{([\s\S]*?)\n\}/)[1], "--accent");
  assert.ok(contrast(rootAccent, white) >= 4.5, `indigo ${rootAccent} on white`);
  for (const id of LIGHT_THEMES) {
    const accent = cssVar(themeBlock(id), "--accent");
    const ratio = contrast(accent, white);
    assert.ok(ratio >= 4.5, `${id} accent ${accent} on white is ${ratio.toFixed(2)}:1`);
  }
  for (const id of DARK_THEMES) {
    const block = themeBlock(id);
    const accent = cssVar(block, "--accent");
    const card = cssVar(block, "--card");
    const text = cssVar(block, "--text");
    const secondary = cssVar(block, "--text-secondary");
    assert.ok(contrast(accent, card) >= 4.5, `${id} accent ${accent} on card ${card}`);
    assert.ok(contrast(text, card) >= 7, `${id} text on card`);
    assert.ok(contrast(secondary, card) >= 4.5, `${id} secondary text on card`);
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
