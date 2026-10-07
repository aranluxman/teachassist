// ============================================================================
// Semester / term filtering
// ----------------------------------------------------------------------------
// TeachAssist lists every course on the timetable for the whole year, so a
// student taking four courses a semester sees eight on the dashboard. Each
// scraped row carries its own date range, which the Worker packs into `name`:
//
//   "SNC2D1-8 : Science Block: P1 - rm. 302 2026-09-08 ~ 2027-02-02"
//
// Reading that range is enough to tell which courses are running today, so the
// dashboard can quietly drop the ones that are not. Nothing is stored and no
// course is ever edited — this only decides what gets displayed, and the other
// semester reappears on its own the day it starts.
// ============================================================================

/** A "YYYY-MM-DD ~ YYYY-MM-DD" span anywhere in the row text. */
const TERM_RANGE = /(\d{4})-(\d{2})-(\d{2})\s*~\s*(\d{4})-(\d{2})-(\d{2})/;

/** Midnight (local date, compared as UTC) so a term's last day still counts. */
function dayOf(value) {
  const d = new Date(value);
  if (isNaN(d)) return null;
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * The course's term as { start, end } timestamps, or null when the scrape
 * carries no date range (the bundled demo snapshot, for one).
 */
export function courseTerm(course) {
  const text = [course?.name, course?.term, course?.dates, course?.code]
    .filter(Boolean)
    .join(" ");
  const m = TERM_RANGE.exec(text);
  if (!m) return null;
  const start = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const end = Date.UTC(+m[4], +m[5] - 1, +m[6]);
  if (!isFinite(start) || !isFinite(end) || end < start) return null;
  return { start, end };
}

/**
 * Is this course running right now?
 *   true  — today falls inside its term
 *   false — the term has ended, or has not started yet
 *   null  — no date range to judge by
 * Callers treat null as "show it": a course we cannot classify is never hidden.
 */
export function isCurrentCourse(course, now = Date.now()) {
  const term = courseTerm(course);
  if (!term) return null;
  const today = dayOf(now);
  if (today == null) return null;
  return today >= term.start && today <= term.end;
}

/**
 * Split a course list into what is running now and what belongs to another
 * term. If nothing looks current — a changed scrape, an odd date format, or
 * the gap between semesters — everything is returned as current, because an
 * empty dashboard is far worse than a crowded one.
 */
export function splitByTerm(courses, now = Date.now()) {
  const list = Array.isArray(courses) ? courses : [];
  const current = [];
  const other = [];
  for (const course of list) {
    if (isCurrentCourse(course, now) === false) other.push(course);
    else current.push(course);
  }
  if (!current.length) return { current: list, other: [] };
  return { current, other };
}

/** A short label for the term a course belongs to, e.g. "Sep – Feb". */
export function termLabel(course) {
  const term = courseTerm(course);
  if (!term) return "";
  const month = (ts) =>
    new Date(ts).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
  return `${month(term.start)} – ${month(term.end)}`;
}
