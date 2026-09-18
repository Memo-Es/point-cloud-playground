export default /* glsl */`
precision highp float;
varying vec2 vUv;
varying vec3 vViewNormal;
varying vec3 vViewPos;

void main() {
  vUv = uv;
  vViewNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;
