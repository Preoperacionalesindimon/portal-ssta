/* ============================================================
   permiso-core.js — Núcleo compartido de los 4 permisos de trabajo
   "gemelos" (caliente, eléctrico, izajes, confinados).
   ============================================================ */
const PermisoCore = (function () {
  let cfg = null;
  let MODE = null;
  let permitCode = null;
  let firstSaveDone = false;
  let locked = false;
  const states = {};
  let execCounter = 0;
  let execBody = null;
  let personalCache = [];
  let closedPermitsCache = [];
  let addPeopleData = null;
  let baseExecCount = 0;
  let opIdAddWorkers = null;

  const TOGGLE_2STATE = [
    { val: 'C', label: 'C', cls: 'active-c' },
    { val: 'NA', label: 'NA', cls: 'active-na' }
  ];
  const TOGGLE_3STATE = [
    { val: 'SI', label: 'SÍ', cls: 'active-si' },
    { val: 'NO', label: 'NO', cls: 'active-no' },
    { val: 'NA', label: 'N/A', cls: 'active-na' }
  ];

  const $ = (id) => document.getElementById(id);

  function keyFromText(prefix, text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return prefix + '_' + Math.abs(hash).toString(36);
  }

  function renderToggleGroup(container, data, statePrefix, stateObj, progressElId, toggleStates) {
    const states_ = toggleStates || cfg.toggleStates || TOGGLE_2STATE;
    data.forEach((cat) => {
      const catDiv = document.createElement('div');
      catDiv.className = 'check-cat';
      const h4 = document.createElement('h4');
      h4.textContent = cat.cat;
      catDiv.appendChild(h4);
      cat.items.forEach((text) => {
        const key = keyFromText(statePrefix, text);
        if (!(key in stateObj)) stateObj[key] = null;
        const row = document.createElement('div');
        row.className = 'check-item';
        const btns = states_
          .map((s) => `<button type="button" data-key="${key}" data-val="${s.val}" aria-pressed="false">${s.label}</button>`)
          .join('');
        row.innerHTML = `<p>${text}</p><div class="toggle" role="group" aria-label="${text.replace(/"/g, '&quot;')}">${btns}</div>`;
        catDiv.appendChild(row);
      });
      container.appendChild(catDiv);
    });
    container.addEventListener('click', (e) => {
      if (locked) return;
      const btn = e.target.closest('button[data-key]');
      if (!btn) return;
      const key = btn.dataset.key,
        val = btn.dataset.val;
      stateObj[key] = val;
      const allClasses = states_.map((s) => s.cls);
      btn.parentElement.querySelectorAll('button').forEach((b) => {
        b.classList.remove(...allClasses);
        b.setAttribute('aria-pressed', 'false');
      });
      const matched = states_.find((s) => s.val === val);
      if (matched) btn.classList.add(matched.cls);
      btn.setAttribute('aria-pressed', 'true');
      updateProgress(stateObj, progressElId);
    });
  }

  function updateProgress(stateObj, elId) {
    const total = Object.keys(stateObj).length,
      done = Object.values(stateObj).filter((v) => v !== null).length;
    const el = $(elId);
    if (el) el.textContent = `${done}/${total}`;
  }

  function applyToggleState(stateObj, toggleStates) {
    const states_ = toggleStates || cfg.toggleStates || TOGGLE_2STATE;
    document.querySelectorAll('button[data-key]').forEach((btn) => {
      const key = btn.dataset.key,
        val = stateObj[key];
      if (!val) return;
      const allClasses = states_.map((s) => s.cls);
      if (btn.dataset.val === val) {
        const matched = states_.find((s) => s.val === val);
        btn.classList.add(matched.cls);
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.classList.remove(...allClasses);
      }
    });
  }

  /* ================= SIGNATURE PAD ================= */
  const sigMgr = SignaturePad.createManager({
    statusIdFor: (id) => (id.startsWith('padCierre') ? 'status' + id.replace('pad', '') : 'status_' + id)
  });
  const pads = sigMgr.pads;
  // Exponer pads para depuración
  PermisoCore._pads = pads;
  
  const setupPad = sigMgr.setup;
  const refreshPadsIn = sigMgr.refreshIn;

  function lockPad(canvas) {
    SignaturePad.lock(canvas);
  }
  sigMgr.bindOrientationChange();

  function forzarTamanioCanvas(container) {
    if (!container) return;
    container.querySelectorAll('canvas.pad, canvas.mini-pad').forEach((canvas) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const ratio = window.devicePixelRatio || 1;
        canvas.width = rect.width * ratio;
        canvas.height = rect.height * ratio;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#1f2a33';
      }
    });
  }

  function applyPendingExecSignatures() {
    execBody.querySelectorAll('.exec-card').forEach((card) => {
      const sig = card.dataset.pendingSig;
      if (!sig) return;
      const canvas = card.querySelector('canvas.mini-pad');
      if (canvas && pads[canvas.id]) {
        if (canvas.width > 0 && canvas.height > 0) {
          pads[canvas.id].setDataUrl(sig);
        } else {
          const rect = canvas.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const ratio = window.devicePixelRatio || 1;
            canvas.width = rect.width * ratio;
            canvas.height = rect.height * ratio;
            pads[canvas.id].setDataUrl(sig);
          }
        }
        delete card.dataset.pendingSig;
      }
    });
  }

  /* ================= RESPONSABLES ================= */
  function buildResponsablesUI() {
    const cont = $('responsablesSigs');
    cont.innerHTML = '';
    (cfg.responsables || []).forEach((label, i) => {
      const id = 'resp' + i;
      const div = document.createElement('div');
      div.className = 'sig-block';
      div.innerHTML = `<h5>${label}</h5>
        <div class="sig-fields"><input type="text" placeholder="Nombre completo (escribe para buscar)" id="${id}nombre"><input type="text" placeholder="Cédula" id="${id}cc" inputmode="numeric"></div>
        <canvas class="pad" id="pad_${id}"></canvas>
        <div class="sig-actions"><button type="button" data-clear="pad_${id}">Borrar firma</button><button type="button" data-undo="pad_${id}">Deshacer trazo</button><span class="sig-status" id="status_pad_${id}">Sin firmar</span></div>`;
      cont.appendChild(div);
      attachPersonalAutocomplete($(id + 'nombre'), (persona) => {
        $(id + 'nombre').value = persona.nombre;
        $(id + 'cc').value = persona.cedula;
      });
    });
    ['cierre1', 'cierre2'].forEach((id) => {
      const nombreEl = $(id + 'nombre');
      if (!nombreEl) return;
      attachPersonalAutocomplete(nombreEl, (persona) => {
        $(id + 'nombre').value = persona.nombre;
        $(id + 'cc').value = persona.cedula;
        $(id + 'cargo').value = persona.cargo || '';
      });
    });
  }

  /* ================= EJECUTANTES ================= */
  function addExecRow(prefill) {
    execCounter++;
    const n = execCounter;
    const card = document.createElement('div');
    card.className = 'exec-card';
    const extras = cfg.execExtraFields || (cfg.execExtraField ? [Object.assign({ type: 'text' }, cfg.execExtraField)] : []);
    const extrasHtml = extras
      .map((ex) => {
        if (ex.type === 'select') {
          const opts = (ex.options || []).map((o) => `<option value="${o.value}">${o.label}</option>`).join('');
          return `<select id="${ex.id}${n}"><option value="">${ex.placeholder || ''}</option>${opts}</select>`;
        }
        return `<input type="text" placeholder="${ex.placeholder || ''}" id="${ex.id}${n}">`;
      })
      .join('\n        ');
    card.innerHTML = `
      <div class="exec-card-top">
        <span class="exec-num">Ejecutante ${n}</span>
        <button type="button" class="remove-exec-btn" data-remove-row="${n}" title="Quitar">✕ Quitar</button>
      </div>
      <div class="exec-fields">
        <input type="text" placeholder="Nombre completo (escribe para buscar)" id="execNombre${n}" autocomplete="off">
        <input type="text" placeholder="Documento (C.C.)" id="execCC${n}" inputmode="numeric">
        <input type="text" placeholder="Cargo" id="execCargo${n}">
        ${extrasHtml}
      </div>
      <div class="sig-pad-wrap">
        <label>Firma</label>
        <canvas class="mini-pad" id="execPad${n}"></canvas>
        <div class="sig-actions">
          <button type="button" data-clear="execPad${n}">Borrar firma</button>
          <button type="button" data-undo="execPad${n}">Deshacer trazo</button>
          <span class="sig-status" id="status_execPad${n}">Sin firmar</span>
        </div>
      </div>`;
    execBody.appendChild(card);
    const c = $('execPad' + n);
    setupPad(c);
    if (prefill) {
      $('execNombre' + n).value = prefill.nombre || '';
      $('execCC' + n).value = prefill.cc || '';
      $('execCargo' + n).value = prefill.cargo || '';
      extras.forEach((ex) => {
        const el = $(ex.id + n);
        if (el) el.value = prefill[ex.field] || '';
      });
      if (prefill.sig) card.dataset.pendingSig = prefill.sig;
    }
    attachPersonalAutocomplete($('execNombre' + n), (persona) => {
      $('execNombre' + n).value = persona.nombre;
      $('execCC' + n).value = persona.cedula;
      $('execCargo' + n).value = persona.cargo || '';
    });
    card.querySelector('[data-remove-row]').addEventListener('click', () => {
      if (locked) return;
      delete pads['execPad' + n];
      card.remove();
    });
    return n;
  }

  function collectExecRows() {
    const rows = [];
    const extras = cfg.execExtraFields || (cfg.execExtraField ? [Object.assign({ type: 'text' }, cfg.execExtraField)] : []);
    for (let i = 1; i <= execCounter; i++) {
      const nombreEl = $('execNombre' + i);
      if (!nombreEl) continue;
      
      // ===== OBTENER FIRMA DIRECTAMENTE DEL CANVAS =====
      const canvas = document.getElementById('execPad' + i);
      let sig = null;
      if (canvas) {
        try {
          const ctx = canvas.getContext('2d');
          const imageData = ctx.getImageData(0, 0, Math.min(canvas.width, 50), Math.min(canvas.height, 50));
          const pixels = imageData.data;
          let hasPixel = false;
          for (let j = 0; j < pixels.length && !hasPixel; j += 4) {
            if (pixels[j] < 250 || pixels[j+1] < 250 || pixels[j+2] < 250) {
              hasPixel = true;
            }
          }
          if (hasPixel) {
            sig = canvas.toDataURL('image/png');
          }
        } catch (e) {
          console.warn(`Error verificando canvas del ejecutante ${i}:`, e);
        }
      }
      // ===== FIN OBTENER FIRMA =====
      
      const row = {
        nombre: nombreEl.value,
        cc: $('execCC' + i).value,
        cargo: $('execCargo' + i).value,
        sig: sig
      };
      extras.forEach((ex) => {
        const el = $(ex.id + i);
        row[ex.field] = el ? el.value : '';
      });
      rows.push(row);
    }
    return rows;
  }

  /* ================= PREGUNTAS SI/NO/N-A SUELTAS (freeformYN) ================= */
  function initFreeformYN() {
    document.querySelectorAll('.yn-opts').forEach((group) => {
      if (group.dataset.freeformInit) return;
      group.dataset.freeformInit = '1';
      if (!group.hasAttribute('data-mode')) {
        group.innerHTML = '<button type="button" class="yn-btn" data-v="SI">SI</button><button type="button" class="yn-btn" data-v="N/A">N/A</button>';
      }
      const rowLabel = (group.closest('.yn-row') || group.closest('.field') || {}).querySelector
        ? (group.closest('.yn-row') || group.closest('.field')).querySelector('.yn-label,label')
        : null;
      const labelTxt = rowLabel ? rowLabel.textContent.trim() : '';
      group.setAttribute('role', 'group');
      if (labelTxt) group.setAttribute('aria-label', labelTxt);
      group.querySelectorAll('button').forEach((btn) => {
        btn.classList.add('yn-btn');
        if (labelTxt) btn.setAttribute('aria-label', `${btn.dataset.v === 'SI' ? 'Sí' : btn.dataset.v} — ${labelTxt}`);
        btn.setAttribute('aria-pressed', 'false');
        btn.addEventListener('click', () => {
          if (locked) return;
          const already = btn.classList.contains('active-si') || btn.classList.contains('active-na') || btn.classList.contains('active-no');
          group.querySelectorAll('button').forEach((b) => {
            b.classList.remove('active-si', 'active-na', 'active-no');
            b.setAttribute('aria-pressed', 'false');
          });
          if (already) return;
          const v = btn.dataset.v;
          if (v === 'SI') btn.classList.add('active-si');
          else if (v === 'NO') btn.classList.add('active-no');
          else btn.classList.add('active-na');
          btn.setAttribute('aria-pressed', 'true');
          if (cfg.onYNChange) cfg.onYNChange();
        });
      });
    });
  }

  function collectFreeformYN(container) {
    const out = {};
    [...container.querySelectorAll('.yn-opts')].forEach((g, i) => {
      const active = g.querySelector('.active-si,.active-na,.active-no');
      const label = g.previousElementSibling;
      const texto = label ? label.textContent.trim() : null;
      const key = texto ? keyFromText('yn', texto) : keyFromText('yn', 'sinEtiqueta_' + i);
      out[key] = active ? active.dataset.v : '';
    });
    return out;
  }

  function migrarFreeformYNAntiguo(valores, container) {
    if (!Array.isArray(valores)) return valores;
    const migrado = {};
    [...container.querySelectorAll('.yn-opts')].forEach((g, i) => {
      if (valores[i] !== undefined) {
        const label = g.previousElementSibling;
        const texto = label ? label.textContent.trim() : null;
        const key = texto ? keyFromText('yn', texto) : keyFromText('yn', 'sinEtiqueta_' + i);
        migrado[key] = valores[i];
      }
    });
    return migrado;
  }

  function applyFreeformYN(container, valoresGuardados) {
    const values = migrarFreeformYNAntiguo(valoresGuardados || {}, container);
    [...container.querySelectorAll('.yn-opts')].forEach((g) => {
      const label = g.previousElementSibling;
      const texto = label ? label.textContent.trim() : null;
      const key = texto ? keyFromText('yn', texto) : null;
      if (!key) return;
      const v = values[key];
      g.querySelectorAll('button').forEach((b) => {
        b.classList.remove('active-si', 'active-na', 'active-no');
        b.setAttribute('aria-pressed', 'false');
      });
      if (!v) return;
      const btn = [...g.querySelectorAll('button')].find((b) => b.dataset.v === v);
      if (btn) {
        btn.classList.add(v === 'SI' ? 'active-si' : v === 'NO' ? 'active-no' : 'active-na');
        btn.setAttribute('aria-pressed', 'true');
      }
    });
    if (cfg.onYNChange) cfg.onYNChange();
  }

  function validateFreeformYN(container, missing) {
    container.querySelectorAll('.yn-opts').forEach((g) => g.classList.remove('field-invalid'));
    container.querySelectorAll('.yn-opts').forEach((g) => {
      const active = g.querySelector('.active-si,.active-na,.active-no');
      if (!active) {
        g.classList.add('field-invalid');
        const row = g.closest('.yn-row') || g.closest('.field') || g.closest('.row');
        if (row) row.classList.add('field-invalid');
        const label = row ? (row.querySelector('.yn-label,label') || {}).textContent : null;
        missing.push(label ? label.trim() : 'una pregunta SI/N-A');
      }
    });
  }

  function collectResponsables() {
    const arr = [];
    (cfg.responsables || []).forEach((label, i) => {
      const id = 'resp' + i;
      
      // ===== OBTENER FIRMA DIRECTAMENTE DEL CANVAS =====
      const canvas = document.getElementById('pad_' + id);
      let sig = null;
      if (canvas) {
        try {
          const ctx = canvas.getContext('2d');
          const imageData = ctx.getImageData(0, 0, Math.min(canvas.width, 50), Math.min(canvas.height, 50));
          const pixels = imageData.data;
          let hasPixel = false;
          for (let j = 0; j < pixels.length && !hasPixel; j += 4) {
            if (pixels[j] < 250 || pixels[j+1] < 250 || pixels[j+2] < 250) {
              hasPixel = true;
            }
          }
          if (hasPixel) {
            sig = canvas.toDataURL('image/png');
          }
        } catch (e) {
          console.warn(`Error verificando canvas del responsable ${i}:`, e);
        }
      }
      // ===== FIN OBTENER FIRMA =====
      
      arr.push({
        label,
        nombre: $(id + 'nombre').value,
        cc: $(id + 'cc').value,
        sig: sig
      });
    });
    return arr;
  }

  /* ================= INIT RENDER ================= */
  function initRender() {
    (cfg.checklistGroups || []).forEach((g) => {
      states[g.stateKey] = states[g.stateKey] || {};
      renderToggleGroup($(g.containerId), g.data, g.statePrefix, states[g.stateKey], g.progressId, g.toggleStates);
      updateProgress(states[g.stateKey], g.progressId);
    });
    buildResponsablesUI();
    document.querySelectorAll('canvas.pad').forEach((c) => setupPad(c));
    for (let i = 0; i < 3; i++) addExecRow();
    if (cfg.freeformYN) initFreeformYN();
    if (cfg.extraOnInitRender) cfg.extraOnInitRender();
  }

  /* ================= SET / COLLECT / LOCK ================= */
  function setFieldValues(vals) {
    if ($('descripcion')) $('descripcion').value = vals.descripcion || '';
    if ($('cualPermiso')) $('cualPermiso').value = vals.cualPermiso || '';
    document.querySelectorAll('input[name=permAdicional]').forEach((r) => {
      r.checked = r.value === vals.permAdicional;
    });
    if ($('desdeFecha')) $('desdeFecha').value = vals.desdeFecha || '';
    if ($('desdeHora')) $('desdeHora').value = vals.desdeHora || '';
    if ($('hastaFecha')) $('hastaFecha').value = vals.hastaFecha || '';
    if ($('hastaHora')) $('hastaHora').value = vals.hastaHora || '';
    if ($('sitio')) $('sitio').value = vals.sitio || '';
    if ($('responsable')) $('responsable').value = (vals.responsableTrabajo !== undefined ? vals.responsableTrabajo : vals.responsable) || '';
    if ($('observaciones')) $('observaciones').value = vals.observaciones || '';
    if (cfg.freeformYN && $('openPhase')) applyFreeformYN($('openPhase'), vals.yn);
    if (cfg.extraSetFieldValues) cfg.extraSetFieldValues(vals);
  }

  function lockOpenSections() {
    locked = true;
    document
      .querySelectorAll('#app .section-body input, #app .section-body textarea, #app .section-body select, #app .grid input, #app .grid textarea, #app .grid select')
      .forEach((el) => {
        if (!el.closest('#closeFields')) el.disabled = true;
      });
    document.querySelectorAll('#app button[data-key]').forEach((b) => (b.disabled = true));
    document.querySelectorAll('#app canvas.pad, #app canvas.mini-pad').forEach((c) => {
      if (!c.closest('#closeFields')) lockPad(c);
    });
    document.querySelectorAll('#app .sig-actions button').forEach((b) => {
      if (!b.closest('#closeFields')) b.disabled = true;
    });
    document.querySelectorAll('#app .remove-exec-btn').forEach((b) => (b.disabled = true));
    const addRowBtn = $(cfg.addRowBtnId || 'addRowBtn');
    if (addRowBtn) addRowBtn.style.display = 'none';
    (cfg.lockSectionIds || []).forEach((id) => {
      const el = $(id);
      if (el) el.classList.add('locked');
    });
  }

  function genCode() {
    const d = new Date();
    return (
      cfg.codePrefix +
      '-' +
      d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') +
      '-' +
      String(Math.floor(Math.random() * 900000) + 100000)
    );
  }

  function collectOpenData() {
    const base = { permitCode, status: 'ABIERTO', formVersion: cfg.formVersion || 1, createdAt: new Date().toISOString() };
    if ($('descripcion')) base.descripcion = $('descripcion').value;
    if ($('cualPermiso')) base.cualPermiso = $('cualPermiso').value;
    if (document.querySelector('input[name=permAdicional]')) {
      base.permAdicional = (document.querySelector('input[name=permAdicional]:checked') || {}).value || 'No';
    }
    if ($('desdeFecha')) base.desdeFecha = $('desdeFecha').value;
    if ($('desdeHora')) base.desdeHora = $('desdeHora').value;
    if ($('hastaFecha')) base.hastaFecha = $('hastaFecha').value;
    if ($('hastaHora')) base.hastaHora = $('hastaHora').value;
    if ($('sitio')) base.sitio = $('sitio').value;
    if ($('responsable')) base.responsableTrabajo = $('responsable').value;
    const dashIdx = cfg.responsableDashboardIndex;
    const dashEl = dashIdx !== undefined ? $('resp' + dashIdx + 'nombre') : null;
    base.responsable = (dashEl && dashEl.value) || ($('responsable') ? $('responsable').value : '') || '';
    (cfg.checklistGroups || []).forEach((g) => {
      base[g.stateKey] = states[g.stateKey];
    });
    if ($('observaciones')) base.observaciones = $('observaciones').value;
    
    // ===== RECOLECCIÓN DE FIRMAS DIRECTAMENTE DESDE EL CANVAS =====
    base.responsablesSigs = (cfg.responsables || []).map((label, i) => {
      const id = 'resp' + i;
      const canvas = document.getElementById('pad_' + id);
      let sig = null;
      
      if (canvas) {
        try {
          const ctx = canvas.getContext('2d');
          const imageData = ctx.getImageData(0, 0, Math.min(canvas.width, 50), Math.min(canvas.height, 50));
          const pixels = imageData.data;
          let hasPixel = false;
          for (let j = 0; j < pixels.length && !hasPixel; j += 4) {
            if (pixels[j] < 250 || pixels[j+1] < 250 || pixels[j+2] < 250) {
              hasPixel = true;
            }
          }
          if (hasPixel) {
            sig = canvas.toDataURL('image/png');
          }
        } catch (e) {
          console.warn(`Error verificando canvas del responsable ${i}:`, e);
        }
      }
      
      return {
        label,
        nombre: $(id + 'nombre') ? $(id + 'nombre').value : '',
        cc: $(id + 'cc') ? $(id + 'cc').value : '',
        sig: sig
      };
    });
    // ===== FIN RECOLECCIÓN DE FIRMAS =====
    
    base.ejecutantes = collectExecRows();
    if (cfg.freeformYN && $('openPhase')) base.yn = collectFreeformYN($('openPhase'));
    if (cfg.extraCollectOpenData) Object.assign(base, cfg.extraCollectOpenData());

    // ===== DEPURACIÓN =====
    console.log('=== COLECTANDO DATOS PARA GUARDAR ===');
    console.log('Responsables con firmas:');
    (base.res
