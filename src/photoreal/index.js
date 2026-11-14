// Photoreal mode: CesiumJS + Google Photorealistic 3D Tiles (Cesium ion asset 2275207).
// A lazy chunk: main.js imports it only when the user dives in, and it in turn loads the
// self-hosted CesiumJS build from /vendor/cesium/, so the globe home page never downloads Cesium.
// Pattern follows the CesiumJS Sandcastle "Google Photorealistic 3D Tiles" example
// (Viewer with globe:false + the photorealistic tileset), with the base layer and
// geocoder turned off and the ion token fetched from /config.json at runtime.
import { subsolarPoint } from '../scene/astro.js';
import { photorealSettings, createLoadProgress, isIOS } from './settings.js';

const CESIUM_BASE = '/vendor/cesium/';
const GOOGLE_3D_TILES_ASSET = 2275207;
const FIRST_TILE_TIMEOUT_MS = 30000;   // nothing rendered by then → treat as unreachable
const ORBIT_RAD_PER_S = 0.045;         // gentle auto-orbit until the user touches the view
const SUN_ELEVATION_DEG = 32;          // afternoon sun this high: warm, readable light without dusk darkness

const MSG = {
  'no-token': '卫星实景还没配置好，先带你回到地球仪。',
  'cesium-load': '实景组件没能加载，可能是网络不太好，先回到地球仪。',
  'webgl': '你的浏览器或设备暂不支持实景所需的 WebGL，先回到地球仪。',
  'quota': '今天的卫星实景额度用完了，明天再来看看吧。先回到地球仪。',
  'tiles': '暂时连不上卫星实景（可能是网络访问不到 Google，或额度已用完），先回到地球仪看看吧。',
  'context-lost': '手机内存有点吃紧，系统暂停了高清实景，先带你回到地球仪。可以在「画质」里调低一档再试。',
  'render': '高清实景渲染出了点问题，先带你回到地球仪，稍后再试试。',
};
class RealError extends Error { constructor(code, cause){ super(code); this.code = code; this.cause = cause; } }

const $ = (id) => document.getElementById(id);
const el = { root:$('real'), view:$('realView'), loading:$('realLoading'), back:$('realBack'), name:$('realName'), spot:$('realSpot'), hint:$('realHint'),
  progress:$('realProgress'), progressText:$('realProgressText'), progressBar:$('realProgressBar') };
let api = null;       // hooks from main.js: pause(), resume(), toast()
let tier = null;      // quality tier config from main.js

let Cesium = null, cesiumPromise = null, tokenPromise = null;
let viewer = null, tileset = null;
let active = false, session = 0, pushed = false, place = null;
let orbit = false, orbitArmed = false, removeTick = null, watchdog = 0;
let tilesLoaded = 0, tilesFailed = 0, lastFailure = '';
let cfg = photorealSettings('medium');   // per-open settings for this tier + device (see settings.js)
let landed = false, phaseStart = 0, contextLost = false, reloadTimer = 0, hideProgressTimer = 0;
const progress = createLoadProgress();

function deviceSignals(){
  const coarse = matchMedia('(pointer:coarse)').matches;
  const screenMax = Math.max(screen.width || 0, screen.height || 0);
  const ios = isIOS(navigator.userAgent, navigator.platform, navigator.maxTouchPoints || 0);
  return { ios, mobile: ios || (coarse && screenMax < 1400), dpr: window.devicePixelRatio || 1 };
}

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
  if (viewer) { applyViewerSettings(); return; }
  contextLost = false;
  try {
    viewer = new Cesium.Viewer(el.view, {
      globe: false,               // the photorealistic tiles already contain the terrain
      baseLayer: false, baseLayerPicker: false, geocoder: false,
      homeButton: false, sceneModePicker: false, navigationHelpButton: false,
      animation: false, timeline: false, fullscreenButton: false,
      infoBox: false, selectionIndicator: false,
      msaaSamples: cfg.viewer.msaaSamples,
      useBrowserRecommendedResolution: cfg.viewer.useBrowserRecommendedResolution,  // CSS px, not DPR 3
      showRenderLoopErrors: false,          // we show our own message and go back to the globe
    });
  } catch (e) { throw new RealError('webgl', e); }
  const scene = viewer.scene;
  scene.skyAtmosphere.show = true;
  // cinematic lighting: a real sun at a chosen local time, atmosphere lit by it, light haze
  scene.light = new Cesium.SunLight();
  if (scene.atmosphere && Cesium.DynamicAtmosphereLightingType) scene.atmosphere.dynamicLighting = Cesium.DynamicAtmosphereLightingType.SUNLIGHT;
  scene.fog.enabled = true; scene.fog.density = 2.0e-4; scene.fog.minimumBrightness = 0.06;
  viewer.clock.shouldAnimate = false;
  applyViewerSettings();
  // iOS WebKit drops the WebGL context under memory pressure; Cesium can't recover from that,
  // so tell the user and go back to the globe (a fresh viewer is built on the next visit)
  scene.canvas.addEventListener('webglcontextlost', onContextLost, false);
  // a lost context usually surfaces first as a render error (shader compile fails) before the
  // webglcontextlost event arrives, so check the context to show the right message
  scene.renderError.addEventListener((_s, err) => { console.warn('photoreal render error:', err); handleBrokenViewer(glLost() ? 'context-lost' : 'render'); });
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

function applyViewerSettings(){
  viewer.resolutionScale = cfg.viewer.resolutionScale;
  const pp = viewer.scene.postProcessStages;
  if (pp && pp.fxaa) pp.fxaa.enabled = cfg.viewer.fxaa;
}
function glLost(){
  try { const gl = viewer && viewer.scene.context._gl; return !!(gl && gl.isContextLost()); } catch { return false; }
}
function onContextLost(e){
  if (e && e.preventDefault) e.preventDefault();
  contextLost = true;
  console.warn('photoreal: WebGL context lost');
  handleBrokenViewer('context-lost');
}
function handleBrokenViewer(code){
  if (active) fail(new RealError(code));
  else setTimeout(() => { if (!active) destroyViewer(); }, 0);
}
function destroyViewer(){
  const v = viewer;
  viewer = null; tileset = null; orbit = false;
  if (removeTick) { try { removeTick(); } catch {} removeTick = null; }
  if (!v) return;
  try { v.scene.canvas.removeEventListener('webglcontextlost', onContextLost, false); } catch {}
  try { v.destroy(); } catch (err) { console.warn('photoreal: destroy failed', err); }
  el.view.textContent = '';
}

function applyTilesetSettings(){
  const t = cfg.tileset;
  tileset.maximumScreenSpaceError = t.maximumScreenSpaceError;
  tileset.cacheBytes = t.cacheBytes;
  tileset.maximumCacheOverflowBytes = t.maximumCacheOverflowBytes;
}
async function ensureTileset(){
  if (tileset) { applyTilesetSettings(); return; }
  let resource;
  try { resource = await Cesium.IonResource.fromAssetId(GOOGLE_3D_TILES_ASSET); }
  catch (e) { throw new RealError(looksLikeQuota(e && (e.statusCode || e.message)) ? 'quota' : 'tiles', e); }
  try {
    tileset = await Cesium.Cesium3DTileset.fromUrl(resource, {
      showCreditsOnScreen: true,          // Google + data attributions must be visible
      enableCollision: true,              // keep the camera above the buildings
      ...cfg.tileset,                     // SSE, cache budget, flight/foveation tuning per tier + device
      shadows: Cesium.ShadowMode.DISABLED,  // tiles have baked shadows (see lightFor)
    });
  } catch (e) { throw new RealError(looksLikeQuota(e && (e.statusCode || e.message)) ? 'quota' : 'tiles', e); }
  tileset.tileLoad.addEventListener(() => { tilesLoaded++; progress.tileDone(); });
  tileset.loadProgress.addEventListener(onLoadProgress);
  tileset.allTilesLoaded.addEventListener(onAllTilesLoaded);
  tileset.tileFailed.addEventListener((err) => {
    tilesFailed++; progress.tileDone(); lastFailure = (err && err.message) || '';
    if (active && tilesLoaded === 0 && (tilesFailed >= 4 || looksLikeQuota(lastFailure))) fail(new RealError(looksLikeQuota(lastFailure) ? 'quota' : 'tiles'));
  });
  viewer.scene.primitives.add(tileset);
}

/* ---------- loading progress 「正在加载高清实景 xx%」 ---------- */
function setProgress(pct){
  const slow = !progress.complete && performance.now() - phaseStart > cfg.slowLoadingHintMs;
  el.progressText.textContent = `${slow ? '网络较慢，' : ''}正在加载高清实景 ${pct}%`;
  el.progressBar.style.transform = `scaleX(${pct / 100})`;
}
function showProgress(){
  clearTimeout(hideProgressTimer);
  el.progress.hidden = false;
  requestAnimationFrame(() => el.progress.classList.add('on'));
}
function hideProgress(delay = 0){
  clearTimeout(hideProgressTimer);
  hideProgressTimer = setTimeout(() => {
    el.progress.classList.remove('on');
    hideProgressTimer = setTimeout(() => { el.progress.hidden = true; }, 400);
  }, delay);
}
function onLoadProgress(pending, processing){
  if (!active) return;
  if (progress.complete) {
    // later loading after the user moved the camera: show the pill again only if it takes a
    // while (the slow auto-orbit streams in small bits all the time; that never shows it)
    if (pending + processing > 0 && !orbit && !reloadTimer) {
      reloadTimer = setTimeout(() => {
        reloadTimer = 0;
        if (!active || orbit || !tileset || tileset.tilesLoaded) return;
        progress.reset(); phaseStart = performance.now();
        setProgress(progress.update(pending, processing)); showProgress();
      }, 1500);
    }
    return;
  }
  setProgress(progress.update(pending, processing));
}
function onAllTilesLoaded(){
  if (!active || !landed) return;      // mid-flight "all loaded" is just an intermediate LOD
  clearTimeout(reloadTimer); reloadTimer = 0;
  if (!progress.complete) { setProgress(progress.finish()); hideProgress(700); }
  else hideProgress(0);
  el.loading.classList.add('hide');
  if (cfg.orbitAfterLoad && !orbit && orbitArmed) { orbitArmed = false; orbit = { t: 0 }; }
}

/* ---------- lighting ---------- */
// Afternoon light for today's date at this place: the local solar time at which the sun stands
// SUN_ELEVATION_DEG high (or ~80% of its noon height in a high-latitude winter), so every place
// gets warm, readable light instead of a dusk that depends on the season.
// No real-time shadow maps: Google's photorealistic tiles already carry baked-in shadows, and
// Cesium's shadow map on them produced acne/moire stripes on roofs and water (checked on staging).
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
  viewer.shadows = false;
}

/* ---------- camera ---------- */
function flyToPlace(pl, mySession){
  const v = pl.view, C = Cesium;
  const target = C.Cartesian3.fromDegrees(v.lon, v.lat, v.h);
  const offset = new C.HeadingPitchRange(C.Math.toRadians(v.heading), C.Math.toRadians(v.pitch), v.range);
  orbit = false;
  viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
  // start high above the place, then dive in like a satellite zoom
  // (phones start lower: fewer intermediate LODs fetched and cached on the way down)
  viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(v.lon, v.lat, v.h + cfg.diveFromHeight) });
  viewer.camera.flyToBoundingSphere(new C.BoundingSphere(target, 0), {
    offset, duration: cfg.diveSeconds, easingFunction: C.EasingFunction.QUADRATIC_IN_OUT,
    complete: () => {
      if (!active || mySession !== session) return;
      viewer.camera.lookAt(target, offset);   // orbit/zoom now pivot around the landmark
      landed = true;
      // auto-orbit only once the landing view has fully refined: a moving camera defers
      // foveated/peripheral tiles, which on a phone looked like "it never sharpens"
      if (cfg.orbitAfterLoad) { orbitArmed = true; if (tileset && tileset.tilesLoaded) onAllTilesLoaded(); }
      else orbit = { t: 0 };
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
  cfg = photorealSettings((tier && tier.name) || 'medium', deviceSignals());
  landed = false; orbitArmed = false; phaseStart = performance.now();
  progress.reset(); setProgress(0); el.progress.hidden = true; el.progress.classList.remove('on');
  clearTimeout(reloadTimer); reloadTimer = 0; clearTimeout(hideProgressTimer);
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
      // first tiles are in: swap the full-screen loader for the small 「正在加载高清实景 xx%」 pill
      if (tilesLoaded > 0) { el.loading.classList.add('hide'); if (!progress.complete) showProgress(); return; }
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
  if (code === 'quota' || code === 'tiles') { if (viewer && tileset && tilesLoaded === 0) { viewer.scene.primitives.remove(tileset); tileset = null; } }
  close();
  // rebuilt fresh on the next visit; deferred so we never destroy from inside Cesium's render loop
  if (code === 'context-lost' || code === 'render') setTimeout(() => { if (!active) destroyViewer(); }, 0);
  api.toast(MSG[code] || MSG.tiles, 8000);
}

function close({ fromPop = false } = {}){
  if (!active) return;
  active = false; session++; orbit = false; orbitArmed = false; landed = false; clearTimeout(watchdog);
  clearTimeout(reloadTimer); reloadTimer = 0; hideProgress(0);
  if (viewer && !contextLost) {
    try { viewer.camera.cancelFlight(); viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY); viewer.useDefaultRenderLoop = false; } catch {}
  }
  hide();
  // phones hand the GPU memory back to the globe; desktop keeps the viewer for a quick re-entry
  if (cfg.destroyViewerOnClose) { const s0 = session; setTimeout(() => { if (!active && session === s0) destroyViewer(); }, 500); }
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
window.__photoreal = {
  get viewer(){ return viewer; }, get active(){ return active; }, get tilesLoaded(){ return tilesLoaded; }, get tilesFailed(){ return tilesFailed; },
  get settings(){ return cfg; }, get progress(){ return progress.percent; }, get landed(){ return landed; }, get orbiting(){ return !!orbit; },
  // checks WebGL context-loss handling (WEBGL_lose_context), as iOS does under memory pressure
  loseContext(){ const gl = viewer && viewer.scene.context._gl; const x = gl && gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); return !!x; },
};
