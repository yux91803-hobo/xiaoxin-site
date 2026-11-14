varying vec3 vNormalV;
varying vec3 vViewV;
varying vec3 vNormalW;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewV = normalize(-mv.xyz);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * mv;
}
