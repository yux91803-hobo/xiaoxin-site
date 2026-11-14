// Sun position for the real-time day/night terminator.
// Low-precision solar coordinates from the Astronomical Almanac (accurate to ~0.01°,
// far below what a globe can show), as used by NOAA's solar calculator and most
// "threejs earth day/night" projects. Pure functions: no three.js, unit-tested in node.
const D2R = Math.PI / 180;
const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/** Sub-solar point (where the sun is directly overhead) for a Date, in degrees. */
export function subsolarPoint(date = new Date()) {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;     // days since J2000.0
  const L = (280.460 + 0.9856474 * n) % 360;                        // mean longitude
  const g = ((357.528 + 0.9856003 * n) % 360) * D2R;                // mean anomaly
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R; // ecliptic longitude
  const eps = (23.439 - 0.0000004 * n) * D2R;                       // obliquity
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;          // Greenwich sidereal time (deg)
  return { lat: dec / D2R, lon: wrap180(ra / D2R - gmst) };
}

/** Same lat/lon → xyz mapping three.js SphereGeometry uses for its uv layout (radius r). */
export function latLonToXYZ(lat, lon, r = 1) {
  const phi = (90 - lat) * D2R, th = (lon + 180) * D2R;
  return [-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th)];
}

/** Unit vector toward the sun in the globe's frame. */
export function sunDirection(date = new Date()) {
  const s = subsolarPoint(date);
  return latLonToXYZ(s.lat, s.lon, 1);
}

/** UTC Date at which local mean solar time at `lon` is `hour` on the given day. */
export function utcForLocalSolarHour(lon, hour, day = new Date()) {
  const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  return new Date(d.getTime() + ((hour - lon / 15) * 3600000));
}

/** Great-circle points between two lat/lon pairs, lifted into an arc. Returns [[x,y,z,t], ...]. */
export function greatCircleArc(a, b, samples = 64, r = 1, liftScale = 0.32) {
  const A = latLonToXYZ(a.lat, a.lon, 1), B = latLonToXYZ(b.lat, b.lon, 1);
  const dot = Math.min(1, Math.max(-1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
  const omega = Math.acos(dot), so = Math.sin(omega) || 1e-6;
  const lift = 0.04 + liftScale * omega / Math.PI;
  const out = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const k1 = Math.sin((1 - t) * omega) / so, k2 = Math.sin(t * omega) / so;
    const h = r * (1 + lift * Math.sin(Math.PI * t));
    out.push([(A[0] * k1 + B[0] * k2) * h, (A[1] * k1 + B[1] * k2) * h, (A[2] * k1 + B[2] * k2) * h, t]);
  }
  return out;
}
