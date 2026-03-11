import { test, expect } from '@playwright/test';

const SIDE_PANEL = '/src/sidepanel/index.html';

/** Wait for the DevPanel component to be lazy-loaded (visible toggle button). */
async function waitForDevPanel(page: import('@playwright/test').Page) {
  await expect(page.getByText('Ctrl+Shift+D')).toBeVisible({ timeout: 3000 });
}

/** Open the DevPanel via keyboard shortcut and wait for it. */
async function openDevPanel(page: import('@playwright/test').Page) {
  await waitForDevPanel(page);
  await page.keyboard.press('Control+Shift+D');
  await expect(page.getByText('DEV PANEL')).toBeVisible();
}

/** Close the DevPanel via keyboard shortcut. */
async function closeDevPanel(page: import('@playwright/test').Page) {
  await page.keyboard.press('Control+Shift+D');
  await expect(page.getByText('DEV PANEL')).not.toBeVisible();
}

test.describe('Feed', () => {
  test('shows empty state via DevPanel', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // The app starts in loading state on mount; use DevPanel to set empty
    await openDevPanel(page);
    await page.getByRole('button', { name: 'empty' }).click();
    await closeDevPanel(page);

    await expect(page.getByText('Aucune mission')).toBeVisible();
  });

  test('scan loads mock missions', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Click scan button
    await page.getByRole('button', { name: 'Scanner' }).click();

    // Missions should appear after chrome stub delay (~800ms)
    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });
  });

  test('search filters missions', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Inject missions via DevPanel
    await openDevPanel(page);
    await page.getByRole('button', { name: 'inject' }).click();
    await closeDevPanel(page);

    // Wait for missions to appear
    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });

    // Search
    await page.getByPlaceholder('Rechercher...').fill('React');
    // Wait for debounce (300ms) + rendering
    await page.waitForTimeout(500);

    // Should still show some missions (React appears in mock data)
    await expect(page.getByText(/\d+ missions?/)).toBeVisible();
  });

  test('error state shows error message', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Use DevPanel to set error state
    await openDevPanel(page);
    await page.getByRole('button', { name: 'error' }).click();
    await closeDevPanel(page);

    await expect(page.getByText('Erreur')).toBeVisible({ timeout: 2000 });
  });
});
