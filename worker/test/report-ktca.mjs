import assert from "node:assert";
import { readFileSync } from "node:fs";
import { parseAssignments, parseOEEvaluations } from "../src/index.js";

// Real viewReport.php markup (TDJ2O, K/T/C/A course).
const html = readFileSync(new URL("./fixtures/report-ktca.html", import.meta.url), "utf8");
const evals = parseAssignments(html);

assert.deepStrictEqual(evals.map((e) => e.name), ["Freehand Drawing", "Nametag Keychain"]);

const [drawing, keychain] = evals;
assert.strictEqual(drawing.percent, 95);
assert.strictEqual(drawing.weight, 4);
assert.strictEqual(drawing.mark, 19);
assert.strictEqual(drawing.outOf, 20);
assert.deepStrictEqual(drawing.strands.map((s) => [s.category, s.mark, s.outOf, s.percent, s.weight]), [
  ["Knowledge/Understanding", 19, 20, 95, 1],
  ["Thinking", 19, 20, 95, 1],
  ["Communication", 19, 20, 95, 1],
  ["Application", 19, 20, 95, 1],
]);
assert.strictEqual(drawing.feedback, undefined); // "&nbsp;" only
assert.strictEqual(keychain.percent, 100);
assert.strictEqual(keychain.feedback, "Great work");

// Different marks per strand: no single mark/outOf, weighted percent.
const mixed = parseAssignments(html.replace(
  '<td bgcolor="#c0fea4" id="e,11170981" align="center">19 / 20',
  '<td bgcolor="#c0fea4" id="e,11170981" align="center">10 / 20'
))[0];
assert.strictEqual(mixed.mark, undefined);
assert.strictEqual(mixed.percent, 83.8); // (95*3 + 50) / 4

// The two layouts don't confuse each other.
const oe = readFileSync(new URL("./fixtures/report-oe.html", import.meta.url), "utf8");
assert.deepStrictEqual(parseAssignments(oe), []);
assert.deepStrictEqual(parseOEEvaluations(html), []);

// "no weight" means the work doesn't count: weight 0, not 1.
const noWeight = parseAssignments(html.replace(
  '<td bgcolor="#ffffaa" id="e,11170980" align="center">19 / 20								: 95%				<br><font size="-2">\nweight=1',
  '<td bgcolor="#ffffaa" id="e,11170980" align="center">19 / 20								: 95%				<br><font size="-2">\nno weight'
))[0];
assert.strictEqual(noWeight.strands[0].weight, 0);
assert.strictEqual(noWeight.strands[1].weight, 1);

// French layout: every mark sits in its own nested table.
const nested = parseAssignments(readFileSync(new URL("./fixtures/report-nested.html", import.meta.url), "utf8"));
assert.deepStrictEqual(nested.map((e) => e.name), ["écoute", "écriture", "mini-test 1"]);
assert.deepStrictEqual(nested[0].strands.map((x) => [x.category, x.mark, x.outOf, x.weight]), [["Knowledge/Understanding", 7, 11, 0]]);
assert.deepStrictEqual(nested[1].strands.map((x) => [x.category, x.mark, x.weight]), [["Communication", 6.8, 0]]);
const mini = nested[2];
assert.deepStrictEqual(mini.strands.map((x) => [x.category, x.mark, x.outOf, x.weight]), [
  ["Knowledge/Understanding", 6, 6, 10], ["Thinking", 6, 6, 10], ["Communication", 8, 10, 10], ["Application", 7, 8, 10],
]);
assert.strictEqual(mini.weight, 40);
assert.strictEqual(mini.mark, undefined); // strands differ, so no single "6 / 6"
assert.strictEqual(mini.feedback, "Bon travail");

console.log("report-ktca tests passed");
