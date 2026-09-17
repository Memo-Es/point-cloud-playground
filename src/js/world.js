/* ============================================================================
   world.js — the colour language of the scene

   The reference builds its point clouds from captured imagery: each point
   carries a colour sampled from a real photograph, which is what the custom
   .mdpc format exists to compress. There's no photograph here, so the colour
   has to be reasoned about instead of sampled — a small palette, assigned by
   region and by distance to a light source, with enough per-point variance to
   keep the characteristic speckle.

   Every generator in shapes.js pulls from this file, which is why the
   abstract scenes still read as the same world as the landscape.
   ========================================================================= */

/* Where the light lives. Everything warms toward it and everything far from
   it cools into haze. One light, consistently applied, does more for
   coherence than any amount of per-scene colour grading. */
export const LIGHT = [3.6, 3.2, -7];

export const PALETTE = {
  grassDeep:  [ 30,  58,  28],
  grassMid:   [ 76, 138,  54],
  grassLit:   [154, 204,  88],
  treeDark:   [ 30,  40,  28],
  treeMid:    [ 52,  70,  40],
  hazeCool:   [ 96,  92, 118],
  hazeWarm:   [164, 146, 176],
  glowPink:   [222, 170, 204],
  lightCore:  [255, 244, 250],
  speckWhite: [255, 255, 255],
  speckPink:  [235, 138, 178],
  speckLime:  [176, 214, 108],
};

export function mix(a, b, t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/* 0 at the light, 1 far from it. Drives both warmth and brightness. */
export function lightFalloff(x, y, z, radius = 11) {
  const d = Math.hypot(x - LIGHT[0], y - LIGHT[1], z - LIGHT[2]);
  return Math.min(1, d / radius);
}

/* Aerial perspective: distance fades everything toward the haze, which is
   what stops a deep scene reading as a flat sticker. */
export function aerial(col, z, strength = 0.45) {
  const t = Math.min(1, Math.max(0, (-z + 3) / 17)) * strength;
  return mix(col, PALETTE.hazeWarm, t);
}

/* The speckle. Roughly one point in nine ignores its region entirely and
   fires bright — white, pink or lime. Without these the cloud is a smooth
   gradient and loses the grain that makes it read as captured rather than
   generated. */
export function speckle(col, rand, chance = 0.09) {
  const r = rand();
  if (r > chance) return col;
  const pick = rand();
  const hot = pick < 0.56 ? PALETTE.speckWhite
            : pick < 0.78 ? PALETTE.speckPink
            :               PALETTE.speckLime;
  return mix(col, hot, 0.55 + rand() * 0.45);
}

/* Per-point tonal jitter, applied last. */
export function jitterCol(col, rand, amount = 26) {
  const j = (rand() - 0.5) * 2 * amount;
  return [col[0] + j, col[1] + j, col[2] + j];
}

export function writeCol(out, i, col) {
  out[i * 3]     = clamp255(col[0]);
  out[i * 3 + 1] = clamp255(col[1]);
  out[i * 3 + 2] = clamp255(col[2]);
}

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }
