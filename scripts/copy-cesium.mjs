// Copies CesiumJS's prebuilt bundle (npm `cesium`, Build/Cesium) into public/vendor/cesium
// so it is served by Workers Static Assets from our own domain. Runs on `npm ci` (postinstall).
// Skips files the site never uses to keep the asset count low (Workers Static Assets: 25 MiB/file).
import { cpSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'cesium', 'Build', 'Cesium');
const dest = join(root, 'public', 'vendor', 'cesium');

if (!existsSync(src)) { console.error('copy-cesium: node_modules/cesium not found, run npm ci'); process.exit(1); }

const SKIP = [
  'index.js', 'index.cjs',                 // ESM/CJS duplicates of Cesium.js
  'Assets/Textures/maki',                  // 117 pin icons (PinBuilder), unused
  'Assets/Textures/NaturalEarthII',        // offline base imagery, unused (Google tiles only)
  'Assets/Textures/LensFlare',             // post-process effect, unused
];
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, {
  recursive: true,
  filter: (p) => {
    const rel = relative(src, p).split(sep).join('/');
    return !SKIP.some((s) => rel === s || rel.startsWith(s + '/'));
  },
});
const { version } = JSON.parse(readFileSync(join(root, 'node_modules', 'cesium', 'package.json'), 'utf8'));
writeFileSync(join(dest, 'VERSION'), version + '\n');
console.log(`copy-cesium: CesiumJS ${version} -> public/vendor/cesium`);
