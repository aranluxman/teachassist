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

console.log("report-oe tests passed");
