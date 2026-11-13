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

// ── Assessment-level snapshots: *why* a mark moved ──────────────────────────
// Each snapshot keeps a compact list of every course's posted assessments
// ({ k: key, n: name, c: category, p: percent, w: weight }). Comparing two
// lists shows what was added, removed or re-marked. Only the newest few
// snapshots keep these lists (see recordSnapshot), so storage stays small.

const round1 = (n) => Math.round(n * 10) / 10;
/** An assessment's percent: its own, else the average of its strands. */
function itemPercent(e) {
  if (Number.isFinite(e?.percent)) return e.percent;
  const strands = Array.isArray(e?.strands) ? e.strands.map((s) => s?.percent).filter(Number.isFinite) : [];
  return strands.length ? strands.reduce((a, b) => a + b, 0) / strands.length : null;
}
/** A course's assessments in compact form. Duplicate names get #2, #3… */
export function courseItems(course) {
  const seen = new Map();
  return (Array.isArray(course?.evaluations) ? course.evaluations : []).flatMap((e) => {
    const name = String(e?.name || "").trim().slice(0, 120);
    if (!name) return [];
    const base = `${name.toLowerCase()}|${e.date || ""}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const p = itemPercent(e);
    return [{ k: n > 1 ? `${base}#${n}` : base, n: name, c: String(e.category || "").slice(0, 40), p: p == null ? null : round1(p), w: Number.isFinite(e.weight) ? e.weight : null }];
  });
}

/**
 * What changed between two assessment lists, as reasons:
 * { type: "added" | "removed" | "changed", name, category, before, after, weightBefore, weightAfter }.
 * Returns null when it can't tell (no earlier list, or TeachAssist returned
 * none this time — a failed report, not every assessment deleted).
 */
export function diffItems(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after)) return null;
  if (before.length && !after.length) return null;
  const old = new Map(before.map((i) => [i.k, i]));
  const out = [];
  for (const i of after) {
    const o = old.get(i.k);
    old.delete(i.k);
    const base = { name: i.n, category: i.c, after: i.p, weightAfter: i.w };
    if (!o) out.push({ type: "added", ...base, before: null, weightBefore: null });
    else if ((o.p == null) !== (i.p == null) || (o.p != null && Math.abs(o.p - i.p) >= 0.05) || o.w !== i.w) {
      out.push({ type: "changed", ...base, before: o.p, weightBefore: o.w });
    }
  }
  for (const o of old.values()) out.push({ type: "removed", name: o.n, category: o.c, before: o.p, after: null, weightBefore: o.w, weightAfter: null });
  return out;
}

/**
 * How one reason pushed the course mark, compared with the mark before:
 * "up" (a score above your average was added, or a mark went up), "down",
 * or "none". An honest direction, not a made-up exact number — TeachAssist's
 * category weights decide the exact amount.
 */
export function reasonPull(reason, markBefore) {
  const { type, before, after } = reason;
  if (type === "changed") {
    if (before != null && after != null && Math.abs(after - before) >= 0.05) return after > before ? "up" : "down";
    if (reason.weightBefore !== reason.weightAfter && after != null && markBefore != null) {
      // More weight on a score above your average lifts it, and vice versa.
      const more = (reason.weightAfter ?? 0) > (reason.weightBefore ?? 0);
      return after === markBefore ? "none" : (after > markBefore) === more ? "up" : "down";
    }
    return "none";
  }
  const score = type === "added" ? after : before;
  if (score == null || markBefore == null || Math.abs(score - markBefore) < 0.05) return "none";
  // Adding a score above your average lifts it; removing one lowers it.
  return (score > markBefore) === (type === "added") ? "up" : "down";
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
  const itemsChanged = !!snapshot.items && JSON.stringify(previous?.items ?? null) !== JSON.stringify(snapshot.items);
  if (!previous || previous.date !== snapshot.date || JSON.stringify(previous.marks) !== JSON.stringify(snapshot.marks) || itemsChanged) {
    history.push(snapshot);
    // Only the newest 3 keep their assessment lists (enough to explain the
    // latest change); older days keep just their marks for the graph.
    const kept = history.slice(-60).map((s, i, all) => (i < all.length - 3 && s.items ? (({ items, ...rest }) => rest)(s) : s));
    writeStudentData(`history:${source}`, kept);
  }
  return { previous, current: snapshot, changes, stale: false };
}
