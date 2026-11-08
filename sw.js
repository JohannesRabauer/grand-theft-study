// Service worker (story 14.1): offline play after the first visit. Network first, so a normal online visit always gets the newest files (no
// stale half-updated game); every successful answer is kept in the cache, and when the network is gone the cached copy is served. The page
// itself falls back to index.html. Phaser comes from a CDN and is cached the same way. The cache name is replaced with the commit by the
// Pages workflow, so a new version drops the old cache.
const CACHE = 'schulweg-dev';
const SHELL = ['./', 'index.html', 'main.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;
  event.respondWith(
    fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
