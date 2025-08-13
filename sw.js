const CACHE = 'truck-app-v5'; // bump când publici
const CORE = ['.', 'index.html', 'manifest.json', 'styles.css', 'app.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE && caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // navigări: network first cu fallback la index.html
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('index.html')));
    return;
  }

  // resurse: cache first cu update în fundal
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      caches.open(CACHE).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => hit))
  );
});
