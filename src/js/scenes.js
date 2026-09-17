/* ============================================================================
   scenes.js — the choreography

   Each entry is one staged moment, index-matched to `camera.keys` in
   config.js and to the `<section data-scene>` elements in index.html. All
   three arrays must stay the same length.

   Scene 0 and scene 5 are the photograph itself. Everything between is that
   same photograph rearranged — the abstract shapes take their colour by
   projecting back onto the picture plane, so the piece reads as one place
   coming apart and settling back rather than as a slideshow.
   ========================================================================= */

import { imageCloud, colourByProjection } from './image-cloud.js';
import { cloudPoints, spherePoints, panelPoints, wavePoints, torusPoints } from './shapes.js';

export function buildScenes(count, src) {
  const shaped = (positions, seed) => ({
    positions,
    colors: colourByProjection(positions, count, src),
    seed,
  });

  return [
    { id: 'hero',     ...imageCloud(count, src, { seed: 5 }) },
    { id: 'dissolve', ...shaped(cloudPoints(count, { radius: 5.0, flatten: 0.78 })) },
    { id: 'sphere',   ...shaped(spherePoints(count, { radius: 3.4, thickness: 0.7 })) },
    { id: 'panels',   ...shaped(panelPoints(count, { layers: 5, width: 11, height: 6.4, gap: 1.1 })) },
    { id: 'wave',     ...shaped(wavePoints(count, { width: 18, depthSpan: 16, amp: 1.5 })) },
    // Same picture, sprayed harder — it re-forms, but not quite as it was.
    { id: 'return',   ...imageCloud(count, src, { seed: 5, spray: 4.6, sprayStart: 0.40 }) },
    { id: 'outro',    ...shaped(cloudPoints(count, { radius: 7.0, flatten: 0.55, seed: 61 })) },
  ];
}

export { torusPoints };
