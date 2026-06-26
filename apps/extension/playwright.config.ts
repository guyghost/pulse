import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5176',
    headless: true,
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5176/src/sidepanel/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
