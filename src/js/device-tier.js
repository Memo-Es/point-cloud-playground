/* ============================================================================
   device-tier.js — pick a sensible starting point count

   This only chooses a DEFAULT. Once the panel is open the count belongs to
   whoever is dragging the slider, so there's no watchdog quietly overriding
   them later — a control that fights back is worse than a slow one.
   ========================================================================= */

import { TIERS } from './config.js';

const WEAK_GPU = /(intel.*(hd|uhd) graphics (4|5|6)\d{2})|(mali-[tg]?[0-6]\d{2})|(adreno \(tm\) [1-5]\d{2})|swiftshader|llvmpipe|software/i;

export function detectTier(renderer) {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  let gpu = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
  } catch { /* some browsers refuse this for fingerprinting reasons */ }

  if (WEAK_GPU.test(gpu)) return 0;

  let score = 0;
  if (cores >= 8) score += 1;
  if (cores >= 12) score += 1;
  if (memory >= 8) score += 1;
  if (!mobile) score += 1;

  // Phones cap at 'mid': thermal throttling makes anything higher
  // unsustainable past about a minute, however well they benchmark cold.
  if (mobile) return Math.min(1, score);
  return Math.max(0, Math.min(TIERS.length - 1, score));
}
