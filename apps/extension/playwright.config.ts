import { defineConfig } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const port = process.env.PLAYWRIGHT_PORT ?? '5176';
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  fullyParallel: true,
  grepInvert: isCI ? /@slow/ : undefined,
  expect: {
    timeout: 10000,
  },
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    url: `${baseURL}/src/sidepanel/index.html`,
    reuseExistingServer: !isCI,
    timeout: 30000,
  },
});
