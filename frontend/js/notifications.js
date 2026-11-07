import { readStudentData, writeStudentData } from './student-store.js';
import { getCourses, isDemo, isLoggedIn } from './ta-client.js';
import { marksHidden } from './motion.js';

import { preferences } from './personalization.js';

// minChange: only alert for marks that move at least this many points.
// belowGoal: alert when a course drops under its Dreams goal (or the overall target).
// quiet: no device notifications between quietFrom and quietTo (in-app notices still show).
// reminderMinutes: how early a Guidance appointment reminder comes.
export const notificationDefaults = { marks: false, private: true, unavailable: false, reminders: false, unchanged: false,
  minChange: 0, belowGoal: false, quiet: false, quietFrom: '22:00', quietTo: '07:00', reminderMinutes: 15 };
export function notificationPreferences() { return { ...notificationDefaults, ...readStudentData('notifications', {}) }; }
export function saveNotificationPreferences(patch) { writeStudentData('notifications', { ...notificationPreferences(), ...patch }); }
/** True when `c` is a real move of at least `min` points (a brand-new mark always counts). */
const bigEnough = (c, min) => c.before == null || !(min > 0) || Math.abs(c.mark - c.before) >= min;
/** The goal a course is measured against: its own Dreams goal, else the overall target. */
const goalFor = (c, prefs) => prefs.goals?.[c.code] ?? prefs.target;
const isBelowGoal = (c, prefs) => {
  const goal = goalFor(c, prefs);
  return prefs.belowGoal && c.kind === 'changed' && typeof goal === 'number' && c.mark < goal && !(c.before != null && c.before < goal);
};

export function notificationMessage(changes, prefs) {
  const selected = changes.filter(c => c.kind === 'changed'
    ? (prefs.marks && bigEnough(c, prefs.minChange)) || isBelowGoal(c, prefs)
    : prefs.unavailable);
  if (!selected.length) return null;
  if (prefs.private || marksHidden()) return 'Your course information has changed. Open TeachAssist to view it.';
  return selected.map(c => {
    if (c.kind === 'unavailable') return `${c.code}: mark is now unavailable.`;
    const line = `${c.code}: ${c.before == null ? 'new mark' : c.before.toFixed(1) + '%'} → ${c.mark.toFixed(1)}%`;
    return isBelowGoal(c, prefs) ? `${line} (below your ${goalFor(c, prefs)}% goal)` : line;
  }).join('\n');
}

/** Minutes since midnight for "HH:MM"; null when it isn't a time. */
const minutesOf = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ''));
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
};
/** True inside the quiet hours (which may wrap past midnight, e.g. 22:00 → 07:00). */
export function inQuietHours(prefs, date = new Date()) {
  if (!prefs.quiet) return false;
  const from = minutesOf(prefs.quietFrom), to = minutesOf(prefs.quietTo);
  if (from == null || to == null || from === to) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  return from < to ? now >= from && now < to : now >= from || now < to;
}

export async function notify(title, body) {
  window.dispatchEvent(new CustomEvent('ta:notice', { detail: { title, body } }));
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (inQuietHours(notificationPreferences())) return; // the in-app notice above still shows
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) await registration.showNotification(title, { body, icon: 'icons/icon-192.png', tag: 'teachassist' });
    else new Notification(title, { body, tag: 'teachassist' });
  } catch { /* The in-page notice remains available on unsupported browsers. */ }
}
export function checkReminders(now = Date.now()) {
  const prefs = notificationPreferences();
  if (!prefs.reminders) return;
  const lead = [5, 15, 30, 60].includes(prefs.reminderMinutes) ? prefs.reminderMinutes : 15;
  const rows = readStudentData('appointments', []);
  let changed = false;
  for (const row of rows) {
    const time = Date.parse(row.time);
    if (!row.notified && time > now && time - now <= lead * 60000) {
      row.notified = true;
      changed = true;
      void notify('Guidance appointment', `Your saved appointment starts at ${new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
    }
  }
  if (changed) writeStudentData('appointments', rows);
}
export function startNotificationChecks() {
  window.addEventListener('ta:marks-checked', e => {
    const { previous, changes, checked, stale } = e.detail;
    if (!previous || stale) return;
    const { target, goals } = preferences();
    const prefs = { ...notificationPreferences(), target, goals };
    const message = notificationMessage(changes, prefs);
    if (message) void notify('TeachAssist update', message);
    else if (checked && !changes.length && prefs.marks && prefs.unchanged)
      void notify('TeachAssist checked', 'No mark changes were found.');
  });
  let checking = false, lastCheck = Date.now();
  setInterval(async () => {
    if (document.hidden || !isLoggedIn()) return;
    checkReminders();
    const prefs = notificationPreferences();
    if (isDemo() || checking || !(prefs.marks || prefs.unavailable || prefs.belowGoal) || Date.now() - lastCheck < 5 * 60000) return;
    checking = true;
    lastCheck = Date.now();
    try { await getCourses({ refresh: true }); }
    catch { /* A failed check is not a mark change or an unchanged result. */ }
    finally { checking = false; }
  }, 30000);
  checkReminders();
}
