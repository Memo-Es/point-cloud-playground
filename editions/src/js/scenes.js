/* ============================================================================
   scenes.js — the choreography

   Seven staged moments, index-matched to `camera.keys` in config.js and to the
   `<section data-scene>` elements in index.html. All three arrays must stay the
   same length.

   These are abstract volumes, not a picture. The earlier version sampled a
   painted forest, which was the wrong instinct twice over: procedurally
   painted trees never read as photographic, and a representational subject
   fights the type instead of carrying it.
   ========================================================================= */

import { generate } from './shapes.js';

export function buildScenes(count, thickness = 0.5) {
  const s = (id, t) => generate(id, count, { thickness: t ?? thickness });
  return [
    { id: 'hero',    positions: s('cloud',  0.9) },   // a loose nebula to open in
    { id: 'sphere',  positions: s('sphere', 0.5) },
    { id: 'helix',   positions: s('helix',  0.4) },
    { id: 'wave',    positions: s('wave',   0.5) },
    { id: 'galaxy',  positions: s('galaxy', 0.35) },
    { id: 'torus',   positions: s('torus',  0.45) },
    { id: 'outro',   positions: s('cloud',  1.0) },   // and dissolve back out
  ];
}
