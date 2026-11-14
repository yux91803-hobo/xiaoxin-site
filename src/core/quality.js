// Quality tiers and the rules that pick one. Pure (no DOM), unit-tested in node;
// quality-manager.js feeds it real device signals and runs the FPS governor.
export const TIER_ORDER = ['low', 'medium', 'high'];
export const TIER_LABEL = { auto: '自动', high: '高', medium: '中', low: '低' };
export const MODES = ['auto', 'high', 'medium', 'low'];

export const TIERS = {
  high: {
    name: 'high', maxPixelRatio: 2, texture: '4k', segments: 160,
    post: true, bloom: { strength: 0.75, radius: 0.5, threshold: 0.88, scale: 0.5 },
    grain: 0.022, aberration: true, cloudShadow: 0.55, stars: 9000, twinkle: 1, milkyWay: true,
    arcSamples: 150,
  },
  medium: {
    name: 'medium', maxPixelRatio: 1.5, texture: '4k', segments: 128,
    post: true, bloom: { strength: 0.65, radius: 0.45, threshold: 0.9, scale: 0.35 },
    grain: 0.018, aberration: false, cloudShadow: 0.45, stars: 5000, twinkle: 1, milkyWay: true,
    arcSamples: 90,
  },
  low: {
    name: 'low', maxPixelRatio: 1, texture: '2k', segments: 96,
    post: false, bloom: null,
    grain: 0, aberration: false, cloudShadow: 0, stars: 2500, twinkle: 0, milkyWay: false,
    arcSamples: 40,
  },
};

const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;
const WEAK_GPU = /mali-4|mali-t[0-9]|adreno \(tm\) [1-5]\d\d|powervr sgx|intel\(r\) hd graphics( [2-5]\d{3})?$|gma/i;

/**
 * Pick a tier from device signals.
 * @param {{gpu?:string, coarsePointer?:boolean, screenMax?:number, deviceMemory?:number, cores?:number, saveData?:boolean}} s
 */
export function detectTier(s = {}) {
  const gpu = String(s.gpu || '');
  if (SOFTWARE_GL.test(gpu)) return 'low';
  if (s.saveData) return 'low';
  if (WEAK_GPU.test(gpu)) return 'low';
  if (s.deviceMemory && s.deviceMemory <= 2) return 'low';
  const mobile = !!s.coarsePointer && (s.screenMax || 0) < 1400;
  if (mobile) return (s.deviceMemory && s.deviceMemory <= 4) || (s.cores && s.cores <= 4) ? 'low' : 'medium';
  if ((s.cores && s.cores <= 2) || (s.deviceMemory && s.deviceMemory <= 4)) return 'medium';
  return 'high';
}

/** Mode is the user's choice (auto/high/medium/low); the result is the tier to render with. */
export function resolveTier(mode, detected) {
  return mode && mode !== 'auto' && TIERS[mode] ? mode : (TIERS[detected] ? detected : 'medium');
}

export function lowerTier(t) {
  const i = TIER_ORDER.indexOf(t);
  return i > 0 ? TIER_ORDER[i - 1] : t;
}

export function nextMode(mode) {
  const i = MODES.indexOf(mode);
  return MODES[(i + 1) % MODES.length];
}

/**
 * FPS governor decision (auto mode only): drop one tier when the average stays
 * under the floor for `windows` consecutive measurement windows.
 */
export function governorStep(tier, fps, lowCount, { floor = { high: 42, medium: 30 }, windows = 2 } = {}) {
  const f = floor[tier];
  if (f == null) return { tier, lowCount: 0, changed: false };
  const c = fps < f ? lowCount + 1 : 0;
  if (c >= windows) return { tier: lowerTier(tier), lowCount: 0, changed: true };
  return { tier, lowCount: c, changed: false };
}
