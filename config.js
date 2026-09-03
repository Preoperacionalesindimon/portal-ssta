/* ============================================================
   config.js — Configuración centralizada del Portal SSTA (INDIMON)
   ------------------------------------------------------------
   Antes, cada URL de backend estaba repetida en varios archivos
   (hasta 8 lugares para una sola URL) — cambiar un despliegue de
   Apps Script significaba editar y volver a subir 8 archivos.
   Ahora todo vive aquí, en un solo lugar. Los 8 archivos que lo
   usan (los 5 permisos, el anexo, index.html y dashboard.html)
   solo LEEN de este objeto, nunca vuelven a declarar la URL.

   Este archivo también queda en caché del Service Worker (ver
   sw.js), así que sigue disponible sin conexión igual que antes.
   ============================================================ */

const PORTAL_CONFIG = {
  // Token único para todos los backends. Debe ser IDÉNTICO al
  // API_TOKEN que tiene cada uno de los 6 archivos .gs desplegados.
  API_TOKEN: 'xSiVfEUE1t0l5RI3lD7PJp2RPIa7H9M5XenSm8P1',

  BACKENDS: {
    caliente: {
      nombre: 'Trabajo en Caliente',
      icono: '🔥',
      archivo: 'permiso-trabajo-caliente.html',
      url: 'https://script.google.com/macros/s/AKfycbxHha7LVYOlXmKiPHzObci4ZZecO8rVghzbIyP7NExTW1uctHlVZqnYEhnPUvE5q5LXdA/exec',
      listQuery: 'list=1'
    },
    alturas: {
      nombre: 'Trabajo en Alturas',
      icono: '🧗',
      archivo: 'permiso-trabajo-alturas.html',
      url: 'https://script.google.com/macros/s/AKfycbwKezPexVVn8yZ9HSmn3macc2AD4wgr6VCXu39z7mWUM3VTE0VQH9TU6illepan8Ri_/exec',
      listQuery: 'action=list'
    },
    confinados: {
      nombre: 'Espacios Confinados',
      icono: '🕳️',
      archivo: 'permiso-espacios-confinados.html',
      url: 'https://script.google.com/macros/s/AKfycbxhD1wHYk9z6huybOV9gSPPy3xNGnyu87dnzj9EYUGo6-kQRCP7Jgqs062JLAW8p6wY/exec',
      listQuery: 'list=1'
    },
    izajes: {
      nombre: 'Izajes de Cargas',
      icono: '🏗️',
      archivo: 'permiso-izajes-cargas.html',
      url: 'https://script.google.com/macros/s/AKfycbxVk8a4N164NqBHitHpGt8BXd8GVVKLwWqUAZzIwecsJPbNAtGihRrquKcMSvUX_2n1tw/exec',
      listQuery: 'list=1'
    },
    electrico: {
      nombre: 'Trabajo Eléctrico',
      icono: '⚡',
      archivo: 'permiso-trabajo-electrico.html',
      url: 'https://script.google.com/macros/s/AKfycbwja-Ja3vYw1os4zP-viSVvS55w2b1b3wQedvJ3XBfv9FTBklQZVQTEjT1SPenGb_qF/exec',
      listQuery: 'list=1'
    },
    personal: {
      nombre: 'Personal Autorizado',
      icono: '👷',
      archivo: 'personal-autorizado.html',
      url: 'https://script.google.com/macros/s/AKfycbxP2vfEKymzbSzg_doXTm7KDQme55Ego_b_Mvstuetwo1Y1W6j6cnQuYJJETTTmaoNx/exec'
      // Nota: personal.gs no usa listQuery — su endpoint de listado es ?action=listPersonal
    }
  }
};

/**
 * Devuelve el mismo arreglo PERMIT_BACKENDS que antes vivía copiado
 * en index.html, dashboard.html y personal-autorizado.html — pero
 * calculado desde PORTAL_CONFIG, así nunca se puede desactualizar
 * un archivo y no los demás.
 * @param {boolean} incluirPersonal — si se debe incluir el anexo en la lista
 */
function getPermitBackends(incluirPersonal){
  const claves = incluirPersonal
    ? ['caliente','alturas','confinados','izajes','electrico','personal']
    : ['caliente','alturas','confinados','izajes','electrico'];
  return claves.map(k => Object.assign({ token: PORTAL_CONFIG.API_TOKEN }, PORTAL_CONFIG.BACKENDS[k]));
}
