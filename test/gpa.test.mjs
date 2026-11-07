import { test } from "node:test";
import assert from "node:assert/strict";
import { gpaFor, computeGpa, GPA_SCALE, GPA_MAX } from "../frontend/js/gpa.js";

test("every band of the scale maps to its letter and points", () => {
  const cases = [
    [100, "A+", 4.33], [90, "A+", 4.33], [89, "A", 4.0], [85, "A", 4.0],
    [84, "A-", 3.67], [80, "A-", 3.67], [79, "B+", 3.33], [77, "B+", 3.33],
    [76, "B", 3.0], [73, "B", 3.0], [72, "B-", 2.67], [70, "B-", 2.67],
    [69, "C+", 2.33], [67, "C+", 2.33], [66, "C", 2.0], [63, "C", 2.0],
    [62, "C-", 1.67], [60, "C-", 1.67], [59, "D+", 1.33], [57, "D+", 1.33],
    [56, "D", 1.0], [53, "D", 1.0], [52, "D-", 0.67], [50, "D-", 0.67],
    [49, "F", 0.0], [0, "F", 0.0],
  ];
  for (const [pct, letter, points] of cases) assert.deepEqual(gpaFor(pct), { letter, points }, String(pct));
  assert.equal(GPA_SCALE.length, 13);
  assert.equal(GPA_MAX, 4.33);
});

test("marks are rounded to a whole percent first, like a report card", () => {
  assert.equal(gpaFor(89.5).letter, "A+");
  assert.equal(gpaFor(89.4).letter, "A");
  assert.equal(gpaFor(49.5).letter, "D-");
});

test("a Level 3 mark (B, 73-76%) is a 3.0, not a 2.7", () => {
  assert.equal(gpaFor(75).points, 3.0);
});

test("GPA averages the points, every course counting equally", () => {
  const g = computeGpa([97.5, 88, 81, 71]); // 4.33 + 4.0 + 3.67 + 2.67
  assert.equal(g.gpa, 3.67);
  assert.equal(g.count, 4);
  assert.equal(g.average, 84.4);
  assert.equal(g.letter, "A-");
});

test("no marks means no GPA; missing marks are ignored", () => {
  assert.equal(computeGpa([]), null);
  assert.equal(computeGpa([null, undefined, NaN]), null);
  assert.equal(gpaFor(null), null);
  assert.equal(computeGpa([null, 98]).gpa, 4.33);
});
