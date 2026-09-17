/* ============================================================================
   point-cloud.js — the renderer

   All scene targets are packed into ONE float texture, laid out as vertical
   slices: scene 0 occupies rows [0,H), scene 1 rows [H,2H), and so on. A
   point looks up its own row/column from its index.

   The reason for the texture, rather than the obvious approach of swapping
   position attributes on each transition: swapping means re-uploading several
   megabytes to the GPU at the exact moment the user is scrolling, which is
   the one moment you cannot afford a stall. With an atlas, a transition costs
   two uniform writes.
   ========================================================================= */

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rng } from './shapes.js';
import vertexShader from './shaders/points.vert.js';
import fragmentShader from './shaders/points.frag.js';

export function createPointCloud({ scenes, count, pixelRatio }) {
  /* Atlas dimensions. 1024 wide is a safe texture width everywhere and keeps
     the height small enough to stay well inside MAX_TEXTURE_SIZE even with
     seven scenes stacked. */
  const W = Math.min(1024, count);
  const H = Math.ceil(count / W);
  const S = scenes.length;

  const data = new Float32Array(W * H * S * 4);
  /* Colour gets its own atlas, laid out identically — but at 8 bits per
     channel, not 32. Positions need float precision; colour never does, and
     an RGBA8 atlas is a quarter of the memory of a float one. (The reference
     goes further still and chroma-subsamples its baked point clouds; the
     same instinct, taken to where it actually pays.) */
  const cdata = new Uint8Array(W * H * S * 4);

  for (let s = 0; s < S; s++) {
    const src = scenes[s].positions;
    const csrc = scenes[s].colors;
    const base = s * W * H * 4;
    for (let i = 0; i < W * H; i++) {
      // Rows past `count` are padding; wrap so they hold valid data rather
      // than zeros, which would otherwise show as a clump at the origin.
      const j = i < count ? i : i % count;
      const o = base + i * 4;
      data[o]     = src[j * 3];
      data[o + 1] = src[j * 3 + 1];
      data[o + 2] = src[j * 3 + 2];
      data[o + 3] = 1;
      cdata[o]     = csrc[j * 3];
      cdata[o + 1] = csrc[j * 3 + 1];
      cdata[o + 2] = csrc[j * 3 + 2];
      cdata[o + 3] = 255;
    }
  }

  const posTex = new THREE.DataTexture(data, W, H * S, THREE.RGBAFormat, THREE.FloatType);
  posTex.minFilter = THREE.NearestFilter;
  posTex.magFilter = THREE.NearestFilter;
  posTex.generateMipmaps = false;
  posTex.needsUpdate = true;

  const colTex = new THREE.DataTexture(cdata, W, H * S, THREE.RGBAFormat, THREE.UnsignedByteType);
  colTex.minFilter = THREE.NearestFilter;
  colTex.magFilter = THREE.NearestFilter;
  colTex.generateMipmaps = false;
  colTex.colorSpace = THREE.SRGBColorSpace;
  colTex.needsUpdate = true;

  /* Per-point attributes. `position` is required by three but unused by the
     shader — the real position comes from the atlas. */
  const rand = rng(1337);
  const index   = new Float32Array(count);
  const random  = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  const dummy   = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    index[i] = i;
    random[i * 3] = rand(); random[i * 3 + 1] = rand(); random[i * 3 + 2] = rand();

    // Unit vector × cube-rooted radius = uniform density inside a ball.
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const r = Math.cbrt(rand());
    const sp = Math.sqrt(Math.max(0, 1 - u * u));
    scatter[i * 3]     = Math.cos(th) * sp * r;
    scatter[i * 3 + 1] = u * r;
    scatter[i * 3 + 2] = Math.sin(th) * sp * r;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',    new THREE.BufferAttribute(dummy, 3));
  geometry.setAttribute('aIndex',      new THREE.BufferAttribute(index, 1));
  geometry.setAttribute('aRandom',     new THREE.BufferAttribute(random, 3));
  geometry.setAttribute('aScatterDir', new THREE.BufferAttribute(scatter, 3));
  // Positions live in a texture, so three cannot compute a meaningful
  // bounding sphere and would cull the whole cloud on the first frame.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);

  const P = CONFIG.points, M = CONFIG.morph, F = CONFIG.fluid, PAL = CONFIG.palette;

  /* Per-scene spatial compensation.
     `densityScale` below handles point COUNT. This handles point SPREAD,
     which is a separate trap: pour the same 90,000 points into a sphere of
     radius 2.6 instead of a landscape 20 units wide and they cover a
     fraction of the screen at many times the overlap — the compact scenes
     blow out to white while the open ones look correct.

     Brightness goes roughly as count / area, so weighting by (R / Rref)^2
     — R being each scene's RMS radius — lands every scene at a comparable
     exposure. Measured on a stride so a 220k-point scene still costs
     microseconds. */
  const sceneWeights = scenes.map((sc) => rmsRadius(sc.positions, count));
  const refRadius = sceneWeights[0] || 1;
  for (let i = 0; i < sceneWeights.length; i++) {
    const ratio = sceneWeights[i] / refRadius;
    sceneWeights[i] = Math.min(1.3, Math.max(0.12, ratio * ratio));
  }

  /* Density compensation. Brightness under additive blending is roughly
     opacity × count, so a tier with 5× the points needs 1/5 the per-point
     opacity to land at the same exposure. Without this, every tier is a
     different picture and only one of them is the one you designed. */
  const densityScale = Math.min(1.4, P.densityReference / count);

  const uniforms = {
    uPosTex:        { value: posTex },
    uColTex:        { value: colTex },
    uTexSize:       { value: new THREE.Vector2(W, H) },
    uSceneCount:    { value: S },
    uSceneA:        { value: 0 },
    uSceneB:        { value: 0 },
    uMorph:         { value: 0 },
    uSceneWA:       { value: sceneWeights[0] },
    uSceneWB:       { value: sceneWeights[0] },

    uTime:          { value: 0 },
    uFitScale:      { value: 1 },
    uIntro:         { value: 0 },
    uMotion:        { value: 1 },

    uScatter:       { value: M.scatter },
    uStagger:       { value: M.stagger },
    uTurbulence:    { value: M.turbulence },
    uFlow:          { value: P.flow },
    uFlowSpeed:     { value: P.flowSpeed },

    uPointer:       { value: new THREE.Vector2() },
    uPointerRadius: { value: F.pointerRadius },
    uPointerPush:   { value: F.pointerPush },
    uPointerSpeed:  { value: 0 },
    uScrollVel:     { value: 0 },
    uScrollSmear:   { value: F.scrollSmear },

    uSize:           { value: P.sizeBase },
    uSizeVariance:   { value: P.sizeVariance },
    uScrollSizeGain: { value: F.scrollSizeGain },
    uPixelRatio:     { value: pixelRatio },
    uSizeScale:      { value: P.referenceDistance },

    /* Points carry their own colour now (uColTex). The accent is only a
       flash applied during a transition, and uTint lets the whole cloud be
       graded without regenerating a single scene. */
    uColorAccent: { value: new THREE.Color(PAL.accent) },
    uTint:        { value: new THREE.Color(PAL.tint) },
    uTintAmount:  { value: PAL.tintAmount },
    uExposure:    { value: P.exposure },
    uOpacity:     { value: P.opacity * densityScale },
    uSoftness:    { value: P.softness },
  };

  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true,
    // Additive on a dark ground is what turns a pile of dots into light.
    blending: THREE.AdditiveBlending,
    // Depth-sorting hundreds of thousands of transparent points is both
    // expensive and pointless under additive blending, where order doesn't
    // change the result.
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new THREE.Points(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;

  return {
    mesh,
    uniforms,
    sceneWeights,
    pointCount: count,
    dispose() {
      geometry.dispose();
      material.dispose();
      posTex.dispose();
      colTex.dispose();
    },
  };
}


/* RMS distance from the centroid — a cheap, outlier-tolerant measure of how
   much room a scene actually takes up. */
function rmsRadius(positions, count) {
  const stride = Math.max(1, Math.floor(count / 4000));
  let cx = 0, cy = 0, cz = 0, n = 0;
  for (let i = 0; i < count; i += stride) {
    cx += positions[i * 3]; cy += positions[i * 3 + 1]; cz += positions[i * 3 + 2]; n++;
  }
  if (!n) return 1;
  cx /= n; cy /= n; cz /= n;
  let acc = 0;
  for (let i = 0; i < count; i += stride) {
    const dx = positions[i * 3] - cx, dy = positions[i * 3 + 1] - cy, dz = positions[i * 3 + 2] - cz;
    acc += dx * dx + dy * dy + dz * dz;
  }
  return Math.sqrt(acc / n) || 1;
}
