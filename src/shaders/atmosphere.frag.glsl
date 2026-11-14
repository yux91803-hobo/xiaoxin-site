// Outer atmospheric glow (back-faces of a larger shell, additive): a cheap single-scatter
// look — blue Rayleigh tint on the day side, sunset orange near the terminator, fading at night.
uniform vec3 uSunDir;
uniform float uIntensity;
varying vec3 vNormalV;
varying vec3 vViewV;
varying vec3 vNormalW;
void main() {
  float f = -dot(normalize(vNormalV), normalize(vViewV));
  float i = pow(smoothstep(0.0, 0.62, f), 3.2);
  float s = dot(normalize(vNormalW), normalize(uSunDir));
  vec3 c = mix(vec3(1.0, 0.42, 0.18), vec3(0.28, 0.58, 1.0), smoothstep(-0.18, 0.35, s));
  float lit = smoothstep(-0.5, 0.25, s);
  gl_FragColor = vec4(c * i * uIntensity * (0.06 + 0.94 * lit), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
