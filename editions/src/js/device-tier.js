/* ============================================================================
   device-tier.js — four-tier GPU scaling

   Pick a tier at boot from hardware signals, then watch the frame budget and
   step down if we guessed high. Stepping DOWN is automatic; stepping back up
   is deliberately not, because oscillating between tiers looks far worse than
   sitting one tier low.
   ========================================================================= */

import { CONFIG } from './config.js';

/* GPU strings that consistently can't hold 60fps with a large point cloud. */
const WEAK_GPU = /(intel.*(hd|uhd) graphics (4|5|6)\d{2})|(mali-[tg]?[0-6]\d{2})|(adreno \(tm\) [1-5]\d{2})|swiftshader|llvmpipe|software/i;

export function detectTier(renderer) {
  const cores  = navigator.hardwareConcurrency || 4;
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
  if (cores >= 8)  score += 1;
  if (cores >= 12) score += 1;
  if (memory >= 8) score += 1;
  if (!mobile)     score += 1;

  // Phones cap at 'mid' regardless — thermal throttling makes tier 2+
  // unsustainable past about a minute even when the first second looks fine.
  if (mobile) return Math.min(1, score);

  return Math.max(0, Math.min(3, score));
}

/* Rolling frame-time watchdog. Calls onDowngrade(newTier) at most once per
   step, and only after a sustained miss — a single long frame during asset
   decode is not a reason to drop quality for the rest of the session. */
export function createBudgetWatchdog(startTier, onDowngrade, { targetMs = 20, window: win = 90, patience = 2 } = {}) {
  let tier = startTier;
  let acc = 0, n = 0, strikes = 0, armed = false;

  // Ignore the first second entirely: shader compile and texture upload land
  // there and would trigger a false downgrade every time.
  setTimeout(() => { armed = true; }, 1200);

  return {
    get tier() { return tier; },
    sample(dt) {
      if (!armed || tier <= 0) return;
      acc += dt; n++;
      if (n < win) return;
      const avg = acc / n;
      acc = 0; n = 0;
      if (avg > targetMs) {
        if (++strikes >= patience) {
          strikes = 0;
          tier -= 1;
          onDowngrade(tier, CONFIG.tiers[tier], avg);
        }
      } else {
        strikes = 0;
      }
    },
  };
}
