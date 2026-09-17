/* ============================================================================
   light-volume.js — the atmosphere behind the points

   A stack of additive quads at staggered depths. Because they sit at
   different z, the perspective camera gives real parallax between them as it
   moves, which is most of what sells "volume" — the shader only has to sell
   "soft".
   ========================================================================= */

import * as THREE from 'three';
import { CONFIG } from './config.js';
import vertexShader from './shaders/light.vert.js';
import fragmentShader from './shaders/light.frag.js';

export function createLightVolume(layerCount = CONFIG.light.layers) {
  const L = CONFIG.light;
  const group = new THREE.Group();
  const uniformsList = [];
  const color = new THREE.Color(CONFIG.palette.light);

  /* Same trap as point density: low tiers draw 2 shafts and high tiers draw
     5, additively. Uncorrected, the high tier gets 2.5x the atmosphere and
     the whole frame lifts off black. Normalise per-layer intensity so the
     STACK totals the same amount of light however many layers make it up. */
  const layerScale = L.referenceLayers / Math.max(1, layerCount);

  const geometry = new THREE.PlaneGeometry(1, 1);

  for (let i = 0; i < layerCount; i++) {
    const t = layerCount === 1 ? 0.5 : i / (layerCount - 1);

    const uniforms = {
      uColor:      { value: color },
      uTime:       { value: 0 },
      uIntensity:  { value: L.intensity * layerScale },
      uLayer:      { value: t },
      uPointer:    { value: new THREE.Vector2() },
      uDistortion: { value: L.distortion },
      uScrollVel:  { value: 0 },
      uMotion:     { value: 1 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms, vertexShader, fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    // Furthest layers are largest, so they read as distant haze rather than
    // as obvious sheets of geometry.
    const scale = L.spread * (1.6 - t * 0.7);
    mesh.scale.set(scale, scale, 1);
    mesh.position.z = -18 + t * 16;
    mesh.position.x = (t - 0.5) * 7;
    mesh.rotation.z = (t - 0.5) * 0.55;
    mesh.renderOrder = 0;
    mesh.frustumCulled = false;

    group.add(mesh);
    uniformsList.push({ uniforms, mesh, t });
  }

  return {
    group,
    layers: uniformsList,

    update(time, fluid, motion) {
      for (const l of uniformsList) {
        l.uniforms.uTime.value = time;
        // Scaled by activation for the same reason the points are.
        l.uniforms.uPointer.value.set(fluid.pointer.x * fluid.activation,
                                      fluid.pointer.y * fluid.activation);
        l.uniforms.uScrollVel.value = fluid.scrollVel;
        l.uniforms.uMotion.value = motion;
        // Slow independent drift so the stack never resolves into a pattern.
        l.mesh.rotation.z += CONFIG.light.drift * 0.0016 * (l.t - 0.5) * motion;
      }
    },

    dispose() {
      geometry.dispose();
      uniformsList.forEach((l) => l.mesh.material.dispose());
    },
  };
}
