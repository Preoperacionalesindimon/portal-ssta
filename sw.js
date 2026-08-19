/* ============================================================
   sw.js — Service Worker del Portal SSTA (INDIMON) — v2
   Cambios sobre v1:
   - Página offline.html personalizada (en vez de pantalla en blanco
     del navegador cuando no hay caché de la página pedida).
   - Notificación de actualización: NO se activa solo (skipWaiting)
     al instalar; espera a que el usuario confirme desde el banner
     que muestra common.js, para no interrumpirlo a media captura
     de un permiso.
   - Background Sync: si el navegador lo soporta, cuando vuelve la
     señal se dispara automáticamente el reintento de la cola de
     permisos pendientes (ver Outbox en common.js), sin que el
     usuario tenga que volver a abrir la página.
   - Estrategias diferenciadas: los recursos estáticos (css/js/íconos)
     usan "cache first" (no cambian seguido, cargan al instante);
     las páginas HTML siguen en "network first" (para traer siempre
     la versión más nueva del formulario cuando hay señal).
   ============================================================ */

const CACHE_NAME = 'ssta-portal-v2';

const PAGES = [
  './',
  './index.html',
  './permiso-trabajo-alturas.html',
  './permiso-trabajo-caliente.html',
  './permiso-espacios-confinados.html',
  './permiso-izajes-cargas.html',
  './permiso-trabajo-electrico.html',
  './dashboard.html'
];
const STATIC_ASSETS = [
  './common.css',
  './common.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];
const OFFLINE_PAGE = './offline.html';
const APP_SHELL = [...PAGES, ...STATIC_ASSETS, OFFLINE_PAGE];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) => cache.add(url).catch(() => {
          /* archivo individual no disponible; se omite sin afectar al resto */
        }))
      )
    )
  );
  // Ya NO se llama self.skipWaiting() aquí. El SW nuevo se queda "esperando"
  // hasta que el usuario acepte actualizar (ver mensaje SKIP_WAITING abajo),
  // para no cortarle a alguien un permiso a medio llenar.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// El usuario confirmó desde el banner de "nueva versión disponible"
// (común.js envía este mensaje) → recién ahí se activa el nuevo SW.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isOwnOrigin = url.origin === self.location.origin;
  const isBackendCall = url.hostname.includes('script.google.com');

  if (!isOwnOrigin || isBackendCall || req.method !== 'GET') {
    return; // deja pasar tal cual (red real, sin caché)
  }

  const isNavigation = req.mode === 'navigate' || PAGES.some(p => url.pathname.endsWith(p.replace('./', '')));

  if (isNavigation) {
    // Páginas: network-first, con caché como respaldo y offline.html
    // como último recurso si tampoco hay copia guardada.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match(OFFLINE_PAGE))
        )
    );
  } else {
    // Estáticos (css/js/íconos): cache-first — respuesta instantánea;
    // se refresca la copia en segundo plano si hay señal.
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
});

// Background Sync: se dispara solo cuando vuelve la señal, aunque la
// pestaña ya esté cerrada. Le avisa a la(s) página(s) abiertas para que
// reintenten el envío desde el Outbox (IndexedDB) — el SW no guarda el
// token/URL del backend, por eso delega el reintento real a common.js.
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-outbox') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((c) => c.postMessage('TRY_FLUSH_OUTBOX'));
      })
    );
  }
});
