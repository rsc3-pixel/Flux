// Flux service worker — minimal "app-shell" caching strategy.
// - Static files (HTML/CSS/JS/SVG): cache-first, network fallback
// - API calls: always network, never cached (data must be fresh)
// - Bumps the cache name to invalidate everything on each release

const CACHE = 'flux-v2';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/vendor/sortable.min.js',
  '/flux-logo.svg',
  '/flux-mark.svg',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API requests — always go to the network so data stays fresh.
  if (url.pathname.startsWith('/api/')) return;

  // Only cache same-origin GETs (don't touch DiceBear/Google Fonts requests
  // — those have their own CDN caching headers).
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Don't cache non-2xx responses
        if (!response.ok) return response;
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match('/index.html')); // Offline fallback
    })
  );
});
