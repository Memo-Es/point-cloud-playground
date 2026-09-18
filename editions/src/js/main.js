/* ============================================================================
   main.js — boot and render loop

   The panel owns STATE, this file owns the frame. The render loop reads STATE
   and writes uniforms; it never reads the DOM. That separation is why dragging
   a slider at 120Hz doesn't cost a layout.

   There is exactly one transformation: the cloud is the rest state, the
   trigger sends it to whatever the target is, and firing again brings it back.
   ========================================================================= */

import * as THREE from 'three';
import { STATE, TUNING, TIERS } from './config.js';
import { generate } from './shapes.js';
import { createPointCloud } from './point-cloud.js';
import { createWordBand } from './word-band.js';
import { createFluidField } from './fluid-field.js';
import { detectTier } from './device-tier.js';
import { initControls } from './controls.js';

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

boot().catch((err) => {
  console.error('[transform] boot failed', err);
  const frame = document.querySelector('.canvas-frame');
  if (frame) {
    frame.innerHTML = '<p style="color:rgba(250,248,245,.55);font-size:13px;padding:24px;text-align:center">'
      + 'This playground needs WebGL, which your browser could not start.</p>';
  }
});

async function boot() {
  const canvas = document.getElementById('gl');
  const frame = document.querySelector('.canvas-frame');

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, alpha: false,
    powerPreference: 'high-performance',
    // Needed so Export can read the canvas back.
    preserveDrawingBuffer: true,
  });

  const tier = TIERS[detectTier(renderer)];
  STATE.count = tier.count;
  const dpr = () => Math.min(window.devicePixelRatio || 1, tier.dpr);
  renderer.setPixelRatio(dpr());

  /* The text target and the band both rasterise a font, so waiting matters:
     sampling before the webfont lands silently yields the fallback's shapes. */
  try {
    await document.fonts.load('700 220px Inter');
    await document.fonts.ready;
  } catch { /* system font is an acceptable outcome */ }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 140);
  camera.position.set(0, 0, STATE.zoom);
  let camDist = STATE.zoom;

  // The group carries rotation, so orbiting never touches point data.
  const group = new THREE.Group();
  scene.add(group);

  const restPositions = () => generate('cloud', STATE.count, { thickness: 1.0 });
  const fontStack = () => (STATE.fontName
    ? `"${STATE.fontName}", 'Inter', system-ui, sans-serif`
    : "'Inter', system-ui, sans-serif");

  const targetPositions = () => generate(STATE.target, STATE.count, {
    thickness: STATE.thickness,
    text: STATE.cloudText,
    fontFamily: fontStack(),
    depth: STATE.textDepth,
  });

  /* The cloud gets its own pivot inside the group. Tilting the RESULT should
     rock the point cloud, not the band — sharing one transform would swing
     both and lose the contrast between them. */
  const cloudPivot = new THREE.Group();
  group.add(cloudPivot);

  let cloud = createPointCloud({
    count: STATE.count,
    positions: restPositions(),
    pixelRatio: dpr(),
  });
  cloudPivot.add(cloud.mesh);

  const band = createWordBand();
  group.add(band.group);

  const fluid = createFluidField(frame);

  /* Refraction needs a picture of the scene WITHOUT the band, so the letters
     have something real to bend. One extra pass, only while that effect is
     selected. */
  const sceneRT = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
  });
  const bufSize = new THREE.Vector2();

  /* ---- the one transformation ------------------------------------------ */
  let morphT = 1;
  let morphing = false;

  function fire() {
    // If a morph is still running, land it first — interpolating from a
    // half-way state would mean reading positions back off the GPU.
    if (morphing) cloud.commit();
    STATE.transformed = !STATE.transformed;
    cloud.setTarget(STATE.transformed ? targetPositions() : restPositions());
    morphT = 0;
    morphing = true;
    ui?.setTransformLabel(STATE.transformed);
    metaState.textContent = STATE.transformed ? STATE.target : 'cloud';
  }

  /* Re-aim without toggling — used when the target or its shape changes while
     already transformed, so the cloud follows the panel instead of going
     stale until the next button press. */
  function retarget() {
    if (!STATE.transformed) return;
    if (morphing) cloud.commit();
    cloud.setTarget(targetPositions());
    morphT = 0;
    morphing = true;
  }

  function rebuild() {
    cloudPivot.remove(cloud.mesh);
    cloud.dispose();
    cloud = createPointCloud({
      count: STATE.count,
      positions: STATE.transformed ? targetPositions() : restPositions(),
      pixelRatio: dpr(),
    });
    cloudPivot.add(cloud.mesh);
    morphT = 1; morphing = false;
    applyLive();
    metaPoints.textContent = STATE.count.toLocaleString();
  }

  /* ---- uniforms from STATE --------------------------------------------- */
  function applyLive() {
    const u = cloud.uniforms;
    u.uSize.value = STATE.size * cloud.sizeScale;
    u.uScale.value = STATE.scale;
    u.uScatter.value = STATE.scatter;
    u.uStagger.value = STATE.stagger;
    u.uFlow.value = STATE.drift * 0.6;
    u.uPointerForce.value = STATE.force;
    u.uPointerRadius.value = STATE.radius;
    u.uColorMode.value = STATE.colorMode;
    u.uGlow.value = STATE.glow;
    u.uC1.value.set(STATE.colors[0]);
    u.uC2.value.set(STATE.colors[1]);
    u.uC3.value.set(STATE.colors[2]);
    renderer.setClearColor(new THREE.Color(STATE.background), 1);
  }

  /* ---- drag to orbit ---------------------------------------------------- */
  let dragging = false, lastX = 0, lastY = 0;
  const spinVel = { x: 0, y: 0 };
  frame.style.cursor = 'grab';
  frame.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    frame.setPointerCapture(e.pointerId);
    frame.style.cursor = 'grabbing';
  });
  frame.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    spinVel.y += (e.clientX - lastX) * 0.005;
    spinVel.x += (e.clientY - lastY) * 0.005;
    lastX = e.clientX; lastY = e.clientY;
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try { frame.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    frame.style.cursor = 'grab';
  };
  frame.addEventListener('pointerup', endDrag);
  frame.addEventListener('pointercancel', endDrag);

  /* Wheel zoom. Multiplicative rather than additive, so a notch feels the
     same whether you are close in or far out — an additive step is glacial
     at distance and violent up close. Not passive, because the page must not
     scroll underneath the stage. */
  frame.addEventListener('wheel', (e) => {
    e.preventDefault();
    const k = Math.exp(e.deltaY * 0.0012);
    STATE.zoom = Math.min(TUNING.zoomMax, Math.max(TUNING.zoomMin, STATE.zoom * k));
    ui?.syncZoom();
  }, { passive: false });

  /* ---- resize ----------------------------------------------------------- */
  function resize() {
    const w = Math.max(1, frame.clientWidth);
    const h = Math.max(1, frame.clientHeight);
    renderer.setPixelRatio(dpr());
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    cloud.uniforms.uPixelRatio.value = dpr();
    renderer.getDrawingBufferSize(bufSize);
    sceneRT.setSize(Math.max(1, bufSize.x), Math.max(1, bufSize.y));
  }
  new ResizeObserver(resize).observe(frame);
  resize();

  /* ---- readouts --------------------------------------------------------- */
  const metaPoints = document.getElementById('meta-points');
  const metaFps = document.getElementById('meta-fps');
  const metaState = document.getElementById('meta-state');
  const morphFill = document.getElementById('morph-fill');
  metaPoints.textContent = STATE.count.toLocaleString();

  /* ---- controls --------------------------------------------------------- */
  const ui = initControls({
    onTarget: retarget,
    onCount: rebuild,
    onLive: applyLive,
    onBand: () => { band.refresh(); ui?.updateRepeatUI(); },
    onAction: (name) => {
      if (name === 'transform') fire();
      if (name === 'randomise') { if (!STATE.transformed) fire(); else retarget(); }
    },
    onExport: exportImage,
  });
  ui.setRepeatProbe(() => band.effectiveRepeats());
  applyLive();

  /* ---- export ----------------------------------------------------------- */
  function exportImage(fmt, scale) {
    const prev = renderer.getPixelRatio();
    try {
      if (scale !== 1) {
        renderer.setPixelRatio(prev * scale);
        renderer.setSize(frame.clientWidth, frame.clientHeight, false);
        cloud.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      }
      renderer.render(scene, camera);
      const url = canvas.toDataURL(fmt === 'jpg' ? 'image/jpeg' : 'image/png', 0.92);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transform-${STATE.transformed ? STATE.target : 'cloud'}-${Date.now()}.${fmt}`;
      a.click();
    } catch (err) {
      console.error('[export] failed', err);
    } finally {
      renderer.setPixelRatio(prev);
      resize();
    }
  }

  /* ---- loop ------------------------------------------------------------- */
  let last = performance.now();
  let fpsAcc = 0, fpsN = 0;
  let motion = prefersReduced.matches ? 0 : 1;

  renderer.setAnimationLoop((now) => {
    const dtMs = Math.min(64, now - last);
    last = now;
    const dt = dtMs / 1000;
    const time = now / 1000;

    fpsAcc += dtMs; fpsN++;
    if (fpsN >= 30) {
      metaFps.textContent = Math.round(1000 / (fpsAcc / fpsN));
      fpsAcc = 0; fpsN = 0;
    }

    const want = (prefersReduced.matches || STATE.paused) ? 0 : 1;
    motion += (want - motion) * (1 - Math.pow(0.86, dt * 60));

    fluid.update(dt);

    const u = cloud.uniforms;
    u.uTime.value = time;
    u.uMotion.value = motion;
    u.uPointer.value.set(fluid.state.pointer.x, fluid.state.pointer.y);
    u.uPointerActive.value = fluid.state.activation;

    /* Pause freezes the morph too, so it means "stop everything" rather than
       "stop only the parts you can see". */
    if (morphing) {
      morphT = Math.min(1, morphT + dt / Math.max(0.05, STATE.morphTime) * (motion > 0.02 ? 1 : 0));
      u.uMorph.value = morphT * morphT * (3 - 2 * morphT);
      morphFill.style.width = (morphT * 100).toFixed(1) + '%';
      if (morphT >= 1) {
        cloud.commit();
        morphing = false;
        morphFill.style.width = '0%';
      }
    }

    /* The band's pose follows the transformation on the same curve: 0 while
       the cloud is loose, 1 once it has become the target. */
    const pose = STATE.transformed ? morphT : 1 - morphT;
    band.update(time, fluid.state, motion, pose);

    /* Camera distance: the rest zoom, dollied toward `zoomOn` by the same
       pose the band uses, plus a slow breathe on top. Damped rather than set
       directly, so wheel notches and the transform never fight each other. */
    const wantDist = THREE.MathUtils.lerp(STATE.zoom, STATE.zoomOn, pose)
                   + Math.sin(time * STATE.breatheSpeed * Math.PI * 2) * STATE.breathe * motion;
    camDist += (wantDist - camDist) * (1 - Math.pow(1 - TUNING.zoomEase, dt * 60));
    camera.position.z = camDist;

    /* Tilting motion on the result. Two incommensurate frequencies so it
       never settles into an obvious loop, and scaled by `pose` so the loose
       cloud stays still and only the formed shape rocks. */
    const rock = STATE.tiltAmount * pose * motion;
    cloudPivot.rotation.x = Math.sin(time * STATE.tiltSpeed) * rock;
    cloudPivot.rotation.y = Math.cos(time * STATE.tiltSpeed * 0.73) * rock * 1.5;

    // Drag decays into rest rather than snapping back, so the two never fight.
    spinVel.x *= 0.92;
    spinVel.y *= 0.92;
    group.rotation.y += spinVel.y;
    group.rotation.x += spinVel.x;
    group.rotation.x = Math.max(-1.2, Math.min(1.2, group.rotation.x));

    if (STATE.bandOn && STATE.bandEffect === 'refract' && band.mesh) {
      // Pass one: everything but the band, into a texture.
      band.group.visible = false;
      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      band.group.visible = true;
      renderer.getDrawingBufferSize(bufSize);
      band.uniforms.uScene.value = sceneRT.texture;
      band.uniforms.uResolution.value.copy(bufSize);
    }

    renderer.render(scene, camera);
  });

  /* A live handle, on purpose — faster than the panel when hunting a number:
     PCH.state.scatter = 9; PCH.apply() */
  window.PCH = { state: STATE, uniforms: cloud.uniforms, apply: applyLive, fire, band, renderer, scene, camera };
}
