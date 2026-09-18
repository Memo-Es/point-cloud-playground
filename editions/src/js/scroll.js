/* ============================================================================
   scroll.js — scroll state as a plain mutable object

   The single most important architectural decision in the piece, and the one
   worth defending out loud: scroll does NOT dispatch events that update
   component state. It writes numbers into one object, and the render loop
   reads that object. Sixty scroll events a second updating a state atom would
   re-run layout sixty times a second and the WebGL scene would visibly lag
   the DOM copy. This way the two stay locked together for free.
   ========================================================================= */

import { CONFIG } from './config.js';

export function createScrollController({ sectionCount, reducedMotion }) {
  /* The object the render loop reads. Mutated in place, never replaced. */
  const state = {
    progress:  0,   // 0..sectionCount-1, continuous
    sceneA:    0,
    sceneB:    0,
    morph:     0,   // 0..1, with a hold built in
    drift:     0,   // 0..1, no hold — the camera uses this
    velocity:  0,   // normalised, signed
    section:   0,
  };

  let lenis = null;
  let lastY = window.scrollY;

  async function init() {
    if (reducedMotion) return;           // native scroll only
    try {
      const { default: Lenis } = await import('lenis');
      lenis = new Lenis({
        lerp: CONFIG.scroll.lerp,
        wheelMultiplier: CONFIG.scroll.wheelMultiplier,
        smoothWheel: true,
        touchMultiplier: 1.4,
      });
    } catch (err) {
      // Smooth scroll is a nicety. If the CDN is unreachable the piece still
      // works on native scroll, so swallow it rather than killing the page.
      console.warn('[scroll] Lenis unavailable, falling back to native scroll', err);
    }
  }

  function update(time, dt) {
    if (lenis) lenis.raf(time);

    const y = window.scrollY;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);

    // Velocity in viewports-per-second, which is resolution independent.
    const vel = dt > 0 ? ((y - lastY) / window.innerHeight) / dt : 0;
    lastY = y;
    state.velocity = vel;

    const p = (y / max) * (sectionCount - 1);
    state.progress = p;

    // Clamp BOTH ends. Overscroll — iOS rubber-banding, a trackpad flick past
    // the top — drives p negative, and an unclamped floor() would sample the
    // atlas outside its own rows.
    const a = clamp(Math.floor(p), 0, sectionCount - 1);
    const b = clamp(a + 1, 0, sectionCount - 1);
    const raw = clamp(p - a, 0, 1);

    state.sceneA = a;
    state.sceneB = b;
    state.section = Math.round(p);
    state.drift = raw;

    /* The hold. Points stay formed while you're reading, then commit to the
       next shape in the back half of the section. Without this the cloud is
       permanently mid-morph and never resolves into anything legible. */
    const { holdStart, holdEnd } = CONFIG.morph;
    const t = clamp((raw - holdStart) / Math.max(1e-4, holdEnd - holdStart), 0, 1);
    state.morph = t * t * (3 - 2 * t);
  }

  return { state, init, update, get lenis() { return lenis; } };
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
