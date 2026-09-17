/* Vertex shader for the point cloud.

   Every scene's target positions live in a single float texture. A point
   looks up its own position in scene A and scene B, blends between them,
   and adds a scatter burst that peaks halfway through the transition. That
   burst is the whole "type dissolving and reforming" effect.

   Nothing here reads JS state per-frame except uniforms, and the uniforms
   are written from a plain mutable object inside the render loop — never
   from an event handler. That's what keeps 120Hz scrolling off the main
   thread's critical path.
*/
export default /* glsl */`
precision highp float;

uniform sampler2D uPosTex;
uniform sampler2D uColTex;
uniform vec2  uTexSize;      // width, height of ONE scene slice
uniform float uSceneCount;
uniform float uSceneA;
uniform float uSceneB;
uniform float uMorph;        // 0 = fully scene A, 1 = fully scene B
uniform float uSceneWA;      // per-scene exposure weight (see point-cloud.js)
uniform float uSceneWB;

uniform float uTime;
uniform float uFitScale;     // shrinks everything on narrow viewports
uniform float uIntro;        // 0..1 boot reveal
uniform float uMotion;       // 1 = animated, 0 = reduced-motion still

uniform float uScatter;
uniform float uStagger;
uniform float uTurbulence;
uniform float uFlow;
uniform float uFlowSpeed;

uniform vec2  uPointer;      // NDC
uniform float uPointerRadius;
uniform float uPointerPush;
uniform float uPointerSpeed;
uniform float uScrollVel;
uniform float uScrollSmear;

uniform float uSize;
uniform float uSizeVariance;
uniform float uScrollSizeGain;
uniform float uPixelRatio;
uniform float uSizeScale;   // reference distance: uSize reads as px at this depth

attribute float aIndex;
attribute vec3  aRandom;
attribute vec3  aScatterDir;

varying vec3  vColor;
varying float vBurst;
varying float vFade;

/* Both atlases share a layout, so one uv function serves both. */
vec2 atlasUV(float scene) {
  float x = mod(aIndex, uTexSize.x);
  float y = floor(aIndex / uTexSize.x);
  float totalH = uTexSize.y * uSceneCount;
  return vec2((x + 0.5) / uTexSize.x,
              (y + scene * uTexSize.y + 0.5) / totalH);
}
vec3 samplePos(float scene) { return texture2D(uPosTex, atlasUV(scene)).xyz; }
vec3 sampleCol(float scene) { return texture2D(uColTex, atlasUV(scene)).rgb; }

/* Cheap divergence-free-ish drift. Not real curl noise — three sines per
   axis is indistinguishable at this scale and costs a fraction as much. */
vec3 flowField(vec3 p, float t) {
  return vec3(
    sin(p.y * 0.60 + t * 0.70) + cos(p.z * 0.50 - t * 0.40),
    sin(p.z * 0.55 + t * 0.60) + cos(p.x * 0.45 + t * 0.50),
    sin(p.x * 0.50 - t * 0.50) + cos(p.y * 0.60 + t * 0.35)
  );
}

void main() {
  vec3 a = samplePos(uSceneA);
  vec3 b = samplePos(uSceneB);

  /* Per-point stagger: each point starts its journey at a slightly
     different moment, so the cloud trails rather than snapping as a slab. */
  float s  = uStagger * aRandom.x;
  float tt = clamp((uMorph - s) / max(1e-4, 1.0 - uStagger), 0.0, 1.0);
  tt = tt * tt * (3.0 - 2.0 * tt);

  vec3 pos = mix(a, b, tt);

  /* The burst. sin(pi*x) is 0 at both ends and 1 in the middle, so points
     are guaranteed to land exactly on target no matter how hard they fly. */
  float burst = sin(uMorph * 3.14159265) * uMotion;
  vBurst = burst;

  vec3 swirl = flowField(pos * 0.4 + aRandom * 2.0, uTime * 0.6);
  pos += aScatterDir * burst * uScatter;
  pos += swirl * burst * uTurbulence;

  /* Ambient drift so the cloud is never completely dead. */
  pos += flowField(pos * 0.25, uTime * uFlowSpeed) * uFlow * uMotion;

  /* Boot reveal: points arrive from far behind the camera. */
  pos = mix(pos + aScatterDir * 9.0, pos, uIntro);

  pos.xy *= uFitScale;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / max(1e-4, clip.w);

  /* ---- the fluid field ------------------------------------------------
     Cursor position and cursor speed push points apart in screen space;
     scroll velocity smears them vertically. Both feed the same few lines
     so the reactions stay coherent instead of fighting each other. */
  vec2 d = ndc - uPointer;
  float dist = length(d);
  float infl = smoothstep(uPointerRadius, 0.0, dist) * uMotion;
  float push = uPointerPush * (1.0 + uPointerSpeed);
  mv.xy += normalize(d + vec2(1e-5)) * infl * push;
  mv.y  += uScrollVel * uScrollSmear * (0.35 + aRandom.y * 0.65) * uMotion;

  gl_Position = projectionMatrix * mv;

  /* Size attenuation. uSizeScale is a reference DEPTH, not a magic number:
     a point sitting exactly that far from the camera renders at uSize
     pixels, and everything else falls off by true perspective. Clamped,
     because a point that drifts near the camera would otherwise try to
     rasterise at several hundred pixels and murder the fill rate. */
  float sizeJitter = 1.0 + (aRandom.z - 0.5) * 2.0 * uSizeVariance;
  float velSwell   = 1.0 + abs(uScrollVel) * uScrollSizeGain;
  gl_PointSize = uSize * uPixelRatio * sizeJitter * velSwell
               * (uSizeScale / max(0.001, -mv.z));
  gl_PointSize = clamp(gl_PointSize, 0.0, 48.0 * uPixelRatio);

  /* Fade points that drift behind the camera or far into the distance,
     so nothing pops at the near plane. */
  /* Scene weight crossfades with the morph, so a compact scene dims as the
     points converge into it rather than flashing white on arrival. */
  float sceneW = mix(uSceneWA, uSceneWB, tt);
  vFade = smoothstep(0.0, 2.0, -mv.z) * (1.0 - smoothstep(38.0, 70.0, -mv.z)) * uIntro * sceneW;

  /* Colour crossfades with the same staggered t as position, so a point's
     colour arrives exactly when the point does. */
  vColor = mix(sampleCol(uSceneA), sampleCol(uSceneB), tt);
}
`;
