/* ============================================================================
   fluid-field.js — one shared disturbance field

   The point of this file is that there is only one of it. Cursor position,
   cursor speed and scroll velocity all land here, get smoothed here, and are
   read by the points, the light shafts and the post chain from the same
   object. Three effects reacting to one field read as a single material;
   three effects each smoothing their own copy of the mouse read as three
   unrelated gimmicks.

   Nothing in here touches the DOM or React-style state. Listeners write raw
   values; the render loop calls update() and reads the smoothed ones.
   ========================================================================= */

import { CONFIG } from './config.js';

export function createFluidField(target = window) {
  const f = CONFIG.fluid;

  const state = {
    pointer:   { x: 0, y: 0 },   // smoothed, NDC (-1..1)
    raw:       { x: 0, y: 0 },
    speed:     0,                 // smoothed cursor speed, 0..~3
    scrollVel: 0,                 // smoothed, clamped, signed
    active:    false,             // false until the user actually moves
    /* Ramps 0 -> 1 on first real pointer movement. The pointer's resting
       value is dead centre, so without this gate the field punches a hole
       through the middle of the hero word before the user has touched
       anything — and on a touch device, forever. */
    activation: 0,
  };

  let lastRaw = { x: 0, y: 0 };
  let rawSpeed = 0;

  function setFromEvent(cx, cy) {
    const x = (cx / window.innerWidth) * 2 - 1;
    const y = -((cy / window.innerHeight) * 2 - 1);
    rawSpeed += Math.hypot(x - lastRaw.x, y - lastRaw.y) * CONFIG.fluid.velocityGain;
    lastRaw = { x, y };
    state.raw.x = x;
    state.raw.y = y;
    state.active = true;
  }

  const onMove  = (e) => setFromEvent(e.clientX, e.clientY);
  const onTouch = (e) => { if (e.touches[0]) setFromEvent(e.touches[0].clientX, e.touches[0].clientY); };
  const onLeave = () => { state.raw.x = 0; state.raw.y = 0; };

  target.addEventListener('pointermove', onMove, { passive: true });
  target.addEventListener('touchmove', onTouch, { passive: true });
  target.addEventListener('pointerleave', onLeave, { passive: true });

  return {
    state,

    /* Called once per frame from the render loop. dt in seconds. */
    update(dt, scrollVelocity) {
      const e = 1 - Math.pow(1 - f.pointerEase, dt * 60);
      state.pointer.x += (state.raw.x - state.pointer.x) * e;
      state.pointer.y += (state.raw.y - state.pointer.y) * e;

      rawSpeed *= Math.pow(f.decay, dt * 60);
      state.speed += (Math.min(rawSpeed, 3) - state.speed) * e;

      const clamped = Math.max(-CONFIG.scroll.velocityClamp,
                      Math.min(CONFIG.scroll.velocityClamp, scrollVelocity));
      state.scrollVel += (clamped - state.scrollVel) * (e * 0.8);

      // Ease in rather than snap, so the first mouse move doesn't jolt.
      state.activation += ((state.active ? 1 : 0) - state.activation) * e * 0.6;
    },

    dispose() {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('touchmove', onTouch);
      target.removeEventListener('pointerleave', onLeave);
    },
  };
}
