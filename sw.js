// sw.js - Service Worker de Auto-Recuperação e Limpeza de Cache
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

// Não intercepta requisições de rede para garantir que o navegador e o GitHub Pages
// entreguem os arquivos HTML, JS e CSS diretamente e sem risco de tela branca.
