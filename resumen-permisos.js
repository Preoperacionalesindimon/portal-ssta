/* ============================================================
   resumen-permisos.js — Cifras reales de los permisos para las
   portadas: abiertos ahora, vencidos y cerrados en 7 días.
   Usa el mismo listado que ya consulta permiso-core.js (?list=1),
   no escribe nada. Sin señal muestra la última cifra guardada.
   ============================================================ */
(function () {
  var CLAVE_CACHE = 'ssta-resumen-';

  function fecha(v) {
    if (!v) return null;
    var d = new Date(v);
    return isNaN(d) ? null : d;
  }
  // hastaFecha 'AAAA-MM-DD' + hastaHora 'HH:MM' → fecha límite local
  function limite(r) {
    if (!r.hastaFecha) return null;
    var p = String(r.hastaFecha).slice(0, 10).split('-');
    if (p.length !== 3) return fecha(r.hastaFecha);
    var h = String(r.hastaHora || '23:59').split(':');
    return new Date(+p[0], +p[1] - 1, +p[2], +h[0] || 0, +h[1] || 0);
  }

  function calcular(rows) {
    var ahora = new Date(), hace7 = ahora.getTime() - 7 * 864e5;
    var hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
    var r = { abiertos: 0, vencidos: 0, abiertosHoy: 0, cerrados7: 0 };
    (rows || []).forEach(function (x) {
      var est = x.status || x.estado;
      if (est !== 'CERRADO') {
        r.abiertos++;
        var lim = limite(x);
        var venc = lim ? lim.getTime() < ahora.getTime()
          : (typeof atsVencido === 'function' && atsVencido(x)); // filas del ATS
        if (venc) r.vencidos++;
        var ab = fecha(x.openedAt || x.creadoEn || x.fechaDesde);
        if (ab && ab.getTime() >= hoy) r.abiertosHoy++;
      } else {
        var c = fecha(x.updatedAt || x.cerradoEn || x.fechaCierre || x.fechaHasta);
        if (c && c.getTime() >= hace7) r.cerrados7++;
      }
    });
    return r;
  }

  function guardar(clave, datos) {
    try { localStorage.setItem(CLAVE_CACHE + clave, JSON.stringify({ t: Date.now(), d: datos })); } catch (e) {}
  }
  function guardado(clave) {
    try { var v = JSON.parse(localStorage.getItem(CLAVE_CACHE + clave) || 'null'); return v && v.d ? v : null; } catch (e) { return null; }
  }

  // Devuelve { datos, deCache, cuando } o null si no hay nada.
  // Se usa fetch directo (no fetchWithRetry) para no abrir la ventana
  // de la clave solo por cargar una portada.
  async function consultar(clave) {
    var cfg = (typeof PORTAL_CONFIG !== 'undefined' && PORTAL_CONFIG.BACKENDS || {})[clave];
    if (!cfg || !cfg.url) return null;
    try {
      var url = cfg.url + '?' + (cfg.listQuery || 'list=1') + '&token=' + encodeURIComponent(PORTAL_CONFIG.API_TOKEN);
      var ctrl = window.AbortController ? new AbortController() : null;
      var t = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;
      var res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
      if (t) clearTimeout(t);
      var j = await res.json();
      if (!j || !j.ok || !Array.isArray(j.rows)) throw new Error('sin datos');
      var d = calcular(j.rows);
      guardar(clave, d);
      return { datos: d, deCache: false, cuando: Date.now() };
    } catch (e) {
      var g = guardado(clave);
      return g ? { datos: g.d, deCache: true, cuando: g.t } : null;
    }
  }

  function haceCuanto(ms) {
    var min = Math.round((Date.now() - ms) / 60000);
    if (min < 1) return 'hace un momento';
    if (min < 60) return 'hace ' + min + ' min';
    var h = Math.round(min / 60);
    if (h < 24) return 'hace ' + h + (h === 1 ? ' hora' : ' horas');
    var d = Math.round(h / 24);
    return 'hace ' + d + (d === 1 ? ' día' : ' días');
  }

  window.ResumenPermisos = { consultar: consultar, calcular: calcular, haceCuanto: haceCuanto };
})();
