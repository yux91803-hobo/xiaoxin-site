// Deep-space backdrop: a few thousand twinkling stars (biased toward the galactic plane)
// and a procedural Milky Way sky sphere. The intro camera flies through the star shell.
import * as THREE from 'three';
import starsVert from '../shaders/stars.vert.glsl?raw';
import starsFrag from '../shaders/stars.frag.glsl?raw';
import mwVert from '../shaders/milkyway.vert.glsl?raw';
import mwFrag from '../shaders/milkyway.frag.glsl?raw';

const MAX_STARS = 9000;
const PLANE = new THREE.Vector3(0.38, 0.82, -0.43).normalize();
const CORE = new THREE.Vector3(-0.62, 0.12, -0.77).normalize();

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function createSky() {
  const rand = rng(20261114);
  const pos = new Float32Array(MAX_STARS * 3), col = new Float32Array(MAX_STARS * 3);
  const size = new Float32Array(MAX_STARS), phase = new Float32Array(MAX_STARS);
  const tints = [[1, 1, 1], [0.74, 0.83, 1], [1, 0.88, 0.74], [0.85, 0.9, 1], [1, 0.75, 0.6]];
  const v = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3();
  u.copy(PLANE).cross(new THREE.Vector3(0, 0, 1)).normalize(); w.copy(PLANE).cross(u).normalize();
  for (let i = 0; i < MAX_STARS; i++) {
    // ~45% of stars hug the galactic plane, the rest are uniform
    if (rand() < 0.45) {
      const a = rand() * Math.PI * 2, lat = (rand() + rand() + rand() - 1.5) * 0.16;
      v.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)).addScaledVector(PLANE, lat).normalize();
    } else {
      const z = rand() * 2 - 1, a = rand() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      v.set(r * Math.cos(a), z, r * Math.sin(a));
    }
    const dist = 22 + Math.pow(rand(), 0.6) * 150;
    v.multiplyScalar(dist);
    pos.set([v.x, v.y, v.z], i * 3);
    const t = tints[(rand() * tints.length) | 0], b = 0.35 + Math.pow(rand(), 2.2) * 0.9;
    col.set([t[0] * b, t[1] * b, t[2] * b], i * 3);
    size[i] = 1.0 + Math.pow(rand(), 6) * 3.4;
    phase[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const starUniforms = { uTime: { value: 0 }, uTwinkle: { value: 1 }, uPixelRatio: { value: 1 }, uFade: { value: 1 } };
  const stars = new THREE.Points(g, new THREE.ShaderMaterial({
    vertexShader: starsVert, fragmentShader: starsFrag, uniforms: starUniforms, vertexColors: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  stars.frustumCulled = false;

  const milky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 32), new THREE.ShaderMaterial({
    vertexShader: mwVert, fragmentShader: mwFrag, side: THREE.BackSide, depthWrite: false,
    transparent: true, blending: THREE.AdditiveBlending,
    uniforms: { uIntensity: { value: 0.42 }, uPlane: { value: PLANE }, uCore: { value: CORE } },
  }));
  milky.renderOrder = -1;

  const group = new THREE.Group();   // rotates slowly; the sky sphere stays separate and follows the camera
  group.add(stars);
  return {
    group, stars, milky, objects: [milky, group], uniforms: starUniforms,
    setTier(t, pixelRatio) {
      g.setDrawRange(0, Math.min(MAX_STARS, t.stars));
      starUniforms.uTwinkle.value = t.twinkle;
      starUniforms.uPixelRatio.value = pixelRatio;
      milky.visible = t.milkyWay;
    },
    update(dt, elapsed, camera) {
      starUniforms.uTime.value = elapsed;
      group.rotation.y = elapsed * 0.002;
      milky.position.copy(camera.position);   // sky sphere follows the camera, so it reads as infinitely far
    },
  };
}
