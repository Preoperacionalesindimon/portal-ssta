/* ============================================================
   portal-ui.js — Encabezado nuevo + modo claro/oscuro para ATS,
   tablero, asistencia, inspección de EPP, personal autorizado y
   estado. Se carga en el <head> para aplicar el tema sin destello.
   No cambia ids ni eventos: solo reacomoda lo visual.
   ============================================================ */
(function () {
  var raiz = document.documentElement;
  var guardado = null;
  try { guardado = localStorage.getItem('ssta-tema'); } catch (e) {}
  if (guardado === 'dark' || guardado === 'light') raiz.setAttribute('data-theme', guardado);
  var sistema = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  raiz.classList.toggle('oscuro', guardado ? guardado === 'dark' : !!(sistema && sistema.matches));

  var ACENTO = {
    'ats': '#0f5e63', 'dashboard': '#b98f00', 'asistencia': '#a8851c', 'inspeccion-epp': '#1f6f8b',
    'personal-autorizado': '#a8851c', 'estado': '#b98f00'
  };
  var I = {
    atras: '<path d="m15 18-6-6 6-6"/>',
    luna: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'
  };
  function svg(n, c) { return '<svg class="pui-ic' + (c ? ' ' + c : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + I[n] + '</svg>'; }
  var EMOJI = /^[\s‍️←-⇿⌀-➿⬀-⯿]*(?:[\ud83c-\ud83e][\udc00-\udfff][\s‍️]*)*/;

  function rotular() {
    var o = raiz.classList.contains('oscuro');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = o ? '#0f1318' : '#ffffff';
    document.querySelectorAll('.pui-btema').forEach(function (b) {
      b.setAttribute('aria-label', o ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
      b.title = b.getAttribute('aria-label');
    });
  }
  function botonTema() {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'pui-btn pui-btema';
    b.innerHTML = svg('luna', 'i-luna') + svg('sol', 'i-sol');
    b.addEventListener('click', function () {
      var nuevo = raiz.classList.contains('oscuro') ? 'light' : 'dark';
      raiz.setAttribute('data-theme', nuevo);
      raiz.classList.toggle('oscuro', nuevo === 'dark');
      try { localStorage.setItem('ssta-tema', nuevo); } catch (e) {}
      rotular();
    });
    return b;
  }
  if (sistema && sistema.addEventListener) sistema.addEventListener('change', function (e) {
    if (!raiz.getAttribute('data-theme')) { raiz.classList.toggle('oscuro', e.matches); rotular(); }
  });

  // Quita el emoji del inicio de los títulos (aunque el script de la página lo vuelva a poner)
  function limpiarTitulo(h1) {
    var n = h1.firstChild;
    if (n && n.nodeType === 3) { var t = n.nodeValue.replace(EMOJI, ''); if (t !== n.nodeValue) n.nodeValue = t; }
  }


  // ── Menú del ATS con la misma portada de los permisos ──
  var I_ATS = '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z"/>';
  function armarMenuAts() {
    var menu = document.getElementById('menuAts');
    if (!menu || menu.querySelector('.pui-hero')) return;
    document.body.classList.add('pui', 'ats-portada');
    var cont = menu.querySelector('.menu-in') || menu;
    var cod = document.getElementById('codFormatoMenu');
    var lead = cont.querySelector(':scope > p');

    var hero = document.createElement('header');
    hero.className = 'pui-hero';
    hero.innerHTML =
      '<div class="pui-bar">' +
        '<a class="pui-btn" href="index.html" aria-label="Volver al portal" title="Volver al portal">' + svg('atras') + '</a>' +
        '<span class="pui-logo" role="img" aria-label="INDIMON"></span>' +
        '<div class="pui-id"><b>Portal SSTA</b><br>ATS</div>' +
        '<span class="pui-code"></span>' +
      '</div>' +
      '<div class="pui-kick"><span><svg class="pui-ic" viewBox="0 0 24 24" aria-hidden="true">' + I_ATS + '</svg></span>Formato ATS</div>' +
      '<h1>Análisis de trabajo seguro</h1>';
    hero.querySelector('.pui-bar').appendChild(botonTema());
    // El código del formato lo llena ats.html al arrancar: se copia cuando esté
    var chip = hero.querySelector('.pui-code');
    function copiarCod() { var t = cod ? cod.textContent.trim() : ''; chip.textContent = t.replace(/·\s*Versi[oó]n\s*/i, '· V'); chip.style.display = t ? '' : 'none'; }
    copiarCod();
    if (cod) new MutationObserver(copiarCod).observe(cod, { childList: true, characterData: true, subtree: true });
    if (lead) {
      lead.classList.add('pui-lead');
      lead.textContent = 'Se guarda en la hoja compartida: se abre en un equipo, se le suma personal desde otro y se cierra al terminar.';
      hero.appendChild(lead);
    }
    cont.insertBefore(hero, cont.firstChild);

    // Cifras reales
    if (window.ResumenPermisos) {
      var caja = document.createElement('div');
      caja.className = 'pui-stats cargando';
      caja.innerHTML =
        '<button type="button" class="pui-stat" data-ir="menuAbiertosCerrar"><b data-k="abiertos">–</b><small>abiertos ahora</small></button>' +
        '<button type="button" class="pui-stat pui-stat-vencidos" data-ir="menuAbiertosCerrar"><b data-k="vencidos">–</b><small>vencidos</small></button>' +
        '<button type="button" class="pui-stat" data-ir="menuHistorial"><b data-k="cerrados7">–</b><small>cerrados en 7 días</small></button>';
      var nota = document.createElement('div');
      nota.className = 'pui-stats-nota';
      nota.textContent = 'Consultando la hoja…';
      hero.appendChild(caja); hero.appendChild(nota);
      caja.querySelectorAll('.pui-stat').forEach(function (b) {
        b.addEventListener('click', function () {
          var d = document.getElementById(b.getAttribute('data-ir'));
          if (d) { d.click(); (document.getElementById('opCerrar') || d).scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        });
      });
      ResumenPermisos.consultar('ats').then(function (r) {
        caja.classList.remove('cargando');
        if (!r) { caja.classList.add('sin-datos'); nota.textContent = 'Sin conexión con la hoja: las cifras aparecen cuando vuelva la señal.'; return; }
        Object.keys(r.datos).forEach(function (k) { var el = caja.querySelector('[data-k="' + k + '"]'); if (el) el.textContent = r.datos[k]; });
        caja.classList.toggle('hay-vencidos', r.datos.vencidos > 0);
        nota.textContent = r.deCache ? 'Sin señal: cifras guardadas ' + ResumenPermisos.haceCuanto(r.cuando) + '.'
          : (r.datos.abiertosHoy ? r.datos.abiertosHoy + (r.datos.abiertosHoy === 1 ? ' empezó hoy' : ' empezaron hoy') + ' · ' : '') + 'Actualizado ahora.';
      });
    }

    // Opciones: ícono + texto arriba, botones abajo (se mueven, no se copian: conservan sus eventos)
    menu.querySelectorAll('.opcion').forEach(function (op) {
      if (op.querySelector('.op-acc')) return;
      var acc = document.createElement('div');
      acc.className = 'op-acc';
      var desc = op.querySelector(':scope > p');
      Array.prototype.slice.call(op.children).forEach(function (c) {
        if (c.matches('.ico, h3') || c === desc) return;
        acc.appendChild(c);
      });
      op.appendChild(acc);
    });

    // Pasos: títulos reales de las secciones del formulario
    var titulos = [];
    document.querySelectorAll('#atsApp .section > .section-title, #atsApp .section-title').forEach(function (t) {
      var c = t.cloneNode(true); c.querySelectorAll('.cuenta, button').forEach(function (x) { x.remove(); });
      var txt = c.textContent.replace(/\s+/g, ' ').trim();
      if (txt && !/^(cerrar|agregar)/i.test(txt) && titulos.indexOf(txt) < 0) titulos.push(txt);
    });
    if (titulos.length) {
      var pasos = document.createElement('section');
      pasos.className = 'pui-pasos';
      pasos.innerHTML = '<h3>Así se diligencia</h3><ol></ol>';
      titulos.forEach(function (t) { var li = document.createElement('li'); t = t.toLowerCase(); li.textContent = t.replace(/^([¿¡]?)(.)/, function (_, a, b) { return a + b.toUpperCase(); }); pasos.querySelector('ol').appendChild(li); });
      var ops = menu.querySelector('.opciones');
      if (ops) ops.parentNode.insertBefore(pasos, ops.nextSibling);
    }
  }

  function armar() {
    document.body.classList.add('pui2');
    var pagina = (location.pathname.split('/').pop() || 'index').replace('.html', '');
    if (ACENTO[pagina]) raiz.style.setProperty('--pui-acc', ACENTO[pagina]);

    document.querySelectorAll('.hdr, .header').forEach(function (h) {
      if (h.classList.contains('pui-h')) return;
      h.classList.add('pui-h');
      h.removeAttribute('style');
      // Texto suelto (eyebrow, h1, p) va en un solo bloque
      if (!h.querySelector('.marca-titulo')) {
        var txt = document.createElement('div');
        txt.className = 'pui-txt';
        Array.prototype.slice.call(h.children).forEach(function (c) {
          if (c.matches('.eyebrow, h1, p, .cod')) txt.appendChild(c);
        });
        h.appendChild(txt);
      }
      // Enlace de volver → botón con flecha (conserva id y eventos)
      h.querySelectorAll('a').forEach(function (a) {
        if (a.classList.contains('back') || /volver|←/i.test(a.textContent)) {
          var etiqueta = a.textContent.replace(/←/g, '').trim() || 'Volver';
          a.classList.add('pui-atras');
          a.setAttribute('aria-label', etiqueta); a.title = etiqueta;
          a.innerHTML = svg('atras') + '<span class="pui-sr">' + etiqueta + '</span>';
        }
      });
      h.appendChild(botonTema());
      var t = h.querySelector('h1');
      if (t) {
        limpiarTitulo(t);
        new MutationObserver(function () { limpiarTitulo(t); }).observe(t, { childList: true, characterData: true, subtree: true });
      }
    });
    if (pagina === 'ats') armarMenuAts();
    if (pagina === 'asistencia' || pagina === 'personal-autorizado') document.body.classList.add('pui-af');
    rotular();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', armar);
  else armar();
})();
