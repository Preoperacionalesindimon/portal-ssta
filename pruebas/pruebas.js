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

  ok('refreshSize() preserva la firma al redimensionar',
     /refreshSize:[\s\S]{0,200}?canvas\.toDataURL[\s\S]{0,120}?resize\(\)/.test(common),
     'Sin esto, refrescar el lienzo borra la firma dejando el estado en "Firmado ✓".');

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
grupo('Inspección de EPP', () => {
  const back = leer('backends/backend-epp.gs');
  const front = leer('inspeccion-epp.html');
  const lista = (txt, nombre) => {
    const m = new RegExp('const ' + nombre + ' = \\[([\\s\\S]*?)\\];').exec(txt);
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : null;
  };
  const b = lista(back, 'ELEMENTOS_EPP'), f = lista(front, 'ELEMENTOS');
  ok('el backend define los 17 elementos del formato SSTA-F-006', b && b.length === 17,
     b ? `tiene ${b.length}` : 'no se encontró la lista');
  ok('el navegador define los mismos 17', f && f.length === 17,
     f ? `tiene ${f.length}` : 'no se encontró la lista');
  ok('las dos listas coinciden EXACTAMENTE (mismo texto y orden)',
     b && f && JSON.stringify(b) === JSON.stringify(f),
     'Si se desincronizan, el correo pediría elementos distintos a los marcados.');

  ok('el servidor recalcula los MALO en vez de confiar en el navegador',
     /ELEMENTOS_EPP\.forEach\([\s\S]{0,200}?=== 'M'/.test(back),
     'El correo es el efecto real del formato: debe salir de lo que quedó guardado.');

  ok('sin elementos en MALO no se envía correo',
     back.includes("if (!malos.length) return 'Sin elementos en MALO"));

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
grupos.forEach(([nombre, fn]) => {
  console.log('\n▸ ' + nombre);
  try { fn(); } catch (e) { fallos++; console.log('    ✗ error ejecutando el grupo: ' + e.message); }
});
console.log('\n' + '─'.repeat(58));
if (fallos === 0) {
  console.log(`✅  ${total} comprobaciones, todas correctas. Se puede desplegar.`);
} else {
  console.log(`❌  ${fallos} de ${total} comprobaciones fallaron. Revisar antes de subir nada.`);
}
process.exit(fallos === 0 ? 0 : 1);
