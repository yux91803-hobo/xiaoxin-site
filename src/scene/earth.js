// Earth = surface (custom shader) + cloud shell + outer atmosphere glow.
import * as THREE from 'three';
import { R } from '../config.js';
import sphereVert from '../shaders/sphere.vert.glsl?raw';
import earthFrag from '../shaders/earth.frag.glsl?raw';
import cloudsFrag from '../shaders/clouds.frag.glsl?raw';
import atmoVert from '../shaders/atmosphere.vert.glsl?raw';
import atmoFrag from '../shaders/atmosphere.frag.glsl?raw';

function placeholder(rgb) {
  const t = new THREE.DataTexture(new Uint8Array([...rgb, 255]), 1, 1);
  t.needsUpdate = true; return t;
}

export function createEarth({ segments = 128 } = {}) {
  const group = new THREE.Group();
  const sunDir = new THREE.Vector3(1, 0, 0);
  const shared = { uSunDir: { value: sunDir }, uCloudOffset: { value: 0 } };
  const uClouds = { value: placeholder([0, 0, 0]) };

  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(R, segments, segments),
    new THREE.ShaderMaterial({
      vertexShader: sphereVert, fragmentShader: earthFrag,
      uniforms: {
        ...shared, uClouds,
        uDay: { value: placeholder([18, 40, 78]) },
        uNight: { value: placeholder([0, 0, 0]) },
        uNormal: { value: placeholder([128, 128, 255]) },
        uWater: { value: placeholder([255, 255, 255]) },
        uCloudShadow: { value: 0.5 },
        uNormalStrength: { value: 1.0 },
        uNightBoost: { value: 2.2 },
        uReveal: { value: 1 },
      },
    }),
  );
  surface.name = 'earth';
  group.add(surface);

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.008, Math.round(segments * 0.75), Math.round(segments * 0.75)),
    new THREE.ShaderMaterial({
      vertexShader: sphereVert, fragmentShader: cloudsFrag, transparent: true, depthWrite: false,
      uniforms: { ...shared, uClouds, uOpacity: { value: 0 } },
    }),
  );
  clouds.renderOrder = 2;
  group.add(clouds);

  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.13, 96, 96),
    new THREE.ShaderMaterial({
      vertexShader: atmoVert, fragmentShader: atmoFrag, side: THREE.BackSide,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uSunDir: shared.uSunDir, uIntensity: { value: 0.95 } },
    }),
  );
  atmo.renderOrder = 3;
  group.add(atmo);

  const su = surface.material.uniforms;
  return {
    group, surface, clouds, atmo, sunDir,
    setTextures({ day, night, normal, water, clouds: cl }) {
      if (day) su.uDay.value = day;
      if (night) su.uNight.value = night;
      if (normal) su.uNormal.value = normal;
      if (water) su.uWater.value = water;
      if (cl) { uClouds.value = cl; clouds.material.uniforms.uOpacity.value = 0.92; }
    },
    setTier(t) { su.uCloudShadow.value = t.cloudShadow; },
    update(dt, elapsed, cloudSpeed) { shared.uCloudOffset.value = (elapsed * cloudSpeed) % 1; },
  };
}
