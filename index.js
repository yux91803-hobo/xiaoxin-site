// Static files in ./public are served by Workers Static Assets before this runs.
// /config.json always runs here (wrangler.toml: run_worker_first) and hands the page
// the browser-side Cesium ion token, which lives only in the Worker secret CESIUM_ION_TOKEN.
// The token is origin-restricted in Cesium ion, so it only works on this site and the staging site.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/config.json') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      }
      const body = JSON.stringify({ cesiumIonToken: env.CESIUM_ION_TOKEN || null });
      return new Response(request.method === 'HEAD' ? null : body, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
