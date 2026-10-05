/**
 * Copies the ffmpeg.wasm core into public/ffmpeg/, then runs the Vite build
 * through its JS API (spawning the vite .cmd shim on Windows fails with EINVAL).
 */
import { build } from 'vite';
import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const mode = process.argv.includes('--dev') ? 'development' : 'production';
const watch = process.argv.includes('--watch');

const coreDir = resolve('node_modules/@ffmpeg/core/dist/esm');
const outDir = resolve('public/ffmpeg');
mkdirSync(outDir, { recursive: true });
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) cpSync(resolve(coreDir, f), resolve(outDir, f));

console.log(`> building mode=${mode}`);
await build({ mode, ...(watch ? { build: { watch: {} } } : {}) });
console.log('\nOK - dist/ is ready. Load it unpacked at chrome://extensions');
