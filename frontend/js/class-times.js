// ============================================================================
// Class times, course edits and Google Calendar links
// ----------------------------------------------------------------------------
// TeachAssist only says which period a course is in (P1–P4). The clock time
// comes from the school's bell times (Guidance → My school, "8:45 AM - 3:05
// PM"): a YRDSB secondary day is four periods with lunch after period 2 and
// five minutes between classes. Anything the estimate gets wrong, the student
// fixes in Manage Courses; those edits (name, room, start, end) are stored per
// account in this browser and win over the estimate everywhere.
// ============================================================================

import { readStudentData, writeStudentData } from "./student-store.js";

const STORE = "course-overrides";
const PASSING = 5; // minutes between classes
const PERIODS = 4;
// Used until the student picks a school in Guidance.
export const DEFAULT_BELL_TIMES = "8:45 AM - 3:05 PM";

// ── Course edits ──
function readAll() {
  try {
    const all = readStudentData(STORE, {});
    return all && typeof all === "object" ? all : {};
  } catch {
    return {}; // no localStorage (tests, private mode)
  }
}
/** The student's edits for one course code ("SNC2D1-8"): { name, room, start, end }. */
export function courseOverride(code) {
  return readAll()[String(code || "").toUpperCase()] || {};
}
/** Merge edits for one course; empty strings remove a field. */
export function saveCourseOverride(code, patch) {
  const key = String(code || "").toUpperCase();
  if (!key) return;
  const all = readAll();
  const next = { ...all[key], ...patch };
  for (const k of Object.keys(next)) if (!String(next[k] ?? "").trim()) delete next[k];
  if (Object.keys(next).length) all[key] = next;
  else delete all[key];
  try {
    writeStudentData(STORE, all);
  } catch {
    /* storage full or blocked: edits just don't persist */
  }
}

// ── Times ──
/** "8:45 AM" / "13:05" → minutes after midnight, or null. */
export function parseClock(text) {
  const m = /(\d{1,2}):(\d{2})\s*([ap])?\.?\s*m?\.?/i.exec(String(text || ""));
  if (!m) return null;
  let h = +m[1];
  const min = +m[2];
  if (h > 23 || min > 59) return null;
  const ap = (m[3] || "").toLowerCase();
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  return h * 60 + min;
}
/** 525 → "08:45" (the value an <input type="time"> takes). */
export function toInputTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
/** 525 → "8:45" (the label; AM/PM is obvious for a school day). */
export function fmtClock(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
}

/**
 * The four periods' { start, end } (minutes) for a school day like
 * "8:45 AM - 3:05 PM". Periods are 75 minutes when that leaves a 35–80 minute
 * lunch; otherwise they share what's left after a 55 minute lunch.
 */
export function periodTimes(bellTimes = DEFAULT_BELL_TIMES) {
  const [a, b] = String(bellTimes || "").split(/\s[-–~]\s|\sto\s/i);
  let start = parseClock(a);
  let end = parseClock(b);
  if (start == null || end == null || end - start < 240) {
    [start, end] = String(DEFAULT_BELL_TIMES).split(" - ").map(parseClock);
  }
  const day = end - start;
  let length = 75;
  let lunch = day - PERIODS * length - 2 * PASSING;
  if (lunch < 35 || lunch > 80) {
    lunch = 55;
    length = Math.floor((day - lunch - 2 * PASSING) / PERIODS);
  }
  const out = [];
  let t = start;
  for (let i = 0; i < PERIODS; i++) {
    out.push({ start: t, end: t + length });
    t += length + (i === 1 ? lunch : PASSING);
  }
  out[PERIODS - 1].end = end; // the last bell is the day's end
  return out;
}

/**
 * A course's class time: { start, end, estimated } in minutes, or null when
 * the period is unknown and nothing was entered.
 */
export function classTime(code, period, bellTimes) {
  const o = courseOverride(code);
  const n = parseInt(String(period || "").replace(/\D/g, ""), 10);
  const est = n >= 1 && n <= PERIODS ? periodTimes(bellTimes)[n - 1] : null;
  const start = parseClock(o.start) ?? est?.start;
  const end = parseClock(o.end) ?? est?.end;
  if (start == null || end == null || end <= start) return null;
  return { start, end, estimated: !(o.start && o.end) };
}

// ── Google Calendar ──
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const stamp = (d, minutes) => `${ymd(d)}T${toInputTime(minutes).replace(":", "")}00`;

/**
 * When the class repeats from and until. Known term dates win; otherwise the
 * Ontario semester we're in (Feb–Jun, or Sep–Jan) starting today.
 */
export function classRange(term, now = new Date()) {
  let first;
  let last;
  if (term) {
    first = new Date(term.start);
    first = new Date(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
    last = new Date(term.end);
    last = new Date(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
  } else {
    first = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const m = now.getMonth(); // 0 = Jan
    last = m >= 1 && m <= 5 ? new Date(now.getFullYear(), 5, 26) : new Date(now.getFullYear() + (m >= 6 ? 1 : 0), 0, 31);
  }
  // School days only: roll a weekend start forward to Monday.
  while (first.getDay() === 0 || first.getDay() === 6) first.setDate(first.getDate() + 1);
  return { first, last };
}

/** A Google Calendar "add event" link for a class repeating every school day. */
export function googleCalendarUrl({ title, room = "", details = "", start, end, term = null, now = new Date() }) {
  const { first, last } = classRange(term, now);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${stamp(first, start)}/${stamp(first, end)}`,
    ctz: "America/Toronto",
    recur: `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=${ymd(last)}T235959Z`,
  });
  if (room) params.set("location", room);
  if (details) params.set("details", details);
  return `https://calendar.google.com/calendar/render?${params}`;
}
