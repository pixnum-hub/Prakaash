// ═══════════════════════════════════════════════════════════════════
//  PRAKASHA — SERVICE WORKER  v7
//  © Manik Roy  ·  Vedic Astrology
//
//  Caching strategies:
//    index.html (full app, ~690 KB) → cache-first + background revalidate
//    other HTML pages               → network-first (6 s timeout)
//    Google Fonts CSS               → stale-while-revalidate
//    font files (.woff2)            → cache-first (immutable)
//    CDN scripts (jsPDF etc.)       → stale-while-revalidate
//    icons / manifest               → cache-first (lazy)
//    everything else same-origin    → network-with-cache-fallback
// ═══════════════════════════════════════════════════════════════════

const SW_VERSION    = 'v7';
const CACHE_VERSION = 'prakasha-' + SW_VERSION;
const STATIC_CACHE  = 'prakasha-static-' + SW_VERSION;
const DYNAMIC_CACHE = 'prakasha-dynamic-' + SW_VERSION;
const FONT_CACHE    = 'prakasha-fonts-v2';        // fonts are immutable; keep cache
const ALL_CACHES    = [STATIC_CACHE, DYNAMIC_CACHE, FONT_CACHE];

// ── Pre-cache: only lightweight shell files ───────────────────────
// index.html (~690 KB) excluded — cached lazily on first visit to
// prevent install failures on slow connections.
// keygen.html excluded — admin-only, must NOT be cached publicly.
const PRECACHE = [
  './',
  './manifest.json',
  './offline.html',
  './icons/icon-192x192.png',
  './icons/icon-96x96.png',
  './icons/icon-72x72.png',
];

const CDN_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://cdnjs.cloudflare.com',
];

// ════════════════════════════════════════════════════════════════════
//  LIFECYCLE
// ════════════════════════════════════════════════════════════════════

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache =>
        Promise.allSettled(
          PRECACHE.map(url =>
            cache.add(new Request(url, { cache: 'reload' }))
              .catch(err => console.warn('[SW] Pre-cache miss:', url, err.message))
          )
        )
      )
      .then(() => {
        console.log('[SW] Prakasha', SW_VERSION, 'installed');
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => !ALL_CACHES.includes(k))
          .map(k => { console.log('[SW] Pruning:', k); return caches.delete(k); })
      ))
      .then(() => {
        console.log('[SW] Prakasha', SW_VERSION, 'active');
        return self.clients.claim();
      })
  );
});

// ════════════════════════════════════════════════════════════════════
//  FETCH ROUTING
// ════════════════════════════════════════════════════════════════════

self.addEventListener('fetch', (e) => {
  const { request: req } = e;
  const url = new URL(req.url);

  if (req.method !== 'GET')             return;
  if (!url.protocol.startsWith('http')) return;

  // 0. Never cache keygen.html — always fetch fresh (admin tool)
  if (url.pathname.endsWith('keygen.html')) return;

  // 1. Root / index.html — cache-first + background revalidate
  if (url.origin === self.location.origin &&
      (url.pathname === '/' ||
       url.pathname.endsWith('/') ||
       url.pathname.endsWith('index.html'))) {
    e.respondWith(cacheFirstBackground(req, STATIC_CACHE));
    return;
  }

  // 2. Other same-origin HTML — network-first
  if (url.origin === self.location.origin && url.pathname.endsWith('.html')) {
    e.respondWith(networkFirst(req, STATIC_CACHE, 6000));
    return;
  }

  // 3. Google Fonts CSS — stale-while-revalidate
  if (url.origin === 'https://fonts.googleapis.com') {
    e.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }

  // 4. Font files — cache-first (immutable)
  if (url.origin === 'https://fonts.gstatic.com') {
    e.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }

  // 5. CDN scripts — stale-while-revalidate
  if (url.origin === 'https://cdnjs.cloudflare.com') {
    e.respondWith(staleWhileRevalidate(req, DYNAMIC_CACHE));
    return;
  }

  // 6. Local images, icons, manifest — cache-first
  if (url.origin === self.location.origin &&
      (/\/icons\//.test(url.pathname) ||
       /\.(png|jpg|jpeg|svg|ico|webp)$/.test(url.pathname) ||
       url.pathname.endsWith('manifest.json'))) {
    e.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // 7. Anything else same-origin — network with cache fallback
  if (url.origin === self.location.origin) {
    e.respondWith(networkWithFallback(req, DYNAMIC_CACHE));
  }
});

// ════════════════════════════════════════════════════════════════════
//  STRATEGIES
// ════════════════════════════════════════════════════════════════════

async function cacheFirstBackground(req, cacheName) {
  const cached = await caches.match(req);
  fetch(req).then(async res => {
    if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
  }).catch(() => {});
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
    return res;
  } catch {
    return offlinePage();
  }
}

async function networkFirst(req, cacheName, timeoutMs) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(req, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
    return res;
  } catch {
    clearTimeout(timer);
    return (await caches.match(req)) ||
           (await caches.match('./')) ||
           (await caches.match('./index.html')) ||
           offlinePage();
  }
}

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
    return res;
  } catch {
    return new Response('', { status: 503 });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cached = await caches.match(req);
  const fresh  = fetch(req).then(async res => {
    if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
    return res;
  }).catch(() => {});
  return cached ?? fresh;
}

async function networkWithFallback(req, cacheName) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req)) ?? new Response('', { status: 503 });
  }
}

// ════════════════════════════════════════════════════════════════════
//  INLINE OFFLINE PAGE
// ════════════════════════════════════════════════════════════════════

function offlinePage() {
  return new Response(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#C9A84C">
<title>Prakasha — Offline</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0A0612;color:#EDE0C4;font-family:Georgia,serif;display:flex;
     flex-direction:column;align-items:center;justify-content:center;
     min-height:100vh;text-align:center;padding:32px 24px}
.star{font-size:4rem;color:#C9A84C;margin-bottom:22px;
      animation:p 2.5s ease-in-out infinite}
@keyframes p{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:1;transform:scale(1.1)}}
h1{font-size:1.5rem;color:#C9A84C;letter-spacing:.05em;margin-bottom:10px}
.div{width:90px;height:1px;background:linear-gradient(90deg,transparent,#C9A84C,transparent);margin:0 auto 20px}
p{color:#7A7268;font-size:.9rem;line-height:1.75;max-width:290px;margin:0 auto 22px}
ol{text-align:left;max-width:260px;margin:0 auto 28px;color:#A8956A;
   font-size:.88rem;line-height:2.3;padding-left:22px}
ol li::marker{color:#C9A84C}
button{background:#C9A84C;color:#0A0612;border:none;border-radius:40px;
       padding:13px 34px;font-size:.95rem;font-weight:700;cursor:pointer}
button:hover{background:#F0D080}
</style></head><body>
<div class="star">✦</div>
<h1>Prakasha — Offline</h1>
<div class="div"></div>
<p>Not cached on this device yet.</p>
<ol>
  <li>Connect to the internet</li>
  <li>Open Prakasha in your browser</li>
  <li>Let it load &amp; browse a few tabs</li>
  <li>Works fully offline from then on ✦</li>
</ol>
<button onclick="location.reload()">Try Again</button>
</body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
  );
}

// ════════════════════════════════════════════════════════════════════
//  MESSAGES
// ════════════════════════════════════════════════════════════════════

self.addEventListener('message', (e) => {
  if (!e.data) return;
  const type = e.data.type ?? e.data;
  switch (type) {
    case 'SKIP_WAITING':
      console.log('[SW] Applying update…');
      self.skipWaiting();
      break;
    case 'GET_VERSION':
      e.source?.postMessage({ type: 'VERSION', version: CACHE_VERSION, caches: ALL_CACHES });
      break;
    case 'CLEAR_CACHE':
      caches.keys()
        .then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => e.source?.postMessage({ type: 'CACHE_CLEARED' }));
      break;
    case 'CACHE_APP':
      // Proactively cache the main app after first page load
      caches.open(STATIC_CACHE)
        .then(cache => cache.add('./index.html').catch(() => {}));
      break;
  }
});
