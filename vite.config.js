// Vite build: index.html + src/ → dist/ (served by Workers Static Assets, see wrangler.toml).
// public/ (textures, _headers, the self-hosted CesiumJS copied by postinstall) is copied as-is.
import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

function versionFile() {
  let commit = process.env.GITHUB_SHA || '';
  if (!commit) { try { commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { commit = 'unknown'; } }
  return {
    name: 'xiaoxin-version',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ app: 'xiaoxin-site', version: 'v3', commit, builtAt: new Date().toISOString() }) + '\n' });
    },
  };
}

export default defineConfig({
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // three.js core in its own long-cached chunk; postprocessing + photoreal stay lazy chunks
        manualChunks(id) {
          if (id.includes('node_modules/three/build/')) return 'three';
          return undefined;
        },
      },
    },
  },
  plugins: [versionFile()],
});
