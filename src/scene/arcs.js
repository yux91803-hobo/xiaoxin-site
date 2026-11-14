// Animated great-circle flight arcs between the featured places: one Points cloud,
// every arc sampled into particles whose brightness a shader animates as comet trails.
// Samples are written in low-discrepancy order so a lower quality tier can simply draw
// a prefix of the buffer (setDrawRange) and still cover every arc evenly.
import * as THREE from 'three';
import { R } from '../config.js';
import { greatCircleArc } from './astro.js';
import arcsVert from '../shaders/arcs.vert.glsl?raw';
import arcsFrag from '../shaders/arcs.frag.glsl?raw';

const MAX_SAMPLES = 150;   // per arc (high tier)
const GOLDEN = 0.6180339887;

export function createArcs(places, routes) {
  const idx = Object.fromEntries(places.map((p, i) => [p.id, i]));
  const arcs = routes.filter(([a, b]) => a in idx && b in idx).map(([a, b], k) => ({ a: idx[a], b: idx[b], k }));
  const n = arcs.length * MAX_SAMPLES;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), tA = new Float32Array(n);
  const run = new Float32Array(n * 3), ends = new Float32Array(n * 2);
  const ca = new THREE.Color(), cb = new THREE.Color(), c = new THREE.Color();
  // dense polyline for each arc, then sample it at low-discrepancy t values
  const lines = arcs.map(({ a, b }) => greatCircleArc(places[a], places[b], 256, R * 1.002));
  let w = 0;
  for (let s = 0; s < MAX_SAMPLES; s++) {
    const t = (s * GOLDEN) % 1;
    arcs.forEach(({ a, b, k }, j) => {
      const line = lines[j], f = t * (line.length - 1), i0 = Math.floor(f), i1 = Math.min(line.length - 1, i0 + 1), u = f - i0;
      const p0 = line[i0], p1 = line[i1];
      pos.set([p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u, p0[2] + (p1[2] - p0[2]) * u], w * 3);
      ca.set(places[a].color); cb.set(places[b].color); c.copy(ca).lerp(cb, t).multiplyScalar(1.2);
      col.set([c.r, c.g, c.b], w * 3);
      tA[w] = t;
      run.set([0.07 + ((k * 37) % 11) * 0.006, (k * 0.137) % 1, 0.22 + ((k * 13) % 5) * 0.03], w * 3);
      ends.set([a, b], w * 2);
      w++;
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aT', new THREE.BufferAttribute(tA, 1));
  g.setAttribute('aRun', new THREE.BufferAttribute(run, 3));
  g.setAttribute('aEnds', new THREE.BufferAttribute(ends, 2));
  const uniforms = { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uSelected: { value: -1 }, uIntensity: { value: 0 } };
  const points = new THREE.Points(g, new THREE.ShaderMaterial({
    vertexShader: arcsVert, fragmentShader: arcsFrag, uniforms, vertexColors: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  points.renderOrder = 4;
  let speed = 1, target = 1;
  return {
    object: points, count: arcs.length, uniforms,
    setTier(t, pixelRatio) { g.setDrawRange(0, Math.min(MAX_SAMPLES, t.arcSamples) * arcs.length); uniforms.uPixelRatio.value = pixelRatio; },
    setReducedMotion(r) { speed = r ? 0.35 : 1; },
    show(v) { target = v ? 1 : 0; },
    update(dt, elapsed, selected) {
      uniforms.uTime.value += dt * speed;
      uniforms.uSelected.value = selected;
      uniforms.uIntensity.value += (target - uniforms.uIntensity.value) * Math.min(1, dt * 1.5);
    },
  };
}
