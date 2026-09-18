/* ============================================================================
   shapes.js — the target generators

   Every generator returns a Float32Array of length count*3 and is sized to
   roughly the same bounding volume, so switching between them doesn't jump
   scale. `thickness` pushes points off the ideal surface: 0 gives a clean
   shell, 1 gives a fog in the shape of the thing.

   Morphing between two shapes is interpolating two of these arrays, which is
   why the whole thing stays cheap no matter how many points there are.
   ========================================================================= */

import { rng } from './rng.js';

const TAU = Math.PI * 2;
const R = 3.2;              // the family radius every shape is built around

export function generate(id, count, opts = {}) {
  const fn = GENERATORS[id] || GENERATORS.sphere;
  return fn(count, opts);
}

/* Random unit vector — used to push points off a surface evenly. */
function unit(rand, out, i) {
  const u = rand() * 2 - 1;
  const th = rand() * TAU;
  const s = Math.sqrt(Math.max(0, 1 - u * u));
  out[0] = Math.cos(th) * s; out[1] = u; out[2] = Math.sin(th) * s;
}

const _n = [0, 0, 0];
function puff(out, i, rand, thickness, amount = 1) {
  if (thickness <= 0) return;
  unit(rand, _n, i);
  const k = thickness * amount * Math.cbrt(rand());
  out[i * 3] += _n[0] * k;
  out[i * 3 + 1] += _n[1] * k;
  out[i * 3 + 2] += _n[2] * k;
}

const GENERATORS = {

  /* Fibonacci sphere: even coverage with no polar bunching, which is the
     giveaway of naive lat/long sampling. */
  sphere(count, { thickness = 0, seed = 3 } = {}) {
    const rand = rng(seed);
    const out = new Float32Array(count * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / Math.max(1, count - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = golden * i;
      out[i * 3] = Math.cos(th) * r * R;
      out[i * 3 + 1] = y * R;
      out[i * 3 + 2] = Math.sin(th) * r * R;
      puff(out, i, rand, thickness, R * 0.35);
    }
    return out;
  },

  torus(count, { thickness = 0, seed = 11 } = {}) {
    const rand = rng(seed);
    const out = new Float32Array(count * 3);
    const bigR = R * 0.78, tubeR = R * 0.30;
    for (let i = 0; i < count; i++) {
      const u = rand() * TAU, v = rand() * TAU;
      const c = bigR + tubeR * Math.cos(v);
      out[i * 3] = c * Math.cos(u);
      out[i * 3 + 1] = tubeR * Math.sin(v);
      out[i * 3 + 2] = c * Math.sin(u);
      puff(out, i, rand, thickness, R * 0.28);
    }
    return out;
  },

  /* Cube shell — pick a face first, then a point on it. Sampling a volume
     and projecting instead would crowd the edges. */
  cube(count, { thickness = 0, seed = 17 } = {}) {
    const rand = rng(seed);
    const out = new Float32Array(count * 3);
    const h = R * 0.82;
    for (let i = 0; i < count; i++) {
      const face = (rand() * 6) | 0;
      const a = (rand() - 0.5) * 2 * h;
      const b = (rand() - 0.5) * 2 * h;
      const s = face % 2 === 0 ? h : -h;
      if (face < 2)      { out[i*3] = s; out[i*3+1] = a; out[i*3+2] = b; }
      else if (face < 4) { out[i*3] = a; out[i*3+1] = s; out[i*3+2] = b; }
      else               { out[i*3] = a; out[i*3+1] = b; out[i*3+2] = s; }
      puff(out, i, rand, thickness, R * 0.30);
    }
    return out;
  },

  helix(count, { thickness = 0, seed = 23 } = {}) {
    const rand = rng(seed);
    const out = new Float32Array(count * 3);
    const turns = 4, coil = R * 0.55, height = R * 2.1;
    for (let i = 0; i < count; i++) {
      const t = rand();
      const a = t * TAU * turns;
      // Two strands, so it reads as a helix rather than a spring.
      const strand = rand() < 0.5 ? 0 : Math.PI;
      const rr = coil + (rand() - 0.5) * coil * 0.25;
      out[i * 3] = Math.cos(a + strand) * rr;
      out[i * 3 + 1] = (t - 0.5) * height;
      out[i * 3 + 2] = Math.sin(a + strand) * rr;
      puff(out, i, rand, thickness, R * 0.26);
    }
    return out;
  },

  wave(count, { thickness = 0, seed = 31 } = {}) {
    const rand = rng(seed);
    const out = new Float32Array(count * 3);
    const span = R * 1.7;
    for (let i = 0; i < count; i++) {
      const x = (rand() - 0.5) * 2 * span;
      const z = (rand() - 0.5) * 2 * span;
      const y = Math.sin(x * 0.9) * Math.cos(z * 0.7) * R * 0.30
              + Math.sin((x + z) * 0.36) * R * 0.16;
      out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
      puff(out, i, rand, thickness, R * 0.22);
    }
    return out;
  },

  /* Spiral arms with a dense core. sqrt of a uniform gives constant areal
     density on a disc; raising the power instead concentrates the middle,
     which is what a galaxy actually looks like. */
  galaxy(count, { thickness = 0, seed = 41 } = {}) {
    const rand = rng(seed);
    const out = new Float32Array(count * 3);
    const arms = 3, spread = 0.42, twist = 2.4;
    for (let i = 0; i < count; i++) {
      const t = Math.pow(rand(), 0.62);
      const r = t * R * 1.15;
      const arm = ((rand() * arms) | 0) * (TAU / arms);
      const a = arm + t * twist * TAU * 0.35 + (rand() - 0.5) * spread * (1 - t * 0.6);
      const flat = (1 - t) * R * 0.22 + 0.04;
      out[i * 3] = Math.cos(a) * r;
      out[i * 3 + 1] = (rand() - 0.5) * flat * 2;
      out[i * 3 + 2] = Math.sin(a) * r;
      puff(out, i, rand, thickness, R * 0.16);
    }
    return out;
  },

  ring(count, { thickness = 0, seed = 47 } = {}) {
    const rand = rng(seed);
    const out = new Float32Array(count * 3);
    const inner = R * 0.55, outer = R * 1.05;
    for (let i = 0; i < count; i++) {
      const a = rand() * TAU;
      // sqrt keeps the annulus evenly covered rather than crowding the inside.
      const r = Math.sqrt(inner * inner + rand() * (outer * outer - inner * inner));
      out[i * 3] = Math.cos(a) * r;
      out[i * 3 + 1] = (rand() - 0.5) * R * 0.08;
      out[i * 3 + 2] = Math.sin(a) * r;
      puff(out, i, rand, thickness, R * 0.14);
    }
    return out;
  },

  cloud(count, { thickness = 0, seed = 61 } = {}) {
    const rand = rng(seed);
    const out = new Float32Array(count * 3);
    const g = () => {
      const u = Math.max(1e-6, rand());
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rand());
    };
    for (let i = 0; i < count; i++) {
      out[i * 3] = g() * R * 0.52;
      out[i * 3 + 1] = g() * R * 0.52;
      out[i * 3 + 2] = g() * R * 0.52;
      puff(out, i, rand, thickness, R * 0.2);
    }
    return out;
  },

  /* Text is rasterised to an offscreen canvas and sampled where the glyphs
     cover pixels. Must run after document.fonts.ready or the sampler reads
     the fallback font and the word comes out the wrong shape. */
  text(count, { thickness = 0, text = 'HELLO', fontFamily = "'Inter', sans-serif",
                seed = 77, depth = 0.5, size = 1 } = {}) {
    const rand = rng(seed);
    const out = new Float32Array(count * 3);
    const str = (text || '').trim() || 'HELLO';

    const FS = 220, pad = 40;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const font = `700 ${FS}px ${fontFamily}`;
    ctx.font = font;
    const w = Math.max(1, Math.ceil(ctx.measureText(str).width) + pad * 2);
    const h = Math.ceil(FS * 1.4);
    canvas.width = w; canvas.height = h;
    ctx.font = font;               // resizing the canvas resets 2D state
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(str, w / 2, h / 2);

    const data = ctx.getImageData(0, 0, w, h).data;

    /* Collect the lit pixels AND their bounds in the same pass. The bounds
       are what the word actually inks, which is not the canvas: the canvas
       carries padding and a fixed line height, so measuring it instead makes
       a two-glyph string claim the same box as a ten-glyph one. */
    const lit = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 128) {
          lit.push(x, y);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!lit.length) return GENERATORS.sphere(count, { thickness, seed });

    const inkW = Math.max(1, maxX - minX);
    const inkH = Math.max(1, maxY - minY);

    /* Fit inside a box on BOTH axes, not just width.

       Fitting by width alone was the bug: "30 M" and "EVERYWHERE" were both
       stretched to the same world width, which made the short one's letters
       about four times taller, and it ran straight off the top and bottom of
       the frame. min() of the two ratios means the word touches whichever
       edge it reaches first and never overflows the other. */
    const boxW = R * 2.2;
    const boxH = R * 1.15;
    const scale = Math.min(boxW / inkW, boxH / inkH) * Math.max(0.05, size);

    // Centre on the ink, not on the canvas, so padding never shifts the word.
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    for (let i = 0; i < count; i++) {
      const p = ((rand() * (lit.length / 2)) | 0) * 2;
      out[i * 3] = (lit[p] + rand() - 0.5 - cx) * scale;
      out[i * 3 + 1] = -(lit[p + 1] + rand() - 0.5 - cy) * scale;
      /* A real slab, not a decal. The old 0.14 gave a sheet of points that
         vanished edge-on the moment anything rotated; `depth` extrudes the
         glyphs so the word has a front and a back to turn between. */
      out[i * 3 + 2] = (rand() - 0.5) * R * depth;
      puff(out, i, rand, thickness, R * 0.16);
    }
    return out;
  },
};
