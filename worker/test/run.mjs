// Bundles the test harness with esbuild and runs it under Miniflare (real
// workerd runtime, so HTMLRewriter behaves exactly like production), then
// asserts the parser output against sample TeachAssist-shaped HTML.
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import assert from "node:assert";

const bundle = await build({
  entryPoints: ["test/harness.js"],
  bundle: true,
  format: "esm",
  write: false,
  platform: "browser",
  conditions: ["worker", "browser"],
});
const script = bundle.outputFiles[0].text;

const mf = new Miniflare({
  modules: true,
  script,
  compatibilityDate: "2025-09-01",
});

const post = async (path, body) => {
  const res = await mf.dispatchFetch("http://localhost" + path, {
    method: "POST",
    body,
  });
  return res.json();
};

// ---- Course list sample ----------------------------------------------------
const courseHtml = `
<html><body><table>
<tr bgcolor="#eeeeee">
  <td width="70%">ENG4U-01 : Block: P1 - rm. 213<br></td>
  <td>2024-09-03</td>
  <td><a href="viewReport.php?subject_id=12345&student_id=67890">current mark = 95.5%</a></td>
</tr>
<tr bgcolor="#dddddd">
  <td>MHF4U-02 : Block: P2 - rm. 118<br></td>
  <td>2024-09-03</td>
  <td><a href="viewReport.php?subject_id=22222&student_id=67890">current mark = 88%</a></td>
</tr>
<tr>
  <td>SCH4U-01 : Block: P3 (no mark yet)<br></td>
  <td>2024-09-03</td>
  <td bgcolor="#ff0000">MIDTERM MARK: 78%<br>Please see teacher</td>
</tr>
</table></body></html>`;

const courses = await post("/courses", courseHtml);
console.log("courses =", JSON.stringify(courses, null, 2));

assert.strictEqual(courses.length, 3, "should parse 3 courses");

const eng = courses.find((c) => c.code === "ENG4U-01");
assert.ok(eng, "ENG4U-01 present");
assert.strictEqual(eng.currentMark, 95.5, "ENG mark 95.5");
assert.strictEqual(eng.subjectId, "12345", "ENG subjectId");
assert.strictEqual(eng.studentId, "67890", "ENG studentId");

const mhf = courses.find((c) => c.code === "MHF4U-02");
assert.strictEqual(mhf.currentMark, 88, "MHF mark 88");
assert.strictEqual(mhf.subjectId, "22222", "MHF subjectId");

const sch = courses.find((c) => c.code === "SCH4U-01");
assert.ok(sch, "course without a mark still appears");
assert.strictEqual(sch.currentMark, null, "no-mark course -> null");
assert.strictEqual(sch.subjectId, null, "no-mark course has no subjectId");
assert.strictEqual(sch.midterm, 78, "midterm mark parsed from the list row");
assert.strictEqual(eng.midterm, null, "no midterm text -> null");

// ---- Evaluation / report sample (nested tables) ----------------------------
const reportHtml = `
<html><body><table border="1">
<tr>
  <td>&nbsp;</td>
  <td bgcolor="ffffaa">Knowledge/<br>Understanding</td>
  <td bgcolor="c0fea4">Thinking</td>
  <td bgcolor="afafff">Communication</td>
  <td bgcolor="ffd490">Application</td>
</tr>
<tr>
  <td>Unit 1 Test</td>
  <td bgcolor="ffffaa"><table><tr><td>17 / 20 = 85%</td></tr><tr><td>weight=10</td></tr></table></td>
  <td bgcolor="c0fea4"><table><tr><td>no mark</td></tr><tr><td>weight=10</td></tr></table></td>
  <td bgcolor="afafff"><table><tr><td>9 / 10 = 90%</td></tr><tr><td>weight=10</td></tr></table></td>
  <td bgcolor="ffd490"><table><tr><td>18 / 20 = 91%</td></tr><tr><td>weight=10</td></tr></table></td>
</tr>
<tr>
  <td>Final Essay</td>
  <td bgcolor="ffffaa"><table><tr><td>no mark</td></tr></table></td>
  <td bgcolor="c0fea4"><table><tr><td>8 / 10 = 80%</td></tr><tr><td>weight=5</td></tr></table></td>
  <td bgcolor="afafff"><table><tr><td>7 / 10 = 70%</td></tr><tr><td>weight=5</td></tr></table></td>
  <td bgcolor="ffd490"><table><tr><td>19 / 20 = 95%</td></tr><tr><td>weight=5</td></tr></table></td>
</tr>
</table></body></html>`;

const evals = await post("/evals", reportHtml);
console.log("evals =", JSON.stringify(evals, null, 2));

// Header row -> no evals; "no mark" strands skipped.
assert.strictEqual(evals.length, 6, "should parse 6 graded strands");

const u1 = evals.filter((e) => e.name === "Unit 1 Test");
assert.strictEqual(u1.length, 3, "Unit 1 Test has 3 graded strands (T skipped)");
const ku = u1.find((e) => e.category === "Knowledge/Understanding");
assert.strictEqual(ku.percent, 85, "KU percent 85");
assert.strictEqual(ku.weight, 10, "KU weight 10");
assert.ok(!u1.some((e) => e.category === "Thinking"), "no-mark Thinking skipped");
const app = u1.find((e) => e.category === "Application");
assert.strictEqual(app.percent, 91, "Application percent 91");

const essay = evals.filter((e) => e.name === "Final Essay");
assert.strictEqual(essay.length, 3, "Final Essay has 3 graded strands");
assert.strictEqual(
  essay.find((e) => e.category === "Communication").percent,
  70,
  "Essay Communication 70"
);

await mf.dispose();
console.log("\n✅ All parser assertions passed.");
