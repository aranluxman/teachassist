// Notification display only. This worker does not cache student data or run background checks.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = windows.find(client => new URL(client.url).pathname.endsWith('/app.html'));
    if (app) return app.focus();
    return self.clients.openWindow(new URL('app.html', self.registration.scope).href);
  })());
});
