const SCOPE = self.registration.scope || '/';

const CACHE = 'truck-app-v4'; // bump când schimbi fișierele
const CORE = [
  `${SCOPE}`,
  `${SCOPE}index.html`,
  `${SCOPE}manifest.json`,
  `${SCOPE}styles.css`,
  `${SCOPE}app.js`
];

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

  // Navigații -> network first cu fallback la index.html
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(`${SCOPE}index.html`)));
    return;
  }

  // Static & API -> cache first cu update în fundal
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(()=>hit))
  );
});
