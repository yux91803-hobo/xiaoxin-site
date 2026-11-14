// Quality-tier manager: reads device signals once, resolves the tier from the user's
// 画质 choice (自动/高/中/低, kept in localStorage, overridable with ?q=high|medium|low),
// and in 自动 mode runs an FPS governor that steps the tier down if frames stay slow.
import { TIERS, detectTier, resolveTier, governorStep, nextMode } from './quality.js';
import { QUALITY_KEY } from '../config.js';

function gpuString(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch { return ''; }
}

export function createQualityManager(renderer, { store, bus }) {
  const signals = {
    gpu: gpuString(renderer),
    coarsePointer: matchMedia('(pointer:coarse)').matches,
    screenMax: Math.max(screen.width || 0, screen.height || 0),
    deviceMemory: navigator.deviceMemory,
    cores: navigator.hardwareConcurrency,
    saveData: !!(navigator.connection && navigator.connection.saveData),
  };
  const detected = detectTier(signals);
  const qp = new URLSearchParams(location.search).get('q');
  let saved = null; try { saved = localStorage.getItem(QUALITY_KEY); } catch {}
  const mode = TIERS[qp] ? qp : (saved && (saved === 'auto' || TIERS[saved]) ? saved : 'auto');
  store.set({ qualityMode: mode, tier: resolveTier(mode, detected), detectedTier: detected, gpu: signals.gpu });

  // FPS governor (auto mode only, globe visible, after the intro)
  let frames = 0, acc = 0, low = 0, warmup = 3;
  function sample(dt) {
    const s = store.get();
    if (s.qualityMode !== 'auto' || s.mode !== 'globe' || document.hidden) { frames = 0; acc = 0; return; }
    if (dt > 0.5) return;                 // tab switch / hitch: not a rendering measurement
    frames++; acc += dt;
    if (acc < 3) return;
    const fps = frames / acc; frames = 0; acc = 0;
    store.set({ fps: Math.round(fps) });
    if (warmup-- > 0) return;
    const r = governorStep(s.tier, fps, low);
    low = r.lowCount;
    if (r.changed) { store.set({ tier: r.tier, detectedTier: r.tier }); bus.emit('quality:auto-lowered', { tier: r.tier, fps }); }
  }

  function cycle() {
    const s = store.get();
    const m = nextMode(s.qualityMode);
    try { localStorage.setItem(QUALITY_KEY, m); } catch {}
    low = 0; warmup = 2;
    store.set({ qualityMode: m, tier: resolveTier(m, s.detectedTier) });
  }

  return { signals, detected, sample, cycle, tierConfig: () => TIERS[store.get().tier] };
}
