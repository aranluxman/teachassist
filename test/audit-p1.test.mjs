import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    clear: () => m.clear(), get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null };
};
beforeEach(() => {
  globalThis.localStorage = memory();
  globalThis.sessionStorage = memory();
});

test("a shared-computer sign-in keeps everything in this tab only", async () => {
  const { setSharedDevice, isSharedDevice, deviceStore } = await import("../frontend/js/device-store.js");
  const { writeStudentData, readStudentData, forgetStudentData } = await import("../frontend/js/student-store.js");
  assert.equal(deviceStore(), localStorage);
  setSharedDevice(true);
  assert.equal(isSharedDevice(), true);
  sessionStorage.setItem("ta_student_number", "555");
  writeStudentData("goals", { a: 1 });
  assert.deepEqual(readStudentData("goals", null), { a: 1 });
  assert.equal(localStorage.length, 0, "nothing written to the device");
  assert.ok(sessionStorage.getItem("ta-tools:555:goals"));
  forgetStudentData("555");
  assert.equal(sessionStorage.getItem("ta-tools:555:goals"), null);
  setSharedDevice(false);
  assert.equal(deviceStore(), localStorage);
});

test("sign-in explains itself and offers the shared-computer choice", () => {
  const html = read("frontend/index.html");
  assert.match(html, /id="shared-device"/);
  assert.match(html, /How your sign-in works/);
  assert.match(html, /Need help signing in\?/);
  assert.match(read("frontend/js/sign-in.js"), /setSharedDevice\(document\.getElementById\("shared-device"\)\.checked\)/);
  assert.match(read("frontend/js/ta-client.js"), /if \(isSharedDevice\(\)\) sessionStorage\.clear\(\);/);
});

test("marks appear at their real value at once (no count-up through other numbers)", () => {
  const motion = read("frontend/js/motion.js");
  const body = motion.slice(motion.indexOf("export function countUp"), motion.indexOf("// Previous on-screen values"));
  assert.doesNotMatch(body, /requestAnimationFrame/);
  assert.match(body, /format \? format\(to\)/);
});

test("courses come before the dream card; the header has Hide grades and a status row", () => {
  const courses = read("frontend/js/courses.js");
  assert.match(courses, /const place = \(card\) => footer\.before\(card\);/);
  assert.match(courses, /data-privacy aria-pressed=/);
  assert.match(courses, /"Demo data"/);
  assert.match(read("frontend/css/custom.css"), /"status status status"/);
});
