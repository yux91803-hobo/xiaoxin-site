// Photoreal mode: CesiumJS + Google Photorealistic 3D Tiles (Cesium ion asset 2275207).
// A lazy chunk: main.js imports it only when the user dives in, and it in turn loads the
// self-hosted CesiumJS build from /vendor/cesium/, so the globe home page never downloads Cesium.
// Pattern follows the CesiumJS Sandcastle "Google Photorealistic 3D Tiles" example
// (Viewer with globe:false + the photorealistic tileset), with the base layer and
// geocoder turned off and the ion token fetched from /config.json at runtime.
import { subsolarPoint } from '../scene/astro.js';

const CESIUM_BASE = '/vendor/cesium/';
const GOOGLE_3D_TILES_ASSET = 2275207;
const FIRST_TILE_TIMEOUT_MS = 30000;   // nothing rendered by then → treat as unreachable
const ORBIT_RAD_PER_S = 0.045;         // gentle auto-orbit until the user touches the view
const SUN_ELEVATION_DEG = 32;          // afternoon sun this high: readable shadows without dusk darkness

const MSG = {
  'no-token': '卫星实景还没配置好，先带你回到地球仪。',
  'cesium-load': '实景组件没能加载，可能是网络不太好，先回到地球仪。',
  'webgl': '你的浏览器或设备暂不支持实景所需的 WebGL，先回到地球仪。',
  'quota': '今天的卫星实景额度用完了，明天再来看看吧。先回到地球仪。',
  'tiles': '暂时连不上卫星实景（可能是网络访问不到 Google，或额度已用完），先回到地球仪看看吧。',
};
class RealError extends Error { constructor(code, cause){ super(code); this.code = code; this.cause = cause; } }

const $ = (id) => document.getElementById(id);
const el = { root:$('real'), view:$('realView'), loading:$('realLoading'), back:$('realBack'), name:$('realName'), spot:$('realSpot'), hint:$('realHint') };
let api = null;       // hooks from main.js: pause(), resume(), toast()
let tier = null;      // quality tier config from main.js

let Cesium = null, cesiumPromise = null, tokenPromise = null;
let viewer = null, tileset = null;
let active = false, session = 0, pushed = false, place = null;
let orbit = false, removeTick = null, watchdog = 0;
let tilesLoaded = 0, tilesFailed = 0, lastFailure = '';

/* ---------- loading ---------- */
function loadCesium(){
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (cesiumPromise) return cesiumPromise;
  window.CESIUM_BASE_URL = CESIUM_BASE;
  if (!document.querySelector('link[data-cesium]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = CESIUM_BASE + 'Widgets/widgets.css'; css.dataset.cesium = '';
    document.head.appendChild(css);
  }
  cesiumPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CESIUM_BASE + 'Cesium.js'; s.async = true;
    s.onload = () => window.Cesium ? resolve(window.Cesium) : reject(new RealError('cesium-load'));
    s.onerror = () => { s.remove(); reject(new RealError('cesium-load')); };
    document.head.appendChild(s);
  }).catch((e) => { cesiumPromise = null; throw e; });
  return cesiumPromise;
}
function loadToken(){
  if (tokenPromise) return tokenPromise;
  tokenPromise = fetch('/config.json', { cache:'no-store', credentials:'same-origin' })
    .then((r) => { if (!r.ok) throw new RealError('tiles'); return r.json(); })
    .then((j) => { if (!j || !j.cesiumIonToken) throw new RealError('no-token'); return j.cesiumIonToken; })
    .catch((e) => { tokenPromise = null; throw e instanceof RealError ? e : new RealError('tiles', e); });
  return tokenPromise;
}
const looksLikeQuota = (s) => /\b429\b|quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(String(s || ''));

function ensureViewer(token){
  Cesium.Ion.defaultAccessToken = token;
  if (viewer) return;
  try {
    viewer = new Cesium.Viewer(el.view, {
      globe: false,               // the photorealistic tiles already contain the terrain
      baseLayer: false, baseLayerPicker: false, geocoder: false,
      homeButton: false, sceneModePicker: false, navigationHelpButton: false,
      animation: false, timeline: false, fullscreenButton: false,
      infoBox: false, selectionIndicator: false,
      msaaSamples: 1,
    });
  } catch (e) { throw new RealError('webgl', e); }
  const scene = viewer.scene;
  scene.skyAtmosphere.show = true;
  // cinematic lighting: a real sun at a chosen local time, atmosphere lit by it, light haze
  scene.light = new Cesium.SunLight();
  if (scene.atmosphere && Cesium.DynamicAtmosphereLightingType) scene.atmosphere.dynamicLighting = Cesium.DynamicAtmosphereLightingType.SUNLIGHT;
  scene.fog.enabled = true; scene.fog.density = 2.0e-4; scene.fog.minimumBrightness = 0.06;
  viewer.clock.shouldAnimate = false;
  if (scene.postProcessStages && scene.postProcessStages.fxaa) scene.postProcessStages.fxaa.enabled = true;
  const ctl = scene.screenSpaceCameraController;
  ctl.minimumZoomDistance = 40; ctl.maximumZoomDistance = 25000;
  viewer.cesiumWidget.creditContainer.setAttribute('lang', 'en');
  // stop the auto-orbit as soon as the user takes over
  const stop = () => { orbit = false; el.hint.style.opacity = '0'; };
  ['pointerdown', 'wheel', 'touchstart'].forEach((t) => scene.canvas.addEventListener(t, stop, { passive:true }));
  removeTick = viewer.clock.onTick.addEventListener(() => {
    if (!orbit || !active) return;
    const now = performance.now(), dt = Math.min(0.1, (now - (orbit.t || now)) / 1000); orbit.t = now;
    viewer.camera.rotateRight(ORBIT_RAD_PER_S * dt);
  });
}

async function ensureTileset(){
  if (tileset) return;
  let resource;
  try { resource = await Cesium.IonResource.fromAssetId(GOOGLE_3D_TILES_ASSET); }
  catch (e) { throw new RealError(looksLikeQuota(e && (e.statusCode || e.message)) ? 'quota' : 'tiles', e); }
  try {
    tileset = await Cesium.Cesium3DTileset.fromUrl(resource, {
      showCreditsOnScreen: true,          // Google + data attributions must be visible
      enableCollision: true,              // keep the camera above the buildings
      cacheBytes: 768 * 1024 * 1024, maximumCacheOverflowBytes: 512 * 1024 * 1024,
      maximumScreenSpaceError: (tier && tier.photorealSSE) || (matchMedia('(max-width:760px)').matches ? 20 : 16),
      shadows: Cesium.ShadowMode.ENABLED,
    });
  } catch (e) { throw new RealError(looksLikeQuota(e && (e.statusCode || e.message)) ? 'quota' : 'tiles', e); }
  tileset.tileLoad.addEventListener(() => { tilesLoaded++; });
  tileset.tileFailed.addEventListener((err) => {
    tilesFailed++; lastFailure = (err && err.message) || '';
    if (active && tilesLoaded === 0 && (tilesFailed >= 4 || looksLikeQuota(lastFailure))) fail(new RealError(looksLikeQuota(lastFailure) ? 'quota' : 'tiles'));
  });
  viewer.scene.primitives.add(tileset);
}

/* ---------- lighting ---------- */
// Afternoon light for today's date at this place: the local solar time at which the sun stands
// SUN_ELEVATION_DEG high (or ~80% of its noon height in a high-latitude winter), so every place
// gets warm, readable light instead of a dusk that depends on the season.
// Soft shadows only on the high tier (shadow maps are the expensive part).
export function afternoonSolarHour(latDeg, date = new Date()){
  const r = Math.PI / 180, phi = latDeg * r, dec = subsolarPoint(date).lat * r;
  const noonEl = 90 - Math.abs(latDeg - dec / r);
  const target = Math.min(SUN_ELEVATION_DEG, Math.max(5, noonEl * 0.8)) * r;
  const cosH = (Math.sin(target) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  const H = Math.acos(Math.min(1, Math.max(-1, cosH))) / r;   // hour angle, degrees
  return 12 + H / 15;
}
function lightFor(pl){
  const C = Cesium, d = new Date();
  const hour = afternoonSolarHour(pl.view.lat, d);
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + (hour - pl.view.lon / 15) * 3600000);
  viewer.clock.currentTime = C.JulianDate.fromDate(utc);
  const hi = !!(tier && tier.photorealShadows);
  viewer.shadows = hi;
  if (hi) {
    const sm = viewer.scene.shadowMap;
    sm.softShadows = true; sm.size = 2048; sm.darkness = 0.3; sm.maximumDistance = 3000;
  }
}

/* ---------- camera ---------- */
function flyToPlace(pl, mySession){
  const v = pl.view, C = Cesium;
  const target = C.Cartesian3.fromDegrees(v.lon, v.lat, v.h);
  const offset = new C.HeadingPitchRange(C.Math.toRadians(v.heading), C.Math.toRadians(v.pitch), v.range);
  orbit = false;
  viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
  // start high above the place, then dive in like a satellite zoom
  viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(v.lon, v.lat, 2.5e6) });
  viewer.camera.flyToBoundingSphere(new C.BoundingSphere(target, 0), {
    offset, duration: 2.8, easingFunction: C.EasingFunction.QUADRATIC_IN_OUT,
    complete: () => {
      if (!active || mySession !== session) return;
      viewer.camera.lookAt(target, offset);   // orbit/zoom now pivot around the landmark
      orbit = { t: 0 };
    },
  });
}

/* ---------- open / close ---------- */
function show(){
  el.root.classList.add('on'); el.root.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => { if (active) el.root.classList.add('vis'); });
}
function hide(){
  el.root.classList.remove('vis'); el.root.setAttribute('aria-hidden', 'true');
  setTimeout(() => { if (!active) el.root.classList.remove('on'); }, 450);
}

export async function openPhotoreal(pl, opts = {}){
  if (active) return;
  api = opts.api || api || { pause(){}, resume(){}, toast(m){ console.warn(m); } };
  tier = opts.tier || tier;
  if (!pl || !pl.view) throw new Error('place has no view');
  active = true; place = pl; const mySession = ++session;
  tilesLoaded = 0; tilesFailed = 0; lastFailure = '';
  el.name.textContent = `${pl.name} · 卫星实景`;
  el.spot.textContent = pl.spot ? `${pl.spot} · ${pl.region}` : pl.region;
  el.hint.textContent = matchMedia('(pointer:coarse)').matches ? '单指拖动环绕 · 双指缩放' : '拖动环绕 · 滚轮缩放 · 右键拖动倾斜';
  el.hint.style.opacity = '';
  el.loading.classList.remove('hide');
  if (opts.deepLink) history.replaceState({ real: pl.id }, '', `#${pl.id}/3d`);
  else { history.pushState({ real: pl.id }, '', `#${pl.id}/3d`); pushed = true; }
  show();
  api.pause();
  try {
    const [C, token] = await Promise.all([loadCesium(), loadToken()]);
    Cesium = C;
    if (!active || mySession !== session) return;
    ensureViewer(token);
    viewer.useDefaultRenderLoop = true;
    viewer.resize();
    await ensureTileset();
    if (!active || mySession !== session) return;
    lightFor(pl);
    flyToPlace(pl, mySession);
    clearTimeout(watchdog);
    const waitFirst = () => {
      if (!active || mySession !== session) return;
      if (tilesLoaded > 0) { el.loading.classList.add('hide'); return; }
      watchdog = setTimeout(waitFirst, 400);
    };
    waitFirst();
    setTimeout(() => {
      if (active && mySession === session && tilesLoaded === 0) fail(new RealError(looksLikeQuota(lastFailure) ? 'quota' : 'tiles'));
    }, FIRST_TILE_TIMEOUT_MS);
  } catch (e) { fail(e); }
}

function fail(e){
  if (!active) return;
  console.warn('photoreal failed:', e && (e.code || e), e && e.cause);
  const code = e instanceof RealError ? e.code : 'tiles';
  if (code === 'quota' || code === 'tiles') { if (tileset && tilesLoaded === 0) { viewer.scene.primitives.remove(tileset); tileset = null; } }
  close();
  api.toast(MSG[code] || MSG.tiles, 8000);
}

function close({ fromPop = false } = {}){
  if (!active) return;
  active = false; session++; orbit = false; clearTimeout(watchdog);
  if (viewer) { viewer.camera.cancelFlight(); viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY); viewer.useDefaultRenderLoop = false; }
  hide();
  if (!fromPop) {
    if (pushed) { pushed = false; history.back(); }
    else history.replaceState(null, '', place ? `#${place.id}` : location.pathname);
  } else pushed = false;
  api.resume();
}

el.back.addEventListener('click', () => close());
window.addEventListener('popstate', () => { if (active) close({ fromPop: true }); });
window.addEventListener('keydown', (e) => { if (active && e.key === 'Escape') close(); });

// exposed for the smoke checks in test/ and for debugging
window.__photoreal = { get viewer(){ return viewer; }, get active(){ return active; }, get tilesLoaded(){ return tilesLoaded; }, get tilesFailed(){ return tilesFailed; } };
