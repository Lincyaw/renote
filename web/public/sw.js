const CACHE_NAME = 'renote-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network-first for all requests (real-time app, caching would be stale)
  if (event.request.method !== 'GET') return;
  // Skip WebSocket and API requests
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/terminal') || url.pathname === '/health') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache static assets
        if (response.ok && (url.pathname.match(/\.(js|css|png|woff2?)$/) || url.pathname === '/')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
