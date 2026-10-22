import assert from "node:assert/strict";
import { test } from "node:test";

import { classRange, classTime, fmtClock, googleCalendarUrl, parseClock, periodTimes, toInputTime } from "../frontend/js/class-times.js";

const clock = (t) => `${fmtClock(t.start)}-${fmtClock(t.end)}`;

test("parseClock reads 12- and 24-hour times", () => {
  assert.equal(parseClock("8:45 AM"), 525);
  assert.equal(parseClock("3:05 PM"), 905);
  assert.equal(parseClock("12:10 PM"), 730);
  assert.equal(parseClock("12:00 a.m."), 0);
  assert.equal(parseClock("13:50"), 830);
  assert.equal(parseClock("nope"), null);
  assert.equal(toInputTime(525), "08:45");
  assert.equal(fmtClock(830), "1:50");
});

test("periodTimes: four 75-minute periods, lunch after period 2", () => {
  const p = periodTimes("8:45 AM - 3:05 PM");
  assert.deepEqual(p.map(clock), ["8:45-10:00", "10:05-11:20", "12:30-1:45", "1:50-3:05"]);
  // Every YRDSB day in schools.json is 380–390 minutes; all fit the same shape.
  for (const day of ["8:05 AM - 2:35 PM", "8:30 AM - 3:10 PM", "9:10 AM - 3:40 PM"]) {
    const q = periodTimes(day);
    assert.equal(q.length, 4);
    assert.ok(q.every((x) => x.end > x.start), day);
    assert.equal(q[0].start, parseClock(day.split(" - ")[0]));
    assert.equal(q[3].end, parseClock(day.split(" - ")[1]));
  }
});

test("periodTimes falls back to a typical day on bad input", () => {
  assert.deepEqual(periodTimes("").map(clock), periodTimes("8:45 AM - 3:05 PM").map(clock));
  assert.deepEqual(periodTimes("9:00 AM - 10:00 AM").map(clock), periodTimes().map(clock));
});

test("classTime estimates from the period (no edits stored)", () => {
  const t = classTime("SNC2D1-8", "P3", "8:45 AM - 3:05 PM");
  assert.equal(clock(t), "12:30-1:45");
  assert.equal(t.estimated, true);
  assert.equal(classTime("SNC2D1-8", "", "8:45 AM - 3:05 PM"), null);
});

test("classRange uses the term's dates and skips weekends", () => {
  // 2026-09-05 is a Saturday → classes start Monday the 7th.
  const { first, last } = classRange({ start: Date.UTC(2026, 8, 5), end: Date.UTC(2027, 1, 2) });
  assert.equal(first.getDay(), 1);
  assert.equal(first.getDate(), 7);
  assert.equal(last.getMonth(), 1);
  assert.equal(last.getDate(), 2);
});

test("classRange without dates runs to the end of the current semester", () => {
  assert.equal(classRange(null, new Date(2026, 9, 22)).last.toDateString(), new Date(2027, 0, 31).toDateString());
  assert.equal(classRange(null, new Date(2027, 2, 3)).last.toDateString(), new Date(2027, 5, 26).toDateString());
});

test("googleCalendarUrl builds a weekday-repeating event", () => {
  const url = new URL(
    googleCalendarUrl({
      title: "Science (SNC2D1-8)",
      room: "Room 302",
      start: 525,
      end: 600,
      term: { start: Date.UTC(2026, 8, 8), end: Date.UTC(2027, 1, 2) },
    }),
  );
  assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("text"), "Science (SNC2D1-8)");
  assert.equal(url.searchParams.get("dates"), "20260908T084500/20260908T100000");
  assert.equal(url.searchParams.get("ctz"), "America/Toronto");
  assert.equal(url.searchParams.get("location"), "Room 302");
  assert.equal(url.searchParams.get("recur"), "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20270202T235959Z");
});
