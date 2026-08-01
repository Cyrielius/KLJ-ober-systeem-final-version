// Service Worker voor KLJ Bestelsysteem
// Ondersteunt PWA-installatie en native systeemmeldingen.
// Belangrijk: we cachen NOOIT API/database-verzoeken naar Supabase —
// alleen onze eigen static files. Anders krijgt de app stale data te zien.
const CACHE_NAME = 'klj-bestel-v2';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

// Alleen eigen static files cachen (same-origin GET, geen API calls).
// Supabase-verzoeken (andere origin, of /rest/ / /realtime/ paden) gaan
// altijd direct naar het netwerk — geen stale data.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Nooit cachen: cross-origin requests (Supabase API), of API/realtime paden
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/realtime/') || url.pathname.startsWith('/functions/')) return;

  // Static files: network-first, fall back to cache als offline
  event.respondWith(
    fetch(req).then((resp) => {
      const clone = resp.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
      return resp;
    }).catch(() => caches.match(req).then((cached) => cached || new Response('', { status: 503 }))),
  );
});

// Native notificaties — aangeroepen via postMessage vanuit de pagina
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'NOTIFY') {
    const { title, body, tag, icon } = event.data;
    self.registration.showNotification(title, {
      body,
      tag: tag || 'klj-order',
      icon: icon || undefined,
      badge: icon || undefined,
      requireInteraction: false,
      vibrate: [200, 100, 200, 100, 200],
      data: { url: event.data.url || '/' },
    });
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});
