/* ============================================================================
   main.js — boot and render loop

   Shape of the thing: the panel owns STATE, this file owns the frame. The
   render loop reads STATE and writes uniforms; it never reads the DOM. That
   separation is why dragging a slider at 120Hz doesn't cost a layout.
   ========================================================================= */

import * as THREE from 'three';
import { STATE, TUNING, TIERS, SHAPES } from './config.js';
import { generate } from './shapes.js';
import { createPointCloud } from './point-cloud.js';
import { createFluidField } from './fluid-field.js';
import { detectTier } from './device-tier.js';
import { initControls } from './controls.js';

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

boot().catch((err) => {
  console.error('[point-cloud] boot failed', err);
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
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    // Needed so the export button can read the canvas back. Costs a little
    // on some drivers; worth it for a tool whose output is a picture.
    preserveDrawingBuffer: true,
  });

  const tier = TIERS[detectTier(renderer)];
  STATE.count = tier.count;
  const dpr = () => Math.min(window.devicePixelRatio || 1, tier.dpr);
  renderer.setPixelRatio(dpr());

  /* The text shape samples a rasterised font, so waiting matters: sampling
     before the webfont lands silently produces the fallback's letterforms. */
  try {
    await document.fonts.load('700 220px Inter');
    await document.fonts.ready;
  } catch { /* system font is an acceptable outcome */ }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
  camera.position.set(0, 0, TUNING.cameraZ);

  // The group carries rotation, so spin and drag never touch point data.
  const group = new THREE.Group();
  scene.add(group);

  let positions = shapePositions();
  let cloud = createPointCloud({ count: STATE.count, positions, pixelRatio: dpr() });
  group.add(cloud.mesh);

  const fluid = createFluidField(frame);

  /* ---- morph state ------------------------------------------------------ */
  let morphT = 1;             // 1 = settled
  let morphing = false;

  function shapePositions() {
    return generate(STATE.shape, STATE.count, {
      thickness: STATE.thickness,
      text: STATE.text,
      fontFamily: "'Inter', system-ui, sans-serif",
    });
  }

  function goToShape() {
    // If a morph is still running, land it first. Interpolating from a
    // half-way state would mean reading positions back off the GPU.
    if (morphing) cloud.commit();
    positions = shapePositions();
    cloud.setTarget(positions);
    morphT = 0;
    morphing = true;
  }

  function rebuild() {
    const old = cloud;
    group.remove(old.mesh);
    old.dispose();
    positions = shapePositions();
    cloud = createPointCloud({ count: STATE.count, positions, pixelRatio: dpr() });
    group.add(cloud.mesh);
    morphT = 1; morphing = false;
    applyLive();
    updateMeta();
  }

  /* ---- uniforms from STATE ---------------------------------------------- */
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

  /* ---- drag to orbit ----------------------------------------------------- */
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

  /* ---- resize ------------------------------------------------------------ */
  function resize() {
    const w = Math.max(1, frame.clientWidth);
    const h = Math.max(1, frame.clientHeight);
    renderer.setPixelRatio(dpr());
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    cloud.uniforms.uPixelRatio.value = dpr();
  }
  new ResizeObserver(resize).observe(frame);
  resize();

  /* ---- controls ---------------------------------------------------------- */
  initControls({
    onShape: goToShape,
    onCount: rebuild,
    onLive: applyLive,
    onAction: (name) => {
      if (name === 'reform' || name === 'randomise') goToShape();
    },
    onExport: exportImage,
  });
  applyLive();

  /* ---- meta readout ------------------------------------------------------ */
  const metaPoints = document.getElementById('meta-points');
  const metaFps = document.getElementById('meta-fps');
  const metaTier = document.getElementById('meta-tier');
  metaTier.textContent = tier.name;
  function updateMeta() { metaPoints.textContent = STATE.count.toLocaleString(); }
  updateMeta();

  const morphFill = document.getElementById('morph-fill');

  /* ---- export ------------------------------------------------------------ */
  function exportImage(fmt, scale) {
    const prev = renderer.getPixelRatio();
    try {
      if (scale !== 1) {
        renderer.setPixelRatio(prev * scale);
        resizeForCapture(scale);
      }
      renderer.render(scene, camera);
      const mime = fmt === 'jpg' ? 'image/jpeg' : 'image/png';
      const url = canvas.toDataURL(mime, 0.92);
      const a = document.createElement('a');
      a.href = url;
      a.download = `point-cloud-${STATE.shape}-${Date.now()}.${fmt}`;
      a.click();
    } catch (err) {
      console.error('[export] failed', err);
    } finally {
      renderer.setPixelRatio(prev);
      resize();
    }
  }
  function resizeForCapture(scale) {
    const w = Math.max(1, frame.clientWidth);
    const h = Math.max(1, frame.clientHeight);
    renderer.setSize(w, h, false);
    cloud.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  }

  /* ---- loop --------------------------------------------------------------- */
  let last = performance.now();
  let fpsAcc = 0, fpsN = 0;
  let motion = prefersReduced.matches ? 0 : 1;

  renderer.setAnimationLoop((now) => {
    const dtMs = Math.min(64, now - last);
    last = now;
    const dt = dtMs / 1000;
    const time = now / 1000;

    // fps readout, averaged so it doesn't flicker
    fpsAcc += dtMs; fpsN++;
    if (fpsN >= 30) {
      metaFps.textContent = Math.round(1000 / (fpsAcc / fpsN));
      fpsAcc = 0; fpsN = 0;
    }

    const wantMotion = (prefersReduced.matches || STATE.paused) ? 0 : 1;
    motion += (wantMotion - motion) * (1 - Math.pow(0.86, dt * 60));

    fluid.update(dt);

    const u = cloud.uniforms;
    u.uTime.value = time;
    u.uMotion.value = motion;
    u.uPointer.value.set(fluid.state.pointer.x, fluid.state.pointer.y);
    u.uPointerActive.value = fluid.state.activation;

    /* Morph. Paused freezes it too, so Pause means "stop everything" rather
       than "stop only the parts you can see". */
    if (morphing) {
      morphT = Math.min(1, morphT + dt / Math.max(0.05, STATE.morphTime) * (motion > 0.02 ? 1 : 0));
      const e = morphT * morphT * (3 - 2 * morphT);
      u.uMorph.value = e;
      morphFill.style.width = (morphT * 100).toFixed(1) + '%';
      if (morphT >= 1) {
        cloud.commit();
        morphing = false;
        morphFill.style.width = '0%';
      }
    }

    // Spin: user drag decays into the steady auto-rotation rather than
    // snapping back, so the two never fight.
    spinVel.x *= 0.92;
    spinVel.y *= 0.92;
    group.rotation.y += (STATE.spin * 0.3 * dt * motion) + spinVel.y;
    group.rotation.x += spinVel.x;
    group.rotation.x = Math.max(-1.2, Math.min(1.2, group.rotation.x));

    renderer.render(scene, camera);
  });

  /* A live handle, on purpose. Faster than the panel when you're hunting for
     a number: PCH.state.scatter = 9; PCH.apply() */
  window.PCH = { state: STATE, uniforms: cloud.uniforms, apply: applyLive, go: goToShape, renderer, scene, camera, shapes: SHAPES };
}
