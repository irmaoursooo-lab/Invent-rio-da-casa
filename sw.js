const CACHE_NAME = 'apple-inventory-v5';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.png',
  './icons/apple-touch-icon.png',
  './icon.png',
  './apple-touch-icon.png',
  './css/apple-theme.css',
  './js/app.js?v=5',
  './js/db.js?v=5',
  './js/gemini.js?v=5',
  './js/ui.js?v=5'
];

// Install: Cache essential assets immediately and skip waiting
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of ASSETS_TO_CACHE) {
        try {
          await cache.add(asset);
        } catch (e) {
          // Ignora se arquivo opcional não existir
        }
      }
    })
  );
});

// Activate: Purge ALL old caches immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: NETWORK FIRST for scripts, HTML and stylesheets (ensures always fresh when online)
// CACHE FALLBACK when offline
self.addEventListener('fetch', (event) => {
  // Ignore external API calls (e.g. Google Gemini API)
  if (event.request.url.includes('googleapis.com')) {
    return;
  }

  // Network First: Sempre busca a versão mais recente na rede
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() => {
        // Modo offline: usa o cache local
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
