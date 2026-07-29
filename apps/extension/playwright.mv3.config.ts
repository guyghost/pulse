import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const artifactRoot = resolve(import.meta.dirname, '../../output/playwright');

// The packaged MV3 gate drives a real Chromium + MV3 service-worker lifecycle,
// which has inherent transient failure modes (non-atomic DevToolsActivePort
// writes, service-worker restart races, worker bootstrap timing). A single
// retry in CI absorbs those without masking consistent failures (a real bug
// fails on both attempts and still fails the gate). Locally we keep 0 so a
// flake is loud during development. This mirrors the browser-e2e config.
const isCI = Boolean(process.env.CI);

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
  retries: isCI ? 1 : 0,
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
