// Photoreal (CesiumJS + Google Photorealistic 3D Tiles) settings per quality tier and device.
// Pure (no DOM, no Cesium), unit-tested in node; photoreal/index.js feeds it real device signals.
//
// Why phones get their own numbers: a 768 MiB tile cache (+512 MiB overflow) is far beyond what
// iOS WebKit lets one page hold (an in-app Safari sheet even less), while the three.js globe keeps
// its own WebGL context alive underneath. Under that pressure WebKit evicts/loses the WebGL context
// or stalls refinement, and the view stays on the coarsest LOD. References:
//  - Cesium Community "Crash on mobile" (community.cesium.com/t/crash-on-mobile/38913): iPhones
//    (not Android) reload/crash on the Google Photorealistic 3D Tiles Sandcastle; Cesium's advice is
//    smaller cacheBytes + maximumCacheOverflowBytes so the tileset drops to a lower-res view instead.
//  - Cesium Community "Cesium crashes iPhone SE CONTEXT_LOST_WEBGL" (t/16961, CesiumGS/cesium#10017)
//    and "Black stripes on 3D mode over iOS devices" (t/5547): higher SSE and lower resolutionScale
//    when iOS is detected.
//  - CesiumJS API docs: Cesium3DTileset cacheBytes / maximumCacheOverflowBytes /
//    memoryAdjustedScreenSpaceError / preloadFlightDestinations / cullRequestsWhileMoving /
//    foveatedScreenSpaceError; CesiumWidget useBrowserRecommendedResolution / resolutionScale
//    (render at CSS pixels, not devicePixelRatio 3 = 9x the fragments on an iPhone).
export const MiB = 1024 * 1024;

const DESKTOP = {
  high:   { sse: 12, cacheMiB: 512, overflowMiB: 256, resolutionScale: 1,   fxaa: true },
  medium: { sse: 16, cacheMiB: 384, overflowMiB: 192, resolutionScale: 1,   fxaa: true },
  low:    { sse: 24, cacheMiB: 256, overflowMiB: 128, resolutionScale: 1,   fxaa: false },
};
const PHONE = {
  high:   { sse: 24, cacheMiB: 256, overflowMiB: 64, resolutionScale: 1,   fxaa: true },
  medium: { sse: 28, cacheMiB: 192, overflowMiB: 64, resolutionScale: 1,   fxaa: true },
  low:    { sse: 32, cacheMiB: 128, overflowMiB: 32, resolutionScale: 0.9, fxaa: false },
};
// iOS WebKit (Safari, in-app Safari sheets, every iOS browser) is the strictest: cap the budget
// whatever the tier, since a jetsam kill or context loss is far worse than a slightly softer view.
const IOS_MAX_CACHE_MIB = 192, IOS_MAX_OVERFLOW_MIB = 64, IOS_MIN_SSE = 24;

/** iPhone / iPod / iPad (iPadOS reports a Mac UA but has touch points). */
export function isIOS(ua = '', platform = '', maxTouchPoints = 0) {
  return /iP(hone|od|ad)/.test(ua) || (/Mac/.test(platform || ua) && maxTouchPoints > 1);
}

/**
 * @param {'high'|'medium'|'low'} tierName quality tier the globe resolved (画质)
 * @param {{mobile?:boolean, ios?:boolean, dpr?:number}} device
 */
export function photorealSettings(tierName, device = {}) {
  const ios = !!device.ios, mobile = !!device.mobile || ios;
  const tierKey = DESKTOP[tierName] ? tierName : 'medium';
  const base = (mobile ? PHONE : DESKTOP)[tierKey];
  let cacheMiB = base.cacheMiB, overflowMiB = base.overflowMiB, sse = base.sse;
  if (ios) { cacheMiB = Math.min(cacheMiB, IOS_MAX_CACHE_MIB); overflowMiB = Math.min(overflowMiB, IOS_MAX_OVERFLOW_MIB); sse = Math.max(sse, IOS_MIN_SSE); }
  return {
    tier: tierKey, mobile, ios,
    tileset: {
      maximumScreenSpaceError: sse,
      cacheBytes: cacheMiB * MiB,
      maximumCacheOverflowBytes: overflowMiB * MiB,
      // load what the camera will see when the dive lands, not every LOD on the way down
      preloadFlightDestinations: true,
      cullRequestsWhileMoving: true,
      dynamicScreenSpaceError: true,
      foveatedScreenSpaceError: true,
      progressiveResolutionHeightFraction: mobile ? 0.5 : 0.3,
    },
    viewer: {
      // CSS-pixel rendering; never devicePixelRatio 3 on phones
      useBrowserRecommendedResolution: true,
      resolutionScale: base.resolutionScale,
      msaaSamples: 1,
      fxaa: base.fxaa,
    },
    // camera dive: phones start much lower so fewer intermediate tiles are fetched and cached
    diveFromHeight: mobile ? 40000 : 2.5e6,
    diveSeconds: mobile ? 2.0 : 2.8,
    // auto-orbit only after the first full refinement (a moving camera defers foveated tiles)
    orbitAfterLoad: true,
    orbitStartMaxWaitMs: mobile ? 20000 : 12000,
    // phones give the GPU memory back to the globe when leaving photoreal
    destroyViewerOnClose: mobile,
    slowLoadingHintMs: 20000,
  };
}

/**
 * Loading progress for 「正在加载高清实景 xx%」. Counts tiles finished since start and what Cesium
 * still has pending/processing; never goes backwards and only says 100 once Cesium says all loaded.
 */
export function createLoadProgress() {
  let done = 0, pct = 0, complete = false;
  return {
    tileDone() { done++; },
    update(pending, processing) {
      const left = Math.max(0, (pending | 0) + (processing | 0));
      const raw = done + left > 0 ? Math.floor((done / (done + left)) * 100) : 0;
      pct = Math.max(pct, Math.min(99, raw));
      return pct;
    },
    finish() { complete = true; pct = 100; return pct; },
    reset() { done = 0; pct = 0; complete = false; },
    get percent() { return pct; },
    get complete() { return complete; },
  };
}
