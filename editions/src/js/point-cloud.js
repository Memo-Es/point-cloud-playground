/* ============================================================================
   point-cloud.js — the atlas and the material

   All seven scenes' positions are packed into ONE float texture, stacked as
   vertical slices. The alternative is swapping position attributes on every
   transition, which means re-uploading several megabytes to the GPU at the
   exact moment the user is scrolling — the one moment you cannot afford a
   stall. With an atlas, a transition costs two uniform writes.

   There is no colour atlas any more. Colour is computed in the shader from
   each point's position, so the palette is a uniform rather than a buffer.
   ========================================================================= */

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rng } from './rng.js';
import vertexShader from './shaders/points.vert.js';
import fragmentShader from './shaders/points.frag.js';

export function createPointCloud({ scenes, count, pixelRatio }) {
  const W = Math.min(1024, count);
  const H = Math.ceil(count / W);
  const S = scenes.length;

  const data = new Float32Array(W * H * S * 4);
  for (let s = 0; s < S; s++) {
    const src = scenes[s].positions;
    const base = s * W * H * 4;
    for (let i = 0; i < W * H; i++) {
      // Rows past `count` are padding; wrap them so they hold valid data
      // rather than zeros, which would show as a clump at the origin.
      const j = i < count ? i : i % count;
      const o = base + i * 4;
      data[o] = src[j * 3];
      data[o + 1] = src[j * 3 + 1];
      data[o + 2] = src[j * 3 + 2];
      data[o + 3] = 1;
    }
  }

  const posTex = new THREE.DataTexture(data, W, H * S, THREE.RGBAFormat, THREE.FloatType);
  posTex.minFilter = THREE.NearestFilter;
  posTex.magFilter = THREE.NearestFilter;
  posTex.generateMipmaps = false;
  posTex.needsUpdate = true;

  /* Per-scene exposure weight. Pour the same points into a compact shape and
     they cover a fraction of the screen at many times the overlap, so the
     tight scenes blow out while the open ones look right. Weighting by each
     scene's RMS radius lands them all at a comparable exposure. */
  const sceneWeights = scenes.map((sc) => rmsRadius(sc.positions, count));
  const ref = sceneWeights[0] || 1;
  for (let i = 0; i < sceneWeights.length; i++) {
    const ratio = sceneWeights[i] / ref;
    sceneWeights[i] = Math.min(1.3, Math.max(0.35, ratio * ratio));
  }

  const rand = rng(1337);
  const index = new Float32Array(count);
  const random = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  const dummy = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    index[i] = i;
    random[i * 3] = rand(); random[i * 3 + 1] = rand(); random[i * 3 + 2] = rand();
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const r = Math.cbrt(rand());
    const sp = Math.sqrt(Math.max(0, 1 - u * u));
    scatter[i * 3] = Math.cos(th) * sp * r;
    scatter[i * 3 + 1] = u * r;
    scatter[i * 3 + 2] = Math.sin(th) * sp * r;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(dummy, 3));
  geometry.setAttribute('aIndex', new THREE.BufferAttribute(index, 1));
  geometry.setAttribute('aRandom', new THREE.BufferAttribute(random, 3));
  geometry.setAttribute('aScatterDir', new THREE.BufferAttribute(scatter, 3));
  // Positions live in a texture, so three can't compute a meaningful bounding
  // sphere and would cull the whole cloud on the first frame.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);

  const P = CONFIG.points, M = CONFIG.morph, F = CONFIG.fluid, PAL = CONFIG.palette;

  /* Brightness under additive blending goes as opacity x count, so raising
     the count would otherwise just make everything brighter. Shrinking each
     point as 1/sqrt(count) holds exposure steady and spends the extra points
     on finer grain instead. */
  const sizeScale = Math.sqrt(P.densityReference / Math.max(1, count));

  const uniforms = {
    uPosTex:     { value: posTex },
    uTexSize:    { value: new THREE.Vector2(W, H) },
    uSceneCount: { value: S },
    uSceneA:     { value: 0 },
    uSceneB:     { value: 0 },
    uMorph:      { value: 0 },
    uSceneWA:    { value: sceneWeights[0] },
    uSceneWB:    { value: sceneWeights[0] },

    uTime:      { value: 0 },
    uFitScale:  { value: 1 },
    uIntro:     { value: 0 },
    uMotion:    { value: 1 },

    uScatter:    { value: M.scatter },
    uStagger:    { value: M.stagger },
    uTurbulence: { value: M.turbulence },
    uFlow:       { value: P.flow },
    uFlowSpeed:  { value: P.flowSpeed },

    uPointer:       { value: new THREE.Vector2() },
    uPointerRadius: { value: F.pointerRadius },
    uPointerPush:   { value: F.pointerPush },
    uPointerSpeed:  { value: 0 },
    uScrollVel:     { value: 0 },
    uScrollSmear:   { value: F.scrollSmear },

    uSize:           { value: P.sizeBase * sizeScale },
    uSizeScale:      { value: P.referenceDistance },
    uSizeVariance:   { value: P.sizeVariance },
    uScrollSizeGain: { value: F.scrollSizeGain },
    uPixelRatio:     { value: pixelRatio },
    uColorMode:      { value: PAL.colorMode },

    uC1:      { value: new THREE.Color(PAL.colors[0]) },
    uC2:      { value: new THREE.Color(PAL.colors[1]) },
    uC3:      { value: new THREE.Color(PAL.colors[2]) },
    uAccent:  { value: new THREE.Color(PAL.accent) },
    uGlow:    { value: P.glow },
    uOpacity: { value: P.opacity },
    uSoftness:{ value: P.softness },
  };

  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    // Depth-sorting hundreds of thousands of transparent points is expensive
    // and pointless under additive blending, where order can't change the
    // result anyway.
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new THREE.Points(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;

  return {
    mesh, uniforms, sceneWeights, pointCount: count,
    dispose() { geometry.dispose(); material.dispose(); posTex.dispose(); },
  };
}

/* RMS distance from the centroid — a cheap, outlier-tolerant measure of how
   much room a scene takes up. Sampled on a stride so a 220k-point scene still
   costs microseconds. */
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
