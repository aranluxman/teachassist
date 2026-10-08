import { readStudentData, writeStudentData } from './student-store.js';

export function readHistory(source) {
  const rows = readStudentData(`history:${source}`, []);
  return Array.isArray(rows) ? rows.filter(s => s && Number.isFinite(Date.parse(s.date)) && s.marks && typeof s.marks === 'object').slice(-60) : [];
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
