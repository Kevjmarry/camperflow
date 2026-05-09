const CACHE_NAME = 'camperflow-v8';
const STAFF_RE = /^\/(en|de)\/staff(\/|$)/;
// Probe once per SW lifecycle: /_next/static/development/ only exists when next dev is running.
// next start (production build on localhost) returns 404, so IS_DEV resolves false and caching proceeds.
const IS_DEV = (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1')
  ? fetch('/_next/static/development/_buildManifest.js', { method: 'HEAD', cache: 'no-store', headers: { 'x-sw-bypass': '1' } })
      .then((r) => r.ok).catch(() => false)
  : Promise.resolve(false);

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

  // Network-first + cache fallback for offline read snapshot routes (must precede /api/ skip)
  if (url.pathname === '/api/staff/ops-snapshot' || url.pathname === '/api/staff/bookings-snapshot') {
    const networkPromise = fetch(request);
    event.waitUntil(
      networkPromise.then((res) => {
        if (res.ok) return caches.open(CACHE_NAME).then((cache) => cache.put(request, res.clone()));
      }).catch(() => {})
    );
    const fromCache = () =>
      caches.match(request, { ignoreVary: true }).then((cached) =>
        cached ||
        new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    // Race network against a 3 s timeout so a hanging fetch (offline dev) falls
    // back to cache immediately rather than waiting for TCP timeout.
    const raceNetwork = Promise.race([
      networkPromise,
      new Promise((_, reject) => setTimeout(reject, 3000)),
    ]);
    event.respondWith(
      raceNetwork
        .then((res) => (res.ok ? res : fromCache()))
        .catch(fromCache)
    );
    return;
  }

  if (url.pathname.startsWith('/api/')) return;
  // Background HTML pre-fetch requests initiated by this SW — let them pass straight to network.
  if (request.headers.get('x-sw-bypass')) return;

  // Cache-first for Next.js static chunks (content-hashed, immutable).
  // In dev, pass through so HMR and fresh builds are never blocked by stale cache.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      IS_DEV.then((dev) => {
        if (dev) return fetch(request);
        return caches.match(request).then(
          (cached) => {
            console.log('[SW][STATIC]', cached ? 'HIT' : 'MISS', '| key:', request.url);
            if (cached) return cached;
            return fetch(request).then((res) => {
              console.log('[SW][STATIC] fetched from network, caching key:', request.url, '| status:', res.status);
              const clone = res.clone();
              event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)));
              return res;
            });
          }
        );
      })
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

  // Staff pages reached via Next.js client-side routing (mode !== 'navigate') never trigger
  // the navigate handler below, so their HTML is never cached. As a side-effect, background-
  // fetch the HTML for the clean pathname and cache it so offline navigate requests can be served.
  if (STAFF_RE.test(url.pathname) && request.mode !== 'navigate') {
    const htmlKey = url.origin + url.pathname;
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(htmlKey, { ignoreVary: true }).then((existing) => {
          if (existing) return;
          return fetch(htmlKey, { headers: { 'x-sw-bypass': '1' } })
            // [FIX] Never cache redirected responses — they won't serve correctly offline
            .then((r) => { if (r.ok && !r.redirected) return cache.put(htmlKey, r); })
            .catch(() => {});
        })
      )
    );
    // Don't call event.respondWith — browser handles the RSC/data fetch normally.
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
          // [FIX] Never cache redirected responses — serving one offline confuses the browser
          if (res.ok && !res.redirected) {
            const clone = res.clone();
            const navKey = url.origin + url.pathname;
            console.log('[SW][NAV] caching navigate response, key:', navKey, '| cache:', CACHE_NAME);
            caches.open(CACHE_NAME).then((cache) => cache.put(navKey, clone));
          }
          return res;
        })
        .catch((netErr) => {
          // [TEMP LOG] network failed, entering cache fallback
          console.warn('[SW][NAV] network MISS for:', url.pathname, '| error:', netErr && netErr.message);
          // Use the same clean key (origin + pathname) as the background prefetch so that
          // client-side-routed pages can be found offline via a hard navigate.
          return caches.match(url.origin + url.pathname, { ignoreVary: true }).then((cached) => {
            // [TEMP LOG] exact-url cache result
            console.log('[SW][NAV] exact cache match for', url.pathname, ':', cached ? 'HIT' : 'MISS');
            if (cached) return cached;

            // Do not fall back to '/' for staff routes — it serves wrong-checklist content offline.
            if (STAFF_RE.test(url.pathname)) {
              console.warn('[SW][NAV] staff route exact miss, skipping "/" fallback for:', url.pathname);
              return null;
            }
            return caches.match('/').then((rootCached) => {
              // [TEMP LOG] root '/' fallback result
              console.log('[SW][NAV] root "/" fallback:', rootCached ? 'HIT' : 'MISS');
              return rootCached;
            });
          }).then((r) => {
            if (!r) {
              // [TEMP LOG] all cache lookups failed — serving offline stub
              console.error('[SW][NAV] ALL CACHE MISSES for:', url.pathname, '— serving offline stub');
              return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>CamperFlow — Offline</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;color:#1a202c;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1.5rem}
.card{background:#fff;border-radius:1rem;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:420px;width:100%;padding:2.5rem 2rem;text-align:center}
.icon{font-size:3rem;margin-bottom:1rem}
h1{font-size:1.4rem;font-weight:700;margin-bottom:.5rem}
p{color:#4a5568;font-size:.95rem;line-height:1.6;margin-bottom:1.5rem}
a{display:inline-block;background:#2b6cb0;color:#fff;text-decoration:none;padding:.65rem 1.5rem;border-radius:.5rem;font-size:.9rem;font-weight:600}
a:hover{background:#2c5282}
</style>
</head>
<body>
<div class="card">
  <div class="icon">&#x26fa;</div>
  <h1>You're offline</h1>
  <p>CamperFlow can't reach the server right now.<br/>Check your connection, then try again.</p>
  <a href="/">Try again</a>
</div>
</body>
</html>`, { status: 503, headers: { 'Content-Type': 'text/html' } });
            }
            return r;
          });
        })
    );
  }
});
