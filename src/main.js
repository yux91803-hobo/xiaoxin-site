// Xiaoxin · 地球 v3 — app composition root.
// Wires the store/bus, quality tiers, the three.js scene modules, the cinematic
// transitions and the lazily-loaded chunks (postprocessing, photoreal/Cesium).
import './styles/main.css';
import * as THREE from 'three';
import { PLACES, placeIndex } from './data/places.js';
import { ROUTES } from './data/routes.js';
import { createStore } from './state/store.js';
import { createBus } from './state/bus.js';
import { HOME_DIST, FOCUS_DIST, DIVE_DIST, INTRO_FROM, INTRO_MS, CLOUD_SPEED } from './config.js';
import { TIERS, TIER_LABEL } from './core/quality.js';
import { createRenderer } from './core/renderer.js';
import { createQualityManager } from './core/quality-manager.js';
import { createTextureStore } from './core/textures.js';
import { sunDirection, subsolarPoint, latLonToXYZ } from './scene/astro.js';
import { createEarth } from './scene/earth.js';
import { createSky } from './scene/sky.js';
import { createMarkers } from './scene/markers.js';
import { createArcs } from './scene/arcs.js';
import { createCameraRig, easeInCubic, easeOutQuart } from './scene/camera-rig.js';
import { createFx } from './effects/transitions.js';
import { $ } from './ui/dom.js';
import { createToast } from './ui/toast.js';
import { createPlacesUI } from './ui/places-ui.js';
import { createControls } from './ui/controls.js';
import { createIntroOverlay, shouldPlayIntro, markIntroSeen } from './ui/intro.js';
import { createPicking } from './ui/picking.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = createStore({
  mode: 'boot',            // boot → intro → globe ⇄ diving → photoreal → returning → globe
  selected: -1, hovered: -1, placeCount: PLACES.length,
  autoSpin: !reducedMotion, reducedMotion,
  qualityMode: 'auto', tier: 'medium', detectedTier: 'medium', fps: 0,
  postReady: false, texturesReady: false, textureSet: null,
});
const bus = createBus();
const toast = createToast();
bus.on('toast', ({ msg, ms }) => toast(msg, ms));

// the place list works even when WebGL does not
createPlacesUI(PLACES, { store, bus });

/* ---------- renderer + quality ---------- */
const canvas = $('scene');
let renderer;
try { renderer = createRenderer(canvas); }
catch (err) { window.showFatal && window.showFatal('你的浏览器或设备暂不支持 WebGL，无法显示 3D 地球。'); throw err; }
window.__globeStarted = true;
const quality = createQualityManager(renderer, { store, bus });
createControls({ store, bus, quality });
bus.on('quality:auto-lowered', ({ tier }) => toast(`画面有点吃力，已自动把画质调到「${TIER_LABEL[tier]}」，保持流畅。`, 5000));

/* ---------- scene ---------- */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.01, 1500);
camera.position.set(0, 0.9, HOME_DIST).setLength(HOME_DIST);

const bootTier = TIERS[store.get().tier];
const earth = createEarth({ segments: bootTier.segments });
const sky = createSky();
const markers = createMarkers(PLACES);
const arcs = createArcs(PLACES, ROUTES);
scene.add(...sky.objects, earth.group, markers.group, arcs.object);
arcs.setReducedMotion(reducedMotion);

const rig = createCameraRig(camera, canvas, { store, bus });
const fxCtl = createFx($('flash'));
createPicking({ canvas, camera, earthMesh: earth.surface, markers, places: PLACES, store, bus });

function updateSun() { const s = sunDirection(new Date()); earth.sunDir.set(s[0], s[1], s[2]).normalize(); }
updateSun(); setInterval(updateSun, 60000);

/* ---------- postprocessing (lazy chunk) ---------- */
let post = null, postLoading = null;
function ensurePost() {
  const t = TIERS[store.get().tier];
  if (!t.post) { document.body.classList.remove('post'); return; }
  if (post) { post.setTier(t); document.body.classList.add('post'); return; }
  if (postLoading) return;
  postLoading = import('./effects/post.js')
    .then((m) => {
      post = m.createPost(renderer, scene, camera, TIERS[store.get().tier]);
      post.setSize(innerWidth, innerHeight, renderer.getPixelRatio());
      store.set({ postReady: true });
      ensurePost();
    })
    .catch((e) => console.warn('postprocessing unavailable, rendering without it', e))
    .finally(() => { postLoading = null; });
}

/* ---------- textures ---------- */
const textures = createTextureStore(renderer);
let upgrading = false;
async function upgradeTextures() {
  if (upgrading || store.get().textureSet === '4k') return;
  upgrading = true;
  const old = { ...earth.surface.material.uniforms };
  const hi = await textures.load('4k');
  upgrading = false;
  if (!hi.day) return;
  const prev = [old.uDay.value, old.uNight.value, old.uClouds.value];
  earth.setTextures(hi);
  store.set({ textureSet: '4k' });
  prev.forEach((t) => t && t.dispose());
}

/* ---------- tiers ---------- */
function onResize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = w < 760 ? 52 : 42;   // wider on phones so the globe fits
  // keep the globe centred in the space the side panel leaves (desktop) / above the bottom bar (phone)
  if (w >= 760) camera.setViewOffset(w, h, 150, 0, w, h); else camera.setViewOffset(w, h, 0, 40, w, h);
  camera.updateProjectionMatrix();
  if (post) post.setSize(w, h, renderer.getPixelRatio());
}
addEventListener('resize', onResize);
function applyTier(name) {
  const t = TIERS[name];
  const pr = Math.min(devicePixelRatio || 1, t.maxPixelRatio);
  renderer.setPixelRatio(pr);
  onResize();
  sky.setTier(t, pr); arcs.setTier(t, pr); earth.setTier(t);
  document.body.dataset.tier = name;
  ensurePost();
  if (t.texture === '4k' && store.get().texturesReady) upgradeTextures();
}
store.watch((s) => s.tier, applyTier);
applyTier(store.get().tier);

/* ---------- selection & views ---------- */
function select(i, { fly = true } = {}) {
  if (!(i >= 0 && i < PLACES.length)) return;
  store.set({ selected: i });
  markers.fireShock(i);
  history.replaceState(history.state, '', `${location.pathname}${location.search}#${PLACES[i].id}`);
  if (fly) rig.flyTo(markers.items[i].normal, FOCUS_DIST);
}
bus.on('place:select', ({ index }) => {
  if (store.get().mode === 'intro') finishIntro();
  if (store.get().mode !== 'globe') return;
  select(index);
});
bus.on('place:clear', () => {
  store.set({ selected: -1 });
  history.replaceState(history.state, '', location.pathname + location.search);
});
bus.on('view:home', () => {
  if (store.get().mode !== 'globe') return;
  bus.emit('place:clear');
  const d = camera.position.clone().normalize(); d.y = 0.28;
  rig.flyTo(d.normalize(), HOME_DIST, { dur: 1600 });
});

// home view: look at the evening side, so the sunlit half, the terminator and city lights share the frame
function homeDirection() {
  const s = subsolarPoint(new Date());
  return new THREE.Vector3(...latLonToXYZ(22, s.lon + 62, 1)).normalize();
}

/* ---------- intro ---------- */
const intro = createIntroOverlay({ bus });
async function playIntro() {
  store.set({ mode: 'intro' });
  intro.show(); markIntroSeen();
  arcs.show(false);
  sky.uniforms.uFade.value = 1;
  const ms = Number(new URLSearchParams(location.search).get('introms')) || INTRO_MS;   // ?introms= slows it down for screenshots
  fxCtl.set('aberration', 0.4);
  fxCtl.tween('aberration', 0, ms * 0.7, easeOutQuart);
  await rig.intro(homeDirection(), { from: INTRO_FROM, dur: ms });
  finishIntro();
}
function finishIntro() {
  if (store.get().mode !== 'intro') return;
  store.set({ mode: 'globe' });
  rig.cancel('skip');
  intro.hide();
  arcs.show(true);
  fxCtl.tween('aberration', 0, 400);
  if (camera.position.length() > HOME_DIST + 0.05) rig.flyTo(camera.position.clone().normalize(), HOME_DIST, { dur: 1000, minDur: 800, ease: easeOutQuart, lift: 0 });
  rig.resetIdle();
}
bus.on('intro:skip', finishIntro);

/* ---------- photoreal: dive in / pull back out ---------- */
let paused = false, realIndex = -1;
function facingPlace() {
  let best = 0, bestDot = -2; const cd = camera.position.clone().normalize();
  markers.items.forEach((m, i) => { const d = m.normal.dot(cd); if (d > bestDot) { bestDot = d; best = i; } });
  return best;
}
const photorealApi = {
  pause() { paused = true; },
  resume() { returnFromReal(); },
  toast,
};
async function openReal(i, { deepLink = false } = {}) {
  if (store.get().mode === 'intro') finishIntro();
  if (store.get().mode !== 'globe') return;
  if (!(i >= 0)) i = store.get().selected >= 0 ? store.get().selected : facingPlace();
  if (store.get().selected !== i) select(i, { fly: false });
  realIndex = i;
  store.set({ mode: 'diving' });
  const modP = import('./photoreal/index.js');    // fetch the chunk while the camera dives
  const m = markers.items[i];
  rig.setEnabled(false);
  if (!reducedMotion) {
    const cd = camera.position.clone().normalize();
    if (cd.dot(m.normal) < 0.995 || camera.position.length() > FOCUS_DIST + 0.15) {
      await rig.flyTo(m.normal, FOCUS_DIST, { dur: 1300, cancellable: false });
    }
    fxCtl.tween('blur', 1, 1100, easeInCubic);
    fxCtl.tween('aberration', 1.3, 1100, easeInCubic);
    setTimeout(() => fxCtl.tween('flash', 1, 420, easeInCubic), 700);
    await rig.flyTo(m.normal, DIVE_DIST, { dur: 1100, minDur: 1100, maxDur: 1100, ease: easeInCubic, lift: 0, cancellable: false });
    await fxCtl.tween('flash', 1, 60);
  } else {
    await fxCtl.tween('flash', 1, 200);
  }
  let mod;
  try { mod = await modP; }
  catch (err) {
    console.warn('photoreal chunk failed:', err);
    toast('卫星实景组件没能加载，可能是网络不太好，请稍后再试。');
    returnFromReal();
    return;
  }
  store.set({ mode: 'photoreal' });
  fxCtl.set('blur', 0); fxCtl.set('aberration', 0);
  fxCtl.tween('flash', 0, reducedMotion ? 200 : 1100, easeOutQuart);
  try { await mod.openPhotoreal(PLACES[i], { deepLink, tier: TIERS[store.get().tier], api: photorealApi }); }
  catch (err) { console.warn('photoreal:', err); toast('卫星实景没能打开，先回到地球仪。'); returnFromReal(); }
}
async function returnFromReal() {
  const mode = store.get().mode;
  if (mode !== 'photoreal' && mode !== 'diving') return;
  paused = false;
  store.set({ mode: 'returning' });
  const m = markers.items[realIndex >= 0 ? realIndex : facingPlace()];
  camera.position.copy(m.normal).multiplyScalar(DIVE_DIST + 0.01); camera.lookAt(0, 0, 0);
  if (!reducedMotion) {
    fxCtl.set('flash', 1); fxCtl.set('blur', 0.9); fxCtl.set('aberration', 0.8);
    fxCtl.tween('flash', 0, 900, easeOutQuart);
    fxCtl.tween('blur', 0, 1500, easeOutQuart);
    fxCtl.tween('aberration', 0, 1500, easeOutQuart);
  } else { fxCtl.set('flash', 0); }
  await rig.flyTo(m.normal, FOCUS_DIST, { dur: 1700, minDur: 1700, maxDur: 1700, ease: easeOutQuart, lift: 0, cancellable: false });
  rig.setEnabled(true); rig.resetIdle();
  store.set({ mode: 'globe' });
}
bus.on('photoreal:request', ({ index }) => openReal(index));

/* ---------- loop ---------- */
const clock = new THREE.Clock();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let frames = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  const now = performance.now();
  // photoreal view is on top: don't spend GPU on the hidden globe, but keep the transition
  // tweens running — the CSS flash that fades in the photoreal view is driven from here
  if (paused) { fxCtl.update(now); return; }
  const t = clock.elapsedTime, s = store.get();
  quality.sample(dt);
  rig.update(dt, now);
  earth.update(dt, t, reducedMotion ? CLOUD_SPEED * 0.3 : CLOUD_SPEED);
  sky.update(dt, t, camera);
  markers.update(dt, t, camera, s.selected, s.hovered);
  arcs.update(dt, t, s.selected);
  const sp = rig.speed.value;
  const fx = fxCtl.update(now, reducedMotion ? {} : { blur: smooth(2.5, 30, sp) * 0.6, aberration: smooth(4, 50, sp) * 0.5 });
  if (post && TIERS[s.tier].post) post.render(dt, t, fx); else renderer.render(scene, camera);
  frames++;
}

// handles for the render tests and for debugging in the console
window.__xx = {
  store, bus, places: PLACES, quality,
  get frames() { return frames; },
  get postLoaded() { return !!post; },
  get postActive() { return !!post && TIERS[store.get().tier].post; },
  openReal: (id) => openReal(placeIndex(id)),
};

/* ---------- boot ---------- */
(async () => {
  const tex = await textures.load('2k');
  earth.setTextures(tex);
  store.set({ texturesReady: true, textureSet: '2k' });
  window.__globeReady = true;
  $('loader').classList.add('done');

  // deep links: #paris (fly to it) · #paris/3d (dive straight into the photoreal view)
  const [hId, hMode] = location.hash.slice(1).split('/');
  const fromHash = placeIndex(hId);
  if (shouldPlayIntro({ reducedMotion, deepLink: fromHash >= 0 })) playIntro();
  else {
    camera.position.copy(homeDirection()).multiplyScalar(HOME_DIST);
    store.set({ mode: 'globe' }); arcs.show(true); rig.resetIdle();
  }
  if (fromHash >= 0) setTimeout(() => (hMode === '3d' ? openReal(fromHash, { deepLink: true }) : select(fromHash)), 700);
  if (TIERS[store.get().tier].texture === '4k') setTimeout(upgradeTextures, 400);
})();
requestAnimationFrame(frame);
