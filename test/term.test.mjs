import assert from "node:assert/strict";
import { test } from "node:test";

import { courseTerm, isCurrentCourse, splitByTerm } from "../frontend/js/term.js";
import { DEMO_COURSES } from "../frontend/js/demo-data.js";

// Rows shaped exactly like the Worker's scrape: the timetable line in `name`.
const sem1 = (code, title = "") => ({
  code,
  name: `${code} : ${title} Block: P1 - rm. 302 2026-09-08 ~ 2027-02-02`,
});
const sem2 = (code) => ({
  code,
  name: `${code} : Block: P4 - rm. 210 2027-02-03 ~ 2027-06-26`,
});
const OCT = Date.parse("2026-10-07T12:00:00");
const MAR = Date.parse("2027-03-15T12:00:00");

const timetable = [
  sem1("SNC2D1-8", "Science"),
  sem2("MPM2D1-5"),
  sem1("FIF2DF-3"),
  sem2("ENG2D1-4"),
  sem1("TDJ2O1-1"),
  sem2("CHV2O1-9"),
  sem1("CHC2DF-2", "Canadian History"),
  sem2("PPL2O1-7"),
];

test("reads the term dates out of the scraped timetable line", () => {
  const term = courseTerm(sem1("SNC2D1-8", "Science"));
  assert.equal(term.start, Date.UTC(2026, 8, 8));
  assert.equal(term.end, Date.UTC(2027, 1, 2));
  assert.equal(courseTerm({ code: "X", name: "English, Grade 9" }), null);
});

test("first semester shows only the four first-semester courses", () => {
  const { current, other } = splitByTerm(timetable, OCT);
  assert.deepEqual(
    current.map((c) => c.code),
    ["SNC2D1-8", "FIF2DF-3", "TDJ2O1-1", "CHC2DF-2"],
  );
  assert.equal(other.length, 4);
});

test("second semester swaps them automatically", () => {
  const { current } = splitByTerm(timetable, MAR);
  assert.deepEqual(
    current.map((c) => c.code),
    ["MPM2D1-5", "ENG2D1-4", "CHV2O1-9", "PPL2O1-7"],
  );
});

test("a term's first and last days both count", () => {
  assert.equal(isCurrentCourse(sem1("A"), Date.parse("2026-09-08T08:00:00")), true);
  assert.equal(isCurrentCourse(sem1("A"), Date.parse("2027-02-02T23:30:00")), true);
  assert.equal(isCurrentCourse(sem1("A"), Date.parse("2027-02-03T08:00:00")), false);
});

test("a course with no dates is never hidden", () => {
  const undated = { code: "X", name: "Course with no timetable line" };
  const { current } = splitByTerm([sem1("A"), sem2("B"), undated], OCT);
  assert.ok(current.includes(undated));
});

test("never empties the dashboard when nothing matches today", () => {
  // e.g. the summer gap, or a scrape whose dates no longer parse as expected
  const july = Date.parse("2027-07-20T12:00:00");
  const { current, other } = splitByTerm(timetable, july);
  assert.equal(current.length, timetable.length);
  assert.equal(other.length, 0);
});

test("the bundled demo snapshot is unaffected", () => {
  const { current } = splitByTerm(DEMO_COURSES, OCT);
  assert.equal(current.length, DEMO_COURSES.length);
});
