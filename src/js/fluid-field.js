/* ============================================================================
   fluid-field.js — smoothed cursor state

   One place that owns the pointer, so the shader and anything else that wants
   to react are reading the same smoothed numbers rather than each keeping
   their own copy of the mouse and disagreeing by a frame.
   ========================================================================= */

import { TUNING } from './config.js';

export function createFluidField(target) {
  const state = {
    pointer: { x: 0, y: 0 },   // smoothed, NDC
    raw:     { x: 0, y: 0 },
    /* Ramps 0 -> 1 on first real movement. The pointer's resting value is
       dead centre, so without this the field punches a hole through the
       middle of the shape before anyone has touched anything — and on a
       touch device, forever. */
    activation: 0,
    active: false,
  };

  function set(cx, cy) {
    const r = target.getBoundingClientRect();
    if (!r.width || !r.height) return;
    state.raw.x = ((cx - r.left) / r.width) * 2 - 1;
    state.raw.y = -(((cy - r.top) / r.height) * 2 - 1);
    state.active = true;
  }

  const onMove = (e) => set(e.clientX, e.clientY);
  const onLeave = () => { state.active = false; };
  target.addEventListener('pointermove', onMove, { passive: true });
  target.addEventListener('pointerleave', onLeave, { passive: true });

  return {
    state,
    update(dt) {
      const e = 1 - Math.pow(1 - TUNING.pointerEase, dt * 60);
      state.pointer.x += (state.raw.x - state.pointer.x) * e;
      state.pointer.y += (state.raw.y - state.pointer.y) * e;
      state.activation += ((state.active ? 1 : 0) - state.activation) * e * 0.6;
    },
    dispose() {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerleave', onLeave);
    },
  };
}
