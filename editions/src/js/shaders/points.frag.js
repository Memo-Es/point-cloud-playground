/* Fragment shader.

   A soft round grain of light, coloured from a three-stop gradient. Additive
   blending on a near-black stage is what turns a pile of dots into something
   that reads as luminous rather than as confetti.
*/
export default /* glsl */`
precision highp float;

uniform vec3  uC1;
uniform vec3  uC2;
uniform vec3  uC3;
uniform vec3  uAccent;
uniform float uGlow;
uniform float uOpacity;

varying float vT;
varying float vBurst;
varying float vFade;

void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;

  /* Two stops: a soft halo plus a brighter core. A single falloff makes a
     large cloud read as flat grey mush. */
  float halo = smoothstep(0.5, 0.18, d);
  float core = smoothstep(0.26, 0.0, d);
  float alpha = (halo * 0.55 + core * 0.45) * uOpacity * vFade;
  if (alpha < 0.004) discard;

  vec3 col = vT < 0.5
    ? mix(uC1, uC2, vT * 2.0)
    : mix(uC2, uC3, (vT - 0.5) * 2.0);

  // Points flash toward the accent mid-flight, so a change reads as energy
  // rather than as a crossfade.
  col = mix(col, uAccent, vBurst * 0.45);
  col += core * 0.2 * vBurst;

  gl_FragColor = vec4(col * uGlow, alpha);
}
`;
