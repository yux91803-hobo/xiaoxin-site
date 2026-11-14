// Earth texture sets. Every tier starts from the small 2k set (fast first paint);
// medium/high then stream the 4k day/night/cloud maps in and swap them without a hitch.
import * as THREE from 'three';
import { TEX } from '../config.js';

const SETS = {
  '2k': { day: 'earth-day-2k.webp', night: 'earth-night-2k.webp', clouds: 'earth-clouds-2k.webp', normal: 'earth-normal-2k.webp', water: 'earth-water-2k.webp' },
  '4k': { day: 'earth-day-4k.webp', night: 'earth-night-4k.webp', clouds: 'earth-clouds-4k.webp' },
};
const SRGB = new Set(['day', 'night']);

export function createTextureStore(renderer) {
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let loaded = null;
  const load1 = (key, file) => new Promise((res) => loader.load(TEX + file, (t) => {
    if (SRGB.has(key)) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    if (key === 'clouds') t.wrapS = THREE.RepeatWrapping;
    res(t);
  }, undefined, () => { console.warn('texture failed:', file); res(null); }));
  async function load(set) {
    const entries = Object.entries(SETS[set]);
    const tex = await Promise.all(entries.map(([k, f]) => load1(k, f)));
    const out = Object.fromEntries(entries.map(([k], i) => [k, tex[i]]));
    if (set === '4k' || !loaded) loaded = set;
    return out;
  }
  return { load, get loaded() { return loaded; } };
}
