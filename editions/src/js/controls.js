/* ============================================================================
   controls.js — the panel

   Reads and writes STATE, then calls back. Three kinds of change, kept apart
   because they cost wildly different amounts:

     live   — a uniform write, lands next frame (colour, size, cursor)
     band   — rebuild the band only if the text or tile count changed
     count  — reallocate the point buffers
   ========================================================================= */

import { TARGETS, PALETTES, COLOR_MODES, STATE } from './config.js';

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

  /* ---- text ------------------------------------------------------------ */
  const textEl = $('c-text');
  textEl.value = STATE.text;
  // Debounced: every keystroke would otherwise re-rasterise the band texture
  // and re-sample the glyph coverage for the point target.
  textEl.addEventListener('input', debounce(() => {
    STATE.text = textEl.value;
    onBand();
    onTarget();
  }, 300));

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

  /* ---- sliders --------------------------------------------------------- */
  const sliders = [
    //  input       value out    state key       formatter                          cb        int?  debounce
    ['c-morph',   'v-morph',   'morphTime',    (v) => v.toFixed(2) + ' s',        onLive],
    ['c-scatter', 'v-scatter', 'scatter',      (v) => v.toFixed(1),               onLive],
    ['c-stagger', 'v-stagger', 'stagger',      (v) => v.toFixed(2),               onLive],

    ['c-bandd',   'v-bandd',   'bandDiameter', (v) => v.toFixed(1),               onBand],
    ['c-bandh',   'v-bandh',   'bandHeight',   (v) => v.toFixed(2),               onBand],
    ['c-bandr',   'v-bandr',   'bandRepeats',  (v) => String(v),                  onBand, true, 150],
    ['c-bandt',   'v-bandt',   'bandTilt',     (v) => v.toFixed(0) + '°',    onBand],
    ['c-bands',   'v-bands',   'bandSpeed',    (v) => v.toFixed(2),               onLive],

    ['c-count',   'v-count',   'count',        (v) => v.toLocaleString(),         onCount, true, 220],
    ['c-size',    'v-size',    'size',         (v) => v.toFixed(1) + ' px',       onLive],
    ['c-scale',   'v-scale',   'scale',        (v) => v.toFixed(2) + '×',    onLive],
    ['c-thick',   'v-thick',   'thickness',    (v) => v.toFixed(2),               onTarget, false, 180],
    ['c-drift',   'v-drift',   'drift',        (v) => v.toFixed(2),               onLive],

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

  return { setTransformLabel };
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
