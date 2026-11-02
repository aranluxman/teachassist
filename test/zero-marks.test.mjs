import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { realMark, readHistory, recordSnapshot, snapshotChanges } from '../frontend/js/history.js';
import { displayMark, markKind, overallAverage, lastRealMarks } from '../frontend/js/ta-client.js';

beforeEach(() => {
  const storage = new Map();
  globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k),
    get length() { return storage.size; }, key: i => [...storage.keys()][i] ?? null };
  localStorage.setItem('ta_student_number', '111');
});

// The dashboard from the bug report: History came back as 0.0% and pulled
// the overall average down to 64.3%.
const dashboard = [
  { code: 'SNC2D1', currentMark: 94.7, midterm: null },
  { code: 'FIF2DF', currentMark: null, midterm: null },
  { code: 'TDJ2O1', currentMark: 98.3, midterm: null },
  { code: 'CHC2DF', currentMark: 0, midterm: null },
];

test('a 0% from TeachAssist is not a real mark', () => {
  assert.equal(realMark(0), null);
  assert.equal(realMark(null), null);
  assert.equal(realMark(NaN), null);
  assert.equal(realMark(0.5), 0.5, 'a tiny real mark is still a mark');
  assert.equal(displayMark({ currentMark: 0, midterm: null }), null, 'shows as "No Mark"');
  assert.equal(displayMark({ currentMark: 0, midterm: 82 }), 82, 'falls through to the midterm');
  assert.equal(markKind({ currentMark: 0, midterm: 82 }), 'midterm');
  assert.equal(markKind({ currentMark: 0, midterm: 0 }), '');
});

test('a 0% no longer drags the overall average down', () => {
  assert.equal(overallAverage(dashboard), (94.7 + 98.3) / 2, '96.5%, not 64.3%');
  assert.equal(overallAverage([{ currentMark: 0 }]), null, 'all zeros means no average at all');
});

test('a 0% shows the last real mark this device saw, labelled as saved', () => {
  const history = [
    { date: '2026-10-01T09:00:00Z', marks: { SNC2D1: 93, CHC2DF: 84 }, overall: 88.5 },
    { date: '2026-10-08T09:00:00Z', marks: { SNC2D1: 94.7, CHC2DF: 86.2 }, overall: 90.45 },
    { date: '2026-10-15T09:00:00Z', marks: { SNC2D1: 94.7, CHC2DF: 0 }, overall: 47.35 },
  ];
  const courses = lastRealMarks(dashboard, history);
  const chc = courses.find((c) => c.code === 'CHC2DF');
  assert.equal(chc.currentMark, 86.2, 'skips the 0% and uses the latest real mark');
  assert.equal(chc.saved, true, 'card says "Last saved mark"');
  assert.equal(courses.find((c) => c.code === 'FIF2DF').currentMark, null, 'a course never marked stays "No Mark"');
  assert.equal(courses.find((c) => c.code === 'SNC2D1'), dashboard[0], 'live marks are left alone');
  assert.equal(lastRealMarks(dashboard, []).find((c) => c.code === 'CHC2DF').currentMark, 0, 'no history: displayMark still treats it as No Mark');
  assert.equal(displayMark(lastRealMarks(dashboard, []).find((c) => c.code === 'CHC2DF')), null);
});

test('old 0% snapshots are cleaned out of the chart and the inbox', () => {
  localStorage.setItem('ta-tools:111:history:srv', JSON.stringify([
    { date: '2026-10-08T09:00:00Z', marks: { SNC2D1: 94.7, CHC2DF: 86 }, overall: 90.35 },
    { date: '2026-10-15T09:00:00Z', marks: { SNC2D1: 94.7, CHC2DF: 0 }, overall: 47.35 },
  ]));
  const [before, zeroDay] = readHistory('srv');
  assert.equal(before.overall, 90.35, 'clean days are untouched');
  assert.equal(zeroDay.marks.CHC2DF, null, 'the 0% becomes "no mark"');
  assert.equal(zeroDay.overall, 94.7, "that day's average is recomputed without it");
  const alerts = snapshotChanges(before, zeroDay);
  assert.deepEqual(alerts.map((a) => a.kind), ['unavailable'], 'no "86% → 0%" drop alert');
  // Recording the next refresh does not resurrect the zero.
  recordSnapshot('srv', { date: '2026-10-22T09:00:00Z', marks: { SNC2D1: 95, CHC2DF: 86 }, overall: 90.5 });
  assert.ok(readHistory('srv').every((s) => !Object.values(s.marks).includes(0)));
});
