// apps/web/public/sw.js
// Service Worker Kinetic — offline-first PWA

const VERSION      = 'kinetic-v1.0.0';
const STATIC_CACHE  = `${VERSION}-static`;
const DYNAMIC_CACHE = `${VERSION}-dynamic`;
const API_CACHE     = `${VERSION}-api`;

// Assets critiques à précacher à l'installation
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/src/pages/dashboard.html',
  '/src/pages/vitalite.html',
  '/src/pages/login.html',
  '/src/pages/profile.html',
  '/src/pages/auth-callback.html',
];

// ─── Install ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate : purge anciennes versions ─────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE && k !== API_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch : stratégie par type de ressource ─────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne pas intercepter les requêtes non-GET
  if (request.method !== 'GET') return;

  // Supabase API → Network First + cache fallback
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkFirstWithCache(request, API_CACHE, 60));
    return;
  }

  // Pages HTML → Stale-While-Revalidate
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // Assets statiques (JS, CSS, fonts, images) → Cache First
  if (url.pathname.match(/\.(js|css|woff2?|png|svg|ico|webp|json)$/)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Défaut → Network with cache fallback
  event.respondWith(networkFirstWithCache(request, DYNAMIC_CACHE, 300));
});

// ─── Stratégies de cache ──────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match('/offline.html') ?? new Response('Offline', { status: 503 });
  }
}

async function networkFirstWithCache(request, cacheName, maxAgeSeconds) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache   = await caches.open(cacheName);
      const headers = new Headers(response.headers);
      headers.set('sw-fetched-at', Date.now().toString());
      headers.set('sw-max-age', maxAgeSeconds.toString());
      const toCache = new Response(await response.clone().blob(), {
        status: response.status,
        headers,
      });
      cache.put(request, toCache);
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      const fetchedAt = parseInt(cached.headers.get('sw-fetched-at') || '0');
      const maxAge    = parseInt(cached.headers.get('sw-max-age') || '0');
      if (Date.now() - fetchedAt < maxAge * 1000) return cached;
    }
    return caches.match('/offline.html') ?? new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cached  = caches.match(request);
  const fetched = fetch(request).then((response) => {
    if (response.ok) {
      caches.open(cacheName).then((cache) => cache.put(request, response.clone()));
    }
    return response;
  }).catch(() => null);

  return (await cached) || (await fetched) ||
    caches.match('/offline.html') ||
    new Response('Offline', { status: 503 });
}

// ─── Background Sync ─────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-storage') {
    event.waitUntil(notifyClientsSync());
  }
});

async function notifyClientsSync() {
  const clients = await self.clients.matchAll();
  clients.forEach((client) => client.postMessage({ type: 'SYNC_REQUESTED' }));
}

// ─── Push Notifications ──────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Kinetic', {
      body:  data.body  || 'Ta routine t\'attend !',
      icon:  '/icons/icon-192.png',
      badge: '/badge.png',
      tag:   data.tag   || 'kinetic-reminder',
      data:  { url: data.url || '/' },
      actions: [
        { action: 'open',    title: 'Ouvrir Kinetic' },
        { action: 'dismiss', title: 'Plus tard' },
      ],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
