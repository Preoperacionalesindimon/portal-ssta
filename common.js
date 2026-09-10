/* ============================================================
   common.js — Utilidades compartidas del Portal SSTA (INDIMON)
   Usado por: permiso-trabajo-alturas.html y permiso-trabajo-caliente.html
   ============================================================ */

/**
 * esc: escapa texto antes de insertarlo con innerHTML. Los datos que
 * vienen de la hoja de cálculo (nombres, sitios, responsables, cédulas)
 * los escribe cualquier persona con acceso al formulario — sin escapar,
 * un valor como <img src=x onerror=...> se ejecutaría en el navegador
 * de quien lo vea después (dashboard, listas de permisos abiertos, etc).
 */
function esc(v){
  return String(v==null?'':v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/**
 * fetchWithRetry: como fetch(), pero reintenta automáticamente si hay
 * un fallo de red (típico en zonas de planta con señal débil), con
 * espera creciente entre intentos.
 */
async function fetchWithRetry(url, options, retries = 2, backoffMs = 800) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, backoffMs * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

/**
 * DraftStore: guarda/recupera un borrador del formulario en localStorage
 * para que no se pierda el trabajo si se cierra la pestaña, se va la señal
 * o el celular bloquea la página a medio llenar.
 */
const DraftStore = {
  _avisoMostrado: false,
  save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({ data, savedAt: new Date().toISOString() }));
      return true;
    } catch (e) {
      // El guardado automático del borrador falló (cuota de almacenamiento
      // llena por firmas en base64, modo privado de Safari, etc.). Antes esto
      // se ignoraba en silencio: el usuario creía tener un respaldo local que
      // en realidad no existe. Se avisa una sola vez por sesión — no en cada
      // tecla, ya que save() se llama muy seguido mientras se escribe.
      if (!this._avisoMostrado) {
        this._avisoMostrado = true;
        console.error('DraftStore.save falló:', e);
        window.dispatchEvent(new CustomEvent('draft-guardado-fallido', { detail: { error: e } }));
      }
      return false;
    }
  },
  load(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  },
  clear(key) {
    try { localStorage.removeItem(key); } catch (e) { /* no-op */ }
  }
};

// Aviso visible si el borrador automático deja de poder guardarse — se activa
// solo (no necesita que cada página lo llame), ya que common.js está en todas.
window.addEventListener('draft-guardado-fallido', () => {
  if (document.getElementById('draftFailBanner')) return;
  const el = document.createElement('div');
  el.id = 'draftFailBanner';
  el.setAttribute('role', 'alert');
  el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;background:#b3261e;color:#fff;font-weight:600;font-size:13px;padding:10px 14px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:space-between;gap:10px;';
  el.innerHTML = '<span>⚠️ El respaldo automático de este formulario no se está guardando en este dispositivo (memoria llena o modo privado). Si cierras la página sin guardar, podrías perder lo escrito — guarda cuanto antes.</span>';
  const btn = document.createElement('button');
  btn.textContent = '✕';
  btn.style.cssText = 'background:none;border:none;color:#fff;font-size:16px;cursor:pointer;flex-shrink:0;';
  btn.addEventListener('click', () => el.remove());
  el.appendChild(btn);
  document.body.appendChild(el);
});

/** debounce: evita guardar en cada tecla; agrupa cambios rápidos en uno solo. */
function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** Formatea una fecha ISO a texto legible en español. */
function formatSavedAt(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
}

/**
 * OfflineBanner: muestra/oculta un aviso fijo cuando el navegador detecta
 * que no hay conexión, para que en zonas de planta con señal débil quede
 * claro que lo que se ve puede ser una copia guardada (caché) y no la
 * versión más reciente. No interfiere con el borrador local: ese sigue
 * guardando normalmente sin conexión.
 */
/**
 * UpdateManager: detecta cuando hay una versión nueva del portal ya
 * descargada (Service Worker "esperando") y muestra un banner para que
 * el usuario decida cuándo actualizar — nunca se recarga la página solo,
 * para no perder un permiso a medio llenar.
 * Requiere sw.js v2 (que no hace skipWaiting automático).
 */
const UpdateManager = {
  init() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // Ya hay un SW nuevo esperando desde antes de esta carga.
      if (reg.waiting) this._showBanner(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        if (!nuevo) return;
        nuevo.addEventListener('statechange', () => {
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
            this._showBanner(nuevo);
          }
        });
      });
    }).catch(() => {});

    // Cuando el SW nuevo toma control, recarga una sola vez.
    let recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recargando) return;
      recargando = true;
      location.reload();
    });

    // Mensaje del SW pidiendo reintentar la cola pendiente (background sync).
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data === 'TRY_FLUSH_OUTBOX') Outbox.flush();
    });
  },
  _showBanner(worker) {
    if (document.getElementById('updateBanner')) return;
    const el = document.createElement('div');
    el.id = 'updateBanner';
    el.setAttribute('role', 'status');
    el.innerHTML = `
      <span>🔄 Hay una versión nueva del portal disponible.</span>
      <button type="button" id="updateBannerBtn">Actualizar ahora</button>`;
    document.body.prepend(el);
    document.getElementById('updateBannerBtn').addEventListener('click', () => {
      worker.postMessage('SKIP_WAITING');
      el.remove();
    });
  }
};

/**
 * Outbox: cola de permisos que no se pudieron guardar por falta de señal.
 * Usa IndexedDB (no localStorage) porque el Service Worker también debe
 * poder leerla/escribirla en segundo plano vía Background Sync.
 * Uso desde los formularios (dentro del catch de fetchWithRetry):
 *   await Outbox.add(CONFIG.SCRIPT_URL, { action:'open', code, data, token });
 * Y al cargar la página: Outbox.flush();  // reintenta lo pendiente
 */
const Outbox = {
  _dbPromise: null,
  _flushing: false, // evita que dos disparos simultáneos (carga de página + evento 'online'
                     // + mensaje del Service Worker) reenvíen el mismo permiso dos veces
  _db() {
    if (this._dbPromise) return this._dbPromise;
    this._dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('ssta-outbox', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this._dbPromise;
  },
  /**
   * Encola un permiso pendiente. A diferencia de la versión anterior, la
   * promesa ahora SÍ rechaza si IndexedDB no pudo guardar el registro
   * (cuota llena por las firmas en base64, modo privado de Safari, etc.).
   * Antes la promesa quedaba colgada para siempre y el formulario le
   * mostraba al usuario "quedó guardado y se reintentará solo" sin que
   * realmente hubiera quedado nada guardado — quien llama debe hacer
   * await y avisar al usuario si esto rechaza.
   */
  async add(url, body) {
    const db = await this._db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending', 'readwrite');
      tx.objectStore('pending').add({ url, body, savedAt: new Date().toISOString(), intentos: 0 });
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Outbox: transacción abortada'));
      tx.oncomplete = async () => {
        // Registra el Background Sync si el navegador lo soporta; si no,
        // igual queda guardado y se reintentará la próxima vez que la
        // página cargue con señal (ver flush() en init de cada formulario).
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          try {
            const reg = await navigator.serviceWorker.ready;
            await reg.sync.register('sync-outbox');
          } catch (e) { /* sin soporte o permiso denegado; no es crítico */ }
        }
        Outbox._avisar();
        resolve();
      };
    });
  },
  async list() {
    const db = await this._db();
    return new Promise((resolve) => {
      const tx = db.transaction('pending', 'readonly');
      const req = tx.objectStore('pending').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve([]);
    });
  },
  async remove(id) {
    const db = await this._db();
    return new Promise((resolve) => {
      const tx = db.transaction('pending', 'readwrite');
      tx.objectStore('pending').delete(id);
      tx.oncomplete = () => resolve();
    });
  },
  async _incrementarIntentos(id) {
    const db = await this._db();
    return new Promise((resolve) => {
      const tx = db.transaction('pending', 'readwrite');
      const store = tx.objectStore('pending');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const item = getReq.result;
        if (item) { item.intentos = (item.intentos || 0) + 1; store.put(item); }
        resolve(item ? item.intentos : 0);
      };
      getReq.onerror = () => resolve(0);
    });
  },
  /** Reintenta enviar todo lo pendiente. Llamar al cargar la página y al volver la señal. */
  async flush() {
    if (!navigator.onLine) return;
    if (this._flushing) return;
    this._flushing = true;
    try {
      const items = await this.list();
      for (const item of items) {
        try {
          const res = await fetch(item.url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(item.body)
          });
          const json = await res.json();
          if (json.ok) {
            await this.remove(item.id);
            Outbox._avisarEnviado(item);
          } else {
            // El servidor respondió pero con error (token inválido, permiso ya
            // cerrado, etc.) — no es un problema de señal, así que reintentar
            // sin límite nunca lo resolvería solo. Tras 5 intentos fallidos se
            // saca de la cola y se avisa, en vez de reintentar para siempre.
            const intentos = await this._incrementarIntentos(item.id);
            if (intentos >= 5) {
              await this.remove(item.id);
              Outbox._avisarFallidoDefinitivo(item, json.error);
            }
          }
        } catch (e) {
          // No hubo respuesta. Puede ser que no haya señal… o que el envío SÍ
          // llegara y se perdiera la respuesta de vuelta: en ese caso el permiso
          // ya está guardado y este pendiente quedaría en cola para siempre,
          // mostrando un aviso que no corresponde. Se comprueba preguntándole al
          // servidor si ese código ya existe.
          const yaEsta = await Outbox._yaFueGuardado(item);
          if (yaEsta) {
            await this.remove(item.id);
            Outbox._avisarEnviado(item);
          }
          // Si no se pudo comprobar, se deja en cola y se reintenta luego.
        }
      }
    } finally {
      this._flushing = false;
      Outbox._avisar();
    }
  },
  async count() {
    return (await this.list()).length;
  },
  /** ¿El permiso de este pendiente ya está guardado en el servidor? Se usa para
   *  no dejar en cola algo que en realidad ya se envió. Devuelve false ante
   *  cualquier duda (sin señal, respuesta rara): más vale reintentar de más que
   *  descartar un permiso que no se guardó. */
  async _yaFueGuardado(item) {
    try {
      const code = item.body && (item.body.permitCode || item.body.code);
      const token = item.body && item.body.token;
      if (!code || !token) return false;
      const res = await fetch(item.url + '?code=' + encodeURIComponent(code) + '&token=' + encodeURIComponent(token));
      const json = await res.json();
      if (!json || !json.ok) return false;
      // Si el pendiente era un CIERRE, solo cuenta como guardado si allá ya
      // figura cerrado; si no, el cierre todavía tiene que salir.
      if (item.body.status === 'CERRADO') return json.status === 'CERRADO';
      return true;
    } catch (e) { return false; }
  },
  _avisar() {
    window.dispatchEvent(new CustomEvent('outbox-cambio'));
  },
  _avisarEnviado(item) {
    window.dispatchEvent(new CustomEvent('outbox-enviado', { detail: item }));
  },
  _avisarFallidoDefinitivo(item, error) {
    window.dispatchEvent(new CustomEvent('outbox-fallido', { detail: { item, error } }));
  }
};
window.addEventListener('online', () => Outbox.flush());

/**
 * OutboxBadge: indicador visible ("N permisos pendientes de enviar") para que
 * el usuario sepa en todo momento si algo quedó en cola sin salir — antes,
 * un permiso podía quedar guardándose en segundo plano sin ningún aviso.
 * Se actualiza solo con los eventos que dispara Outbox.
 */
const OutboxBadge = {
  init() {
    if (document.getElementById('outboxBadge')) return;
    const el = document.createElement('div');
    el.id = 'outboxBadge';
    el.style.cssText = 'display:none;position:fixed;left:12px;bottom:12px;z-index:9997;background:#c9a227;color:#151b24;font-weight:700;font-size:12.5px;padding:8px 14px;border-radius:20px;box-shadow:0 2px 10px rgba(0,0,0,.25);';
    document.body.appendChild(el);
    const actualizar = async () => {
      const n = await Outbox.count();
      if (n > 0) {
        el.textContent = '⏳ ' + n + (n===1 ? ' permiso pendiente de enviar' : ' permisos pendientes de enviar');
        el.style.display = 'block';
      } else {
        el.style.display = 'none';
      }
    };
    window.addEventListener('outbox-cambio', actualizar);
    window.addEventListener('outbox-enviado', () => {
      actualizar();
      const aviso = document.createElement('div');
      aviso.textContent = '✓ Un permiso pendiente se envió correctamente.';
      aviso.style.cssText = 'position:fixed;left:12px;bottom:52px;z-index:9998;background:#1d7a4c;color:#fff;font-weight:600;font-size:12.5px;padding:8px 14px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.25);';
      document.body.appendChild(aviso);
      setTimeout(()=> aviso.remove(), 5000);
    });
    window.addEventListener('outbox-fallido', (e) => {
      actualizar();
      alert('No se pudo enviar un permiso guardado en cola, incluso con señal (' + (e.detail.error || 'error del servidor') + '). Revisa ese permiso manualmente — puede que haya que volver a intentarlo desde el formulario.');
    });

    // El aviso ahora se puede TOCAR para ver qué hay en cola. Antes solo decía
    // "N pendientes" sin forma de saber cuáles ni de quitarlos: si alguno se
    // quedaba trabado, el aviso se volvía permanente y dejaba de significar algo.
    el.style.cursor = 'pointer';
    el.title = 'Toca para ver qué está pendiente';
    el.addEventListener('click', () => OutboxBadge.verPendientes());

    actualizar();
  },

  async verPendientes() {
    const items = await Outbox.list();
    if (!items.length) { alert('No hay nada pendiente de enviar.'); return; }

    const fondo = document.createElement('div');
    fondo.style.cssText = 'position:fixed;inset:0;background:rgba(15,25,35,.55);z-index:10002;display:flex;align-items:center;justify-content:center;padding:16px;';
    const caja = document.createElement('div');
    caja.style.cssText = 'background:#fff;border-radius:14px;max-width:460px;width:100%;max-height:80vh;overflow:auto;padding:18px;font-family:var(--font-family,sans-serif);';
    fondo.appendChild(caja);

    const pinta = (lista) => {
      caja.innerHTML =
        '<h3 style="margin:0 0 4px;font-size:16px;">Pendientes de enviar</h3>' +
        '<p style="margin:0 0 14px;font-size:12.5px;color:#5c6a76;line-height:1.5;">' +
        'Estos permisos se guardaron en el celular pero no se ha confirmado que llegaran al servidor. ' +
        'Si ya los ves en el dashboard, es que sí llegaron y la confirmación se perdió: usa «Comprobar» para limpiarlos.</p>' +
        lista.map((it,i)=>{
          const code = (it.body && (it.body.permitCode || it.body.code)) || 'sin código';
          const cierre = it.body && it.body.status === 'CERRADO';
          const f = new Date(it.savedAt);
          const cuando = isNaN(f.getTime()) ? '' : f.toLocaleDateString('es-CO') + ' ' + f.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
          return '<div style="border:1px solid #dde3e8;border-radius:9px;padding:11px;margin-bottom:9px;font-size:12.5px;line-height:1.5;">' +
            '<b>' + esc(code) + '</b>' + (cierre ? ' <span style="color:#c0392b;">(cierre)</span>' : ' (apertura)') +
            '<br><span style="color:#5c6a76;">Guardado: ' + esc(cuando) + (it.intentos ? ' · ' + it.intentos + ' intento(s)' : '') + '</span>' +
            '<div style="display:flex;gap:7px;margin-top:9px;">' +
            '<button data-comprobar="' + it.id + '" style="flex:1;padding:9px;border:1px solid #1f6f8b;background:#fff;color:#1f6f8b;border-radius:7px;font-weight:700;font-size:12px;cursor:pointer;">Comprobar</button>' +
            '<button data-descartar="' + it.id + '" style="padding:9px 12px;border:1px solid #e08a80;background:#fff;color:#c0392b;border-radius:7px;font-weight:700;font-size:12px;cursor:pointer;">Descartar</button>' +
            '</div></div>';
        }).join('') +
        '<div style="display:flex;gap:8px;margin-top:6px;">' +
        '<button id="obxTodos" style="flex:1;padding:12px;border:none;background:#151b24;color:#fff;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">Comprobar todos</button>' +
        '<button id="obxCerrar" style="padding:12px 16px;border:1px solid #dde3e8;background:#fff;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">Cerrar</button>' +
        '</div>';

      caja.querySelector('#obxCerrar').onclick = () => fondo.remove();

      const comprobar = async (item) => {
        const ya = await Outbox._yaFueGuardado(item);
        if (ya) { await Outbox.remove(item.id); return true; }
        return false;
      };

      caja.querySelectorAll('[data-comprobar]').forEach(b=>{
        b.onclick = async () => {
          b.disabled = true; b.textContent = 'Comprobando…';
          const item = lista.find(x=>String(x.id)===b.dataset.comprobar);
          const ya = await comprobar(item);
          if (ya) { alert('Ese permiso SÍ está guardado en el servidor. Se quita de la cola.'); }
          else { alert('Todavía no aparece en el servidor. Se deja en cola para reintentarlo.'); }
          Outbox._avisar();
          const quedan = await Outbox.list();
          quedan.length ? pinta(quedan) : fondo.remove();
        };
      });

      caja.querySelectorAll('[data-descartar]').forEach(b=>{
        b.onclick = async () => {
          if (!confirm('¿Descartar este pendiente? Si el permiso no llegó al servidor, se pierde y habrá que volver a diligenciarlo.')) return;
          await Outbox.remove(b.dataset.descartar);
          Outbox._avisar();
          const quedan = await Outbox.list();
          quedan.length ? pinta(quedan) : fondo.remove();
        };
      });

      const btnTodos = caja.querySelector('#obxTodos');
      btnTodos.onclick = async () => {
        btnTodos.disabled = true; btnTodos.textContent = 'Comprobando…';
        let limpiados = 0;
        for (const it of lista) { if (await comprobar(it)) limpiados++; }
        Outbox._avisar();
        const quedan = await Outbox.list();
        alert(limpiados
          ? limpiados + ' de ' + lista.length + ' ya estaban guardados en el servidor y se quitaron de la cola.'
          : 'Ninguno aparece todavía en el servidor. Se dejan en cola.');
        quedan.length ? pinta(quedan) : fondo.remove();
      };
    };

    pinta(items);
    fondo.addEventListener('click', (e)=>{ if (e.target === fondo) fondo.remove(); });
    document.body.appendChild(fondo);
  }
};

/**
 * SignaturePad: lienzo táctil de firma (dibujar, deshacer trazo, borrar,
 * cargar una firma ya guardada). Antes esta misma lógica (~80 líneas)
 * vivía copiada y pegada en permiso-core.js Y en personal-autorizado.html
 * por separado — un arreglo hecho en un lado (como el bug de firmas que
 * quedaban invisibles al restaurar varias de golpe) había que acordarse
 * de repetirlo a mano en el otro. Ahora vive en un solo lugar y ambos
 * consumidores comparten la misma implementación.
 *
 * Cada página que la usa crea SU PROPIO manager (no hay estado global
 * compartido entre, por ejemplo, un permiso y el anexo de personal):
 *
 *   const sigMgr = SignaturePad.createManager({
 *     statusIdFor: (canvasId) => 'status_' + canvasId  // opcional, este es el default
 *   });
 *   sigMgr.setup(canvasEl);
 *   sigMgr.pads['idDelCanvas'].setDataUrl(firmaGuardada);
 *   sigMgr.refreshIn(contenedor); // ver nota de refreshSize más abajo
 *
 * IMPORTANTE sobre restaurar firmas guardadas en lote (varias filas a la
 * vez, ej. varios ejecutantes de un permiso ya abierto): llama primero
 * refreshIn()/setup() para que el lienzo tenga su tamaño real, y solo
 * después dibuja la firma con setDataUrl — si el <canvas> todavía no está
 * visible (contenedor recién mostrado, sección aún colapsada) su tamaño
 * puede ser 0x0 en ese instante y la firma se "dibuja" en un lienzo sin
 * tamaño, quedando invisible aunque el dato sí se guardó bien.
 */
const SignaturePad = {
  createManager(opts) {
    opts = opts || {};
    const statusIdFor = opts.statusIdFor || ((id) => 'status_' + id);
    const signedLabel = opts.signedLabel || 'Firmado ✓';
    const unsignedLabel = opts.unsignedLabel || 'Sin firmar';
    const pads = {};

    function markSigned(id) {
      const el = document.getElementById(statusIdFor(id));
      if (el) { el.textContent = signedLabel; el.classList.add('done', 'signed'); }
    }
    function markUnsigned(id) {
      const el = document.getElementById(statusIdFor(id));
      if (el) { el.textContent = unsignedLabel; el.classList.remove('done', 'signed'); }
    }

    function setup(canvas) {
      if (canvas.dataset.sigInit) return; // este MISMO elemento ya tiene sus listeners
      canvas.dataset.sigInit = '1';
      // willReadFrequently: true — le dice al navegador desde el inicio que este
      // lienzo se va a LEER seguido (getImageData para el historial de "deshacer",
      // toDataURL al guardar), no solo dibujar. Sin esto, el navegador por defecto
      // asume que el canvas es para dibujar-y-mostrar nada más, y lo maneja con
      // memoria de video (GPU) — en dispositivos con poca memoria y varias firmas
      // abiertas a la vez en la misma pantalla (los 5-6 recuadros de un permiso),
      // esa memoria de video puede liberarse en segundo plano para los lienzos que
      // quedan fuera de pantalla mientras se sigue llenando el formulario, dejando
      // el dibujo en blanco silenciosamente aunque el estado siga diciendo
      // "Firmado ✓" (ese estado es solo texto, no depende del contenido del
      // lienzo). Con willReadFrequently, el navegador usa memoria normal (CPU) en
      // vez de memoria de video, evitando ese vaciado.
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      // Historial para "deshacer trazo".
      // ANTES se guardaba una FOTO completa del lienzo por cada trazo (hasta 15).
      // En una tablet de pantalla densa cada foto pesa ~7 MB sin comprimir, así
      // que un solo recuadro podía ocupar ~108 MB y un permiso con 9 firmas casi
      // 1 GB — suficiente para que el navegador matara y recargara la pestaña sin
      // avisar. Ahora se guardan los TRAZOS (las coordenadas por donde pasó el
      // dedo) y el lienzo se redibuja: unos pocos kilobytes, sin tope práctico,
      // y el deshacer queda exacto en vez de aproximado.
      let strokes = [];      // trazos dibujados en esta sesión, en píxeles CSS
      let baseImage = null;  // firma ya existente restaurada de fondo (si la hay)
      function redibujar() {
        const ratio = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (baseImage) {
          ctx.drawImage(baseImage, 0, 0, canvas.width / ratio, canvas.height / ratio);
        }
        strokes.forEach((s) => {
          if (!s.length) return;
          ctx.beginPath();
          ctx.moveTo(s[0][0], s[0][1]);
          if (s.length === 1) ctx.lineTo(s[0][0], s[0][1]); // toque suelto: punto
          else for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1]);
          ctx.stroke();
        });
      }
      function resize() {
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return; // aún oculto, se reintentará al mostrarse
        const ratio = window.devicePixelRatio || 1;
        canvas.width = rect.width * ratio;
        canvas.height = rect.height * ratio;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#1f2a33';
      }
      resize();
      let drawing = false, hasInk = false, lastX = 0, lastY = 0;
      function pos(e) {
        const r = canvas.getBoundingClientRect();
        const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
        const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
        return [cx, cy];
      }
      function start(e) {
        if (canvas.dataset.locked === '1') return;
        e.preventDefault();
        const [x, y] = pos(e);
        strokes.push([[x, y]]); // arranca un trazo nuevo
        drawing = true;
        [lastX, lastY] = [x, y];
      }
      function move(e) {
        if (!drawing || canvas.dataset.locked === '1') return;
        e.preventDefault();
        const [x, y] = pos(e);
        // Se dibuja el segmento de una vez (rápido) Y se guarda el punto, para
        // poder redibujar el trazo completo si luego se deshace otro.
        const actual = strokes[strokes.length - 1];
        if (actual) actual.push([x, y]);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
        [lastX, lastY] = [x, y];
        hasInk = true;
        markSigned(canvas.id);
      }
      function end() { drawing = false; }
      canvas.addEventListener('mousedown', start);
      canvas.addEventListener('mousemove', move);
      window.addEventListener('mouseup', end);
      canvas.addEventListener('touchstart', start, { passive: false });
      canvas.addEventListener('touchmove', move, { passive: false });
      canvas.addEventListener('touchend', end);

      /* Exporta la firma a una resolución acotada.
         POR QUÉ: el lienzo en pantalla se crea a (ancho CSS × devicePixelRatio).
         En una tablet grande de alta densidad eso da un lienzo enorme, y el PNG
         resultante puede superar los 50.000 caracteres — que es el MÁXIMO que
         Google Sheets admite en una sola celda. El backend guarda cada firma en
         una celda (hoja "Firmas", columna C), así que al pasarse, esa escritura
         falla y la firma se pierde EN SILENCIO: la fila del permiso ya quedó
         guardada con los nombres, pero sin las imágenes. Ese era el motivo de
         que las firmas hechas desde el computador (≈18-49k) sí quedaran y las
         de la tablet (≈63-117k) no.
         Se reduce el tamaño hasta quedar cómodamente bajo el límite. Una firma
         es un trazo simple, así que bajar la resolución no afecta su lectura ni
         su validez como constancia. */
      function exportarFirmaAcotada() {
        const MAX_CARACTERES = 45000; // margen de seguridad bajo el tope de 50.000
        const ANCHO_OBJETIVO = 700;   // px reales; suficiente para un trazo nítido
        let escala = Math.min(1, ANCHO_OBJETIVO / (canvas.width || 1));
        let ultima = null;
        for (let intento = 0; intento < 6; intento++) {
          const w = Math.max(1, Math.round(canvas.width * escala));
          const h = Math.max(1, Math.round(canvas.height * escala));
          const tmp = document.createElement('canvas');
          tmp.width = w;
          tmp.height = h;
          const tctx = tmp.getContext('2d');
          tctx.drawImage(canvas, 0, 0, w, h);
          ultima = tmp.toDataURL('image/png');
          if (ultima.length <= MAX_CARACTERES) return ultima;
          escala *= 0.75; // todavía muy grande: se reduce otro poco y se reintenta
        }
        return ultima;
      }

      pads[canvas.id] = {
        clear: () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          strokes = [];
          baseImage = null;
          hasInk = false;
          markUnsigned(canvas.id);
        },
        undo: () => {
          // Quita el último trazo y redibuja el resto sobre la firma de fondo
          // (si el permiso traía una firma ya guardada, esa no se puede deshacer:
          // deshacer solo aplica a lo dibujado en esta sesión).
          strokes.pop();
          redibujar();
          if (!strokes.length && !baseImage) {
            hasInk = false;
            markUnsigned(canvas.id);
          }
        },
        getDataUrl: () => (hasInk ? exportarFirmaAcotada() : null),
        setDataUrl: (url) => {
          if (!url) return;
          hasInk = true;
          markSigned(canvas.id);
          const img = new Image();
          img.onload = () => {
            // Pasa a ser el fondo sobre el que se dibujan los trazos nuevos.
            baseImage = img;
            strokes = [];
            redibujar();
          };
          img.src = url;
        },
        hasInk: () => hasInk,
        // ⚠️ A diferencia de la versión anterior (donde solo el manejador de
        // rotación de pantalla preservaba la firma), refreshSize() SIEMPRE
        // guarda la firma actual antes de redimensionar y la vuelve a
        // dibujar después — fijar canvas.width/height limpia el bitmap, así
        // que sin esto, cualquier llamado a refreshIn() sobre un canvas ya
        // firmado borraría la firma en silencio (el estado seguiría
        // diciendo "Firmado ✓" pero el lienzo quedaría en blanco). Ahora es
        // seguro llamarlo en cualquier momento, sin importar el orden.
        // Usa la copia a resolución completa (no la recortada de getDataUrl),
        // para que girar la pantalla varias veces no degrade la firma.
        refreshSize: () => {
          const saved = hasInk ? canvas.toDataURL('image/png') : null;
          resize();
          if (saved) pads[canvas.id].setDataUrl(saved);
        }
      };
    }

    function refreshIn(container) {
      if (!container) return;
      container.querySelectorAll('canvas.pad, canvas.mini-pad').forEach((c) => {
        if (pads[c.id]) pads[c.id].refreshSize();
      });
    }

    /** Registra el reintento de tamaño al girar el celular (con espera para
     *  no recalcular a medio giro). Llamar una sola vez por manager. */
    function bindOrientationChange() {
      let timer = null;
      window.addEventListener('orientationchange', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          Object.keys(pads).forEach((id) => pads[id].refreshSize());
        }, 120);
      });
    }

    return { pads, setup, refreshIn, bindOrientationChange };
  },
  /** Bloquea un lienzo (modo consulta / permiso ya cerrado) — no depende
   *  del manager, se puede llamar directo sobre el <canvas>. */
  lock(canvas) {
    canvas.dataset.locked = '1';
    canvas.classList.add('locked');
  }
};

/**
 * ScrollProgress: barra fina y fija arriba de la pantalla que muestra
 * cuánto lleva recorrido el usuario del formulario — información real
 * en un documento largo de 10 secciones diligenciado en celular, no
 * decoración. Color configurable por página (color de marca del permiso).
 */
const ScrollProgress = {
  init(color) {
    if (document.getElementById('scrollProgress')) return;
    const el = document.createElement('div');
    el.id = 'scrollProgress';
    if (color) el.style.setProperty('--progress-color', color);
    document.body.prepend(el);
    const update = () => {
      const h = document.documentElement;
      const scrollable = h.scrollHeight - h.clientHeight;
      const pct = scrollable > 0 ? (h.scrollTop / scrollable) * 100 : 0;
      el.style.width = Math.min(100, Math.max(0, pct)) + '%';
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }
};

const OfflineBanner = {
  init() {
    if (document.getElementById('offlineBanner')) return; // ya existe
    const el = document.createElement('div');
    el.id = 'offlineBanner';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = '⚠ Sin conexión — mostrando la última versión guardada. Los datos nuevos se guardarán cuando vuelva la señal.';
    document.body.prepend(el);
    const update = () => { el.style.display = navigator.onLine ? 'none' : 'block'; };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }
};

/**
 * SeleccionMultiple: fichas que se tocan para elegir varias opciones, con un
 * campo libre al final para lo que no esté en la lista.
 *
 * Reemplaza a los campos de texto donde había que escribir a mano cosas que
 * casi siempre son las mismas ("¿cuál permiso adicional?", "herramientas a
 * utilizar"): en obra, con guantes y de pie, escribir es lo más incómodo del
 * formulario. Además, al quedar los valores normalizados se pueden contar y
 * filtrar después, cosa imposible con texto libre.
 *
 * Se guarda como un solo texto separado por " · " para que lo que ya está
 * registrado en la hoja siga leyéndose igual y no haya que migrar nada.
 *
 *   const sel = SeleccionMultiple.crear(document.getElementById('x'), {
 *     opciones: ['Taladro','Pulidora'],
 *     placeholderLibre: 'Otras herramientas…'
 *   });
 *   sel.get();          // "Taladro · Pulidora · lo que se escribió"
 *   sel.set(texto);     // reconstruye la selección desde ese texto
 */
const SeleccionMultiple = {
  crear(contenedor, opts) {
    opts = opts || {};
    const opciones = opts.opciones || [];
    const seleccion = new Set();

    const fichas = document.createElement('div');
    fichas.className = 'sm-fichas';
    const libre = document.createElement('input');
    libre.type = 'text';
    libre.className = 'sm-libre';
    libre.placeholder = opts.placeholderLibre || 'Otro (escribe aquí)…';

    opciones.forEach((op) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sm-ficha';
      b.textContent = op;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        if (seleccion.has(op)) { seleccion.delete(op); b.classList.remove('on'); b.setAttribute('aria-pressed','false'); }
        else { seleccion.add(op); b.classList.add('on'); b.setAttribute('aria-pressed','true'); }
        if (opts.onChange) opts.onChange();
      });
      fichas.appendChild(b);
    });
    if (opts.onChange) libre.addEventListener('input', opts.onChange);

    contenedor.innerHTML = '';
    contenedor.appendChild(fichas);
    contenedor.appendChild(libre);

    return {
      get() {
        const partes = opciones.filter(o => seleccion.has(o));
        const extra = libre.value.trim();
        if (extra) partes.push(extra);
        return partes.join(' · ');
      },
      set(texto) {
        seleccion.clear();
        fichas.querySelectorAll('.sm-ficha').forEach(b => {
          b.classList.remove('on'); b.setAttribute('aria-pressed','false');
        });
        libre.value = '';
        if (!texto) return;
        // Lo que coincida con una opción se marca como ficha; el resto vuelve
        // al campo libre. Así un permiso guardado antes de este cambio, con
        // texto escrito a mano, se sigue viendo completo.
        const sueltos = [];
        String(texto).split('·').map(x => x.trim()).filter(Boolean).forEach(parte => {
          const op = opciones.find(o => o.toLowerCase() === parte.toLowerCase());
          if (op) { seleccion.add(op); }
          else sueltos.push(parte);
        });
        fichas.querySelectorAll('.sm-ficha').forEach(b => {
          if (seleccion.has(b.textContent)) { b.classList.add('on'); b.setAttribute('aria-pressed','true'); }
        });
        libre.value = sueltos.join(' · ');
      },
      vacio() { return !this.get(); }
    };
  }
};
