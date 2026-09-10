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

const CACHE_NAME = 'ssta-portal-v41';

const PAGES = [
  './',
  './index.html',
  './permiso-trabajo-alturas.html',
  './permiso-trabajo-caliente.html',
  './permiso-espacios-confinados.html',
  './permiso-izajes-cargas.html',
  './permiso-trabajo-electrico.html',
  './personal-autorizado.html',
  './inspeccion-epp.html',
  './dashboard.html'
];
const STATIC_ASSETS = [
  './config.js',
  './common.css',
  './common.js',
  './permiso-core.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
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

  // Tipografías de Google (la hoja de estilos y los archivos .woff2).
  // Sin esto, en planta sin señal el portal caía a la tipografía del sistema:
  // cambiaba el ancho de todo, los textos se reacomodaban y la app se veía
  // distinta justo donde más se usa. Se guardan la primera vez que hay señal
  // y de ahí en adelante se sirven desde la caché, con la red solo como
  // respaldo — las fuentes no cambian, así que no hay nada que refrescar.
  const isFuente = url.hostname === 'fonts.googleapis.com' ||
                   url.hostname === 'fonts.gstatic.com';
  if (isFuente && req.method === 'GET') {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          // Las respuestas de gstatic son opacas (no-cors); igual se guardan,
          // que es justo lo que permite que la fuente aparezca sin señal.
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  if (!isOwnOrigin || isBackendCall || req.method !== 'GET') {
    return; // deja pasar tal cual (red real, sin caché)
  }

  const isNavigation = req.mode === 'navigate' || PAGES.some(p => {
    const rel = p.replace('./', '');
    return rel !== '' && url.pathname.endsWith(rel);
  });

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
