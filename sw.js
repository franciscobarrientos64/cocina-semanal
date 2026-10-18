// Despensa · service worker: la app abre sin internet en la cocina (los datos se actualizan al volver la conexión)
const CACHE = 'despensa-v5';
const BASE = ['/', '/index.html', '/favicon.svg', '/icon-192.png', '/manifest.webmanifest',
  '/js/nucleo.js', '/js/semana.js', '/js/cocina.js', '/js/compras.js', '/js/alacena.js', '/js/recetas.js', '/js/familia.js', '/js/app.js', '/js/fotos.js', '/js/i18n.js', '/js/i18n-en.json'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE).catch(() => {}))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  // Páginas: primero la red (siempre lo último), si no hay conexión, la copia guardada
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put('/', c)); return r; }).catch(() => caches.match('/')));
    return;
  }
  // Archivos: la copia guardada al toque y se actualiza por detrás
  e.respondWith(caches.match(e.request).then((hit) => {
    const red = fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; }).catch(() => hit);
    return hit || red;
  }));
});
