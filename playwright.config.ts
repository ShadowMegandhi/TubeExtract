import { defineConfig } from '@playwright/test';

// End-to-end checks against the built extension in dist/. Run `npm run build`
// first. Needs ffmpeg/ffprobe on PATH to make and inspect test media; the
// YouTube test also needs the helper installed and is skipped otherwise.
export default defineConfig({
  testDir: 'e2e',
  timeout: 5 * 60_000,
  workers: 1,
  reporter: 'list',
});
