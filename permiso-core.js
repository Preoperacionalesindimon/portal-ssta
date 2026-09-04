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
    (base.responsablesSigs || []).forEach((r, i) => {
      console.log(`  Responsable ${i}: ${r.nombre || '(sin nombre)'} - ${r.sig ? 'TIENE FIRMA ✅ (' + r.sig.length + ' chars)' : 'SIN FIRMA ❌'}`);
    });
    console.log('Ejecutantes con firmas:');
    (base.ejecutantes || []).forEach((r, i) => {
      console.log(`  Ejecutante ${i}: ${r.nombre || '(sin nombre)'} - ${r.sig ? 'TIENE FIRMA ✅ (' + r.sig.length + ' chars)' : 'SIN FIRMA ❌'}`);
    });

    return base;
  }

  function collectCloseData() {
    const signers = cfg.closeSigners || [
      { idPrefix: 'cierre1', padKey: 'padCierre1', field: 'cierre1', combined: false },
      { idPrefix: 'cierre2', padKey: 'padCierre2', field: 'cierre2', combined: false }
    ];
    const base = {
      cierreFecha: $('cierreFecha').value,
      cierreHora: $('cierreHora').value,
      motivoCierre: $('motivoCierre').value,
      q1: (document.querySelector('input[name=q1]:checked') || {}).value || '',
      q2: (document.querySelector('input[name=q2]:checked') || {}).value || '',
      q3: (document.querySelector('input[name=q3]:checked') || {}).value || '',
      q4: (document.querySelector('input[name=q4]:checked') || {}).value || '',
      closedAt: new Date().toISOString()
    };
    signers.forEach((s) => {
      const sig = pads[s.padKey] ? pads[s.padKey].getDataUrl() : null;
      if (s.combined) {
        base[s.field] = { nombreCedula: ($(s.idPrefix) || {}).value || '', sig };
      } else {
        base[s.field] = {
          nombre: ($(s.idPrefix + 'nombre') || {}).value || '',
          cc: ($(s.idPrefix + 'cc') || {}).value || '',
          cargo: ($(s.idPrefix + 'cargo') || {}).value || '',
          sig
        };
      }
    });
    return base;
  }

  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function migrarClaveEstadoAntigua(guardado, prefix, data) {
    if (!guardado) return guardado;
    const pareceEsquemaViejo = Object.keys(guardado).some((k) => new RegExp('^' + prefix + '_\\d+$').test(k));
    if (!pareceEsquemaViejo) return guardado;
    const migrado = {};
    let idx = 0;
    data.forEach((cat) => {
      cat.items.forEach((text) => {
        const claveVieja = prefix + '_' + idx++;
        const claveNueva = keyFromText(prefix, text);
        if (claveVieja in guardado) migrado[claveNueva] = guardado[claveVieja];
      });
    });
    return migrado;
  }

  /* ================= LOAD OPEN DATA INTO FORM ================= */
  function loadOpenDataIntoForm(data) {
    console.log('loadOpenDataIntoForm: Cargando permiso', data.permitCode);
    permitCode = data.permitCode;

    (cfg.checklistGroups || []).forEach((g) => {
      states[g.stateKey] = states[g.stateKey] || {};
      const guardadoMigrado = migrarClaveEstadoAntigua(data[g.stateKey], g.statePrefix, g.data);
      Object.assign(states[g.stateKey], guardadoMigrado || {});
    });

    setFieldValues(data);

    (cfg.checklistGroups || []).forEach((g) => {
      applyToggleState(states[g.stateKey], g.toggleStates);
      updateProgress(states[g.stateKey], g.progressId);
    });

    function dibujarFirmasConRetry(intentos = 0) {
      const maxIntentos = 10;
      const delay = 300;
      console.log(`dibujarFirmasConRetry: Intento ${intentos + 1} de ${maxIntentos}`);

      // 1. RESPONSABLES
      const responsablesSigs = data.responsablesSigs || [];
      console.log(`Responsables a dibujar: ${responsablesSigs.length}`);
      const responsablesContainer = $('responsablesSigs');
      if (responsablesContainer) {
        const wasHidden = responsablesContainer.style.display === 'none';
        if (wasHidden) responsablesContainer.style.display = 'block';
        responsablesContainer.offsetHeight;
        
        responsablesContainer.querySelectorAll('canvas.pad').forEach((canvas) => {
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
        
        refreshPadsIn(responsablesContainer);
        responsablesSigs.forEach((r, i) => {
          const id = 'resp' + i;
          const nEl = $(id + 'nombre');
          const cEl = $(id + 'cc');
          if (nEl) nEl.value = r.nombre || '';
          if (cEl) cEl.value = r.cc || '';
          const pad = pads['pad_' + id];
          if (pad && r.sig) {
            console.log(`Dibujando firma de responsable ${i} (${r.nombre})`);
            const canvas = document.getElementById('pad_' + id);
            if (canvas && canvas.width > 0 && canvas.height > 0) {
              pad.setDataUrl(r.sig);
            } else if (canvas) {
              const rect = canvas.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                const ratio = window.devicePixelRatio || 1;
                canvas.width = rect.width * ratio;
                canvas.height = rect.height * ratio;
                pad.setDataUrl(r.sig);
              }
            }
          } else {
            console.warn(`Responsable ${i}: sin firma o sin pad`);
          }
        });
        if (wasHidden) responsablesContainer.style.display = 'none';
      }

      // 2. EJECUTANTES
      execBody.innerHTML = '';
      execCounter = 0;
      (data.ejecutantes || []).forEach((row) => addExecRow(row));
      if ((data.ejecutantes || []).length === 0) {
        for (let i = 0; i < 3; i++) addExecRow();
      }

      const wasExecHidden = execBody.style.display === 'none';
      if (wasExecHidden) execBody.style.display = 'block';
      execBody.offsetHeight;
      
      execBody.querySelectorAll('canvas.mini-pad').forEach((canvas) => {
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
      
      refreshPadsIn(execBody);

      let pendientes = 0;
      execBody.querySelectorAll('.exec-card').forEach((card) => {
        const sig = card.dataset.pendingSig;
        if (!sig) return;
        const canvas = card.querySelector('canvas.mini-pad');
        if (canvas && pads[canvas.id]) {
          if (canvas.width > 0 && canvas.height > 0) {
            pads[canvas.id].setDataUrl(sig);
            delete card.dataset.pendingSig;
          } else {
            const rect = canvas.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const ratio = window.devicePixelRatio || 1;
              canvas.width = rect.width * ratio;
              canvas.height = rect.height * ratio;
              pads[canvas.id].setDataUrl(sig);
              delete card.dataset.pendingSig;
            } else {
              pendientes++;
            }
          }
        }
      });

      if (wasExecHidden) execBody.style.display = 'none';

      console.log(`Firmas pendientes después del intento ${intentos + 1}: ${pendientes}`);

      if (pendientes > 0 && intentos < maxIntentos) {
        setTimeout(() => {
          dibujarFirmasConRetry(intentos + 1);
        }, delay);
      } else if (pendientes === 0) {
        console.log('Todas las firmas dibujadas correctamente ✅');
      } else {
        console.error('No se pudieron dibujar algunas firmas después de varios intentos ❌');
      }
    }

    console.log('Iniciando dibujo de firmas...');
    setTimeout(() => {
      dibujarFirmasConRetry(0);
    }, 200);
  }

  /* ================= BACKEND ================= */
  function getWebAppUrl() {
    return PORTAL_CONFIG.BACKENDS[cfg.key].url;
  }

  async function sendToSheet(payload) {
    const url = getWebAppUrl();
    if (!url) return { ok: false };
    try {
      const res = await fetchWithRetry(url, {
        method: 'POST',
        body: JSON.stringify(Object.assign({}, payload, { token: PORTAL_CONFIG.API_TOKEN })),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
      });
      return await res.json();
    } catch (err) {
      return { ok: false, error: 'No se pudo conectar con el backend. Verifique su conexión e intente de nuevo.' };
    }
  }

  async function fetchFromSheet(code) {
    const url = getWebAppUrl();
    if (!url) return null;
    try {
      const res = await fetchWithRetry(url + '?code=' + encodeURIComponent(code) + '&token=' + encodeURIComponent(PORTAL_CONFIG.API_TOKEN));
      const data = await res.json();
      if (data.ok === false) {
        alert(data.error || 'Permiso no encontrado');
        return null;
      }
      return data;
    } catch (err) {
      alert('No se pudo conectar con el backend. Verifique su conexión e intente de nuevo.');
      return null;
    }
  }

  function listQuery() {
    return (PORTAL_CONFIG.BACKENDS[cfg.key] || {}).listQuery || 'list=1';
  }

  async function fetchOpenList() {
    const url = getWebAppUrl();
    if (!url) return [];
    try {
      const res = await fetchWithRetry(url + '?' + listQuery() + '&token=' + encodeURIComponent(PORTAL_CONFIG.API_TOKEN));
      const data = await res.json();
      return (data.rows || []).filter((r) => r.status === 'ABIERTO');
    } catch (err) {
      return [];
    }
  }

  async function fetchClosedList() {
    const url = getWebAppUrl();
    if (!url) return [];
    try {
      const res = await fetchWithRetry(url + '?' + listQuery() + '&token=' + encodeURIComponent(PORTAL_CONFIG.API_TOKEN));
      const data = await res.json();
      return (data.rows || []).filter((r) => r.status === 'CERRADO');
    } catch (err) {
      return [];
    }
  }

  /* ================= PERSONAL COMPARTIDO ================= */
  async function cargarPersonalCompartido() {
    try {
      const res = await fetchWithRetry(
        PORTAL_CONFIG.BACKENDS.personal.url + '?action=listPersonal&token=' + encodeURIComponent(PORTAL_CONFIG.API_TOKEN)
      );
      const data = await res.json();
      personalCache = data.ok && data.personal ? data.personal : [];
    } catch (err) {
      /* no op */
    }
  }

  function attachPersonalAutocomplete(inputEl, onSelect) {
    if (inputEl.dataset.autocompleteInit) return;
    inputEl.dataset.autocompleteInit = '1';
    let box = null;
    function cerrar() {
      if (box) {
        box.remove();
        box = null;
      }
    }
    function abrir() {
      cerrar();
      const q = inputEl.value.trim().toLowerCase();
      if (!q) return;
      const matches = personalCache.filter((p) => p.nombre.toLowerCase().includes(q)).slice(0, 6);
      if (!matches.length) return;
      box = document.createElement('div');
      box.className = 'autocomplete-box';
      const rect = inputEl.getBoundingClientRect();
      box.style.position = 'absolute';
      box.style.left = rect.left + window.scrollX + 'px';
      box.style.top = rect.bottom + window.scrollY + 2 + 'px';
      box.style.width = rect.width + 'px';
      matches.forEach((p) => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML = `<b>${esc(p.nombre)}</b><span>CC ${esc(p.cedula)}${p.cargo ? ' · ' + esc(p.cargo) : ''}</span>`;
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          onSelect(p);
          cerrar();
        });
        box.appendChild(item);
      });
      document.body.appendChild(box);
    }
    inputEl.addEventListener('input', abrir);
    inputEl.addEventListener('focus', abrir);
    inputEl.addEventListener('blur', () => setTimeout(cerrar, 150));
    window.addEventListener('scroll', cerrar, true);
  }

  /* ================= VALIDACIÓN ================= */
  function scrollToEl(el) {
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function validateOpenData() {
    const missing = [];
    (cfg.requiredOpenFields || []).forEach((f) => {
      const el = $(f.id);
      if (el && !el.value.trim()) missing.push({ msg: f.label, el });
    });
    if ($('cualPermiso') && document.querySelector('input[name=permAdicional]')) {
      const permAdicional = (document.querySelector('input[name=permAdicional]:checked') || {}).value;
      if (permAdicional === 'Si' && !$('cualPermiso').value.trim()) {
        missing.push({ msg: cfg.cualPermisoLabel || '¿Cuál permiso adicional?', el: $('cualPermiso') });
      }
    }
    if (cfg.dateRange) {
      const dr = cfg.dateRange;
      const desdeFecha = dr.desdeFecha ? $(dr.desdeFecha) : null;
      const hastaFecha = dr.hastaFecha ? $(dr.hastaFecha) : null;
      const desdeHora = dr.desdeHora ? $(dr.desdeHora) : null;
      const hastaHora = dr.hastaHora ? $(dr.hastaHora) : null;
      if (desdeFecha && !desdeFecha.value) missing.push({ msg: `Fecha "Desde" (${dr.sectionLabel})`, el: desdeFecha });
      if (desdeHora && !desdeHora.value) missing.push({ msg: `Hora "Desde" (${dr.sectionLabel})`, el: desdeHora });
      if (hastaFecha && !hastaFecha.value) missing.push({ msg: `Fecha "Hasta" (${dr.sectionLabel})`, el: hastaFecha });
      if (hastaHora && !hastaHora.value) missing.push({ msg: `Hora "Hasta" (${dr.sectionLabel})`, el: hastaHora });
      if (desdeFecha && hastaFecha && desdeFecha.value && hastaFecha.value) {
        if (desdeHora && hastaHora) {
          if (desdeHora.value && hastaHora.value) {
            const inicio = new Date(desdeFecha.value + 'T' + desdeHora.value);
            const fin = new Date(hastaFecha.value + 'T' + hastaHora.value);
            if (fin <= inicio) missing.push({ msg: `La fecha/hora "Hasta" debe ser posterior a "Desde" (${dr.sectionLabel})`, el: hastaFecha });
          }
        } else if (new Date(hastaFecha.value) < new Date(desdeFecha.value)) {
          missing.push({ msg: `La fecha "Hasta" debe ser posterior o igual a "Desde" (${dr.sectionLabel})`, el: hastaFecha });
        }
      }
    }
    (cfg.checklistGroups || []).forEach((g) => {
      const pending = Object.values(states[g.stateKey] || {}).filter((v) => v === null).length;
      if (pending > 0) {
        missing.push({ msg: `${pending} ítem(s) sin marcar en ${g.label} (${g.sectionLabel})`, el: $(g.containerId) });
      }
    });
    const RESPONSABLES_OPCIONALES = cfg.responsablesOpcionales || [];
    (cfg.responsables || []).forEach((label, i) => {
      if (RESPONSABLES_OPCIONALES.includes(label)) return;
      const id = 'resp' + i;
      const nombreEl = $(id + 'nombre'),
        ccEl = $(id + 'cc');
      const sig = pads['pad_' + id] ? pads['pad_' + id].getDataUrl() : null;
      if (!nombreEl.value.trim() || !ccEl.value.trim() || !sig) {
        missing.push({ msg: `Datos y/o firma de "${label}" (${cfg.responsablesSectionLabel || 'sección de responsables'})`, el: nombreEl });
      }
    });
    let execValid = 0;
    for (let i = 1; i <= execCounter; i++) {
      const nombreEl = $('execNombre' + i);
      if (!nombreEl) continue;
      const ccEl = $('execCC' + i);
      const sig = pads['execPad' + i] ? pads['execPad' + i].getDataUrl() : null;
      const tieneAlgo = nombreEl.value.trim() || ccEl.value.trim() || sig;
      if (tieneAlgo) {
        if (!nombreEl.value.trim() || !ccEl.value.trim() || !sig) {
          missing.push({ msg: `Fila ${i} de ejecutantes incompleta (falta nombre, documento o firma)`, el: nombreEl });
        } else {
          execValid++;
        }
      }
    }
    if (execValid === 0) {
      missing.push({ msg: 'Debe registrarse al menos un ejecutante completo (nombre, documento y firma)', el: $('execSection') });
    }
    if (cfg.freeformYN && $('openPhase')) {
      const missingLabels = [];
      validateFreeformYN($('openPhase'), missingLabels);
      missingLabels.forEach((label) => missing.push({ msg: label, el: $('openPhase') }));
    }
    if (cfg.extraValidateOpen) cfg.extraValidateOpen(missing);
    return missing;
  }

  function validateCloseData() {
    const missing = [];
    const cierreFecha = $('cierreFecha'),
      cierreHora = $('cierreHora');
    const motivo = $('motivoCierre');
    if (!cierreFecha.value) missing.push({ msg: 'Fecha real del cierre', el: cierreFecha });
    if (!cierreHora.value) missing.push({ msg: 'Hora de cierre', el: cierreHora });
    if (!motivo.value) missing.push({ msg: 'Motivo del cierre', el: motivo });
    if (cfg.closeQuestions !== false) {
      ['q1', 'q2', 'q3', 'q4'].forEach((q, i) => {
        if (!document.querySelector(`input[name=${q}]:checked`)) {
          missing.push({ msg: `Respuesta a la pregunta ${i + 1} de cierre`, el: document.querySelector(`input[name=${q}]`) });
        }
      });
    }
    const signers = cfg.closeSigners || [
      { idPrefix: 'cierre1', padKey: 'padCierre1', label: 'Trabajador autorizado', combined: false },
      { idPrefix: 'cierre2', padKey: 'padCierre2', label: 'Supervisor SSTA', combined: false }
    ];
    signers.forEach((s) => {
      const sig = pads[s.padKey] ? pads[s.padKey].getDataUrl() : null;
      if (s.combined) {
        const el = $(s.idPrefix);
        if (!el || !el.value.trim() || !sig) missing.push({ msg: `Datos y/o firma de "${s.label}"`, el });
      } else {
        const nombreEl = $(s.idPrefix + 'nombre'),
          ccEl = $(s.idPrefix + 'cc');
        if (!nombreEl.value.trim() || !ccEl.value.trim() || !sig) {
          missing.push({ msg: `Datos y/o firma de "${s.label}"`, el: nombreEl });
        }
      }
    });
    return missing;
  }

  function showMissing(missing) {
    document.querySelectorAll('.field-invalid').forEach((el) => el.classList.remove('field-invalid'));
    const banner = $('validationBanner');
    banner.innerHTML = '<strong>Faltan los siguientes campos por diligenciar:</strong><ul>' + missing.map((m) => `<li>${m.msg}</li>`).join('') + '</ul>';
    banner.classList.add('show');
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    missing.forEach((m) => {
      if (!m.el) return;
      const target = m.el.type === 'radio' || m.el.type === 'checkbox' ? m.el.closest('.field') || m.el : m.el;
      target.classList.add('field-invalid');
    });
    scrollToEl(missing[0].el);
  }

  function hideValidationBanner() {
    const banner = $('validationBanner');
    banner.classList.remove('show');
    banner.innerHTML = '';
  }

  /* ================= DRAFTS ================= */
  function draftKeyOpen() {
    return 'indimon-draft-' + cfg.draftSlug + '-open';
  }

  function draftKeyClose(code) {
    return 'indimon-draft-' + cfg.draftSlug + '-close-' + code;
  }

  function checkForOpenDraft() {
    const draft = DraftStore.load(draftKeyOpen());
    const banner = $('draftBanner');
    if (!draft) {
      banner.classList.remove('show');
      return;
    }
    $('draftBannerText').textContent = `Hay un borrador sin guardar de un permiso de apertura (${formatSavedAt(draft.savedAt)}). Si sigues escribiendo aquí sin elegir una opción, ese borrador anterior se va a perder.`;
    banner.classList.add('show');
    $('draftRestoreBtn').onclick = () => {
      if (draft.data.permitCode) {
        permitCode = draft.data.permitCode;
        $('permitCodeDisplay').textContent = permitCode;
      }
      loadOpenDataIntoForm(draft.data);
      banner.classList.remove('show');
      $('footerStatus').textContent = 'Borrador restaurado. Continúe diligenciando y guarde cuando termine.';
    };
    $('draftDiscardBtn').onclick = () => {
      DraftStore.clear(draftKeyOpen());
      banner.classList.remove('show');
    };
  }

  function checkForCloseDraft(code) {
    const draft = DraftStore.load(draftKeyClose(code));
    const banner = $('draftBanner');
    if (!draft) {
      banner.classList.remove('show');
      return;
    }
    $('draftBannerText').textContent = `Hay un borrador sin guardar del cierre de este permiso (${formatSavedAt(draft.savedAt)}).`;
    banner.classList.add('show');
    $('draftRestoreBtn').onclick = () => {
      $('cierreFecha').value = draft.data.cierreFecha || '';
      $('cierreHora').value = draft.data.cierreHora || '';
      $('motivoCierre').value = draft.data.motivoCierre || '';
      ['q1', 'q2', 'q3', 'q4'].forEach((q) => {
        if (draft.data[q]) {
          const r = document.querySelector(`input[name=${q}][value="${draft.data[q]}"]`);
          if (r) r.checked = true;
        }
      });
      const signers = cfg.closeSigners || [
        { idPrefix: 'cierre1', padKey: 'padCierre1', field: 'cierre1', combined: false },
        { idPrefix: 'cierre2', padKey: 'padCierre2', field: 'cierre2', combined: false }
      ];
      signers.forEach((s) => {
        const d = draft.data[s.field] || {};
        if (s.combined) {
          if ($(s.idPrefix)) $(s.idPrefix).value = d.nombreCedula || '';
        } else {
          if ($(s.idPrefix + 'nombre')) $(s.idPrefix + 'nombre').value = d.nombre || '';
          if ($(s.idPrefix + 'cc')) $(s.idPrefix + 'cc').value = d.cc || '';
          if ($(s.idPrefix + 'cargo')) $(s.idPrefix + 'cargo').value = d.cargo || '';
        }
        if (pads[s.padKey] && d.sig) pads[s.padKey].setDataUrl(d.sig);
      });
      banner.classList.remove('show');
      $('footerStatus').textContent = 'Borrador de cierre restaurado. Continúe y guarde cuando termine.';
    };
    $('draftDiscardBtn').onclick = () => {
      DraftStore.clear(draftKeyClose(code));
      banner.classList.remove('show');
    };
  }

  /* ================= FLUJO DE PANTALLAS ================= */
  function goToApp() {
    $('landing').style.display = 'none';
    $('app').style.display = 'block';
    $('footerActions').style.display = 'flex';
  }

  function startNewPermit() {
    MODE = 'open';
    permitCode = genCode();
    firstSaveDone = false;
    goToApp();
    initRender();
    $('statusBanner').className = 'status-banner open';
    $('statusBannerText').textContent = 'Apertura de permiso en curso';
    $('permitCodeDisplay').textContent = permitCode;
    $('footerStatus').textContent = 'Diligencia toda la información y firma. Anota el código para el cierre.';
    $('mainActionBtn').textContent = 'Guardar apertura en la hoja';
    $('closeLockedMsg').classList.remove('hidden');
    $('closeFields').classList.add('hidden');
    checkForOpenDraft();
  }

  async function openCloseModeWithCode(code) {
    if (!code) return;
    const data = await fetchFromSheet(code);
    if (!data) return;
    MODE = 'close';
    goToApp();
    initRender();
    loadOpenDataIntoForm(data);
    lockOpenSections();
    $('statusBanner').className = data.status === 'CERRADO' ? 'status-banner closed' : 'status-banner open';
    $('statusBannerText').textContent = data.status === 'CERRADO' ? 'Permiso ya cerrado (modo consulta)' : 'Permiso abierto — completa el cierre';
    $('permitCodeDisplay').textContent = permitCode;
    $('closeLockedMsg').classList.add('hidden');
    $('closeFields').classList.remove('hidden');
    refreshPadsIn($('closeFields'));
    const closeTitle = $(cfg.closeSectionTitleId || 'titleSec7');
    if (closeTitle) closeTitle.classList.remove('locked');
    $('footerStatus').textContent = 'Revisa los datos de apertura (bloqueados) y diligencia la sección de cierre.';
    $('mainActionBtn').textContent = 'Guardar cierre en la hoja';
    if (data.status === 'CERRADO') {
      $('cierreFecha').value = data.cierreFecha || '';
      $('cierreHora').value = data.cierreHora || '';
      $('motivoCierre').value = data.motivoCierre || '';
      $('mainActionBtn').disabled = true;
    } else {
      checkForCloseDraft(permitCode);
    }
  }

  async function cargarParaAgregarPersonal(code) {
    if (!code) {
      alert('Escribe el código del permiso.');
      return;
    }
    const btn = $('loadAddPeopleBtn');
    btn.disabled = true;
    btn.textContent = 'Buscando…';
    const data = await fetchFromSheet(code);
    btn.disabled = false;
    btn.textContent = 'Cargar permiso y agregar personal';
    if (!data) return;
    if (data.status !== 'ABIERTO') {
      alert('Este permiso no está abierto actualmente (estado: ' + (data.status || 'desconocido') + '), no se puede agregar personal.');
      return;
    }
    addPeopleData = data;
    $('landing').style.display = 'none';
    $('app').style.display = 'block';
    $('app').classList.add('modo-agregar-personal');
    document.body.classList.add('modo-agregar-personal');
    $('statusBanner').className = 'status-banner open';
    $('statusBannerText').textContent = 'Permiso abierto — agregando personal sin cerrarlo';
    $('permitCodeDisplay').textContent = data.permitCode;
    execCounter = 0;
    execBody.innerHTML = '';
    (data.ejecutantes || []).forEach((row) => addExecRow(row));
    baseExecCount = execCounter;
    opIdAddWorkers = null;
    addExecRow();
    setTimeout(() => {
      refreshPadsIn(execBody);
      applyPendingExecSignatures();
    }, 150);
    $('addPeopleStatus').textContent = '';
  }

  function renderClosedPermits(rows) {
    const listEl = $('closedList');
    if (rows.length === 0) {
      listEl.innerHTML = '<em>No hay permisos cerrados aún.</em>';
      return;
    }
    listEl.innerHTML = '';
    rows
      .slice()
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .forEach((r) => {
        const div = document.createElement('div');
        div.style.cssText = 'padding:8px 10px;border:1px solid var(--line);border-radius:6px;margin-bottom:6px;background:#f7f6f2;';
        const updTxt = r.updatedAt
          ? new Date(r.updatedAt).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '—';
        div.innerHTML = `<b>${esc(r.permitCode)}</b> <span style="color:var(--ok);float:right;font-weight:700;">CERRADO</span>
          <div style="margin-top:3px;color:var(--steel);">Responsable: ${r.responsable ? esc(r.responsable) : '<em>sin dato</em>'}</div>
          ${r.sitio ? `<div style="color:var(--muted);font-size:11.5px;">Sitio: ${esc(r.sitio)}</div>` : ''}
          <div style="color:var(--muted);font-size:11.5px;">Actualizado: ${updTxt}</div>`;
        listEl.appendChild(div);
      });
  }

  function renderOpenList(container, rows, onPick) {
    if (rows.length === 0) {
      container.innerHTML = '<em>No hay permisos abiertos.</em>';
      return;
    }
    container.innerHTML = '';
    rows.forEach((r) => {
      const div = document.createElement('div');
      div.style.cssText = 'padding:8px 10px;border:1px solid var(--line);border-radius:6px;margin-bottom:6px;cursor:pointer;background:#fff;';
      div.innerHTML = `<b>${esc(r.permitCode)}</b> <span style="color:var(--muted);float:right;">${r.status}</span>
        <div style="margin-top:3px;color:var(--steel);">Abierto por: ${r.responsable ? esc(r.responsable) : '<em>sin dato</em>'}</div>
        ${r.sitio ? `<div style="color:var(--muted);font-size:11.5px;">Sitio: ${esc(r.sitio)}</div>` : ''}`;
      div.addEventListener('click', () => onPick(r.permitCode));
      container.appendChild(div);
    });
  }

  /* ================= WIRING ================= */
  function wireEvents() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-clear]');
      if (!btn) return;
      if (locked && !btn.closest('#closeFields')) return;
      const id = btn.dataset.clear;
      if (pads[id]) pads[id].clear();
    });
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-undo]');
      if (!btn) return;
      if (locked && !btn.closest('#closeFields')) return;
      const id = btn.dataset.undo;
      if (pads[id]) pads[id].undo();
    });

    const addRowBtn = $(cfg.addRowBtnId || 'addRowBtn');
    if (addRowBtn) addRowBtn.addEventListener('click', () => { if (!locked) addExecRow(); });

    $('app').addEventListener(
      'blur',
      (e) => {
        const el = e.target;
        if (!el.classList || !el.classList.contains('field-invalid')) return;
        if ((el.value || '').trim()) el.classList.remove('field-invalid');
      },
      true
    );
    $('app').addEventListener('input', (e) => {
      const el = e.target;
      if (el.classList && el.classList.contains('field-invalid') && (el.value || '').trim()) el.classList.remove('field-invalid');
    });
    $('app').addEventListener('click', () => {
      (cfg.checklistGroups || []).forEach((g) => {
        const cont = $(g.containerId);
        if (!cont || !cont.classList.contains('field-invalid')) return;
        if (Object.values(states[g.stateKey] || {}).every((v) => v !== null)) cont.classList.remove('field-invalid');
      });
      document.querySelectorAll('input[name=q1],input[name=q2],input[name=q3],input[name=q4]').forEach((r) => {
        if (r.checked) r.closest('.field')?.classList.remove('field-invalid');
      });
    });

    $('cardNew').addEventListener('click', startNewPermit);
    $('loadCodeBtn').addEventListener('click', () => {
      const code = $('codeInput').value.trim();
      if (!code) {
        alert('Escribe el código del permiso.');
        return;
      }
      openCloseModeWithCode(code);
    });

    $('loadAddPeopleBtn').addEventListener('click', () => {
      cargarParaAgregarPersonal($('addPeopleCodeInput').value.trim());
    });
    $('listOpenForAddBtn').addEventListener('click', async () => {
      const listEl = $('openListForAdd');
      listEl.innerHTML = 'Buscando…';
      const rows = await fetchOpenList();
      renderOpenList(listEl, rows, (code) => cargarParaAgregarPersonal(code));
    });
    $('backFromAddPeopleBtn').addEventListener('click', () => {
      $('app').classList.remove('modo-agregar-personal');
      document.body.classList.remove('modo-agregar-personal');
      $('app').style.display = 'none';
      $('landing').style.display = 'block';
      $('addPeopleCodeInput').value = '';
    });
    $('saveAddPeopleBtn').addEventListener('click', async () => {
      if (!addPeopleData) return;
      const statusEl = $('addPeopleStatus');
      const btn = $('saveAddPeopleBtn');
      btn.disabled = true;
      statusEl.textContent = 'Guardando…';
      const todasLasFilas = collectExecRows();
      const filasNuevas = todasLasFilas.slice(baseExecCount);
      if (!opIdAddWorkers) opIdAddWorkers = addPeopleData.permitCode + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const payload = { action: 'addWorkers', permitCode: addPeopleData.permitCode, newWorkers: filasNuevas, opId: opIdAddWorkers, token: PORTAL_CONFIG.API_TOKEN };
      let res;
      try {
        const r = await fetchWithRetry(getWebAppUrl(), { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        res = await r.json();
      } catch (err) {
        res = { ok: false, error: 'No se pudo conectar con el backend. Verifique su conexión e intente de nuevo.' };
      }
      btn.disabled = false;
      if (res.ok) {
        const nombres = todasLasFilas.filter((f) => f.nombre && f.nombre.trim()).length;
        statusEl.textContent = '✓ Guardado — ' + new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        $('backFromAddPeopleBtn').style.cssText = 'background:var(--ok,#1d7a4c);color:#fff;border-color:var(--ok,#1d7a4c);font-weight:700;';
        baseExecCount = todasLasFilas.length;
        opIdAddWorkers = null;
        alert(
          `✓ Personal guardado correctamente.\n\nEste permiso ahora tiene ${nombres} ejecutante(s) registrado(s) en total.\n\nPuedes seguir agregando más gente, o tocar "Volver al inicio" cuando termines.`
        );
      } else {
        statusEl.textContent = res.error || 'No se pudo guardar. Verifique su conexión e intente de nuevo.';
        alert('No se pudo guardar: ' + (res.error || 'verifique su conexión e intente de nuevo.'));
      }
    });

    $('listOpenBtn').addEventListener('click', async () => {
      const listEl = $('openList');
      listEl.innerHTML = 'Buscando…';
      const rows = await fetchOpenList();
      renderOpenList(listEl, rows, (code) => openCloseModeWithCode(code));
    });
    $('listClosedBtn').addEventListener('click', async () => {
      const panel = $('historyPanel');
      const listEl = $('closedList');
      const opening = panel.style.display === 'none';
      panel.style.display = opening ? 'block' : 'none';
      if (!opening) return;
      listEl.innerHTML = 'Buscando…';
      closedPermitsCache = await fetchClosedList();
      renderClosedPermits(closedPermitsCache);
    });
    $('historySearch').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        renderClosedPermits(closedPermitsCache);
        return;
      }
      renderClosedPermits(closedPermitsCache.filter((r) => (r.permitCode || '').toLowerCase().includes(q) || (r.responsable || '').toLowerCase().includes(q)));
    });

    $('mainActionBtn').addEventListener('click', async () => {
      const btn = $('mainActionBtn');
      hideValidationBanner();
      if (MODE === 'open') {
        const missing = validateOpenData();
        if (missing.length > 0) {
          showMissing(missing);
          return;
        }
      } else if (MODE === 'close') {
        const missing = validateCloseData();
        if (missing.length > 0) {
          showMissing(missing);
          return;
        }
      }
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'Guardando…';
      if (MODE === 'open') {
        const data = collectOpenData();
        data.firstSave = !firstSaveDone;
        let res = await sendToSheet(data);
        let intentosColision = 0;
        while (res.error === 'CODE_COLLISION' && intentosColision < 3) {
          intentosColision++;
          permitCode = genCode();
          $('permitCodeDisplay').textContent = permitCode;
          data.permitCode = permitCode;
          res = await sendToSheet(data);
        }
        if (res.ok) {
          firstSaveDone = true;
          lockOpenSections();
          $('statusBanner').className = 'status-banner open';
          $('statusBannerText').textContent = 'Permiso guardado en la hoja ✓ — comparte el código con quien hará el cierre';
          $('footerStatus').textContent = 'Código del permiso: ' + permitCode;
          DraftStore.clear(draftKeyOpen());
        } else {
          btn.disabled = false;
          if (typeof Outbox !== 'undefined') {
            try {
              await Outbox.add(getWebAppUrl(), Object.assign({}, data, { token: PORTAL_CONFIG.API_TOKEN }));
              $('footerStatus').textContent = res.error || 'Sin conexión — quedó guardado y se reintentará solo. Verás un aviso abajo mientras esté pendiente.';
            } catch (e) {
              $('footerStatus').textContent = 'No se pudo guardar ni en el servidor ni localmente (memoria llena o modo privado). Copie los datos de este permiso antes de salir de la página.';
            }
          } else {
            $('footerStatus').textContent = res.error || 'Sin conexión — quedó guardado y se reintentará solo. Verás un aviso abajo mientras esté pendiente.';
          }
        }
      } else if (MODE === 'close') {
        const openData = collectOpenData();
        const closeData = collectCloseData();
        const full = Object.assign({}, openData, { status: 'CERRADO' }, closeData);
        const res = await sendToSheet(full);
        if (res.ok) {
          $('statusBanner').className = 'status-banner closed';
          $('statusBannerText').textContent = 'Permiso cerrado y guardado en la hoja ✓';
          $('footerStatus').textContent = 'El registro quedó actualizado en Google Sheets.';
          DraftStore.clear(draftKeyClose(permitCode));
        } else {
          btn.disabled = false;
          if (typeof Outbox !== 'undefined') {
            try {
              await Outbox.add(getWebAppUrl(), Object.assign({}, full, { token: PORTAL_CONFIG.API_TOKEN }));
              $('footerStatus').textContent = res.error || 'Sin conexión — quedó guardado y se reintentará solo. Verás un aviso abajo mientras esté pendiente.';
            } catch (e) {
              $('footerStatus').textContent = 'No se pudo guardar ni en el servidor ni localmente (memoria llena o modo privado). Copie los datos de este permiso antes de salir de la página.';
            }
          } else {
            $('footerStatus').textContent = res.error || 'Sin conexión — quedó guardado y se reintentará solo. Verás un aviso abajo mientras esté pendiente.';
          }
        }
      }
      btn.textContent = originalText;
    });

    $('app').addEventListener('input', () => {
      if (MODE === 'open') {
        saveOpenDraftDebounced();
      } else if (MODE === 'close') {
        saveCloseDraftDebounced();
      }
    });
    ['change', 'click', 'mouseup', 'touchend'].forEach((evt) => {
      $('app').addEventListener(evt, () => {
        if (MODE === 'open') {
          saveOpenDraftDebounced();
        } else if (MODE === 'close') {
          saveCloseDraftDebounced();
        }
      });
    });

    $('printBtn').addEventListener('click', () => window.print());
    $('backToStartBtn').addEventListener('click', () => {
      $('footerActions').style.display = 'none';
      location.href = 'index.html';
    });

    const codeFromUrl = new URLSearchParams(location.search).get('code');
    if (codeFromUrl) {
      $('codeInput').value = codeFromUrl;
      openCloseModeWithCode(codeFromUrl);
    }

    window.addEventListener('load', () => {
      if (typeof UpdateManager !== 'undefined') UpdateManager.init();
      if (typeof Outbox !== 'undefined') Outbox.flush();
    });
  }

  let saveOpenDraftDebounced = null;
  let saveCloseDraftDebounced = null;

  /* ================= INIT ================= */
  function init(userCfg) {
    cfg = userCfg;
    execBody = $('execBody');
    OfflineBanner.init();
    OutboxBadge.init();
    if (typeof ScrollProgress !== 'undefined' && cfg.themeColor) ScrollProgress.init(cfg.themeColor);
    cargarPersonalCompartido();
    saveOpenDraftDebounced = debounce(() => {
      if (MODE !== 'open') return;
      DraftStore.save(draftKeyOpen(), collectOpenData());
    }, 1200);
    saveCloseDraftDebounced = debounce(() => {
      if (MODE !== 'close') return;
      DraftStore.save(draftKeyClose(permitCode), collectCloseData());
    }, 1200);
    wireEvents();
  }

  return {
    TOGGLE_2STATE,
    TOGGLE_3STATE,
    init,
    getMode: () => MODE,
    getPermitCode: () => permitCode,
    isLocked: () => locked,
    getState: (key) => states[key],
    setupPad,
    refreshPadsIn,
    attachPersonalAutocomplete,
    renderToggleGroup,
    updateProgress,
    applyToggleState,
    downloadJson,
    getWebAppUrl,
    sendToSheet,
    fetchFromSheet,
    // ===== EXPONER PADS PARA DEPURACIÓN (sin romper nada) =====
    getPads: () => pads
  };
})();
