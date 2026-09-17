/* ============================================================================
   config.js — defaults and option lists

   The panel writes into `STATE`. Everything else reads it. If you want a
   different starting look, change the defaults here; if you want a different
   *option*, add it to one of the lists below and it appears in the panel
   automatically.
   ========================================================================= */

/* The shapes the cloud can gather into. `id` must match a generator in
   shapes.js; `label` is what the chip says. */
export const SHAPES = [
  { id: 'sphere', label: 'Sphere' },
  { id: 'torus',  label: 'Torus'  },
  { id: 'cube',   label: 'Cube'   },
  { id: 'helix',  label: 'Helix'  },
  { id: 'wave',   label: 'Wave'   },
  { id: 'galaxy', label: 'Galaxy' },
  { id: 'ring',   label: 'Ring'   },
  { id: 'text',   label: 'Text'   },
  { id: 'cloud',  label: 'Cloud'  },
];

/* Three-stop gradients. The cloud always reads as a gradient rather than a
   flat colour, which is most of what stops a large point cloud looking like
   grey mush. */
export const PALETTES = [
  { id: 'ember',   label: 'Ember',   colors: ['#C45D35', '#F0A16A', '#FBE3C0'] },
  { id: 'mint',    label: 'Mint',    colors: ['#0E7C6B', '#63E0BE', '#EAFFF8'] },
  { id: 'iris',    label: 'Iris',    colors: ['#3B2E8F', '#9B4DAF', '#F0B8E4'] },
  { id: 'sodium',  label: 'Sodium',  colors: ['#7A2E12', '#E2A32B', '#FFF4D2'] },
  { id: 'ice',     label: 'Ice',     colors: ['#12406E', '#4A90C4', '#DCF0FF'] },
  { id: 'mono',    label: 'Mono',    colors: ['#2A2A2A', '#8A8A8A', '#FAF8F5'] },
];

/* What the gradient is keyed to. Changing this is instant — colour is
   computed in the shader from position, never baked into a buffer. */
export const COLOR_MODES = [
  { id: 0, label: 'Height' },
  { id: 1, label: 'Radius' },
  { id: 2, label: 'Depth'  },
  { id: 3, label: 'Random' },
];

export const STATE = {
  shape: 'sphere',
  text: 'HELLO',

  // Form
  count: 90000,
  size: 2.4,
  scale: 1.0,
  thickness: 0.18,

  // Motion
  spin: 0.18,
  drift: 0.22,
  morphTime: 1.5,
  scatter: 3.6,
  stagger: 0.55,

  // Interaction
  force: 0.9,
  radius: 0.36,

  // Colour
  palette: 'ember',
  colors: ['#C45D35', '#F0A16A', '#FBE3C0'],
  background: '#000000',
  colorMode: 0,
  glow: 0.85,

  paused: false,
};

/* Fixed internals — not exposed in the panel, because nothing good happens
   when you drag them. */
export const TUNING = {
  referenceDistance: 11,   // uSize reads as px at this depth
  sizeVariance: 0.7,
  turbulence: 1.15,        // swirl applied while scattered
  flowSpeed: 0.22,
  pointerEase: 0.09,
  cameraZ: 11,
  /* Point size is calibrated at this count and scaled by 1/sqrt(n), so
     raising the count buys finer grain at a steady overall brightness
     instead of a brighter picture. */
  densityReference: 90000,
};

/* Four tiers, used only to pick a sensible STARTING count and pixel ratio.
   Once the panel is open the count is the user's business. */
export const TIERS = [
  { name: 'low',   count:  30000, dpr: 1.00 },
  { name: 'mid',   count:  70000, dpr: 1.35 },
  { name: 'high',  count: 120000, dpr: 1.75 },
  { name: 'ultra', count: 180000, dpr: 2.00 },
];
