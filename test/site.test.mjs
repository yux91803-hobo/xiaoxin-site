// Checks run by `npm test` locally and in both workflows (after `npm run build`, before any deploy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../index.js';
import { PLACES } from '../src/data/places.js';
import { ROUTES } from '../src/data/routes.js';
import { subsolarPoint, latLonToXYZ, greatCircleArc, utcForLocalSolarHour } from '../src/scene/astro.js';
import { TIERS, detectTier, resolveTier, governorStep, nextMode, lowerTier } from '../src/core/quality.js';
import { createStore } from '../src/state/store.js';
import { createBus } from '../src/state/bus.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const read = (p) => readFileSync(join(root, p), 'utf8');
const MiB = 1024 * 1024;
const assetsStub = { fetch: async (req) => new Response('asset:' + new URL(req.url).pathname) };
const walk = (d, out = []) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

/* ---------- Worker ---------- */
test('/config.json returns null token when the secret is missing', async () => {
  const res = await worker.fetch(new Request('https://x.test/config.json'), { ASSETS: assetsStub });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { cesiumIonToken: null });
});

test('/config.json returns the Worker secret as the token', async () => {
  const res = await worker.fetch(new Request('https://x.test/config.json'), { ASSETS: assetsStub, CESIUM_ION_TOKEN: 'test-token' });
  assert.deepEqual(await res.json(), { cesiumIonToken: 'test-token' });
  const post = await worker.fetch(new Request('https://x.test/config.json', { method: 'POST' }), { ASSETS: assetsStub });
  assert.equal(post.status, 405);
});

test('everything else is served by static assets', async () => {
  const res = await worker.fetch(new Request('https://x.test/vendor/cesium/Cesium.js'), { ASSETS: assetsStub });
  assert.equal(await res.text(), 'asset:/vendor/cesium/Cesium.js');
});

test('wrangler.toml: /config.json runs the Worker first; routes unchanged; assets from the Vite build', () => {
  const toml = read('wrangler.toml');
  assert.equal((toml.match(/run_worker_first = \["\/config\.json"\]/g) || []).length, 2);
  assert.match(toml, /routes = \[ \{ pattern = "xiaoxin\.liming-work\.com", custom_domain = true \} \]/);
  assert.match(toml, /\[env\.staging\][\s\S]*routes = \[\]/);
  assert.equal((toml.match(/directory = "\.\/dist"/g) || []).length, 2, 'both envs serve ./dist');
});

test('workflows build before testing and deploying; runners unchanged', () => {
  for (const f of ['deploy.yml', 'staging.yml']) {
    const y = read(`.github/workflows/${f}`);
    assert.match(y, /runs-on: \[self-hosted, muse\]/, `${f} runs-on`);
    const ci = y.indexOf('npm ci'), build = y.indexOf('npm run build'), t = y.indexOf('npm test'), dep = y.indexOf('wrangler deploy');
    assert.ok(ci >= 0 && build > ci && t > build && dep > t, `${f}: npm ci → npm run build → npm test → wrangler deploy`);
  }
});

/* ---------- source ---------- */
test('page shell keeps the globe, photoreal overlay and controls', () => {
  const html = read('index.html');
  for (const needle of ['id="scene"', 'id="cardReal"', 'id="btnReal"', 'id="real"', 'id="realBack"', 'id="toast"', 'id="btnQuality"', 'id="intro"', 'id="introSkip"', 'id="flash"', 'src="/src/main.js"', 'lang="zh-CN"']) {
    assert.ok(html.includes(needle), `index.html should contain ${needle}`);
  }
  assert.ok(!/vendor\/cesium/.test(html), 'Cesium must not be loaded by the home page itself');
  // .real-bar is pointer-events:none and `all:unset` would inherit it, so the back button must opt back in
  assert.match(read('src/styles/main.css'), /\.real-back\{all:unset;pointer-events:auto;/);
  assert.match(read('src/styles/main.css'), /prefers-color-scheme:light/);
  assert.match(read('src/styles/main.css'), /prefers-reduced-motion:reduce/);
});

test('12 places, each with a photoreal viewpoint and time zone; routes connect known places', () => {
  assert.equal(PLACES.length, 12);
  for (const p of PLACES) {
    assert.ok(p.view && Number.isFinite(p.view.lat) && Number.isFinite(p.view.range), `${p.id} view`);
    assert.doesNotThrow(() => new Intl.DateTimeFormat('zh-CN', { timeZone: p.tz }), `${p.id} tz`);
  }
  const ids = new Set(PLACES.map((p) => p.id));
  assert.ok(ROUTES.length >= 12);
  for (const [a, b] of ROUTES) assert.ok(ids.has(a) && ids.has(b) && a !== b, `route ${a}→${b}`);
});

test('heavy parts are lazy: postprocessing and photoreal are dynamic imports only', () => {
  const main = read('src/main.js');
  assert.match(main, /import\('\.\/effects\/post\.js'\)/);
  assert.match(main, /import\('\.\/photoreal\/index\.js'\)/);
  assert.ok(!/^import [^;]*(effects\/post|photoreal\/)/m.test(main), 'no static import of post/photoreal');
  const js = read('src/photoreal/index.js');
  assert.match(js, /\/vendor\/cesium\//);
  assert.match(js, /2275207/);
  assert.match(js, /\/config\.json/);
  assert.match(js, /showCreditsOnScreen: true/);
  assert.match(js, /SunLight/);
});

/* ---------- pure modules ---------- */
test('astro: sub-solar point matches equinox / solstice geometry', () => {
  const eq = subsolarPoint(new Date('2024-03-20T12:00:00Z'));
  near(eq.lat, 0, 0.5, 'equinox declination'); near(eq.lon, 0, 4, 'equinox noon longitude (equation of time)');
  const js = subsolarPoint(new Date('2024-06-20T20:51:00Z'));
  near(js.lat, 23.44, 0.05, 'June solstice declination');
  const ds = subsolarPoint(new Date('2024-12-21T00:00:00Z'));
  near(ds.lat, -23.44, 0.05, 'December solstice declination'); near(Math.abs(ds.lon), 180, 3, 'midnight UTC → antimeridian');
  const [x, y, z] = latLonToXYZ(0, -180, 1); near(x, -1, 1e-9, 'uv seam x'); near(y, 0, 1e-9, 'y'); near(z, 0, 1e-9, 'z');
  const arc = greatCircleArc(PLACES[0], PLACES[4], 32);
  assert.equal(arc.length, 32); near(Math.hypot(arc[0][0], arc[0][1], arc[0][2]), 1, 1e-6, 'arc starts on the surface');
  assert.ok(Math.hypot(...arc[16].slice(0, 3)) > 1.05, 'arc lifts in the middle');
  const u = utcForLocalSolarHour(120, 16, new Date('2026-01-10T00:00:00Z'));
  assert.equal(u.toISOString(), '2026-01-10T08:00:00.000Z');
});

test('quality tiers: detection, manual override, governor', () => {
  assert.deepEqual(Object.keys(TIERS).sort(), ['high', 'low', 'medium']);
  assert.equal(TIERS.low.post, false); assert.equal(TIERS.high.post, true);
  assert.equal(detectTier({ gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' }), 'low');
  assert.equal(detectTier({ gpu: 'Apple GPU', coarsePointer: true, screenMax: 932, deviceMemory: 8, cores: 6 }), 'medium');
  assert.equal(detectTier({ gpu: 'Mali-G78', coarsePointer: true, screenMax: 900, deviceMemory: 4, cores: 8 }), 'low');
  assert.equal(detectTier({ gpu: 'ANGLE (NVIDIA GeForce RTX 3060)', coarsePointer: false, screenMax: 2560, deviceMemory: 8, cores: 12 }), 'high');
  assert.equal(detectTier({ gpu: 'NVIDIA', saveData: true }), 'low');
  assert.equal(resolveTier('auto', 'medium'), 'medium');
  assert.equal(resolveTier('low', 'high'), 'low');
  assert.equal(nextMode('auto'), 'high'); assert.equal(nextMode('low'), 'auto');
  assert.equal(lowerTier('high'), 'medium'); assert.equal(lowerTier('low'), 'low');
  let r = governorStep('high', 20, 0); assert.equal(r.changed, false);
  r = governorStep('high', 20, r.lowCount); assert.deepEqual([r.changed, r.tier], [true, 'medium']);
  assert.equal(governorStep('high', 58, 1).lowCount, 0);
  assert.equal(governorStep('low', 5, 9).changed, false);
});

test('store and event bus', () => {
  const s = createStore({ a: 1, b: 2 }); const seen = [];
  s.watch((x) => x.a, (v, p) => seen.push([v, p]));
  let calls = 0; s.subscribe(() => calls++);
  s.set({ b: 2 }); assert.equal(calls, 0, 'no-op set does not notify');
  s.set({ b: 3 }); s.set((st) => ({ a: st.a + 1 }));
  assert.deepEqual(seen, [[2, 1]]); assert.equal(calls, 2); assert.ok(Object.isFrozen(s.get()));
  const bus = createBus(); const got = [];
  const off = bus.on('x', (p) => got.push(p)); bus.once('x', (p) => got.push('once:' + p));
  bus.on('x', () => { throw new Error('boom'); });
  const origErr = console.error; console.error = () => {};
  try { bus.emit('x', 1); bus.emit('x', 2); off(); bus.emit('x', 3); } finally { console.error = origErr; }
  assert.deepEqual(got, [1, 'once:1', 2]);
});

/* ---------- build output (npm run build) ---------- */
test('build output: page, chunks, budgets, textures, version', () => {
  assert.ok(existsSync(join(dist, 'index.html')), 'dist/ missing: run `npm run build` first');
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  assert.ok(html.includes('id="scene"') && html.includes('id="cardReal"'));
  assert.ok(!html.includes('/src/main.js'), 'dist/index.html must reference the built bundle');
  const entry = (html.match(/<script type="module" crossorigin src="(\/assets\/[^"]+\.js)"/) || [])[1];
  assert.ok(entry, 'entry script tag');
  const preloads = [...html.matchAll(/<link rel="modulepreload" crossorigin href="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  const initial = [entry, ...preloads];
  const initialJs = initial.map((p) => readFileSync(join(dist, p)));
  const gz = initialJs.reduce((n, b) => n + gzipSync(b).length, 0);
  const raw = initialJs.reduce((n, b) => n + b.length, 0);
  assert.ok(gz < 200 * 1024, `initial JS ${Math.round(gz / 1024)} KiB gzip exceeds 200 KiB budget`);
  console.log(`# initial JS: ${initial.join(', ')} = ${Math.round(raw / 1024)} KiB raw / ${Math.round(gz / 1024)} KiB gzip`);
  const initialText = initialJs.map(String).join('\n');
  assert.ok(!initialText.includes('luminosityThreshold'), 'bloom must not be in the initial bundle');
  assert.ok(!initialText.includes('2275207'), 'photoreal must not be in the initial bundle');
  const chunks = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'));
  const lazy = chunks.filter((f) => !initial.includes('/assets/' + f)).map((f) => readFileSync(join(dist, 'assets', f), 'utf8'));
  assert.ok(lazy.some((t) => t.includes('luminosityThreshold')), 'a lazy chunk carries the bloom pass');
  assert.ok(lazy.some((t) => t.includes('2275207') && t.includes('/vendor/cesium/')), 'a lazy chunk carries photoreal');
  for (const f of ['earth-day-2k.webp', 'earth-day-4k.webp', 'earth-night-2k.webp', 'earth-night-4k.webp', 'earth-clouds-2k.webp', 'earth-clouds-4k.webp', 'earth-normal-2k.webp', 'earth-water-2k.webp']) {
    assert.ok(existsSync(join(dist, 'textures', f)), `texture ${f}`);
  }
  for (const f of ['vendor/cesium/Cesium.js', 'vendor/cesium/Widgets/widgets.css', 'vendor/cesium/ThirdParty/draco_decoder.wasm', 'vendor/cesium/Workers/decodeDraco.js', 'vendor/cesium/Assets/approximateTerrainHeights.json']) {
    assert.ok(existsSync(join(dist, f)), `${f} missing (npm ci copies it via scripts/copy-cesium.mjs, the build copies public/)`);
  }
  const v = JSON.parse(readFileSync(join(dist, 'version.json'), 'utf8'));
  assert.equal(v.version, 'v3'); assert.match(v.commit, /^([0-9a-f]{40}|unknown)$/);
  assert.match(readFileSync(join(dist, '_headers'), 'utf8'), /\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
});

test('build output within Workers Static Assets limits', () => {
  const files = walk(dist);
  for (const f of files) assert.ok(statSync(f).size < 25 * MiB, `${relative(root, f)} exceeds 25 MiB`);
  assert.ok(files.length < 500, `dist/ has ${files.length} files, keep it small`);
});

test('no secrets committed or built', () => {
  let tracked;
  try { tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean); }
  catch { tracked = ['index.js', 'wrangler.toml', 'package.json', 'index.html', 'src/main.js', 'src/photoreal/index.js']; }
  const jwt = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/;
  for (const f of tracked) {
    if (/\.(png|jpe?g|webp|wasm)$/.test(f) || !existsSync(join(root, f))) continue;
    const text = readFileSync(join(root, f), 'utf8');
    assert.ok(!jwt.test(text), `${f} looks like it contains a token`);
    if (f.startsWith('test/')) continue;   // the tests use a fake value on purpose
    assert.ok(!/CESIUM_ION_TOKEN[ \t]*[:=][ \t]*["']?[A-Za-z0-9]/.test(text.replace(/\$\{\{\s*secrets\.CESIUM_ION_TOKEN\s*\}\}/g, '')), `${f} assigns CESIUM_ION_TOKEN a literal`);
  }
  for (const f of walk(dist).filter((p) => /\.(js|html|json|css)$/.test(p) && !p.includes(`${sep}vendor${sep}cesium${sep}`))) {
    assert.ok(!jwt.test(readFileSync(f, 'utf8')), `${relative(root, f)} looks like it contains a token`);
  }
  assert.ok(!tracked.some((f) => f.split(sep).join('/').startsWith('public/vendor/cesium/')), 'vendor/cesium is generated, not committed');
  assert.ok(!tracked.some((f) => f.startsWith('dist/')), 'dist/ is build output, not committed');
});
