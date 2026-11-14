// Render test: serves dist/ through the real Worker (index.js) and loads the page in headless
// Chromium (software WebGL via SwiftShader) on each quality tier, checking it renders frames,
// loads postprocessing only where the tier wants it, and logs no console errors.
// Needs a Chromium: CHROMIUM_PATH, the playwright cache (~/.cache/ms-playwright) or a system
// chrome/chromium. When none exists the test is reported as skipped (with the reason), never passed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import worker from '../index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.wasm': 'application/wasm' };

function findChromium() {
  const c = [process.env.CHROMIUM_PATH];
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), '.cache', 'ms-playwright');
  if (existsSync(cache)) {
    for (const d of readdirSync(cache).filter((n) => /^chromium(_headless_shell)?-\d+$/.test(n)).sort().reverse()) {
      for (const sub of readdirSync(join(cache, d))) {
        const base = join(cache, d, sub);
        if (!statSync(base).isDirectory()) continue;
        c.push(join(base, 'chrome'), join(base, 'chrome-headless-shell'));
      }
    }
  }
  c.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable');
  return c.find((p) => p && existsSync(p));
}

// static assets for the Worker's ASSETS binding, read straight from dist/ (SPA fallback like wrangler.toml)
const assets = {
  async fetch(req) {
    const { pathname } = new URL(req.url);
    let p = join(dist, decodeURIComponent(pathname));
    if (pathname.endsWith('/')) p = join(p, 'index.html');
    if (!p.startsWith(dist) || !existsSync(p) || statSync(p).isDirectory()) p = join(dist, 'index.html');
    return new Response(readFileSync(p), { headers: { 'content-type': TYPES[extname(p)] || 'application/octet-stream' } });
  },
};

const chromium = findChromium();
const skip = !existsSync(join(dist, 'index.html')) ? 'dist/ missing: run `npm run build` first' : (!chromium ? 'no Chromium on this machine (set CHROMIUM_PATH to run it)' : false);

test('page renders on every quality tier without console errors', { skip, timeout: 300000 }, async () => {
  const { chromium: pw } = await import('playwright-core');
  const server = createServer(async (req, res) => {
    const r = await worker.fetch(new Request(`http://localhost${req.url}`, { method: req.method }), { ASSETS: assets });
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await pw.launch({ executablePath: chromium, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  try {
    for (const [tier, post, w, h] of [['high', true, 960, 600], ['medium', true, 390, 844], ['low', false, 960, 600]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage(); const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
      page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
      await page.goto(`${base}?q=${tier}&intro=0`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__xx && window.__xx.store.get().mode === 'globe' && window.__xx.frames >= 3, null, { timeout: 120000 });
      if (post) await page.waitForFunction(() => window.__xx.postLoaded, null, { timeout: 60000 });
      const st = await page.evaluate(() => ({ tier: __xx.store.get().tier, post: __xx.postActive, postLoaded: __xx.postLoaded, fatal: !!window.__fatal, places: document.querySelectorAll('#list button').length }));
      assert.equal(st.tier, tier); assert.equal(st.post, post, `${tier}: postprocessing active`);
      assert.equal(st.postLoaded, post, `${tier}: postprocessing chunk ${post ? '' : 'not '}loaded`);
      assert.equal(st.fatal, false); assert.equal(st.places, 12);
      // select a place: card shows, no errors
      await page.click('#list button[data-i="1"]');
      await page.waitForFunction(() => document.getElementById('card').classList.contains('show'), null, { timeout: 30000 });
      const f0 = await page.evaluate(() => __xx.frames);
      await page.waitForFunction((n) => __xx.frames > n + 2, f0, { timeout: 60000 });
      if (tier === 'low') {
        // dive transition round trip: locally /config.json has no token, so photoreal fails and the
        // app must pull back out to the globe, clear the flash overlay and explain why in a toast
        await page.click('#cardReal');
        await page.waitForFunction(() => __xx.store.get().mode !== 'globe', null, { timeout: 30000 });
        await page.waitForFunction(() => __xx.store.get().mode === 'globe' && getComputedStyle(document.getElementById('flash')).opacity === '0', null, { timeout: 120000 });
        assert.match(await page.textContent('#toast'), /回到地球仪/);
      }
      assert.deepEqual(errors, [], `${tier}: ${errors.join(' | ')}`);
      await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
});
