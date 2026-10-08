// Bump the version whenever an app-shell asset changes.
const CACHE_PREFIX = `fantaapp-${self.registration.scope}-`;
const CACHE = `${CACHE_PREFIX}v30`;
const ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './data/fantamaster.json', './data/leghe.json', './src/catalog.mjs', './src/storage.mjs', './src/cloud-sync.mjs', './src/cloud-state.mjs', './src/import-team.mjs', './src/app.mjs', './src/rules.mjs', './src/analysis.mjs', './src/analysis-state.mjs', './src/ai-api.mjs', './src/research.mjs', './src/primary-research.mjs', './src/understat.mjs', './src/deployment.mjs', './src/analysis-ui.mjs', './src/lineup.mjs', './src/formation-view.mjs', './src/forecast.mjs', './src/player-analysis.mjs', './src/pwa.mjs',
  './fonts/doto-800.ttf', './icons/pixel-ball.svg', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png',
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
  // Authenticated API requests always go to the server, including offline failures.
  if (url.pathname.startsWith('/api/')) return;
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
