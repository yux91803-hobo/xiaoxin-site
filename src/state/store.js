// Minimal observable store: one immutable state object, shallow-merged updates,
// subscribers get (next, prev). `watch` fires only when a selected slice changes.
export function createStore(initial = {}) {
  let state = Object.freeze({ ...initial });
  const subs = new Set();
  const get = () => state;
  function set(patch) {
    const next = typeof patch === 'function' ? patch(state) : patch;
    if (!next) return state;
    let changed = false;
    for (const k of Object.keys(next)) if (!Object.is(next[k], state[k])) { changed = true; break; }
    if (!changed) return state;
    const prev = state;
    state = Object.freeze({ ...state, ...next });
    for (const fn of [...subs]) fn(state, prev);
    return state;
  }
  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  function watch(selector, fn, { immediate = false } = {}) {
    let last = selector(state);
    if (immediate) fn(last, undefined);
    return subscribe((s) => { const v = selector(s); if (!Object.is(v, last)) { const p = last; last = v; fn(v, p); } });
  }
  return { get, set, subscribe, watch };
}
