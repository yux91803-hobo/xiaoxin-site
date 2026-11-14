varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.5, 0.0, d);
  float a = core * core * (0.7 + 0.3 * smoothstep(0.18, 0.0, d));
  gl_FragColor = vec4(vColor * a * vAlpha * 1.7, 1.0);
  #include <colorspace_fragment>
}
