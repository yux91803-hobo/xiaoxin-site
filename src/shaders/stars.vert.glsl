// Starfield points: per-star size, colour temperature and twinkle phase.
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uTwinkle;
uniform float uPixelRatio;
uniform float uFade;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float speed = 0.8 + fract(aPhase * 7.13) * 2.6;
  float tw = 1.0 - uTwinkle * 0.5 * (0.5 + 0.5 * sin(uTime * speed + aPhase * 6.2831));
  vColor = color;
  vAlpha = tw * uFade;
  float sz = aSize * uPixelRatio * clamp(60.0 / -mv.z, 0.6, 14.0);
  gl_PointSize = max(sz, 1.0);
  gl_Position = projectionMatrix * mv;
}
