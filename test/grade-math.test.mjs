import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requiredGrade,
  projectedGrade,
  weightedAverage,
  calculatePlan,
  localPlan,
} from "../frontend/js/grade-math.js";
test("grade calculations match independently worked scenarios", () => {
  assert.ok(Math.abs(requiredGrade(85, 90, 30) - 101.6666666667) < 1e-8);
  assert.equal(projectedGrade(80, 100, 25), 85);
  assert.equal(
    weightedAverage([
      { score: 80, weight: 20 },
      { score: 100, weight: 30 },
    ]),
    92,
  );
  assert.equal(requiredGrade(90, 80, 100), 80);
});
test("invalid weights, missing data, and non-finite inputs cannot produce results", () => {
  for (const n of [-1, 101, NaN, Infinity, null, "90"])
    assert.throws(() => requiredGrade(n, 90, 30));
  assert.throws(() => requiredGrade(80, 90, 0));
  assert.throws(() => weightedAverage([]));
  assert.throws(() => weightedAverage([{ score: 80, weight: 0 }]));
  assert.throws(() => calculatePlan({ kind: "unknown" }));
});
test("impossible and already secured goals are explained", () => {
  assert.match(
    calculatePlan({ kind: "required", current: 85, target: 90, remaining: 30 })
      .text,
    /not reachable/,
  );
  assert.match(
    calculatePlan({ kind: "required", current: 100, target: 50, remaining: 10 })
      .text,
    /already secured/,
  );
});
test("offline parsing accepts only complete explicit syntax", () => {
  assert.deepEqual(localPlan("Current 85, target 90, remaining 30"), {
    kind: "required",
    current: 85,
    target: 90,
    remaining: 30,
  });
  assert.equal(localPlan("I have 85 and want 90"), null);
});
import { arithmetic } from "../frontend/js/grade-math.js";
test("arithmetic uses precedence, parentheses, percentages, roots, and right-associative powers", () => {
  assert.equal(arithmetic("2+3*4"), 14);
  assert.equal(arithmetic("(2+3)*4"), 20);
  assert.equal(arithmetic("2^3^2"), 512);
  assert.equal(arithmetic("-2^2"), -4);
  assert.equal(arithmetic("2^-2"), 0.25);
  assert.equal(arithmetic("sqrt(144)+2^3"), 20);
  assert.equal(arithmetic("80 * 25%"), 20);
  assert.ok(Math.abs(arithmetic(".1+.2") - 0.3) < 1e-12);
});
test("invalid arithmetic cannot execute code or return misleading values", () => {
  for (const exp of [
    "alert(1)",
    "1/0",
    "sqrt(-1)",
    "(2+3",
    "2**3",
    "2 3",
    "2(3)",
    "Infinity",
  ]) {
    assert.throws(() => arithmetic(exp), exp);
  }
});
