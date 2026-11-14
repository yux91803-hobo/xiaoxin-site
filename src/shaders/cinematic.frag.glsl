// Final cinematic pass (after bloom + tone mapping): radial zoom blur and chromatic
// aberration for the dive transitions, shader vignette, animated film grain and a
// colour flash used to cut between the globe and the photoreal view.
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uTime;
uniform float uGrain;
uniform float uVignette;
uniform float uAberration;
uniform float uBlur;
uniform float uFlash;
uniform vec3 uFlashColor;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = vUv;
  vec2 dir = uv - uCenter;
  vec3 col;
  if (uBlur > 0.002) {
    vec3 acc = vec3(0.0); float tot = 0.0;
    for (int i = 0; i < 14; i++) {
      float k = float(i) / 13.0; float w = 1.0 - k * 0.65;
      acc += texture2D(tDiffuse, uv - dir * k * uBlur * 0.16).rgb * w; tot += w;
    }
    col = acc / tot;
  } else {
    col = texture2D(tDiffuse, uv).rgb;
  }
  if (uAberration > 0.002) {
    vec2 off = dir * uAberration * 0.0065;
    col.r = mix(col.r, texture2D(tDiffuse, uv + off).r, 0.9);
    col.b = mix(col.b, texture2D(tDiffuse, uv - off).b, 0.9);
  }
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  float v = smoothstep(1.05, 0.28, length(dir * asp) * 0.85);
  col *= mix(1.0, v, uVignette);
  col += (hash(uv * uResolution + fract(uTime * 7.3) * 113.0) - 0.5) * uGrain;
  col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
