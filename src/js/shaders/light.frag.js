/* Volumetric light stand-in.

   The real Editions build raymarches boxes against a KTX2 array texture
   baked from video. That is a lot of machinery for what reads, on screen,
   as "soft shafts that bend when you move the cursor" — so this is a stack
   of additive gradient quads at staggered depths, sheared by the same fluid
   field that drives the points. Same read, a rounding error of the cost.
*/
export default /* glsl */`
precision highp float;

uniform vec3  uColor;
uniform float uTime;
uniform float uIntensity;
uniform float uLayer;      // 0..1 position within the stack
uniform vec2  uPointer;
uniform float uDistortion;
uniform float uScrollVel;
uniform float uMotion;

varying vec2 vUv;

void main() {
  vec2 uv = vUv - 0.5;

  /* Bend the shaft toward the cursor, more strongly on nearer layers. */
  float depthGain = mix(0.35, 1.0, uLayer);
  uv += (uPointer * 0.5) * uDistortion * 0.12 * depthGain * uMotion;
  uv.y += uScrollVel * 0.05 * depthGain * uMotion;

  float t = uTime * (0.10 + uLayer * 0.16) * uMotion;

  /* Two overlapping soft bands, drifting out of phase, so the shafts never
     visibly loop. */
  float band  = exp(-pow(abs(uv.x * 2.6 + sin(uv.y * 1.6 + t) * 0.35), 2.0) * 2.2);
  float band2 = exp(-pow(abs(uv.x * 1.7 - sin(uv.y * 1.1 - t * 0.8) * 0.5), 2.0) * 1.4);

  float vignette = smoothstep(0.62, 0.05, length(uv));
  float a = (band * 0.65 + band2 * 0.45) * vignette * uIntensity * depthGain;

  gl_FragColor = vec4(uColor * a, a);
}
`;
