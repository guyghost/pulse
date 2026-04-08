import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: {
    alias: {
      $lib: resolve(__dirname, './src/lib'),
    },
    conditions: ['browser', 'import', 'module', 'default'],
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['tests/unit/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/core/**/*.ts'],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
});
