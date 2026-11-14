// Cloud shell: same cloud map the surface uses for shadows, lit by the real sun,
// with a warm terminator fringe and a brighter limb (forward scattering).
uniform sampler2D uClouds;
uniform vec3 uSunDir;
uniform float uCloudOffset;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec3 nG = normalize(vNormalW);
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(cameraPosition - vPosW);
  float c = texture2D(uClouds, vec2(vUv.x + uCloudOffset, vUv.y)).r;
  c = smoothstep(0.04, 0.95, c);
  float sunG = dot(nG, L);
  float lit = smoothstep(-0.18, 0.32, sunG);
  vec3 col = mix(vec3(0.012, 0.016, 0.03), vec3(0.86, 0.88, 0.92), lit);
  col = mix(col, vec3(1.0, 0.52, 0.28), exp(-pow(sunG / 0.11, 2.0)) * 0.55);
  float fres = pow(1.0 - max(dot(nG, V), 0.0), 2.0);
  gl_FragColor = vec4(col * (0.92 + fres * 0.35), c * uOpacity * (1.0 - fres * 0.45));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
