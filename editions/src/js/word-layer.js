/* ============================================================================
   word-layer.js — the word as a 3D band

   The reference is one continuous stripe of type wrapped around a cylinder,
   not a set of flat signs placed on a circle. That distinction is the whole
   look: on a real cylinder the LETTERS themselves curve along the arc, and
   the mirrored copies you see are just the inside of the band showing through
   from behind.

   An earlier version here used flat quads at angles on a ring. It produced
   mirrored words, but they read as floating cards because each one stayed
   flat — no amount of positioning fixes that, because the curvature is the
   thing your eye is reading.

   So: an open-ended cylinder, the word tiled around its circumference with
   RepeatWrapping, rendered DoubleSide. The mirroring then costs nothing — the
   back faces of a cylinder ARE the inside, seen in reverse.
   ========================================================================= */

import * as THREE from 'three';
import { CONFIG } from './config.js';

export function createWordLayer() {
  const R = CONFIG.wordRing;
  const group = new THREE.Group();     // carries the tilt
  const spinner = new THREE.Group();   // spins on the band's own axis
  group.add(spinner);

  const texture = makeWordTexture(CONFIG.words.hero);
  if (!texture) return { group, update() {}, dispose() {} };

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // A negative repeat mirrors the map, which is cheaper and sharper than
  // re-drawing the glyphs flipped into the canvas.
  texture.repeat.set(R.mirror ? -R.repeats : R.repeats, 1);

  const geometry = new THREE.CylinderGeometry(
    R.radius, R.radius, R.bandHeight,
    R.segments, 1,
    true,            // open-ended: a band, not a drum
  );

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    /* alphaTest turns the glyphs into a depth-writing cutout, which is what
       makes the near arc correctly cover the far one. Without it the two
       halves of the band blend into each other wherever they cross. */
    alphaTest: 0.35,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  spinner.add(mesh);

  /* Tilt lives on the parent so that spinning is always around the band's own
     axis. Putting both on one object makes the two rotations fight, and the
     band wobbles instead of turning. */
  group.rotation.set(
    THREE.MathUtils.degToRad(R.tilt[0]),
    THREE.MathUtils.degToRad(R.tilt[1]),
    THREE.MathUtils.degToRad(R.tilt[2]),
  );
  group.position.set(...R.center);

  return {
    group,
    mesh,
    material,

    update(time, fluid, motion, reveal, scrollProgress) {
      material.opacity = reveal;
      mesh.visible = reveal > 0.004;
      if (!mesh.visible) return;

      // Scroll is the primary driver; the idle turn only keeps it alive
      // before anyone touches the page.
      spinner.rotation.y = time * R.speed * motion + scrollProgress * R.scrollSpeed;

      // The whole band leans toward the cursor, which sells its depth far
      // more cheaply than moving the camera.
      group.rotation.x = THREE.MathUtils.degToRad(R.tilt[0])
                       + fluid.pointer.y * R.parallax * 0.25 * fluid.activation * motion;
      group.rotation.z = THREE.MathUtils.degToRad(R.tilt[2])
                       + fluid.pointer.x * R.parallax * 0.18 * fluid.activation * motion;
      group.position.y = R.center[1]
                       - fluid.scrollVel * R.scrollLag * motion
                       + Math.sin(time * 0.21) * R.drift * motion;
    },

    dispose() {
      geometry.dispose();
      texture.dispose();
      material.dispose();
    },
  };
}

/* One tile of the band: the word plus trailing space, so tiling it around the
   circumference reads as continuous rather than as words jammed together. */
function makeWordTexture(text) {
  const T = CONFIG.text;
  const R = CONFIG.wordRing;
  const FS = 256;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `${T.fontWeight} ${FS}px ${T.fontFamily}`;

  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${T.tracking}em`;
  const textW = Math.ceil(ctx.measureText(text).width);
  if (!textW) return null;

  const w = Math.ceil(textW * (1 + R.gap));
  const h = Math.ceil(FS * 1.35);
  canvas.width = w; canvas.height = h;

  ctx.font = font;                 // resizing the canvas resets 2D state
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${T.tracking}em`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  // The band is seen at a hard slant almost everywhere; without anisotropy
  // the far side of it turns to mush.
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
