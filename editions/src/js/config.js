/* ============================================================================
   config.js — defaults and option lists

   The panel writes into STATE. Everything else reads it.
   ========================================================================= */

/* What the cloud can become when you fire the transformation. `text` makes
   the points spell STATE.text; the rest are volumes from shapes.js. */
export const TARGETS = [
  { id: 'text',   label: 'Text'   },
  { id: 'sphere', label: 'Sphere' },
  { id: 'torus',  label: 'Torus'  },
  { id: 'cube',   label: 'Cube'   },
  { id: 'helix',  label: 'Helix'  },
  { id: 'wave',   label: 'Wave'   },
  { id: 'galaxy', label: 'Galaxy' },
  { id: 'ring',   label: 'Ring'   },
];

export const PALETTES = [
  { id: 'ember',  label: 'Ember',  colors: ['#C45D35', '#F0A16A', '#FBE3C0'] },
  { id: 'dusk',   label: 'Dusk',   colors: ['#3B2E8F', '#C4603A', '#FFD9B0'] },
  { id: 'mint',   label: 'Mint',   colors: ['#0E7C6B', '#63E0BE', '#EAFFF8'] },
  { id: 'iris',   label: 'Iris',   colors: ['#3B2E8F', '#9B4DAF', '#F0B8E4'] },
  { id: 'ice',    label: 'Ice',    colors: ['#12406E', '#4A90C4', '#DCF0FF'] },
  { id: 'mono',   label: 'Mono',   colors: ['#2A2A2A', '#8A8A8A', '#FAF8F5'] },
];

export const COLOR_MODES = [
  { id: 0, label: 'Height' },
  { id: 1, label: 'Radius' },
  { id: 2, label: 'Depth'  },
  { id: 3, label: 'Random' },
];

export const STATE = {
  /* The one transformation. The cloud is the rest state; firing the trigger
     sends it to `target`, firing again brings it back. */
  target: 'text',
  text: 'EVERYWHERE',
  transformed: false,

  // Cloud
  count: 90000,
  size: 2.6,
  scale: 1.0,
  thickness: 0.35,
  drift: 0.20,

  // Transformation
  morphTime: 1.6,
  scatter: 4.2,
  stagger: 0.58,

  // The word band
  bandOn: true,
  bandDiameter: 12.0,
  bandHeight: 2.8,
  bandRepeats: 3,
  bandTilt: -35,
  bandSpeed: 0.12,

  // Interaction
  force: 0.9,
  radius: 0.36,

  // Colour
  palette: 'dusk',
  colors: ['#3B2E8F', '#C4603A', '#FFD9B0'],
  background: '#07070b',
  colorMode: 1,
  glow: 0.95,

  paused: false,
};

/* Band internals that aren't worth a slider. */
export const BAND = {
  fontFamily: "'Inter', system-ui, sans-serif",
  fontWeight: 700,
  tracking: -0.02,
  gap: 0.22,        // trailing space per tile, as a fraction of the word
  segments: 220,    // around the circumference. Low values facet the arc.
  center: [0, 0.2, 1.0],
  roll: 8,          // degrees of lean in the screen plane
  parallax: 0.9,
};

/* Fixed internals — nothing good happens when you drag these. */
export const TUNING = {
  referenceDistance: 11,
  sizeVariance: 0.7,
  turbulence: 1.15,
  flowSpeed: 0.22,
  pointerEase: 0.09,
  cameraZ: 11,
  densityReference: 90000,
};

/* Used only to pick a sensible STARTING point count. */
export const TIERS = [
  { name: 'low',   count:  30000, dpr: 1.00 },
  { name: 'mid',   count:  70000, dpr: 1.35 },
  { name: 'high',  count: 120000, dpr: 1.75 },
  { name: 'ultra', count: 180000, dpr: 2.00 },
];
