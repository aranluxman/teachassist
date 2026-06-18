import assert from "node:assert";
import worker from "../src/index.js";

// ---- Friendly routing diagnostics ------------------------------------------
{
  const root = await worker.fetch(new Request("http://localhost/"), {});
  assert.strictEqual(root.status, 200, "Worker root should return a helpful status");
  const body = await root.json();
  assert.strictEqual(body.endpoint, "http://localhost/api/marks");

  const doubled = await worker.fetch(
    new Request("http://localhost/api/marks/api/marks"),
    {}
  );
  assert.strictEqual(doubled.status, 400, "double endpoint should explain the URL problem");
  const doubledBody = await doubled.json();
  assert.match(doubledBody.hint, /endpoint/i);
}

// ---- Login request contract -------------------------------------------------
// The live TeachAssist login form posts to /yrdsb/index.php with two constant
// fields in addition to username/password. Keep this as a quick regression
// check because a wrong login POST makes the sync fail before parsing starts.
{
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response("", {
      status: 302,
      headers: {
        location: "https://ta.yrdsb.ca/live/students/listReports.php?student_id=242965",
        "set-cookie": "session_token=fake-session; Path=/; HttpOnly",
      },
    });
  };

  try {
    const res = await worker.fetch(
      new Request("http://localhost/api/marks?debug=login", {
        headers: { "x-api-key": "test-key" },
      }),
      {
        API_KEY: "test-key",
        TA_USERNAME: "student-number",
        TA_PASSWORD: "student-password",
      }
    );
    assert.strictEqual(res.status, 200, "debug login request should succeed");
    assert.strictEqual(
      captured.url,
      "https://ta.yrdsb.ca/yrdsb/index.php",
      "login should post to the live TeachAssist login path"
    );

    const form = new URLSearchParams(captured.init.body);
    assert.strictEqual(form.get("subject_id"), "0", "login should include subject_id=0");
    assert.strictEqual(form.get("username"), "student-number", "login should include username");
    assert.strictEqual(form.get("password"), "student-password", "login should include password");
    assert.strictEqual(form.get("submit"), "Login", "login should include submit=Login");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

if (process.env.SKIP_PARSER_TESTS === "1") {
  console.log("Login contract assertion passed.");
  process.exit(0);
}

// Bundles the test harness with esbuild and runs it under Miniflare (real
// workerd runtime, so HTMLRewriter behaves exactly like production), then
// asserts the parser output against sample TeachAssist-shaped HTML.
const { build } = await import("esbuild");
const { Miniflare } = await import("miniflare");

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

// ---- Report sample: real viewReport.php structure --------------------------
// Strand colours are on the <tr>; the category summary table has
// Category | Weighting | Course Weighting | Student Achievement. The legend,
// Term/Course mark rows, and the Analysis/Trends plot rows must all be skipped.
const reportHtml = `
<html><body>
<table border="1"><tr><td bgcolor="#ffaaaa">&nbsp;</td><td>legend not used</td></tr></table>
<table width="90%">
  <tr bgcolor="ffffaa"><td><h3>Knowledge/Understanding</h3><img src="../plot.php"></td></tr>
  <tr bgcolor="c0fea4"><td><h3>Thinking</h3><img src="../plot.php"></td></tr>
</table>
<table border="0"><tr bgcolor="#336633"><td>0.0%</td><td>Term</td></tr>
  <tr bgcolor="#ddddcc"><td>90.7%</td><td>Course</td></tr></table>
<table border="1" cellpadding="3" cellspacing="0">
  <tr><th>Category</th><th>Weighting</th><th>Course Weighting</th><th>Student Achievement</th></tr>
  <tr bgcolor="#ffffaa"><td>Knowledge/Understanding</td><td align="right">20%</td><td align="right">14%</td><td align="right">85%</td></tr>
  <tr bgcolor="#c0fea4"><td>Thinking</td><td align="right">20%</td><td align="right">14%</td><td align="right">90%</td></tr>
  <tr bgcolor="#afafff"><td>Communication</td><td align="right">20%</td><td align="right">14%</td><td align="right">0%</td></tr>
  <tr bgcolor="#ffd490"><td>Application</td><td align="right">20%</td><td align="right">14%</td><td align="right">88%</td></tr>
  <tr bgcolor="#eeeeee"><td>Other</td><td align="right">20%</td><td align="right">14%</td><td align="right">0%</td></tr>
  <tr bgcolor="#cccccc"><td colspan="2">Final/Culminating</td><td align="right">30%</td><td align="right">0%</td></tr>
</table>
</body></html>`;

const evals = await post("/evals", reportHtml);
console.log("evals =", JSON.stringify(evals, null, 2));

// 6 category rows; legend / Term / Course / Analysis-Trends rows all skipped.
assert.strictEqual(evals.length, 6, "should parse 6 category rows");

const ku = evals.find((e) => e.category === "Knowledge/Understanding");
assert.strictEqual(ku.weight, 20, "KU weighting 20");
assert.strictEqual(ku.percent, 85, "KU achievement 85 (last % in the row)");
assert.strictEqual(ku.name, "Knowledge/Understanding", "name from first cell");

const fin = evals.find((e) => e.category === "Final");
assert.strictEqual(fin.weight, 30, "Final weighting 30");
assert.strictEqual(fin.percent, 0, "Final achievement 0");

assert.ok(
  evals.every((e) => e.percent != null && typeof e.percent === "number"),
  "every category row has a numeric percent"
);
assert.ok(
  !evals.some((e) => /term|course/i.test(e.name)),
  "Term/Course mark rows are not treated as categories"
);

await mf.dispose();
console.log("\n✅ All parser assertions passed.");
