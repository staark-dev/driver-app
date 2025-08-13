const SCOPE = '/truck-app/';
const CACHE = 'truck-app-v1';
const CORE = [ `${SCOPE}`, `${SCOPE}index.html`, `${SCOPE}manifest.json` ];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE && caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first pentru navigații (HTML) cu fallback la index.html,
// Cache-first pentru restul GET-urilor (assets).
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match(`${SCOPE}index.html`))
    );
    return;
  }

  // only cache same-origin
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }))
    );
  }
});
