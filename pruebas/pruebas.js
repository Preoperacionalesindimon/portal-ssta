#!/usr/bin/env node
/* ============================================================
   pruebas.js — Comprobaciones antes de desplegar el Portal SSTA
   ------------------------------------------------------------
   POR QUÉ EXISTE ESTO

   El bug que más caro salió del portal fue el de las firmas: durante semanas
   se guardaron inspecciones y permisos SIN la firma, porque el PNG superaba el
   máximo de 50.000 caracteres que Google Sheets admite en una celda. Nada
   fallaba a la vista — la pantalla decía "Firmado ✓", el permiso se guardaba,
   los nombres quedaban — y solo se descubrió por casualidad, revisando un
   permiso viejo.

   Estas pruebas no reemplazan probar en el celular. Lo que hacen es atrapar,
   en dos segundos y antes de subir nada, la clase de error que no se ve:
   listas que dejaron de coincidir entre el navegador y el servidor, límites
   que se superan en silencio, archivos que quedaron sin registrar en la caché.

   CÓMO SE USA
       cd pruebas && npm install     (una sola vez)
       node pruebas.js

   Devuelve 0 si todo está bien y 1 si algo falló, para poder encadenarlo a un
   despliegue automático más adelante.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let fallos = 0, total = 0;
const grupos = [];
function grupo(nombre, fn) { grupos.push([nombre, fn]); }
function ok(desc, cond, detalle) {
  total++;
  if (cond) { console.log('    ✓ ' + desc); }
  else { fallos++; console.log('    ✗ ' + desc + (detalle ? '\n        ' + detalle : '')); }
}
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const existe = (f) => fs.existsSync(path.join(RAIZ, f));

/* ═══════════════════════════════════════════════════════════
   1. FIRMAS — el fallo que ya nos costó semanas
   ═══════════════════════════════════════════════════════════ */
grupo('Firmas: no pueden perderse en silencio', () => {
  const common = leer('common.js');

  ok('el lienzo se exporta con tamaño acotado (exportarFirmaAcotada)',
     common.includes('exportarFirmaAcotada'),
     'Sin esto, en tablets de pantalla densa el PNG supera las 50.000 celdas de Sheets.');

  const m = /const MAX_CARACTERES = (\d+)/.exec(common);
  ok('el tope del cliente está por debajo del límite de Google Sheets (50.000)',
     m && Number(m[1]) < 50000,
     m ? `MAX_CARACTERES = ${m[1]}` : 'No se encontró MAX_CARACTERES');

  ok('getDataUrl() usa la versión acotada, no el lienzo crudo',
     /getDataUrl:\s*\(\)\s*=>\s*\(hasInk \? exportarFirmaAcotada\(\)/.test(common),
     'Si vuelve a usar canvas.toDataURL() directo, regresa el bug.');

  // Fijar canvas.width/height limpia el lienzo: después de resize() hay que
  // volver a pintar lo firmado. Desde la v64 se hace de forma síncrona con los
  // trazos guardados (redibujar), en vez de copiar una imagen y restaurarla en
  // diferido — la restauración en diferido podía borrar un trazo recién empezado.
  ok('refreshSize() preserva la firma al redimensionar',
     /refreshSize:\s*\(\)\s*=>\s*ajustarTamano\(true\)/.test(common) &&
     /function ajustarTamano[\s\S]{0,900}?resize\(\);\s*redibujar\(\);/.test(common),
     'Sin esto, refrescar el lienzo borra la firma dejando el estado en "Firmado ✓".');

  ok('al redimensionar, los trazos se reescalan a la nueva medida',
     /function ajustarTamano[\s\S]{0,700}?strokes\s*=\s*strokes\.map/.test(common),
     'Sin esto, la firma queda corrida o recortada después de girar el celular.');

  // Al girar el celular, la pantalla debe volver al recuadro que se estaba
  // viendo. Estas tres condiciones son las que fallaban en la v62/v64.
  ok('al girar, vuelve a lo que se está VIENDO, no al último lienzo tocado',
     /const AnclaGiro/.test(common) && /if \(enPantalla\(ultimoTocado\)\) return ultimoTocado;/.test(common),
     'Sin esto, si ya se firmó el recuadro de otro ejecutante, al girar manda a ese.');
  ok('al girar, nunca se ancla a un bloque más alto que media pantalla',
     /masCercanoAlCentro\(SEL_CAMPO, window\.innerHeight \* 0\.5\)/.test(common),
     'Centrar una sección entera deja cualquier parte del permiso a la vista.');
  ok('el giro se detecta por la orientación del aparato (el teclado no cuenta)',
     /screen\.orientation\.type/.test(common),
     'Si se usa el alto de la ventana, abrir el teclado en una tablet dispara el salto.');
  ok('se insiste en volver durante más de un segundo mientras termina el giro',
     (() => { const m = common.match(/REINTENTOS_MS = \[([^\]]+)\]/); return m && Math.max(...m[1].split(',').map(Number)) >= 1000; })(),
     'En Android el giro puede terminar tarde y el navegador deshace una corrección temprana.');

  ok('el lienzo verifica su tamaño real al empezar a firmar',
     /function start\(e\)[\s\S]{0,500}?ajustarTamano\(false\);[\s\S]{0,80}?pos\(e\)/.test(common),
     'Sin esto, si la imagen interna quedó con la medida de horizontal, en vertical la raya sale corrida del dedo.');

  // Firma a pantalla completa en celulares (v66)
  const iFc = common.indexOf('FirmaCompleta.abrir(canvas');
  const iStart = common.indexOf("canvas.addEventListener('touchstart', start");
  ok('en celular, el toque abre la pantalla completa ANTES de dibujar en el recuadro',
     iFc > 0 && iStart > 0 && iFc < iStart && /e\.stopImmediatePropagation\(\);\s*FirmaCompleta\.abrir/.test(common),
     'Si el interceptor queda después, el primer toque deja una raya en el recuadro pequeño.');
  ok('"Listo" sin dibujar NO borra una firma que ya venía guardada',
     /else if \(!teniaBase\) destinoPad\.setStrokes\(\[\]\)/.test(common),
     'Sin esto, abrir la firma de un permiso restaurado y tocar Listo la borra.');
  ok('la firma pasa como trazos escalados sin deformar (misma escala en ancho y alto)',
     /const k = Math\.min\(\(tamCss\.w - 2 \* margen\) \/ bw, \(tamCss\.h - 2 \* margen\) \/ bh, 1\)/.test(common),
     'Una firma hecha en horizontal quedaría aplastada en el recuadro vertical.');
  ok('al confirmar, se avisa al formulario para que guarde el borrador',
     /destino\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/.test(common),
     'El lienzo grande está fuera del formulario: sin este aviso, la firma no entra al borrador.');

  ok('el historial de deshacer NO guarda mapas de bits completos',
     !common.includes('history.push(ctx.getImageData'),
     'Guardar una foto por trazo consumía cientos de MB y el navegador mataba la pestaña.');

  // El backend debe poder partir una firma que no quepa en una celda
  const core = leer('backends/permisos/core.gs');
  ok('el backend trocea firmas que exceden el máximo de celda',
     core.includes('function trocearFirma_') && core.includes('MAX_CHARS_CELDA'),
     'Es la red de seguridad por si entra una firma pesada por otra vía.');

  const mc = /const MAX_CHARS_CELDA = (\d+)/.exec(core);
  ok('el troceo deja margen bajo el límite real de 50.000',
     mc && Number(mc[1]) < 50000,
     mc ? `MAX_CHARS_CELDA = ${mc[1]}` : 'No se encontró MAX_CHARS_CELDA');

  // Simulación del viaje completo: trocear → guardar → leer → reensamblar
  const MAX = Number(mc[1]);
  const trocear = (key, url) => {
    if (url.length <= MAX) return [{ key, texto: url }];
    const t = Math.ceil(url.length / MAX), out = [];
    for (let i = 0; i < t; i++) out.push({ key: key + '~' + (i + 1) + '/' + t, texto: url.substr(i * MAX, MAX) });
    return out;
  };
  const reensamblar = (filas) => {
    const mapa = {}, partes = {};
    filas.forEach(f => {
      const k = String(f.key), pos = k.indexOf('~');
      if (pos === -1) { mapa[k] = f.texto; return; }
      const base = k.substring(0, pos), n = parseInt(k.substring(pos + 1), 10) || 1;
      (partes[base] = partes[base] || []).push({ n, texto: f.texto });
    });
    for (const b in partes) { partes[b].sort((x, y) => x.n - y.n); mapa[b] = partes[b].map(p => p.texto).join(''); }
    return mapa;
  };
  [['firma normal', 20000], ['firma de tablet', 117000], ['firma enorme', 500000]].forEach(([nombre, n]) => {
    const url = 'data:image/png;base64,' + 'A'.repeat(n);
    const filas = trocear('k1', url);
    const cabenTodas = filas.every(f => f.texto.length <= 50000);
    const recuperada = reensamblar(filas.slice().reverse())['k1']; // llegan desordenadas a propósito
    ok(`${nombre} (${n.toLocaleString()} car.) viaja y vuelve intacta en ${filas.length} fila(s)`,
       cabenTodas && recuperada === url);
  });
});

/* ═══════════════════════════════════════════════════════════
   2. EPP — el correo de reposición debe coincidir con lo marcado
   ═══════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════
   Tablero: nunca decir "todo cerrado" con datos incompletos (v66)
   ═══════════════════════════════════════════════════════════ */
grupo('Tablero y contador de permisos abiertos', () => {
  const dash = leer('dashboard.html');
  const idx = leer('index.html');
  ok('el tablero registra los tipos de permiso que no respondieron',
     /nFallidos\.push/.test(dash) && !/status !== 'fulfilled'\) return; \/\/ backend no disponible; se omite/.test(dash),
     'Antes se omitían en silencio: con un backend caído el tablero podía decir "No hay permisos abiertos ✓".');
  ok('el chulo de "No hay permisos abiertos" solo sale si respondieron todos',
     /else if\(fallidos\.length\) msg = '⚠️ No se puede confirmar/.test(dash),
     'Una lista incompleta que parece completa es una falsa tranquilidad.');
  ok('un backend que responde con error (token, login de Google) también cuenta como caído',
     /if\(!data \|\| !data\.ok \|\| !Array\.isArray\(data\.rows\)\)/.test(dash));
  ok('el contador de la portada avisa cuando le faltan datos',
     /sinDatos\.push/.test(idx) && /al menos /.test(idx),
     'Sin esto, el contador sale por debajo de lo real sin decirlo.');
});

/* ═══════════════════════════════════════════════════════════
   ATS interactivo (SSTA-F-007) — base de conocimiento GTC 45
   ═══════════════════════════════════════════════════════════ */
grupo('ATS interactivo', () => {
  const vm = require('vm');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(leer('ats-catalogo.js') + ';this.D={PELIGROS,TAREAS,EPP,EMERGENCIA,PERMISOS,JERARQUIA,CLASES_GTC45,CONDICIONES,ATS_FORMATO}', ctx);
  const D = ctx.D;
  const pid = new Set(D.PELIGROS.map((p) => p.id));
  const tid = new Set(D.TAREAS.map((t) => t.id));
  const eid = new Set(D.EPP.map((e) => e.id));
  const emid = new Set(D.EMERGENCIA.map((e) => e.id));

  ok('los peligros cubren las 7 clases de la GTC 45',
     D.CLASES_GTC45.length === 7 && D.CLASES_GTC45.every((c) => D.PELIGROS.some((p) => p.clase === c.id)));
  ok('no hay ids de peligro ni de tarea repetidos',
     pid.size === D.PELIGROS.length && tid.size === D.TAREAS.length);
  const sinCtrl = D.PELIGROS.filter((p) => !p.controles.length || p.controles.some((c) => !D.JERARQUIA[c[1]]));
  ok('todo peligro tiene controles con jerarquía válida (E/S/I/A/P)', !sinCtrl.length, sinCtrl.map((p) => p.id).join(', '));
  const rotas = [];
  D.TAREAS.forEach((t) => {
    if (!t.peligros.length) rotas.push(t.id + ': sin peligros');
    t.peligros.forEach((x) => { if (!pid.has(x)) rotas.push(t.id + ' → ' + x); });
    (t.siguiente || []).forEach((x) => { if (!tid.has(x)) rotas.push(t.id + ' sigue → ' + x); });
  });
  D.PELIGROS.forEach((p) => {
    (p.epp || []).forEach((x) => { if (!eid.has(x)) rotas.push(p.id + ' epp → ' + x); });
    (p.emergencia || []).forEach((x) => { if (!emid.has(x)) rotas.push(p.id + ' emergencia → ' + x); });
  });
  D.CONDICIONES.concat(D.PERMISOS).forEach((c) => c.peligros.forEach((x) => { if (!pid.has(x)) rotas.push(c.id + ' → ' + x); }));
  ok('no hay referencias rotas entre tareas, peligros, EPP y condiciones', !rotas.length, rotas.join(' | '));
  ok('existen las 3 tareas de inicio y la de orden y aseo',
     D.TAREAS.filter((t) => t.inicio).length === 3 && tid.has('orden'));

  // Las palabras clave se buscan desde el inicio de palabra (igual que en ats.html).
  const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const contiene = (t, k) => new RegExp('(^|[^a-z0-9])' + norm(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(norm(t));
  const detecta = (texto) => D.PELIGROS.filter((p) => (p.claves || []).some((k) => contiene(texto, k))).map((p) => p.id);
  const sold = detecta('Soldadura TIG de soportes');
  ok('"soldadura" sugiere humos y radiación del arco, pero NO radiación solar',
     sold.includes('humos') && sold.includes('rad_soldadura') && !sold.includes('rad_solar'), sold.join(', '));
  ok('"Gaseosas Lux" no sugiere cilindros de gas', !detecta('Tanque para Gaseosas Lux').includes('tec_gas'));
  ok('"andamio a 4 metros" sugiere trabajo en alturas', detecta('armado de andamio a 4 metros').includes('alturas'));

  const ats = leer('ats.html');
  ok('ats.html no usa id="app" (common.css lo oculta en los permisos)', !/id="app"/.test(ats),
     'Con id="app" la página del ATS salía completamente en blanco.');
  ok('el autocompletar de personal no se cierra al desplazar la pantalla',
     !/window\.addEventListener\('scroll', cerrar, true\)/.test(ats.split('function autocompletar')[1] || ''),
     'En el celular el teclado desplaza la pantalla y cerraba la lista antes de poder tocar un nombre.');
  ok('el borrador se guarda al cerrar o bloquear el celular (firma recién hecha)',
     /addEventListener\('pagehide', guardarYa\)/.test(ats));
  ok('al imprimir no se rearma la hoja si ya está en vista previa (el logo no alcanzaba a cargar)',
     /beforeprint[\s\S]{0,120}classList\.contains\('previa'\)/.test(ats));
  ok('el logo del encabezado está en la caché', leer('sw.js').includes("'./logo-indimon.png'") && existe('logo-indimon.png'));
  ok('la portada enlaza el ATS', leer('index.html').includes('href="ats.html"'));
  ok('config.js tiene la entrada del backend del ATS', /ats: \{[\s\S]*?url:/.test(leer('config.js')));
  ok('la cola sin señal no espera al Service Worker para confirmar (se quedaba en "Guardando…")',
     !/await navigator\.serviceWorker\.ready/.test(leer('common.js').split('async add(')[1].split('async list(')[0]));
  ok('el ATS avisa conflicto en vez de sobrescribir lo de otro dispositivo', /r\.conflicto/.test(ats) && /versionBase: ats\.version/.test(ats));
  ok('después de guardar, el ATS se vuelve a leer y se compara (verificación)', /async function verificarGuardado/.test(ats));
  ok('la cola sin señal verifica un "agregar personal" persona por persona (no basta con que el ATS exista)',
     /item\.body\.action === 'agregarParticipantes'/.test(leer('common.js')));
  ok('"Llegó más gente" aparece apenas se guarda el ATS (no solo al recargar)',
     /function actualizarEstado\(\) \{[\s\S]{0,300}btnModoAgregar/.test(ats));
  ok('para agregar personal hay que marcar que se le socializó el ATS', /falta marcar que se le socializó el ATS/.test(ats));
  ok('el ATS abre en un menú como el de los permisos: abrir, cerrar y agregar personal',
     /<body class="en-menu">/.test(ats) && /id="opAbrir"/.test(ats) && /id="opCerrar"/.test(ats) && /id="opAgregar"/.test(ats));
  ok('los motivos de cierre del ATS son los mismos en la pantalla y en el backend', (() => {
    const pant = (/<select id="cMotivo">([\s\S]*?)<\/select>/.exec(ats) || [])[1] || '';
    const enPant = [...pant.matchAll(/<option>([^<]+)<\/option>/g)].map((m) => m[1]);
    const back = (/const MOTIVOS_CIERRE = \[([\s\S]*?)\]/.exec(leer('backends/backend-ats.gs')) || [])[1] || '';
    const enBack = [...back.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    return enPant.length === 5 && JSON.stringify(enPant) === JSON.stringify(enBack);
  })());
  ok('la cola sin señal reconoce un cierre de ATS ya aplicado', /action === 'cerrarAts'\) return json\.estado === 'CERRADO'/.test(leer('common.js')));
  ok('la hoja impresa del ATS lleva QR al modo "Agregar personal" (como los permisos)',
     /QR\.comoImagen\(enlaceAgregar\(ats\.code\)/.test(ats) && /<script src="qr\.js"><\/script>/.test(ats));
  const tamQr = /\.hoja \.qr-hoja img\{width:(\d+)px/.exec(ats);
  ok('el QR impreso mide al menos 100 px (~25 mm) y tiene margen de 4 módulos, para que la cámara lo lea en papel',
     tamQr && Number(tamQr[1]) >= 100 && /enlaceAgregar\(ats\.code\), \{ px: \d+, margen: 4 \}/.test(ats),
     'A 72 px (17 mm) y margen 2 un lector no lo decodificaba desde el PDF.');
});

/* ═══════════════════════════════════════════════════════════
   Backend del ATS — se EJECUTA en un simulador de Apps Script
   ═══════════════════════════════════════════════════════════ */
grupo('Backend del ATS (ejecutado en simulador)', () => {
  const { crearEntorno } = require('./simulador-apps-script');
  const vm = require('vm');
  const cat = {}; vm.createContext(cat);
  vm.runInContext(leer('ats-catalogo.js') + ';this.D={PELIGROS,TAREAS,CLASES_GTC45}', cat);
  const { PELIGROS, TAREAS, CLASES_GTC45 } = cat.D;
  const PEL = Object.fromEntries(PELIGROS.map((p) => [p.id, p]));
  const CL = Object.fromEntries(CLASES_GTC45.map((c) => [c.id, c.nombre]));
  const TOKEN = /API_TOKEN: '([^']+)'/.exec(leer('config.js'))[1];
  const firma = (n, s) => 'data:image/png;base64,' + require('crypto').createHash('sha256').update(String(s)).digest('base64').repeat(Math.ceil(n / 44)).slice(0, n);
  const inst = (id) => ({ id, clase: CL[PEL[id].clase], sub: PEL[id].sub, texto: PEL[id].texto, efectos: PEL[id].efectos, ctrls: PEL[id].controles.map(([t, j]) => ({ t, j, on: true })), extra: [] });
  const armar = (nT, nP) => ({ v: 1,
    cab: { centro: ['Mayekawa'], desde: '2026-09-28', hasta: '', area: 'Bodega', trabajo: 'Prueba', requiere: 'SI', permisos: ['caliente'] },
    participantes: Array.from({ length: nP }, (_, i) => ({ nombres: 'N' + i, apellidos: 'A' + i, cedula: String(i), cargo: 'X', firma: firma(30000 + i, i) })),
    tareas: Array.from({ length: nT }, (_, i) => { const t = TAREAS[i % TAREAS.length]; return { uid: 'u' + i, plantilla: t.id, titulo: t.nombre, desc: t.desc, peligros: t.peligros.map(inst), generales: [], responsables: [] }; }),
    firmas: { lider: { nombre: 'L', firma: firma(40000, 'L') }, jefe: { nombre: 'J', firma: null }, sst: { nombre: 'S', firma: null } } });

  let E;
  try { E = crearEntorno(path.join(RAIZ, 'backends/backend-ats.gs')); }
  catch (e) { ok('backend-ats.gs se carga en el simulador', false, e.message); return; }

  ok('rechaza un token inválido', !E.post({ token: 'x', ats: armar(1, 1) }).ok);
  const grande = armar(22, 12);
  const r1 = E.post({ token: TOKEN, opId: 'a', code: 'ATS-20260928-111111', versionBase: 0, ats: grande });
  ok('guarda un ATS de 22 tareas y 12 firmas (' + Math.round(JSON.stringify(grande).length / 1000) + ' mil caracteres)', r1.ok && r1.version === 1, r1.error);
  const maxCelda = Math.max(...Object.values(E.hojas).flatMap((h) => h.filas.flat()).map((v) => (typeof v === 'string' ? v.length : 0)));
  ok('ninguna celda supera 50.000 caracteres (el límite de Google Sheets)', maxCelda <= 50000, 'celda más grande: ' + maxCelda);
  const leido = E.get({ token: TOKEN, code: 'ATS-20260928-111111' }).ats || {};
  delete leido.code; delete leido.version;
  ok('lo que se lee es idéntico a lo que se guardó, firmas incluidas', JSON.stringify(leido) === JSON.stringify(grande));
  ok('un reenvío con el mismo opId no duplica', E.post({ token: TOKEN, opId: 'a', code: 'ATS-20260928-111111', ats: grande }).duplicado === true);
  ok('guardar sobre la versión vigente sube a v2', E.post({ token: TOKEN, opId: 'b', code: 'ATS-20260928-111111', versionBase: 1, ats: grande }).version === 2);
  const conf = E.post({ token: TOKEN, opId: 'c', code: 'ATS-20260928-111111', versionBase: 1, ats: armar(1, 1) });
  ok('guardar sobre una versión vieja NO sobrescribe (conflicto entre dispositivos)', !conf.ok && conf.conflicto === true);
  ok('"Datos" y "Peligros" se reemplazan al volver a guardar, no se acumulan',
     E.hojas.Peligros.filas.filter((f) => f[0] === 'ATS-20260928-111111').length === grande.tareas.reduce((a, t) => a + t.peligros.length, 0));
  const i = E.hojas.Firmas.filas.findIndex((f) => f[0] === 'ATS-20260928-111111' && !String(f[1]).includes('~'));
  E.hojas.Firmas.filas.splice(i, 1);
  E.ctx.auditarIntegridad();
  ok('la auditoría detecta una firma cuya imagen se perdió', /imagen perdida/.test(E.hojas.Auditoria.filas.find((f) => f[1] === 'ATS-20260928-111111')[6]));

  // Gente que llega después a la obra: se SUMA sin reemplazar el ATS.
  const code2 = 'ATS-20260928-222222';
  E.post({ token: TOKEN, opId: 'd1', code: code2, versionBase: 0, ats: armar(2, 1) });
  const ag = E.post({ token: TOKEN, action: 'agregarParticipantes', opId: 'd2', code: code2, participantes: [
    { uid: 'n1', nombres: 'Nuevo', apellidos: 'Uno', cedula: '777', firma: firma(30000, 'n1'), socializado: true },
    { uid: 'n2', nombres: 'Repetido', cedula: '0', firma: firma(30000, 'n2'), socializado: true }] });
  ok('agregar personal suma a la persona nueva y omite la cédula que ya estaba', ag.ok && ag.agregados.length === 1 && ag.omitidos.length === 1);
  const tras = E.get({ token: TOKEN, code: code2 }).ats;
  ok('la persona agregada queda firmada, marcada como tardía y socializada, sin tocar las tareas',
     tras.participantes.length === 2 && tras.participantes[1].tardio && tras.participantes[1].socializado && tras.participantes[1].firma.length > 100 && tras.tareas.length === 2);
  const viejo = E.post({ token: TOKEN, opId: 'd3', code: code2, versionBase: 1, ats: armar(2, 1) });
  ok('quien editaba el ATS completo sobre una versión vieja no borra a los agregados (conflicto)', !viejo.ok && viejo.conflicto && E.get({ token: TOKEN, code: code2 }).ats.participantes.length === 2);

  // Cierre del ATS (como el de los permisos).
  const cierre = { fecha: '2026-09-28', hora: '17:30', motivo: 'Actividad finalizada', observaciones: 'Área entregada limpia',
                   nombre: 'Carlos Ríos', cedula: '123', cargo: 'Líder SST', firma: firma(30000, 'cierre'), pendientes: ['Firma de SSTA'] };
  ok('un ATS recién guardado queda ABIERTO', E.get({ token: TOKEN, code: code2 }).estado === 'ABIERTO');
  ok('no cierra sin firma de quien cierra', !E.post({ token: TOKEN, action: 'cerrarAts', opId: 'k0', code: code2, cierre: Object.assign({}, cierre, { firma: null }) }).ok);
  ok('no cierra con un motivo que no está en la lista', !E.post({ token: TOKEN, action: 'cerrarAts', opId: 'k0b', code: code2, cierre: Object.assign({}, cierre, { motivo: 'porque sí' }) }).ok);
  const cz = E.post({ token: TOKEN, action: 'cerrarAts', opId: 'k1', code: code2, cierre });
  const trasCierre = E.get({ token: TOKEN, code: code2 });
  ok('cierra el ATS: queda CERRADO, con la firma del cierre y los pendientes anotados',
     cz.ok && trasCierre.estado === 'CERRADO' && trasCierre.ats.cierre.firma.length > 100 && trasCierre.ats.cierre.pendientes[0] === 'Firma de SSTA', cz.error);
  ok('el cierre no borra participantes ni tareas', trasCierre.ats.participantes.length === 2 && trasCierre.ats.tareas.length === 2);
  ok('la hoja "ATS" muestra estado, quién cerró y el motivo',
     (() => { const f = E.hojas.ATS.filas.find((x) => x[0] === code2); return f[16] === 'CERRADO' && f[18] === 'Carlos Ríos' && f[19] === 'Actividad finalizada'; })());
  ok('el listado trae el estado de cada ATS', E.get({ token: TOKEN, list: '1' }).rows.find((x) => x.code === code2).estado === 'CERRADO');
  ok('un reenvío del cierre no lo repite', E.post({ token: TOKEN, action: 'cerrarAts', opId: 'k1', code: code2, cierre }).duplicado === true);
  const segundo = E.post({ token: TOKEN, action: 'cerrarAts', opId: 'k2', code: code2, cierre: Object.assign({}, cierre, { nombre: 'Otra persona' }) });
  ok('un segundo cierre no reemplaza al primero', segundo.ok && segundo.yaCerrado && E.get({ token: TOKEN, code: code2 }).ats.cierre.nombre === 'Carlos Ríos');
  const agTarde = E.post({ token: TOKEN, action: 'agregarParticipantes', opId: 'k3', code: code2, participantes: [
    { uid: 'n9', nombres: 'Tarde', cedula: '999', firma: firma(30000, 'n9'), socializado: true }] });
  ok('a un ATS cerrado no se le puede agregar personal', !agTarde.ok && agTarde.cerrado);
  const edTarde = E.post({ token: TOKEN, opId: 'k4', code: code2, versionBase: E.get({ token: TOKEN, code: code2 }).version, ats: armar(1, 1) });
  ok('un ATS cerrado no se puede sobrescribir (ni siquiera sobre la versión vigente)', !edTarde.ok && edTarde.cerrado && E.get({ token: TOKEN, code: code2 }).ats.tareas.length === 2);
  ok('forzar tampoco sobrescribe un ATS cerrado', !E.post({ token: TOKEN, opId: 'k5', code: code2, force: true, ats: armar(1, 1) }).ok);
  ok('la hoja "ATS" tiene el encabezado de las columnas de cierre', E.hojas.ATS.filas[0][16] === 'estado' && E.hojas.ATS.filas[0][19] === 'motivoCierre');
});

grupo('Inspección de EPP', () => {
  const back = leer('backends/backend-epp.gs');
  const front = leer('inspeccion-epp.html');
  // La comparación de listas se hace más abajo, por formato: esta pantalla
  // atiende dos (SSTA-F-006 y SSTA-F-147) y cada uno tiene la suya.

  // La misma pantalla y el mismo backend atienden dos formatos (SSTA-F-006 y
  // SSTA-F-147). Cada uno tiene su lista, y las dos mitades deben coincidir
  // igual que la de EPP: si se separan, el correo pide cosas equivocadas.
  const bloqueFormato = (txt, clave) => {
    const m = new RegExp('\\n  ' + clave + ':\\s*\\{([\\s\\S]*?)\\n  \\}').exec(txt);
    if (!m) return null;
    const els = /elementos:\s*\[([\s\S]*?)\]/.exec(m[1]);
    if (!els) return null;
    let nombres = [...els[1].matchAll(/nombre:\s*'([^']+)'/g)].map(x => x[1]);
    if (!nombres.length) nombres = [...els[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
    const cantidades = [...els[1].matchAll(/cantidad:\s*(\d+|null)/g)].map(x => x[1]);
    return { nombres, cantidades };
  };
  ['epp', 'brigadista'].forEach(tipo => {
    const bb = bloqueFormato(back, tipo), ff = bloqueFormato(front, tipo);
    ok(`el formato "${tipo}" está definido en las dos mitades`, !!bb && !!ff);
    if (bb && ff) {
      ok(`  "${tipo}": los elementos coinciden entre navegador y servidor`,
         JSON.stringify(bb.nombres) === JSON.stringify(ff.nombres),
         'Desincronizados, se marcaría una cosa y se pediría otra.');
      ok(`  "${tipo}": las cantidades esperadas coinciden`,
         JSON.stringify(bb.cantidades) === JSON.stringify(ff.cantidades),
         'La cantidad decide si un kit está incompleto: tiene que ser la misma en los dos lados.');
    }
  });

  ok('el formato de brigadistas pide por cantidad además de por estado',
     back.includes('faltantes') && front.includes('faltantesPorCantidad'),
     'Un botiquín con 1 tapabocas de 3 está incompleto aunque lo que haya esté bueno.');

  ok('un campo de unidades vacío no cuenta como faltante',
     front.includes("el.value === ''") && back.includes("!== undefined"),
     'Vacío significa "no lo conté", no "hay cero".');

  ok('el servidor recalcula los MALO en vez de confiar en el navegador',
     /formato\.elementos\.forEach\([\s\S]{0,260}?=== 'M'/.test(back),
     'El correo es el efecto real del formato: debe salir de lo que quedó guardado.');

  ok('el servidor también recalcula los incompletos por cantidad',
     /faltantes\.push/.test(back),
     'Un kit incompleto se repone aunque lo que haya esté en buen estado.');

  ok('sin nada por reponer no se envía correo',
     back.includes("Sin elementos por reponer"));

  ok('un fallo de correo no tumba el guardado',
     /try \{[\s\S]{0,300}?MailApp\.sendEmail[\s\S]{0,200}?catch/.test(back),
     'La inspección debe quedar guardada aunque Gmail falle.');

  ok('hay un correo de destino configurado (no el de ejemplo)',
     back.includes('CORREOS_REPOSICION') && !back.includes('pon-aqui-el-correo@'),
     'Quedó el marcador de ejemplo: el correo no llegaría a nadie.');
});

/* ═══════════════════════════════════════════════════════════
   3. PERMISOS — un permiso cerrado es un documento, no un borrador
   ═══════════════════════════════════════════════════════════ */
grupo('Permisos de trabajo', () => {
  const core = leer('backends/permisos/core.gs');
  const front = leer('permiso-core.js');

  ok('el backend rechaza modificar un permiso ya cerrado',
     core.includes("Este permiso ya fue cerrado"));

  ok('el navegador bloquea la sección de cierre en modo consulta',
     front.includes('lockCloseSections'));

  ok('al consultar un cerrado se restauran sus datos de cierre',
     front.includes('loadCloseDataIntoForm'),
     'Si no, un permiso cerrado se ve vacío, como si nunca se hubiera cerrado.');

  ok('la apertura lleva clave de idempotencia (no duplica por reintento)',
     front.includes('opIdApertura') && core.includes('opIdYaAplicado_'));

  ok('las escrituras quedan en la bitácora',
     core.includes('registrarEvento_'));

  // Regresión: el backend llegó a guardar firstSave y opId DENTRO del permiso.
  // Como el panel de lectura de gases descarga el permiso y lo reenvía, esos
  // campos volvían al servidor, que lo leía como un reintento del guardado
  // inicial: respondía ok y descartaba el cambio. Las lecturas se perdían y en
  // pantalla decía "guardado". En la bitácora quedaba como ABRIR/DUPLICADO.
  ok('el backend NO guarda firstSave ni opId dentro del permiso',
     /k === 'token' \|\| k === 'firstSave' \|\| k === 'opId'/.test(core),
     'Sin esto, cualquier reenvío de un permiso descargado se descarta en silencio.');

  ok('el navegador los descarta al descargar un permiso',
     front.includes('delete data.firstSave') && front.includes('delete data.opId'),
     'Protege a los permisos guardados antes del arreglo del backend.');

  // ── Verificación después de guardar ──
  // Es la defensa contra el modo de fallo que más daño ha hecho aquí: el
  // servidor responde "ok", la pantalla dice "guardado" y el dato no queda.
  // Pasó con las firmas, con las lecturas de gases y con los reenvíos.
  ok('existe la verificación de lo guardado',
     front.includes('function verificarGuardado_'),
     'Sin ella, un guardado que no queda vuelve a pasar desapercibido.');

  ok('la verificación compara las firmas, no solo que el permiso exista',
     front.includes('firmasEjecutantes') && front.includes('firmasResponsables'),
     'Las firmas son lo que se perdía en silencio; comparar solo el código no lo detectaría.');

  ok('el borrador NO se borra si la verificación falla',
     /if \(mostrarVerificacion_\(verif, 'apertura'\)\) \{[\s\S]{0,120}?DraftStore\.clear/.test(front),
     'Si lo guardado no coincide, lo diligenciado tiene que seguir disponible.');

  ok('sin señal no se da por fallido (evita falsas alarmas)',
     front.includes("estado: 'sin-verificar'"),
     'Una alarma que salta sin motivo deja de creerse, y entonces no sirve.');

  // El registro de ejecución de Apps Script solo muestra lo que se escribe con
  // console.log: devolver el resultado no le sirve a quien la ejecuta a mano y
  // deja la impresión de que no hizo nada.
  ok('la auditoría escribe su resultado en el registro de ejecución',
     /console\.log\(resumen\)/.test(core),
     'Sin esto, ejecutarla parece no hacer nada.');

  ok('existe la auditoría de lo ya guardado',
     core.includes('function auditarIntegridad'),
     'Es la única forma de saber qué quedó incompleto antes de los arreglos.');

  ok('la auditoría distingue "sin firma" de "firma perdida"',
     core.includes('imagen perdida') || core.includes('firmasRotas') || core.includes('rotas'),
     'No es lo mismo que alguien no firmara a que su firma se perdiera.');

  ok('existe la vigilancia de tokens inválidos',
     core.includes('function revisarIntentosSospechosos'));

  // En Apps Script una función que termina en "_" es privada y NO sale en el
  // desplegable del editor: no se puede ejecutar a mano. Las que están hechas
  // para ejecutarse así no pueden llevarlo.
  ['auditarIntegridad', 'instalarVigilancia', 'revisarIntentosSospechosos', 'verificarIntegridad'].forEach(f => {
    ok(`${f} se puede ejecutar desde el editor (sin guion bajo)`,
       new RegExp('function ' + f + '\\s*\\(').test(core) && !core.includes('function ' + f + '_('),
       'Con "_" al final, Apps Script la oculta del desplegable.');
  });

  ok('hay documento de traspaso',
     existe('TRASPASO.md'),
     'Hoy una sola persona entiende el sistema completo.');

  ok('la lectura de gases también se verifica',
     leer('permiso-espacios-confinados.html').includes('NO quedó guardada'),
     'Fue justo el dato que se estuvo perdiendo.');

  ok('las búsquedas en las hojas son dirigidas, no recorridos completos',
     core.includes('createTextFinder'),
     'Sin esto, guardar se vuelve más lento a medida que crecen las hojas.');
});

/* ═══════════════════════════════════════════════════════════
   4. NÚCLEO COMPARTIDO — los 5 permisos no deben separarse
   ═══════════════════════════════════════════════════════════ */
grupo('Núcleo compartido de los backends', () => {
  const core = leer('backends/permisos/core.gs');
  // Se ignoran los comentarios: ahí los nombres aparecen solo como explicación.
  // Lo que importa es que no queden en el CÓDIGO que se ejecuta.
  const coreCodigo = core.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('core.gs no menciona ningún permiso concreto en su código',
     !/Trabajo en Caliente|Espacios Confinados|Izajes de Cargas|Trabajo Eléctrico|Trabajo en Alturas/.test(coreCodigo),
     'Debe ser idéntico en los cinco proyectos; lo propio va en config-<tipo>.gs.');
  ok('core.gs no define el token (vive en el config de cada proyecto)',
     !/^const API_TOKEN =/m.test(core));

  const tipos = ['caliente', 'alturas', 'confinados', 'izajes', 'electrico'];
  tipos.forEach(t => {
    const f = `backends/permisos/config-${t}.gs`;
    ok(`existe ${f}`, existe(f));
    if (existe(f)) {
      const c = leer(f);
      ok(`  config-${t} define nombre, código y token`,
         /const PERMISO_NOMBRE =/.test(c) && /const PERMISO_CODIGO =/.test(c) && /const API_TOKEN =/.test(c));
    }
  });
});

/* ═══════════════════════════════════════════════════════════
   5. TOKEN — el mismo valor en todos lados o nada funciona
   ═══════════════════════════════════════════════════════════ */
grupo('Token compartido', () => {
  const sitio = /API_TOKEN:\s*'([^']+)'/.exec(leer('config.js'));
  ok('config.js define el token del sitio', !!sitio);
  if (!sitio) return;
  const archivos = ['backends/backend-epp.gs', 'backends/backend-personal-autorizado.gs',
    ...['caliente', 'alturas', 'confinados', 'izajes', 'electrico'].map(t => `backends/permisos/config-${t}.gs`)];
  archivos.forEach(f => {
    if (!existe(f)) return ok(`${f} existe`, false);
    const m = /const API_TOKEN = '([^']+)'/.exec(leer(f));
    ok(`${f} usa el mismo token que el sitio`, m && m[1] === sitio[1],
       m ? 'difiere del de config.js' : 'no define API_TOKEN');
  });
});

/* ═══════════════════════════════════════════════════════════
   6. DESPLIEGUE — los errores que ya nos hicieron perder tiempo
   ═══════════════════════════════════════════════════════════ */
grupo('Herramientas y equipos por permiso', () => {
  // Los cinco permisos preguntan qué herramientas se van a usar, con fichas de
  // lo habitual en ESE trabajo más un campo libre. El campo oculto guarda el
  // texto combinado, así que lo ya registrado en la hoja se sigue leyendo.
  const CAMPO = {
    'permiso-trabajo-caliente.html': 'herramientas',
    'permiso-trabajo-alturas.html': 'herramientas',
    'permiso-trabajo-electrico.html': 'herramientas',
    'permiso-espacios-confinados.html': 'herramientas',
    'permiso-izajes-cargas.html': 'equiposReq'
  };
  Object.entries(CAMPO).forEach(([f, campo]) => {
    const t = leer(f);
    ok(`${f}: tiene el campo de herramientas/equipos`,
       t.includes(`id="${campo}Sel"`) && t.includes(`id="${campo}"`));
    ok(`  se inicializa y se restaura`,
       t.includes(`initSel_${campo}();`) && t.includes(`sel_${campo}.set(vals.${campo}`));
    ok(`  se GUARDA con el permiso`,
       t.includes(`${campo}: document.getElementById('${campo}').value`),
       'Sin esto el campo se llena pero no queda en la hoja.');
    const m = new RegExp("opciones: \\[([^\\]]*)\\]").exec(t.slice(t.indexOf(`function initSel_${campo}`)));
    const n = m ? (m[1].match(/'/g) || []).length / 2 : 0;
    ok(`  ofrece opciones propias del permiso (${n})`, n >= 8,
       'Una lista genérica no ahorra escribir: tiene que tener lo que de verdad se usa en ese trabajo.');
  });
});

grupo('Historial y vencimiento', () => {
  const core = leer('permiso-core.js');
  const back = leer('backends/permisos/core.gs');
  const dash = leer('dashboard.html');

  // ── Historial (bitácora) desde el portal ──
  ok('el permiso puede consultar su bitácora', core.includes('verHistorialDelPermiso'));
  ok('el backend expone el historial', back.includes("action === 'history'"));
  ok('el historial muestra también los intentos rechazados',
     core.includes('hp-marca') && core.includes('ETIQUETA_ACCION'),
     'Un intento rechazado de tocar un permiso cerrado es justo lo que hay que poder demostrar.');
  ['permiso-trabajo-caliente.html','permiso-trabajo-alturas.html','permiso-espacios-confinados.html',
   'permiso-izajes-cargas.html','permiso-trabajo-electrico.html'].forEach(f => {
    ok(`${f} tiene el botón de historial`, leer(f).includes('id="historyBtn"'));
  });

  // ── Vencimiento real ──
  ok('el backend guarda la vigencia en columnas propias',
     back.includes("'hastaFecha', 'hastaHora'"),
     'Leer el JSON de cada fila solo para saber cuándo vence sería caro.');
  ok('el listado devuelve la vigencia', back.includes('hastaFecha: hastaFecha'));
  ok('el dashboard calcula el vencimiento', dash.includes('estadoVigencia'));
  ok('distingue vencido de por vencer',
     dash.includes("'vencido'") && dash.includes("'porvencer'"));
  ok('la fecha se arma en hora local, no UTC',
     /new Date\(a, m-1, d,/.test(dash),
     'Con UTC un permiso que vence a las 6pm aparecía venciendo a la 1pm.');
  ok('ordena por urgencia real',
     /va\.minutos - vb\.minutos/.test(dash));
  ok('los permisos sin vigencia siguen funcionando como antes',
     dash.includes('HORAS_ALERTA'),
     'Los permisos viejos no declaran vigencia: no pueden quedar sin indicador.');
});

grupo('Código QR e impresión', () => {
  ok('existe el generador de QR propio', existe('qr.js'),
     'Un servicio de internet no cargaría en planta sin señal, que es justo donde se usa.');
  if (existe('qr.js')) {
    const qr = leer('qr.js');
    ok('no depende de ningún servicio externo',
       !/https?:\/\//.test(qr.replace(/\/\*[\s\S]*?\*\//g, '')),
       'Debe funcionar sin conexión.');
    ok('usa corrección de errores (se lee aunque se ensucie)',
       qr.includes('TABLA_M') && qr.includes('corregir'));
  }
  ok('qr.js está en la caché del Service Worker', leer('sw.js').includes("'./qr.js'"));

  const core = leer('permiso-core.js');
  ok('el permiso genera su QR', core.includes('mostrarQrDelPermiso'));
  ok('el QR lleva la dirección que abre ESE permiso',
     /\?code=' \+ encodeURIComponent\(permitCode\)/.test(core),
     'Si solo llevara el código, escanearlo no abriría nada.');

  ['permiso-trabajo-caliente.html','permiso-trabajo-alturas.html','permiso-espacios-confinados.html',
   'permiso-izajes-cargas.html','permiso-trabajo-electrico.html'].forEach(f => {
    const t = leer(f);
    ok(`${f} carga qr.js y tiene dónde mostrarlo`,
       t.includes('src="qr.js"') && t.includes('id="qrPermiso"'));
  });

  // Impresión compacta: un permiso llegaba a salir en 7 hojas.
  const css = leer('common.css');
  ok('las firmas se achican al imprimir',
     /canvas\.pad[\s\S]{0,120}?height:72px/.test(css),
     'Cada firma ocupaba 220px y hay hasta diez por permiso.');
  ok('las secciones pueden partirse entre hojas',
     /\.section\{ break-inside:auto/.test(css),
     'Forzarlas enteras dejaba media hoja en blanco y sumaba páginas.');
  ok('los ejecutantes se imprimen en dos columnas',
     /\.exec-cards\{[\s\S]{0,160}?grid-template-columns:1fr 1fr/.test(css));
  ok('el QR sale en la impresión', /@media print\{[\s\S]*?\.qr-permiso\{[\s\S]{0,120}?display:block/.test(css));
});

grupo('ATS: otros, QR centrado y errores del servidor', () => {
  const h = leer('ats.html');
  const gs = leer('backends/backend-ats.gs');
  ok('hay ficha "Otro" en los permisos, con campo para escribirlo',
     /PERMISOS_UI = PERMISOS\.concat\(\[\{ id: 'otro'/.test(h) && h.includes('id="permisoOtro"'));
  ok('"Otro" no entra al catálogo (no dispara la alerta de permisos por peligros)',
     !/id: 'otro'/.test(leer('ats-catalogo.js')));
  ok('el otro permiso se guarda, se recarga y sale en la hoja',
     h.includes("permisoOtro: ''") && (h.match(/\['permisoOtro', 'permisoOtro'\]/g) || []).length === 2 && /OTRO: ' \+/.test(h));
  ok('si marcan "Otro" sin escribirlo, queda como pendiente', h.includes('Escribir cuál es el otro permiso'));
  ok('el backend guarda el texto del otro permiso en la columna', /x === 'otro' \? 'otro: '/.test(gs));
  ok('herramientas tiene campo visible para escribir otras', /Otras herramientas o equipos \(escríbelas\)/.test(h) && /<textarea[^>]*id="herrOtro"/.test(h));
  const col = /col style="width:' \+ \(qr \? (\d+) : 57\) \+ '%"><col style="width:25%">' \+ \(qr \? '<col style="width:(\d+)%">'/.exec(h);
  ok('las columnas del encabezado suman 100% con QR', col && 18 + (+col[1]) + 25 + (+col[2]) === 100);
  ok('la columna del QR cabe la imagen de 115 px (900 px de hoja)', col && 900 * (+col[2]) / 100 - 4 >= 115,
     'Con 12% quedaban ~98 px: el QR se salía por la derecha y no quedaba centrado.');
  ok('el QR no puede desbordar su celda', /\.qr-hoja img\{[^}]*max-width:100%/.test(h));
  ok('"Load failed" se explica en vez de mostrarse crudo',
     h.includes('function motivoFallaSrv') && !/No se pudo consultar: ' \+ esc\(e\.message\)/.test(h));
  ok('el backend funciona aunque el script no esté creado desde la hoja',
     /function libro_\(\)[\s\S]{0,400}?getActiveSpreadsheet\(\)[\s\S]{0,200}?ATS_SHEET_ID/.test(gs) && !/function hoja_[\s\S]{0,80}?getActiveSpreadsheet/.test(gs));
  ok('el backend termina en una llave (sin texto pegado de más al final)', /\}\s*$/.test(gs));
});

grupo('ATS: tocar un ATS lo abre de una para revisarlo', () => {
  const h = leer('ats.html');
  ok('las tarjetas de las listas del menú son revisables', /class="pl-item" data-revisar="' \+ esc\(x\.code\)/.test(h) && /tarjetasRevisables\(lista, 'menu'\)/.test(h));
  ok('las tarjetas de la lista "Abrir" también', /tarjetasRevisables\(cont, 'editor', cerrarPanel\)/.test(h));
  ok('tocar un botón dentro de la tarjeta hace lo del botón, no revisa', /if \(e\.target\.closest\('button'\)\) return;/.test(h));
  ok('revisar no toca el borrador del dispositivo', /function revisarAts[\s\S]{0,500}?const propio = ats; ats = ref; try \{ armarHoja\(\); \} finally \{ ats = propio; \}/.test(h));
  ok('desde la revisión se puede agregar personal o cerrar', h.includes('id="btnRevPersonal"') && h.includes('id="btnRevCerrar"'));
  ok('un ATS cerrado no muestra agregar/cerrar en la revisión', /body\.revision\.rev-cerrado \.rev-acc\{display:none;\}/.test(h));
  ok('el menú se oculta mientras se revisa', /body\.previa #menuAts\{display:none !important;\}/.test(h));
  ok('"Volver" sale de la revisión y deja el botón como estaba', /function salirRevision[\s\S]{0,200}?'← Volver a editar'/.test(h));
});

grupo('ATS: catálogo ampliado y editor más guiado', () => {
  const vm = require('vm');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(leer('ats-catalogo.js') + ';this.D={PELIGROS,TAREAS,HERRAMIENTAS,CONDICIONES,CONTROLES_ADICIONALES,JERARQUIA}', ctx);
  const D = ctx.D, h = leer('ats.html');
  const pid = new Set(D.PELIGROS.map((p) => p.id));
  const herr = D.HERRAMIENTAS.flatMap((g) => g.items);
  ok('hay condición de manipulación manual de cargas', D.CONDICIONES.some((c) => c.id === 'manual' && c.peligros.includes('cargas')));
  ok('al menos 25 condiciones de trabajo', D.CONDICIONES.length >= 25);
  ok('las condiciones apuntan a peligros que existen', D.CONDICIONES.every((c) => c.peligros.every((x) => pid.has(x))));
  ok('toda condición tiene palabras clave para sugerirse', D.CONDICIONES.every((c) => (c.claves || []).length));
  ok('hay condición "Otra" para escribir', /concat\(\[\{ id: 'otra', nombre: 'Otra \(escribir\)' \}\]\)/.test(h) && h.includes('id="edCondOtro"'));
  ok('las condiciones salen en la hoja impresa', /function textoCondiciones/.test(h) && /Condiciones: ' \+ esc\(textoCondiciones\(t\)\)/.test(h));
  ok('todos los peligros tienen controles adicionales', D.PELIGROS.every((p) => (D.CONTROLES_ADICIONALES[p.id] || []).length >= 2));
  ok('los controles adicionales usan niveles de la jerarquía', Object.values(D.CONTROLES_ADICIONALES).flat().every(([t, j]) => t && D.JERARQUIA[j]));
  ok('los adicionales se ofrecen sin marcar', /className = 'ctrl opcional'/.test(h));
  ok('cada nivel de control tiene su campo "Otro"', /className = 'j-otro'/.test(h) && /propio: true/.test(h));
  ok('al menos 140 herramientas en 12 grupos, sin repetidas', herr.length >= 140 && D.HERRAMIENTAS.length >= 12 && new Set(herr).size === herr.length);
  ok('cada grupo de herramientas tiene su "Otra"', /Otra en ' \+ esc\(g\.grupo\.toLowerCase\(\)\)/.test(h) && /herrOtros\[g\.grupo\]/.test(h));
  ok('las herramientas de las tareas tipo existen', D.TAREAS.every((t) => (t.herr || []).every((x) => herr.includes(x))));
  ok('al menos 45 tareas tipo, con peligros y siguientes válidos', D.TAREAS.length >= 45 &&
     D.TAREAS.every((t) => t.peligros.every((x) => pid.has(x)) && (t.siguiente || []).every((x) => D.TAREAS.some((y) => y.id === x))));
  ok('sugerencias en vivo con palabra a medias ("valv")', /w\.startsWith\(e\)/.test(h));
  ok('se pueden ver todas las tareas tipo', h.includes('Ver todas las tareas tipo'));
  ok('"cuarto frío" no se sugiere solo por la tarea tipo', D.CONDICIONES.find((c) => c.id === 'frio').soloTexto === true && /!c\.soloTexto/.test(h));
  ok('la tarea nueva va antes de "Orden y aseo" por defecto', /function posicionPorDefecto/.test(h) && /ats\.tareas\.splice\(pos, 0, t\)/.test(h));
  ok('se escoge dónde va la tarea y hay "+ Tarea después"', h.includes('id="edPos"') && h.includes('data-a="despues"'));
  ok('la tarea agregada después de firmado queda marcada e impresa', /t\.agregadaDespues = new Date\(\)\.toISOString\(\)/.test(h) && h.includes('Tarea agregada después de firmado el ATS'));
  ok('desde la revisión se agrega una tarea olvidada', h.includes('id="btnRevTarea"'));
  ok('un ATS cerrado no admite tareas nuevas', /function abrirEditor[\s\S]{0,120}?ats\.estado === 'CERRADO'/.test(h));
  ok('copiar ATS: sin firmas, sin código y con fecha de hoy', /function copiaSinFirmas[\s\S]*?n\.code = null[\s\S]*?n\.cab\.desde = hoyISO\(\)[\s\S]*?firma: null/.test(h));
  ok('copiar ATS está en la revisión y en "Abrir"', h.includes('id="btnRevCopiar"') && h.includes('id="cpActual"') && h.includes('data-copiar='));
  ok('"_pos" no se guarda en la tarea', /delete t\._pos/.test(h));
});

grupo('Permisos: hoja compacta para imprimir / PDF (como el ATS)', () => {
  const core = leer('permiso-core.js');
  const css = leer('common.css');
  ok('el botón Imprimir arma la hoja compacta antes de imprimir', /\$\('printBtn'\)\.addEventListener\('click', imprimirHoja\)/.test(core) && /async function imprimirHoja[\s\S]{0,200}?prepararImpresion\(\)[\s\S]{0,200}?window\.print\(\)/.test(core));
  ok('espera a que carguen las imágenes (logo, firmas, QR) antes del diálogo', /imagenesListas_\(cont, \d+\)/.test(core));
  ok('imprimir desde el menú del navegador también usa la hoja', /addEventListener\('beforeprint'/.test(core));
  ok('no se vuelve a armar si el botón acaba de armarla (las imágenes no cargarían)', /Date\.now\(\) - hojaArmadaEn_ < \d+\) return/.test(core));
  ok('el logo va como dataURL (sale aunque se imprima desde el menú)', /readAsDataURL/.test(core) && /logoHoja_ \|\| 'logo-indimon\.png'/.test(core));
  ok('si el armado falla, se imprime el formulario como antes', /catch \(e\) \{[\s\S]{0,200}?classList\.remove\('hp-lista'\)/.test(core));
  ok('carta horizontal solo en los permisos (no cambia otras páginas)', /@page\{size:letter landscape;margin:8mm;\}/.test(core) && !/@page\{size:letter landscape/.test(css));
  ok('al imprimir se ve SOLO la hoja', /body\.hp-lista > \*:not\(#hojaPermiso\)\{display:none !important;\}/.test(css));
  ok('en pantalla la hoja no se ve', /#hojaPermiso\{display:none;\}/.test(css));
  ok('preguntas de a dos por renglón con su respuesta', /hp-qa[\s\S]{0,200}?width:42%[\s\S]{0,60}?width:8%/.test(core));
  ok('campos de a tres por renglón', /if \(fila\.length === 3\) cerrarFila\(\)/.test(core));
  ok('firmas en cuadrícula y ejecutantes en tabla', /hp-firmas/.test(core) && /hp-ejec/.test(core));
  ok('lee las listas, SÍ/NO sueltas, cierre, cálculos, tablas y casillas', ['check-item', 'yn-row', 'close-q', 'calc-row', "el.tagName === 'TABLE'", 'casillas.length >= 2', 'sig-block', 'exec-card'].every((x) => core.includes(x)));
  ok('incluye la bitácora de lecturas de gases, legible en blanco y negro', /c\.contains\('gasLog'\)/.test(core) && core.includes('FUERA DE RANGO'));
  ok('una firma vacía no se imprime como imagen en blanco', /p\.hasInk && !p\.hasInk\(\) \? null/.test(core));
  ok('lo oculto en pantalla no sale en la hoja', /function visibleHoja_[\s\S]{0,80}?getClientRects\(\)\.length > 0/.test(core));
});

grupo('Clave del portal (los datos del personal ya no quedan abiertos con el token público)', () => {
  const vm = require('vm');
  const backs = { 'ATS': 'backends/backend-ats.gs', 'EPP': 'backends/backend-epp.gs', 'Personal': 'backends/backend-personal-autorizado.gs', 'Permisos (core)': 'backends/permisos/core.gs' };
  Object.entries(backs).forEach(([n, f]) => {
    const t = leer(f);
    ok(n + ': en GitHub la clave queda sin escribir (nunca la real)', /const CLAVE_PORTAL = 'ESCRIBE_AQUI_LA_CLAVE_DEL_PORTAL';/.test(t));
    ok(n + ': el rechazo lleva codigoError CLAVE', (t.match(/codigoError: 'CLAVE'/g) || []).length >= 2);
    // Se ejecuta la validación real con distintas configuraciones.
    const probar = (propiedad, constante) => {
      let src = (f.includes('permisos/') ? leer('backends/permisos/config-caliente.gs') + '\n' : '') + t;
      if (constante) src = src.replace("'ESCRIBE_AQUI_LA_CLAVE_DEL_PORTAL'", JSON.stringify(constante));
      const ctx = { PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'CLAVE_PORTAL' ? propiedad : null) }) }, console };
      vm.createContext(ctx);
      vm.runInContext(src + ';this.chk=checkToken_;this.tok=API_TOKEN;', ctx);
      return ctx;
    };
    const sin = probar(null, null);
    ok(n + ': sin clave configurada acepta el token de siempre (nada se cae al actualizar)', sin.chk(sin.tok) === true && sin.chk('otra') === false);
    const conConst = probar(null, 'Obra-Segura-2026!');
    ok(n + ': con clave escrita, el token público deja de servir', conConst.chk(conConst.tok) === false && conConst.chk('Obra-Segura-2026!') === true);
    const conProp = probar('Desde-Propiedades-1', 'Obra-Segura-2026!');
    ok(n + ': la clave en Propiedades del script tiene prioridad', conProp.chk('Desde-Propiedades-1') === true && conProp.chk('Obra-Segura-2026!') === false);
  });
  const c = leer('common.js');
  ok('cada equipo guarda su clave y la usa en todas las llamadas', /const ClavePortal = \{/.test(c) && /PORTAL_CONFIG\.API_TOKEN = this\.get\(\) \|\| PORTAL_CONFIG\._tokenOriginal/.test(c) && /ClavePortal\.aplicar\(\);/.test(c));
  ok('si el servidor rechaza la clave, se pide en cualquier página', /res\.clone\(\)\.json\(\)\.then\(\(j\) => \{ if \(ClavePortal\.esErrorDeClave\(j\)\) ClavePortal\.pedir\(\); \}\)/.test(c));
  ok('la cola reenvía con la clave vigente', /item\.body\.token = PORTAL_CONFIG\.API_TOKEN/.test(c));
  ok('un rechazo de clave NO saca el pendiente de la cola (antes se perdía a los 5 intentos)', /else if \(ClavePortal\.esErrorDeClave\(json\)\) \{[\s\S]{0,300}?ClavePortal\.pedir\(\);\s*\} else \{/.test(c));
  ok('en un formulario, guardar la clave no recarga la página (no se pierde lo escrito)', /hayFormulario = document\.querySelector\('#app, #atsApp, form'\)/.test(c));
  ok('el inicio tiene el botón de la clave', leer('index.html').includes('id="btnClave"'));
});

grupo('ATS vencidos y ATS en el tablero', () => {
  const vm = require('vm');
  const c = leer('common.js');
  const fn = /function atsVence[\s\S]*?\n\}\nfunction atsVencido[\s\S]*?\n\}/.exec(c)[0];
  const ctx = {}; vm.createContext(ctx); vm.runInContext(fn + ';this.v=atsVencido;', ctx);
  ok('un ATS abierto con fecha hasta de ayer está vencido', ctx.v({ estado: 'ABIERTO', fechaHasta: '2020-01-01' }) === true);
  ok('un ATS cerrado nunca sale vencido', ctx.v({ estado: 'CERRADO', fechaHasta: '2020-01-01' }) === false);
  ok('vence al final del día (con la fecha en formato de la hoja)', ctx.v({ estado: 'ABIERTO', fechaHasta: '2999-01-01T05:00:00.000Z' }) === false && ctx.v({ estado: 'ABIERTO', fechaDesde: '2020-05-05' }) === true);
  const d = leer('dashboard.html');
  ok('el tablero consulta los ATS en paralelo con los permisos', /const pAts = cargarAts\(\);/.test(d) && /rAts\.abiertos\.forEach/.test(d));
  ok('si el ATS no responde, el tablero lo dice (no afirma "no hay abiertos")', /out\.fallo = \{ nombre:'ATS'/.test(d));
  ok('tocar un ATS en el tablero lo abre para revisar', /ats\.html\?code=' \+ encodeURIComponent\(it\.code\) \+ '&ver=1'/.test(d) && /qs\.get\('ver'\) === '1'\) revisarAts/.test(leer('ats.html')));
  ok('el inicio muestra ATS abiertos y vencidos', /function contarAts/.test(leer('index.html')) && /abiertos\.filter\(atsVencido\)/.test(leer('index.html')));
  ok('las listas del ATS marcan VENCIDO', /atsVencido\(x\) \? '<span class="etiqueta-estado vencido">VENCIDO/.test(leer('ats.html')));
});

grupo('ATS amarrado con sus permisos', () => {
  const h = leer('ats.html'), core = leer('permiso-core.js');
  ok('el ATS abre cada permiso que requiere con datos y personal', /function abrirPermisoDesdeAts/.test(h) && /personas: ats\.participantes\.map/.test(h) && /'\?desdeAts=1'/.test(h));
  ok('los permisos del ATS se mapean a su backend', /const PERMISO_A_BACKEND = \{ caliente: 'caliente', alturas: 'alturas', confinados: 'confinados', izaje: 'izajes', electrico: 'electrico' \}/.test(h));
  ok('el permiso toma los datos solo si son recientes y de su tipo', /Date\.now\(\) - \(p\.t \|\| 0\) > 30 \* 60000/.test(core) && /p\.tipo && tipo && p\.tipo !== tipo/.test(core));
  ok('el permiso llega directo al formulario nuevo, después de cargar la página', /get\('desdeAts'\) === '1'\) \{[\s\S]{0,300}?setTimeout\(\(\) => \{ startNewPermit\(\);/.test(core));
  ok('el permiso guarda y restaura el ATS relacionado', /if \(atsRelacionado\) base\.atsRelacionado = atsRelacionado;/.test(core) && /atsRelacionado = data\.atsRelacionado \|\| null;/.test(core));
  ok('el permiso le devuelve su código al ATS', /'ssta-ats-permisos:' \+ atsRelacionado/.test(core) && /'ssta-ats-permisos:' \+ a\.code/.test(h));
  ok('la hoja impresa del permiso dice su ATS', /ATS relacionado: <b>' \+ esc\(atsRelacionado\)/.test(core));
  ok('la hoja del ATS lista sus permisos', /Permisos diligenciados: ' \+ permisosAsociadosDe\(ats\)/.test(h));
  ok('al cerrar el ATS avisa si algún permiso sigue abierto', /const r = await permisosAbiertosDe\(a\);[\s\S]{0,200}?siguen ABIERTOS/.test(h));
  ok('copiar un ATS no se lleva los permisos del original', /n\.cab\.permisosAsociados = \[\];/.test(h));
});

grupo('Visual: "Todo cumple", marca común, avisos y barra', () => {
  const core = leer('permiso-core.js'), css = leer('common.css'), c = leer('common.js');
  ok('"Todo C / Todo SÍ" por categoría', /class="cat-todo">✓ Todo ' \+ esc\(states_\[0\]\.label\)/.test(core));
  ok('solo marca las preguntas sin responder', /filter\(\(r\) => !r\.querySelector\('button\[aria-pressed="true"\]'\)\)/.test(core));
  ok('pide confirmar que se verificó en campo', /¿Confirmas que las verificaste en campo\?/.test(core));
  ok('avance por categoría (ej. 5/12)', /av\.textContent = hechas \+ '\/' \+ filas\.length/.test(core));
  ok('"Todo SÍ" por sección en alturas', /function initTodoSiPorSeccion/.test(core) && /initFreeformYN\(\); initTodoSiPorSeccion\(\);/.test(core));
  ok('la hoja impresa no copia los botones nuevos', /n\.tagName !== 'BUTTON'/.test(core) && /querySelector\('\.cat-nombre'\)/.test(core));
  ok('el mismo logo en todas las pantallas', /\.marca\{[^}]*logo-indimon\.png/.test(css) && /body \.hdr-logo\{[^}]*logo-indimon\.png/.test(css) &&
     ['index.html', 'ats.html', 'dashboard.html', 'inspeccion-epp.html', 'personal-autorizado.html'].every((f) => leer(f).includes('class="marca')));
  ok('ya no quedan el ⛑ ni el "📋 Permisos" como logo', !leer('index.html').includes('<div class="logo">⛑</div>') && !leer('dashboard.html').includes('<h1>📋 Permisos</h1>'));
  ok('aviso de personal: franja arriba y se puede cerrar', /const AvisoPersonal = \{/.test(c) && /insertBefore\(el, document\.body\.firstChild\)/.test(c) && /class="cerrar"/.test(c) && !/\.aviso-personal\{[^}]*position:fixed/.test(css));
  ok('el ATS y los permisos usan el mismo aviso', /AvisoPersonal\.mostrar\(personalMotivo, cargarPersonal\)/.test(leer('ats.html')) && /AvisoPersonal\.mostrar\(personalMotivo, cargarPersonalCompartido\)/.test(core));
  const vm = require('vm');
  const ob = /const OutboxBadge = \{\s*\/\*[\s\S]*?textoBadge\(items\) \{[\s\S]*?\n  \},/.exec(c)[0] + '\n};';
  const ctx = { PORTAL_CONFIG: { BACKENDS: { ats: { url: 'u-ats' }, caliente: { url: 'u-cal', nombre: 'Trabajo en Caliente' }, epp: { url: 'u-epp' } } } };
  vm.createContext(ctx); vm.runInContext(ob + ';this.O=OutboxBadge;', ctx);
  ok('pendientes: dice "ATS" cuando son ATS', ctx.O.textoBadge([{ url: 'u-ats' }, { url: 'u-ats' }, { url: 'u-ats' }]) === '⏳ 3 ATS pendientes de enviar');
  ok('pendientes: dice "permiso" cuando es un permiso', ctx.O.textoBadge([{ url: 'u-cal' }]) === '⏳ 1 permiso pendiente de enviar');
  ok('pendientes: mezclados dice "registros"', ctx.O.textoBadge([{ url: 'u-cal' }, { url: 'u-epp' }]) === '⏳ 2 registros pendientes de enviar');
  ok('barra de revisión del ATS en dos columnas', /body\.revision \.previa-barra\{display:grid;grid-template-columns:1fr 1fr;/.test(leer('ats.html')));
});

grupo('Anexo de personal: firma del verificador y permisos abiertos', () => {
  const h = leer('personal-autorizado.html');
  ok('la firma del verificador se inicializa al abrir el registro', /setupPad\(padVerif\);/.test(h) && /getElementById\('padVerificador'\)/.test(h));
  ok('la firma del verificador se limpia en cada registro nuevo', /pads\.padVerificador\.clear\(\)/.test(h));
  ok('los permisos abiertos se consultan en paralelo', /Promise\.allSettled\(fuentes\.map/.test(h) && !/for\(const backend of PERMIT_BACKENDS\)/.test(h));
  ok('si un servidor falla se dice cuál (no se esconde)', /No se pudo consultar: /.test(h) && /btnReintentarPicker/.test(h));
  ok('usa la clave vigente, no el token de cuando abrió la página', /encodeURIComponent\(PORTAL_CONFIG\.API_TOKEN\)/.test(h.split('async function consultarAbiertos')[1] || ''));
  ok('también se pueden vincular ATS abiertos', /fuentes\.push\(\{ backend:ats, esAts:true \}\)/.test(h));
  ok('la fecha de hoy es la local (no UTC)', /ahora\.setMinutes\(ahora\.getMinutes\(\) - ahora\.getTimezoneOffset\(\)\)/.test(h) && !/new Date\(\)\.toISOString\(\)\.slice\(0,10\)/.test(h));
  ok('los encabezados del anexo van en columna', /^\.hdr\{display:block;/m.test(h));
  // Filtro de abiertos, ejecutado de verdad
  const vm = require('vm');
  const src = /function conLimite[\s\S]*?\n\}\nasync function consultarAbiertos[\s\S]*?\n\}\n/.exec(h)[0];
  const ctx = { PORTAL_CONFIG: { API_TOKEN: 't' }, ClavePortal: { esErrorDeClave: () => false }, setTimeout,
    fetchWithRetry: async (u) => ({ text: async () => JSON.stringify(u.includes('ats') ? { ok: true, rows: [{ code: 'ATS-1', estado: 'ABIERTO' }, { code: 'ATS-2', estado: 'CERRADO' }] }
      : { ok: true, rows: [{ permitCode: 'TC-1', status: 'ABIERTO' }, { permitCode: 'TC-2', status: 'CERRADO' }, { permitCode: 5, status: 'ABIERTO ' }] }) }) };
  vm.createContext(ctx); vm.runInContext(src + ';this.C=consultarAbiertos;', ctx);
  return Promise.all([ctx.C({ url: 'x', nombre: 'Caliente' }, false), ctx.C({ url: 'ats', nombre: 'ATS' }, true)]).then(([p, a]) => {
    ok('filtra solo los permisos ABIERTOS (y tolera códigos numéricos)', JSON.stringify(p.map(x => x.code)) === '["TC-1","5"]');
    ok('filtra solo los ATS abiertos', JSON.stringify(a.map(x => x.code)) === '["ATS-1"]' && a[0].tipo === 'ATS');
  });
});

grupo('Anexo: exportar a PDF y fechas en el backend', () => {
  const h = leer('personal-autorizado.html');
  ok('la hoja PDF dice a qué permisos y ATS está anexado', /Anexado a: <b>/.test(h) && /Anexado a los siguientes permisos de trabajo y ATS/.test(h));
  ok('la hoja PDF lleva al verificador con su firma', /Verificado y aprobado por<\/td>/.test(h) && /firma-verif">' \+ img\(ver\.firma\)/.test(h));
  ok('la hoja PDF lleva la firma de cada persona', /<td class="firma">'\+img\(t\.firma\)/.test(h));
  ok('se ofrece el PDF al guardar (y sin señal también)', /¿Quieres exportarlo a PDF ahora\?/.test(h) && /btnPdfPendiente/.test(h));
  ok('PDF por día y de todo el historial', /class="btn-pdf"/.test(h) && /btnPdfTodo/.test(h) && /action=registro&obraId=/.test(h));
  ok('varios días: una hoja por día', /page-break-before:always/.test(h));
  const sw = /const CACHE_NAME = 'ssta-portal-(v\d+)'/.exec(leer('sw.js'));
  ok('la versión visible del anexo coincide con la del Service Worker', !!sw && h.includes('Portal SSTA · versión ' + sw[1]));

  const { crearEntorno } = require('./simulador-apps-script');
  const E = crearEntorno(path.join(RAIZ, 'backends/backend-personal-autorizado.gs'), { fechasComoSheets: true });
  const T = 'xSiVfEUE1t0l5RI3lD7PJp2RPIa7H9M5XenSm8P1', firma = 'data:image/png;base64,' + 'Q'.repeat(300);
  const o = E.post({ action: 'crearObra', nombre: 'PTAR', area: 'C', fechaInicio: '2026-09-28', fechaFin: '2026-10-10', token: T });
  const reg = (n) => ({ fecha: '2026-09-30', trabajadores: [{ nombre: 'Carlos', cedula: '1', cargo: 'S', firma }], verificador: { nombre: 'Ana', cedula: '2', firma: firma.replace('QQQQ', 'VVVV') }, permisos: [{ code: 'TC-1', tipo: 'Trabajo en Caliente' }], n });
  E.post({ action: 'guardarRegistro', obraId: o.obraId, fecha: '2026-09-30', data: reg(1), token: T, opId: 'x1' });
  E.post({ action: 'guardarRegistro', obraId: o.obraId, fecha: '2026-09-30', data: reg(2), token: T, opId: 'x2' });
  ok('Sheets guarda la fecha como Date (simulado como Google)', E.hojas['Registros'].filas[1][1] instanceof Date);
  ok('volver a guardar el mismo día ACTUALIZA, no duplica la fila', E.hojas['Registros'].filas.length - 1 === 1);
  const hist = E.get({ action: 'historial', obraId: o.obraId, token: T });
  ok('el historial devuelve la fecha como AAAA-MM-DD', hist.registros.length === 1 && hist.registros[0].fecha === '2026-09-30');
  const r = E.get({ action: 'registro', obraId: o.obraId, fecha: '2026-09-30', token: T });
  ok('se puede abrir un día guardado (para el PDF), con la firma del verificador', r.n === 2 && r.verificador.firma === firma.replace('QQQQ', 'VVVV') && r.permisos[0].code === 'TC-1');
  ok('"copiar último registro" trae el más reciente', E.get({ action: 'ultimoRegistro', obraId: o.obraId, token: T }).n === 2);
  const ob = E.get({ action: 'listObras', token: T }).obras[0];
  ok('las fechas de la obra vuelven como AAAA-MM-DD', ob.fechaInicio === '2026-09-28' && ob.fechaFin === '2026-10-10');
});

grupo('Asistencia a charlas (SSTA-F-005)', () => {
  const h = leer('asistencia.html'), idx = leer('index.html'), cfg = leer('config.js'), sw = leer('sw.js'), c = leer('common.js');
  ok('la página existe y está en el portal', /href="asistencia\.html"/.test(idx) && /SSTA-F-005/.test(idx));
  ok('config.js tiene el backend de asistencia', /asistencia: \{[\s\S]{0,300}?archivo: 'asistencia\.html'/.test(cfg));
  ok('funciona sin conexión (está en la caché del Service Worker)', sw.includes("'./asistencia.html'"));
  ok('cada día lleva tema, hora, duración y ejecutor', ['inTema', 'inHora', 'inDuracion', 'inEjecutor'].every((id) => h.includes('id="' + id + '"')));
  ok('el tema es obligatorio al guardar', /if \(!tema\)\{ st\.textContent = 'Escribe el tema de la charla\.'/.test(h));
  ok('firma por asistente, con la firma a pantalla completa del portal', /SignaturePad\.createManager/.test(h) && /canvas class="mini-pad" id="padAs\$\{n\}"/.test(h));
  ok('autocompleta con la base de datos de personal del anexo', /action=listPersonal/.test(h) && /autocompletar\(\$\('asNombre' \+ n\), buscarPersona/.test(h));
  ok('sin señal: queda en cola y se ve en la semana', /Outbox\.add\(URL_ASIS, body\)/.test(h) && /async function aplicarPendientes/.test(h));
  ok('borrador en el equipo mientras se diligencia', /LS\.borrador\(semana\.code, diaActual\)/.test(h) && /pagehide/.test(h));
  ok('sin servidor configurado funciona solo en el equipo', /Modo solo en este equipo/.test(h) && /if \(!URL_ASIS\)\{\s*mezclarDia/.test(h));
  ok('la cola no da por enviada una charla solo porque la semana exista', /item\.body\.action === 'guardarDia'\) return !!\(json\.semana && \(json\.semana\.opIds/.test(c));
  ok('el aviso de pendientes dice "charla"', /k === 'asistencia'\) return \{ uno: 'charla'/.test(c));
  ok('PDF: encabezado y códigos del formato V4', /CONTROL DE ASISTENCIA A CAPACITACION, EVENTOS Y REUNIONES\./.test(h) && /Versión: 4/.test(h) && /Código: SSTA-F-005/.test(h) && /Actualización: 26-08-2024/.test(h));
  ok('PDF: temario de lunes a domingo con hora, duración y ejecutor', /<b>Hora:<\/b>/.test(h) && /<b>Duración:<\/b>/.test(h) && /<b>Ejecutor:<\/b>/.test(h));
  ok('PDF: firma del trabajador en la columna de cada día, mínimo 16 filas', /DIA DE ASISTENCIA \(Firma del trabajador\)/.test(h) && /Math\.max\(16, personas\.length\)/.test(h));
  ok('PDF en carta horizontal', /size:letter landscape/.test(h));
  const swv = /const CACHE_NAME = 'ssta-portal-(v\d+)'/.exec(sw);
  ok('versión visible = versión del Service Worker', !!swv && h.includes('Portal SSTA · versión ' + swv[1]));

  // La hoja semanal junta a cada persona en UNA fila con sus días
  const vm = require('vm');
  const src = ['const DIAS', 'function clavePersona', 'function personasDeSemana', 'function mezclarDia'].map((k) => {
    const i = h.indexOf(k); const fin = h.indexOf('\n}\n', i); return h.slice(i, k === 'const DIAS' ? h.indexOf('\n', i) : fin + 2);
  }).join('\n');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src + ';this.P=personasDeSemana;this.M=mezclarDia;', ctx);
  const doc = { dias: {} };
  ctx.M(doc, { dia: 'lun', tema: 'A', asistentes: [{ nombre: 'Carlos', cedula: '1.010', firma: 'data:image/png;x' }, { nombre: 'Luis', cedula: '2', firma: '' }] });
  ctx.M(doc, { dia: 'mie', tema: 'B', asistentes: [{ nombre: 'Carlos Ríos', cedula: '1010', firma: 'data:image/png;y' }] });
  ctx.M(doc, { dia: 'mie', asistentes: [{ nombre: 'Ana', cedula: '3', firma: 'data:image/png;z' }] });
  ctx.M(doc, { dia: 'lun', quitar: ['C:2'] });
  const filas = ctx.P(doc);
  ok('una persona que asistió varios días ocupa una sola fila', filas.length === 2 && Object.keys(filas[0].dias).join() === 'lun,mie');
  ok('dos guardados del mismo día se suman, no se pisan', doc.dias.mie.asistentes.length === 2 && doc.dias.mie.tema === 'B');
  ok('quitar a alguien es explícito', doc.dias.lun.asistentes.length === 1);

  // Backend ejecutado en el simulador, con las fechas como las guarda Google
  const { crearEntorno } = require('./simulador-apps-script');
  let E;
  try { E = crearEntorno(path.join(RAIZ, 'backends/backend-asistencia.gs'), { fechasComoSheets: true }); }
  catch (e) { ok('backend-asistencia.gs se carga en el simulador', false, e.message); return; }
  const T = 'xSiVfEUE1t0l5RI3lD7PJp2RPIa7H9M5XenSm8P1', F = (x) => 'data:image/png;base64,' + x.repeat(300);
  const a = E.post({ action: 'abrirSemana', fecha: '2026-09-30', lugar: 'Planta Bavaria', token: T });
  ok('abrir semana: arranca el lunes y termina el domingo', a.ok && a.semana.semanaDel === '2026-09-28' && a.semana.semanaAl === '2026-10-04');
  ok('mismo lugar y semana (escrito distinto) → la MISMA hoja', E.post({ action: 'abrirSemana', fecha: '2026-10-02', lugar: ' planta  BAVARIA ', token: T }).code === a.code);
  E.post({ action: 'guardarDia', code: a.code, dia: 'mie', tema: 'Arnés', hora: '07:00', duracion: '15 min', ejecutor: 'Ana', asistentes: [{ nombre: 'Carlos', cedula: '1', firma: F('A') }], opId: 'p1', token: T });
  E.post({ action: 'guardarDia', code: a.code, dia: 'mie', asistentes: [{ nombre: 'Luis', cedula: '2', firma: F('B') }], opId: 'p2', token: T });
  const dup = E.post({ action: 'guardarDia', code: a.code, dia: 'mie', asistentes: [{ nombre: 'Luis', cedula: '2', firma: F('B') }], opId: 'p2', token: T });
  const s1 = E.get({ code: a.code, token: T }).semana;
  ok('dos celulares el mismo día: quedan los dos', s1.dias.mie.asistentes.length === 2 && s1.dias.mie.tema === 'Arnés');
  ok('un reintento de la cola no duplica', dup.duplicado === true);
  ok('las firmas vuelven completas', s1.dias.mie.asistentes.every((x) => x.firma.length > 100));
  ok('el opId queda en la semana (para saber si un pendiente ya llegó)', s1.opIds.indexOf('p2') !== -1);
  const off = E.post({ action: 'guardarDia', code: 'ASI-20260928-999999', semanaDel: '2026-10-01', lugar: 'PLANTA BAVARIA', dia: 'jue', tema: 'Aseo', asistentes: [{ nombre: 'Ana', cedula: '9', firma: F('C') }], opId: 'p3', token: T });
  ok('guardado sin señal con código propio se une a la semana que ya existía', off.code === a.code);
  const nueva = E.post({ action: 'guardarDia', code: 'ASI-20261005-123456', semanaDel: '2026-10-07', lugar: 'Taller', dia: 'mie', tema: 'X', asistentes: [], opId: 'p4', token: T });
  ok('guardado sin señal de una semana nueva la crea', nueva.ok && E.get({ code: 'ASI-20261005-123456', token: T }).semana.semanaDel === '2026-10-05');
  const lista = E.get({ list: 1, token: T }).rows;
  ok('listado con fechas AAAA-MM-DD, más reciente primero', lista.length === 2 && lista[0].semanaDel === '2026-10-05' && lista[1].semanaDel === '2026-09-28');
  ok('hoja "Asistencias": una fila por persona por charla', E.hojas['Asistencias'].filas.length - 1 === 3);
  ok('clave del portal: rechaza sin clave', E.post({ action: 'guardarDia', code: a.code, dia: 'mie', token: 'x' }).codigoError === 'CLAVE');
});

grupo('Caché y despliegue', () => {
  const sw = leer('sw.js');
  const v = /const CACHE_NAME = '([^']+)'/.exec(sw);
  ok('sw.js define CACHE_NAME', !!v, 'Sin subirlo, los celulares siguen con la versión vieja.');

  // Todo archivo servido debe estar listado en la caché
  const listados = [...sw.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]);
  const enDisco = fs.readdirSync(RAIZ).filter(f => /\.(html|css|js|json|png)$/.test(f) && f !== 'sw.js');
  enDisco.forEach(f => {
    ok(`${f} está en la caché del Service Worker`, listados.includes(f),
       'Si falta, esa página no funciona sin señal.');
  });

  // Todo lo listado debe existir de verdad
  listados.filter(f => f && f !== '').forEach(f => {
    ok(`${f} existe en el repositorio`, existe(f), 'Está en la caché pero el archivo no está.');
  });

  const man = JSON.parse(leer('manifest.json'));
  ok('manifest.json es válido y tiene íconos', Array.isArray(man.icons) && man.icons.length > 0);
  man.icons.forEach(i => ok(`  ícono ${i.src} existe`, existe(i.src.replace('./', ''))));
  ok('hay un ícono maskable con margen propio',
     man.icons.some(i => i.purpose === 'maskable'),
     'Android recorta los maskable en círculo; con el logo ancho se cortan las letras.');
});

/* ═══════════════════════════════════════════════════════════
   7. ACCESIBILIDAD — se usa a pleno sol y con guantes
   ═══════════════════════════════════════════════════════════ */
grupo('Legibilidad en obra', () => {
  const css = leer('common.css');
  const lum = (h) => {
    h = h.replace('#', '');
    const c = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255)
      .map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  const muted = /--ink-muted:\s*(#[0-9a-fA-F]{6})/.exec(css);
  ok('existe --ink-muted para el texto secundario', !!muted);
  if (muted) ok(`--ink-muted cumple 4.5:1 sobre blanco (${ratio(muted[1], '#ffffff').toFixed(2)}:1)`,
                ratio(muted[1], '#ffffff') >= 4.5);

  const grisesMalos = ['#aab3ba', '#8a97a3'];
  ['common.css', 'inspeccion-epp.html', 'dashboard.html', 'index.html'].forEach(f => {
    const t = leer(f);
    grisesMalos.forEach(g => {
      // se ignoran los comentarios, donde el color aparece solo como explicación
      const sinComentarios = t.replace(/\/\*[\s\S]*?\*\//g, '');
      ok(`${f} no usa ${g} (contraste insuficiente)`, !sinComentarios.includes(g));
    });
  });

  const touch = /--touch:\s*(\d+)px/.exec(css);
  ok('el alto mínimo táctil es de al menos 44px', touch && Number(touch[1]) >= 44,
     touch ? `--touch: ${touch[1]}px` : 'no se encontró --touch');
});

/* ═══════════════════════════════════════════════════════════
   8. SINTAXIS — que nada quede roto al pegar un archivo
   ═══════════════════════════════════════════════════════════ */
grupo('Sintaxis de todos los archivos', () => {
  fs.readdirSync(RAIZ).filter(f => f.endsWith('.js')).forEach(f => {
    let bien = true, err = '';
    try { new Function(leer(f)); } catch (e) { bien = false; err = e.message; }
    ok(`${f} compila`, bien, err);
  });
  const gs = [];
  const rec = (d) => fs.readdirSync(path.join(RAIZ, d)).forEach(x => {
    const rel = path.join(d, x);
    if (fs.statSync(path.join(RAIZ, rel)).isDirectory()) rec(rel);
    else if (x.endsWith('.gs')) gs.push(rel);
  });
  if (existe('backends')) rec('backends');
  gs.forEach(f => {
    let bien = true, err = '';
    try { new Function(leer(f)); } catch (e) { bien = false; err = e.message; }
    ok(`${f} compila`, bien, err);
  });
  fs.readdirSync(RAIZ).filter(f => f.endsWith('.html')).forEach(f => {
    const t = leer(f);
    ok(`${f} tiene los <div> balanceados`,
       (t.match(/<div/g) || []).length === (t.match(/<\/div>/g) || []).length);
    const bloques = [...t.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    bloques.forEach((b, i) => {
      let bien = true, err = '';
      try { new Function(b); } catch (e) { bien = false; err = e.message; }
      ok(`${f} · bloque <script> ${i + 1} compila`, bien, err);
    });
  });
  const css = leer('common.css');
  ok('common.css tiene las llaves balanceadas',
     (css.match(/\{/g) || []).length === (css.match(/\}/g) || []).length);
});

/* ═══════════════════════════════════════════════════════════ */
console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║   PRUEBAS DEL PORTAL SSTA — antes de desplegar        ║');
console.log('╚══════════════════════════════════════════════════════╝');
(async () => {
for (const [nombre, fn] of grupos) {
  console.log('\n▸ ' + nombre);
  try { await fn(); } catch (e) { fallos++; console.log('    ✗ error ejecutando el grupo: ' + e.message); }
}
console.log('\n' + '─'.repeat(58));
if (fallos === 0) {
  console.log(`✅  ${total} comprobaciones, todas correctas. Se puede desplegar.`);
} else {
  console.log(`❌  ${fallos} de ${total} comprobaciones fallaron. Revisar antes de subir nada.`);
}
process.exit(fallos === 0 ? 0 : 1);
})();
