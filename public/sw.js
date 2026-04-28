const CACHE_NAME = 'camperflow-v3';

const PRE_CACHE = [
  '/',
  '/en',
  '/de',
  '/en/staff/login',
  '/de/staff/login',
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
          cache.add(url).catch((err) =>
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
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() =>
          caches.match(request)
            .then((cached) => {
              if (cached) return cached;
              if (url.pathname === '/en/staff/login' || url.pathname === '/de/staff/login') {
                return caches.match(url.pathname).then((c) => c || caches.match('/'));
              }
              return caches.match('/');
            })
            .then((r) => r || new Response('<h1>Offline</h1>', { status: 503, headers: { 'Content-Type': 'text/html' } }))
        )
    );
  }
});
