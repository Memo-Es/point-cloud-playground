/* Vertex shader.

   All seven scenes' positions live in one float texture, stacked as vertical
   slices. A point looks up its own row and column from its index, blends
   between the current scene and the next, and adds a burst that peaks halfway
   through. That burst is the whole "fly apart and re-gather" move.

   Colour is NOT stored anywhere. It's derived here from the point's final
   position, so the palette is a uniform write rather than a rebuilt buffer.
*/
export default /* glsl */`
precision highp float;

uniform sampler2D uPosTex;
uniform vec2  uTexSize;      // width, height of ONE scene slice
uniform float uSceneCount;
uniform float uSceneA;
uniform float uSceneB;
uniform float uMorph;
uniform float uSceneWA;
uniform float uSceneWB;

uniform float uTime;
uniform float uFitScale;
uniform float uIntro;
uniform float uMotion;

uniform float uScatter;
uniform float uStagger;
uniform float uTurbulence;
uniform float uFlow;
uniform float uFlowSpeed;

uniform vec2  uPointer;
uniform float uPointerRadius;
uniform float uPointerPush;
uniform float uPointerSpeed;
uniform float uScrollVel;
uniform float uScrollSmear;

uniform float uSize;
uniform float uSizeScale;
uniform float uSizeVariance;
uniform float uScrollSizeGain;
uniform float uPixelRatio;
uniform float uColorMode;

attribute float aIndex;
attribute vec3  aRandom;
attribute vec3  aScatterDir;

varying float vT;
varying float vBurst;
varying float vFade;

vec2 atlasUV(float scene) {
  float x = mod(aIndex, uTexSize.x);
  float y = floor(aIndex / uTexSize.x);
  float totalH = uTexSize.y * uSceneCount;
  return vec2((x + 0.5) / uTexSize.x,
              (y + scene * uTexSize.y + 0.5) / totalH);
}
vec3 samplePos(float scene) { return texture2D(uPosTex, atlasUV(scene)).xyz; }

/* Three sines per axis. Not real curl noise — indistinguishable at this scale
   and a fraction of the cost. */
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

  /* Per-point stagger: each point leaves at its own moment, so the cloud
     trails rather than moving like a single slab. */
  float s  = uStagger * aRandom.x;
  float tt = clamp((uMorph - s) / max(1e-4, 1.0 - uStagger), 0.0, 1.0);
  tt = tt * tt * (3.0 - 2.0 * tt);

  vec3 pos = mix(a, b, tt);

  /* sin(pi*x) is zero at both ends and one in the middle, so points can fly
     arbitrarily far and still land exactly on target. */
  float burst = sin(uMorph * 3.14159265) * uMotion;
  vBurst = burst;

  pos += aScatterDir * burst * uScatter;
  pos += flowField(pos * 0.4 + aRandom * 2.0, uTime * 0.6) * burst * uTurbulence;
  pos += flowField(pos * 0.25, uTime * uFlowSpeed) * uFlow * uMotion;

  // Boot reveal: points arrive from far behind the camera.
  pos = mix(pos + aScatterDir * 9.0, pos, uIntro);
  pos.xy *= uFitScale;

  /* Gradient source. Taken from the final position so the colour follows the
     shape rather than sliding across it. */
  float t;
  if      (uColorMode < 0.5) t = pos.y * 0.14 + 0.5;
  else if (uColorMode < 1.5) t = length(pos) / 4.6;
  else if (uColorMode < 2.5) t = pos.z * 0.14 + 0.5;
  else                       t = aRandom.y;
  vT = clamp(t, 0.0, 1.0);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / max(1e-4, clip.w);

  /* Cursor and scroll velocity both push points around in screen space, from
     the same smoothed field, so the reactions stay coherent. */
  vec2 d = ndc - uPointer;
  float infl = smoothstep(uPointerRadius, 0.0, length(d)) * uMotion;
  mv.xy += normalize(d + vec2(1e-5)) * infl * uPointerPush * (1.0 + uPointerSpeed);
  mv.y  += uScrollVel * uScrollSmear * (0.35 + aRandom.y * 0.65) * uMotion;

  gl_Position = projectionMatrix * mv;

  float jitter = 1.0 + (aRandom.z - 0.5) * 2.0 * uSizeVariance;
  float swell  = 1.0 + abs(uScrollVel) * uScrollSizeGain;
  gl_PointSize = uSize * uPixelRatio * jitter * swell * (uSizeScale / max(0.001, -mv.z));
  gl_PointSize = clamp(gl_PointSize, 0.0, 48.0 * uPixelRatio);

  /* Scene weight crossfades with the morph, so a compact scene dims as points
     converge into it rather than flaring on arrival. */
  float sceneW = mix(uSceneWA, uSceneWB, tt);
  vFade = smoothstep(0.0, 2.0, -mv.z) * (1.0 - smoothstep(38.0, 70.0, -mv.z)) * uIntro * sceneW;
}
`;
