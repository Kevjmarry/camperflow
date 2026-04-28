const CACHE_NAME = 'camperflow-v5';

const PRE_CACHE = [
  '/',
  '/en',
  '/de',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  console.log('[SW] install fired, cache:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll is atomic — one 404 aborts the whole install.
      // Add individually so a flaky pre-cache URL never blocks SW activation.
      Promise.all(
        PRE_CACHE.map((url) =>
          fetch(new Request(url, { redirect: 'follow' }))
            .then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return cache.put(url, res);
            })
            .catch((err) =>
              console.warn('[SW] pre-cache skipped:', url, err)
            )
        )
      )
    ).then(() => {
      console.log('[SW] pre-cache done, skipping wait');
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] activate fired');
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => {
              console.log('[SW] deleting old cache:', k);
              return caches.delete(k);
            })
        )
      )
      .then(() => {
        console.log('[SW] claiming clients');
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  // Cache-first for Next.js static chunks (content-hashed, immutable)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return res;
          })
      )
    );
    return;
  }

  // Cache-first for public static assets (icons, manifest)
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.json') {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return res;
          })
      )
    );
    return;
  }

  // Network-first for HTML navigation — caches the page for offline fallback
  if (request.mode === 'navigate') {
    // [TEMP LOG] navigate request received
    console.log('[SW][NAV] navigate request:', url.pathname, '| referrer:', request.referrer || '(none)');
    event.respondWith(
      fetch(request)
        .then((res) => {
          // [TEMP LOG] network hit
          console.log('[SW][NAV] network HIT:', url.pathname, '| status:', res.status, '| ok:', res.ok);
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return res;
        })
        .catch((netErr) => {
          // [TEMP LOG] network failed, entering cache fallback
          console.warn('[SW][NAV] network MISS for:', url.pathname, '| error:', netErr && netErr.message);
          return caches.match(request, { ignoreVary: true })
            .then((cached) => {
              // [TEMP LOG] exact-url cache result
              console.log('[SW][NAV] exact cache match for', url.pathname, ':', cached ? 'HIT' : 'MISS');
              return cached || caches.match('/').then((rootCached) => {
                // [TEMP LOG] root '/' fallback result
                console.log('[SW][NAV] root "/" fallback:', rootCached ? 'HIT' : 'MISS');
                return rootCached;
              });
            })
            .then((r) => {
              if (!r) {
                // [TEMP LOG] all cache lookups failed — serving offline stub
                console.error('[SW][NAV] ALL CACHE MISSES for:', url.pathname, '— serving offline stub');
                return new Response('<h1>Offline</h1>', { status: 503, headers: { 'Content-Type': 'text/html' } });
              }
              return r;
            });
        })
    );
  }
});
