// Static files in ./public are served by Workers Static Assets before this runs.
// Anything else falls through to the asset handler (SPA fallback to index.html).
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
