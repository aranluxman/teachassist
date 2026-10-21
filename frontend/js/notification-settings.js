import { el, openSheet } from './courses.js';
import { notificationPreferences, saveNotificationPreferences } from './notifications.js';
import { GLYPHS } from './ui-kit.js';

const ROWS = [
  ['reminders', 'Guidance appointment reminders', 'Remind me 15 minutes before appointments I save in Guidance.'],
  ['marks', 'Mark change alerts', 'Notify me when a refresh finds a changed or newly available mark.'],
  ['private', 'Hide marks in notifications', 'Keep course names and grade values out of notifications.'],
  ['unavailable', 'Alert when marks become unavailable', 'Notify me if a previously visible mark is no longer returned. This does not confirm a teacher hid it.'],
];
const LABELS = { reminders: 'Reminders', marks: 'Mark changes', unavailable: 'Unavailable marks', unchanged: 'No-change' };

const permissionState = () =>
  'Notification' in window && window.isSecureContext ? Notification.permission : 'unsupported';

/** True once the student has turned notifications on: device permission, or any alert. */
function isOn(prefs) {
  return permissionState() === 'granted' || ['reminders', 'marks', 'unavailable', 'unchanged'].some((k) => prefs[k]);
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
  const body = el(`<div class="notify-sheet preference-list">${ROWS.map(([id, t, d]) => row(id, t, d, prefs[id])).join('')}<details><summary>Advanced notifications</summary>${row('unchanged', 'Notify when no marks change', 'Requires mark change alerts. Applies to successful refreshes, including automatic checks.', prefs.unchanged)}</details><p class="small muted" data-permission></p><button class="btn secondary" data-enable hidden>Allow device notifications</button><p role="status" class="small muted"></p></div>`);
  const dependent = body.querySelector('[data-notification=unchanged]');
  dependent.disabled = !prefs.marks;
  body.querySelectorAll('[data-notification]').forEach((input) => (input.onchange = () => {
    saveNotificationPreferences({ [input.dataset.notification]: input.checked });
    if (input.dataset.notification === 'marks') dependent.disabled = !input.checked;
    body.querySelector('[role=status]').textContent = 'Saved on this device.';
  }));
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
