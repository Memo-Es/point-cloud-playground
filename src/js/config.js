/* ============================================================================
   config.js — THE TUNING FILE

   This is the only file you need to touch to redesign the piece.
   Everything below is a knob. Nothing below is logic.

   Colours are hex strings. Distances are in world units (the camera sits
   ~14 units back, and the visible height at the origin is ~11.6 units, so
   "1.0" is roughly 9% of the screen height).
   ========================================================================= */

export const CONFIG = {

  /* --- The word ----------------------------------------------------------
     One word, repeated through the volume by `wordLayer` below. It stays
     crisp vector type — it is NOT made of points. See word-layer.js.      */
  words: {
    hero: 'Everywhere',
  },

  /* --- Palette ------------------------------------------------------------
     Points carry their own colour, baked per-scene by world.js. What lives
     here is the grade applied on top of all of them, plus the page chrome.
     To re-colour the world itself, edit PALETTE in world.js.              */
  palette: {
    background: '#0d1014',
    accent:     '#ffd9ec',   // the flash during a scatter transition
    tint:       '#b9a6cc',   // pushed into every point...
    tintAmount: 0.05,        // ...by this much. 0 = raw scene colour.
    light:      '#d9b8d4',   // the volumetric shafts
  },

  /* --- The floating type --------------------------------------------------
     Each entry is one copy of the word somewhere in the volume. `mirror`
     flips it, `rot` is degrees [x,y,z], `depthGain` scales how much it
     reacts to the cursor (near words should move more than far ones).

     This is the layout knob with the most effect on the whole piece. Move
     things, delete things, add things — nothing else depends on the count. */
  wordLayer: {
    /* The words ride a ring around the viewer rather than sitting at fixed
       points in space. This is what produces the mirrored copies: a word on
       the far side of the ring is simply being seen from behind. Flipping
       type by hand would have been the wrong answer to the same picture. */
    orbit: {
      center:      [0, 0.55, -3.2],
      radius:      3.8,
      speed:       0.055,  // radians/sec of idle rotation
      scrollSpeed: 2.10,   // radians per section scrolled — the main driver
      tilt:        7,      // degrees the whole ring leans, so it isn't flat on
      wobble:      0.55,   // vertical sway as a word comes round
    },
    drift:     0.10,   // idle float, on top of the orbit
    parallax:  0.55,   // cursor response
    scrollLag: 0.22,   // how much the words trail a fast scroll
    fadeEnd:   0.92,   // fraction of section 0 after which they're gone

    /* `angle` is the starting position on the ring, in degrees. `height` is
       offset from the ring's centre. `spin` tilts the word within its own
       plane. `radius` overrides the ring radius for that one word. */
    instances: [
      { angle:   0, height:  0.30, size: 0.62, opacity: 1.00, depthGain: 1.00, spin:  -2 },
      { angle:  58, height:  0.55, size: 0.58, opacity: 0.95, depthGain: 0.90, spin:   4 },
      { angle: 119, height: -0.65, size: 0.50, opacity: 0.88, depthGain: 0.70, spin:  -6, radius: 4.4 },
      { angle: 176, height:  0.15, size: 0.66, opacity: 1.00, depthGain: 1.05, spin:   3 },
      { angle: 236, height: -0.35, size: 0.44, opacity: 0.80, depthGain: 0.55, spin:   8, radius: 5.0 },
      { angle: 298, height:  0.85, size: 0.40, opacity: 0.70, depthGain: 0.45, spin:  -5, radius: 4.7 },
    ],
  },

  /* --- The points themselves ---------------------------------------------- */
  points: {
    sizeBase:      7.2,   // px at 1x dpr, at `referenceDistance` from camera
    exposure:      1.18,  // global multiplier on every point's own colour
    referenceDistance: 11, // roughly the hero camera's distance to the trees.
    sizeVariance:  0.75,   // 0 = every point identical, 1 = wildly varied
    /* Additive blending accumulates, so total brightness is opacity × point
       count. This value is calibrated AT `densityReference` points and then
       scaled down automatically for denser tiers — otherwise the ultra tier
       renders as a white rectangle while the low tier looks correct. More
       points should mean finer grain, not more light. */
    opacity:          0.70,
    densityReference: 40000,
    softness:      0.72,  // 0 = hard dots, 1 = pure haze
    flow:          0.16,  // ambient drift. 0 freezes the cloud solid.
    flowSpeed:     0.22,
  },

  /* --- Scatter & reform ---------------------------------------------------
     The signature move. Points leave formation, tumble through a cloud, and
     re-converge into the next shape.                                       */
  morph: {
    scatter:    3.4,   // how far points fly out at the midpoint of a transition
    stagger:    0.55,  // 0 = all points move together, 0.9 = long lazy trail
    turbulence: 1.1,   // swirl applied while scattered
    holdStart:  0.45,  // fraction of a section spent FORMED before morphing
    holdEnd:    0.95,  // fraction by which the next shape is fully formed
  },

  /* --- The fluid field ----------------------------------------------------
     One shared source of "disturbance" fed by cursor position, cursor
     velocity and scroll velocity. It drives point displacement, light
     distortion and the bloom threshold — so everything reacts as one system
     rather than as three unrelated effects.                                */
  fluid: {
    pointerRadius:  0.38,  // in NDC. 1.0 ≈ half the screen.
    pointerPush:    0.55,  // world units of displacement at the cursor centre
    pointerEase:    0.09,  // 0.01 = heavy and laggy, 0.3 = twitchy
    velocityGain:   1.8,   // how much cursor SPEED adds on top of position
    scrollSmear:    1.25,  // vertical stretch under fast scrolling
    scrollSizeGain: 0.9,   // points swell as you scroll fast
    decay:          0.92,  // per-frame decay of the whole field
  },

  /* --- Camera -------------------------------------------------------------
     One entry per scene, in scene order. The camera lerps continuously
     between them (no hold), which is what gives the parallax against the
     DOM copy, which does hold.                                             */
  camera: {
    fov:  45,
    near: 0.1,
    far:  120,
    keys: [
      { pos: [ 0.0,  0.5,  5.2], look: [0,  0.5, -7] },  // 0 hero — in among the trees
      { pos: [ 0.0, -0.3,  2.6], look: [0,  0.2, -8] },  // 1 push through
      { pos: [ 2.0,  1.0,  6.4], look: [0,  0.2, -3] },  // 2 sphere
      { pos: [-1.7,  0.6,  5.6], look: [0,  0.0, -2] },  // 3 panels
      { pos: [ 0.0,  2.6,  6.2], look: [0, -0.7, -5] },  // 4 wave
      { pos: [ 0.0,  0.7,  7.4], look: [0,  0.5, -7] },  // 5 back to the world
      { pos: [ 0.0,  1.1, 11.0], look: [0,  0.7, -7] },  // 6 pull out
    ],
    /* How hard the camera drifts with the cursor. Small numbers only. */
    parallax: 0.55,
    parallaxEase: 0.045,
  },

  /* --- Volumetric light ---------------------------------------------------
     Stacked additive gradient quads that drift and get distorted by the
     fluid field. A cheap stand-in for true raymarched light volumes.       */
  light: {
    layers:    5,
    /* `intensity` is the brightness of the whole STACK, calibrated at this
       many layers and divided down when a tier draws more. Same reasoning as
       points.densityReference. */
    referenceLayers: 3,
    spread:    26,    // world units the shafts cover
    intensity: 0.30,
    drift:     0.035,
    distortion: 1.4,  // how much the fluid field bends the shafts
  },

  /* --- Post-processing ---------------------------------------------------- */
  bloom: {
    /* Restrained on purpose. A wide, strong bloom over a large dark field
       lifts every pixel off black and the piece stops reading as night. The
       job here is to halo the hot cores where points overlap, nothing more. */
    strength:  0.30,
    radius:    0.50,
    threshold: 0.42,
  },

  /* --- GPU tiers ----------------------------------------------------------
     Four tiers, picked at boot from hardware signals, then downgraded live
     if the frame budget is missed. Tier 0 must run on a cheap phone.       */
  tiers: [
    { name: 'low',   points:  40000, dpr: 1.00, bloom: false, lightLayers: 2 },
    { name: 'mid',   points:  90000, dpr: 1.35, bloom: false, lightLayers: 3 },
    { name: 'high',  points: 150000, dpr: 1.75, bloom: true,  lightLayers: 5 },
    { name: 'ultra', points: 220000, dpr: 2.00, bloom: true,  lightLayers: 5 },
  ],

  /* --- Scroll -------------------------------------------------------------
     Lenis smoothing. Disabled entirely under prefers-reduced-motion.       */
  scroll: {
    lerp:            0.085,
    wheelMultiplier: 1.0,
    velocityClamp:   2.5,
  },

  /* --- Text sampling ------------------------------------------------------
     How the words get turned into points. `worldWidth` is how wide the
     longest word is allowed to be, in world units.                         */
  text: {
    fontFamily: "'Inter Tight', 'Helvetica Neue', Arial, sans-serif",
    fontWeight: 800,
    tracking:   -0.04,   // em. Negative = tighter.
    worldWidth: 15.5,
    depth:      0.55,    // z-thickness of the sampled slab
    jitter:     0.035,   // softens the pixel grid the sampler reads from
  },
};
