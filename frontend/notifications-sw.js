// Notification display + offline app shell. Never caches student data:
// /api/* (marks, sign-in) always goes to the network and is never stored.
const SHELL = 'ta-shell-v3';

// The installed app's front door, cached up front so it opens offline even
// before every screen has been visited. Everything else is cached as it loads.
const PRECACHE = [
  './', 'index.html', 'app.html', 'manifest.webmanifest',
  'css/style.css', 'css/mobile.css', 'css/motion.css', 'css/student-tools.css',
  'css/refresh.css', 'css/v5.css', 'css/v6.css', 'css/v7.css',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/icon-32.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // One missing file must not block installing the worker.
    await Promise.all(PRECACHE.map(path => cache.add(path).catch(() => {})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== SHELL) await caches.delete(key);
    await self.clients.claim();
  })());
});

// Network first, so a new deploy shows up right away; the cached copy of the
// page, scripts, styles and school data is only used when offline.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok) (await caches.open(SHELL)).put(event.request, response.clone());
      return response;
    } catch (err) {
      const cached = await caches.match(event.request, { ignoreSearch: true });
      if (cached) return cached;
      throw err;
    }
  })());
});

const isApp = client => /\/app(\.html)?$/.test(new URL(client.url).pathname);
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = windows.find(isApp);
    if (app) return app.focus();
    return self.clients.openWindow(new URL('app.html#courses', self.registration.scope).href);
  })());
});
