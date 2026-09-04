/* ============================================================
   config.js — Configuración centralizada del Portal SSTA (INDIMON)
   ============================================================ */

const PORTAL_CONFIG = {
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
      listQuery: 'list=1'
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
    }
  }
};

function getPermitBackends(incluirPersonal){
  const claves = incluirPersonal
    ? ['caliente','alturas','confinados','izajes','electrico','personal']
    : ['caliente','alturas','confinados','izajes','electrico'];
  return claves.map(k => Object.assign({ token: PORTAL_CONFIG.API_TOKEN }, PORTAL_CONFIG.BACKENDS[k]));
}
