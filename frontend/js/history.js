import { readStudentData, writeStudentData } from './student-store.js';

/**
 * TeachAssist shows 0% when a teacher enters a placeholder or nothing is
 * graded yet; it is never a real course average. A real mark is above 0,
 * anything else is "no mark" (null) and stays out of every average.
 */
export const realMark = (n) => (Number.isFinite(n) && n > 0 ? n : null);

/** Older snapshots may hold a 0%: drop it and recompute that day's average. */
function withoutZeroMarks(s) {
  const marks = Object.values(s.marks);
  if (!marks.includes(0) && s.overall !== 0) return s;
  const clean = Object.fromEntries(Object.entries(s.marks).map(([code, m]) => [code, realMark(m)]));
  const real = Object.values(clean).filter((m) => m != null);
  return { ...s, marks: clean, overall: real.length ? real.reduce((a, b) => a + b, 0) / real.length : null };
}

export function readHistory(source) {
  const rows = readStudentData(`history:${source}`, []);
  return Array.isArray(rows) ? rows.filter(s => s && Number.isFinite(Date.parse(s.date)) && s.marks && typeof s.marks === 'object').slice(-60).map(withoutZeroMarks) : [];
}
export function snapshotChanges(previous, current) {
  if (!previous) return [];
  return Object.entries(current.marks).flatMap(([code, mark]) => {
    if (!Object.hasOwn(previous.marks, code)) return [];
    const before = previous.marks[code];
    if (Number.isFinite(before) && mark === null) return [{ code, kind: 'unavailable', before, mark }];
    if (Number.isFinite(mark) && (before === null || (Number.isFinite(before) && Math.abs(mark - before) >= 0.05)))
      return [{ code, kind: 'changed', before, mark }];
    return [];
  });
}
export function recordSnapshot(source, snapshot) {
  const history = readHistory(source);
  const previous = history.at(-1);
  // Ignore older server caches; they must not look like a new grade change.
  if (previous && Date.parse(snapshot.date) < Date.parse(previous.date)) return { previous, current: previous, changes: [], stale: true };
  const changes = snapshotChanges(previous, snapshot);
  if (!previous || previous.date !== snapshot.date || JSON.stringify(previous.marks) !== JSON.stringify(snapshot.marks)) {
    history.push(snapshot);
    writeStudentData(`history:${source}`, history.slice(-60));
  }
  return { previous, current: snapshot, changes, stale: false };
}
