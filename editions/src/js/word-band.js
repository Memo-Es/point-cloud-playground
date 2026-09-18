/* ============================================================================
   word-band.js — the word as a 3D band

   One continuous stripe of type wrapped around a cylinder, not flat signs on
   a circle. On a real cylinder the LETTERS curve along the arc, and the
   mirrored copies you see are simply the inside of the band showing through
   from behind.

   Two things beyond that:

   - The band has two POSES. At rest it rings the cloud at its tilt; when the
     cloud transforms, the band flattens and lifts above the result. `pose`
     lerps between them, driven by the same progress as the morph.

   - The material is a shader, not a flat white map. See shaders/band.frag.js —
     refraction, chromatic fringing and iridescence all work off the gradient
     of the glyph alpha, which stands in for a surface normal.
   ========================================================================= */

import * as THREE from 'three';
import { STATE, BAND, EFFECT_IDS } from './config.js';
import vertexShader from './shaders/band.vert.js';
import fragmentShader from './shaders/band.frag.js';

export function createWordBand() {
  const group = new THREE.Group();     // carries the pose
  const spinner = new THREE.Group();   // spins on the band's own axis
  group.add(spinner);

  let geometry = null;
  let texture = null;
  let mesh = null;
  let builtText = null;
  let builtRepeats = null;
  let builtFont = null;
  let texAspect = 4;      // canvas w/h of one tile, for auto repeat

  const uniforms = {
    uMap:        { value: null },
    uScene:      { value: null },
    uTexel:      { value: new THREE.Vector2(1 / 1024, 1 / 256) },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uMode:       { value: EFFECT_IDS[STATE.bandEffect] ?? 3 },
    uStrength:   { value: STATE.bandStrength },
    uColor:      { value: new THREE.Color(STATE.bandColor) },
    uOpacity:    { value: 1 },
    uTime:       { value: 0 },
    uRepeat:     { value: -3 },
  };

  function build() {
    disposeMesh();

    texture = makeWordTexture(STATE.bandText, fontFamily());
    if (!texture) return;
    /* wrapS must stay RepeatWrapping so uv.x beyond 1 tiles. The COUNT is
       applied in the fragment shader via uRepeat, not through texture.repeat:
       three only feeds texture.repeat into its own materials' uvTransform,
       so on a custom ShaderMaterial it is silently ignored. */
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    uniforms.uRepeat.value = -effectiveRepeats();

    uniforms.uMap.value = texture;
    uniforms.uTexel.value.set(1 / texture.image.width, 1 / texture.image.height);
    texAspect = texture.image.width / texture.image.height;

    // Unit cylinder, scaled live — so diameter and height never rebuild.
    geometry = new THREE.CylinderGeometry(1, 1, 1, BAND.segments, 1, true);

    const material = new THREE.ShaderMaterial({
      uniforms, vertexShader, fragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
    });

    mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    spinner.add(mesh);

    builtText = STATE.bandText;
    builtRepeats = STATE.bandRepeats;
    builtFont = fontFamily();
  }

  /* How many times the word fits around the band.

     In auto mode this comes from the geometry rather than a slider: one tile
     spans circumference/repeats horizontally and bandHeight vertically, so
     repeats = circumference / (height x tileAspect) is the count at which the
     glyphs are undistorted. `bandLetterSize` scales away from that on
     purpose — bigger letters, fewer of them.

     It is recomputed every frame because it is only a texture.repeat write:
     changing the diameter never rebuilds anything. */
  function effectiveRepeats() {
    if (!STATE.bandAuto) return Math.max(1, Math.round(STATE.bandRepeats));
    const circumference = Math.PI * Math.max(0.1, STATE.bandDiameter);
    const tileW = Math.max(0.05, STATE.bandHeight) * texAspect * Math.max(0.2, STATE.bandLetterSize);
    return Math.max(1, Math.round(circumference / tileW));
  }

  function fontFamily() {
    return STATE.fontName ? `"${STATE.fontName}", ${BAND.fontFamily}` : BAND.fontFamily;
  }

  /* Cheap per-frame settings. Nothing here rebuilds anything. */
  function apply() {
    if (!mesh) return;
    uniforms.uRepeat.value = -effectiveRepeats();
    uniforms.uMode.value = EFFECT_IDS[STATE.bandEffect] ?? 0;
    uniforms.uStrength.value = STATE.bandStrength;
    uniforms.uColor.value.set(STATE.bandColor);
    group.visible = STATE.bandOn;
  }

  function disposeMesh() {
    if (mesh) { spinner.remove(mesh); mesh.material.dispose(); mesh = null; }
    if (geometry) { geometry.dispose(); geometry = null; }
    if (texture) { texture.dispose(); texture = null; }
  }

  build();
  apply();

  return {
    group,
    uniforms,
    get mesh() { return mesh; },

    /* Rebuild only for things baked into the texture. Diameter, height, tilt,
       colour and effect are all live. */
    refresh() {
      // Only the text and the typeface are baked in. The repeat count is a
      // texture wrap, so it never needs a rebuild.
      if (STATE.bandText !== builtText || fontFamily() !== builtFont) build();
      apply();
    },
    apply,
    effectiveRepeats,

    /* `pose` is 0 at rest and 1 when the cloud has transformed. */
    update(time, fluid, motion, pose) {
      if (!mesh || !STATE.bandOn) return;
      uniforms.uTime.value = time;

      uniforms.uRepeat.value = -effectiveRepeats();

      /* `stay` holds the rest pose and lets the cloud change underneath,
         which is a different and often better read than the band moving too. */
      const target = STATE.bandOnTransform === 'stay' ? 0 : pose;
      const p = target * target * (3 - 2 * target);   // ease it

      // Diameter and height are a scale on the unit cylinder.
      const r = Math.max(0.1, THREE.MathUtils.lerp(STATE.bandDiameter, STATE.bandDiameterOn, p)) / 2;
      const h = Math.max(0.05, THREE.MathUtils.lerp(STATE.bandHeight, STATE.bandHeightOn, p));
      mesh.scale.set(r, h, r);

      spinner.rotation.y = time * STATE.bandSpeed * motion;

      /* Tilt is measured from the band's axis being VERTICAL: small numbers
         give a wide flat sweep, near -90 points the axis at the camera and
         flattens it to a circle. Transforming lerps toward `bandTiltOn` and
         lifts the band clear of whatever the cloud became. */
      const tilt = THREE.MathUtils.lerp(STATE.bandTilt, STATE.bandTiltOn, p);
      group.rotation.x = THREE.MathUtils.degToRad(tilt)
                       + fluid.pointer.y * BAND.parallax * 0.25 * fluid.activation * motion;
      group.rotation.z = THREE.MathUtils.degToRad(BAND.roll)
                       + fluid.pointer.x * BAND.parallax * 0.18 * fluid.activation * motion;
      group.position.set(
        BAND.center[0],
        BAND.center[1] + STATE.bandLift * p,
        BAND.center[2],
      );
    },

    dispose: disposeMesh,
  };
}

/* One tile of the band: the word plus a trailing gap, so tiling it around the
   circumference reads as continuous rather than as words jammed together. */
function makeWordTexture(text, family) {
  const str = (text || '').trim() || 'EVERYWHERE';
  const FS = 256;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `${BAND.fontWeight} ${FS}px ${family}`;

  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${BAND.tracking}em`;
  const textW = Math.ceil(ctx.measureText(str).width);
  if (!textW) return null;

  const w = Math.min(4096, Math.ceil(textW * (1 + BAND.gap)));
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
