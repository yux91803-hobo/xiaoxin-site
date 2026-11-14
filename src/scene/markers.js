// Place markers: glow sprite, bright core, light beam, two pulsing rings (the second one
// is a shock-wave that fires on selection) and an invisible larger hit sphere for picking.
import * as THREE from 'three';
import { R } from '../config.js';
import { latLonToXYZ } from './astro.js';

function glowTexture() {
  const s = 128, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.85)');
  gr.addColorStop(0.42, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createMarkers(places) {
  const group = new THREE.Group();
  const glowTex = glowTexture();
  const ringGeo = new THREE.RingGeometry(0.8, 1, 64);
  const hitGeo = new THREE.SphereGeometry(0.045, 8, 8);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const add = (o) => { o.material.depthWrite = false; return o; };
  const items = places.map((pl, i) => {
    const col = new THREE.Color(pl.color);
    const pos = new THREE.Vector3(...latLonToXYZ(pl.lat, pl.lon, R));
    const g = new THREE.Group(); g.position.copy(pos); g.lookAt(pos.clone().multiplyScalar(2)); group.add(g);
    const glow = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col.clone().multiplyScalar(1.05), transparent: true, blending: THREE.AdditiveBlending })));
    glow.scale.setScalar(0.11); glow.position.z = 0.006; g.add(glow);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 16, 16), new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.5).multiplyScalar(2.2) }));
    core.position.z = 0.004; g.add(core);
    const mk = () => add(new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.4), transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })));
    const ring = mk(); ring.position.z = 0.002; ring.scale.setScalar(0.02); g.add(ring);
    const shock = mk(); shock.position.z = 0.003; shock.scale.setScalar(0.001); shock.material.opacity = 0; g.add(shock);
    const beam = add(new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0035, 0.09, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.5), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending })));
    beam.rotation.x = Math.PI / 2; beam.position.z = 0.045; g.add(beam);
    const hit = new THREE.Mesh(hitGeo, hitMat); hit.userData.index = i; g.add(hit);
    return { place: pl, group: g, glow, core, ring, shock, beam, hit, normal: pos.clone().normalize(), phase: (i * 2.399) % (Math.PI * 2), focus: 0, shockT: -1 };
  });
  const tmp = new THREE.Vector3(), camDir = new THREE.Vector3();
  return {
    group, items, hitTargets: items.map((m) => m.hit),
    fireShock(i) { if (items[i]) items[i].shockT = 0; },
    update(dt, t, camera, selected, hovered) {
      camDir.copy(camera.position).normalize();
      for (let i = 0; i < items.length; i++) {
        const m = items[i];
        const target = (i === selected ? 1 : 0) + (i === hovered ? 0.6 : 0);
        m.focus += (target - m.focus) * Math.min(1, dt * 5);
        const pulse = (t * 0.6 + m.phase / (Math.PI * 2)) % 1;
        m.ring.scale.setScalar(0.012 + pulse * (0.05 + m.focus * 0.03));
        const breathe = 1 + Math.sin(t * 2.2 + m.phase) * 0.12;
        m.glow.scale.setScalar((0.1 + m.focus * 0.06) * breathe);
        m.core.scale.setScalar(1 + m.focus * 0.6);
        m.beam.scale.set(1, 1 + m.focus * 1.6, 1);
        m.beam.position.z = 0.045 * (1 + m.focus * 1.6);
        // fade markers over the horizon
        const facing = m.group.getWorldPosition(tmp).normalize().dot(camDir);
        const vis = THREE.MathUtils.smoothstep(facing, -0.05, 0.25);
        m.glow.material.opacity = vis; m.core.visible = vis > 0.05;
        m.beam.material.opacity = (0.55 + m.focus * 0.3) * vis;
        m.ring.material.opacity = (1 - pulse) * (0.7 + m.focus * 0.3) * vis;
        if (m.shockT >= 0) {
          m.shockT += dt / 1.3;
          const k = Math.min(1, m.shockT), e = 1 - Math.pow(1 - k, 3);
          m.shock.scale.setScalar(0.01 + e * 0.16);
          m.shock.material.opacity = (1 - k) * 0.9 * vis;
          if (k >= 1) m.shockT = -1;
        }
      }
    },
  };
}
