const CACHE_NAME = 'orc-v1';

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
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Skip WebSocket and API requests
  if (url.pathname.startsWith('/terminal') || url.pathname === '/health') return;

  // Cache-first for hashed static assets (Vite adds content hashes, so they never go stale)
  const isHashedAsset = url.pathname.match(/\.(js|css|woff2?|png|svg|ico)$/) && url.pathname.match(/[-_][a-zA-Z0-9]{8,}\./);

  if (isHashedAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first with cache fallback for HTML and non-hashed assets
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && (url.pathname.match(/\.(js|css|png|woff2?)$/) || url.pathname === '/')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
