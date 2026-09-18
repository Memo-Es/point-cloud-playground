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

/* Band text treatments. The ids map to uMode in shaders/band.frag.js. */
export const EFFECTS = [
  { id: 'solid',   label: 'Solid'   },
  { id: 'irid',    label: 'Iridescent' },
  { id: 'chroma',  label: 'Chromatic'  },
  { id: 'refract', label: 'Refract'    },
];
export const EFFECT_IDS = { solid: 0, irid: 1, chroma: 2, refract: 3 };

export const ON_TRANSFORM = [
  { id: 'flatten', label: 'Flatten on top' },
  { id: 'stay',    label: 'Stay' },
];

export const STATE = {
  /* Saved from a session in the playground — Export > Settings > Copy round
     -trips back into here. */

  target: 'text',
  /* Two separate strings on purpose: what the POINTS spell and what the BAND
     says are usually not the same thing. */
  cloudText: '30 M',
  bandText: 'Series A',
  /* Set when a font file is uploaded. Deliberately empty here: an uploaded
     face is registered under a generated id that means nothing on reload, so
     baking one in would just fall back to the built-in stack anyway. To ship
     a real default typeface the file has to live in the repo. */
  fontName: '',
  transformed: false,

  /* Cloud. `count` is honoured as written — device tiering only caps the
     pixel ratio now, so a saved default survives the boot. */
  count: 180000,
  size: 2.6,
  scale: 1.32,
  thickness: 0.53,
  drift: 0.20,

  // Transformation
  morphTime: 1.6,
  scatter: 4.2,
  stagger: 0.58,

  /* The result, once transformed. `textDepth` extrudes the text target into a
     slab; tilt rocks the whole result so a 3D form reads as one. */
  textSize: 1.0,
  textDepth: 0.38,
  tiltAmount: 0.22,
  tiltSpeed: 0.35,

  // The word band — rest pose
  bandOn: true,
  bandDiameter: 6.6,
  bandHeight: 2.8,
  bandRepeats: 3,
  /* Auto derives the repeat count from the circumference, so letters keep
     their proportions when you change the diameter instead of stretching. */
  bandAuto: true,
  bandLetterSize: 1.0,
  bandTilt: -35,
  bandSpeed: 0.12,

  /* What the band does when the cloud transforms:
       flatten — lay it level and lift it over the result
       stay    — hold the rest pose and let the cloud change under it */
  bandOnTransform: 'flatten',

  /* The flattened pose itself. */
  bandDiameterOn: 9.0,
  bandHeightOn: 1.2,
  bandTiltOn: -4,
  bandLift: 8.0,

  // Band treatment
  bandEffect: 'solid',
  bandStrength: 0.26,
  bandColor: '#f4edde',

  /* Camera. `zoom` is the resting distance; `zoomOn` is where it dollies to
     once the cloud has transformed, so the push-in is part of the gesture
     rather than a separate thing you have to trigger. `breathe` is a slow
     continuous in-out on top of both. */
  zoom: 11,
  zoomOn: 8,
  breathe: 0.6,
  breatheSpeed: 0.18,

  // Interaction
  force: 0,
  radius: 0.05,

  // Colour
  palette: 'custom',
  colors: ['#fec796', '#fb5646', '#2e79d8'],
  background: '#07070e',
  colorMode: 2,
  glow: 0.42,

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
  zoomEase: 0.07,      // how hard the camera resists a change in distance
  zoomMin: 3,
  zoomMax: 30,
  densityReference: 90000,
};

/* Used only to pick a sensible STARTING point count. */
export const TIERS = [
  { name: 'low',   count:  30000, dpr: 1.00 },
  { name: 'mid',   count:  70000, dpr: 1.35 },
  { name: 'high',  count: 120000, dpr: 1.75 },
  { name: 'ultra', count: 180000, dpr: 2.00 },
];
