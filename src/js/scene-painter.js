/* ============================================================================
   scene-painter.js — the source image

   The reference's point clouds are baked from captured imagery: each point
   carries the colour of a real pixel, which is what its custom .mdpc format
   exists to compress. That is the single biggest reason it reads as a
   photograph and not as a particle system — the cloud has a SUBJECT.

   There is no photograph available here, so one gets painted: a misty stand
   of trees, rendered procedurally into a 2D canvas. The point sampler then
   treats that canvas exactly as it would treat a photo.

   Two canvases come out of this, drawn from the same seed so their shapes
   line up exactly:
     colour — what each point looks like
     depth  — greyscale, 0 = far, 255 = near, which becomes the point's z

   Everything is drawn twice, once per canvas, by the same code path. A
   separate depth-painting routine would drift out of sync with the colour
   one within about two edits.
   ========================================================================= */

import { rng } from './rng.js';

export function paintScene({ width = 1600, height = 1000, seed = 7 } = {}) {
  const colour = render(width, height, seed, 'colour');
  const depth  = render(width, height, seed, 'depth');
  return { colour, depth, width, height };
}

function render(W, H, seed, mode) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rand = rng(seed);
  const D = mode === 'depth';

  /* Depth is written as flat greys; colour as the actual palette. Keeping the
     choice in one helper is what lets the two passes share all the geometry
     below. */
  const P = (colour, depthValue) => (D ? grey(depthValue) : colour);

  const HORIZON = H * 0.74;

  /* ---- sky ------------------------------------------------------------- */
  if (D) {
    ctx.fillStyle = grey(8);
    ctx.fillRect(0, 0, W, H);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
    sky.addColorStop(0.00, '#6f6b86');
    sky.addColorStop(0.45, '#9d97ad');
    sky.addColorStop(0.80, '#c4bdc8');
    sky.addColorStop(1.00, '#cfc9cd');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, HORIZON + 2);
  }

  /* ---- the light -------------------------------------------------------
     A warm bloom high and right. Everything in the scene is lit from here,
     which is what stops the palette reading as an arbitrary set of colours. */
  if (!D) {
    const gx = W * 0.66, gy = H * 0.20;
    const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, W * 0.46);
    glow.addColorStop(0.00, 'rgba(255,246,251,0.98)');
    glow.addColorStop(0.28, 'rgba(249,214,236,0.62)');
    glow.addColorStop(0.62, 'rgba(206,182,212,0.26)');
    glow.addColorStop(1.00, 'rgba(180,170,200,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, HORIZON + 40);
  }

  /* ---- ground ----------------------------------------------------------- */
  if (D) {
    // Ground runs from far at the horizon to near at the bottom edge.
    const g = ctx.createLinearGradient(0, HORIZON, 0, H);
    g.addColorStop(0, grey(70));
    g.addColorStop(1, grey(250));
    ctx.fillStyle = g;
    ctx.fillRect(0, HORIZON - 4, W, H - HORIZON + 4);
  } else {
    const g = ctx.createLinearGradient(0, HORIZON - 30, 0, H);
    g.addColorStop(0.00, '#9aa886');
    g.addColorStop(0.18, '#5f8545');
    g.addColorStop(0.50, '#2d5b24');
    g.addColorStop(1.00, '#0d240a');
    ctx.fillStyle = g;
    ctx.fillRect(0, HORIZON - 30, W, H - HORIZON + 30);
  }

  /* ---- trees -----------------------------------------------------------
     Three bands, far to near. Drawing back-to-front means the near trees
     naturally overlap the far ones in both canvases at once. */
  const bands = [
    { n: 7, y: HORIZON - 4, scale: 0.52, depth:  38, haze: 0.66 },
    { n: 5, y: HORIZON + 14, scale: 0.78, depth:  95, haze: 0.30 },
    { n: 3, y: HORIZON + 46, scale: 1.12, depth: 150, haze: 0.04 },
  ];

  for (const band of bands) {
    for (let i = 0; i < band.n; i++) {
      const x = (i + 0.5 + (rand() - 0.5) * 0.7) * (W / band.n);
      tree(ctx, rand, x, band.y, band.scale, {
        D, depth: band.depth, haze: band.haze, P,
      });
    }
  }

  /* ---- ground texture ---------------------------------------------------
     Broad tonal patches and a lighter track through the middle. A pure
     gradient reads as a painted wall no matter how much speckle sits on it;
     the eye needs large shapes before it accepts small ones as detail. */
  if (!D) {
    for (let i = 0; i < 46; i++) {
      const t = Math.pow(rand(), 0.7);
      const y = HORIZON + t * (H - HORIZON);
      const x = rand() * W;
      const rx = (60 + rand() * 260) * (0.4 + t);
      const ry = rx * (0.18 + rand() * 0.22);
      const lighter = rand() < 0.5;
      ctx.fillStyle = lighter
        ? `rgba(168,198,118,${0.10 + rand() * 0.18})`
        : `rgba(24,54,20,${0.10 + rand() * 0.20})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // A track receding toward the trees — gives the ground somewhere to go.
    const path = ctx.createLinearGradient(0, HORIZON, 0, H);
    path.addColorStop(0, 'rgba(198,214,158,0.34)');
    path.addColorStop(1, 'rgba(150,180,110,0.05)');
    ctx.fillStyle = path;
    ctx.beginPath();
    ctx.moveTo(W * 0.47, HORIZON);
    ctx.lineTo(W * 0.53, HORIZON);
    ctx.lineTo(W * 0.78, H);
    ctx.lineTo(W * 0.24, H);
    ctx.closePath();
    ctx.fill();
  }

  /* ---- grass ------------------------------------------------------------
     Short strokes, denser and larger toward the bottom of frame. This is the
     high-frequency detail the point sampler will pick up as individual
     coloured specks. */
  const blades = D ? 2600 : 7000;
  for (let i = 0; i < blades; i++) {
    const t = Math.pow(rand(), 0.55);            // bias toward the near edge
    const y = HORIZON + t * (H - HORIZON);
    const x = rand() * W;
    const near = (y - HORIZON) / (H - HORIZON);
    const len = 3 + near * 16;
    const w = 1 + near * 2.4;

    if (D) {
      ctx.fillStyle = grey(70 + near * 180);
    } else {
      const lit = 1 - Math.min(1, Math.hypot(x - W * 0.66, y - H * 0.20) / (W * 0.8));
      const base = mixHex('#13300e', '#8fc356', Math.min(1, lit * 0.85 + rand() * 0.42));
      ctx.fillStyle = jitterHex(base, rand, 26);
    }
    ctx.fillRect(x, y - len, w, len);
  }

  /* Mist gathered at the tree line, so trunks fade into the ground instead
     of standing on a ruled edge. */
  if (!D) {
    // Wide and weak. A tight bright band reads as a ruled line, which is the
    // opposite of what mist is for.
    const band = ctx.createLinearGradient(0, HORIZON - 260, 0, HORIZON + 110);
    band.addColorStop(0, 'rgba(232,226,238,0)');
    band.addColorStop(0.5, 'rgba(232,226,238,0.20)');
    band.addColorStop(1, 'rgba(232,226,238,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, HORIZON - 260, W, 370);
  }

  /* ---- mist ------------------------------------------------------------
     Soft horizontal bands sitting in front of the trees. Depth stays out of
     this: mist shouldn't move points, only tint them. */
  if (!D) {
    for (let i = 0; i < 7; i++) {
      const y = HORIZON - 120 + rand() * 300;
      const h = 30 + rand() * 120;
      const m = ctx.createLinearGradient(0, y, 0, y + h);
      m.addColorStop(0, 'rgba(226,220,232,0)');
      m.addColorStop(0.5, `rgba(226,220,232,${0.05 + rand() * 0.10})`);
      m.addColorStop(1, 'rgba(226,220,232,0)');
      ctx.fillStyle = m;
      ctx.fillRect(0, y, W, h);
    }
  }

  /* A final blur on the colour pass only. The points sample this, so blurring
     it means neighbouring points agree with each other and the cloud reads as
     one surface rather than as confetti. Depth stays sharp so silhouettes
     keep their edges. */
  if (!D) {
    const blurred = document.createElement('canvas');
    blurred.width = W; blurred.height = H;
    const bx = blurred.getContext('2d');
    bx.filter = 'blur(3px)';
    bx.drawImage(canvas, 0, 0);
    return blurred;
  }
  return canvas;
}

/* One tree: a tapered trunk and a canopy built from overlapping blobs. */
function tree(ctx, rand, x, baseY, scale, { D, depth, haze, P }) {
  const h = (260 + rand() * 210) * scale;
  const trunkW = (13 + rand() * 12) * scale;
  const topY = baseY - h;

  ctx.fillStyle = P(jitterHex(mixHex('#4a4034', '#9a9080', haze), rand, 14), depth - 12);
  ctx.beginPath();
  ctx.moveTo(x - trunkW / 2, baseY);
  ctx.lineTo(x - trunkW * 0.17, topY + h * 0.24);
  ctx.lineTo(x + trunkW * 0.17, topY + h * 0.24);
  ctx.lineTo(x + trunkW / 2, baseY);
  ctx.closePath();
  ctx.fill();

  const blobs = D ? 52 : 330;
  const spread = (120 + rand() * 96) * scale;
  // Per-tree asymmetry, so no two canopies share a silhouette.
  const lean = (rand() - 0.5) * 0.9;
  const squash = 0.62 + rand() * 0.42;
  for (let i = 0; i < blobs; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.pow(rand(), 0.52) * spread;
    const bx = x + Math.cos(a) * r * (1 + lean * Math.sin(a));
    const by = topY + h * 0.30 + Math.sin(a) * r * squash - h * 0.12;
    // Small and numerous. Large discs stay legible AS discs no matter how
    // many you stack; small overlapping ones become foliage.
    const br = (7 + rand() * 19) * scale;

    if (D) {
      ctx.fillStyle = grey(depth + (rand() - 0.5) * 26);
    } else {
      // Canopy facing the light picks it up; the rest stays in silhouette.
      const lit = Math.max(0, 1 - Math.hypot(bx - ctx.canvas.width * 0.66,
                                             by - ctx.canvas.height * 0.20) / (ctx.canvas.width * 0.62));
      /* Most of a canopy is in shade; only the edge facing the light is
         actually lit. Raising `lit` to a power keeps the mass dark and puts
         the brightness where it belongs, which is what gives the trees a
         silhouette instead of turning them into pastel shrubs. */
      const k = Math.pow(Math.max(0, lit), 2.1) * 1.15 + rand() * 0.22;
      let c = mixHex('#16240f', '#7fae4c', Math.min(1, k));
      c = mixHex(c, '#d6cedc', haze * 0.9 + 0.05);
      if (rand() < 0.035) c = mixHex(c, '#e08ab6', 0.30 + rand() * 0.28); // blossom
      else if (rand() < 0.03) c = mixHex(c, '#fdf6fb', 0.34);             // catching the light
      ctx.fillStyle = jitterHex(c, rand, 20);
    }
    if (!D) ctx.globalAlpha = 0.55 + rand() * 0.45;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* ---- small colour helpers ------------------------------------------------ */
function grey(v) {
  const c = Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${c},${c},${c})`;
}
/* Accepts BOTH "#rrggbb" and "rgb(r,g,b)".

   This matters more than it looks: mixHex returns rgb(), and the tree
   canopies chain two mixes — base colour, then haze. The first version only
   parsed hex, so the second mix read its own rgb() output as NaN and treated
   it as black. Every canopy was therefore being blended FROM black, with the
   haze amount alone deciding how grey it came out, which is why the trees
   rendered as ink blots instead of foliage. */
function toRgb(c) {
  if (c[0] === '#') {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = c.match(/-?\d+(\.\d+)?/g);
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}
function mixHex(a, b, t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const A = toRgb(a), B = toRgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}
function jitterHex(c, rand, amt) {
  const m = toRgb(c);
  const j = (rand() - 0.5) * 2 * amt;
  return `rgb(${clamp(m[0] + j)},${clamp(m[1] + j)},${clamp(m[2] + j)})`;
}
function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

/* A more heavily blurred copy, used as the backdrop plane behind the points.
   The reference shows smooth colour BETWEEN its points — that is the source
   image visible through the stipple, not a background fill. Without this the
   gaps go to flat canvas colour and the cloud reads as confetti. */
export function blurredCopy(canvas, px = 26) {
  const out = document.createElement('canvas');
  out.width = canvas.width; out.height = canvas.height;
  const ctx = out.getContext('2d');
  ctx.filter = `blur(${px}px)`;
  ctx.drawImage(canvas, 0, 0);
  return out;
}
