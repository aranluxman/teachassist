import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const appHtml = read("frontend/app.html");
const indexHtml = read("frontend/index.html");
const css = read("frontend/css/style.css");
const coursesJs = read("frontend/js/courses.js");
const courseDetailJs = read("frontend/js/course-detail.js");
const guidanceJs = read("frontend/js/guidance.js");
const installJs = read("frontend/js/install.js");
const linksJs = read("frontend/js/links.js");
const settingsJs = read("frontend/js/settings.js");
const scienceAnalyticsJs = read("frontend/js/science-analytics.js");
const taClientJs = read("frontend/js/ta-client.js");

test("app exposes install metadata and mobile app chrome", () => {
  assert.match(appHtml, /rel="manifest"/);
  assert.match(appHtml, /rel="icon"/);
  assert.match(indexHtml, /rel="manifest"/);
  assert.match(appHtml, /id="install-app"/);
  assert.match(indexHtml, /id="install-app"/);
  assert.match(installJs, /beforeinstallprompt/);
  assert.equal(existsSync(new URL("../frontend/manifest.webmanifest", import.meta.url)), true);
});

test("sign-in uses the live TeachAssist worker flow", () => {
  assert.match(indexHtml, /Student number/);
  assert.match(indexHtml, /Worker URL/);
  assert.match(indexHtml, /login/);
  assert.match(taClientJs, /POST/);
  assert.match(taClientJs, /\/api\/marks/);
  assert.match(taClientJs, /requireLogin/);
});

test("app shell includes courses, guidance, science, links, and settings tabs", () => {
  for (const tab of ["courses", "guidance", "science", "links", "settings"]) {
    assert.match(appHtml, new RegExp(`data-tab="${tab}"`));
  }
  assert.match(appHtml, /id="screen-science"/);
  assert.match(appHtml, /renderGuidance/);
  assert.match(appHtml, /renderScienceAnalytics/);
  assert.match(appHtml, /toScience/);
});

test("courses and detail screens render live marks analytics", () => {
  assert.match(coursesJs, /getCourses/);
  assert.match(coursesJs, /Overall Average/);
  assert.match(coursesJs, /Recent updates/);
  assert.match(courseDetailJs, /GRADE PROGRESSION/);
  assert.match(courseDetailJs, /ASSIGNMENT OVERVIEW/);
  assert.match(courseDetailJs, /new window\.Chart/);
});

test("student utility tabs remain production-ready", () => {
  assert.match(guidanceJs, /YRDSB Guidance/);
  assert.match(linksJs, /openSheet/);
  assert.match(settingsJs, /aria-label="Toggle dark theme"/);
  assert.match(settingsJs, /Refresh from TeachAssist/);
  assert.match(settingsJs, /confirm\("Sign out/);
});

test("science analytics page includes marks analysis, projections, and chart UI", () => {
  assert.match(scienceAnalyticsJs, /scienceCoursePrefixes/);
  assert.match(scienceAnalyticsJs, /export async function renderScienceAnalytics/);
  assert.match(scienceAnalyticsJs, /buildScienceInsights/);
  assert.match(scienceAnalyticsJs, /renderScienceTrendChart/);
  assert.match(scienceAnalyticsJs, /Science Marks/);
  assert.match(scienceAnalyticsJs, /Science Average/);
  assert.match(scienceAnalyticsJs, /Overall Average/);
  assert.match(scienceAnalyticsJs, /Next target/);
  assert.match(css, /\.science-hero/);
  assert.match(css, /\.metric-grid/);
  assert.match(css, /\.analytics-bar/);
});

test("mobile layout keeps chrome inside the centered app column", () => {
  assert.match(css, /--max-width:\s*480px/);
  assert.match(css, /width:\s*calc\(min\(100vw,\s*var\(--max-width\)\)\s*-\s*28px\)/);
  assert.match(css, /\.app-topbar/);
  assert.match(css, /\.tabbar/);
  assert.match(css, /\.install-btn/);
});
