import { test, expect } from '@playwright/test';

// TODO: implement once extension can be loaded in test browser
// Chrome extension testing requires special setup:
// 1. Build the extension
// 2. Launch Chrome with --load-extension flag
// 3. Navigate to the side panel

test.skip('feed displays missions after scan', async ({ page }) => {
  // Will implement when extension testing infrastructure is ready
  expect(true).toBe(true);
});

test.skip('onboarding wizard completes and navigates to feed', async ({ page }) => {
  expect(true).toBe(true);
});

test.skip('settings page saves API key', async ({ page }) => {
  expect(true).toBe(true);
});
