// Tiny typed-by-convention event bus ("domain:verb" names). Handlers run synchronously;
// one failing handler is logged and does not stop the others.
export function createBus() {
  const map = new Map();
  const on = (type, fn) => { if (!map.has(type)) map.set(type, new Set()); map.get(type).add(fn); return () => off(type, fn); };
  const off = (type, fn) => { const s = map.get(type); if (s) s.delete(fn); };
  const once = (type, fn) => { const u = on(type, (p) => { u(); fn(p); }); return u; };
  function emit(type, payload) {
    const s = map.get(type); if (!s) return 0;
    for (const fn of [...s]) { try { fn(payload); } catch (e) { console.error(`[bus] ${type} handler failed`, e); } }
    return s.size;
  }
  return { on, off, once, emit };
}
