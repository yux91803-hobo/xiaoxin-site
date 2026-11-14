// Pointer picking on the globe: hover tooltip + click to select. Markers behind the
// globe are ignored by comparing the marker hit against the earth hit distance.
import * as THREE from 'three';
import { $ } from './dom.js';

export function createPicking({ canvas, camera, earthMesh, markers, places, store, bus }) {
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), tip = $('tip');
  let downAt = null;
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects([earthMesh, ...markers.hitTargets], false);
    const eh = hits.find((h) => h.object === earthMesh), mh = hits.find((h) => h.object !== earthMesh);
    if (!mh) return -1;
    if (eh && mh.distance > eh.distance + 0.03) return -1;
    return mh.object.userData.index;
  }
  canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || store.get().mode !== 'globe') { downAt = null; return; }
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y); downAt = null;
    if (moved > 6) return;
    const i = pick(e); if (i >= 0) bus.emit('place:select', { index: i, source: 'globe' });
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons || store.get().mode !== 'globe') { tip.style.opacity = 0; return; }
    const i = pick(e);
    if (i !== store.get().hovered) store.set({ hovered: i });
    canvas.classList.toggle('hovering', i >= 0);
    if (i >= 0) { tip.textContent = `${places[i].name} · ${places[i].region}`; tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 12}px)`; tip.style.opacity = 1; }
    else tip.style.opacity = 0;
  });
  canvas.addEventListener('pointerleave', () => { tip.style.opacity = 0; store.set({ hovered: -1 }); });
}
