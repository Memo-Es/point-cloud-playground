/* ============================================================================
   image-cloud.js — turning the painted scene into points

   Sampling is deliberately dumb: pick a pixel, take its colour, take its
   depth, place a point. That is what a photogrammetric point cloud from a
   single image actually is, and it's why the result reads as a photograph
   rather than as a simulation of one.

   Two departures from a straight projection:

   - Edge spray. Points near the frame edge get pushed outward and scattered
     in z, so the image dissolves into loose particles instead of ending at a
     hard rectangle. This is the effect's signature and it is worth more than
     any amount of extra density in the middle.

   - Depth relief. The depth canvas displaces points along z, which turns a
     flat picture into something the camera can actually move through. It is
     2.5D, not 3D: there is nothing behind the trees, which is exactly the
     limitation a single-image capture has.
   ========================================================================= */

import { rng } from './rng.js';

export function readPainted(painted) {
  const { colour, depth, width: W, height: H } = painted;
  return {
    W, H,
    c: colour.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data,
    d: depth.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data,
  };
}

export const IMAGE_PLANE = {
  worldWidth: 17.5,   // how wide the picture is in world units
  zNear:  1.6,        // depth 255 lands here
  zFar:  -7.2,        // depth 0 lands here
  sprayStart: 0.52,   // radial distance at which the edges start to break up
  spray:      3.1,    // how far the loose points fly
  sprayZ:     2.6,
};

export function imageCloud(count, src, opts = {}) {
  const O = { ...IMAGE_PLANE, ...opts };
  const rand = rng(opts.seed ?? 5);
  const { W, H, c, d } = src;

  const worldW = O.worldWidth;
  const worldH = worldW * (H / W);

  const positions = new Float32Array(count * 3);
  const colors = new Uint8Array(count * 3);

  for (let i = 0; i < count; i++) {
    const u = rand();
    const v = rand();
    const px = Math.min(W - 1, (u * W) | 0);
    const py = Math.min(H - 1, (v * H) | 0);
    const o = (py * W + px) * 4;

    let x = (u - 0.5) * worldW;
    let y = -(v - 0.5) * worldH;
    let z = O.zFar + (d[o] / 255) * (O.zNear - O.zFar);

    /* --- lay the ground down ---
       Tilting stretches the ground rows apart, which thins the point density
       exactly at the horizon and leaves a bright seam where the backdrop
       shows through. Re-sampling that band from a compressed v recovers the
       density the stretch costs. */
    if (v > O.horizon) {
      const near = (v - O.horizon) / (1 - O.horizon);
      y -= Math.pow(near, 1.6) * O.groundDrop;
      z += Math.pow(near, 1.3) * O.groundPush;
      if (near < 0.35) {
        // Extra points seeded into the seam, jittered so they don't band.
        y += (rand() - 0.5) * 0.30 * (1 - near / 0.35);
      }
    }

    /* --- edge spray ---
       Radial, but weighted so the top of frame throws more than the bottom —
       the ground should stay a ground, while the canopy and sky come apart. */
    const nx = (u - 0.5) * 2;
    const ny = (v - 0.5) * 2;
    const radial = Math.sqrt(nx * nx + ny * ny) / Math.SQRT2;
    let e = (radial - O.sprayStart) / (1 - O.sprayStart);
    if (e > 0) {
      e = Math.min(1, e);
      e = e * e;                                  // keep the onset gentle
      const upward = 1 + Math.max(0, -ny) * 0.9;  // -ny is up
      const k = e * upward;
      const dir = Math.atan2(ny, nx);
      const push = (0.35 + rand() * 0.65) * O.spray * k;
      x += Math.cos(dir) * push;
      y -= Math.sin(dir) * push;
      z += (rand() - 0.5) * O.sprayZ * k;
      // Scatter laterally too, or the spray reads as a clean radial starburst.
      x += (rand() - 0.5) * 1.5 * k;
      y += (rand() - 0.5) * 1.5 * k;
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    colors[i * 3] = c[o];
    colors[i * 3 + 1] = c[o + 1];
    colors[i * 3 + 2] = c[o + 2];
  }

  return { positions, colors };
}

/* Colour an arbitrary set of positions by projecting them back onto the
   picture plane. This is what keeps the abstract scenes — the sphere, the
   panels, the wave — inside the same world: they are the same photograph,
   rearranged, rather than a different palette entirely. */
export function colourByProjection(positions, count, src, opts = {}) {
  const O = { ...IMAGE_PLANE, ...opts };
  const { W, H, c } = src;
  const worldW = O.worldWidth;
  const worldH = worldW * (H / W);
  const colors = new Uint8Array(count * 3);

  for (let i = 0; i < count; i++) {
    const u = positions[i * 3] / worldW + 0.5;
    const v = -positions[i * 3 + 1] / worldH + 0.5;
    const px = Math.min(W - 1, Math.max(0, (u * W) | 0));
    const py = Math.min(H - 1, Math.max(0, (v * H) | 0));
    const o = (py * W + px) * 4;
    colors[i * 3] = c[o];
    colors[i * 3 + 1] = c[o + 1];
    colors[i * 3 + 2] = c[o + 2];
  }
  return colors;
}
