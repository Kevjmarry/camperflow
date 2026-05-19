const CACHE_NAME = 'camperflow-v10';

// Probe once per SW lifecycle: /_next/static/development/ only exists when next dev is running.
// next start (production build on localhost) returns 404, so IS_DEV resolves false and caching proceeds.
const IS_DEV = (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1')
  ? fetch('/_next/static/development/_buildManifest.js', { method: 'HEAD', cache: 'no-store', headers: { 'x-sw-bypass': '1' } })
      .then((r) => r.ok).catch(() => false)
  : Promise.resolve(false);

// Static assets only — no HTML pages
const PRE_CACHE = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

const OFFLINE_HTML = `<!DOCTYPE html>
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
</html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRE_CACHE.map((url) =>
          fetch(new Request(url, { redirect: 'follow' }))
            .then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return cache.put(url, res);
            })
            .catch((err) => console.warn('[SW] pre-cache skipped:', url, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (request.method !== 'GET') return;

  // Network-first + cache fallback for snapshot routes (must precede /api/ skip)
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
    // Race network against a 3s timeout so a hanging fetch falls back to cache immediately.
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
  // SW-initiated requests (IS_DEV probe) — pass straight to network to avoid deadlock.
  if (request.headers.get('x-sw-bypass')) return;

  // Cache-first for Next.js static chunks (content-hashed, immutable).
  // In dev, pass through so HMR and fresh builds are never blocked by stale cache.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      IS_DEV.then((dev) => {
        if (dev) return fetch(request);
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((res) => {
            const clone = res.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)));
            return res;
          });
        });
      })
    );
    return;
  }

  // Cache-first for icons and manifest
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

  // Navigation: network only — serve offline stub immediately on failure, no HTML caching.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html' } })
      )
    );
  }
});
