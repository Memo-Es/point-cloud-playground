/* Fragment shader for the point cloud.

   Two jobs: make a square GL point look like a soft round grain of light,
   and pick its colour. Colour is a per-point blend of two palette colours
   plus a flash toward the accent while the point is mid-flight — which is
   what makes a transition read as energy rather than as a crossfade.
*/
export default /* glsl */`
precision highp float;

uniform vec3  uColorAccent;
uniform vec3  uTint;
uniform float uTintAmount;
uniform float uExposure;
uniform float uOpacity;
uniform float uSoftness;

varying vec3  vColor;
varying float vBurst;
varying float vFade;

void main() {
  /* Radial falloff. Two stops: a soft halo and a brighter core, which is
     what stops a big point cloud reading as flat grey mush. */
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;

  float halo = smoothstep(0.5, 0.5 * uSoftness, d);
  float core = smoothstep(0.30, 0.0, d);
  float alpha = (halo * 0.55 + core * 0.45) * uOpacity * vFade;
  if (alpha < 0.004) discard;

  /* The point's own colour, then a grade, then the transition flash. Order
     matters: tinting after the flash would wash the flash out. */
  vec3 col = mix(vColor, uTint, uTintAmount) * uExposure;
  col = mix(col, uColorAccent, vBurst * 0.45);
  col += core * 0.18 * vBurst;    // hot centres while scattered

  gl_FragColor = vec4(col, alpha);
}
`;
