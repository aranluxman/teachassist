import { test } from "node:test";
import assert from "node:assert/strict";
import { gpaFor, computeGpa, GPA_SCALE } from "../frontend/js/gpa.js";

test("every band of the 4.0 scale maps to its letter and points", () => {
  const cases = [
    [100, "A+", 4.0], [97, "A+", 4.0], [96, "A", 4.0], [93, "A", 4.0],
    [92, "A-", 3.7], [90, "A-", 3.7], [89, "B+", 3.3], [87, "B+", 3.3],
    [86, "B", 3.0], [83, "B", 3.0], [82, "B-", 2.7], [80, "B-", 2.7],
    [79, "C+", 2.3], [77, "C+", 2.3], [76, "C", 2.0], [73, "C", 2.0],
    [72, "C-", 1.7], [70, "C-", 1.7], [69, "D+", 1.3], [67, "D+", 1.3],
    [66, "D", 1.0], [65, "D", 1.0], [64, "F", 0.0], [0, "F", 0.0],
  ];
  for (const [pct, letter, points] of cases) assert.deepEqual(gpaFor(pct), { letter, points }, String(pct));
  assert.equal(GPA_SCALE.length, 12);
});

test("marks are rounded to a whole percent first, like a report card", () => {
  assert.equal(gpaFor(96.5).letter, "A+");
  assert.equal(gpaFor(96.4).letter, "A");
  assert.equal(gpaFor(64.5).letter, "D");
});

test("GPA averages the points, every course counting equally", () => {
  const g = computeGpa([97.5, 90, 84, 71]); // 4.0 + 3.7 + 3.0 + 1.7
  assert.equal(g.gpa, 3.1);
  assert.equal(g.count, 4);
  assert.equal(g.average, 85.6);
  assert.equal(g.letter, "B");
});

test("no marks means no GPA; missing marks are ignored", () => {
  assert.equal(computeGpa([]), null);
  assert.equal(computeGpa([null, undefined, NaN]), null);
  assert.equal(gpaFor(null), null);
  assert.equal(computeGpa([null, 98]).gpa, 4);
});
