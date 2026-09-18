/* Vertex shader.

   Each point knows two positions — where it is (`position`, scene A) and
   where it's going (`aPosB`) — and blends between them with a per-point
   stagger. A burst term peaks halfway through, which is the whole "fly apart
   and re-gather" move.

   Colour is NOT baked into a buffer. It's derived here from the point's final
   position, so changing the palette or the gradient source is a uniform write
   and lands on the very next frame. In a playground that matters more than
   almost anything else: a control that needs a rebuild feels broken.
*/
export default /* glsl */`
precision highp float;

attribute vec3  aPosB;
attribute vec3  aRandom;
attribute vec3  aScatterDir;

uniform float uMorph;        // 0 = at A, 1 = at B
uniform float uStagger;
uniform float uScatter;
uniform float uTurbulence;
uniform float uFlow;
uniform float uFlowSpeed;
uniform float uTime;
uniform float uScale;
uniform float uMotion;       // 0 under reduced motion / pause

uniform vec2  uPointer;      // NDC
uniform float uPointerRadius;
uniform float uPointerForce;
uniform float uPointerActive;

uniform float uSize;
uniform float uSizeScale;    // reference depth: uSize reads as px here
uniform float uSizeVariance;
uniform float uPixelRatio;
uniform float uColorMode;

varying float vT;
varying float vBurst;
varying float vFade;

/* Three sines per axis. Not real curl noise — indistinguishable at this
   scale and a fraction of the cost. */
vec3 flowField(vec3 p, float t) {
  return vec3(
    sin(p.y * 0.60 + t * 0.70) + cos(p.z * 0.50 - t * 0.40),
    sin(p.z * 0.55 + t * 0.60) + cos(p.x * 0.45 + t * 0.50),
    sin(p.x * 0.50 - t * 0.50) + cos(p.y * 0.60 + t * 0.35)
  );
}

void main() {
  /* Stagger: every point starts its journey at a slightly different moment.
     Without it the cloud moves like a single slab and you can see instantly
     that it's one buffer. */
  float s  = uStagger * aRandom.x;
  float tt = clamp((uMorph - s) / max(1e-4, 1.0 - uStagger), 0.0, 1.0);
  tt = tt * tt * (3.0 - 2.0 * tt);

  vec3 pos = mix(position, aPosB, tt);

  /* sin(pi*x) is zero at both ends and one in the middle, so points can fly
     arbitrarily far out and are still guaranteed to land exactly on target.
     No cleanup pass, no snapping. */
  float burst = sin(uMorph * 3.14159265) * uMotion;
  vBurst = burst;

  pos += aScatterDir * burst * uScatter;
  pos += flowField(pos * 0.4 + aRandom * 2.0, uTime * 0.6) * burst * uTurbulence;
  pos += flowField(pos * 0.28, uTime * uFlowSpeed) * uFlow * uMotion;
  pos *= uScale;

  /* Colour source, chosen in the panel. Computed from the FINAL position so
     the gradient follows the shape rather than sliding over it. */
  float t;
  if      (uColorMode < 0.5) t = pos.y * 0.14 + 0.5;
  else if (uColorMode < 1.5) t = length(pos) / 4.6;
  else if (uColorMode < 2.5) t = pos.z * 0.14 + 0.5;
  else                       t = aRandom.y;
  vT = clamp(t, 0.0, 1.0);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / max(1e-4, clip.w);

  /* Cursor push, in screen space so it feels the same wherever the camera
     is. Gated on uPointerActive: the pointer's resting value is dead centre,
     and applying full force there would punch a hole through the middle of
     the shape before anyone has touched anything. */
  vec2 d = ndc - uPointer;
  float infl = smoothstep(uPointerRadius, 0.0, length(d)) * uPointerActive * uMotion;
  mv.xy += normalize(d + vec2(1e-5)) * infl * uPointerForce;

  gl_Position = projectionMatrix * mv;

  float jitter = 1.0 + (aRandom.z - 0.5) * 2.0 * uSizeVariance;
  gl_PointSize = uSize * uPixelRatio * jitter * (uSizeScale / max(0.001, -mv.z));
  gl_PointSize = clamp(gl_PointSize, 0.0, 48.0 * uPixelRatio);

  // Fade anything drifting behind the camera or far into the distance.
  vFade = smoothstep(0.0, 1.5, -mv.z) * (1.0 - smoothstep(30.0, 60.0, -mv.z));
}
`;
