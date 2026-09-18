/* ============================================================================
   point-cloud.js — the buffers and the material

   Two position attributes: `position` is where the points are, `aPosB` is
   where they're going. A morph is one uniform going 0 → 1. When it lands,
   B is copied into A and the uniform resets — one buffer upload per shape
   change, which is a deliberate user action, not something that happens
   sixty times a second.
   ========================================================================= */

import * as THREE from 'three';
import { TUNING } from './config.js';
import { rng } from './rng.js';
import vertexShader from './shaders/points.vert.js';
import fragmentShader from './shaders/points.frag.js';

export function createPointCloud({ count, positions, pixelRatio }) {
  const geometry = new THREE.BufferGeometry();

  const posA = new Float32Array(positions);          // copy, not alias
  const posB = new Float32Array(positions);
  const random = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);

  const rand = rng(1337);
  for (let i = 0; i < count; i++) {
    random[i * 3] = rand(); random[i * 3 + 1] = rand(); random[i * 3 + 2] = rand();
    // Unit vector x cube-rooted radius = uniform density inside a ball.
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const r = Math.cbrt(rand());
    const sp = Math.sqrt(Math.max(0, 1 - u * u));
    scatter[i * 3] = Math.cos(th) * sp * r;
    scatter[i * 3 + 1] = u * r;
    scatter[i * 3 + 2] = Math.sin(th) * sp * r;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(posA, 3));
  geometry.setAttribute('aPosB', new THREE.BufferAttribute(posB, 3));
  geometry.setAttribute('aRandom', new THREE.BufferAttribute(random, 3));
  geometry.setAttribute('aScatterDir', new THREE.BufferAttribute(scatter, 3));
  // Points fly well outside their rest positions mid-morph, so a computed
  // bounding sphere would cull the cloud exactly when it's most visible.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);

  /* Size compensation. Brightness under additive blending goes as
     opacity x count, so raising the count would otherwise just make the
     whole thing brighter. Shrinking each point as 1/sqrt(count) instead
     holds exposure steady and spends the extra points on finer grain. */
  const sizeScale = Math.sqrt(TUNING.densityReference / Math.max(1, count));

  const uniforms = {
    uMorph:        { value: 0 },
    uStagger:      { value: 0.55 },
    uScatter:      { value: 3.6 },
    uTurbulence:   { value: TUNING.turbulence },
    uFlow:         { value: 0.22 },
    uFlowSpeed:    { value: TUNING.flowSpeed },
    uTime:         { value: 0 },
    uScale:        { value: 1 },
    uMotion:       { value: 1 },

    uPointer:       { value: new THREE.Vector2() },
    uPointerRadius: { value: 0.36 },
    uPointerForce:  { value: 0.9 },
    uPointerActive: { value: 0 },

    uSize:         { value: 2.4 * sizeScale },
    uSizeScale:    { value: TUNING.referenceDistance },
    uSizeVariance: { value: TUNING.sizeVariance },
    uPixelRatio:   { value: pixelRatio },
    uColorMode:    { value: 0 },

    uC1:     { value: new THREE.Color('#C45D35') },
    uC2:     { value: new THREE.Color('#F0A16A') },
    uC3:     { value: new THREE.Color('#FBE3C0') },
    uAccent: { value: new THREE.Color('#FFFFFF') },
    uGlow:    { value: 0.85 },
    uOpacity: { value: 0.9 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    // Depth-sorting a few hundred thousand transparent points is expensive
    // and pointless under additive blending, where order can't change the
    // result anyway.
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new THREE.Points(geometry, material);
  mesh.frustumCulled = false;

  return {
    mesh,
    uniforms,
    count,
    sizeScale,

    /* Aim the cloud at a new set of positions. */
    setTarget(next) {
      geometry.attributes.aPosB.array.set(next);
      geometry.attributes.aPosB.needsUpdate = true;
    },

    /* Land it: B becomes the new resting place, morph resets to zero. */
    commit() {
      geometry.attributes.position.array.set(geometry.attributes.aPosB.array);
      geometry.attributes.position.needsUpdate = true;
      uniforms.uMorph.value = 0;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
