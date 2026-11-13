// ============================================================================
// Calendar & Test Planner: tests, assignments, projects and events.
// ----------------------------------------------------------------------------
// Saved on this device first (under the student's own key, so "Delete my
// data" and shared-computer sign-ins work like Notes), then backed up in the
// background through the Notes backup (/api/notes): each event travels as a
// note in the reserved "ta-calendar" notebook, with its details as JSON in
// the body. That gives events the same newest-edit-wins merge and delete
// tombstones as notes, with no extra database table. Demo mode stays local.
// ============================================================================

import { readStudentData, writeStudentData } from "./student-store.js";
import { request } from "./cloud-store.js";
import { isDemo } from "./ta-client.js";

/** The notebook id calendar events use in the Notes backup. Notes ignores it. */
export const CALENDAR_NOTEBOOK = "ta-calendar";

/** Event kinds, in the order the add form shows them. */
export const EVENT_TYPES = {
  test: { label: "Test", color: "#e11d48" },
  quiz: { label: "Quiz", color: "#8b5cf6" },
  assignment: { label: "Assignment", color: "#d97706" },
  project: { label: "Project", color: "#16a34a" },
  event: { label: "Event", color: "#2563eb" },
  noschool: { label: "No school", color: "#0d9488" },
};
export const typeOf = (t) => (Object.hasOwn(EVENT_TYPES, t) ? t : "event");

/** Reminder leads, in days before the date. */
export const REMINDER_LEADS = [7, 3, 1];
export const calendarSettingsDefaults = { reminders: true, leads: { 7: true, 3: true, 1: true }, push: true };
export function calendarSettings() {
  const s = readStudentData("calendar-settings", {});
  return { ...calendarSettingsDefaults, ...s, leads: { ...calendarSettingsDefaults.leads, ...(s?.leads || {}) } };
}
export function saveCalendarSettings(patch) {
  writeStudentData("calendar-settings", { ...calendarSettings(), ...patch });
}

const KEY = "calendar";
const emit = () => typeof window !== "undefined" && window.dispatchEvent(new CustomEvent("ta:calendar"));
const empty = () => ({ events: {}, dirty: [] });

export function readCalendar() {
  const s = readStudentData(KEY, null);
  if (!s || typeof s !== "object") return empty();
  return { events: s.events && typeof s.events === "object" ? s.events : {}, dirty: Array.isArray(s.dirty) ? s.dirty : [] };
}
const write = (s) => writeStudentData(KEY, s);

// ── Dates (always the student's local calendar day) ────────────────────────
const pad = (n) => String(n).padStart(2, "0");
/** "2026-11-09" for a Date, in local time. */
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** A local Date at midnight from "2026-11-09"; null when it isn't a date. */
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;
}
/** Whole days from `now`'s date to `day` (0 = today, negative = past). */
export function daysUntil(day, now = new Date()) {
  const d = parseDay(day);
  if (!d) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d - today) / 86400000);
}
/** "Today", "Tomorrow", "In 8 days", "Yesterday", "3 days ago". */
export function whenText(n) {
  if (n == null) return "";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

// ── Events ─────────────────────────────────────────────────────────────────
export function newEventId() {
  const r = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `cal-${r}`;
}

/** A clean event, or null when it has no title or no valid date. */
export function cleanEvent(e) {
  if (!e || typeof e !== "object") return null;
  const title = String(e.title || "").trim().slice(0, 120);
  if (!title || !parseDay(e.date)) return null;
  return {
    id: /^[A-Za-z0-9-]{8,64}$/.test(e.id || "") ? e.id : newEventId(),
    title,
    type: typeOf(e.type),
    date: e.date,
    time: /^\d{2}:\d{2}$/.test(e.time || "") ? e.time : "",
    course: String(e.course || "").slice(0, 40),
    notes: String(e.notes || "").slice(0, 1000),
    done: e.done === true,
  };
}

/** Live events, soonest first (then by time, then title). */
export function listEvents({ from = null, to = null, types = null } = {}) {
  return Object.values(readCalendar().events)
    .filter((e) => !e.deleted && (!from || e.date >= from) && (!to || e.date <= to) && (!types || types.includes(e.type)))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99").localeCompare(b.time || "99") || a.title.localeCompare(b.title));
}
export const getEvent = (id) => {
  const e = readCalendar().events[id];
  return e && !e.deleted ? e : null;
};

/** Create or update an event (stamps updatedAt) and queue its backup. Returns it, or null when invalid. */
export function saveEvent(input) {
  const clean = cleanEvent(input);
  if (!clean) return null;
  const s = readCalendar();
  const now = new Date().toISOString();
  const prev = s.events[clean.id];
  // A changed date or time earns fresh reminders.
  const keepNotified = prev && prev.date === clean.date && !prev.deleted;
  const next = { ...clean, notified: keepNotified ? prev.notified || {} : {}, deleted: false, createdAt: prev?.createdAt || now, updatedAt: now };
  s.events[clean.id] = next;
  if (!s.dirty.includes(clean.id)) s.dirty.push(clean.id);
  write(s);
  queueSync();
  emit();
  return next;
}

export function deleteEvent(id) {
  const s = readCalendar();
  if (!s.events[id]) return;
  s.events[id] = { ...s.events[id], notes: "", deleted: true, updatedAt: new Date().toISOString() };
  if (!s.dirty.includes(id)) s.dirty.push(id);
  write(s);
  queueSync();
  emit();
}

/** Remember which reminders went out (device-only; not backed up). */
export function markNotified(id, leads) {
  const s = readCalendar();
  const e = s.events[id];
  if (!e) return;
  e.notified = { ...(e.notified || {}), ...Object.fromEntries(leads.map((l) => [l, true])) };
  write(s);
}

// ── Backup through /api/notes ──────────────────────────────────────────────
/** An event as a note the Notes backup accepts. */
export function eventToNote(e) {
  return {
    id: e.id,
    notebook: CALENDAR_NOTEBOOK,
    title: e.title,
    body: e.deleted ? "" : JSON.stringify({ v: 1, type: e.type, date: e.date, time: e.time, notes: e.notes, done: e.done }),
    tags: [],
    favorite: false,
    course: e.course || "",
    deleted: !!e.deleted,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}
/** A backed-up note back into an event; null when it isn't one. */
export function noteToEvent(n) {
  if (!n || n.notebook !== CALENDAR_NOTEBOOK || !String(n.id || "").startsWith("cal-")) return null;
  if (n.deleted) return { id: n.id, title: n.title || "", deleted: true, updatedAt: n.updatedAt, createdAt: n.createdAt };
  let d;
  try { d = JSON.parse(n.body || "{}"); } catch { return null; }
  const clean = cleanEvent({ ...d, id: n.id, title: n.title, course: n.course });
  return clean && { ...clean, deleted: false, createdAt: n.createdAt, updatedAt: n.updatedAt };
}

/** Merge the cloud copy: per event, the newer updatedAt wins. */
export function mergeRemoteEvents(local, remoteNotes) {
  const out = { events: { ...local.events }, dirty: [...local.dirty] };
  for (const n of Array.isArray(remoteNotes) ? remoteNotes : []) {
    const r = noteToEvent(n);
    if (!r) continue;
    const l = out.events[r.id];
    if (!l || String(r.updatedAt) > String(l.updatedAt)) {
      // Keep this device's sent-reminder marks when the date is unchanged.
      out.events[r.id] = { ...r, notified: l && l.date === r.date ? l.notified || {} : {} };
      out.dirty = out.dirty.filter((id) => id !== r.id);
    } else if (String(l.updatedAt) > String(r.updatedAt) && !out.dirty.includes(r.id)) {
      out.dirty.push(r.id);
    }
  }
  return out;
}

let timer = null;
let syncing = null;
export function queueSync(delay = 1500) {
  if (isDemo() || typeof window === "undefined") return;
  clearTimeout(timer);
  timer = setTimeout(() => void pushEvents(), delay);
}

async function pushEvents() {
  const s = readCalendar();
  const ids = [...s.dirty];
  let ok = true;
  while (ids.length && ok) {
    const batch = ids.splice(0, 50).map((id) => s.events[id]).filter(Boolean);
    if (!batch.length) continue;
    const res = await request("PUT", { notes: batch.map(eventToNote) }, "/api/notes");
    ok = !!res?.saved;
    if (ok) {
      const now = readCalendar();
      now.dirty = now.dirty.filter((id) => !batch.some((b) => b.id === id && b.updatedAt === now.events[id]?.updatedAt));
      write(now);
    }
  }
  if (!ok) queueSync(30000);
}

/** Pull the cloud copy once, merge it, then push what's newer here. Resolves true when events changed. */
export function syncCalendar() {
  if (isDemo()) return Promise.resolve(false);
  if (syncing) return syncing;
  syncing = (async () => {
    const remote = await request("GET", null, "/api/notes");
    if (!remote) return false;
    const before = JSON.stringify(readCalendar().events);
    const merged = mergeRemoteEvents(readCalendar(), remote.notes);
    write(merged);
    if (merged.dirty.length) queueSync(200);
    const changed = JSON.stringify(merged.events) !== before;
    if (changed) emit();
    return changed;
  })().catch(() => false).finally(() => { syncing = null; });
  return syncing;
}

/**
 * Reminders due now: for each upcoming event that isn't done, the closest
 * turned-on lead it has reached and hasn't been reminded for.
 * Returns [{ event, days, leads }] (leads = every lead to mark as sent).
 */
export function dueReminders(now = new Date(), settings = calendarSettings()) {
  if (!settings.reminders) return [];
  const on = REMINDER_LEADS.filter((l) => settings.leads[l]);
  if (!on.length) return [];
  const out = [];
  for (const e of listEvents()) {
    if (e.done) continue;
    const days = daysUntil(e.date, now);
    if (days == null || days < 0 || days > Math.max(...on)) continue;
    const reached = on.filter((l) => days <= l);
    if (!reached.length || reached.every((l) => e.notified?.[l])) continue;
    out.push({ event: e, days, leads: reached });
  }
  return out;
}
