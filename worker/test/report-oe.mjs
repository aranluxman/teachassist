import assert from "node:assert";
import { readFileSync } from "node:fs";
import { parseOEEvaluations } from "../src/index.js";

// Real viewReportOE.php markup (SNC2D, Overall Expectation course).
const html = readFileSync(new URL("./fixtures/report-oe.html", import.meta.url), "utf8");
const evals = parseOEEvaluations(html);

// Quest #1 (two expectations) is merged; ungraded Formative quiz #2 is skipped.
assert.deepStrictEqual(evals.map((e) => e.name), [
  "Ionic and Molecular compounds Quest # 1",
  "Formative quiz # 1- Balancing Chemical equations",
]);

const quest = evals[0];
assert.strictEqual(quest.percent, 100);
assert.strictEqual(quest.weight, 4);
assert.strictEqual(quest.mark, 46);
assert.strictEqual(quest.outOf, 46);
assert.strictEqual(quest.category, "C2, C3");
assert.deepStrictEqual(quest.strands.map((s) => [s.category, s.percent, s.weight]), [
  ["C2", 100, 2],
  ["C3", 100, 2],
]);

const formative = evals[1];
assert.strictEqual(formative.percent, 100);
assert.strictEqual(formative.weight, 0);

// A page without the Assessment Tasks table (e.g. a normal course) yields [].
assert.deepStrictEqual(parseOEEvaluations("<html><body>nothing</body></html>"), []);

// A partial mark is a real percentage.
const partial = html.replace("<td>22</td>", "<td>11</td>");
assert.strictEqual(parseOEEvaluations(partial)[0].percent, 76.1); // 35 / 46

// Level-marked tasks (no "/ out of" cell): "4 +" is Level 4+, not 4 / 10,
// and the weight (10 per expectation) is read from the right cell.
const levels = parseOEEvaluations(
  readFileSync(new URL("./fixtures/report-oe-levels.html", import.meta.url), "utf8")
);
const byName = Object.fromEntries(levels.map((e) => [e.name, e]));
assert.strictEqual(levels.length, 6); // ungraded "Active Living Month #3" skipped

const alm1 = byName["Active Living Month #1"];
assert.strictEqual(alm1.level, "4+");
assert.strictEqual(alm1.percent, 97.5);
assert.strictEqual(alm1.weight, 30);
assert.strictEqual(alm1.mark, undefined); // never a fake "12 / 30"
assert.deepStrictEqual(alm1.strands.map((s) => [s.category, s.level, s.percent, s.weight]), [
  ["A1", "4+", 97.5, 10],
  ["A2", "4+", 97.5, 10],
  ["A3", "4+", 97.5, 10],
]);

// A blank "/ out of" cell instead of a missing one parses the same way.
const outdoor = byName["Outdoor Zone Games Movement Competencies"];
assert.deepStrictEqual([outdoor.level, outdoor.percent, outdoor.weight], ["3", 74.5, 20]);
assert.deepStrictEqual([byName["Active Living Month #2"].level, byName["Active Living Month #2"].percent], ["4", 90.5]);

// Score rows on the same page are unchanged.
assert.deepStrictEqual([byName["Football Rules Quiz"].mark, byName["Football Rules Quiz"].outOf, byName["Football Rules Quiz"].weight], [5, 11, 1]);

// Spellings TeachAssist might use for levels.
for (const [mark, pct] of [["4+", 97.5], ["4 −", 83], ["3-", 71], ["2 +", 68], ["1", 54.5], ["R", 40]]) {
  const row = `<h2>Assessment Tasks</h2><table><tr><td>T</td><td>A1.</td><td colspan="2">${mark}</td><td>5</td><td></td></tr></table>`;
  const [task] = parseOEEvaluations(row);
  assert.deepStrictEqual([task.percent, task.weight], [pct, 5], mark);
}

console.log("report-oe tests passed");
