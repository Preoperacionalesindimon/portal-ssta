/* ============================================================
   entregas-epp.js — Entrega de EPP dentro de la inspección (SSTA-F-006)
   ------------------------------------------------------------
   · SSTA-F-014  Reposición por DESGASTE: lo que una inspección marcó en M.
   · SSTA-F-013  Reposición por PÉRDIDA.

   Usa lo que ya define inspeccion-epp.html (no lo duplica): esc, TOKEN,
   EPP_URL, personalCache, attachPersonalAutocomplete, sigMgr/pads,
   showScreen y fetchWithRetry/Outbox de common.js.
   El servidor (backend-epp.gs) vuelve a validar todo antes de guardar.
   ============================================================ */
(function () {
  'use strict';
  if (typeof TIPO !== 'undefined' && TIPO !== 'epp') {
    // Brigadistas tiene otro proceso de dotación: no se muestran entregas.
    const t = document.getElementById('tabEntregas'); if (t) t.remove();
    return;
  }
  const $ = (id) => document.getElementById(id);

  /* ── Catálogo: los elementos de la inspección + lo que el formato tiene aparte ── */
  const CATALOGO = [
    'CASCO CON BARBUQUEJO', 'SOPORTE BASCULANTE', 'VISOR', 'CARETA DE SOLDAR',
    'GAFAS TRANSPARENTES', 'GAFAS OSCURAS', 'GAFAS DE SOBREPONER',
    'PROTECTOR AUDITIVO DE COPA', 'PROTECTOR AUDITIVO DE INSERCIÓN', 'TAPABOCAS',
    'PROTECCIÓN RESPIRATORIA MEDIA CARA', 'FILTROS / CARTUCHO', 'PREFILTRO',
    'PETO MANGAS / CHAQUETA SOLDADOR', 'GUANTES DE CAUCHO NITRILO', 'GUANTES DE VAQUETA',
    'GUANTES DE PRECISIÓN', 'GUANTES DE IMPACTO / ANTICORTE', 'BOTAS DE SEGURIDAD', 'CARNÉT'
  ];
  const OTRO = '__otro__';

  /* ── Columnas del formato (iguales en F-013 y F-014) ── */
  const COLUMNAS = [
    { k: 'casco', t: 'CASCO CON BARBUQUEJO', v: true },
    { k: 'soporte', t: 'SOPORTE BASCULANTE', v: true },
    { k: 'visor', t: 'VISOR', v: true },
    { k: 'gafasT', t: 'GAFAS TRANS.', v: true },
    { k: 'gafasO', t: 'GAFAS OSCURAS', v: true },
    { k: 'copa', t: 'Copa', grupo: 'PROTECCIÓN AUDITIVA' },
    { k: 'insercion', t: 'Inserción', grupo: 'PROTECCIÓN AUDITIVA' },
    { k: 'tapabocas', t: 'TAPABOCAS', v: true },
    { k: 'guantes', t: 'TIPO DE GUANTES', ancho: true },
    { k: 'peto', t: 'PETO MANGAS / CHAQUETA SOLDADOR', v: true },
    { k: 'mediaCara', t: 'MEDIA CARA', v: true },
    { k: 'filtro', t: 'FILTRO HUMOS METÁLICOS', v: true },
    { k: 'otros', t: 'OTROS', ancho: true }
  ];
  function columnaDe(el) {
    const e = String(el).toUpperCase();
    if (e === 'CASCO CON BARBUQUEJO') return 'casco';
    if (e === 'SOPORTE BASCULANTE') return 'soporte';
    if (e === 'VISOR') return 'visor';
    if (e === 'GAFAS TRANSPARENTES') return 'gafasT';
    if (e === 'GAFAS OSCURAS') return 'gafasO';
    if (e.indexOf('PROTECTOR AUDITIVO DE COPA') === 0) return 'copa';
    if (e.indexOf('PROTECTOR AUDITIVO') === 0) return 'insercion';
    if (e === 'TAPABOCAS') return 'tapabocas';
    if (e.indexOf('GUANTES') === 0) return 'guantes';
    if (e.indexOf('PETO') === 0) return 'peto';
    if (e.indexOf('MEDIA CARA') !== -1) return 'mediaCara';
    if (e.indexOf('FILTRO') === 0) return 'filtro';
    return 'otros';
  }

  /* ── Estado de la entrega en curso ── */
  let items = [];        // {id, elemento, cantidad, motivo, inspeccionId, origen, fechaInspeccion, elegir, incluido}
  let opId = null;
  let pendientesTodos = [];
  let cargadoPend = false;

  /* ── Utilidades ── */
  const hoyISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const aCorta = (iso) => { if (!iso) return ''; const [a, m, d] = iso.split('-'); return d + '/' + m + '/' + a; };
  const ddmmaaaaAFecha = (v) => {
    if (v instanceof Date) return v;
    const s = String(v || '');
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    const d = new Date(s); return isNaN(d) ? null : d;
  };
  const fechaTxt = (v) => { const d = ddmmaaaaAFecha(v); return d ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear() : String(v || ''); };
  const nuevoId = () => 'it' + Math.random().toString(36).slice(2, 9);
  const genEntregaId = () => { const d = new Date(); return 'ENT-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(Math.floor(Math.random() * 900000) + 100000); };
  let entregaId = genEntregaId();

  /* ── Firma ── */
  sigMgr.setup($('padEntrega'));

  /* ── Pendientes de todos ── */
  async function cargarPendientes() {
    const cont = $('entPendLista');
    try {
      const r = await fetchWithRetry(EPP_URL + '?action=pendientes&token=' + encodeURIComponent(TOKEN));
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'sin datos');
      pendientesTodos = d.personas || [];
      cargadoPend = true;
      pintarPendientes();
    } catch (e) {
      cont.innerHTML = '<div class="ent-vacio">No se pudo consultar la hoja. Revisa la señal; puedes registrar la entrega igual buscando al trabajador abajo.</div>';
      $('entPendCuenta').textContent = '';
    }
  }
  function pintarPendientes() {
    const q = $('entBuscarPend').value.trim().toLowerCase();
    const lista = pendientesTodos.filter(p => !q || String(p.nombre).toLowerCase().includes(q) || String(p.cedula).includes(q));
    const totalEl = pendientesTodos.reduce((n, p) => n + p.pendientes.length, 0);
    $('entPendCuenta').textContent = pendientesTodos.length ? pendientesTodos.length + (pendientesTodos.length === 1 ? ' trabajador' : ' trabajadores') + ' · ' + totalEl + ' elem.' : '';
    const cont = $('entPendLista');
    if (!pendientesTodos.length) { cont.innerHTML = '<div class="ent-vacio ok">No hay elementos pendientes por entregar.</div>'; return; }
    if (!lista.length) { cont.innerHTML = '<div class="ent-vacio">Nadie coincide con la búsqueda.</div>'; return; }
    cont.innerHTML = lista.map(p =>
      '<div class="ent-pend">' +
        '<div class="ent-pend-cab"><div><b>' + esc(p.nombre) + '</b><small>CC ' + esc(p.cedula) + (p.cargo ? ' · ' + esc(p.cargo) : '') + '</small></div>' +
        '<button type="button" data-cc="' + esc(p.cedula) + '">Entregar</button></div>' +
        '<div class="ent-chips">' + p.pendientes.map(x => '<span>' + esc(x.elemento) + '</span>').join('') + '</div>' +
        '<button type="button" class="ent-link" data-hist="' + esc(p.cedula) + '" data-nom="' + esc(p.nombre) + '">Ver lo que se le ha entregado</button>' +
      '</div>').join('');
  }
  $('entBuscarPend').addEventListener('input', pintarPendientes);
  $('entPendLista').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cc]'); if (!b) return;
    const p = pendientesTodos.find(x => String(x.cedula) === b.dataset.cc); if (!p) return;
    const pers = (personalCache || []).find(x => String(x.cedula) === String(p.cedula)) || {};
    elegirTrabajador({ nombre: p.nombre, cedula: p.cedula, cargo: p.cargo || pers.cargo || '' }, p.pendientes);
    $('entForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ── Trabajador ── */
  async function elegirTrabajador(p, pendientesConocidos) {
    $('entNombre').value = p.nombre || '';
    $('entCedula').value = p.cedula || '';
    $('entCargo').value = p.cargo || '';
    // Se conservan los agregados a mano (pérdidas); se reemplazan los de inspección
    items = items.filter(it => !it.inspeccionId);
    let pend = pendientesConocidos;
    if (!pend) {
      $('entItems').innerHTML = '<div class="ent-vacio">Buscando pendientes…</div>';
      try {
        const r = await fetchWithRetry(EPP_URL + '?action=pendientes&cedula=' + encodeURIComponent(p.cedula) + '&token=' + encodeURIComponent(TOKEN));
        const d = await r.json();
        pend = (d.ok && d.personas && d.personas[0]) ? d.personas[0].pendientes : [];
      } catch (e) { pend = []; }
    }
    pend.forEach(x => {
      const auditivo = x.elemento === 'PROTECTOR AUDITIVO';
      items.unshift({
        id: nuevoId(), elemento: auditivo ? '' : x.elemento, origen: x.elemento, cantidad: 1, motivo: 'desgaste',
        inspeccionId: x.inspeccionId, fechaInspeccion: x.fechaInspeccion, elegir: auditivo, incluido: true
      });
    });
    pintarItems();
  }
  attachPersonalAutocomplete($('entNombre'), (p) => elegirTrabajador(p));
  $('entCedula').addEventListener('change', (e) => {
    const cc = e.target.value.trim(); if (!cc) return;
    const pers = (personalCache || []).find(x => String(x.cedula) === cc);
    elegirTrabajador({ nombre: $('entNombre').value.trim() || (pers && pers.nombre) || '', cedula: cc, cargo: $('entCargo').value.trim() || (pers && pers.cargo) || '' });
  });

  /* ── Lista de elementos a entregar ── */
  function pintarItems() {
    const cont = $('entItems');
    if (!items.length) {
      cont.innerHTML = '<div class="ent-vacio">' + ($('entCedula').value.trim()
        ? 'Este trabajador no tiene pendientes de inspección. Agrega abajo lo que se le entrega.'
        : 'Elige un trabajador para ver lo que tiene pendiente.') + '</div>';
    } else {
      cont.innerHTML = items.map(it => {
        const motivoTxt = it.motivo === 'perdida' ? 'Pérdida · F-013' : 'Desgaste · F-014';
        const origen = it.inspeccionId ? 'Inspección ' + esc(it.inspeccionId) + (it.fechaInspeccion ? ' del ' + esc(fechaTxt(it.fechaInspeccion)) : '') : 'Agregado a mano';
        return '<div class="ent-item ' + (it.incluido ? '' : 'fuera ') + (it.motivo === 'perdida' ? 'perdida' : '') + '" data-id="' + it.id + '">' +
          '<label class="ent-check"><input type="checkbox" data-a="incluir" ' + (it.incluido ? 'checked' : '') + ' aria-label="Entregar ' + esc(it.elemento || it.origen) + '"></label>' +
          '<div class="ent-item-txt">' +
            (it.elegir
              ? '<b>Protector auditivo</b><select data-a="tipo"><option value="">Elegir tipo…</option>' +
                ['PROTECTOR AUDITIVO DE COPA', 'PROTECTOR AUDITIVO DE INSERCIÓN'].map(o => '<option ' + (it.elemento === o ? 'selected' : '') + ' value="' + o + '">' + (o.indexOf('COPA') !== -1 ? 'De copa' : 'De inserción') + '</option>').join('') + '</select>'
              : '<b>' + esc(it.elemento) + '</b>') +
            '<small><span class="ent-motivo">' + motivoTxt + '</span>' + origen + '</small>' +
          '</div>' +
          '<input type="number" min="1" value="' + it.cantidad + '" data-a="cant" aria-label="Cantidad" inputmode="numeric">' +
          (it.inspeccionId ? '' : '<button type="button" class="ent-quitar" data-a="quitar" aria-label="Quitar">×</button>') +
        '</div>';
      }).join('');
    }
    const hayPerdida = items.some(it => it.incluido && it.motivo === 'perdida');
    $('entPerdidaBox').hidden = !hayPerdida;
  }
  $('entItems').addEventListener('change', (e) => {
    const fila = e.target.closest('.ent-item'); if (!fila) return;
    const it = items.find(x => x.id === fila.dataset.id); if (!it) return;
    const a = e.target.dataset.a;
    if (a === 'incluir') it.incluido = e.target.checked;
    if (a === 'cant') it.cantidad = Math.max(1, parseInt(e.target.value, 10) || 1);
    if (a === 'tipo') it.elemento = e.target.value;
    pintarItems();
  });
  $('entItems').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a="quitar"]'); if (!b) return;
    const id = b.closest('.ent-item').dataset.id;
    items = items.filter(x => x.id !== id);
    pintarItems();
  });

  // Agregar a mano
  $('entNuevoEl').innerHTML = '<option value="">Agregar un elemento…</option>' +
    CATALOGO.map(c => '<option value="' + esc(c) + '">' + esc(c.charAt(0) + c.slice(1).toLowerCase()) + '</option>').join('') +
    '<option value="' + OTRO + '">Otro (escribir)</option>';
  $('entNuevoEl').addEventListener('change', () => { $('entNuevoOtro').hidden = $('entNuevoEl').value !== OTRO; });
  $('entAgregarBtn').addEventListener('click', () => {
    let el = $('entNuevoEl').value;
    if (el === OTRO) el = $('entNuevoOtro').value.trim().toUpperCase();
    if (!el) { $('entNuevoEl').focus(); return; }
    items.push({ id: nuevoId(), elemento: el, cantidad: Math.max(1, parseInt($('entNuevoCant').value, 10) || 1),
                 motivo: $('entNuevoMotivo').value, incluido: true });
    $('entNuevoEl').value = ''; $('entNuevoOtro').value = ''; $('entNuevoOtro').hidden = true; $('entNuevoCant').value = '1';
    pintarItems();
  });

  /* ── Guardar ── */
  function faltantes() {
    const f = [];
    document.querySelectorAll('#entForm .field-invalid').forEach(x => x.classList.remove('field-invalid'));
    const req = (id, txt) => { const el = $(id); if (!el.value.trim()) { f.push(txt); el.classList.add('field-invalid'); } };
    req('entNombre', 'Nombre del trabajador');
    req('entCedula', 'Cédula');
    req('entFecha', 'Fecha de entrega');
    const sel = items.filter(it => it.incluido);
    if (!sel.length) f.push('Al menos un elemento entregado');
    if (sel.some(it => !it.elemento)) f.push('Elegir si el protector auditivo es de copa o de inserción');
    if (sel.some(it => it.motivo === 'perdida')) req('entPerdida', 'Qué pasó con lo perdido');
    if (!pads.padEntrega.hasInk()) f.push('Firma del trabajador');
    return f;
  }
  $('entGuardar').addEventListener('click', async () => {
    const banner = $('entBanner'), ok = $('entOk');
    ok.classList.remove('show');
    const f = faltantes();
    if (f.length) {
      banner.innerHTML = '<strong>Falta por diligenciar:</strong><ul>' + f.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
      banner.classList.add('show');
      banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    banner.classList.remove('show');
    const btn = $('entGuardar');
    btn.disabled = true; btn.textContent = 'Guardando…';
    if (!opId) opId = 'ent-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    try { localStorage.setItem('ssta-epp-entregador', $('entEntrega').value.trim()); } catch (e) {}
    const payload = {
      token: TOKEN, action: 'entrega', opId: opId, entregaId: entregaId,
      nombre: $('entNombre').value.trim(), cedula: $('entCedula').value.trim(), cargo: $('entCargo').value.trim(),
      centroCosto: $('entCentro').value.trim(), fecha: aCorta($('entFecha').value),
      entregadoPor: $('entEntrega').value.trim(),
      items: items.filter(it => it.incluido).map(it => ({ elemento: it.elemento, cantidad: it.cantidad, motivo: it.motivo, inspeccionId: it.inspeccionId || '', origen: it.origen || '' })),
      descripcionPerdida: $('entPerdida').value.trim(),
      sigTrabajador: pads.padEntrega.getDataUrl()
    };
    let resultado = null, enCola = false;
    try {
      const r = await fetchWithRetry(EPP_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
      resultado = await r.json();
      if (!resultado.ok) throw Object.assign(new Error(resultado.error || 'No se pudo guardar.'), { delServidor: true });
    } catch (err) {
      if (err.delServidor || typeof Outbox === 'undefined') {
        banner.innerHTML = '<strong>No se pudo guardar</strong>' + esc(err.message) + '<br>Lo que llenaste sigue aquí.';
        banner.classList.add('show');
        btn.disabled = false; btn.textContent = 'Registrar entrega';
        return;
      }
      try { await Outbox.add(EPP_URL, payload); enCola = true; }
      catch (e2) {
        banner.innerHTML = '<strong>No se pudo guardar</strong>Sin conexión y sin espacio en el celular para dejarla en cola. No cierres la página.';
        banner.classList.add('show');
        btn.disabled = false; btn.textContent = 'Registrar entrega';
        return;
      }
    }
    const nD = payload.items.filter(i => i.motivo === 'desgaste').length;
    const nP = payload.items.filter(i => i.motivo === 'perdida').length;
    ok.innerHTML = '<h3>✓ Entrega ' + (enCola ? 'guardada en el celular' : 'registrada') + '</h3>' +
      '<div>Registro <span class="id">' + esc(entregaId) + '</span></div>' +
      '<ul class="ent-ok-lista">' +
        (nD ? '<li><b>SSTA-F-014</b> · ' + nD + ' elemento(s) por desgaste</li>' : '') +
        (nP ? '<li><b>SSTA-F-013</b> · ' + nP + ' elemento(s) por pérdida</li>' : '') +
      '</ul>' +
      (enCola ? '<div style="margin-top:6px;">Sin señal: se enviará sola cuando vuelva la conexión.</div>' : '');
    ok.classList.add('show');
    ok.scrollIntoView({ behavior: 'smooth', block: 'center' });
    limpiar(true);
    btn.disabled = false; btn.textContent = 'Registrar entrega';
    cargarPendientes();
    cargarHistorial();
    if (histPersona && histPersona.cedula === payload.cedula) verHistorialPersona(histPersona);
  });

  function limpiar(mantenerOk) {
    ['entNombre', 'entCedula', 'entCargo', 'entCentro', 'entPerdida'].forEach(id => { $(id).value = ''; });
    items = []; opId = null; entregaId = genEntregaId();
    pads.padEntrega.clear();
    pintarItems();
    if (!mantenerOk) $('entOk').classList.remove('show');
  }

  /* ── Historial corto ── */
  async function cargarHistorial() {
    const cont = $('entHist');
    try {
      const r = await fetchWithRetry(EPP_URL + '?action=entregas&token=' + encodeURIComponent(TOKEN));
      const d = await r.json();
      if (!d.ok) throw new Error();
      const rows = (d.rows || []).slice(0, 12);
      cont.innerHTML = rows.length ? rows.map(x =>
        '<div class="ent-h ' + (x.motivo === 'perdida' ? 'perdida' : '') + '">' +
          '<div class="ent-h-cab"><button type="button" class="ent-h-nom" data-hist="' + esc(x.cedula) + '" data-nom="' + esc(x.nombre) + '">' + esc(x.nombre) + '</button><span>' + esc(x.formato) + '</span></div>' +
          '<small>' + esc(fechaTxt(x.fecha)) + ' · ' + (x.motivo === 'perdida' ? 'Pérdida' : 'Desgaste') + '</small>' +
          '<div class="ent-h-el">' + esc(x.elementos) + '</div>' +
        '</div>').join('') : '<div class="ent-vacio">Todavía no hay entregas registradas.</div>';
    } catch (e) {
      cont.innerHTML = '<div class="ent-vacio">No se pudo consultar el historial (sin señal).</div>';
    }
  }


  /* ── Historial de entregas por trabajador ── */
  let histPersona = null;
  let impresionHorizontal = true;   // planilla: horizontal · ficha: vertical   // { nombre, cedula, cargo, rows }
  async function verHistorialPersona(p) {
    const cont = $('entHP');
    $('entHPNombre').value = p.nombre || '';
    cont.innerHTML = '<div class="ent-vacio">Buscando entregas de ' + esc(p.nombre || p.cedula) + '…</div>';
    try {
      const [r1, r2] = await Promise.all([
        fetchWithRetry(EPP_URL + '?action=entregas&full=1&cedula=' + encodeURIComponent(p.cedula) + '&token=' + encodeURIComponent(TOKEN)).then(r => r.json()),
        fetchWithRetry(EPP_URL + '?action=pendientes&cedula=' + encodeURIComponent(p.cedula) + '&token=' + encodeURIComponent(TOKEN)).then(r => r.json())
      ]);
      if (!r1.ok) throw new Error();
      const rows = (r1.rows || []).sort((a, b) => (ddmmaaaaAFecha(b.fecha) || 0) - (ddmmaaaaAFecha(a.fecha) || 0));
      const pend = (r2.ok && r2.personas && r2.personas[0]) ? r2.personas[0].pendientes : [];
      const nombre = p.nombre || (rows[0] && rows[0].nombre) || '';
      const cargo = p.cargo || (rows[0] && rows[0].cargo) || '';
      histPersona = { nombre: nombre, cedula: p.cedula, cargo: cargo, rows: rows, pend: pend };
      cont.innerHTML = armarHistorial(histPersona, false) +
        (rows.length ? '<button type="button" class="ent-sec" id="entHPImprimir">Ver ficha para imprimir</button>' : '');
      const bi = $('entHPImprimir');
      if (bi) bi.addEventListener('click', () => { impresionHorizontal = false; $('entPlanilla').innerHTML = armarHistorial(histPersona, true); showScreen('screenPlanilla'); });
    } catch (e) {
      cont.innerHTML = '<div class="ent-vacio">No se pudo consultar el historial (sin señal).</div>';
    }
  }
  function armarHistorial(h, imprimir) {
    // Resumen: cuántas veces y cuántas unidades ha recibido de cada elemento
    const resumen = {};
    h.rows.forEach(r => ((r.datos && r.datos.items) || []).forEach(it => {
      const k = it.elemento;
      const x = resumen[k] || (resumen[k] = { veces: 0, unidades: 0, perdidas: 0, ultima: null });
      x.veces++; x.unidades += Number(it.cantidad) || 1;
      if (r.motivo === 'perdida') x.perdidas++;
      const f = ddmmaaaaAFecha(r.fecha); if (f && (!x.ultima || f > x.ultima)) x.ultima = f;
    }));
    const claves = Object.keys(resumen).sort((a, b) => resumen[b].unidades - resumen[a].unidades);
    const nPerd = h.rows.filter(r => r.motivo === 'perdida').length;
    const cab = '<div class="hp-cab">' +
      (imprimir ? '<img src="logo-indimon.png" alt="INDIMON" class="hp-logo">' : '') +
      '<div><b>' + esc(h.nombre) + '</b><small>CC ' + esc(h.cedula) + (h.cargo ? ' · ' + esc(h.cargo) : '') + '</small>' +
      (imprimir ? '<small>Historial de entregas de EPP (SSTA-F-013 / SSTA-F-014) · generado ' + esc(fechaTxt(new Date())) + '</small>' : '') + '</div></div>' +
      '<div class="hp-stats"><span><b>' + h.rows.length + '</b> entrega(s)</span><span><b>' + nPerd + '</b> por pérdida</span>' +
      '<span class="' + (h.pend.length ? 'hay' : '') + '"><b>' + h.pend.length + '</b> pendiente(s)</span></div>';
    const pend = h.pend.length
      ? '<div class="hp-pend"><b>Pendiente por entregar:</b> ' + h.pend.map(x => esc(x.elemento)).join(', ') + '</div>' : '';
    if (!h.rows.length) return cab + pend + '<div class="ent-vacio">A este trabajador todavía no se le ha registrado ninguna entrega.</div>';
    const tabla = '<table class="hp-res"><thead><tr><th>Elemento</th><th>Veces</th><th>Unid.</th><th>Pérdida</th><th>Última</th></tr></thead><tbody>' +
      claves.map(k => { const x = resumen[k];
        return '<tr><td>' + esc(k) + '</td><td>' + x.veces + '</td><td>' + x.unidades + '</td><td class="' + (x.perdidas ? 'perd' : '') + '">' + x.perdidas + '</td><td>' + esc(x.ultima ? fechaTxt(x.ultima).slice(0,5) : '') + '</td></tr>'; }).join('') +
      '</tbody></table>';
    const lista = h.rows.map(r =>
      '<div class="hp-ent ' + (r.motivo === 'perdida' ? 'perdida' : '') + '">' +
        '<div class="hp-ent-cab"><b>' + esc(fechaTxt(r.fecha)) + '</b><span>' + esc(r.formato) + ' · ' + (r.motivo === 'perdida' ? 'Pérdida' : 'Desgaste') + '</span></div>' +
        '<ul>' + ((r.datos && r.datos.items) || []).map(it => '<li>' + esc(it.elemento) + (Number(it.cantidad) > 1 ? ' <b>x' + Number(it.cantidad) + '</b>' : '') +
          (it.inspeccionId ? ' <small>· de la inspección ' + esc(it.inspeccionId) + '</small>' : '') + '</li>').join('') + '</ul>' +
        (r.descripcion ? '<div class="hp-desc">Qué pasó: ' + esc(r.descripcion) + '</div>' : '') +
        '<div class="hp-pie"><span>' + (r.entregadoPor ? 'Entregó: ' + esc(r.entregadoPor) : '') + (r.centroCosto ? ' · ' + esc(r.centroCosto) : '') + '</span>' +
        (r.datos && r.datos.sigTrabajador ? '<img src="' + esc(r.datos.sigTrabajador) + '" alt="Firma del trabajador">' : '') + '</div>' +
      '</div>').join('');
    return '<div class="hp' + (imprimir ? ' hp-print' : '') + '">' + cab + pend +
      '<h4 class="ent-sub">Resumen por elemento</h4>' + tabla +
      '<h4 class="ent-sub">Entregas</h4>' + lista + '</div>';
  }
  attachPersonalAutocomplete($('entHPNombre'), (p) => verHistorialPersona(p));
  $('entHPNombre').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const v = e.target.value.trim(); if (!v) return;
    const pers = (personalCache || []).find(x => String(x.cedula) === v || String(x.nombre).toLowerCase() === v.toLowerCase());
    verHistorialPersona(pers || { cedula: v, nombre: '' });
  });
  // Desde las listas: tocar un nombre abre su historial
  ['entPendLista', 'entHist'].forEach(id => $(id).addEventListener('click', (e) => {
    const b = e.target.closest('[data-hist]'); if (!b) return;
    verHistorialPersona({ cedula: b.dataset.hist, nombre: b.dataset.nom || '' });
    $('entHPBox').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  /* ── Planilla imprimible ── */
  $('entPlVer').addEventListener('click', async () => {
    const formato = $('entPlFormato').value;
    const desde = $('entPlDesde').value ? new Date($('entPlDesde').value + 'T00:00:00') : null;
    const hasta = $('entPlHasta').value ? new Date($('entPlHasta').value + 'T23:59:59') : null;
    const btn = $('entPlVer');
    btn.disabled = true; btn.textContent = 'Cargando…';
    try {
      const r = await fetchWithRetry(EPP_URL + '?action=entregas&full=1&formato=' + encodeURIComponent(formato) + '&token=' + encodeURIComponent(TOKEN));
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'sin datos');
      const filas = (d.rows || []).filter(x => {
        const f = ddmmaaaaAFecha(x.fecha);
        return f && (!desde || f >= desde) && (!hasta || f <= hasta);
      }).sort((a, b) => ddmmaaaaAFecha(a.fecha) - ddmmaaaaAFecha(b.fecha));
      impresionHorizontal = true;
      $('entPlanilla').innerHTML = armarPlanilla(formato, filas, desde, hasta);
      showScreen('screenPlanilla');
    } catch (e) {
      alert('No se pudo cargar la planilla. Revisa la señal e intenta de nuevo.');
    } finally {
      btn.disabled = false; btn.textContent = 'Ver planilla';
    }
  });
  $('entPlVolver').addEventListener('click', () => showScreen('screenEntregas'));
  $('entPlImprimir').addEventListener('click', () => {
    // La planilla es horizontal como el Excel; la inspección sigue imprimiéndose vertical.
    const st = document.createElement('style');
    st.textContent = impresionHorizontal ? '@page{size:letter landscape;margin:8mm;}' : '@page{size:letter portrait;margin:12mm;}';
    document.head.appendChild(st);
    document.body.classList.add('imprimiendo-planilla');
    window.print();
    setTimeout(() => { st.remove(); document.body.classList.remove('imprimiendo-planilla'); }, 500);
  });

  function armarPlanilla(formato, filas, desde, hasta) {
    const perdida = formato === 'SSTA-F-013';
    const titulo = perdida ? '(REPOSICIÓN POR PÉRDIDA)' : '(REPOSICIÓN POR DESGASTE)';
    const meta = perdida
      ? ['Página: 1 de 1', 'Versión: 4', 'Código: SSTA-F-013', 'Fecha: 21/07/2016']
      : ['Página: 1 de 1', 'Código: SSTA-F-014', 'Versión: 4', 'Fecha: 18/02/2014'];
    const extra = perdida ? 'CENTRO DE COSTO' : 'CÉDULA';
    const minimo = 10;  // el papel trae 10 renglones; se completan en blanco
    const celdas = (fila) => {
      const v = {};
      ((fila.datos && fila.datos.items) || []).forEach(it => {
        const c = columnaDe(it.elemento);
        const marca = Number(it.cantidad) > 1 ? String(it.cantidad) : 'X';
        if (c === 'guantes') (v.guantes = v.guantes || []).push(String(it.elemento).replace(/^GUANTES DE\s*/i, '') + (marca !== 'X' ? ' x' + marca : ''));
        else if (c === 'otros') (v.otros = v.otros || []).push(it.elemento + (marca !== 'X' ? ' x' + marca : ''));
        else v[c] = marca;
      });
      return v;
    };
    const cab =
      '<tr><th rowspan="3" class="pl-nom">NOMBRES Y APELLIDOS</th><th rowspan="3" class="pl-cargo">CARGO</th><th rowspan="3" class="pl-fecha">FECHA</th>' +
      '<th colspan="13">EPP</th>' +
      (perdida ? '<th rowspan="3" class="pl-firma">FIRMA</th><th rowspan="3" class="pl-ext">' + extra + '</th>'
               : '<th rowspan="3" class="pl-ext">' + extra + '</th><th rowspan="3" class="pl-firma">FIRMA</th>') + '</tr>' +
      '<tr>' + COLUMNAS.map(c => c.grupo ? (c.k === 'copa' ? '<th colspan="2">PROTECCIÓN AUDITIVA</th>' : '')
                                         : '<th rowspan="2" class="' + (c.v ? 'pl-v' : 'pl-ancho') + '"><span>' + c.t + '</span></th>').join('') + '</tr>' +
      '<tr><th>Copa</th><th>Inserción</th></tr>';
    const filaHtml = (f) => {
      const v = f ? celdas(f) : {};
      const firma = f && f.datos && f.datos.sigTrabajador ? '<img src="' + esc(f.datos.sigTrabajador) + '" alt="Firma">' : '';
      const ext = f ? esc(perdida ? (f.centroCosto || '') : (f.cedula || '')) : '';
      return '<tr>' +
        '<td class="pl-nom">' + (f ? esc(f.nombre) : '') + '</td><td>' + (f ? esc(f.cargo || '') : '') + '</td><td>' + (f ? esc(fechaTxt(f.fecha)) : '') + '</td>' +
        COLUMNAS.map(c => {
          const val = (c.k === 'guantes' || c.k === 'otros') ? (v[c.k] || []).join(', ') : (v[c.k] || '');
          // En una fila con entrega, lo NO entregado lleva raya: deja claro qué
          // se entregó y nadie puede agregar una X después. Las filas vacías quedan en blanco.
          if (f && !val) return '<td class="pl-raya">—</td>';
          return '<td class="' + (c.ancho ? 'pl-txt' : 'pl-x') + '">' + esc(val) + '</td>';
        }).join('') +
        (perdida ? '<td class="pl-firma">' + firma + '</td><td>' + ext + '</td>' : '<td>' + ext + '</td><td class="pl-firma">' + firma + '</td>') +
      '</tr>';
    };
    const cuerpo = filas.map(filaHtml).join('') + Array.from({ length: Math.max(0, minimo - filas.length) }, () => filaHtml(null)).join('');
    const perdidas = perdida ? filas.filter(f => f.descripcion) : [];
    const rango = (desde ? fechaTxt(desde) : 'inicio') + ' a ' + (hasta ? fechaTxt(hasta) : 'hoy');
    return '<div class="pl">' +
      '<table class="pl-head"><tr><td class="pl-logo"><img src="logo-indimon.png" alt="INDIMON"></td>' +
      '<td class="pl-tit">ENTREGA DE ELEMENTOS DE PROTECCIÓN PERSONAL<br>' + titulo + '</td>' +
      '<td class="pl-meta">' + meta.map(m => '<div>' + m + '</div>').join('') + '</td></tr></table>' +
      '<div class="pl-rango no-print">' + filas.length + ' entrega(s) · ' + esc(rango) + '</div>' +
      '<table class="pl-tabla"><thead>' + cab + '</thead><tbody>' + cuerpo + '</tbody></table>' +
      '<p class="pl-decl">Hago constar que recibí en perfecto estado la dotación y los elementos de protección personal relacionados en la tabla adjunta, más la respectiva capacitación sobre su uso y mantenimiento, comprometiéndome a cumplir con las especificaciones dadas por el departamento de Seguridad y Salud en el Trabajo y Ambiente de INDIMON SAS y estoy enterado de que; "no utilizar los elementos de protección personal, es causal de <b>TERMINACIÓN DEL CONTRATO DE TRABAJO POR JUSTA CAUSA, conforme lo contempla el Código Sustantivo del Trabajo en su Capítulo VI. Art. 62 numeral 12 y las demás normas aplicables.</b></p>' +
      (perdidas.length ? '<div class="pl-perd"><b>Descripción de las pérdidas</b><ul>' + perdidas.map(f => '<li><b>' + esc(f.nombre) + '</b> (' + esc(fechaTxt(f.fecha)) + '): ' + esc(f.descripcion) + '</li>').join('') + '</ul></div>' : '') +
      '<div class="pl-act">Fecha de actualización: 09/12/2024</div>' +
    '</div>';
  }

  /* ── Arranque ── */
  $('entFecha').value = hoyISO();
  try { $('entEntrega').value = localStorage.getItem('ssta-epp-entregador') || ''; } catch (e) {}
  const d = new Date(); d.setDate(1);
  $('entPlDesde').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
  $('entPlHasta').value = hoyISO();
  pintarItems();
  // Solo se consulta al abrir la pestaña: no gasta datos si nadie la usa.
  $('tabEntregas').addEventListener('click', () => {
    if (!cargadoPend) cargarPendientes();
    cargarHistorial();
    document.querySelector('.footer-actions').style.display = 'none';
  });
})();
