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

  /* --- The word band ------------------------------------------------------
     One continuous stripe of type wrapped around a cylinder. `tilt` is how the
     ring leans, in degrees — this is the control with the most effect on the
     whole composition. `repeats` is how many times the word goes around.   */
  wordRing: {
    /* Deliberately larger than the frame. The band should run off the edges
       rather than sit politely inside them — a ring you can see all of reads
       as a logo, a ring that leaves the frame reads as something you are
       standing inside. */
    /* Sized from the frustum, not by eye. At `center` the visible half-width
       is about 6 world units, so a radius a shade under that puts the ring's
       widest point right at the frame edge — words run off the sides while
       the near arc stays fully readable. */
    radius:      6.0,
    bandHeight:  2.8,    // world units tall — the cap height of the type
    repeats:     3,      // fewer tiles = each word occupies more of the arc
    gap:         0.22,   // trailing space per tile, as a fraction of the word
    segments:    220,    // around the circumference. Low values facet the arc.
    center:      [0, 0.20,  1.0],
    /* Tilt is measured from the band's axis being VERTICAL, so small numbers
       give a steeply-seen ring (a wide flat sweep) and numbers near -90 point
       the axis at the camera and give a full circle. -35 puts the eye about
       35 degrees above the ring's plane: the near arc runs across the lower
       frame at full size, the far arc arcs overhead, and you read both. */
    tilt:        [-35, 0, 8],   // degrees [x, y, z]
    /* The camera looks into the tube, so the wall facing us is the INSIDE of
       the cylinder and every word comes out backwards. Flipping the texture
       horizontally puts the readable face where you actually look; the far
       wall stays mirrored, which is the effect we wanted anyway. */
    mirror:      true,
    speed:       0.045,  // idle turn, radians/sec
    scrollSpeed: 2.2,    // radians per section scrolled — the main driver
    parallax:    0.9,    // how much the band leans toward the cursor
    scrollLag:   0.25,
    drift:       0.10,
    fadeEnd:     0.92,   // fraction of section 0 after which it's gone
  },
};
