import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const appHtml = read("frontend/app.html");
const indexHtml = read("frontend/index.html");
const css = read("frontend/css/style.css");
const coursesJs = read("frontend/js/courses.js");
const settingsJs = read("frontend/js/settings.js");

test("app exposes install metadata and a mobile app icon", () => {
  assert.match(appHtml, /rel="manifest"/);
  assert.match(appHtml, /rel="icon"/);
  assert.match(indexHtml, /rel="manifest"/);
  assert.equal(existsSync(new URL("../frontend/manifest.webmanifest", import.meta.url)), true);
});

test("settings copy and controls are production-ready", () => {
  assert.doesNotMatch(settingsJs, /Placeholder\s+[—-]\s+basic dark palette/i);
  assert.match(settingsJs, /aria-label="Toggle dark theme"/);
  assert.match(settingsJs, /confirm\("Sign out/);
  assert.match(settingsJs, /About/);
  assert.match(settingsJs, /Version/);
});

test("course empty state uses polished app UI rather than emoji-only art", () => {
  assert.doesNotMatch(coursesJs, /📚|ðŸ“š/);
  assert.match(coursesJs, /empty-state-book/);
  assert.match(css, /empty-icon.*animation/s);
  assert.match(css, /fab-attention/);
});

test("course sheet has accessible close and validation feedback", () => {
  assert.match(coursesJs, /sheet-close/);
  assert.match(coursesJs, /Escape/);
  assert.match(coursesJs, /aria-describedby="course-code-error"/);
  assert.match(coursesJs, /field-error/);
  assert.match(css, /\.field-error/);
  assert.match(css, /::placeholder/);
});

test("desktop layout keeps all mobile chrome inside the centered app column", () => {
  assert.match(css, /--max-width:\s*480px/);
  assert.match(css, /width:\s*calc\(min\(100vw,\s*var\(--max-width\)\)\s*-\s*28px\)/);
  assert.match(css, /--fab-offset/);
});
