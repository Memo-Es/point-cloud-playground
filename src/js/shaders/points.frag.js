/* Fragment shader for the point cloud.

   Two jobs: make a square GL point look like a small round opaque dot, and
   pick its colour. Colour comes from the source image via the atlas, with a
   flash toward the accent while the point is mid-flight.
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
varying float vRand;

void main() {
  /* A near-binary disc, not a soft sprite.

     The earlier version drew big feathered blobs additively, which is what
     made the cloud read as bokeh instead of as an image. Photographic point
     clouds are built from small, hard, OPAQUE dots — the softness is in how
     densely they are packed, not in each dot's edges. */
  float d = length(gl_PointCoord - 0.5);
  float disc = 1.0 - smoothstep(0.5 - uSoftness * 0.42, 0.5, d);

  /* Fading is stochastic rather than by alpha. These points write depth, and
     semi-transparent fragments that write depth punch holes in whatever is
     behind them. Culling whole points against a per-point random threshold
     dissolves the cloud instead, which also looks better than dimming it. */
  float gate = disc * uOpacity * vFade;
  if (gate < mix(0.06, 0.94, vRand)) discard;

  vec3 col = mix(vColor, uTint, uTintAmount) * uExposure;
  col = mix(col, uColorAccent, vBurst * 0.5);

  gl_FragColor = vec4(col, 1.0);
}
`;
