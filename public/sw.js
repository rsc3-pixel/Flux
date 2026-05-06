// Flux service worker — app-shell caching strategy.
// - Critical shell (HTML/CSS/JS): NETWORK-FIRST so updates roll out on next visit.
//   Falls back to cached copy when offline. Avoids the "users stuck on old
//   version after deploy" problem that plagued early versions.
// - Static assets (logos, vendor): cache-first, network fallback (these change
//   rarely; serving from cache is faster).
// - API calls: always network, never cached (data must be fresh).
// - Cache name is bumped on every release to evict stale entries on activate.

// IMPORTANT: bump this string on every release that changes index.html,
// app.js or styles.css. Otherwise the previous cache silently keeps serving
// the old shell on every device that has an existing SW installed (PWAs and
// repeat browser visits). Pattern: 'flux-v<package.json-version>'.
const CACHE = 'flux-v1.4.2-multiboard';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/vendor/sortable.min.js',
  '/flux-logo.svg',
  '/flux-logo-dark.svg',
  '/flux-mark.svg',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  // Tolerant install: cache.addAll is all-or-nothing, so a single failed
  // asset (timeout, 404, slow CDN) aborts the entire SW install. The old SW
  // then keeps serving the previous cache while the browser sees the new
  // shell from the network — a recipe for cache mismatch and silent JS
  // breakage. Caching individually with allSettled lets the SW activate
  // even if one asset failed; the missing one will be fetched on demand.
  event.waitUntil(
    caches.open(CACHE)
      .then(async (cache) => {
        const results = await Promise.allSettled(APP_SHELL.map((url) => cache.add(url)));
        const failed = results
          .map((r, i) => (r.status === 'rejected' ? APP_SHELL[i] : null))
          .filter(Boolean);
        if (failed.length) console.warn('SW install: skipped failed assets', failed);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Critical shell paths use network-first so deploys propagate immediately.
const SHELL_CRITICAL = new Set(['/', '/index.html', '/app.js', '/styles.css']);

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API requests — always go to the network so data stays fresh.
  if (url.pathname.startsWith('/api/')) return;

  // Only handle same-origin GETs (don't touch DiceBear/Google Fonts requests
  // — those have their own CDN caching headers).
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Strategy A — network-first for the critical shell. Falls back to cache
  // when offline. This is what guarantees a fresh app on each visit.
  if (SHELL_CRITICAL.has(url.pathname)) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => caches.match(event.request).then((c) => c || caches.match('/index.html')))
    );
    return;
  }

  // Strategy B — cache-first for static assets that rarely change.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response.ok) return response;
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match('/index.html')); // Offline fallback
    })
  );
});
