import { el, openSheet } from './courses.js';
import { notificationPreferences, saveNotificationPreferences } from './notifications.js';
import { GLYPHS } from './ui-kit.js';

const ROWS = [
  ['reminders', 'Guidance appointment reminders', 'Remind me before appointments I save in Guidance.'],
  ['marks', 'Mark change alerts', 'Notify me when a refresh finds a changed or newly available mark.'],
  ['belowGoal', 'Below my goal alerts', 'Notify me when a course drops under the goal I set in Dreams.'],
  ['private', 'Hide marks in notifications', 'Keep course names and grade values out of notifications.'],
  ['unavailable', 'Alert when marks become unavailable', 'Notify me if a previously visible mark is no longer returned. This does not confirm a teacher hid it.'],
];
const LABELS = { reminders: 'Reminders', marks: 'Mark changes', belowGoal: 'Below goal', unavailable: 'Unavailable marks', unchanged: 'No-change', quiet: 'Quiet hours' };
// [value, label] choices for the drop-downs.
const MIN_CHANGE = [[0, 'Any change'], [1, '1+ points'], [2, '2+ points'], [5, '5+ points']];
const REMINDER_LEAD = [[5, '5 min before'], [15, '15 min before'], [30, '30 min before'], [60, '1 hour before']];

const permissionState = () =>
  'Notification' in window && window.isSecureContext ? Notification.permission : 'unsupported';

/** True once the student has turned notifications on: device permission, or any alert. */
function isOn(prefs) {
  return permissionState() === 'granted' || ['reminders', 'marks', 'belowGoal', 'unavailable', 'unchanged'].some((k) => prefs[k]);
}

/**
 * Settings → Notifications. Before they're on: the full card with an enable
 * button. Once on: a small glass button; tap it to choose which alerts.
 */
export function notificationSettings() {
  const host = el('<div class="notify-host"></div>');
  const render = () => host.replaceChildren(isOn(notificationPreferences()) ? compactButton(render) : fullCard(render));
  render();
  return host;
}

function compactButton(rerender) {
  const prefs = notificationPreferences();
  const on = Object.keys(LABELS).filter((k) => prefs[k]).map((k) => LABELS[k]);
  const btn = el(`<button type="button" class="card notify-pill" aria-haspopup="dialog">
      <span class="notify-pill-icon" aria-hidden="true">${GLYPHS.bell || '🔔'}</span>
      <span class="notify-pill-main"><b>Notifications</b><small></small></span>
      <span class="notify-pill-state">On</span>
      <span class="g-chev">${GLYPHS.chevron}</span>
    </button>`);
  btn.querySelector('small').textContent = on.length ? on.join(' · ') : 'Choose which alerts you get';
  btn.onclick = () => {
    openSheet('Notifications', toggles(), { onClose: rerender, className: 'sheet-glass' });
  };
  return btn;
}

function fullCard(rerender) {
  const card = el(`<section class="card settings-group"><h2>Notifications</h2><p class="muted">Get reminders and mark-change alerts. Checks run every five minutes while this page is visible.</p><p class="small muted" data-permission></p><button class="btn" data-enable>Turn on notifications</button><p class="small muted">In-page alerts work without device permission. Some phones require installing this site on the home screen first.</p><p role="status"></p></section>`);
  const permission = card.querySelector('[data-permission]');
  const button = card.querySelector('[data-enable]');
  const state = permissionState();
  permission.textContent = {
    denied: 'Device notifications are blocked. Change permission in your browser’s site settings — in-page alerts still work.',
    default: '',
    unsupported: 'Device notifications are unavailable in this browser. You can still receive in-page alerts.',
  }[state] || '';
  button.onclick = async () => {
    // Turning on means the useful defaults, whatever the device says.
    saveNotificationPreferences({ reminders: true, marks: true });
    try { if (state === 'default') await Notification.requestPermission(); }
    catch { /* in-page alerts remain available */ }
    rerender();
  };
  return card;
}

function toggles() {
  const prefs = notificationPreferences();
  const body = el(`<div class="notify-sheet preference-list">${ROWS.map(([id, t, d]) => row(id, t, d, prefs[id])).join('')}
    ${choice('minChange', 'Only big changes', 'Skip mark alerts for tiny moves.', MIN_CHANGE, prefs.minChange)}
    ${choice('reminderMinutes', 'Reminder timing', 'When appointment reminders arrive.', REMINDER_LEAD, prefs.reminderMinutes)}
    ${row('quiet', 'Quiet hours', 'No phone notifications at night. You still see them in the app.', prefs.quiet)}
    <div class="quiet-times" data-quiet-times>
      <label>From <input type="time" data-notification-time="quietFrom" value="${prefs.quietFrom}"></label>
      <label>To <input type="time" data-notification-time="quietTo" value="${prefs.quietTo}"></label>
    </div>
    <details><summary>Advanced notifications</summary>${row('unchanged', 'Notify when no marks change', 'Requires mark change alerts. Applies to successful refreshes, including automatic checks.', prefs.unchanged)}</details><p class="small muted" data-permission></p><button class="btn secondary" data-enable hidden>Allow device notifications</button><p role="status" class="small muted"></p></div>`);
  const saved = () => (body.querySelector('[role=status]').textContent = 'Saved on this device.');
  const dependent = body.querySelector('[data-notification=unchanged]');
  const minChange = body.querySelector('[data-notification-choice=minChange]');
  const lead = body.querySelector('[data-notification-choice=reminderMinutes]');
  const times = body.querySelectorAll('[data-notification-time]');
  const sync = () => {
    const p = notificationPreferences();
    dependent.disabled = !p.marks;
    minChange.disabled = !p.marks;
    lead.disabled = !p.reminders;
    times.forEach((t) => (t.disabled = !p.quiet));
    body.querySelector('[data-quiet-times]').classList.toggle('is-off', !p.quiet);
  };
  body.querySelectorAll('[data-notification]').forEach((input) => (input.onchange = () => {
    saveNotificationPreferences({ [input.dataset.notification]: input.checked });
    sync();
    saved();
  }));
  body.querySelectorAll('[data-notification-choice]').forEach((select) => (select.onchange = () => {
    saveNotificationPreferences({ [select.dataset.notificationChoice]: Number(select.value) });
    saved();
  }));
  times.forEach((input) => (input.onchange = () => {
    if (/^\d{2}:\d{2}$/.test(input.value)) saveNotificationPreferences({ [input.dataset.notificationTime]: input.value });
    saved();
  }));
  sync();
  const permission = body.querySelector('[data-permission]');
  const button = body.querySelector('[data-enable]');
  const update = () => {
    const state = permissionState();
    permission.textContent = { granted: 'Device notifications are allowed.', denied: 'Device notifications are blocked in your browser’s site settings. In-page alerts still work.', default: 'Device notifications are not allowed yet.', unsupported: 'Device notifications are unavailable in this browser. You can still receive in-page alerts.' }[state];
    button.hidden = state !== 'default';
  };
  button.onclick = async () => { try { await Notification.requestPermission(); } catch { /* ignore */ } update(); };
  update();
  return body;
}

function row(id, title, desc, checked) {
  return `<label class="preference-row"><span><b>${title}</b><small>${desc}</small></span><input type="checkbox" role="switch" data-notification="${id}" ${checked ? 'checked' : ''}></label>`;
}

function choice(id, title, desc, options, value) {
  return `<label class="preference-row"><span><b>${title}</b><small>${desc}</small></span><select data-notification-choice="${id}">${options.map(([v, l]) => `<option value="${v}"${v === value ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
}
