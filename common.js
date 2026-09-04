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
        } catch (e) { /* sigue sin señal; se reintenta después, sin contar como intento fallido */ }
      }
    } finally {
      this._flushing = false;
      Outbox._avisar();
    }
  },
  async count() {
    return (await this.list()).length;
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
    actualizar();
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
