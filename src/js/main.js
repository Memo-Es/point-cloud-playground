/* ============================================================================
   main.js — boot and render loop

   Shape of the thing:

     DOM   ── content, type, links, focus order. Fully usable with WebGL off.
     WebGL ── atmosphere only. Never carries information the DOM doesn't.

   They're locked together by scroll, but the DOM is the source of truth. If
   the canvas fails to initialise the page is still a readable page — which is
   the only honest way to ship an effect this heavy.
   ========================================================================= */

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { detectTier, createBudgetWatchdog } from './device-tier.js';
import { createFluidField } from './fluid-field.js';
import { createScrollController } from './scroll.js';
import { buildScenes } from './scenes.js';
import { createPointCloud } from './point-cloud.js';
import { createLightVolume } from './light-volume.js';
import { createWordLayer } from './word-layer.js';
import { paintScene, blurredCopy } from './scene-painter.js';
import { readPainted, IMAGE_PLANE } from './image-cloud.js';

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

const app = {
  motionTarget: prefersReduced.matches ? 0 : 1,
  motion:       prefersReduced.matches ? 0 : 1,
  tier: 3,
  running: true,
};

boot().catch((err) => {
  console.error('[point-cloud-hero] boot failed', err);
  document.documentElement.classList.add('no-webgl');
  document.getElementById('loader')?.classList.add('is-done');
});

async function boot() {
  const canvas = document.getElementById('gl');
  const sections = [...document.querySelectorAll('[data-scene]')];

  /* ---- renderer ------------------------------------------------------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false,
      powerPreference: 'high-performance',
    });
  } catch {
    throw new Error('WebGL unavailable');
  }
  renderer.setClearColor(new THREE.Color(CONFIG.palette.background), 1);

  /* Tier is auto-detected, but ?tier=0..3 forces it — the only sane way to
     check what the low end actually looks like without owning a slow phone. */
  const forced = new URLSearchParams(location.search).get('tier');
  app.tier = forced !== null
    ? Math.max(0, Math.min(CONFIG.tiers.length - 1, parseInt(forced, 10) || 0))
    : detectTier(renderer);
  app.tierForced = forced !== null;
  let tierCfg = CONFIG.tiers[app.tier];
  const dpr = () => Math.min(window.devicePixelRatio || 1, tierCfg.dpr);
  renderer.setPixelRatio(dpr());
  renderer.setSize(window.innerWidth, window.innerHeight);

  /* ---- fonts ----------------------------------------------------------
     The text sampler reads whatever font is actually resolved, so sampling
     before the webfont lands silently produces the fallback's letterforms. */
  try {
    await document.fonts.load(`${CONFIG.text.fontWeight} 260px ${CONFIG.text.fontFamily}`);
    await document.fonts.ready;
  } catch { /* system font is an acceptable outcome; wrong shapes are not fatal */ }

  /* ---- scene ----------------------------------------------------------- */
  const scene = new THREE.Scene();
  scene.fog = null;

  const cam = CONFIG.camera;
  const camera = new THREE.PerspectiveCamera(cam.fov, window.innerWidth / window.innerHeight, cam.near, cam.far);
  camera.position.set(...cam.keys[0].pos);

  /* Paint the source image, then sample it. Everything the cloud knows about
     colour and depth comes from these two canvases. */
  const painted = paintScene({ width: 1600, height: 1000, seed: 7 });
  const src = readPainted(painted);

  const sceneData = buildScenes(tierCfg.points, src);
  let cloud = createPointCloud({
    scenes: sceneData,
    count: tierCfg.points,
    pixelRatio: dpr(),
  });
  scene.add(cloud.mesh);

  /* Backdrop: the same image, heavily blurred, on a plane behind everything.
     This is what shows THROUGH the stipple. Without it the gaps between
     points go to flat clear colour and the whole thing reads as confetti
     rather than as a photograph being taken apart. */
  const backdropTex = new THREE.CanvasTexture(blurredCopy(painted.colour, 11));
  backdropTex.colorSpace = THREE.SRGBColorSpace;
  const backdropZ = IMAGE_PLANE.zFar - 9;
  const bw = IMAGE_PLANE.worldWidth * 2.3;
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(bw, bw * (painted.height / painted.width)),
    new THREE.MeshBasicMaterial({ map: backdropTex, depthWrite: false, toneMapped: false }),
  );
  backdrop.position.z = backdropZ;
  backdrop.renderOrder = -1;
  backdrop.frustumCulled = false;
  scene.add(backdrop);

  let light = createLightVolume(tierCfg.lightLayers);
  scene.add(light.group);

  /* The type is scene geometry, not DOM overlaid on a canvas — it has to sit
     INSIDE the volume at real depths or the parallax gives it away. */
  const words = createWordLayer();
  scene.add(words.group);

  /* ---- post ------------------------------------------------------------ */
  let composer = null;
  if (tierCfg.bloom) composer = await makeComposer(renderer, scene, camera);

  /* ---- input ----------------------------------------------------------- */
  const fluid = createFluidField();
  const scroll = createScrollController({
    sectionCount: sections.length,
    reducedMotion: prefersReduced.matches,
  });
  await scroll.init();

  /* ---- intro ----------------------------------------------------------- */
  const gsap = await loadGsap();
  document.getElementById('loader')?.classList.add('is-done');

  if (app.motion === 0) {
    cloud.uniforms.uIntro.value = 1;
  } else if (gsap) {
    gsap.to(cloud.uniforms.uIntro, { value: 1, duration: 2.6, ease: 'power2.out', delay: 0.15 });
    gsap.fromTo('[data-intro]',
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: 1.1, stagger: 0.09, ease: 'power3.out', delay: 0.45 });
  } else {
    cloud.uniforms.uIntro.value = 1;
    document.querySelectorAll('[data-intro]').forEach((el) => { el.style.opacity = 1; });
  }

  initDom();

  /* ---- resize ----------------------------------------------------------- */
  const lookAt = new THREE.Vector3();
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  const lookA = new THREE.Vector3(), lookB = new THREE.Vector3();

  function fitScale() {
    const dist = 14;
    const visH = 2 * dist * Math.tan((cam.fov * Math.PI) / 360);
    const visW = visH * (window.innerWidth / window.innerHeight);
    return Math.max(0.3, Math.min(1, (visW * 0.86) / CONFIG.text.worldWidth));
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(dpr());
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer?.setSize(window.innerWidth, window.innerHeight);
    composer?.setPixelRatio?.(dpr());
    cloud.uniforms.uPixelRatio.value = dpr();
    cloud.uniforms.uFitScale.value = fitScale();
  }
  window.addEventListener('resize', debounce(onResize, 120));
  onResize();

  /* ---- the frame budget watchdog ---------------------------------------
     Drops dpr first (cheap, invisible), then bloom, then point count. Point
     count last because rebuilding the atlas costs a stall of its own. */
  const watchdog = createBudgetWatchdog(app.tierForced ? 0 : app.tier, (newTier, cfg, avgMs) => {
    console.info(`[tier] frame budget missed (${avgMs.toFixed(1)}ms) — dropping to "${cfg.name}"`);
    app.tier = newTier;
    tierCfg = cfg;
    renderer.setPixelRatio(dpr());
    cloud.uniforms.uPixelRatio.value = dpr();
    if (!cfg.bloom && composer) composer = null;
    document.documentElement.dataset.tier = cfg.name;
  });
  document.documentElement.dataset.tier = tierCfg.name;

  /* ---- pause offscreen -------------------------------------------------- */
  document.addEventListener('visibilitychange', () => { app.running = !document.hidden; });

  /* ---- motion toggle ---------------------------------------------------- */
  const toggle = document.getElementById('motion-toggle');
  const syncToggle = () => {
    const on = app.motionTarget === 1;
    toggle?.setAttribute('aria-pressed', String(on));
    if (toggle) toggle.querySelector('[data-label]').textContent = on ? 'Motion on' : 'Motion off';
  };
  toggle?.addEventListener('click', () => {
    app.motionTarget = app.motionTarget === 1 ? 0 : 1;
    syncToggle();
  });
  prefersReduced.addEventListener?.('change', (e) => {
    app.motionTarget = e.matches ? 0 : 1;
    syncToggle();
  });
  syncToggle();

  /* ---- live handle ------------------------------------------------------
     Exposed on purpose. Open the console and poke at it:
       PCH.uniforms.uScatter.value = 9
       PCH.uniforms.uColorA.value.set('#ff0066')
       PCH.uniforms.uSize.value = 6
     Faster than editing config.js and reloading when you're hunting for a
     number by eye. Nothing in the piece reads back from it. */
  window.PCH = {
    uniforms: cloud.uniforms,
    words,
    config: CONFIG,
    app,
    scroll: scroll.state,
    fluid: fluid.state,
    renderer, scene, camera, light, painted,
    get tier() { return CONFIG.tiers[app.tier].name; },
  };

  /* ---- render loop ------------------------------------------------------ */
  let last = performance.now();

  renderer.setAnimationLoop((now) => {
    const dtMs = Math.min(64, now - last);
    last = now;
    const dt = dtMs / 1000;
    watchdog.sample(dtMs);
    if (!app.running) return;

    const time = now / 1000;

    // Ease motion on/off rather than hard-cutting, so toggling isn't itself
    // a jarring motion event.
    app.motion += (app.motionTarget - app.motion) * (1 - Math.pow(0.88, dt * 60));

    scroll.update(now, dt);
    fluid.update(dt, scroll.state.velocity);

    const s = scroll.state;
    const f = fluid.state;
    const u = cloud.uniforms;

    u.uTime.value      = time;
    u.uSceneA.value    = s.sceneA;
    u.uSceneB.value    = s.sceneB;
    u.uMorph.value     = s.morph;
    u.uSceneWA.value   = cloud.sceneWeights[s.sceneA];
    u.uSceneWB.value   = cloud.sceneWeights[s.sceneB];
    u.uMotion.value    = app.motion;
    u.uPointer.value.set(f.pointer.x, f.pointer.y);
    u.uPointerSpeed.value = f.speed;
    u.uScrollVel.value    = f.scrollVel;
    // Gated, not just smoothed — see fluid-field.js.
    u.uPointerPush.value  = CONFIG.fluid.pointerPush * f.activation;

    /* Camera: lerped with NO hold, while the cloud holds. That mismatch is
       the parallax — the copy sits still and the world keeps moving. */
    const ka = cam.keys[Math.min(cam.keys.length - 1, s.sceneA)];
    const kb = cam.keys[Math.min(cam.keys.length - 1, s.sceneB)];
    const d = s.drift * s.drift * (3 - 2 * s.drift);

    tmpA.fromArray(ka.pos); tmpB.fromArray(kb.pos);
    tmpA.lerp(tmpB, d);
    tmpA.x += f.pointer.x * cam.parallax * app.motion;
    tmpA.y += f.pointer.y * cam.parallax * 0.6 * app.motion;
    camera.position.lerp(tmpA, 1 - Math.pow(1 - cam.parallaxEase, dt * 60));

    lookA.fromArray(ka.look); lookB.fromArray(kb.look);
    lookAt.copy(lookA).lerp(lookB, d);
    camera.lookAt(lookAt);

    light.update(time, f, app.motion);

    /* The words belong to the hero and leave with it. Driven off absolute
       scroll progress rather than the per-section morph, so they fade once
       and don't reappear on the way back up through later sections. */
    const reveal = 1 - Math.min(1, Math.max(0, s.progress / CONFIG.wordLayer.fadeEnd));
    words.update(time, f, app.motion, reveal * cloud.uniforms.uIntro.value,
                 s.progress, camera);

    if (composer) composer.render();
    else renderer.render(scene, camera);
  });
}

/* --------------------------------------------------------------------------
   Optional dependencies. Both bloom and GSAP are enhancements; if either CDN
   is unreachable the piece degrades instead of white-screening.
-------------------------------------------------------------------------- */
async function makeComposer(renderer, scene, camera) {
  try {
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
    ]);
    const c = new EffectComposer(renderer);
    c.addPass(new RenderPass(scene, camera));
    const B = CONFIG.bloom;
    c.addPass(new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      B.strength, B.radius, B.threshold));
    c.setSize(window.innerWidth, window.innerHeight);
    return c;
  } catch (err) {
    console.warn('[post] bloom unavailable, rendering direct', err);
    return null;
  }
}

async function loadGsap() {
  try {
    const m = await import('gsap');
    // gsap ships both a named and a default export, and which one resolves
    // depends on the build. Take whichever is there.
    return m.gsap || m.default || null;
  } catch (err) {
    console.warn('[gsap] unavailable, using CSS fallbacks', err);
    return null;
  }
}

/* --------------------------------------------------------------------------
   DOM reveals. IntersectionObserver rather than scroll maths, because the
   DOM layer genuinely is event-driven — it's the per-frame WebGL layer that
   must not be.
-------------------------------------------------------------------------- */
function initDom() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '-12% 0px -12% 0px' });

  document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));

  // Progress rail
  const rail = document.getElementById('rail-fill');
  if (rail) {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      rail.style.transform = `scaleY(${Math.min(1, window.scrollY / Math.max(1, max))})`;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const t = document.querySelector(a.getAttribute('href'));
      if (!t) return;
      e.preventDefault();
      t.scrollIntoView({ behavior: prefersReduced.matches ? 'auto' : 'smooth', block: 'start' });
    });
  });
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
