/* ============================================================================
   config.js — THE TUNING FILE

   Every number that shapes the piece is here, and none of it is logic.
   ========================================================================= */

export const CONFIG = {

  /* The word that orbits the cloud. Stays crisp vector type — it is NOT made
     of points. See word-layer.js. */
  words: { hero: 'Everywhere' },

  /* --- Palette ------------------------------------------------------------
     A three-stop gradient, applied in the shader from each point's position.
     Changing any of this is a uniform write, not a rebuild.               */
  palette: {
    background: '#07070b',
    colors: ['#3B2E8F', '#C4603A', '#FFD9B0'],
    accent:  '#FFF0DC',     // flash during a scatter transition
    light:   '#6A4E86',     // the volumetric shafts
    /* 0 height · 1 radius · 2 depth · 3 random */
    colorMode: 1,
  },

  /* --- The points ---------------------------------------------------------- */
  points: {
    sizeBase:          2.8,    // px at 1x dpr, at `referenceDistance`
    referenceDistance: 10,
    densityReference:  90000,  // size is calibrated here, scaled by 1/sqrt(n)
    sizeVariance:      0.8,
    opacity:           0.75,
    softness:          0.45,   // 0 = hard dots, 1 = pure haze
    glow:              0.95,
    flow:              0.14,   // ambient drift. 0 freezes the cloud solid.
    flowSpeed:         0.22,
  },

  /* --- Scatter & reform ---------------------------------------------------- */
  morph: {
    scatter:    3.8,
    stagger:    0.58,
    turbulence: 1.15,
    holdStart:  0.45,   // fraction of a section spent FORMED before morphing
    holdEnd:    0.95,
  },

  /* --- The fluid field ----------------------------------------------------
     Cursor position, cursor speed and scroll velocity, smoothed once and read
     by the points, the shafts and the words alike.                        */
  fluid: {
    pointerRadius:  0.38,
    pointerPush:    0.55,
    pointerEase:    0.09,
    velocityGain:   1.8,
    scrollSmear:    1.25,
    scrollSizeGain: 0.9,
    decay:          0.92,
  },

  /* --- Camera -------------------------------------------------------------
     One entry per scene. The camera lerps continuously between them while the
     cloud HOLDS formed — that mismatch is where the parallax comes from.  */
  camera: {
    fov: 45, near: 0.1, far: 120,
    keys: [
      { pos: [ 0.0,  0.0, 10.5], look: [0,  0.0, 0] },  // 0 hero
      { pos: [ 0.0, -0.6,  7.6], look: [0, -0.2, 0] },  // 1 sphere
      { pos: [ 2.4,  1.0,  9.0], look: [0,  0.0, 0] },  // 2 helix
      { pos: [-2.2,  0.7,  8.4], look: [0,  0.0, 0] },  // 3 wave
      { pos: [ 0.0,  2.8,  8.8], look: [0, -0.6, 0] },  // 4 galaxy
      { pos: [ 1.6,  0.4,  9.4], look: [0,  0.0, 0] },  // 5 torus
      { pos: [ 0.0,  0.3, 14.0], look: [0,  0.0, 0] },  // 6 outro
    ],
    parallax: 0.55,
    parallaxEase: 0.045,
  },

  /* --- Volumetric light ---------------------------------------------------- */
  light: {
    layers: 3,
    referenceLayers: 3,   // intensity is the brightness of the whole STACK
    spread: 26,
    intensity: 0.22,
    drift: 0.035,
    distortion: 1.4,
  },

  bloom: { strength: 0.42, radius: 0.7, threshold: 0.30 },

  /* --- GPU tiers ----------------------------------------------------------- */
  tiers: [
    { name: 'low',   points:  40000, dpr: 1.00, bloom: false, lightLayers: 2 },
    { name: 'mid',   points:  90000, dpr: 1.35, bloom: false, lightLayers: 3 },
    { name: 'high',  points: 150000, dpr: 1.75, bloom: true,  lightLayers: 3 },
    { name: 'ultra', points: 220000, dpr: 2.00, bloom: true,  lightLayers: 3 },
  ],

  scroll: { lerp: 0.085, wheelMultiplier: 1.0, velocityClamp: 2.5 },

  text: {
    fontFamily: "'Inter Tight', 'Helvetica Neue', Arial, sans-serif",
    fontWeight: 800,
    tracking: -0.04,
    worldWidth: 15.5,
  },

  /* --- The floating type --------------------------------------------------
     The words ride a ring around the viewer. Rotating each plane by its own
     orbit angle points it radially outward, so a word at the back is seen
     FROM BEHIND — the mirroring is geometry, not a flipped texture, which is
     why it survives the words moving.                                     */
  wordLayer: {
    orbit: {
      center: [0, 0.40, -0.9],
      radius: 3.6,
      speed: 0.055,
      scrollSpeed: 2.10,
      tilt: 7,
      wobble: 0.55,
    },
    drift: 0.10,
    parallax: 0.55,
    scrollLag: 0.22,
    fadeEnd: 0.92,
    instances: [
      { angle:   0, height:  0.30, size: 0.62, opacity: 1.00, depthGain: 1.00, spin: -2 },
      { angle:  58, height:  0.55, size: 0.58, opacity: 0.95, depthGain: 0.90, spin:  4 },
      { angle: 119, height: -0.65, size: 0.50, opacity: 0.88, depthGain: 0.70, spin: -6, radius: 4.4 },
      { angle: 176, height:  0.15, size: 0.66, opacity: 1.00, depthGain: 1.05, spin:  3 },
      { angle: 236, height: -0.35, size: 0.44, opacity: 0.80, depthGain: 0.55, spin:  8, radius: 5.0 },
      { angle: 298, height:  0.85, size: 0.40, opacity: 0.70, depthGain: 0.45, spin: -5, radius: 4.7 },
    ],
  },
};
