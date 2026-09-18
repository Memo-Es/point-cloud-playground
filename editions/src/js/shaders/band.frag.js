/* Effects for the band type.

   The glyphs arrive as an alpha map. Everything here works off that alpha and
   its GRADIENT — the finite difference of neighbouring taps, which points
   outward from every letter edge. That gradient stands in for a surface
   normal, which is what makes refraction and chromatic fringing possible
   without any real geometry behind the letterforms.

   Mode 3 (refract) samples a texture of the scene rendered WITHOUT the band,
   so the cloud genuinely bends through the type rather than being faked with
   a gradient.
*/
export default /* glsl */`
precision highp float;

uniform sampler2D uMap;
uniform sampler2D uScene;
uniform vec2  uTexel;        // 1 / text texture size
uniform vec2  uResolution;   // drawing buffer size, for screen-space taps
uniform float uMode;         // 0 solid · 1 iridescent · 2 chromatic · 3 refract
uniform float uStrength;
uniform vec3  uColor;
uniform float uOpacity;
uniform float uTime;
/* Signed tile count across the band. A custom ShaderMaterial does NOT get
   three's uvTransform, which is what applies texture.repeat for the built-in
   materials — so the tiling has to be done here by hand. Negative mirrors,
   which is how the readable face ends up where the camera looks. */
uniform float uRepeat;

varying vec2 vUv;
varying vec3 vViewNormal;
varying vec3 vViewPos;

/* Cheap hue ramp — a thin-film look without a spectrum lookup. */
vec3 iridescent(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
  vec2 uv = vec2(vUv.x * uRepeat, vUv.y);
  float a = texture2D(uMap, uv).a;
  if (a < 0.35) discard;          // a hard cutout, so the band writes depth

  /* Edge gradient, used as a stand-in normal. */
  float ax = texture2D(uMap, uv + vec2(uTexel.x, 0.0)).a
           - texture2D(uMap, uv - vec2(uTexel.x, 0.0)).a;
  float ay = texture2D(uMap, uv + vec2(0.0, uTexel.y)).a
           - texture2D(uMap, uv - vec2(0.0, uTexel.y)).a;
  vec2 grad = vec2(ax, ay);
  float edge = clamp(length(grad) * 6.0, 0.0, 1.0);

  // Fresnel: glancing faces of the band catch more light than face-on ones.
  float fres = pow(1.0 - abs(dot(normalize(vViewNormal), normalize(-vViewPos))), 2.5);

  vec3 col = uColor;

  if (uMode > 2.5) {
    /* --- refraction ---
       Offset the screen-space lookup by the edge gradient, and offset each
       channel by a slightly different amount so the letters disperse light
       the way thick glass does. */
    vec2 suv = gl_FragCoord.xy / uResolution;
    vec2 off = grad * uStrength * 0.55;
    vec3 behind;
    behind.r = texture2D(uScene, suv + off * 1.00).r;
    behind.g = texture2D(uScene, suv + off * 1.18).g;
    behind.b = texture2D(uScene, suv + off * 1.36).b;
    /* Glass refracting a black background is black, so over the empty parts
       of the stage the letters would simply vanish. A tint floor plus strong
       edge and fresnel terms keep the letterforms legible everywhere, while
       the cloud still visibly bends through them where there is one. */
    col = behind * 2.2 + uColor * 0.34;
    col += edge * 0.95 + fres * 0.55;

  } else if (uMode > 1.5) {
    /* --- chromatic --- the glyph itself splits into coloured fringes. */
    float r = texture2D(uMap, uv + grad * uStrength * 0.12).a;
    float g = a;
    float b = texture2D(uMap, uv - grad * uStrength * 0.12).a;
    col = uColor * vec3(r, g, b);
    col += edge * uStrength * 0.5 * vec3(1.0, 0.75, 0.9);

  } else if (uMode > 0.5) {
    /* --- iridescent --- hue keyed to position along the band and to view
       angle, so the colour travels as the band turns. */
    float t = uv.x * 3.0 + fres * 1.4 + uTime * 0.05;
    col = mix(uColor, iridescent(t), clamp(uStrength, 0.0, 1.0));
    col += fres * 0.5;
  }

  gl_FragColor = vec4(col, uOpacity);
}
`;
