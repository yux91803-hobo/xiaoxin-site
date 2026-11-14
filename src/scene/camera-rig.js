// Camera rig: OrbitControls for the user, plus scripted moves layered on top —
// great-circle flights between places, the cinematic intro dive from deep space,
// and the plunge toward the surface that hands over to the photoreal view.
// Every scripted move is a promise so the transition code can sequence them.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { HOME_DIST, IDLE_RESUME_MS } from '../config.js';

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
export const easeInCubic = (t) => t * t * t;
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export function createCameraRig(camera, canvas, { store, bus }) {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 1.3; controls.maxDistance = 7;
  controls.rotateSpeed = 0.5; controls.zoomSpeed = 0.7;
  controls.autoRotateSpeed = 0.4;

  let move = null;            // active scripted move
  let lastInteract = -Infinity, interacting = false;
  const speed = { value: 0 }; // normalised camera speed, drives motion blur
  const prevPos = new THREE.Vector3().copy(camera.position);

  const pause = () => { lastInteract = performance.now(); controls.autoRotate = false; };
  controls.addEventListener('start', () => {
    interacting = true; pause(); cancel('user'); canvas.classList.add('dragging'); bus.emit('user:interact');
  });
  controls.addEventListener('end', () => { interacting = false; lastInteract = performance.now(); canvas.classList.remove('dragging'); });
  canvas.addEventListener('wheel', () => { pause(); cancel('user'); bus.emit('user:interact'); }, { passive: true });

  function cancel(reason) {
    if (!move) return;
    const m = move; move = null;
    if (m.cancellable === false && reason === 'user') { move = m; return; }
    m.resolve(false);
  }

  /** Spherical move from the current position to direction `dir` at distance `dist`. */
  function flyTo(dir, dist, { dur = 1800, ease = easeInOutCubic, lift = null, cancellable = true, minDur = 900, maxDur = 2600 } = {}) {
    cancel('replaced');
    const from = camera.position.clone();
    const fromDir = from.clone().normalize(), toDir = dir.clone().normalize();
    const angle = fromDir.angleTo(toDir);
    const d = Math.max(minDur, Math.min(maxDur, dur * (0.55 + angle / Math.PI)));
    const l = lift == null ? Math.min(0.9, angle * 0.45) : lift;
    pause();
    return new Promise((resolve) => {
      move = { kind: 'fly', fromDir, toDir, fromLen: from.length(), toLen: dist, lift: l, t0: performance.now(), dur: d, ease, resolve, cancellable };
    });
  }

  /** Intro: start far out among the stars, curve in and settle at the home view. */
  function intro(homeDir, { from = 95, dur = 5200 } = {}) {
    cancel('replaced');
    const startDir = homeDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -1.1).add(new THREE.Vector3(0, 0.55, 0)).normalize();
    camera.position.copy(startDir).multiplyScalar(from);
    camera.lookAt(0, 0, 0);
    return new Promise((resolve) => {
      move = { kind: 'intro', fromDir: startDir, toDir: homeDir.clone().normalize(), fromLen: from, toLen: HOME_DIST, t0: performance.now(), dur, resolve, cancellable: true };
    });
  }

  const q = new THREE.Quaternion(), qi = new THREE.Quaternion(), tmp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function stepMove(now) {
    const m = move; if (!m) return;
    const k = Math.min(1, (now - m.t0) / m.dur);
    let dirE, len;
    if (m.kind === 'intro') {
      // direction settles early, distance falls off exponentially (fast through the stars, gentle at the end)
      dirE = easeOutQuart(Math.min(1, k * 1.15));
      const e = easeOutExpo(k);
      len = m.toLen * Math.pow(m.fromLen / m.toLen, 1 - e);
    } else {
      const e = m.ease(k); dirE = e;
      len = THREE.MathUtils.lerp(m.fromLen, m.toLen, e) + Math.sin(e * Math.PI) * m.lift;
    }
    q.setFromUnitVectors(m.fromDir, m.toDir); qi.identity().slerp(q, dirE);
    tmp.copy(m.fromDir).applyQuaternion(qi);
    if (m.fromDir.dot(m.toDir) < -0.999) tmp.copy(m.fromDir).lerp(up, Math.sin(dirE * Math.PI)).lerp(m.toDir, dirE).normalize();
    camera.position.copy(tmp.multiplyScalar(len));
    camera.lookAt(controls.target);
    if (k >= 1) { move = null; lastInteract = performance.now(); m.resolve(true); }
  }

  function update(dt, now) {
    const s = store.get();
    const idle = !interacting && !move && s.selected < 0 && now - lastInteract > IDLE_RESUME_MS;
    controls.autoRotate = s.autoSpin && idle && s.mode === 'globe';
    if (move) stepMove(now); else controls.update(dt);
    // camera speed in globe-radii per second, smoothed — feeds motion blur / aberration
    const v = dt > 0 ? camera.position.distanceTo(prevPos) / dt : 0;
    speed.value += (v - speed.value) * Math.min(1, dt * 6);
    prevPos.copy(camera.position);
  }

  return {
    controls, flyTo, intro, cancel, update, speed,
    get moving() { return !!move; },
    get moveKind() { return move ? move.kind : null; },
    pause,
    setEnabled(v) { controls.enabled = v; },
    resetIdle() { lastInteract = performance.now(); },
  };
}
