/* ============================================================================
   controls.js — the panel

   Reads and writes STATE, then calls back. The split that matters:

     live  — a uniform write, lands on the next frame (colour, size, motion)
     shape — regenerate targets and morph
     count — rebuild the buffers

   Keeping those three apart is why dragging a colour slider is instant while
   dragging the point count isn't expected to be.
   ========================================================================= */

import { SHAPES, PALETTES, COLOR_MODES, STATE } from './config.js';

const $ = (id) => document.getElementById(id);

export function initControls({ onShape, onCount, onLive, onAction, onExport }) {
  /* ---- chips: shape ---------------------------------------------------- */
  const shapeRow = $('shape-row');
  SHAPES.forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'select-chip' + (s.id === STATE.shape ? ' active' : '');
    b.textContent = s.label;
    b.dataset.shape = s.id;
    b.setAttribute('aria-pressed', String(s.id === STATE.shape));
    b.addEventListener('click', () => selectShape(s.id));
    shapeRow.appendChild(b);
  });

  function selectShape(id) {
    STATE.shape = id;
    [...shapeRow.children].forEach((c) => {
      const on = c.dataset.shape === id;
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', String(on));
    });
    // The text box only does anything for the text shape; dim it otherwise
    // rather than hiding it, so the panel doesn't reflow on every click.
    $('text-field').classList.toggle('is-disabled', id !== 'text');
    onShape();
  }
  $('text-field').classList.toggle('is-disabled', STATE.shape !== 'text');

  /* ---- text ------------------------------------------------------------ */
  const textEl = $('c-text');
  textEl.value = STATE.text;
  textEl.addEventListener('input', debounce(() => {
    STATE.text = textEl.value;
    if (STATE.shape === 'text') onShape();
  }, 260));

  /* ---- sliders --------------------------------------------------------- */
  const sliders = [
    //  input      value out     state key    formatter                     callback  int?  debounce
    ['c-count',   'v-count',   'count',     (v) => v.toLocaleString(),    onCount,  true,  220],
    ['c-size',    'v-size',    'size',      (v) => v.toFixed(1) + ' px',  onLive],
    ['c-scale',   'v-scale',   'scale',     (v) => v.toFixed(2) + '\u00d7', onLive],
    ['c-thick',   'v-thick',   'thickness', (v) => v.toFixed(2),          onShape,  false, 180],
    ['c-spin',    'v-spin',    'spin',      (v) => v.toFixed(2),          onLive],
    ['c-drift',   'v-drift',   'drift',     (v) => v.toFixed(2),          onLive],
    ['c-morph',   'v-morph',   'morphTime', (v) => v.toFixed(2) + ' s',   onLive],
    ['c-scatter', 'v-scatter', 'scatter',   (v) => v.toFixed(1),          onLive],
    ['c-stagger', 'v-stagger', 'stagger',   (v) => v.toFixed(2),          onLive],
    ['c-force',   'v-force',   'force',     (v) => v.toFixed(2),          onLive],
    ['c-radius',  'v-radius',  'radius',    (v) => v.toFixed(2),          onLive],
    ['c-glow',    'v-glow',    'glow',      (v) => v.toFixed(2),          onLive],
  ];

  for (const [inputId, valueId, key, fmt, cb, isInt, debounceMs] of sliders) {
    const el = $(inputId), out = $(valueId);
    el.value = STATE[key];
    out.textContent = fmt(STATE[key]);
    /* The readout updates on every input event so the number tracks the
       thumb. The work behind it is debounced only where it rebuilds
       something — dragging the point count through 40 values would
       otherwise reallocate 40 sets of buffers. */
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
      syncColorInputs();
      onLive();
    });
    palRow.appendChild(b);
  });

  const colInputs = [$('c-col1'), $('c-col2'), $('c-col3')];
  colInputs.forEach((el, i) => {
    el.addEventListener('input', () => {
      STATE.colors[i] = el.value;
      STATE.palette = 'custom';
      [...palRow.children].forEach((c) => c.classList.remove('active'));
      onLive();
    });
  });
  const bgEl = $('c-bg');
  bgEl.addEventListener('input', () => { STATE.background = bgEl.value; onLive(); });

  function syncColorInputs() {
    colInputs.forEach((el, i) => { el.value = STATE.colors[i]; });
    bgEl.value = STATE.background;
  }
  syncColorInputs();

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
  $('act-reform').addEventListener('click', () => onAction('reform'));
  $('act-random').addEventListener('click', () => { randomise(); onAction('randomise'); });

  const pauseBtn = $('act-pause');
  pauseBtn.addEventListener('click', () => {
    STATE.paused = !STATE.paused;
    pauseBtn.textContent = STATE.paused ? 'Play' : 'Pause';
    pauseBtn.setAttribute('aria-pressed', String(STATE.paused));
    onLive();
  });

  function randomise() {
    const pick = (a) => a[(Math.random() * a.length) | 0];
    const other = SHAPES.filter((s) => s.id !== STATE.shape && s.id !== 'text');
    selectShape(pick(other).id);
    const p = pick(PALETTES);
    STATE.palette = p.id; STATE.colors = [...p.colors];
    [...palRow.children].forEach((c) => c.classList.toggle('active', c.title === p.label));
    syncColorInputs();
    STATE.colorMode = pick(COLOR_MODES).id;
    [...modeRow.children].forEach((c, i) => c.classList.toggle('active', COLOR_MODES[i].id === STATE.colorMode));
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

  modal.querySelectorAll('.modal-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      modal.querySelectorAll('.modal-tab').forEach((t) => t.classList.toggle('active', t === tab));
      modal.querySelectorAll('.modal-pane').forEach((p) => { p.hidden = p.dataset.pane !== tab.dataset.tab; });
    });
  });

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
      // Clipboard is blocked in plenty of contexts; select the text instead
      // of failing silently.
      const r = document.createRange();
      r.selectNodeContents($('code-out'));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      btn.textContent = 'Selected — press ⌘C';
    }
    setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
  });

  function settingsJson() {
    const { paused, ...rest } = STATE;
    return JSON.stringify(rest, null, 2);
  }

  return { selectShape };
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
