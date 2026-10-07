/* ============================================================
   ui-extra.js — Detalles visuales comunes a todo el portal:
   1) Avisos propios en lugar de la ventana gris de alert().
   2) Íconos de línea en lugar de emojis en textos y botones.
   No toca confirm(): ese sí debe detener el código hasta que
   la persona responda, y lo hace la ventana del navegador.
   ============================================================ */
(function () {
  'use strict';

  /* ── 1) Avisos ── */
  var cola = [], abierto = false;
  function esGrave(t) { return /^\s*(⚠|❌)|no coincide|NO cierres|ATENCI[ÓO]N|error/i.test(t); }
  function esLargo(t) { return t.length > 150 || /\n\s*\n/.test(t) || (t.match(/\n/g) || []).length > 2; }

  function limpiar(t) { return String(t == null ? '' : t).replace(/^\s*[⚠❌✅✓]️?\s*/, '').trim(); }

  function toast(t, grave) {
    var cont = document.querySelector('.ux-toasts');
    if (!cont) { cont = document.createElement('div'); cont.className = 'ux-toasts'; cont.setAttribute('aria-live', 'polite'); document.body.appendChild(cont); }
    var el = document.createElement('div');
    el.className = 'ux-toast' + (grave ? ' grave' : '');
    el.setAttribute('role', grave ? 'alert' : 'status');
    el.innerHTML = '<span class="ux-toast-ic"></span><span class="ux-toast-txt"></span><button type="button" aria-label="Cerrar">×</button>';
    el.querySelector('.ux-toast-txt').textContent = limpiar(t);
    cont.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('on'); });
    var quitar = function () { el.classList.remove('on'); setTimeout(function () { el.remove(); }, 220); };
    el.querySelector('button').addEventListener('click', quitar);
    setTimeout(quitar, grave ? 9000 : 4500);
  }

  function modal(t, grave) {
    cola.push({ t: t, grave: grave });
    if (!abierto) siguiente();
  }
  function siguiente() {
    var m = cola.shift();
    if (!m) { abierto = false; return; }
    abierto = true;
    var texto = limpiar(m.t);
    var lineas = texto.split('\n');
    var titulo = '';
    if (lineas.length > 1 && lineas[0].length < 90) titulo = lineas.shift().replace(/:\s*$/, '');
    var capa = document.createElement('div');
    capa.className = 'ux-modal' + (m.grave ? ' grave' : '');
    capa.setAttribute('role', 'alertdialog');
    capa.setAttribute('aria-modal', 'true');
    capa.innerHTML = '<div class="ux-modal-caja"><div class="ux-modal-ic"></div>' +
      (titulo ? '<h3></h3>' : '') + '<div class="ux-modal-txt"></div>' +
      '<button type="button" class="ux-modal-ok">Entendido</button></div>';
    if (titulo) capa.querySelector('h3').textContent = titulo;
    capa.querySelector('.ux-modal-txt').textContent = lineas.join('\n').trim();
    document.body.appendChild(capa);
    requestAnimationFrame(function () { capa.classList.add('on'); });
    var ok = capa.querySelector('.ux-modal-ok');
    var foco = document.activeElement;
    ok.focus();
    var cerrar = function () {
      document.removeEventListener('keydown', tecla);
      capa.classList.remove('on');
      setTimeout(function () { capa.remove(); try { foco && foco.focus && foco.focus(); } catch (e) {} siguiente(); }, 200);
    };
    var tecla = function (e) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); cerrar(); } };
    ok.addEventListener('click', cerrar);
    document.addEventListener('keydown', tecla);
  }

  var alertaNativa = window.alert;
  window.alert = function (mensaje) {
    var t = String(mensaje == null ? '' : mensaje);
    if (!document.body) return alertaNativa.call(window, t);
    var grave = esGrave(t);
    if (grave || esLargo(t)) modal(t, grave); else toast(t, false);
  };

  /* ── 2) Emojis → íconos de línea ── */
  var P = {
    alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    carpeta: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    personas: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    persona: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    imprimir: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    ojo: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    ok: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    llave: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>',
    repetir: '<path d="m17 1 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    guardar: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    basura: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    nube: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    pluma: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    buscar: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    camara: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    reloj: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    escudo: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    brujula: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z"/>',
    llama: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    escalera: '<path d="M8 2v20M16 2v20M8 6h8M8 11h8M8 16h8"/>',
    hueco: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>',
    grua: '<path d="M6 21V3l12 4H6M6 7l-3 2M18 7v6M16 13h4v3h-4zM3 21h8"/>',
    rayo: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    lista: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>',
    senal: '<path d="M12 20h.01M8.5 16.43a5 5 0 0 1 7 0M5 12.86a10 10 0 0 1 14 0M2 8.82a15 15 0 0 1 20 0"/>',
    candado: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    enlace: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    correo: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    casco: '<path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5M4 15v-3a6 6 0 0 1 6-6M14 6a6 6 0 0 1 6 6v3"/>',
    chispa: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>'
  };
  var MAPA = {
    '⚠': 'alerta', '❗': 'alerta', '❌': 'alerta', '🚨': 'alerta', '⛔': 'alerta',
    '📁': 'carpeta', '📂': 'carpeta', '🗂': 'carpeta',
    '👥': 'personas', '👤': 'persona', '🙋': 'persona',
    '🖨': 'imprimir', '👁': 'ojo', '👀': 'ojo',
    '✅': 'ok', '✔': 'ok', '☑': 'ok',
    '🔑': 'llave', '🔐': 'llave', '🔒': 'candado', '🔓': 'candado',
    '📝': 'doc', '📄': 'doc', '📃': 'doc', '🧾': 'doc', '📑': 'doc',
    '🔁': 'repetir', '🔄': 'repetir', '🔃': 'repetir',
    '💾': 'guardar', '🗑': 'basura', '☁': 'nube', '✍': 'pluma', '🖊': 'pluma', '✏': 'pluma',
    '📅': 'calendario', '📆': 'calendario', '🗓': 'calendario',
    '🔍': 'buscar', '🔎': 'buscar', '📷': 'camara', '📸': 'camara',
    '⏳': 'reloj', '⌛': 'reloj', '⏰': 'reloj', '🕒': 'reloj',
    '🦺': 'escudo', '🛡': 'escudo', '🧭': 'brujula', '🔥': 'llama', '🧗': 'escalera', '🪜': 'escalera',
    '🕳': 'hueco', '🏗': 'grua', '⚡': 'rayo', '📋': 'lista', '📡': 'senal', '📶': 'senal',
    '🔗': 'enlace', '📧': 'correo', '✉': 'correo', '📩': 'correo', '➕': 'mas', '👷': 'casco', '⛑': 'casco', '✨': 'chispa'
  };
  var RE = /(?:\p{Extended_Pictographic}|[☀-➿])(?:️|[\u{1F3FB}-\u{1F3FF}])?(?:‍(?:\p{Extended_Pictographic}|[☀-➿])️?)*/gu;
  var EXCLUIR = 'script,style,textarea,input,select,option,svg,canvas,code,pre,[contenteditable],.hp,.ux-sin-iconos,title';
  // ✓ ✕ ↻ → ← ☰ son signos tipográficos: se dejan
  var SIGNOS = /^[✓✕✖↻→←↑↓☰·•]$/;

  function iconoSvg(nombre) {
    return '<svg class="ux-ic" viewBox="0 0 24 24" aria-hidden="true">' + P[nombre] + '</svg>';
  }
  function procesarTexto(nodo) {
    var t = nodo.nodeValue;
    if (!t || !RE.test(t)) { RE.lastIndex = 0; return; }
    RE.lastIndex = 0;
    var padre = nodo.parentNode;
    if (!padre || (padre.closest && padre.closest(EXCLUIR))) return;
    var frag = document.createDocumentFragment(), ultimo = 0, m, cambio = false;
    while ((m = RE.exec(t))) {
      var base = Array.from(m[0])[0];
      if (SIGNOS.test(base)) continue;
      cambio = true;
      if (m.index > ultimo) frag.appendChild(document.createTextNode(t.slice(ultimo, m.index)));
      var nombre = MAPA[base];
      if (nombre) {
        var s = document.createElement('span');
        s.className = 'ux-ico ux-' + nombre;
        s.innerHTML = iconoSvg(nombre);
        frag.appendChild(s);
      }
      ultimo = m.index + m[0].length;
      // quita el espacio sobrante cuando el emoji se elimina sin reemplazo
      if (!nombre && t.charAt(ultimo) === ' ') ultimo++;
    }
    if (!cambio) return;
    if (ultimo < t.length) frag.appendChild(document.createTextNode(t.slice(ultimo)));
    padre.replaceChild(frag, nodo);
  }
  function recorrer(raiz) {
    if (!raiz) return;
    if (raiz.nodeType === 3) { procesarTexto(raiz); return; }
    if (raiz.nodeType !== 1 || (raiz.matches && raiz.matches(EXCLUIR))) return;
    var w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, null), lista = [], n;
    while ((n = w.nextNode())) lista.push(n);
    lista.forEach(procesarTexto);
  }
  // Placeholders y títulos (atributos) también, sin íconos: solo se quita el emoji
  function limpiarAtributos(raiz) {
    if (!raiz || raiz.nodeType !== 1) return;
    var els = raiz.querySelectorAll ? raiz.querySelectorAll('[placeholder],[title],[aria-label]') : [];
    Array.prototype.forEach.call(els, function (el) {
      ['placeholder', 'title', 'aria-label'].forEach(function (a) {
        var v = el.getAttribute(a);
        if (v && RE.test(v)) { RE.lastIndex = 0; el.setAttribute(a, v.replace(RE, function (x) { return SIGNOS.test(x.charAt(0)) ? x : ''; }).replace(/\s{2,}/g, ' ').trim()); }
        RE.lastIndex = 0;
      });
    });
  }

  function iniciar() {
    recorrer(document.body);
    limpiarAtributos(document.body);
    new MutationObserver(function (cambios) {
      cambios.forEach(function (c) {
        if (c.type === 'characterData') procesarTexto(c.target);
        else c.addedNodes.forEach(function (n) { recorrer(n); limpiarAtributos(n); });
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
