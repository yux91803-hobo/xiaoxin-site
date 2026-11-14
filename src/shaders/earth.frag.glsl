// Earth surface: real-sun day/night terminator, Black Marble city lights on the night side,
// normal-mapped relief on land, specular sun glint on the oceans, cloud shadows and an
// atmospheric Fresnel rim. Approach follows the classic "threejs earth shader" projects
// (day/night texture blend by dot(normal, sunDir)) — see README for references.
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uNormal;
uniform sampler2D uWater;
uniform sampler2D uClouds;
uniform vec3 uSunDir;
uniform float uCloudOffset;
uniform float uCloudShadow;
uniform float uNormalStrength;
uniform float uNightBoost;
uniform float uReveal;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;

void main() {
  vec3 nG = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  vec3 L = normalize(uSunDir);

  // sphere tangent frame (east, north) matching SphereGeometry's uv layout
  vec3 T = normalize(vec3(nG.z, 0.0, -nG.x) + vec3(1e-5, 0.0, 0.0));
  vec3 B = cross(nG, T);
  vec3 nt = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
  nt.xy *= uNormalStrength;
  float water = texture2D(uWater, vUv).r;
  vec3 n = normalize(T * nt.x + B * nt.y + nG * nt.z);
  n = normalize(mix(n, nG, water));

  float sunG = dot(nG, L);
  float dayMix = smoothstep(-0.12, 0.2, sunG);
  vec3 day = texture2D(uDay, vUv).rgb;

  vec2 cuv = vec2(vUv.x + uCloudOffset, vUv.y);
  vec2 sunTan = vec2(dot(L, T), dot(L, B));
  float cloudHere = texture2D(uClouds, cuv).r;
  float cloudCast = texture2D(uClouds, cuv - sunTan * 0.0035).r;
  float shadow = 1.0 - cloudCast * uCloudShadow;

  // slightly wrapped diffuse so a low afternoon sun still reads as daylight on a globe this small
  float diff = clamp(dot(n, L) * 1.5 + 0.05, 0.0, 1.0);
  vec3 col = day * (diff * 1.25 * shadow + 0.012);
  // oceans a touch deeper away from the sun's highlight
  col *= mix(1.0, 0.82, water);

  // specular sun glint (sharp core + soft sheen), hidden under clouds
  vec3 H = normalize(L + V);
  float nh = max(dot(nG, H), 0.0);
  float glint = pow(nh, 180.0) * 2.2 + pow(nh, 24.0) * 0.16;
  col += water * glint * vec3(1.0, 0.85, 0.62) * smoothstep(-0.02, 0.18, sunG) * shadow * (1.0 - cloudHere * 0.85);

  // warm band along the terminator
  float tw = exp(-pow(sunG / 0.13, 2.0));
  col += day * vec3(1.0, 0.42, 0.16) * tw * 0.32;

  // night: city lights (dimmed under clouds) + faint moonlit land
  // the night map tints deserts and oceans teal while city lights are neutral white, so the red
  // channel isolates the lights; they are then pushed into HDR so the bloom pass makes them glow
  vec3 night = texture2D(uNight, vUv).rgb;
  float city = pow(smoothstep(0.006, 0.17, night.r), 1.15);
  vec3 lights = mix(vec3(1.0, 0.62, 0.3), vec3(1.0, 0.9, 0.7), city) * city * uNightBoost * (1.0 - cloudHere * 0.7);
  float nightMix = 1.0 - smoothstep(-0.24, 0.05, sunG);
  col = col * dayMix + day * vec3(0.03, 0.04, 0.075) * (1.0 - dayMix) + lights * nightMix;

  // atmospheric rim, blue on the day side, orange at the terminator, gone at night
  float fres = pow(1.0 - max(dot(nG, V), 0.0), 3.2);
  vec3 rimC = mix(vec3(1.0, 0.46, 0.2), vec3(0.3, 0.6, 1.0), smoothstep(-0.05, 0.45, sunG));
  col += rimC * fres * smoothstep(-0.35, 0.45, sunG) * 0.9;

  gl_FragColor = vec4(col * uReveal, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
