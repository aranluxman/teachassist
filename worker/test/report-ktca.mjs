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

console.log("report-ktca tests passed");
