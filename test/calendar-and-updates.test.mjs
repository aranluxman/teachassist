import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
beforeEach(() => {
  const m = new Map();
  globalThis.localStorage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null };
  localStorage.setItem("ta_demo_mode", "1"); // device-only: no network in tests
});

// ── Recent updates: why a mark changed ──────────────────────────────────────
test("assessments diff into added, removed and re-marked reasons", async () => {
  const { courseItems, diffItems } = await import("../frontend/js/history.js");
  const before = courseItems({ evaluations: [
    { name: "Unit 1 Test", category: "K/U", percent: 80, weight: 10, date: "2026-10-01" },
    { name: "Lab Report", category: "Application", percent: 70, weight: 5 },
    { name: "Quiz", percent: 60, weight: 2 },
  ] });
  const after = courseItems({ evaluations: [
    { name: "Unit 1 Test", category: "K/U", percent: 80, weight: 10, date: "2026-10-01" },
    { name: "Lab Report", category: "Application", percent: 85, weight: 5 },
    { name: "Unit 2 Test", category: "Thinking", percent: 92, weight: 10 },
  ] });
  const d = diffItems(before, after);
  assert.deepEqual(d.map((r) => [r.type, r.name]).sort(), [["added", "Unit 2 Test"], ["changed", "Lab Report"], ["removed", "Quiz"]]);
  const lab = d.find((r) => r.name === "Lab Report");
  assert.equal(lab.before, 70);
  assert.equal(lab.after, 85);
});

test("no explanation is invented without an earlier list, or when TeachAssist returned none", async () => {
  const { diffItems } = await import("../frontend/js/history.js");
  assert.equal(diffItems(undefined, [{ k: "a", n: "A", p: 1 }]), null);
  assert.equal(diffItems([{ k: "a", n: "A", p: 1 }], []), null);
});

test("strand-only assessments use their strand average, and duplicates stay distinct", async () => {
  const { courseItems } = await import("../frontend/js/history.js");
  const items = courseItems({ evaluations: [
    { name: "Essay", strands: [{ percent: 80 }, { percent: 90 }] },
    { name: "Quiz", percent: 50 },
    { name: "Quiz", percent: 70 },
  ] });
  assert.equal(items[0].p, 85);
  assert.notEqual(items[1].k, items[2].k);
});

test("a reason's pull follows the score versus the mark before", async () => {
  const { reasonPull } = await import("../frontend/js/history.js");
  assert.equal(reasonPull({ type: "added", after: 95 }, 80), "up");
  assert.equal(reasonPull({ type: "added", after: 60 }, 80), "down");
  assert.equal(reasonPull({ type: "removed", before: 60 }, 80), "up");
  assert.equal(reasonPull({ type: "changed", before: 70, after: 60 }, 80), "down");
  assert.equal(reasonPull({ type: "added", after: 80 }, 80), "none");
});

test("updates explain the change, and list a course whose mark didn't move", async () => {
  const { updatesBetween } = await import("../frontend/js/ta-client.js");
  const prev = { overall: 80, marks: { MTH: 80, ENG: 80 }, items: {
    MTH: [{ k: "t1|", n: "Test 1", c: "", p: 80, w: 10 }],
    ENG: [{ k: "e1|", n: "Essay", c: "", p: 80, w: 10 }],
  } };
  const cur = { overall: 81, marks: { MTH: 82, ENG: 80 }, items: {
    MTH: [{ k: "t1|", n: "Test 1", c: "", p: 80, w: 10 }, { k: "t2|", n: "Test 2", c: "", p: 95, w: 10 }],
    ENG: [{ k: "e1|", n: "Essay", c: "", p: 80, w: 10 }, { k: "q|", n: "Quiz", c: "", p: 80, w: 2 }],
  } };
  const u = updatesBetween(prev, cur);
  const overall = u.find((x) => x.overall);
  assert.deepEqual(overall.courses.map((c) => c.code), ["MTH"]);
  const mth = u.find((x) => x.label === "MTH");
  assert.equal(mth.reasons[0].name, "Test 2");
  assert.equal(mth.reasons[0].pull, "up");
  const eng = u.find((x) => x.label === "ENG");
  assert.ok(eng, "a new assessment shows even when the mark stayed the same");
  assert.equal(eng.from, eng.to);
  assert.equal(eng.reasons[0].name, "Quiz");
});

test("a snapshot with only new assessments is still recorded; old ones drop their lists", async () => {
  const { recordSnapshot, readHistory } = await import("../frontend/js/history.js");
  const base = (d, items) => ({ date: d, overall: 80, marks: { MTH: 80 }, items: { MTH: items } });
  recordSnapshot("t", base("2026-11-01T00:00:00Z", []));
  recordSnapshot("t", base("2026-11-01T00:00:00Z", [{ k: "a", n: "A", p: 80 }]));
  for (let i = 2; i < 6; i++) recordSnapshot("t", base(`2026-11-0${i}T00:00:00Z`, [{ k: "a", n: "A", p: 80 }, { k: `x${i}`, n: "X", p: 80 }]));
  const h = readHistory("t");
  assert.equal(h.length, 6);
  assert.equal(h.filter((s) => s.items).length, 3);
});

// ── Calendar ────────────────────────────────────────────────────────────────
test("events save, sort soonest first, and delete as tombstones", async () => {
  const { saveEvent, listEvents, deleteEvent, getEvent, readCalendar } = await import("../frontend/js/calendar-store.js");
  const a = saveEvent({ title: "Math Test", type: "test", date: "2026-11-25" });
  const b = saveEvent({ title: "Bio Test", type: "test", date: "2026-11-09", time: "09:00" });
  assert.ok(a.id.startsWith("cal-"));
  assert.deepEqual(listEvents().map((e) => e.title), ["Bio Test", "Math Test"]);
  assert.equal(saveEvent({ title: "", date: "2026-11-01" }), null);
  assert.equal(saveEvent({ title: "x", date: "2026-02-30" }), null);
  deleteEvent(b.id);
  assert.equal(getEvent(b.id), null);
  assert.equal(readCalendar().events[b.id].deleted, true);
  assert.deepEqual(listEvents({ types: ["test"] }).map((e) => e.title), ["Math Test"]);
});

test("events round-trip through the Notes backup and the newer edit wins", async () => {
  const { eventToNote, noteToEvent, mergeRemoteEvents, CALENDAR_NOTEBOOK } = await import("../frontend/js/calendar-store.js");
  const e = { id: "cal-abc12345", title: "Project Due", type: "project", date: "2026-11-27", time: "", course: "ENG", notes: "x", done: false, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-02T00:00:00Z" };
  const note = eventToNote(e);
  assert.equal(note.notebook, CALENDAR_NOTEBOOK);
  assert.equal(noteToEvent(note).date, "2026-11-27");
  assert.equal(noteToEvent({ ...note, id: "a-real-note-id" }), null, "a notebook named like the calendar is still notes");
  const local = { events: { [e.id]: { ...e, title: "Local newer", updatedAt: "2026-11-05T00:00:00Z" } }, dirty: [] };
  const merged = mergeRemoteEvents(local, [note, { ...note, id: "cal-zzz99999", title: "Cloud only" }]);
  assert.equal(merged.events[e.id].title, "Local newer");
  assert.ok(merged.dirty.includes(e.id));
  assert.equal(merged.events["cal-zzz99999"].title, "Cloud only");
});

test("Notes ignores calendar events from the shared backup", async () => {
  const { mergeRemote } = await import("../frontend/js/notes-store.js");
  const m = mergeRemote({ notebooks: null, notes: {}, dirty: [] }, { notes: [
    { id: "cal-abc12345", notebook: "ta-calendar", title: "Test", updatedAt: "2026-11-01T00:00:00Z" },
    { id: "note-1234abcd", notebook: "ta-calendar", title: "My note", updatedAt: "2026-11-01T00:00:00Z" },
  ] });
  assert.deepEqual(Object.keys(m.notes), ["note-1234abcd"]);
});

test("reminders: 1 week, 3 days and 1 day before, once each, never for done items", async () => {
  const { saveEvent, dueReminders, markNotified } = await import("../frontend/js/calendar-store.js");
  const now = new Date(2026, 10, 13, 12); // Fri Nov 13
  const t = saveEvent({ title: "Chem Test", type: "test", date: "2026-11-17" }); // 4 days
  saveEvent({ title: "Done one", type: "assignment", date: "2026-11-14", done: true });
  let due = dueReminders(now);
  assert.equal(due.length, 1);
  assert.equal(due[0].days, 4);
  assert.deepEqual(due[0].leads, [7]);
  markNotified(t.id, due[0].leads);
  assert.equal(dueReminders(now).length, 0, "not twice");
  due = dueReminders(new Date(2026, 10, 14, 9)); // 3 days left
  assert.deepEqual(due[0].leads, [7, 3]);
  assert.equal(dueReminders(now, { reminders: false, leads: { 7: true }, push: true }).length, 0);
});

test("days until and the words for it", async () => {
  const { daysUntil, whenText } = await import("../frontend/js/calendar-store.js");
  const now = new Date(2026, 10, 9, 23, 30);
  assert.equal(daysUntil("2026-11-09", now), 0);
  assert.equal(daysUntil("2026-11-17", now), 8);
  assert.equal(whenText(0), "Today");
  assert.equal(whenText(8), "In 8 days");
  assert.equal(whenText(-2), "2 days ago");
});

test("Calendar is wired in: route, Guidance button under Notes under GPA, styles, offline cache", () => {
  assert.match(read("frontend/js/router.js"), /"calendar"/);
  assert.match(read("frontend/js/app-main.js"), /arg === "calendar"\) return renderCalendar/);
  assert.match(read("frontend/js/guidance.js"), /gpaCard\(\), notesButton\(\), calendarButton\(\)/);
  assert.match(read("frontend/app.html"), /css\/calendar\.css/);
  assert.match(read("frontend/notifications-sw.js"), /css\/calendar\.css/);
  assert.match(read("frontend/js/notifications.js"), /checkCalendarReminders\(\);/);
});
