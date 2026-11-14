// Cinematic transition state shared by every tier: one set of effect levels (motion blur,
// chromatic aberration, colour flash) animated with small tweens. The post chain reads them
// on medium/high; the CSS #flash overlay mirrors the flash so the low tier still gets the cut.
export function createFx(flashEl) {
  const fx = { blur: 0, aberration: 0, flash: 0 };
  const tweens = new Set();
  function tween(key, to, ms, ease = (t) => t) {
    for (const t of tweens) if (t.key === key) { tweens.delete(t); t.resolve(false); }
    return new Promise((resolve) => tweens.add({ key, from: fx[key], to, t0: performance.now(), ms: Math.max(1, ms), ease, resolve }));
  }
  function update(now, base = {}) {
    for (const t of [...tweens]) {
      const k = Math.min(1, (now - t.t0) / t.ms);
      fx[t.key] = t.from + (t.to - t.from) * t.ease(k);
      if (k >= 1) { tweens.delete(t); t.resolve(true); }
    }
    // the flash is always the CSS overlay: it has to cover the Cesium view too
    if (flashEl) { const o = Math.min(1, fx.flash); flashEl.style.opacity = o > 0.001 ? String(o) : '0'; }
    // ambient motion-blur from camera speed (intro, fast flights) is added on top of tweened levels
    return {
      blur: Math.min(1.2, fx.blur + (base.blur || 0)),
      aberration: Math.min(1.5, fx.aberration + (base.aberration || 0)),
    };
  }
  const set = (key, v) => { for (const t of tweens) if (t.key === key) { tweens.delete(t); t.resolve(false); } fx[key] = v; };
  return { fx, tween, update, set };
}
