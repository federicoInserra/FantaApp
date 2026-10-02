// Bump the version whenever an app-shell asset changes.
const CACHE_PREFIX = `fantaapp-${self.registration.scope}-`;
const CACHE = `${CACHE_PREFIX}v1`;
const ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './src/storage.mjs', './src/app.mjs', './src/lineup.mjs', './src/pwa.mjs',
  './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png',
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Keep each installed shell coherent until the next worker activates.
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    try { return await fetch(event.request); }
    catch (error) {
      if (event.request.mode === 'navigate') return cache.match('./index.html');
      throw error;
    }
  })());
});
