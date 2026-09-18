/* ============================================================================
   controls.js — the panel

   Reads and writes STATE, then calls back. Three kinds of change, kept apart
   because they cost wildly different amounts:

     live   — a uniform write, lands next frame (colour, size, cursor)
     band   — rebuild the band only if the text or tile count changed
     count  — reallocate the point buffers
   ========================================================================= */

import { TARGETS, PALETTES, COLOR_MODES, EFFECTS, ON_TRANSFORM, STATE } from './config.js';

const $ = (id) => document.getElementById(id);

export function initControls({ onTarget, onCount, onLive, onBand, onAction, onExport }) {
  /* ---- target chips ---------------------------------------------------- */
  const targetRow = $('target-row');
  TARGETS.forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'select-chip' + (t.id === STATE.target ? ' active' : '');
    b.textContent = t.label;
    b.dataset.target = t.id;
    b.setAttribute('aria-pressed', String(t.id === STATE.target));
    b.addEventListener('click', () => selectTarget(t.id));
    targetRow.appendChild(b);
  });

  function selectTarget(id) {
    STATE.target = id;
    [...targetRow.children].forEach((c) => {
      const on = c.dataset.target === id;
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', String(on));
    });
    onTarget();
  }

  /* ---- text: two independent strings ----------------------------------
     What the POINTS spell and what the BAND says are different jobs, so they
     get different fields. Both are debounced: every keystroke would otherwise
     re-rasterise a texture and re-sample glyph coverage. */
  bindText('c-cloudtext', 'cloudText', () => onTarget());
  bindText('c-bandtext', 'bandText', () => onBand());

  function bindText(id, key, cb) {
    const el = $(id);
    el.value = STATE[key];
    el.addEventListener('input', debounce(() => { STATE[key] = el.value; cb(); }, 300));
  }

  /* ---- font upload ------------------------------------------------------
     Registered as a FontFace straight from the file's bytes. Nothing leaves
     the browser, and both the band and the point-sampled text pick it up. */
  const fontInput = $('c-font');
  const fontLabel = $('v-font');
  fontInput?.addEventListener('change', async () => {
    const file = fontInput.files?.[0];
    if (!file) return;
    fontLabel.textContent = 'loading…';
    try {
      const face = new FontFace(`user-${Date.now()}`, await file.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      STATE.fontName = face.family;
      fontLabel.textContent = file.name.replace(/\.[^.]+$/, '').slice(0, 22);
      onBand();
      onTarget();
    } catch (err) {
      // A font the browser can't parse is a normal thing for someone to try.
      console.warn('[font] could not load', err);
      fontLabel.textContent = 'unreadable file';
    }
  });

  /* ---- band on/off ----------------------------------------------------- */
  const bandRow = $('bandon-row');
  [['On', true], ['Off', false]].forEach(([label, val]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'select-chip' + (STATE.bandOn === val ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', () => {
      STATE.bandOn = val;
      [...bandRow.children].forEach((c) => c.classList.toggle('active', c.textContent === label));
      onBand();
    });
    bandRow.appendChild(b);
  });

  /* ---- small chip-row helper ------------------------------------------- */
  function chipRow(rowId, items, getVal, setVal, cb) {
    const row = $(rowId);
    if (!row) return () => {};
    items.forEach((it) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = it.label;
      b.dataset.val = String(it.id);
      b.className = 'select-chip' + (String(it.id) === String(getVal()) ? ' active' : '');
      b.addEventListener('click', () => { setVal(it.id); sync(); cb(); });
      row.appendChild(b);
    });
    function sync() {
      [...row.children].forEach((c) => c.classList.toggle('active', c.dataset.val === String(getVal())));
    }
    return sync;
  }

  /* ---- repeat mode ------------------------------------------------------ */
  const syncAuto = chipRow('bandauto-row',
    [{ id: true, label: 'Auto' }, { id: false, label: 'Manual' }],
    () => STATE.bandAuto, (v) => { STATE.bandAuto = v; }, () => { updateRepeatUI(); onBand(); });

  /* ---- what the band does on transform ---------------------------------- */
  chipRow('ontransform-row', ON_TRANSFORM,
    () => STATE.bandOnTransform, (v) => { STATE.bandOnTransform = v; }, onLive);

  /* ---- band effect ----------------------------------------------------- */
  const fxRow = $('effect-row');
  EFFECTS.forEach((e) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'select-chip' + (e.id === STATE.bandEffect ? ' active' : '');
    b.textContent = e.label;
    b.addEventListener('click', () => {
      STATE.bandEffect = e.id;
      [...fxRow.children].forEach((c, i) => c.classList.toggle('active', EFFECTS[i].id === e.id));
      onBand();
    });
    fxRow.appendChild(b);
  });

  const bandColEl = $('c-bandcol');
  bandColEl.value = STATE.bandColor;
  bandColEl.addEventListener('input', () => { STATE.bandColor = bandColEl.value; onBand(); });

  /* ---- sliders --------------------------------------------------------- */
  const sliders = [
    //  input       value out    state key       formatter                          cb        int?  debounce
    ['c-morph',   'v-morph',   'morphTime',    (v) => v.toFixed(2) + ' s',        onLive],
    ['c-scatter', 'v-scatter', 'scatter',      (v) => v.toFixed(1),               onLive],
    ['c-stagger', 'v-stagger', 'stagger',      (v) => v.toFixed(2),               onLive],
    ['c-tsize',   'v-tsize',   'textSize',     (v) => v.toFixed(2) + '\u00d7',    onTarget, false, 180],
    ['c-tdepth',  'v-tdepth',  'textDepth',    (v) => v.toFixed(2),               onTarget, false, 180],
    ['c-tilta',   'v-tilta',   'tiltAmount',   (v) => v.toFixed(2),               onLive],
    ['c-tilts',   'v-tilts',   'tiltSpeed',    (v) => v.toFixed(2),               onLive],

    ['c-bandd',   'v-bandd',   'bandDiameter', (v) => v.toFixed(1),               onBand],
    ['c-bandh',   'v-bandh',   'bandHeight',   (v) => v.toFixed(2),               onBand],
    ['c-bandr',   'v-bandr',   'bandRepeats',    (v) => String(v),                onBand, true, 150],
    ['c-bandls',  'v-bandls',  'bandLetterSize', (v) => v.toFixed(2) + '\u00d7',   onBand],
    ['c-bandt',   'v-bandt',   'bandTilt',     (v) => v.toFixed(0) + '°',    onBand],
    ['c-bands',   'v-bands',   'bandSpeed',    (v) => v.toFixed(2),               onLive],
    ['c-bandfx',  'v-bandfx',  'bandStrength', (v) => v.toFixed(2),               onBand],

    ['c-bandd2',   'v-bandd2',   'bandDiameterOn', (v) => v.toFixed(1),            onLive],
    ['c-bandh2',   'v-bandh2',   'bandHeightOn',   (v) => v.toFixed(2),            onLive],
    ['c-bandt2',   'v-bandt2',   'bandTiltOn',     (v) => v.toFixed(0) + '\u00b0', onLive],
    ['c-bandlift', 'v-bandlift', 'bandLift',       (v) => v.toFixed(1),            onLive],

    ['c-count',   'v-count',   'count',        (v) => v.toLocaleString(),         onCount, true, 220],
    ['c-size',    'v-size',    'size',         (v) => v.toFixed(1) + ' px',       onLive],
    ['c-scale',   'v-scale',   'scale',        (v) => v.toFixed(2) + '×',    onLive],
    ['c-thick',   'v-thick',   'thickness',    (v) => v.toFixed(2),               onTarget, false, 180],
    ['c-drift',   'v-drift',   'drift',        (v) => v.toFixed(2),               onLive],

    ['c-zoom',    'v-zoom',    'zoom',         (v) => v.toFixed(1),               onLive],
    ['c-zoomon',  'v-zoomon',  'zoomOn',       (v) => v.toFixed(1),               onLive],
    ['c-breathe', 'v-breathe', 'breathe',      (v) => v.toFixed(2),               onLive],
    ['c-breaths', 'v-breaths', 'breatheSpeed', (v) => v.toFixed(2),               onLive],

    ['c-force',   'v-force',   'force',        (v) => v.toFixed(2),               onLive],
    ['c-radius',  'v-radius',  'radius',       (v) => v.toFixed(2),               onLive],
    ['c-glow',    'v-glow',    'glow',         (v) => v.toFixed(2),               onLive],
  ];

  for (const [inputId, valueId, key, fmt, cb, isInt, debounceMs] of sliders) {
    const el = $(inputId), out = $(valueId);
    el.value = STATE[key];
    out.textContent = fmt(STATE[key]);
    /* The readout tracks the thumb on every event; the work behind it is
       debounced only where it rebuilds something. */
    const fire = debounceMs ? debounce(cb, debounceMs) : cb;
    el.addEventListener('input', () => {
      STATE[key] = isInt ? parseInt(el.value, 10) : parseFloat(el.value);
      out.textContent = fmt(STATE[key]);
      fire();
    });
  }

  /* In auto mode the slider is inert and the readout shows what the geometry
     actually resolved to, which is the number people want to see. */
  let repeatProbe = () => STATE.bandRepeats;
  function updateRepeatUI() {
    const auto = STATE.bandAuto;
    $('c-bandr').disabled = auto;
    $('c-bandr').parentElement.classList.toggle('is-muted', auto);
    $('lettersize-field').style.display = auto ? '' : 'none';
    $('note-bandr').textContent = auto
      ? 'Auto derives the count from the circumference, so letters keep their proportions as the diameter changes.'
      : 'Fixed count. Letters stretch or squeeze as the diameter changes.';
    $('v-bandr').textContent = String(repeatProbe());
  }
  updateRepeatUI();
  syncAuto();

  /* ---- palette --------------------------------------------------------- */
  const palRow = $('palette-row');
  PALETTES.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'color-swatch' + (p.id === STATE.palette ? ' active' : '');
    b.title = p.label;
    b.setAttribute('aria-label', p.label);
    b.style.background = `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]} 50%, ${p.colors[2]})`;
    b.addEventListener('click', () => {
      STATE.palette = p.id;
      STATE.colors = [...p.colors];
      [...palRow.children].forEach((c) => c.classList.toggle('active', c.title === p.label));
      syncColors();
      onLive();
    });
    palRow.appendChild(b);
  });

  const colInputs = [$('c-col1'), $('c-col2'), $('c-col3')];
  colInputs.forEach((el, i) => el.addEventListener('input', () => {
    STATE.colors[i] = el.value;
    STATE.palette = 'custom';
    [...palRow.children].forEach((c) => c.classList.remove('active'));
    onLive();
  }));
  const bgEl = $('c-bg');
  bgEl.addEventListener('input', () => { STATE.background = bgEl.value; onLive(); });

  function syncColors() {
    colInputs.forEach((el, i) => { el.value = STATE.colors[i]; });
    bgEl.value = STATE.background;
  }
  syncColors();

  /* ---- gradient source ------------------------------------------------- */
  const modeRow = $('colormode-row');
  COLOR_MODES.forEach((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'select-chip' + (m.id === STATE.colorMode ? ' active' : '');
    b.textContent = m.label;
    b.addEventListener('click', () => {
      STATE.colorMode = m.id;
      [...modeRow.children].forEach((c, i) => c.classList.toggle('active', COLOR_MODES[i].id === m.id));
      onLive();
    });
    modeRow.appendChild(b);
  });

  /* ---- stage actions --------------------------------------------------- */
  const transformBtn = $('act-transform');
  transformBtn.addEventListener('click', () => onAction('transform'));
  $('act-random').addEventListener('click', () => { randomise(); onAction('randomise'); });

  const pauseBtn = $('act-pause');
  pauseBtn.addEventListener('click', () => {
    STATE.paused = !STATE.paused;
    pauseBtn.textContent = STATE.paused ? 'Play' : 'Pause';
    pauseBtn.setAttribute('aria-pressed', String(STATE.paused));
    onLive();
  });

  function setTransformLabel(transformed) {
    transformBtn.innerHTML = `<span class="dot"></span>${transformed ? 'Release' : 'Transform'}`;
  }

  function randomise() {
    const pick = (a) => a[(Math.random() * a.length) | 0];
    selectTarget(pick(TARGETS.filter((t) => t.id !== STATE.target)).id);
    const p = pick(PALETTES);
    STATE.palette = p.id; STATE.colors = [...p.colors];
    [...palRow.children].forEach((c) => c.classList.toggle('active', c.title === p.label));
    syncColors();
    STATE.colorMode = pick(COLOR_MODES).id;
    [...modeRow.children].forEach((c, i) => c.classList.toggle('active', COLOR_MODES[i].id === STATE.colorMode));
    STATE.bandEffect = pick(EFFECTS).id;
    [...fxRow.children].forEach((c, i) => c.classList.toggle('active', EFFECTS[i].id === STATE.bandEffect));
    onBand();
    onLive();
  }

  /* ---- export modal ---------------------------------------------------- */
  const modal = $('export-modal');
  let fmt = 'png', scale = 1;
  const open = () => { modal.hidden = false; $('code-out').textContent = settingsJson(); };
  const close = () => { modal.hidden = true; };

  $('open-export').addEventListener('click', open);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

  modal.querySelectorAll('.modal-tab').forEach((tab) => tab.addEventListener('click', () => {
    modal.querySelectorAll('.modal-tab').forEach((t) => t.classList.toggle('active', t === tab));
    modal.querySelectorAll('.modal-pane').forEach((p) => { p.hidden = p.dataset.pane !== tab.dataset.tab; });
  }));

  $('fmt-row').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fmt]'); if (!b) return;
    fmt = b.dataset.fmt;
    [...e.currentTarget.children].forEach((c) => c.classList.toggle('active', c === b));
    $('do-export').textContent = 'Export ' + fmt.toUpperCase();
  });
  $('scale-row').addEventListener('click', (e) => {
    const b = e.target.closest('[data-scale]'); if (!b) return;
    scale = parseInt(b.dataset.scale, 10);
    [...e.currentTarget.children].forEach((c) => c.classList.toggle('active', c === b));
  });
  $('do-export').addEventListener('click', () => { onExport(fmt, scale); close(); });
  $('do-copy').addEventListener('click', async () => {
    const btn = $('do-copy');
    try {
      await navigator.clipboard.writeText(settingsJson());
      btn.textContent = 'Copied';
    } catch {
      // Clipboard is blocked in plenty of contexts; select it instead of
      // failing silently.
      const r = document.createRange();
      r.selectNodeContents($('code-out'));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      btn.textContent = 'Selected — press ⌘C';
    }
    setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
  });

  function settingsJson() {
    const { paused, transformed, ...rest } = STATE;
    return JSON.stringify(rest, null, 2);
  }

  /* The wheel writes STATE.zoom directly, so the slider has to be told. */
  function syncZoom() {
    const el = $('c-zoom'), out = $('v-zoom');
    if (!el) return;
    el.value = STATE.zoom;
    out.textContent = STATE.zoom.toFixed(1);
  }

  return {
    setTransformLabel,
    syncZoom,
    /* main wires the live repeat count in so the readout can show it. */
    setRepeatProbe(fn) { repeatProbe = fn; updateRepeatUI(); },
    updateRepeatUI,
  };
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
