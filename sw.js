/* ── Andalus Service Worker — offline asset cache ────────────────────────────
   Strategy:
   • On install: pre-cache the app shell (HTML, JS, CSS bundles)
   • On fetch: Cache-First for static assets (icons, images, fonts, JS, CSS)
               Network-First for API calls and HTML navigation
   ──────────────────────────────────────────────────────────────────────────── */

const CACHE_NAME = 'andalus-v3';
const STATIC_EXTS = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico',
                     '.woff', '.woff2', '.ttf', '.otf', '.gif'];
const BUNDLE_EXTS = ['.js', '.css'];

// ── Install: take control immediately ──────────────────────────────────────
self.addEventListener('install', () => {
  self.skipWaiting();
});

// ── Activate: wipe old caches ──────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: route requests ──────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin (API calls to external services)
  if (request.method !== 'GET') return;

  // External APIs (prayer times, reverse geocoding, Supabase) → network only
  const isExternal = (
    url.hostname !== self.location.hostname ||
    url.pathname.startsWith('/supabase') ||
    url.hostname.includes('supabase') ||
    url.hostname.includes('aladhan') ||
    url.hostname.includes('nominatim') ||
    url.hostname.includes('openstreetmap')
  );
  if (isExternal) return; // Let it fall through to network

  const ext = url.pathname.split('.').pop().toLowerCase();
  const isStaticAsset = STATIC_EXTS.some(e => url.pathname.endsWith(e));
  const isBundleAsset = BUNDLE_EXTS.some(e => url.pathname.endsWith(e));

  if (isStaticAsset) {
    // Cache-First for icons, images, fonts
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          return cached || new Response('', { status: 408 });
        }
      })
    );
    return;
  }

  if (isBundleAsset) {
    // Stale-While-Revalidate for JS/CSS bundles
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request).then(response => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // HTML navigation → Network-First, fall back to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html') || caches.match('/')
      )
    );
  }
});

// ── Message: force update ─────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
