export const $ = (id) => document.getElementById(id);
export const fmtCoord = (v, p, n) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? p : n}`;
