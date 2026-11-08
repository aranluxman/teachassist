// Pager swiping (frontend/js/swipe.js): small nudges and quick flicks switch
// pages, vertical scrolling never drags the pager sideways.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FLICK_SPEED, SWIPE_PX, swipeTarget } from "../frontend/js/swipe.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a short slow drag switches page once it passes the swipe distance", () => {
  assert.equal(SWIPE_PX <= 20, true);
  assert.equal(swipeTarget(0, 3, -20, 0), 1); // finger left → next
  assert.equal(swipeTarget(1, 3, 20, 0), 0); // finger right → previous
  assert.equal(swipeTarget(1, 3, -19, 0), 1); // too small, stays
});

test("a quick flick switches page however short it is", () => {
  assert.equal(swipeTarget(0, 2, -8, -FLICK_SPEED), 1);
  assert.equal(swipeTarget(1, 2, 8, 0.5), 0);
});

test("the flick direction wins over the distance dragged", () => {
  // Dragged 60px toward the next page, then flicked back.
  assert.equal(swipeTarget(1, 3, -60, 0.6), 0);
});

test("swiping past the first or last page stays put", () => {
  assert.equal(swipeTarget(0, 3, 80, 1), 0);
  assert.equal(swipeTarget(2, 3, -80, -1), 2);
  assert.equal(swipeTarget(0, 1, -80, -1), 0);
});

test("both pagers get finger swiping, and the chart needs a hold to inspect", () => {
  const kit = read("frontend/js/ui-kit.js");
  assert.match(kit, /attachSwipe\(track, go\)/);
  const courses = read("frontend/js/courses.js");
  assert.match(courses, /HOLD_MS/);
  // The chart no longer swallows every touch, or the pager could never see it.
  const chart = courses.slice(courses.indexOf("export function trendChartEl"));
  assert.doesNotMatch(chart.slice(0, chart.indexOf('svg.addEventListener("pointermove"')), /e\.stopPropagation\(\);\n  \}\);/);
  assert.match(read("frontend/css/v6.css"), /\.g-pager\.is-swiping \{[^}]*scroll-snap-type: none;/);
});
