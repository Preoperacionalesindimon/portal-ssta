/* ============================================================
   permiso-ui.js — Portada nueva de los permisos + modo claro/oscuro.
   Se carga en el <head> (antes de pintar) para que el tema se
   aplique sin destello. Solo reacomoda lo visual de #landing:
   los ids, campos y eventos de permiso-core.js quedan iguales.
   ============================================================ */
(function () {
  var raiz = document.documentElement;

  // ── Tema: el elegido en este equipo (compartido con el inicio) o el del sistema ──
  var guardado = null;
  try { guardado = localStorage.getItem('ssta-tema'); } catch (e) {}
  if (guardado === 'dark' || guardado === 'light') raiz.setAttribute('data-theme', guardado);
  var sistemaOscuro = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  raiz.classList.toggle('oscuro', guardado ? guardado === 'dark' : !!(sistemaOscuro && sistemaOscuro.matches));

  var NS = 'http://www.w3.org/2000/svg';
  var ICONOS = {
    atras: '<path d="m15 18-6-6 6-6"/>',
    luna: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    alturas: '<path d="M8 2v20M16 2v20M8 6h8M8 11h8M8 16h8"/>',
    caliente: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    confinados: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>',
    izajes: '<path d="M6 21V3l12 4H6M6 7l-3 2M18 7v6M16 13h4v3h-4zM3 21h8"/>',
    electrico: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>'
  };
  function icono(nombre, extra) {
    return '<svg class="pui-ic' + (extra ? ' ' + extra : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICONOS[nombre] + '</svg>';
  }
  function tipoPermiso() {
    var f = location.pathname.split('/').pop();
    if (/alturas/.test(f)) return 'alturas';
    if (/caliente/.test(f)) return 'caliente';
    if (/confinados/.test(f)) return 'confinados';
    if (/izajes/.test(f)) return 'izajes';
    if (/electrico/.test(f)) return 'electrico';
    return 'alturas';
  }

  function botonTema() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pui-btn pui-btema';
    b.innerHTML = icono('luna', 'i-luna') + icono('sol', 'i-sol');
    b.addEventListener('click', function () {
      var nuevo = raiz.classList.contains('oscuro') ? 'light' : 'dark';
      raiz.setAttribute('data-theme', nuevo);
      raiz.classList.toggle('oscuro', nuevo === 'dark');
      try { localStorage.setItem('ssta-tema', nuevo); } catch (e) {}
      rotular();
    });
    return b;
  }
  function rotular() {
    var o = raiz.classList.contains('oscuro');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = o ? '#0f1318' : '#ffffff';
    document.querySelectorAll('.pui-btema').forEach(function (b) {
      b.setAttribute('aria-label', o ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
      b.title = b.getAttribute('aria-label');
    });
  }
  if (sistemaOscuro && sistemaOscuro.addEventListener) {
    sistemaOscuro.addEventListener('change', function (e) {
      if (!raiz.getAttribute('data-theme')) { raiz.classList.toggle('oscuro', e.matches); rotular(); }
    });
  }


  // ── Cifras reales: abiertos, vencidos y cerrados en 7 días ──
  function ponerCifras(hero, clave) {
    if (!window.ResumenPermisos) return;
    var caja = document.createElement('div');
    caja.className = 'pui-stats cargando';
    caja.innerHTML =
      '<button type="button" class="pui-stat" data-ir="listOpenBtn"><b data-k="abiertos">–</b><small>abiertos ahora</small></button>' +
      '<button type="button" class="pui-stat pui-stat-vencidos" data-ir="listOpenBtn"><b data-k="vencidos">–</b><small>vencidos</small></button>' +
      '<button type="button" class="pui-stat" data-ir="listClosedBtn"><b data-k="cerrados7">–</b><small>cerrados en 7 días</small></button>';
    var nota = document.createElement('div');
    nota.className = 'pui-stats-nota';
    nota.textContent = 'Consultando la hoja…';
    hero.appendChild(caja);
    hero.appendChild(nota);
    caja.querySelectorAll('.pui-stat').forEach(function (b) {
      b.addEventListener('click', function () {
        var destino = document.getElementById(b.getAttribute('data-ir'));
        if (!destino) return;
        var tarjeta = document.getElementById('cardClose');
        var panel = document.getElementById('historyPanel');
        // El historial se abre/cierra con el mismo botón: no cerrarlo si ya está abierto
        if (b.getAttribute('data-ir') !== 'listClosedBtn' || !panel || panel.style.display === 'none') destino.click();
        (tarjeta || destino).scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    ResumenPermisos.consultar(clave).then(function (r) {
      caja.classList.remove('cargando');
      if (!r) { caja.classList.add('sin-datos'); nota.textContent = 'Sin conexión con la hoja: las cifras aparecen cuando vuelva la señal.'; return; }
      Object.keys(r.datos).forEach(function (k) {
        var el = caja.querySelector('[data-k="' + k + '"]');
        if (el) el.textContent = r.datos[k];
      });
      caja.classList.toggle('hay-vencidos', r.datos.vencidos > 0);
      nota.textContent = r.deCache
        ? 'Sin señal: cifras guardadas ' + ResumenPermisos.haceCuanto(r.cuando) + '.'
        : (r.datos.abiertosHoy ? r.datos.abiertosHoy + (r.datos.abiertosHoy === 1 ? ' se abrió hoy' : ' se abrieron hoy') + ' · ' : '') + 'Actualizado ahora.';
    });
  }


  // ── Barra fija "Paso X de N" mientras se diligencia ──
  function ponerBarraPasos() {
    var app = document.getElementById('app');
    if (!app || app.querySelector('.pui-paso')) return;
    var barra = document.createElement('div');
    barra.className = 'pui-paso';
    barra.setAttribute('aria-live', 'polite');
    barra.innerHTML = '<div class="pui-paso-fila"><b></b><span></span><em></em></div><div class="pui-paso-barra"></div>';
    var hdr = app.querySelector(':scope > .hdr');
    var ancla = document.getElementById('validationBanner') || (hdr && hdr.nextSibling);
    app.insertBefore(barra, ancla ? ancla.nextSibling : app.firstChild);
    var ultimoN = -1, pendiente = false;

    function secciones() {
      return Array.prototype.filter.call(app.querySelectorAll('.section'), function (s) {
        return s.getClientRects().length && s.querySelector('.section-title');
      });
    }
    function sinResponder(sec) {
      var n = 0;
      sec.querySelectorAll('.check-item, .yn-opts').forEach(function (g) {
        if (!g.getClientRects().length) return;
        var opts = g.matches('.yn-opts') ? g : g.querySelector('.toggle, .yn-opts');
        if (!opts) return;
        if (!opts.querySelector('button[aria-pressed="true"], .active-si, .active-no, .active-na, .active-c')) n++;
      });
      return n;
    }
    function titulo(sec) {
      var t = sec.querySelector('.section-title');
      var txt = '';
      t.childNodes.forEach(function (n) { if (n.nodeType === 3) txt += n.nodeValue; });
      txt = (txt || t.textContent).replace(/^\s*\d+[\.\)]\s*/, '').replace(/\s+/g, ' ').trim();
      return txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase();
    }
    function pintar() {
      pendiente = false;
      var visible = app.style.display !== 'none' && app.getClientRects().length;
      var lista = visible ? secciones() : [];
      if (lista.length < 2 || document.body.classList.contains('modo-agregar-personal')) { barra.classList.remove('on'); return; }
      barra.classList.add('on');
      var limite = window.innerHeight * 0.35, actual = 0;
      lista.forEach(function (s, i) { if (s.getBoundingClientRect().top < limite) actual = i; });
      if (lista.length !== ultimoN) {
        barra.querySelector('.pui-paso-barra').innerHTML = lista.map(function () { return '<i></i>'; }).join('');
        ultimoN = lista.length;
      }
      var faltan = 0;
      barra.querySelectorAll('.pui-paso-barra i').forEach(function (i, k) {
        var f = sinResponder(lista[k]); faltan += f;
        i.className = k === actual ? 'actual' : (f === 0 && k < actual ? 'hecho' : (f === 0 && sinResponderTieneAlgo(lista[k]) ? 'hecho' : ''));
      });
      barra.querySelector('b').textContent = 'Paso ' + (actual + 1) + ' de ' + lista.length;
      barra.querySelector('span').textContent = titulo(lista[actual]);
      barra.querySelector('em').textContent = faltan ? faltan + (faltan === 1 ? ' por responder' : ' por responder') : 'Todo respondido';
    }
    // Una sección "con preguntas" que ya no tiene pendientes cuenta como hecha
    function sinResponderTieneAlgo(sec) { return !!sec.querySelector('.check-item, .yn-opts'); }
    function pedir() { if (!pendiente) { pendiente = true; requestAnimationFrame(pintar); } }
    window.addEventListener('scroll', pedir, { passive: true });
    window.addEventListener('resize', pedir);
    document.addEventListener('click', function () { setTimeout(pedir, 0); });
    // Al pasar de la portada al formulario
    new MutationObserver(pedir).observe(app, { attributes: true, attributeFilter: ['style'] });
    pedir();
  }


  // ── Pantalla de "¡Listo!" cuando el guardado quedó confirmado ──
  function vigilarGuardado() {
    var st = document.getElementById('footerStatus');
    if (!st) return;
    var ultimo = '';
    new MutationObserver(function () {
      var t = st.textContent || '';
      if (t === ultimo) return;
      ultimo = t;
      // Solo cuando el permiso ya verificó (o intentó verificar) contra el servidor
      if (!/Verificado en el servidor|No se pudo verificar/.test(t)) return;
      var banner = document.getElementById('statusBanner');
      if (banner && /warn/.test(banner.className)) return;
      mostrarListo(banner && /closed/.test(banner.className), /No se pudo verificar/.test(t));
    }).observe(st, { childList: true, characterData: true, subtree: true });
  }
  function mostrarListo(cierre, sinVerificar) {
    var codigo = ((document.getElementById('permitCodeDisplay') || {}).textContent || '').trim();
    if (!codigo || codigo === '—' || document.querySelector('.pui-listo')) return;
    var url = location.origin + location.pathname + '?code=' + encodeURIComponent(codigo);
    var qr = '';
    try { if (typeof QR !== 'undefined') qr = QR.comoImagen(url, { px: 220 }); } catch (e) {}
    var titulo = (document.querySelector('.pui-hero h1') || {}).textContent || 'Permiso';
    var capa = document.createElement('div');
    capa.className = 'pui-listo';
    capa.setAttribute('role', 'dialog');
    capa.setAttribute('aria-modal', 'true');
    capa.setAttribute('aria-label', cierre ? 'Permiso cerrado' : 'Permiso guardado');
    capa.innerHTML =
      '<div class="pui-listo-caja">' +
        '<div class="pui-listo-ok"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></div>' +
        '<h2>' + (cierre ? 'Permiso cerrado' : '¡Permiso abierto!') + '</h2>' +
        '<p>' + (cierre ? 'El cierre quedó guardado en la hoja.' : 'Quedó guardado en la hoja. Comparte el código con quien hará el cierre.') +
          (sinVerificar ? ' <b>No se pudo releer del servidor: revísalo cuando tengas señal.</b>' : '') + '</p>' +
        '<div class="pui-listo-cod"><small>' + titulo.replace(/</g, '&lt;') + '</small><b></b></div>' +
        (qr && !cierre ? '<img class="pui-listo-qr" alt="Código QR del permiso" src="' + qr + '"><div class="pui-listo-qrtxt">Escanéalo para abrir este permiso en otro celular</div>' : '') +
        '<div class="pui-listo-acc">' +
          (!cierre ? '<button type="button" class="pl-prim" data-a="compartir">Compartir código</button>' : '') +
          '<button type="button" data-a="copiar">Copiar código</button>' +
          '<button type="button" data-a="ver">Ver el permiso</button>' +
          '<a href="index.html">Volver al portal</a>' +
        '</div>' +
      '</div>';
    capa.querySelector('.pui-listo-cod b').textContent = codigo;
    document.body.appendChild(capa);
    requestAnimationFrame(function () { capa.classList.add('on'); });
    var cerrar = function () { capa.classList.remove('on'); setTimeout(function () { capa.remove(); }, 200); };
    capa.addEventListener('click', function (e) { if (e.target === capa) cerrar(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { cerrar(); document.removeEventListener('keydown', esc); } });
    capa.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-a');
        if (a === 'ver') return cerrar();
        if (a === 'compartir' && navigator.share) {
          navigator.share({ title: titulo + ' ' + codigo, text: titulo + ' · código ' + codigo, url: url }).catch(function () {});
          return;
        }
        var texto = a === 'compartir' ? titulo + ' · código ' + codigo + '\n' + url : codigo;
        var ok = function () { var o = b.textContent; b.textContent = '¡Copiado!'; setTimeout(function () { b.textContent = o; }, 1500); };
        if (navigator.clipboard) navigator.clipboard.writeText(texto).then(ok, function () { prompt('Copia el código:', texto); });
        else prompt('Copia el código:', texto);
      });
    });
    var prim = capa.querySelector('button'); if (prim) prim.focus();
  }

  function armarPortada() {
    document.body.classList.add('pui');
    if (!document.querySelector('meta[name="theme-color"]')) {
      var m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m);
    }
    var landing = document.getElementById('landing');
    if (!landing || landing.querySelector('.pui-hero')) { rotular(); return; }
    var viejo = landing.querySelector('.hdr');
    var titulo = viejo && viejo.querySelector('h1') ? viejo.querySelector('h1').textContent.trim() : document.title;
    // "Permiso de Trabajo en Alturas" -> "Trabajo en alturas"
    var corto = titulo.replace(/^Permiso\s+(de|para)\s+(Trabajos?\s+en\s+)?/i, function (_, __, t) { return t ? t : ''; });
    corto = corto.charAt(0).toUpperCase() + corto.slice(1).toLowerCase();
    var meta = viejo && viejo.querySelector('.meta') ? viejo.querySelector('.meta').textContent.replace(/C[oó]digo:\s*/i, '').trim() : '';
    var lead = landing.querySelector(':scope > p');
    var tipo = tipoPermiso();

    var hero = document.createElement('header');
    hero.className = 'pui-hero';
    hero.innerHTML =
      '<div class="pui-bar">' +
        '<a class="pui-btn" href="index.html" aria-label="Volver al portal" title="Volver al portal">' + icono('atras') + '</a>' +
        '<span class="pui-logo" role="img" aria-label="INDIMON"></span>' +
        '<div class="pui-id"><b>Portal SSTA</b><br>Permisos</div>' +
        (meta ? '<span class="pui-code">' + meta.replace(/</g, '&lt;') + '</span>' : '') +
      '</div>' +
      '<div class="pui-kick"><span>' + icono(tipo) + '</span>Permiso de trabajo</div>' +
      '<h1></h1>';
    hero.querySelector('h1').textContent = corto;
    if (!meta) hero.querySelector('.pui-bar').appendChild(document.createElement('span')).style.marginLeft = 'auto';
    hero.querySelector('.pui-bar').appendChild(botonTema());
    if (lead) {
      lead.classList.add('pui-lead');
      lead.textContent = 'Se guarda en la hoja compartida: ábrelo en un equipo y ciérralo desde otro buscándolo por su código.';
      hero.appendChild(lead);
    }
    landing.insertBefore(hero, landing.firstChild);
    ponerCifras(hero, tipo);

    // El enlace "← Volver al portal" lo reemplaza el botón de la portada
    landing.querySelectorAll(':scope > a[href="index.html"]').forEach(function (a) { a.classList.add('pui-volver-viejo'); });

    // "Así se diligencia": los títulos reales de las secciones del formulario
    var titulos = [];
    document.querySelectorAll('#app .section > .section-title').forEach(function (t) {
      var txt = t.textContent.replace(/^\s*\d+[\.\)]\s*/, '').replace(/\s+/g, ' ').replace(/\s*\d+\s*\/\s*\d+\s*$/, '').replace(/\s*Todo C\s*$/i, '').trim();
      if (txt && titulos.indexOf(txt) < 0 && !/cierre|cancelaci/i.test(txt)) titulos.push(txt);
    });
    if (titulos.length) {
      var caja = document.createElement('section');
      caja.className = 'pui-pasos';
      caja.innerHTML = '<h3>Así se diligencia</h3><ol></ol>';
      var ol = caja.querySelector('ol');
      titulos.slice(0, 6).forEach(function (t) {
        var li = document.createElement('li');
        li.textContent = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
        ol.appendChild(li);
      });
      if (titulos.length > 6) {
        var mas = document.createElement('li');
        var resto = titulos.length - 6;
        mas.className = 'mas';
        mas.textContent = 'y ' + resto + (resto === 1 ? ' sección más' : ' secciones más') + ' hasta las firmas';
        ol.appendChild(mas);
      }
      var opciones = landing.querySelector('.landing-choices');
      if (opciones) opciones.parentNode.insertBefore(caja, opciones.nextSibling);
    }

    // Botón de tema también en el encabezado del formulario
    var hdrApp = document.querySelector('#app > .hdr');
    if (hdrApp && !hdrApp.querySelector('.pui-btema')) {
      var t = botonTema();
      var metaApp = hdrApp.querySelector('.meta');
      var envoltura = document.createElement('div');
      envoltura.style.cssText = 'display:flex;align-items:center;gap:8px;position:relative;z-index:1;';
      if (metaApp) { hdrApp.insertBefore(envoltura, metaApp); envoltura.appendChild(metaApp); }
      else hdrApp.appendChild(envoltura);
      envoltura.appendChild(t);
    }
    ponerBarraPasos();
    vigilarGuardado();
    rotular();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', armarPortada);
  else armarPortada();
})();
