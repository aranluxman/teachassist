import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { notificationMessage, inQuietHours } from "../frontend/js/notifications.js";
import { TEXT_SIZES, FONTS } from "../frontend/js/customize.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const changes = [
  { code: "ENG", kind: "changed", before: 80, mark: 80.4 }, // tiny move
  { code: "MTH", kind: "changed", before: 92, mark: 86 }, // big drop, under a 90 goal
  { code: "SCI", kind: "changed", before: null, mark: 75 }, // brand-new mark
];
const base = { marks: true, private: false, unavailable: false };

test("only-big-changes skips tiny moves but never a brand-new mark", () => {
  const all = notificationMessage(changes, { ...base, minChange: 0 });
  assert.match(all, /ENG/);
  const big = notificationMessage(changes, { ...base, minChange: 2 });
  assert.doesNotMatch(big, /ENG/);
  assert.match(big, /MTH/);
  assert.match(big, /SCI: new mark/);
});

test("below-goal alerts fire when a course crosses under its goal, even with mark alerts off", () => {
  const prefs = { marks: false, private: false, belowGoal: true, target: 85, goals: { MTH: 90 } };
  const msg = notificationMessage(changes, prefs);
  assert.match(msg, /MTH: 92\.0% → 86\.0% \(below your 90% goal\)/);
  assert.match(msg, /SCI.*below your 85% goal/);
  assert.doesNotMatch(msg, /ENG/);
  // Already under the goal before: no repeat alert.
  assert.equal(notificationMessage([{ code: "MTH", kind: "changed", before: 80, mark: 79 }], prefs), null);
  // Private mode still hides the numbers.
  assert.doesNotMatch(notificationMessage(changes, { ...prefs, private: true }), /MTH|86/);
});

test("quiet hours work across midnight and can be off", () => {
  const at = (h, m = 0) => new Date(2026, 10, 7, h, m);
  const night = { quiet: true, quietFrom: "22:00", quietTo: "07:00" };
  assert.equal(inQuietHours(night, at(23)), true);
  assert.equal(inQuietHours(night, at(3)), true);
  assert.equal(inQuietHours(night, at(7)), false);
  assert.equal(inQuietHours(night, at(12)), false);
  const day = { quiet: true, quietFrom: "08:30", quietTo: "15:00" };
  assert.equal(inQuietHours(day, at(10)), true);
  assert.equal(inQuietHours(day, at(16)), false);
  assert.equal(inQuietHours({ ...night, quiet: false }, at(23)), false);
  assert.equal(inQuietHours({ quiet: true, quietFrom: "bad", quietTo: "07:00" }, at(23)), false);
});

test("four text sizes and four fonts to choose from", () => {
  assert.deepEqual(TEXT_SIZES.map(([id]) => id), ["small", "default", "large", "xlarge"]);
  assert.equal(FONTS.length, 4);
  assert.equal(new Set(FONTS.map(([id]) => id)).size, 4);
});

test("every fixed font size in the CSS follows the text-size setting", () => {
  for (const f of ["style", "ui", "v6", "v7", "refresh", "liquid", "polish", "mobile", "guidance-hub", "custom"]) {
    const css = read(`frontend/css/${f}.css`);
    assert.doesNotMatch(css, /font-size:\s*[0-9.]+px\s*[;!}]/, `${f}.css has a font-size that ignores --ts`);
  }
});

test("the home average never slides sideways when scrolling", () => {
  assert.match(read("frontend/css/v6.css"), /\.g-pager \{[^}]*touch-action: pan-y;/);
});

test("animations off keeps short transitions so swipes still settle", () => {
  const css = read("frontend/css/motion.css");
  const block = css.slice(css.indexOf('[data-motion="false"] *::after {'));
  assert.match(block.slice(0, 300), /transition-duration: 150ms !important/);
  assert.doesNotMatch(read("frontend/js/glass.js"), /Math\.abs\(dx\) < 6 \|\| !motionEnabled\(\)/);
});

test("credits list the right people", () => {
  const js = read("frontend/js/settings.js");
  assert.match(js, /Aijay&nbsp;K\./);
  for (const gone of ["Vaishnavan", "Grant&nbsp;C", "Yash&nbsp;P", "Nathaniel&nbsp;V", "Aijai", "Erdem", "Hari&nbsp;K"]) {
    assert.doesNotMatch(js, new RegExp(gone), gone);
  }
});

test("home starts in the big layout; compact is opt-in", () => {
  assert.match(read("frontend/js/personalization.js"), /compactHome: false,/);
});

test("selected Evaluations/Breakdown tab stays readable with animations off", () => {
  assert.match(read("frontend/css/custom.css"), /html\[data-mode\]:not\(\.m-on\) \.g-segmented button\.active \{\s*color: color-mix\(in srgb, var\(--accent\) 45%, var\(--text\)\);/);
});
