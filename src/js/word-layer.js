/* ============================================================================
   word-layer.js — crisp type suspended inside the cloud

   The single biggest thing a first pass at this effect gets wrong: making the
   headline out of points. The reference doesn't. Its type stays sharp vector
   lettering and is placed *inside* the volume — repeated, mirrored, rotated,
   at several depths — so the cloud reads as weather the type is standing in,
   rather than as a material the type is made of.

   That also means the type never has to fight the point budget for
   legibility, which is why it can stay this large and this thin.

   Each instance is a textured quad sharing one canvas texture. They are drawn
   after the points with depth testing off, so ordering is explicit and there
   is no sorting cost.
   ========================================================================= */

import * as THREE from 'three';
import { CONFIG } from './config.js';

const _c = new THREE.Vector3();   // scratch, to keep the loop allocation-free

export function createWordLayer() {
  const W = CONFIG.words;
  const group = new THREE.Group();
  const instances = [];

  const texture = makeWordTexture(W.hero);
  if (!texture) return { group, instances, update() {}, dispose() {} };

  const aspect = texture.image.width / texture.image.height;
  const geometry = new THREE.PlaneGeometry(1, 1);

  for (const spec of CONFIG.wordLayer.instances) {
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: spec.opacity,
      // Depth ordering is decided per frame from the word's actual distance
      // (see update), so the fog can pass in front of the far half of the
      // ring. Testing against the depth buffer wouldn't help: the points
      // never write to it.
      depthTest: false,
      depthWrite: false,
      // Both faces, because half the ring is seen from behind — that IS the
      // mirroring, and culling backfaces would delete it.
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(spec.size * aspect, spec.size, 1);
    mesh.frustumCulled = false;
    group.add(mesh);
    instances.push({ mesh, spec, baseOpacity: spec.opacity });
  }

  return {
    group,
    instances,

    /* `reveal` fades the layer as the hero leaves. `scrollProgress` turns
       the ring — scrolling is the primary driver; idle rotation is a slow
       secondary so the piece is alive before anyone touches it. */
    update(time, fluid, motion, reveal, scrollProgress, camera) {
      const D = CONFIG.wordLayer;
      const O = D.orbit;
      const tiltRad = THREE.MathUtils.degToRad(O.tilt);
      const spin = time * O.speed * motion + scrollProgress * O.scrollSpeed;

      for (let i = 0; i < instances.length; i++) {
        const { mesh, spec, baseOpacity } = instances[i];

        mesh.material.opacity = baseOpacity * reveal;
        mesh.visible = mesh.material.opacity > 0.004;
        if (!mesh.visible) continue;

        const a = THREE.MathUtils.degToRad(spec.angle) + spin;
        const r = spec.radius ?? O.radius;
        const phase = i * 1.7;

        const x = O.center[0] + Math.sin(a) * r;
        const z = O.center[2] + Math.cos(a) * r;
        // Wobble is keyed to the orbit angle, not to time, so a word sways
        // the same way every time it comes round — the motion reads as the
        // shape of the ring rather than as noise.
        const y = O.center[1] + spec.height
                + Math.sin(a * 2) * O.wobble * 0.25
                + Math.sin(time * 0.31 + phase) * D.drift * motion;

        mesh.position.set(
          x + fluid.pointer.x * D.parallax * spec.depthGain * fluid.activation,
          y + fluid.pointer.y * D.parallax * 0.55 * spec.depthGain * fluid.activation
            - fluid.scrollVel * D.scrollLag * spec.depthGain * motion,
          z,
        );

        /* Rotating by the orbit angle points each plane radially outward, so
           it reads correctly at the front of the ring and mirrored at the
           back. That single line is the whole effect. */
        mesh.rotation.set(tiltRad * Math.cos(a), a, THREE.MathUtils.degToRad(spec.spin ?? 0));

        /* Words further from the camera than the ring's centre draw before
           the points, so the fog rolls over them. */
        if (camera) {
          const d = camera.position.distanceTo(mesh.position);
          const dCentre = camera.position.distanceTo(
            _c.set(O.center[0], O.center[1], O.center[2]));
          mesh.renderOrder = d > dCentre ? 1 : 3;
        }
      }
    },

    dispose() {
      geometry.dispose();
      texture.dispose();
      instances.forEach(({ mesh }) => mesh.material.dispose());
    },
  };
}

/* Rasterise the word once, at a size generous enough that the largest
   instance is still sampling down rather than up. */
function makeWordTexture(text) {
  const T = CONFIG.text;
  const FS = 300;
  const pad = Math.round(FS * 0.22);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `${T.fontWeight} ${FS}px ${T.fontFamily}`;

  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${T.tracking}em`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = Math.ceil(FS * 1.3);
  if (!(w > 0 && h > 0)) return null;

  canvas.width = w; canvas.height = h;
  ctx.font = font;                       // resizing resets the 2D state
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${T.tracking}em`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;      // these quads are seen at a slant; without this
                           // the rotated instances go to mush
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
