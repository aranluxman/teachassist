import { readStudentData, writeStudentData } from './student-store.js';
import { getCourses, isDemo, isLoggedIn } from './ta-client.js';

export const notificationDefaults = { marks: false, private: true, unavailable: false, reminders: false, unchanged: false };
export function notificationPreferences() { return { ...notificationDefaults, ...readStudentData('notifications', {}) }; }
export function saveNotificationPreferences(patch) { writeStudentData('notifications', { ...notificationPreferences(), ...patch }); }
export function notificationMessage(changes, prefs) {
  const selected = changes.filter(c => c.kind === 'changed' ? prefs.marks : prefs.unavailable);
  if (!selected.length) return null;
  if (prefs.private) return 'Your course information has changed. Open TeachAssist to view it.';
  return selected.map(c => c.kind === 'unavailable' ? `${c.code}: mark is now unavailable.` : `${c.code}: ${c.before == null ? 'new mark' : c.before.toFixed(1) + '%'} → ${c.mark.toFixed(1)}%`).join('\n');
}
export async function notify(title, body) {
  window.dispatchEvent(new CustomEvent('ta:notice', { detail: { title, body } }));
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) await registration.showNotification(title, { body, icon: 'icons/app-icon.svg', tag: 'teachassist' });
    else new Notification(title, { body, tag: 'teachassist' });
  } catch { /* The in-page notice remains available on unsupported browsers. */ }
}
export function checkReminders(now = Date.now()) {
  if (!notificationPreferences().reminders) return;
  const rows = readStudentData('appointments', []);
  let changed = false;
  for (const row of rows) {
    const time = Date.parse(row.time);
    if (!row.notified && time > now && time - now <= 15 * 60000) {
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
    const prefs = notificationPreferences();
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
    if (isDemo() || checking || !(prefs.marks || prefs.unavailable) || Date.now() - lastCheck < 5 * 60000) return;
    checking = true;
    lastCheck = Date.now();
    try { await getCourses({ refresh: true }); }
    catch { /* A failed check is not a mark change or an unchanged result. */ }
    finally { checking = false; }
  }, 30000);
  checkReminders();
}
