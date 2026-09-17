/* ============================================================================
   scenes.js — the choreography

   Each entry is one staged moment: a target shape and the DOM section it's
   locked to. The order here IS the order of the page; change it and both the
   WebGL and the scroll maths follow. Keep this array, `camera.keys` in
   config.js, and the `<section data-scene>` elements in index.html the same
   length — they're index-matched.

   Note that the landscape bookends the sequence. The abstract scenes in
   between are the same world rearranged (they borrow its colour logic from
   world.js), so the piece reads as one place coming apart and settling back,
   rather than as a slideshow of unrelated shapes.
   ========================================================================= */

import {
  landscapePoints, worldCloud, worldSphere,
  worldPanels, worldWave, worldTorus, worldText,
} from './shapes.js';

export function buildScenes(count) {
  return [
    { id: 'hero',     ...landscapePoints(count, { seed: 3, treeCount: 8 }) },
    { id: 'dissolve', ...worldCloud(count, { radius: 4.0, flatten: 0.72 }) },
    { id: 'sphere',   ...worldSphere(count, { radius: 2.6, thickness: 0.45 }) },
    { id: 'panels',   ...worldPanels(count, { layers: 5, width: 7, height: 4.0, gap: 1.0 }) },
    { id: 'wave',     ...worldWave(count, { width: 13, depthSpan: 14, amp: 1.0 }) },
    { id: 'return',   ...landscapePoints(count, { seed: 19, treeCount: 6, lean: 0.4 }) },
    { id: 'outro',    ...worldCloud(count, { radius: 5.0, flatten: 0.5, seed: 61 }) },
  ];
}

/* Spares — swap either into buildScenes to try it. worldText makes the cloud
   spell a word, which is a good effect but a different one. */
export { worldTorus, worldText };
