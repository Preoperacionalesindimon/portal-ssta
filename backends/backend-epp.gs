/* ============================================================
   backend-epp.gs — Inspección de EPP (SSTA-F-006) — Portal SSTA / INDIMON
   ------------------------------------------------------------
   Sigue exactamente el mismo diseño que los backends de permisos:

     · Hoja "Inspecciones": UNA FILA POR PERSONA INSPECCIONADA. No se
       guarda una fila por formulario de 8 casillas como en el papel —
       cada persona es un registro independiente, porque en la práctica
       se revisa de a una y así se puede consultar el historial de EPP
       de un trabajador puntual.
     · Hoja "Firmas": las imágenes van aparte del JSON, troceadas si
       superan el máximo de 50.000 caracteres por celda de Google Sheets.
     · Hoja "Eventos": bitácora inmutable, una fila por cada intento de
       escritura (aplicado, rechazado o duplicado).
     · Idempotencia por opId: un reenvío desde el Outbox no duplica.

   NOVEDAD respecto a los otros backends: al guardar una persona cuyo
   EPP tenga elementos calificados como M (malo), se envía automáticamente
   un correo solicitando la reposición de esos elementos.

   ⚠️ ANTES DE USAR: llena CORREOS_REPOSICION más abajo con los correos
   reales a los que debe llegar la solicitud (almacén / compras / SSTA).
   ============================================================ */

const API_TOKEN = 'xSiVfEUE1t0l5RI3lD7PJp2RPIa7H9M5XenSm8P1'; // debe ser IDÉNTICO al del cliente (config.js)

// A quién le llega la solicitud de reposición cuando algo se marca como MALO.
// La analista SSTA recibe la solicitud formal; la aprobación del cambio la
// da Ana Bohórquez por WhatsApp, con la foto del elemento. Se puede agregar más de uno
// separado por coma si en el futuro debe llegarle a alguien más.
const CORREOS_REPOSICION = ['analista.ssta@indimon.com.co'];

// WhatsApp al que hay que mandar la FOTO del elemento en mal estado. El correo
// deja el registro formal, pero la foto es lo que permite aprobar el cambio sin
// tener que ir a ver el elemento físicamente — por eso se recuerda en el correo
// y se ofrece un botón directo en el portal.
const WHATSAPP_APROBACION = '+57 317 4045681';
const WHATSAPP_RESPONSABLE = 'Ana Bohórquez - Lider GH-SSTA';

// Copia opcional al inspector (si escribió su correo en el formulario).
const COPIAR_AL_INSPECTOR = true;

const SHEET_NAME = 'Inspecciones';
const FIRMAS_SHEET_NAME = 'Firmas';
const EVENTOS_SHEET_NAME = 'Eventos';

// Los 17 elementos del formato SSTA-F-006, en el mismo orden del papel.
const ELEMENTOS_EPP = [
  'CASCO CON BARBUQUEJO',
  'SOPORTE BASCULANTE',
  'VISOR',
  'CARETA DE SOLDAR',
  'GAFAS TRANSPARENTES',
  'GAFAS OSCURAS',
  'GAFAS DE SOBREPONER',
  'PROTECTOR AUDITIVO',
  'PROTECCIÓN RESPIRATORIA MEDIA CARA',
  'FILTROS / CARTUCHO',
  'PREFILTRO',
  'PETO MANGAS / CHAQUETA SOLDADOR',
  'GUANTES DE CAUCHO NITRILO',
  'GUANTES DE VAQUETA',
  'GUANTES DE PRECISIÓN',
  'BOTAS DE SEGURIDAD',
  'CARNÉT'
];

function checkToken_(token) {
  return token === API_TOKEN;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ================= HOJAS ================= */

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['inspeccionId', 'cedula', 'nombre', 'cargo', 'fechaInspeccion',
                     'inspector', 'malos', 'dataJson', 'updatedAt']);
    sheet.setFrozenRows(1);
    SpreadsheetApp.flush();
  }
  return sheet;
}

/** Devuelve los números de fila donde `columna` vale exactamente `valor`.
 *  Usa TextFinder, que resuelve la búsqueda del lado de Google y devuelve solo
 *  las coincidencias — en vez de traerse la columna entera al script, que se
 *  vuelve más lento a medida que la hoja crece. */
function filasPorValor_(sheet, columna, valor) {
  const last = sheet.getLastRow();
  if (last < 2 || !valor) return [];
  const encontrados = sheet.getRange(2, columna, last - 1, 1)
    .createTextFinder(String(valor))
    .matchEntireCell(true)
    .matchCase(true)
    .findAll();
  return encontrados.map(r => r.getRow());
}

function getFirmasSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(FIRMAS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(FIRMAS_SHEET_NAME);
    sheet.appendRow(['inspeccionId', 'sigKey', 'dataUrl', 'updatedAt']);
    sheet.setFrozenRows(1);
    SpreadsheetApp.flush();
  }
  return sheet;
}

function getEventosSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(EVENTOS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(EVENTOS_SHEET_NAME);
    sheet.appendRow(['ts', 'inspeccionId', 'accion', 'resultado', 'detalle', 'opId', 'nombre', 'inspector', 'dataJson']);
    sheet.setFrozenRows(1);
    SpreadsheetApp.flush();
  }
  return sheet;
}

/**
 * Bitácora. Se llama SIEMPRE, tanto si la operación se aplicó como si se
 * rechazó — un intento rechazado es justo lo que uno querría poder demostrar
 * después en una auditoría.
 * accion:    'INSPECCION' | 'CORREO'
 * resultado: 'APLICADO' | 'RECHAZADO' | 'DUPLICADO'
 */
function registrarEvento_(inspeccionId, accion, resultado, detalle, opId, nombre, inspector, dataJson) {
  try {
    getEventosSheet_().appendRow([
      new Date(), inspeccionId || '', accion, resultado, detalle || '',
      opId || '', nombre || '', inspector || '', dataJson || ''
    ]);
  } catch (e) {
    // La bitácora nunca debe tumbar la operación principal.
  }
}

/** ¿Este opId ya se aplicó antes? Reconoce un reenvío (mismo envío repetido por
 *  un reintento de red) para no volver a aplicarlo ni reenviar el correo. */
function opIdYaAplicado_(opId) {
  if (!opId) return false;
  const sheet = getEventosSheet_();
  const rows = filasPorValor_(sheet, 6, opId); // col F = opId
  for (let i = 0; i < rows.length; i++) {
    if (sheet.getRange(rows[i], 4).getValue() === 'APLICADO') return true; // col D = resultado
  }
  return false;
}

/* ================= FIRMAS ================= */

function sigKeyFromDataUrl_(dataUrl) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, dataUrl);
  return digest.map(b => ((b < 0 ? b + 256 : b).toString(16)).padStart(2, '0')).join('').substring(0, 12);
}

// Saca del objeto cualquier campo de firma (imagen base64) y lo reemplaza por
// una referencia corta "SIGREF:xxxx", para que el JSON principal quede liviano.
function extraerFirmas_(obj, mapaFirmas) {
  if (Array.isArray(obj)) return obj.map(item => extraerFirmas_(item, mapaFirmas));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const key in obj) {
      const val = obj[key];
      if (typeof val === 'string' && val.indexOf('data:image') === 0 &&
          key.toLowerCase().indexOf('sig') !== -1) {
        const sigKey = sigKeyFromDataUrl_(val);
        mapaFirmas.push({ sigKey: sigKey, dataUrl: val });
        out[key] = 'SIGREF:' + sigKey;
      } else {
        out[key] = extraerFirmas_(val, mapaFirmas);
      }
    }
    return out;
  }
  return obj;
}

// Máximo de caracteres que Google Sheets admite en UNA celda. Si una firma
// supera esto, la escritura falla y la firma se pierde en silencio. Se deja
// margen bajo el tope real de 50.000.
const MAX_CHARS_CELDA = 45000;

// Parte una firma larga en trozos que sí quepan en una celda. Cada trozo va en
// su propia fila con la clave marcada como "abc123~2/5". Una firma que cabe
// entera se guarda con su clave a secas.
function trocearFirma_(sigKey, dataUrl) {
  if (dataUrl.length <= MAX_CHARS_CELDA) return [{ key: sigKey, texto: dataUrl }];
  const total = Math.ceil(dataUrl.length / MAX_CHARS_CELDA);
  const trozos = [];
  for (let i = 0; i < total; i++) {
    trozos.push({
      key: sigKey + '~' + (i + 1) + '/' + total,
      texto: dataUrl.substr(i * MAX_CHARS_CELDA, MAX_CHARS_CELDA)
    });
  }
  return trozos;
}

function claveBaseFirma_(key) {
  const pos = String(key).indexOf('~');
  return pos === -1 ? String(key) : String(key).substring(0, pos);
}

function guardarFirmas_(inspeccionId, mapaFirmas) {
  if (!mapaFirmas.length) return;
  const sheet = getFirmasSheet_();
  const last = sheet.getLastRow();
  const existentes = {};
  const filasDelId = filasPorValor_(sheet, 1, inspeccionId);
  if (filasDelId.length) {
    const minR = Math.min.apply(null, filasDelId);
    const maxR = Math.max.apply(null, filasDelId);
    const claves = sheet.getRange(minR, 2, maxR - minR + 1, 1).getValues();
    filasDelId.forEach(r => {
      existentes[inspeccionId + '|' + claveBaseFirma_(claves[r - minR][0])] = true;
    });
  }
  const ahora = new Date();
  const filas = [];
  mapaFirmas.forEach(f => {
    if (existentes[inspeccionId + '|' + f.sigKey]) return;
    trocearFirma_(f.sigKey, f.dataUrl).forEach(t => {
      filas.push([inspeccionId, t.key, t.texto, ahora]);
    });
  });
  if (filas.length) sheet.getRange(last + 1, 1, filas.length, 4).setValues(filas);
}

function cargarFirmasPorId_(inspeccionId) {
  const sheet = getFirmasSheet_();
  const mapa = {};
  const rows = filasPorValor_(sheet, 1, inspeccionId);
  if (!rows.length) return mapa;
  rows.sort((a, b) => a - b);
  const minK = rows[0], maxK = rows[rows.length - 1];
  const clavesRango = sheet.getRange(minK, 2, maxK - minK + 1, 1).getValues();
  const filas = rows.map(r => ({ row: r, key: clavesRango[r - minK][0] }));
  const minRow = filas[0].row, maxRow = filas[filas.length - 1].row;
  const urls = sheet.getRange(minRow, 3, maxRow - minRow + 1, 1).getValues();
  // Reensambla las firmas guardadas en varios trozos y deja tal cual las que
  // caben en una sola celda.
  const partes = {};
  filas.forEach(f => {
    const texto = urls[f.row - minRow][0];
    const key = String(f.key);
    const pos = key.indexOf('~');
    if (pos === -1) { mapa[key] = texto; return; }
    const base = key.substring(0, pos);
    const n = parseInt(key.substring(pos + 1).split('/')[0], 10) || 1;
    if (!partes[base]) partes[base] = [];
    partes[base].push({ n: n, texto: texto });
  });
  for (const base in partes) {
    partes[base].sort((a, b) => a.n - b.n);
    mapa[base] = partes[base].map(p => p.texto).join('');
  }
  return mapa;
}

// Hace el proceso inverso al leer: reemplaza cada "SIGREF:xxxx" por la imagen.
function rehidratarFirmas_(obj, mapa) {
  if (Array.isArray(obj)) return obj.map(item => rehidratarFirmas_(item, mapa));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const key in obj) {
      const val = obj[key];
      if (typeof val === 'string' && val.indexOf('SIGREF:') === 0) {
        out[key] = mapa[val.substring(7)] || '';
      } else {
        out[key] = rehidratarFirmas_(val, mapa);
      }
    }
    return out;
  }
  return obj;
}

/* ================= CORREO DE REPOSICIÓN ================= */

/**
 * Arma y envía la solicitud de reposición con los elementos calificados como
 * MALO. Devuelve un texto con lo ocurrido, que queda en la bitácora.
 * Nunca lanza: si el correo falla, la inspección YA quedó guardada y no debe
 * perderse por eso — el fallo queda registrado en "Eventos".
 */
function enviarSolicitudReposicion_(datos, inspeccionId) {
  const malos = datos.malos || [];
  if (!malos.length) return 'Sin elementos en MALO; no se envía correo.';

  const destinatarios = CORREOS_REPOSICION.filter(c => c && c.indexOf('@') !== -1);
  if (COPIAR_AL_INSPECTOR && datos.inspectorCorreo && datos.inspectorCorreo.indexOf('@') !== -1) {
    destinatarios.push(datos.inspectorCorreo);
  }
  if (!destinatarios.length) {
    return 'No hay destinatarios configurados (revisar CORREOS_REPOSICION en el script).';
  }

  const fecha = datos.fechaInspeccion || Utilities.formatDate(new Date(), 'America/Bogota', 'dd/MM/yyyy');
  const asunto = 'Solicitud de reposición de EPP — ' + (datos.nombre || 's/n');

  let cuerpo = '';
  cuerpo += 'SOLICITUD DE REPOSICIÓN DE ELEMENTOS DE PROTECCIÓN PERSONAL\n';
  cuerpo += 'Formato SSTA-F-006 · Inspección de EPP\n';
  cuerpo += '------------------------------------------------------------\n\n';
  cuerpo += 'Trabajador:  ' + (datos.nombre || '') + '\n';
  cuerpo += 'Cédula:      ' + (datos.cedula || '') + '\n';
  cuerpo += 'Cargo:       ' + (datos.cargo || '') + '\n';
  cuerpo += 'Inspección:  ' + fecha + '\n';
  cuerpo += 'Inspector:   ' + (datos.inspector || '') + '\n';
  cuerpo += 'Registro:    ' + inspeccionId + '\n\n';
  cuerpo += 'ELEMENTOS EN MAL ESTADO QUE REQUIEREN REPOSICIÓN (' + malos.length + '):\n\n';
  malos.forEach((m, i) => { cuerpo += '  ' + (i + 1) + '. ' + m + '\n'; });

  // Los elementos en REGULAR no se piden, pero se informan: sirven para
  // anticipar la próxima reposición sin que se conviertan en una urgencia.
  const regulares = datos.regulares || [];
  if (regulares.length) {
    cuerpo += '\nEn estado REGULAR (no se solicitan aún, pero conviene vigilarlos):\n\n';
    regulares.forEach((r, i) => { cuerpo += '  ' + (i + 1) + '. ' + r + '\n'; });
  }

  if (datos.observaciones) {
    cuerpo += '\nObservaciones del inspector:\n' + datos.observaciones + '\n';
  }

  cuerpo += '\n------------------------------------------------------------\n';
  cuerpo += 'PARA APROBAR EL CAMBIO\n';
  cuerpo += 'Enviar la FOTO de cada elemento en mal estado por WhatsApp a\n';
  cuerpo += WHATSAPP_RESPONSABLE + ' — ' + WHATSAPP_APROBACION + '\n';
  cuerpo += 'indicando el nombre del trabajador y el registro ' + inspeccionId + '.\n';
  cuerpo += 'Sin la foto no se puede aprobar la reposición.\n';
  cuerpo += '------------------------------------------------------------\n';
  cuerpo += 'Mensaje generado automáticamente por el Portal SSTA al registrar\n';
  cuerpo += 'la inspección. No responder a este correo.\n';

  try {
    MailApp.sendEmail(destinatarios.join(','), asunto, cuerpo);
    return 'Correo enviado a: ' + destinatarios.join(', ') + ' (' + malos.length + ' elemento(s) en MALO)';
  } catch (e) {
    return 'ERROR al enviar el correo: ' + e.message;
  }
}

/* ================= ESCRITURA ================= */

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (!checkToken_(body.token)) {
    registrarEvento_('', 'INSPECCION', 'RECHAZADO', 'Token inválido', '', '', '', '');
    return jsonOut_({ ok: false, error: 'Token inválido.' });
  }

  // Envío manual del resumen del día, disparado por el botón del portal. Va
  // antes del lock porque no escribe en la hoja de inspecciones: solo lee y
  // manda el correo, así que no necesita bloquear a nadie.
  if (body.action === 'resumenDiario') {
    const resultado = enviarResumenDiario(body.fecha || '');
    const seEnvio = resultado.indexOf('Resumen enviado') === 0;
    return jsonOut_({ ok: seEnvio, mensaje: resultado });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    // Reenvío del mismo guardado (la respuesta se perdió y el cliente reintentó):
    // se confirma sin volver a escribir NI volver a mandar el correo.
    if (body.opId && opIdYaAplicado_(body.opId)) {
      registrarEvento_(body.inspeccionId || '', 'INSPECCION', 'DUPLICADO',
                       'opId ya aplicado; no se repite', body.opId,
                       body.nombre || '', body.inspector || '', '');
      return jsonOut_({ ok: true, inspeccionId: body.inspeccionId, duplicado: true });
    }

    const inspeccionId = body.inspeccionId || genInspeccionId_();
    const ahora = new Date();

    // Recalcular los MALOS/REGULARES en el servidor, no confiar en lo que
    // mande el cliente: el correo de reposición es el efecto real de este
    // formato, y debe corresponder exactamente a lo que quedó guardado.
    const items = body.items || {};
    const malos = [], regulares = [];
    ELEMENTOS_EPP.forEach(el => {
      if (items[el] === 'M') malos.push(el);
      else if (items[el] === 'R') regulares.push(el);
    });

    const mapaFirmas = [];
    const limpio = extraerFirmas_({
      items: items,
      observaciones: body.observaciones || '',
      sigTrabajador: body.sigTrabajador || '',
      sigInspector: body.sigInspector || '',
      malos: malos,
      regulares: regulares,
      formVersion: body.formVersion || 'SSTA-F-006-v6'
    }, mapaFirmas);

    const sheet = getSheet_();
    const filasExistentes = filasPorValor_(sheet, 1, inspeccionId);
    const fila = [
      inspeccionId,
      body.cedula || '',
      body.nombre || '',
      body.cargo || '',
      body.fechaInspeccion || Utilities.formatDate(ahora, 'America/Bogota', 'dd/MM/yyyy'),
      body.inspector || '',
      malos.join(' | '),
      JSON.stringify(limpio),
      ahora
    ];
    if (filasExistentes.length) {
      sheet.getRange(filasExistentes[0], 1, 1, fila.length).setValues([fila]);
    } else {
      sheet.appendRow(fila);
    }
    guardarFirmas_(inspeccionId, mapaFirmas);

    registrarEvento_(inspeccionId, 'INSPECCION', 'APLICADO',
                     malos.length + ' elemento(s) en MALO, ' + regulares.length + ' en REGULAR',
                     body.opId, body.nombre || '', body.inspector || '', JSON.stringify(limpio));

    // El correo va DESPUÉS de guardar y registrar: si el envío falla, la
    // inspección ya está a salvo y el fallo queda anotado en la bitácora.
    const resultadoCorreo = enviarSolicitudReposicion_({
      nombre: body.nombre, cedula: body.cedula, cargo: body.cargo,
      inspector: body.inspector, inspectorCorreo: body.inspectorCorreo,
      fechaInspeccion: body.fechaInspeccion,
      observaciones: body.observaciones,
      malos: malos, regulares: regulares
    }, inspeccionId);
    registrarEvento_(inspeccionId, 'CORREO', malos.length ? 'APLICADO' : 'DUPLICADO',
                     resultadoCorreo, '', body.nombre || '', body.inspector || '', '');

    return jsonOut_({
      ok: true,
      inspeccionId: inspeccionId,
      malos: malos,
      regulares: regulares,
      correo: resultadoCorreo
    });
  } catch (err) {
    registrarEvento_(body.inspeccionId || '', 'INSPECCION', 'RECHAZADO', 'Error: ' + err.message,
                     body.opId, body.nombre || '', body.inspector || '', '');
    return jsonOut_({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

function genInspeccionId_() {
  const d = new Date();
  return 'EPP-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0')
    + '-' + String(Math.floor(Math.random() * 900000) + 100000);
}

/* ================= LECTURA ================= */

function doGet(e) {
  if (!checkToken_(e.parameter.token)) return jsonOut_({ ok: false, error: 'Token inválido.' });

  // Catálogo de elementos: el frontend lo pide para no tener la lista duplicada
  // en dos sitios que se puedan desincronizar.
  if (e.parameter.action === 'elementos') {
    return jsonOut_({ ok: true, elementos: ELEMENTOS_EPP });
  }

  // Detalle de una inspección puntual, con las firmas rehidratadas.
  if (e.parameter.id) {
    const sheet = getSheet_();
    const rows = filasPorValor_(sheet, 1, e.parameter.id);
    if (!rows.length) return jsonOut_({ ok: false, error: 'No encontrada.' });
    const f = sheet.getRange(rows[0], 1, 1, 9).getValues()[0];
    let datos = {};
    try { datos = JSON.parse(f[7] || '{}'); } catch (err) { datos = {}; }
    datos = rehidratarFirmas_(datos, cargarFirmasPorId_(e.parameter.id));
    return jsonOut_({
      ok: true, inspeccionId: f[0], cedula: f[1], nombre: f[2], cargo: f[3],
      fechaInspeccion: f[4], inspector: f[5], malos: f[6], datos: datos, updatedAt: f[8]
    });
  }

  // Historial de una persona (para ver qué se le ha entregado/pedido antes).
  // Con &full=1 devuelve además el detalle de cada inspección (calificación de
  // los 17 elementos, observaciones y firmas), que es lo que necesita la ficha
  // imprimible del trabajador. Sin ese parámetro devuelve solo el resumen,
  // que es lo que consulta el formulario mientras se diligencia.
  if (e.parameter.cedula) {
    const sheet = getSheet_();
    const rows = filasPorValor_(sheet, 2, e.parameter.cedula);
    const completo = e.parameter.full === '1';
    const out = [];
    rows.forEach(r => {
      const f = sheet.getRange(r, 1, 1, 9).getValues()[0];
      const reg = { inspeccionId: f[0], cedula: f[1], nombre: f[2], cargo: f[3],
                    fechaInspeccion: f[4], inspector: f[5], malos: f[6], updatedAt: f[8] };
      if (completo) {
        let datos = {};
        try { datos = JSON.parse(f[7] || '{}'); } catch (err) { datos = {}; }
        reg.datos = rehidratarFirmas_(datos, cargarFirmasPorId_(f[0]));
      }
      out.push(reg);
    });
    out.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    // Se acota el detalle completo: una ficha con cientos de inspecciones sería
    // impagable de descargar en obra y nadie la imprimiría entera igual.
    return jsonOut_({ ok: true, rows: completo ? out.slice(0, 40) : out });
  }

  // Listado general (últimas inspecciones), sin el dataJson para que sea liviano.
  if (e.parameter.list) {
    const sheet = getSheet_();
    const last = sheet.getLastRow();
    const rows = [];
    if (last >= 2) {
      const a = sheet.getRange(2, 1, last - 1, 7).getValues();
      const u = sheet.getRange(2, 9, last - 1, 1).getValues();
      for (let i = 0; i < a.length; i++) {
        if (!a[i][0]) continue;
        rows.push({ inspeccionId: a[i][0], cedula: a[i][1], nombre: a[i][2], cargo: a[i][3],
                    fechaInspeccion: a[i][4], inspector: a[i][5], malos: a[i][6], updatedAt: u[i][0] });
      }
    }
    rows.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return jsonOut_({ ok: true, rows: rows.slice(0, 300) });
  }

  return jsonOut_({ ok: false, error: 'Acción no reconocida.' });
}

/* ================= RESUMEN DIARIO ==================================
   Los correos que salen al guardar cada inspección son individuales: si en un
   día se revisan quince trabajadores, llegan quince correos y toca sumarlos a
   mano para saber cuántos guantes o cuántas gafas hay que comprar.

   Esta parte manda UN solo correo al final del día con el consolidado: cuántas
   unidades de cada elemento se pidieron y de qué trabajador salió cada una.
   No reemplaza los correos individuales — esos siguen saliendo igual, porque
   son el registro formal de cada inspección.

   Se envía desde el botón "Enviar resumen del día" que está en el portal, en
   la pantalla de historial. Así sale cuando el inspector ya terminó la jornada
   y no a una hora fija que puede caer a mitad de las revisiones.

   OPCIONAL — envío automático: si además se quiere que salga solo a una hora
   fija, en el editor de Apps Script seleccionar la función
   instalarResumenDiario_ en el menú de arriba y darle a Ejecutar (una sola
   vez). Para desactivarlo, borrar el disparador desde el ícono del reloj
   (Activadores). El botón sigue funcionando con o sin esto.
   ================================================================== */

// Hora a la que sale el resumen (formato 24h, hora de Colombia). El disparador
// de Apps Script dispara dentro de la hora indicada, no al minuto exacto.
const HORA_RESUMEN_DIARIO = 17;

// A quién le llega el consolidado. Por defecto los mismos de las solicitudes.
const CORREOS_RESUMEN_DIARIO = CORREOS_REPOSICION;

/* Crea el disparador diario. Ejecutar UNA vez desde el editor. Si ya existía,
   lo borra primero para no terminar con dos resúmenes cada tarde. */
function instalarResumenDiario_() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'enviarResumenDiario') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarResumenDiario')
    .timeBased().atHour(HORA_RESUMEN_DIARIO).everyDays(1)
    .inTimezone('America/Bogota').create();
  return 'Resumen diario programado para las ' + HORA_RESUMEN_DIARIO + ':00.';
}

/* La llama el disparador. También se puede ejecutar a mano para probar.
   Sin argumento usa el día de hoy; se le puede pasar 'dd/MM/yyyy' para
   reenviar el resumen de un día anterior. */
function enviarResumenDiario(fechaTexto) {
  const hoy = fechaTexto || Utilities.formatDate(new Date(), 'America/Bogota', 'dd/MM/yyyy');
  const sheet = getSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return 'Hoja vacía.';

  // Columnas: A id, B cédula, C nombre, D cargo, E fecha, F inspector, G malos
  const datos = sheet.getRange(2, 1, last - 1, 7).getValues();

  const conteo = {};          // elemento -> cantidad
  const quienes = {};         // elemento -> [nombres]
  const trabajadores = [];    // detalle por persona
  let totalInspecciones = 0;

  datos.forEach(f => {
    if (!f[0]) return;
    const fecha = f[4] instanceof Date
      ? Utilities.formatDate(f[4], 'America/Bogota', 'dd/MM/yyyy')
      : String(f[4] || '').trim();
    if (fecha !== hoy) return;
    totalInspecciones++;

    const malos = String(f[6] || '').split('|').map(s => s.trim()).filter(Boolean);
    if (!malos.length) return;

    trabajadores.push({ nombre: f[2], cedula: f[1], cargo: f[3], id: f[0], malos: malos });
    malos.forEach(m => {
      conteo[m] = (conteo[m] || 0) + 1;
      if (!quienes[m]) quienes[m] = [];
      quienes[m].push(f[2] || 'Sin nombre');
    });
  });

  if (!totalInspecciones) return 'No hubo inspecciones el ' + hoy + '; no se envía resumen.';
  if (!trabajadores.length) {
    return 'Hubo ' + totalInspecciones + ' inspección(es) el ' + hoy +
           ' pero ninguna con elementos en mal estado; no se envía resumen.';
  }

  // Se ordena de mayor a menor cantidad: lo que más se pidió va primero, que es
  // lo que interesa mirar cuando esto llega a compras.
  const elementos = Object.keys(conteo).sort((a, b) => conteo[b] - conteo[a] || a.localeCompare(b));
  const totalUnidades = elementos.reduce((s, el) => s + conteo[el], 0);

  let cuerpo = '';
  cuerpo += 'RESUMEN DIARIO DE REPOSICIÓN DE EPP — ' + hoy + '\n';
  cuerpo += '============================================================\n\n';
  cuerpo += 'Inspecciones del día:        ' + totalInspecciones + '\n';
  cuerpo += 'Con elementos en mal estado: ' + trabajadores.length + '\n';
  cuerpo += 'Unidades a reponer:          ' + totalUnidades + '\n\n';

  cuerpo += 'TOTAL POR ELEMENTO\n';
  cuerpo += '------------------------------------------------------------\n';
  elementos.forEach(el => {
    cuerpo += '  ' + conteo[el] + ' x ' + el + '\n';
    cuerpo += '      (' + quienes[el].join(', ') + ')\n';
  });

  cuerpo += '\nDETALLE POR TRABAJADOR\n';
  cuerpo += '------------------------------------------------------------\n';
  trabajadores.forEach(t => {
    cuerpo += '\n' + (t.nombre || 'Sin nombre');
    if (t.cedula) cuerpo += ' — CC ' + t.cedula;
    if (t.cargo) cuerpo += ' — ' + t.cargo;
    cuerpo += '\n  Registro: ' + t.id + '\n';
    t.malos.forEach(m => { cuerpo += '  - ' + m + '\n'; });
  });

  cuerpo += '\n------------------------------------------------------------\n';
  cuerpo += 'RECORDATORIO\n';
  cuerpo += 'Solo se aprueba la reposición de los elementos cuya FOTO haya\n';
  cuerpo += 'llegado por WhatsApp a ' + WHATSAPP_RESPONSABLE + ' — ' + WHATSAPP_APROBACION + '.\n';
  cuerpo += 'Verificar contra este listado antes de tramitar la compra.\n';
  cuerpo += '------------------------------------------------------------\n';
  cuerpo += 'Mensaje generado automáticamente por el Portal SSTA.\n';
  cuerpo += 'No responder a este correo.\n';

  const destinatarios = (CORREOS_RESUMEN_DIARIO || []).filter(c => c && c.indexOf('@') !== -1);
  if (!destinatarios.length) return 'No hay destinatarios configurados para el resumen diario.';

  // El correo se manda en HTML (tablas) porque quien lo recibe lo usa para
  // tramitar la compra: en tabla se lee de una y se puede copiar y pegar a una
  // hoja de cálculo. El texto plano de arriba viaja igual como alternativa,
  // para los correos que no muestran HTML.
  const html = armarHtmlResumenDiario_(hoy, totalInspecciones, trabajadores,
                                       totalUnidades, elementos, conteo, quienes);

  const asunto = 'Resumen EPP ' + hoy + ' — ' + totalUnidades + ' elemento(s) por reponer';
  try {
    MailApp.sendEmail({
      to: destinatarios.join(','),
      subject: asunto,
      body: cuerpo,
      htmlBody: html
    });
    registrarEvento_('', 'RESUMEN_DIARIO', 'APLICADO',
                     'Enviado a ' + destinatarios.join(', ') + ' (' + totalUnidades + ' unidades)',
                     '', '', '', '');
    return 'Resumen enviado a: ' + destinatarios.join(', ');
  } catch (e) {
    registrarEvento_('', 'RESUMEN_DIARIO', 'ERROR', e.message, '', '', '', '');
    return 'ERROR al enviar el resumen: ' + e.message;
  }
}


/* Arma el resumen diario en HTML. Se usan tablas y estilos en línea a propósito:
   es lo único que Gmail y Outlook muestran igual, y este correo se abre tanto
   en el computador de la oficina como en el celular en obra. */
function armarHtmlResumenDiario_(hoy, totalInspecciones, trabajadores,
                                 totalUnidades, elementos, conteo, quienes) {
  const TINTA = '#23282d', SUAVE = '#6b7379', LINEA = '#d9dde0';
  const esc = t => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let h = '';
  h += '<div style="font-family:Arial,Helvetica,sans-serif;color:' + TINTA + ';max-width:640px;">';

  // Encabezado
  h += '<div style="border-bottom:3px solid ' + TINTA + ';padding-bottom:10px;margin-bottom:16px;">'
     + '<div style="font-size:18px;font-weight:bold;">Resumen diario de reposición de EPP</div>'
     + '<div style="font-size:13px;color:' + SUAVE + ';margin-top:3px;">'
     + esc(hoy) + ' · Formato SSTA-F-006</div></div>';

  // Cifras del día, en recuadros
  h += '<table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;"><tr>';
  [['Inspecciones', totalInspecciones],
   ['Con elementos malos', trabajadores.length],
   ['Unidades a reponer', totalUnidades]].forEach((c, i) => {
    h += '<td style="width:33%;padding:' + (i === 1 ? '0 6px' : '0') + ';">'
       + '<div style="border:1px solid ' + LINEA + ';border-radius:6px;padding:11px;text-align:center;">'
       + '<div style="font-size:22px;font-weight:bold;">' + c[1] + '</div>'
       + '<div style="font-size:11px;color:' + SUAVE + ';text-transform:uppercase;letter-spacing:.4px;">'
       + esc(c[0]) + '</div></div></td>';
  });
  h += '</tr></table>';

  // Total por elemento
  h += '<div style="font-size:14px;font-weight:bold;margin-bottom:7px;">Total por elemento</div>';
  h += '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;'
     + 'font-size:13px;margin-bottom:22px;">';
  h += '<tr style="background:#f2f3f4;">'
     + '<th align="center" style="padding:8px;border:1px solid ' + LINEA + ';width:52px;">Cant.</th>'
     + '<th align="left" style="padding:8px;border:1px solid ' + LINEA + ';">Elemento</th>'
     + '<th align="left" style="padding:8px;border:1px solid ' + LINEA + ';">Trabajadores</th></tr>';
  elementos.forEach((el, i) => {
    h += '<tr' + (i % 2 ? ' style="background:#fafbfb;"' : '') + '>'
       + '<td align="center" style="padding:8px;border:1px solid ' + LINEA + ';font-weight:bold;">'
       + conteo[el] + '</td>'
       + '<td style="padding:8px;border:1px solid ' + LINEA + ';">' + esc(el) + '</td>'
       + '<td style="padding:8px;border:1px solid ' + LINEA + ';color:' + SUAVE + ';font-size:12px;">'
       + esc(quienes[el].join(', ')) + '</td></tr>';
  });
  h += '</table>';

  // Detalle por trabajador
  h += '<div style="font-size:14px;font-weight:bold;margin-bottom:7px;">Detalle por trabajador</div>';
  h += '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;'
     + 'font-size:13px;margin-bottom:22px;">';
  h += '<tr style="background:#f2f3f4;">'
     + '<th align="left" style="padding:8px;border:1px solid ' + LINEA + ';">Trabajador</th>'
     + '<th align="left" style="padding:8px;border:1px solid ' + LINEA + ';">Registro</th>'
     + '<th align="left" style="padding:8px;border:1px solid ' + LINEA + ';">Elementos en mal estado</th></tr>';
  trabajadores.forEach((t, i) => {
    let quien = '<b>' + esc(t.nombre || 'Sin nombre') + '</b>';
    const extra = [t.cedula ? 'CC ' + esc(t.cedula) : '', esc(t.cargo || '')].filter(Boolean).join(' · ');
    if (extra) quien += '<br><span style="color:' + SUAVE + ';font-size:11.5px;">' + extra + '</span>';
    h += '<tr' + (i % 2 ? ' style="background:#fafbfb;"' : '') + '>'
       + '<td valign="top" style="padding:8px;border:1px solid ' + LINEA + ';">' + quien + '</td>'
       + '<td valign="top" style="padding:8px;border:1px solid ' + LINEA + ';font-family:monospace;font-size:11.5px;">'
       + esc(t.id) + '</td>'
       + '<td valign="top" style="padding:8px;border:1px solid ' + LINEA + ';">'
       + '<ul style="margin:0;padding-left:16px;">'
       + t.malos.map(m => '<li>' + esc(m) + '</li>').join('')
       + '</ul></td></tr>';
  });
  h += '</table>';

  // Recordatorio de la foto
  h += '<div style="border:1px solid #e08a80;background:#fdecea;color:#7a1f14;'
     + 'border-radius:6px;padding:12px;font-size:12.5px;line-height:1.55;">'
     + '<b>RECORDATORIO</b><br>'
     + 'Solo se aprueba la reposición de los elementos cuya <b>FOTO</b> haya llegado '
     + 'por WhatsApp a ' + esc(WHATSAPP_RESPONSABLE) + ' — ' + esc(WHATSAPP_APROBACION) + '.<br>'
     + 'Verificar contra este listado antes de tramitar la compra.</div>';

  h += '<div style="margin-top:16px;font-size:11px;color:' + SUAVE + ';line-height:1.5;">'
     + 'Mensaje generado automáticamente por el Portal SSTA. No responder a este correo.</div>';
  h += '</div>';
  return h;
}
