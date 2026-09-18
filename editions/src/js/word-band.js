/* ============================================================================
   word-band.js — the word as a 3D band

   One continuous stripe of type wrapped around a cylinder, not flat signs
   placed on a circle. That distinction is the whole look: on a real cylinder
   the LETTERS themselves curve along the arc, and the mirrored copies you see
   are simply the inside of the band showing through from behind.

   Everything here is rebuilt when the text changes and adjusted live
   otherwise, so dragging the diameter slider never costs a rebuild.
   ========================================================================= */

import * as THREE from 'three';
import { STATE, BAND } from './config.js';

export function createWordBand() {
  const group = new THREE.Group();     // carries the tilt
  const spinner = new THREE.Group();   // spins on the band's own axis
  group.add(spinner);

  let geometry = null;
  let texture = null;
  let mesh = null;
  let builtText = null;
  let builtRepeats = null;

  function build() {
    dispose();

    texture = makeWordTexture(STATE.text);
    if (!texture) return;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    /* A negative repeat mirrors the map. The camera looks into the tube, so
       the wall facing us is the cylinder's INSIDE and the type would
       otherwise come out backwards; flipping puts the readable face where
       you actually look and leaves the far wall mirrored, which is the
       effect we wanted anyway. */
    texture.repeat.set(-STATE.bandRepeats, 1);

    geometry = new THREE.CylinderGeometry(
      1, 1, 1,                 // unit cylinder — scaled live, so diameter and
      BAND.segments, 1, true,  // height never trigger a rebuild
    );

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      /* alphaTest makes the glyphs a depth-writing cutout, so the near arc
         correctly covers the far one. Without it the two halves of the band
         blend into each other wherever they cross. */
      alphaTest: 0.35,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    spinner.add(mesh);

    builtText = STATE.text;
    builtRepeats = STATE.bandRepeats;
  }

  /* Cheap per-frame settings. Diameter and height are a scale, not geometry. */
  function apply() {
    if (!mesh) return;
    const r = Math.max(0.1, STATE.bandDiameter / 2);
    mesh.scale.set(r, Math.max(0.05, STATE.bandHeight), r);
    mesh.material.opacity = 1;
    /* Tilt is measured from the band's axis being VERTICAL. Small numbers
       give a steeply-seen ring — a wide flat sweep — while numbers near -90
       point the axis at the camera and flatten it into a circle. */
    group.rotation.x = THREE.MathUtils.degToRad(STATE.bandTilt);
    group.rotation.z = THREE.MathUtils.degToRad(BAND.roll);
    group.position.set(...BAND.center);
    group.visible = STATE.bandOn;
  }

  function dispose() {
    if (mesh) { spinner.remove(mesh); mesh.material.dispose(); mesh = null; }
    if (geometry) { geometry.dispose(); geometry = null; }
    if (texture) { texture.dispose(); texture = null; }
  }

  build();
  apply();

  return {
    group,
    get mesh() { return mesh; },

    /* Rebuild only when something baked into the texture or geometry changed. */
    refresh() {
      if (STATE.text !== builtText || STATE.bandRepeats !== builtRepeats) build();
      apply();
    },
    apply,

    update(time, fluid, motion) {
      if (!mesh || !STATE.bandOn) return;
      spinner.rotation.y = time * STATE.bandSpeed * motion;
      // The band leans toward the cursor, which sells its depth far more
      // cheaply than moving the camera.
      group.rotation.x = THREE.MathUtils.degToRad(STATE.bandTilt)
                       + fluid.pointer.y * BAND.parallax * 0.25 * fluid.activation * motion;
      group.rotation.z = THREE.MathUtils.degToRad(BAND.roll)
                       + fluid.pointer.x * BAND.parallax * 0.18 * fluid.activation * motion;
    },

    dispose,
  };
}

/* One tile of the band: the word plus a trailing gap, so tiling it around the
   circumference reads as continuous rather than as words jammed together. */
function makeWordTexture(text) {
  const str = (text || '').trim() || 'EVERYWHERE';
  const FS = 256;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `${BAND.fontWeight} ${FS}px ${BAND.fontFamily}`;

  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${BAND.tracking}em`;
  const textW = Math.ceil(ctx.measureText(str).width);
  if (!textW) return null;

  const w = Math.ceil(textW * (1 + BAND.gap));
  const h = Math.ceil(FS * 1.35);
  canvas.width = w; canvas.height = h;

  ctx.font = font;              // resizing the canvas resets 2D state
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${BAND.tracking}em`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(str, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  // The band is seen at a hard slant almost everywhere; without anisotropy
  // its far side turns to mush.
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
