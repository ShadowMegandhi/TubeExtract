import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const r = (p: string) => resolve(__dirname, p);

export default defineConfig({
  resolve: { alias: { '@core': r('src/core'), '@ui': r('src/ui') } },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html'],
      // Entry points and chrome.* wiring are covered by the manual checks in
      // README.md. The decisions they make live in src/core, which is held high.
      exclude: ['src/background/**', 'src/ui/**', '**/*.d.ts'],
      thresholds: { 'src/core/**': { statements: 95, branches: 90, functions: 95, lines: 95 } },
    },
  },
});
