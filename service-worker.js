// ═══════════════════════════════════════════════════════════════════
//  PRAKASHA — SERVICE WORKER  v3
//  © Manik Roy  ·  Vedic Astrology
//  Offline-first: network-first HTML, cache-first fonts/icons
// ═══════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'prakasha-v3';
const STATIC_CACHE  = 'prakasha-static-v3';
const DYNAMIC_CACHE = 'prakasha-dynamic-v2';
const FONT_CACHE    = 'prakasha-fonts-v2';
const ALL_CACHES    = [STATIC_CACHE, DYNAMIC_CACHE, FONT_CACHE];

// App shell — cached on install
const PRECACHE = [
  './',
  './index.html',
  './vedic-astrology.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/icon-maskable-512x512.png',
  './icons/icon-maskable-192x192.png',
  './icons/icon-144x144.png',
  './icons/icon-96x96.png',
  './icons/icon-72x72.png',
];

const CDN_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://cdnjs.cloudflare.com',
];

// ── Install ───────────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE).then(cache =>
      Promise.allSettled(
        PRECACHE.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] Pre-cache miss:', url, err.message)
          )
        )
      )
    ).then(() => {
      console.log('[SW] Prakasha v3 installed');
      return self.skipWaiting();
    })
  );
});

// ── Activate ──────────────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !ALL_CACHES.includes(k))
            .map(k => { console.log('[SW] Pruning:', k); return caches.delete(k); })
      ))
      .then(() => {
        console.log('[SW] Prakasha v3 active');
        return self.clients.claim();
      })
  );
});

// ── Fetch ─────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (req.method !== 'GET')           return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.protocol === 'data:')       return;
  if (url.protocol === 'blob:')       return;

  // 1. App HTML — network-first with cache fallback
  if (url.origin === self.location.origin &&
      (url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/'))) {
    e.respondWith(networkFirstHtml(req));
    return;
  }

  // 2. Fonts — cache-first, long-lived
  const isFont = CDN_ORIGINS.some(o => req.url.startsWith(o)) &&
    (url.pathname.includes('/css') || /\.(woff2?|ttf|otf)$/.test(url.pathname));
  if (isFont) { e.respondWith(cacheFirst(req, FONT_CACHE)); return; }

  // 3. CDN scripts (jsPDF, html2canvas) — stale-while-revalidate
  if (CDN_ORIGINS.some(o => req.url.startsWith(o))) {
    e.respondWith(staleWhileRevalidate(req, DYNAMIC_CACHE));
    return;
  }

  // 4. Local icons & manifest — cache-first
  if (url.origin === self.location.origin &&
      (/\/icons\//.test(url.pathname) || /\.(png|ico|svg|webp)$/.test(url.pathname) ||
       url.pathname.endsWith('manifest.json'))) {
    e.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // 5. Everything else — network with cache fallback
  e.respondWith(networkWithCacheFallback(req, DYNAMIC_CACHE));
});

// ── Strategies ────────────────────────────────────────────────────
async function networkFirstHtml(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    const fallback = await caches.match('./vedic-astrology.html') ||
                     await caches.match('./index.html');
    return fallback || offlineFallback();
  }
}

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
    return res;
  } catch { return new Response('', { status: 503 }); }
}

async function staleWhileRevalidate(req, cacheName) {
  const cached = await caches.match(req);
  const revalidate = fetch(req).then(async res => {
    if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
    return res;
  }).catch(() => {});
  return cached || revalidate;
}

async function networkWithCacheFallback(req, cacheName) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req)) || new Response('', { status: 503 });
  }
}

function offlineFallback() {
  return new Response(`<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prakasha — Offline</title>
<style>
body{margin:0;background:#0A0612;color:#EDE0C4;font-family:Georgia,serif;
     display:flex;flex-direction:column;align-items:center;justify-content:center;
     min-height:100vh;text-align:center;padding:24px;box-sizing:border-box}
.star{font-size:3rem;margin-bottom:20px;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
h1{font-size:1.4rem;color:#C9A84C;margin-bottom:8px}
p{color:#7A7268;font-size:.9rem;line-height:1.7;max-width:300px;margin:0 auto 24px}
button{background:#C9A84C;color:#0A0612;border:none;border-radius:10px;
       padding:12px 28px;font-size:.95rem;cursor:pointer;font-weight:700}
</style></head><body>
<div class="star">✦</div>
<h1>Prakasha — Offline</h1>
<p>No internet connection. Open once while connected to cache Prakasha for full offline use.</p>
<button onclick="location.reload()">Try Again</button>
</body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html;charset=utf-8' } });
}

// ── Messages ──────────────────────────────────────────────────────
self.addEventListener('message', (e) => {
  if (!e.data) return;
  if (e.data === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (e.data === 'GET_VERSION')  {
    e.source?.postMessage({ type: 'VERSION', version: CACHE_VERSION });
    return;
  }
  if (e.data === 'CLEAR_CACHE') {
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => e.source?.postMessage({ type: 'CACHE_CLEARED' }));
  }
});
