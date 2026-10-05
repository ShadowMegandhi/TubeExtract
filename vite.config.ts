/**
 * One build target: the service worker plus the two HTML pages, as an ES module
 * graph. There are no content scripts, so no IIFE pass is needed.
 *
 * ffmpeg.wasm's core is not bundled by Rollup. scripts/build.mjs copies it into
 * public/ffmpeg/ first, and the converter loads it by chrome.runtime.getURL,
 * because MV3 forbids fetching code from anywhere but the extension itself.
 */
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

const r = (p: string) => resolve(__dirname, p);

export default defineConfig(({ mode }) => ({
  plugins: [preact()],
  resolve: {
    alias: {
      '@core': r('src/core'),
      '@ui': r('src/ui'),
    },
  },
  publicDir: r('public'),
  // @ffmpeg/ffmpeg spawns its worker with new URL('./worker.js', import.meta.url).
  // Pre-bundling would rewrite that URL and break it.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  worker: { format: 'es' },
  build: {
    outDir: r('dist'),
    emptyOutDir: true,
    sourcemap: mode !== 'production',
    minify: mode === 'production',
    target: 'chrome120',
    rollupOptions: {
      input: {
        background: r('src/background/index.ts'),
        popup: r('src/ui/popup/popup.html'),
        converter: r('src/ui/converter/converter.html'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
}));
