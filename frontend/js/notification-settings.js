import { el, openSheet } from './courses.js';
import { notificationPreferences, saveNotificationPreferences } from './notifications.js';
import { getSnapshots, isDemo, lastSyncedAt } from './ta-client.js';

export function notificationSettings() {
  const prefs = notificationPreferences();
  const card = el(`<section class="card"><h2>Notifications</h2><p class="muted">Checks run every five minutes while this page is visible. Closing the site stops checks and appointment reminders.</p>${[
    ['reminders','Guidance appointment reminders','Remind me 15 minutes before appointments I save in Guidance.'],
    ['marks','Mark change alerts','Notify me when a refresh finds a changed or newly available mark.'],
    ['private','Hide marks in notifications','Keep course names and grade values out of notifications.'],
    ['unavailable','Alert when marks become unavailable','Notify me if a previously visible mark is no longer returned. This does not confirm a teacher hid it.'],
  ].map(([id,title,desc]) => row(id,title,desc,prefs[id])).join('')}<details><summary>Advanced notifications</summary>${row('unchanged','Notify when no marks change','Requires mark change alerts. Applies to successful refreshes, including automatic checks.',prefs.unchanged)}</details><p class="small muted" data-permission></p><button class="btn secondary" data-enable>Enable device notifications</button><p class="small muted">In-page alerts work without device permission. Some phones require installing this site on the home screen first.</p><p role="status"></p></section>`);
  const dependent = card.querySelector('[data-notification=unchanged]');
  dependent.disabled = !prefs.marks;
  card.querySelectorAll('[data-notification]').forEach(input => input.onchange = () => {
    saveNotificationPreferences({ [input.dataset.notification]: input.checked });
    if (input.dataset.notification === 'marks') dependent.disabled = !input.checked;
    card.querySelector('[role=status]').textContent = 'Saved on this device.';
  });
  const permission = card.querySelector('[data-permission]'), button = card.querySelector('[data-enable]');
  const update = () => {
    const supported = 'Notification' in window && window.isSecureContext;
    const state = supported ? Notification.permission : 'unsupported';
    permission.textContent = { granted: 'Device notifications are allowed.', denied: 'Notifications are blocked. Change permission in your browser’s site settings.', default: 'Device notifications are not enabled.', unsupported: 'Device notifications are unavailable in this browser. You can still receive in-page alerts.' }[state];
    button.disabled = !supported || state !== 'default';
  };
  button.onclick = async () => {
    try { await Notification.requestPermission(); update(); }
    catch { card.querySelector('[role=status]').textContent = 'Could not enable notifications. In-page alerts remain available.'; }
  };
  update(); return card;
}
function row(id,title,desc,checked) {
  return `<label class="preference-row"><span><b>${title}</b><small>${desc}</small></span><input type="checkbox" role="switch" data-notification="${id}" ${checked ? 'checked' : ''}></label>`;
}
export function debugCard() {
  const card = el('<section class="card"><h2>Device & app info</h2><p class="muted">Preview a diagnostic report to download or share. It excludes credentials, student numbers, marks, profile details, and server addresses.</p><button class="btn secondary">Preview debug info</button></section>');
  card.querySelector('button').onclick = () => {
    const report = {
      app: 'TeachAssist', version: '4.1.0', generatedAt: new Date().toISOString(),
      mode: isDemo() ? 'demo' : 'live', lastSyncedAt: lastSyncedAt(), snapshotCount: getSnapshots().length,
      browser: navigator.userAgent, language: navigator.language, viewport: { width: innerWidth, height: innerHeight },
      secureContext: window.isSecureContext, online: navigator.onLine,
      notifications: 'Notification' in window ? Notification.permission : 'unsupported',
    };
    const text = JSON.stringify(report, null, 2);
    const body = el('<div><pre class="debug-preview"></pre><div class="tool-buttons"><button class="btn secondary" data-download>Download report</button><button class="btn" data-share>Share report</button></div><p role="status"></p></div>');
    body.querySelector('pre').textContent = text;
    body.querySelector('[data-download]').onclick = () => {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'teachassist-debug.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const share = body.querySelector('[data-share]'); share.hidden = !navigator.share;
    share.onclick = async () => {
      try { await navigator.share({ title: 'TeachAssist diagnostics', text }); }
      catch (err) { if (err.name !== 'AbortError') body.querySelector('[role=status]').textContent = 'Sharing failed. Download the report instead.'; }
    };
    openSheet('Preview debug info', body);
  };
  return card;
}
