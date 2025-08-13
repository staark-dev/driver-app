const CACHE = 'truck-app-' + new Date().toISOString().slice(0,10); // bump când publici
const CORE  = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE && caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // nu trata POST/PUT etc.
  if (req.method !== 'GET') return;

  // NAVIGAȚII: network-first cu fallback la index
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        // cache-uim o copie a paginii (index) pentru offline
        const copy = res.clone();
        event.waitUntil(
          caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {})
        );
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // STATIC/ASSETS: cache-first, cu populate la prima cerere
  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;

      return fetch(req).then(res => {
        // nu cache-uim răspunsuri opace / cross-origin / erori
        if (!res || res.status !== 200 || res.type !== 'basic') return res;

        const copy = res.clone(); // CLONEZI ÎNAINTE DE A FI CONSUMAT
        event.waitUntil(
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {})
        );
        return res;
      }).catch(() => {
        // opțional: fallback pt. imagini/icon
        if (req.destination === 'document') return caches.match('./index.html');
        return Promise.reject(); // lasă să eșueze pt. restul
      });
    })
  );
});
