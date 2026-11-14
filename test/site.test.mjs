// Basic checks run by `npm test` locally and in both workflows before any deploy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const MiB = 1024 * 1024;
const assetsStub = { fetch: async (req) => new Response('asset:' + new URL(req.url).pathname) };

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

test('wrangler.toml: /config.json runs the Worker first; routes unchanged', () => {
  const toml = read('wrangler.toml');
  assert.equal((toml.match(/run_worker_first = \["\/config\.json"\]/g) || []).length, 2);
  assert.match(toml, /routes = \[ \{ pattern = "xiaoxin\.liming-work\.com", custom_domain = true \} \]/);
  assert.match(toml, /\[env\.staging\][\s\S]*routes = \[\]/);
});

test('home page keeps the three.js globe and lazy-loads photoreal mode', () => {
  const html = read('public/index.html');
  for (const needle of ['id="scene"', '/vendor/three.module.js', 'id="cardReal"', 'id="btnReal"', 'id="real"', 'id="realBack"', 'id="toast"', "import('/photoreal.js')"]) {
    assert.ok(html.includes(needle), `index.html should contain ${needle}`);
  }
  assert.ok(!/vendor\/cesium/.test(html), 'Cesium must not be loaded by the home page itself');
  const ids = html.match(/\{ id:'[a-z]+'/g) || [];
  const views = html.match(/view:\{ lat:-?\d/g) || [];
  assert.equal(ids.length, 12);
  assert.equal(views.length, ids.length, 'every place needs a photoreal viewpoint');
});

test('photoreal.js uses self-hosted Cesium, ion asset 2275207 and /config.json', () => {
  const js = read('public/photoreal.js');
  assert.match(js, /\/vendor\/cesium\//);
  assert.match(js, /2275207/);
  assert.match(js, /\/config\.json/);
  assert.match(js, /showCreditsOnScreen: true/);
});

test('self-hosted CesiumJS is present and within Workers Static Assets limits', () => {
  for (const f of ['public/vendor/cesium/Cesium.js', 'public/vendor/cesium/Widgets/widgets.css', 'public/vendor/cesium/ThirdParty/draco_decoder.wasm', 'public/vendor/cesium/Workers/decodeDraco.js', 'public/vendor/cesium/Assets/approximateTerrainHeights.json']) {
    assert.ok(existsSync(join(root, f)), `${f} missing (npm ci copies it via scripts/copy-cesium.mjs)`);
  }
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
  walk(join(root, 'public'));
  for (const f of files) assert.ok(statSync(f).size < 25 * MiB, `${relative(root, f)} exceeds 25 MiB`);
  assert.ok(files.length < 500, `public/ has ${files.length} files, keep it small`);
});

test('no secrets committed', () => {
  let tracked;
  try { tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean); }
  catch { tracked = ['index.js', 'wrangler.toml', 'package.json', 'public/index.html', 'public/photoreal.js']; }
  const jwt = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/;
  for (const f of tracked) {
    if (f.startsWith('public/vendor/') || /\.(png|jpe?g|wasm)$/.test(f) || !existsSync(join(root, f))) continue;
    const text = readFileSync(join(root, f), 'utf8');
    assert.ok(!jwt.test(text), `${f} looks like it contains a token`);
    if (f.startsWith('test/')) continue;   // the tests use a fake value on purpose
    assert.ok(!/CESIUM_ION_TOKEN[ \t]*[:=][ \t]*["']?[A-Za-z0-9]/.test(text.replace(/\$\{\{\s*secrets\.CESIUM_ION_TOKEN\s*\}\}/g, '')), `${f} assigns CESIUM_ION_TOKEN a literal`);
  }
  assert.ok(!tracked.some((f) => f.split(sep).join('/').startsWith('public/vendor/cesium/')), 'vendor/cesium is generated, not committed');
});
