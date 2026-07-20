import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const artifactRoot = resolve(import.meta.dirname, '../../output/playwright');

export default defineConfig({
  testDir: './tests',
  testMatch: ['mv3/**/*.test.ts', 'e2e-extension/**/*.test.ts'],
  testIgnore: ['**/tests/unit/**'],
  timeout: 240_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: resolve(artifactRoot, 'mv3-report') }],
  ],
  outputDir: resolve(artifactRoot, 'mv3-results'),
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
