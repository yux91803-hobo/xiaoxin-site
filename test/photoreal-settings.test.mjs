// Photoreal mobile/iOS settings (src/photoreal/settings.js): pure, run by `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { photorealSettings, createLoadProgress, isIOS, MiB } from '../src/photoreal/settings.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const TIERS = ['high', 'medium', 'low'];

test('iOS detection: iPhone, iPadOS (Mac UA + touch), not desktop Mac or Android', () => {
  assert.equal(isIOS(IPHONE_UA, 'iPhone', 5), true);
  assert.equal(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15', 'MacIntel', 5), true);
  assert.equal(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15', 'MacIntel', 0), false);
  assert.equal(isIOS('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/131 Mobile Safari/537.36', 'Linux armv8l', 5), false);
});

test('phones: small tile cache, SSE 24-32, CSS-pixel rendering, low dive start', () => {
  for (const t of TIERS) {
    const s = photorealSettings(t, { mobile: true, dpr: 3 });
    assert.ok(s.tileset.cacheBytes >= 128 * MiB && s.tileset.cacheBytes <= 256 * MiB, `${t} cache ${s.tileset.cacheBytes / MiB} MiB`);
    assert.ok(s.tileset.maximumCacheOverflowBytes <= 64 * MiB, `${t} overflow`);
    assert.ok(s.tileset.maximumScreenSpaceError >= 24 && s.tileset.maximumScreenSpaceError <= 32, `${t} sse`);
    assert.equal(s.viewer.useBrowserRecommendedResolution, true, 'never render at devicePixelRatio 3');
    assert.ok(s.viewer.resolutionScale > 0 && s.viewer.resolutionScale <= 1);
    assert.ok(s.diveFromHeight <= 50000, 'phones must not fly down from orbit through every LOD');
    assert.equal(s.destroyViewerOnClose, true);
    assert.equal(s.tileset.preloadFlightDestinations, true);
  }
  // lower tier ⇒ never more detail or memory
  const [h, m, l] = TIERS.map((t) => photorealSettings(t, { mobile: true }).tileset);
  assert.ok(h.maximumScreenSpaceError <= m.maximumScreenSpaceError && m.maximumScreenSpaceError <= l.maximumScreenSpaceError);
  assert.ok(h.cacheBytes >= m.cacheBytes && m.cacheBytes >= l.cacheBytes);
});

test('iOS WebKit is capped whatever the tier (the 2026-11-15 iPhone bug: 768+512 MiB cache)', () => {
  for (const t of TIERS) {
    const s = photorealSettings(t, { ios: true, dpr: 3 });
    assert.equal(s.mobile, true, 'iOS counts as mobile');
    assert.ok(s.tileset.cacheBytes + s.tileset.maximumCacheOverflowBytes <= 256 * MiB, `${t} total budget`);
    assert.ok(s.tileset.maximumScreenSpaceError >= 24, `${t} sse`);
  }
  // even 画质「高」 on an iPad must stay far below the old desktop-sized budget
  assert.ok(photorealSettings('high', { ios: true }).tileset.cacheBytes < 768 * MiB);
});

test('desktop keeps sharper tiles but a sane budget; unknown tier falls back to medium', () => {
  const d = Object.fromEntries(TIERS.map((t) => [t, photorealSettings(t, { mobile: false, dpr: 2 })]));
  assert.equal(d.high.tileset.maximumScreenSpaceError, 12);
  assert.equal(d.medium.tileset.maximumScreenSpaceError, 16);
  assert.ok(d.high.tileset.cacheBytes <= 512 * MiB);
  for (const t of TIERS) {
    assert.ok(d[t].tileset.maximumScreenSpaceError < photorealSettings(t, { mobile: true }).tileset.maximumScreenSpaceError, `${t}: desktop sharper than phone`);
    assert.equal(d[t].destroyViewerOnClose, false);
  }
  assert.deepEqual(photorealSettings('ultra', {}).tileset, photorealSettings('medium', {}).tileset);
  assert.equal(photorealSettings('ultra', {}).tier, 'medium');
});

test('loading progress: monotonic, never 100 before Cesium says all tiles loaded', () => {
  const p = createLoadProgress();
  assert.equal(p.update(10, 0), 0);
  for (let i = 0; i < 5; i++) p.tileDone();
  assert.equal(p.update(5, 0), 50);
  assert.equal(p.update(40, 10), 50, 'new requests must not move the bar backwards');
  for (let i = 0; i < 200; i++) p.tileDone();
  assert.equal(p.update(0, 0), 99, 'capped at 99 until finish()');
  assert.equal(p.complete, false);
  assert.equal(p.finish(), 100); assert.equal(p.complete, true);
  p.reset(); assert.equal(p.percent, 0); assert.equal(p.complete, false);
});

test('photoreal wires the mobile settings, context-loss recovery and the loading indicator', () => {
  const js = read('src/photoreal/index.js');
  assert.match(js, /from '\.\/settings\.js'/);
  assert.match(js, /\.\.\.cfg\.tileset/, 'tileset options come from settings.js');
  assert.ok(!/768 \* 1024 \* 1024/.test(js), 'no hard-coded 768 MiB cache');
  assert.match(js, /webglcontextlost/);
  assert.match(js, /renderError\.addEventListener/);
  assert.match(js, /showRenderLoopErrors: false/);
  assert.match(js, /loadProgress\.addEventListener/);
  assert.match(js, /allTilesLoaded\.addEventListener/);
  assert.match(js, /正在加载高清实景/);
  assert.match(js, /'context-lost': '[^']*回到地球仪/);
  const html = read('index.html');
  for (const id of ['realProgress', 'realProgressText', 'realProgressBar']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /id="realProgress"[^>]*role="status"/);
  assert.match(read('src/styles/main.css'), /\.real-progress\{/);
});
