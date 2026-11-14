// Procedural Milky Way on the sky sphere: a tilted galactic band of fbm noise with
// dust lanes and a warm core. No texture download needed.
uniform float uIntensity;
uniform vec3 uPlane;   // galactic pole
uniform vec3 uCore;    // direction of the galactic centre
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec3 d = normalize(vDir);
  float lat = dot(d, normalize(uPlane));
  float band = exp(-lat * lat / 0.018);
  float core = pow(max(dot(d, normalize(uCore)), 0.0), 6.0);
  float n = fbm(d * 5.0);
  float dust = smoothstep(0.42, 0.75, fbm(d * 11.0 + 3.1));
  float glow = band * (0.35 + 0.9 * n) * (1.0 - dust * 0.75 * exp(-lat * lat / 0.004));
  vec3 col = mix(vec3(0.22, 0.28, 0.55), vec3(0.95, 0.78, 0.6), clamp(core * 1.6 + n * 0.25, 0.0, 1.0));
  col *= glow * (1.0 + core * 2.5);
  // faint nebula tint off the band
  col += vec3(0.25, 0.08, 0.3) * pow(fbm(d * 3.0 + 7.0), 3.0) * 0.12;
  gl_FragColor = vec4(col * uIntensity, 1.0);
  #include <colorspace_fragment>
}
