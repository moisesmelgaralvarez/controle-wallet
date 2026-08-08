/* ============================================================
   Service worker — hace que la app abra sin señal.
   Estrategia: la cáscara se sirve del caché y se refresca en
   segundo plano. Las llamadas a Supabase nunca se cachean.
   Sube CACHE cuando cambies archivos para forzar la renovación.
   ============================================================ */

const CACHE = 'controlewallet-v1';

const CASCARA = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './asesor.js',
  './facturas.js',
  './reporte.js',
  './importar.js',
  './sync.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CASCARA))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Nunca interceptar la nube: los datos deben venir frescos o fallar.
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(cacheada => {
      const red = fetch(req)
        .then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copia = res.clone();
            caches.open(CACHE).then(c => c.put(req, copia));
          }
          return res;
        })
        .catch(() => cacheada);

      // Sirve el caché al instante y refresca por detrás.
      return cacheada || red;
    })
  );
});
