/* ============================================================================
   shapes.js — target generators

   Every generator returns { positions, colors }: a Float32Array of xyz and a
   Uint8Array of rgb, one entry per point. A scene is nothing more than that
   pair, so morphing between scenes is interpolating two arrays — which is why
   the whole thing stays cheap no matter how elaborate the scenes look.

   Colour comes from world.js rather than from each generator, so the abstract
   scenes and the landscape read as the same place under the same light.
   ========================================================================= */

import {
  PALETTE as C, LIGHT, mix, lightFalloff, aerial, speckle, jitterCol, writeCol,
} from './world.js';

const TAU = Math.PI * 2;

/* Deterministic PRNG so a given build always looks identical. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

/* --- Text ------------------------------------------------------------------
   Rasterise the word to an offscreen canvas, read the alpha channel, and
   scatter points across the lit pixels. This is why any string works and why
   the type is genuinely the font rather than a hand-placed approximation.

   Must be called AFTER document.fonts.ready, or the sampler reads the
   fallback font and the word comes out the wrong shape.
--------------------------------------------------------------------------- */
export function textPoints(count, text, opts) {
  const { fontFamily, fontWeight, tracking, worldWidth, depth, jitter } = opts;
  const rand = rng(hash(text));

  const FS = 260;                       // rasterisation font size, px
  const pad = Math.round(FS * 0.35);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const font = `${fontWeight} ${FS}px ${fontFamily}`;
  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking}em`;
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width) + pad * 2;
  const h = Math.ceil(FS * 1.25) + pad * 2;

  canvas.width = w; canvas.height = h;
  // Resizing the canvas resets the 2D state, so re-apply it.
  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking}em`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, w / 2, h / 2);

  const data = ctx.getImageData(0, 0, w, h).data;

  // Collect every pixel the glyphs actually cover.
  const lit = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 128) lit.push(x, y);
    }
  }

  const out = new Float32Array(count * 3);
  if (lit.length === 0) return out;      // font never loaded — fail soft

  const scale = worldWidth / w;
  const litCount = lit.length / 2;

  for (let i = 0; i < count; i++) {
    const p = ((rand() * litCount) | 0) * 2;
    const px = lit[p] + (rand() - 0.5);
    const py = lit[p + 1] + (rand() - 0.5);

    out[i * 3]     = (px - w / 2) * scale + (rand() - 0.5) * jitter;
    out[i * 3 + 1] = -(py - h / 2) * scale + (rand() - 0.5) * jitter;
    out[i * 3 + 2] = (rand() - 0.5) * depth;
  }
  return out;
}

/* --- Gaussian cloud --------------------------------------------------------
   The "dissolved" state. Box-Muller gives a soft-edged nebula rather than
   the hard sphere you get from uniform sampling.
--------------------------------------------------------------------------- */
export function cloudPoints(count, { radius = 5.5, flatten = 0.55, seed = 7 } = {}) {
  const rand = rng(seed);
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    out[i * 3]     = gauss(rand) * radius;
    out[i * 3 + 1] = gauss(rand) * radius * flatten;
    out[i * 3 + 2] = gauss(rand) * radius * 0.7;
  }
  return out;
}

/* --- Sphere shell ----------------------------------------------------------
   Fibonacci distribution — even coverage with no polar bunching, which is
   the giveaway of naive lat/long sampling.
--------------------------------------------------------------------------- */
export function spherePoints(count, { radius = 3.6, thickness = 0.35, seed = 11 } = {}) {
  const rand = rng(seed);
  const out = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    const rr = radius + (rand() - 0.5) * thickness;
    out[i * 3]     = Math.cos(th) * r * rr;
    out[i * 3 + 1] = y * rr;
    out[i * 3 + 2] = Math.sin(th) * r * rr;
  }
  return out;
}

/* --- Depth-layered panels --------------------------------------------------
   Several rectangular slabs at staggered depths. Reads as architecture when
   the camera moves across it, because the parallax between layers is real.
--------------------------------------------------------------------------- */
export function panelPoints(count, { layers = 5, width = 9, height = 5.2, gap = 1.5, seed = 23 } = {}) {
  const rand = rng(seed);
  const out = new Float32Array(count * 3);
  const per = Math.ceil(count / layers);
  for (let i = 0; i < count; i++) {
    const layer = Math.min(layers - 1, (i / per) | 0);
    const t = layer / (layers - 1) - 0.5;
    const shrink = 1 - Math.abs(t) * 0.25;
    out[i * 3]     = (rand() - 0.5) * width * shrink + t * 1.6;
    out[i * 3 + 1] = (rand() - 0.5) * height * shrink;
    out[i * 3 + 2] = t * gap * layers * 0.5 + (rand() - 0.5) * 0.06;
  }
  return out;
}

/* --- Wave field ------------------------------------------------------------ */
export function wavePoints(count, { width = 16, depthSpan = 16, amp = 1.15, seed = 31 } = {}) {
  const rand = rng(seed);
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * width;
    const z = (rand() - 0.5) * depthSpan;
    const y = Math.sin(x * 0.55) * Math.cos(z * 0.42) * amp
            + Math.sin((x + z) * 0.22) * amp * 0.5;
    out[i * 3] = x;
    out[i * 3 + 1] = y - 1.2;
    out[i * 3 + 2] = z;
  }
  return out;
}

/* --- Torus ----------------------------------------------------------------- */
export function torusPoints(count, { R = 3.4, r = 1.15, seed = 41 } = {}) {
  const rand = rng(seed);
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rand() * TAU, v = rand() * TAU;
    const rr = r * Math.sqrt(rand());
    out[i * 3]     = (R + rr * Math.cos(v)) * Math.cos(u);
    out[i * 3 + 1] = rr * Math.sin(v);
    out[i * 3 + 2] = (R + rr * Math.cos(v)) * Math.sin(u);
  }
  return out;
}

/* --- helpers --------------------------------------------------------------- */
function gauss(rand) {
  const u = Math.max(1e-6, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rand());
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ===========================================================================
   THE SCENES

   Each returns { positions, colors }. The landscape is the anchor — the
   abstract scenes are that same world rearranged, not different worlds.
   ========================================================================= */

/* --- The landscape ---------------------------------------------------------
   A misty stand of trees under a lit sky. Built in three regions with fixed
   proportions, because the read depends far more on the ratio of sky to
   ground to silhouette than on any one region being clever.

   Region budget: 44% atmosphere, 29% ground, 27% trees.
--------------------------------------------------------------------------- */
export function landscapePoints(count, { seed = 3, treeCount = 8, lean = 0 } = {}) {
  const rand = rng(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Uint8Array(count * 3);

  const nSky   = Math.floor(count * 0.40);
  const nTrees = Math.floor(count * 0.26);

  /* Trunk placement, pushed away from dead centre so the camera has a lane
     to look down rather than a wall to look at. */
  const trees = [];
  for (let t = 0; t < treeCount; t++) {
    const side = t % 2 === 0 ? -1 : 1;
    trees.push({
      x: side * (1.4 + rand() * 5.2),
      z: -13 + rand() * 14,
      h: 4.6 + rand() * 3.2,
      r: 0.18 + rand() * 0.24,
      spread: 0.85 + rand() * 1.15,
    });
  }

  for (let i = 0; i < count; i++) {
    let x, y, z, col;

    if (i < nSky) {
      /* --- atmosphere: a deep slab of haze, denser and hotter near the light */
      const toLight = rand() < 0.42;              // bias points toward the glow
      if (toLight) {
        const r = Math.pow(rand(), 0.55) * 7;
        const th = rand() * TAU, ph = Math.acos(2 * rand() - 1);
        x = LIGHT[0] + Math.sin(ph) * Math.cos(th) * r;
        y = LIGHT[1] + Math.cos(ph) * r * 0.8;
        z = LIGHT[2] + Math.sin(ph) * Math.sin(th) * r * 0.9;
      } else {
        x = (rand() - 0.5) * 19;
        y = -1.2 + rand() * 7.6;
        z = -16 + rand() * 19;
      }

      const f = lightFalloff(x, y, z, 11);
      col = mix(C.lightCore, C.glowPink, Math.min(1, f * 1.9));
      col = mix(col, C.hazeWarm, Math.max(0, (f - 0.35) * 1.5));
      col = mix(col, C.hazeCool, Math.max(0, (f - 0.62) * 2.2));
      // The sky darkens toward the bottom of frame, under the canopy.
      col = mix(col, C.grassMid, Math.max(0, Math.min(0.85, (-y + 0.6) * 0.42)));

    } else if (i < nSky + nTrees) {
      /* --- trees: trunks with a loose canopy. Silhouette carries the depth,
             so these stay dark and let the haze behind them do the work. */
      const t = trees[(rand() * trees.length) | 0];
      const up = Math.pow(rand(), 0.75);
      const canopy = up > 0.42;
      const rad = canopy ? t.spread * (1 - Math.pow(up - 0.42, 1.4)) : t.r * (1.3 - up * 0.4);
      const th = rand() * TAU;
      const rr = rad * Math.sqrt(rand());

      x = t.x + Math.cos(th) * rr + up * lean;
      y = -3.1 + up * t.h;
      z = t.z + Math.sin(th) * rr;

      const f = lightFalloff(x, y, z, 14);
      col = mix(C.treeMid, C.treeDark, f);
      // Rim light: the side of the canopy facing the glow catches it.
      const rim = Math.max(0, 1 - f * 1.5) * (canopy ? 1 : 0.35);
      col = mix(col, C.grassLit, rim * 0.5);
      col = mix(col, C.glowPink, rim * 0.22);

    } else {
      /* --- ground: a rolling floor, brightest in the middle distance where
             the light actually reaches it. */
      x = (rand() - 0.5) * 22;
      z = -15 + rand() * 20;
      const roll = Math.sin(x * 0.4) * 0.38 + Math.cos(z * 0.3) * 0.34;
      y = -3.3 + roll + (rand() - 0.5) * 0.38;

      const f = lightFalloff(x, y, z, 15);
      const near = Math.min(1, Math.max(0, (z + 3) / 10));   // 0 far, 1 near
      col = mix(C.grassLit, C.grassMid, Math.min(1, f * 1.25));
      col = mix(col, C.grassDeep, near * 0.62);
    }

    // Ground sits under the haze rather than in it, so it fades far less.
    col = aerial(col, z, i < nSky ? 0.5 : 0.24);
    col = speckle(col, rand);
    col = jitterCol(col, rand, 22);

    positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
    writeCol(colors, i, col);
  }

  return { positions, colors };
}

/* --- Re-colouring helpers --------------------------------------------------
   The abstract scenes reuse the landscape's colour logic so that morphing
   into them looks like the world rearranging itself, not like a cut to a
   different piece.
--------------------------------------------------------------------------- */
function colorLikeWorld(positions, count, seed) {
  const rand = rng(seed);
  const colors = new Uint8Array(count * 3);
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    const f = lightFalloff(x, y, z, 12);
    let col = mix(C.lightCore, C.glowPink, Math.min(1, f * 1.7));
    col = mix(col, C.hazeWarm, Math.max(0, (f - 0.3) * 1.4));
    col = mix(col, C.hazeCool, Math.max(0, (f - 0.6) * 1.8));
    // Ground-height points stay green, so the world keeps its horizon.
    col = mix(col, C.grassMid, Math.min(1, Math.max(0, (-y - 1.2) * 0.42)));
    col = aerial(col, z, 0.55);
    col = speckle(col, rand);
    col = jitterCol(col, rand, 20);
    writeCol(colors, i, col);
  }
  return colors;
}

export function worldCloud(count, opts = {}) {
  const positions = cloudPoints(count, opts);
  return { positions, colors: colorLikeWorld(positions, count, (opts.seed || 7) + 91) };
}
export function worldSphere(count, opts = {}) {
  const positions = spherePoints(count, opts);
  return { positions, colors: colorLikeWorld(positions, count, (opts.seed || 11) + 91) };
}
export function worldPanels(count, opts = {}) {
  const positions = panelPoints(count, opts);
  return { positions, colors: colorLikeWorld(positions, count, (opts.seed || 23) + 91) };
}
export function worldWave(count, opts = {}) {
  const positions = wavePoints(count, opts);
  return { positions, colors: colorLikeWorld(positions, count, (opts.seed || 31) + 91) };
}
export function worldTorus(count, opts = {}) {
  const positions = torusPoints(count, opts);
  return { positions, colors: colorLikeWorld(positions, count, (opts.seed || 41) + 91) };
}

/* Type rendered as points. No longer used by the default scene list — the
   reference floats crisp vector type through the cloud instead (see
   word-layer.js) — but kept because it's a good effect and one import away. */
export function worldText(count, text, opts) {
  const positions = textPoints(count, text, opts);
  return { positions, colors: colorLikeWorld(positions, count, 77) };
}
