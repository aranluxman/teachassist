import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const storage = new Map();
globalThis.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };

const { courseName, courseMeta, parseCourseCode } = await import("../frontend/js/course-names.js");
const { parseRoute, routeHash } = await import("../frontend/js/router.js");
const { RESOURCES } = await import("../frontend/js/guidance.js");
const { answer, findCourse } = await import("../frontend/js/assistant-brain.js");
const { ossdProgress, saveOssd } = await import("../frontend/js/ossd.js");
const { achievementLevel, letterGrade, courseTitle } = await import("../frontend/js/courses.js");
const { DEMO_COURSES } = await import("../frontend/js/demo-data.js");

const schools = JSON.parse(readFileSync(new URL("../frontend/data/schools.json", import.meta.url), "utf8")).schools;

test("course codes become readable names", () => {
  assert.equal(courseName("MTH1W1"), "Mathematics");
  assert.equal(courseName("ENL1W-01"), "English");
  assert.equal(courseName("SNC2D1-8"), "Science");
  assert.equal(courseName("MCR3U7"), "Functions");
  assert.equal(courseName("ICS4U1"), "Computer Science");
  assert.equal(courseName("FIF2DF-3"), "French Immersion Language");
  assert.equal(courseName("CHW3M1"), "World History to the End of the 15th Century");
  assert.equal(courseName("SPH3U1"), "Physics");
  assert.equal(courseName("ZZZ"), "");
  assert.equal(courseMeta("MTH1W1"), "Grade 9 · De-streamed");
  assert.equal(courseMeta("MHF4U1"), "Grade 12 · University");
  assert.equal(parseCourseCode("not a code"), null);
  assert.equal(courseTitle({ code: "PPL1O-02" }), "Healthy Active Living");
});

test("overall mark shows its Ontario level and letter grade", () => {
  assert.equal(achievementLevel(90), "Level 4");
  assert.equal(achievementLevel(79.9), "Level 3");
  assert.equal(achievementLevel(45), "Below Level 1");
  assert.equal(letterGrade(92), "A+");
  assert.equal(letterGrade(81), "A−");
  assert.equal(letterGrade(40), "R");
});

test("hash routes map to screens and survive bad input", () => {
  assert.deepEqual(parseRoute("#course/MTH1W"), { screen: "course", arg: "MTH1W" });
  assert.deepEqual(parseRoute("#guidance/map"), { screen: "guidance", arg: "map" });
  assert.deepEqual(parseRoute("#guidance/volunteer"), { screen: "guidance", arg: "volunteer" });
  assert.deepEqual(parseRoute("#guidance/nope"), { screen: "guidance", arg: "" });
  assert.deepEqual(parseRoute("#course"), { screen: "courses", arg: "" });
  assert.deepEqual(parseRoute(""), { screen: "courses", arg: "" });
  assert.deepEqual(parseRoute("#settings/extra"), { screen: "settings", arg: "" });
  assert.deepEqual(parseRoute("#<script>"), { screen: "courses", arg: "" });
  assert.equal(routeHash("course", "SNC2D1"), "#course/SNC2D1");
});

test("school data covers every YRDSB school with a pin and official links", () => {
  assert.ok(schools.length >= 200, `${schools.length} schools`);
  assert.ok(schools.filter((s) => s.kind === "secondary").length >= 30);
  const ids = new Set();
  for (const s of schools) {
    assert.ok(s.name && s.id, "name + id");
    assert.ok(!ids.has(s.id), `unique id ${s.id}`);
    ids.add(s.id);
    // York Region bounding box.
    assert.ok(s.lat > 43.7 && s.lat < 44.5 && s.lng > -80.0 && s.lng < -79.0, `${s.name} pin in York Region`);
    if (s.boundary) assert.match(s.boundary, /^https:\/\/schoollocator\.yrdsb\.ca\/.+\.pdf$/);
    if (s.website) assert.match(s.website, /^https:\/\//);
  }
  assert.ok(schools.filter((s) => s.boundary).length >= schools.length - 5);
  const buroak = schools.find((s) => s.name === "Bur Oak S.S.");
  assert.equal(buroak.kind, "secondary");
  assert.ok(buroak.bellTimes && buroak.principal);
});

test("guidance links are https and none of the dead YRDSB paths remain", () => {
  const dead = [
    "/schools-programs/community-involvement-hours",
    "/schools-programs/continuing-education",
    "/student-support/guidance-student-services",
    "/student-support/mental-health-wellbeing",
  ];
  const items = RESOURCES.flatMap((g) => g.items);
  assert.ok(items.length >= 12);
  for (const item of items) {
    assert.match(item.url, /^https:\/\//);
    assert.ok(item.kind, `${item.label} has an icon type`);
    for (const d of dead) assert.ok(!item.url.endsWith(d), `${item.url} is a dead link`);
  }
});

test("assistant answers from the student's own marks, school and diploma data", () => {
  const school = schools.find((s) => s.name === "Bur Oak S.S.");
  const ctx = { courses: DEMO_COURSES, school, ossd: ossdProgress(DEMO_COURSES), volunteerHours: 10 };
  assert.match(answer("What do I need on the math final to get 90?", ctx).text, /need 87\.\d% on the remaining 30%/);
  assert.match(answer("what do i need on the english exam worth 20% to get 95", ctx).text, /not reachable/);
  assert.match(answer("If I get 75 on the next science test?", ctx).text, /Science goes from 93\.4% to about/);
  assert.match(answer("Make me a study plan", ctx).text, /Core French/);
  assert.match(answer("What's my lowest course?", ctx).text, /Core French/);
  assert.match(answer("What are my bell times?", ctx).text, /8:15 AM - 2:55 PM/);
  assert.match(answer("how many volunteer hours do I have left", ctx).text, /30 to go/);
  assert.match(answer("How many credits do I still need?", ctx).text, /of 30 credits/);
  assert.equal(answer("What are my bell times?", { ...ctx, school: null }).actions[0].route, "guidance/map");
  assert.equal(answer("hello", ctx), null);
  assert.equal(answer("sqrt(144)", ctx), null); // left to the calculator
  assert.equal(courseTitle(findCourse("my geography test", DEMO_COURSES)), "Exploring Canadian Geography");
});

test("diploma tracker fills compulsory slots from passing courses", () => {
  localStorage.setItem("ta_demo_mode", "1");
  const p = ossdProgress(DEMO_COURSES);
  assert.equal(p.credits, 8);
  const slot = (id) => p.slots.find((s) => s.id === id);
  assert.equal(slot("geography").status, "on-track");
  assert.equal(slot("english").status, "partial");
  assert.equal(slot("history").status, "todo");
  saveOssd({ prior: 4, done: { history: true } });
  const q = ossdProgress(DEMO_COURSES);
  assert.equal(q.credits, 12);
  assert.equal(q.slots.find((s) => s.id === "history").status, "done");
  // A failing course doesn't count.
  assert.equal(ossdProgress([{ code: "MTH1W-01", currentMark: 42 }]).credits, 4);
});
