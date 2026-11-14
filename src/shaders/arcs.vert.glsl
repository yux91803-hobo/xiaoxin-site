// Flight-arc particles: points sampled along each great-circle arc. A comet head runs
// from start to end; points behind it light up as a fading trail. Arcs touching the
// selected place glow brighter.
attribute float aT;
attribute vec3 aRun;      // speed, phase offset, trail length
attribute vec2 aEnds;     // place indices at each end
uniform float uTime;
uniform float uPixelRatio;
uniform float uSelected;
uniform float uIntensity;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float span = 1.0 + aRun.z;
  float head = fract(uTime * aRun.x + aRun.y) * span;
  float d = head - aT;
  float trail = (d >= 0.0 && d <= aRun.z) ? pow(1.0 - d / aRun.z, 2.2) : 0.0;
  float sel = (abs(aEnds.x - uSelected) < 0.5 || abs(aEnds.y - uSelected) < 0.5) ? 1.0 : 0.0;
  float edge = smoothstep(0.0, 0.06, aT) * smoothstep(1.0, 0.94, aT);
  float base = (0.05 + 0.16 * sel) * edge;
  vAlpha = (base + trail * (1.1 + 0.9 * sel)) * uIntensity;
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = (1.4 + trail * 3.6 + sel * 0.9) * uPixelRatio * clamp(3.2 / -mv.z, 0.5, 3.0);
  gl_Position = projectionMatrix * mv;
}
