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

// Aviso visible si el borrador automático deja de poder guardarse
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
 * que no hay conexión.
 */
const OfflineBanner = {
  init() {
    if (document.getElementById('offlineBanner')) return;
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
 * UpdateManager: detecta cuando hay una versión nueva del portal ya
 * descargada (Service Worker "esperando") y muestra un banner para que
 * el usuario decida cuándo actualizar.
 */
const UpdateManager = {
  init() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then((reg) => {
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

    let recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recargando) return;
      recargando = true;
      location.reload();
    });

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
 */
const Outbox = {
  _dbPromise: null,
  _flushing: false,
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
  async add(url, body) {
    const db = await this._db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending', 'readwrite');
      tx.objectStore('pending').add({ url, body, savedAt: new Date().toISOString(), intentos: 0 });
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Outbox: transacción abortada'));
      tx.oncomplete = async () => {
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          try {
            const reg = await navigator.serviceWorker.ready;
            await reg.sync.register('sync-outbox');
          } catch (e) { /* no op */ }
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
            const intentos = await this._incrementarIntentos(item.id);
            if (intentos >= 5) {
              await this.remove(item.id);
              Outbox._avisarFallidoDefinitivo(item, json.error);
            }
          }
        } catch (e) { /* sigue sin señal */ }
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
 * OutboxBadge: indicador visible ("N permisos pendientes de enviar")
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
 * SignaturePad: lienzo táctil de firma (dibujar, deshacer trazo, borrar,
 * cargar una firma ya guardada).
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
      if (canvas.dataset.sigInit) return;
      canvas.dataset.sigInit = '1';
      const ctx = canvas.getContext('2d');
      let history = [];
      let hasInk = false;
      let drawing = false;
      let lastX = 0, lastY = 0;

      function resize() {
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = rect.width * ratio;
        canvas.height = rect.height * ratio;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#1f2a33';
        history = [];
      }
      resize();

      function pos(e) {
        const r = canvas.getBoundingClientRect();
        const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
        const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
        return [cx, cy];
      }

      function saveHistory() {
        try {
          history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
          if (history.length > 15) history.shift();
        } catch (e) {}
      }

      function start(e) {
        if (canvas.dataset.locked === '1') return;
        e.preventDefault();
        saveHistory();
        drawing = true;
        [lastX, lastY] = pos(e);
      }

      function move(e) {
        if (!drawing || canvas.dataset.locked === '1') return;
        e.preventDefault();
        const [x, y] = pos(e);
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

      pads[canvas.id] = {
        clear: () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          history = [];
          hasInk = false;
          markUnsigned(canvas.id);
        },
        undo: () => {
          if (history.length === 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            hasInk = false;
            markUnsigned(canvas.id);
            return;
          }
          const prev = history.pop();
          ctx.putImageData(prev, 0, 0);
          if (history.length === 0) { hasInk = false; markUnsigned(canvas.id); }
        },
        getDataUrl: () => (hasInk ? canvas.toDataURL('image/png') : null),
        setDataUrl: (url) => {
          if (!url) {
            console.warn('setDataUrl: URL vacía');
            return;
          }
          
          // Verificar que el canvas tenga tamaño
          if (canvas.width === 0 || canvas.height === 0) {
            console.warn('setDataUrl: Canvas sin tamaño, forzando resize');
            const rect = canvas.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const ratio = window.devicePixelRatio || 1;
              canvas.width = rect.width * ratio;
              canvas.height = rect.height * ratio;
              const ctx2 = canvas.getContext('2d');
              ctx2.setTransform(1, 0, 0, 1, 0, 0);
              ctx2.scale(ratio, ratio);
              ctx2.lineWidth = 2.2;
              ctx2.lineCap = 'round';
              ctx2.strokeStyle = '#1f2a33';
            } else {
              console.error('setDataUrl: Canvas invisible o sin tamaño');
              return;
            }
          }
          
          hasInk = true;
          markSigned(canvas.id);
          
          const img = new Image();
          const ctx2 = canvas.getContext('2d');
          const ratio2 = window.devicePixelRatio || 1;
          
          img.onload = () => {
            console.log('setDataUrl: Imagen cargada correctamente', img.width, 'x', img.height);
            ctx2.clearRect(0, 0, canvas.width, canvas.height);
            ctx2.drawImage(img, 0, 0, canvas.width / ratio2, canvas.height / ratio2);
            hasInk = true;
            markSigned(canvas.id);
          };
          
          img.onerror = (e) => {
            console.error('setDataUrl: Error al cargar la imagen', e);
            setTimeout(() => {
              const img2 = new Image();
              img2.onload = () => {
                console.log('setDataUrl: Imagen cargada en reintento');
                ctx2.clearRect(0, 0, canvas.width, canvas.height);
                ctx2.drawImage(img2, 0, 0, canvas.width / ratio2, canvas.height / ratio2);
                hasInk = true;
                markSigned(canvas.id);
              };
              img2.onerror = () => {
                console.error('setDataUrl: Falló el reintento de carga de imagen');
              };
              img2.src = url;
            }, 200);
          };
          
          console.log('setDataUrl: Cargando imagen desde URL (primeros 50 chars):', url.substring(0, 50) + '...');
          img.src = url;
        },
        hasInk: () => hasInk,
        refreshSize: () => {
          const saved = hasInk ? pads[canvas.id].getDataUrl() : null;
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
  lock(canvas) {
    canvas.dataset.locked = '1';
    canvas.classList.add('locked');
  }
};

/**
 * ScrollProgress: barra fina y fija arriba de la pantalla que muestra
 * cuánto lleva recorrido el usuario del formulario.
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
