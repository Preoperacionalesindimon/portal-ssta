/* ============================================================
   sw.js — Service Worker del Portal SSTA (INDIMON)
   Permite abrir el portal y los formularios sin conexión a internet.
   Guardar/consultar permisos en el Sheet SÍ necesita señal — pero
   gracias al borrador local (ver common.js), nada se pierde mientras
   tanto: en cuanto vuelva la señal se puede guardar normalmente.
   ============================================================ */

const CACHE_NAME = 'ssta-portal-v1';
const APP_SHELL = [
  './',
  './index.html',
  './permiso-trabajo-alturas.html',
  './permiso-trabajo-caliente.html',
  './common.css',
  './common.js',
  './manifest.json',
  './icon-192.png'
];

// Instala: descarga y guarda en caché el "esqueleto" de la app.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(()=>{ /* si algún archivo no existe todavía, no bloquea la instalación */ })
  );
  self.skipWaiting();
});

// Activa: borra cachés de versiones anteriores.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: para las páginas propias del portal, usa "network first, cache
// fallback" — si hay señal, siempre trae la versión más nueva y la
// actualiza en caché; si no hay señal, sirve la última copia guardada.
// Las llamadas al backend de Google Apps Script (guardar/consultar
// permisos) NO se interceptan: deben ir siempre a la red real.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isOwnOrigin = url.origin === self.location.origin;
  const isBackendCall = url.hostname.includes('script.google.com');

  if (!isOwnOrigin || isBackendCall || event.request.method !== 'GET') {
    return; // deja pasar tal cual (red real, sin caché)
  }

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
