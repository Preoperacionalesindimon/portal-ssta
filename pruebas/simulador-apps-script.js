/* ============================================================
   simulador-apps-script.js — corre un backend .gs en Node, sin Google
   ------------------------------------------------------------
   Imita lo justo de SpreadsheetApp, LockService, ContentService, Utilities,
   MailApp y Session para ejecutar doPost/doGet de verdad y revisar qué
   queda escrito en cada hoja.

   Hace cumplir el límite REAL de Google Sheets: una celda con más de 50.000
   caracteres lanza el mismo error que en Google. Es el límite que hizo
   perder firmas en los permisos, así que aquí se prueba contra él.

   No reemplaza probar el despliegue real; atrapa antes de subir los errores
   de lógica (troceo, versiones, duplicados, auditoría).
   ============================================================ */
const vm = require('vm'), fs = require('fs'), crypto = require('crypto');
function crearEntorno(archivoGs, opciones) {
  opciones = opciones || {};
  const hojas = {};
  // Como Google Sheets: un texto "AAAA-MM-DD" escrito en una celda queda
  // guardado como FECHA y al leerlo vuelve un Date (medianoche local). Es
  // opcional para no cambiar las pruebas de los demás backends.
  const comoSheets = (v) => (opciones.fechasComoSheets && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? new Date(v + 'T00:00:00') : v;
  const correos = [];
  class Hoja {
    constructor(n) { this.nombre = n; this.filas = []; }
    _chk(v) { if (typeof v === 'string' && v.length > 50000) throw new Error('Your input contains more than the maximum of 50000 characters in a single cell.'); }
    appendRow(r) { r.forEach((v) => this._chk(v)); this.filas.push(r.map(comoSheets)); }
    getLastRow() { return this.filas.length; }
    getDataRange() { return this.getRange(1, 1, this.filas.length, Math.max(1, ...this.filas.map((f) => f.length))); }
    setFrozenRows() {}
    deleteRows(inicio, n) { this.filas.splice(inicio - 1, n); }
    getRange(fila, col, nf = 1, nc = 1) {
      const h = this;
      return {
        getValues() { const out = []; for (let i = 0; i < nf; i++) { const r = h.filas[fila - 1 + i] || []; const o = []; for (let j = 0; j < nc; j++) o.push(r[col - 1 + j] === undefined ? '' : r[col - 1 + j]); out.push(o); } return out; },
        getValue() { return this.getValues()[0][0]; },
        setValues(v) { v.forEach((r, i) => { r.forEach((x) => h._chk(x)); const idx = fila - 1 + i; while (h.filas.length <= idx) h.filas.push([]); r.forEach((x, j) => { h.filas[idx][col - 1 + j] = comoSheets(x); }); }); return this; },
        createTextFinder(t) { let entire = false; const f = { matchEntireCell(b) { entire = b; return f; }, matchCase() { return f; },
          findAll() { const out = []; for (let i = 0; i < nf; i++) { const r = h.filas[fila - 1 + i] || []; const v = String(r[col - 1] === undefined ? '' : r[col - 1]); if (entire ? v === t : v.includes(t)) out.push({ getRow: () => fila + i }); } return out; } }; return f; }
      };
    }
  }
  const ss = { getSheetByName: (n) => hojas[n] || null, insertSheet: (n) => (hojas[n] = new Hoja(n)), getSpreadsheetTimeZone: () => 'America/Bogota' };
  const ctx = {
    console: { log: (...a) => ctx._log.push(a.join(' ')) }, _log: [],
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType() { return this; }, _t: t, getContent() { return t; } }) },
    Utilities: {
      DigestAlgorithm: { MD5: 'md5' },
      computeDigest: (alg, s) => Array.from(crypto.createHash('md5').update(s, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      formatDate: (d, tz, f) => { const x = new Date(d); const p = (n) => String(n).padStart(2, '0'); return f.replace('yyyy', x.getFullYear()).replace('MM', p(x.getMonth() + 1)).replace('dd', p(x.getDate())).replace('HH', p(x.getHours())).replace('mm', p(x.getMinutes())).replace('ss', p(x.getSeconds())); }
    },
    MailApp: { sendEmail: (...a) => correos.push(a) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'carcrios@gmail.com' }) },
    Date, JSON, Math, String, Number, Array, Object, RegExp, parseInt, isNaN
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(archivoGs, 'utf8'), ctx);
  const post = (obj) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(obj) } })._t);
  const get = (params) => JSON.parse(ctx.doGet({ parameter: params })._t);
  return { ctx, hojas, correos, post, get };
}
module.exports = { crearEntorno };
