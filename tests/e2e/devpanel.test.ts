import { test, expect } from '@playwright/test';

const SIDE_PANEL = '/src/sidepanel/index.html';

async function waitForDevPanel(page: import('@playwright/test').Page) {
  await page.locator('button:has-text("Ctrl+Shift+D")').waitFor({ state: 'visible' });
}

async function openDevPanel(page: import('@playwright/test').Page) {
  await waitForDevPanel(page);
  await page.keyboard.press('Control+Shift+D');
  await expect(page.getByText('DEV PANEL')).toBeVisible();
}

test.describe('DevPanel', () => {
  test('opens with Ctrl+Shift+D', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();
    await openDevPanel(page);
  });

  test('closes with Ctrl+Shift+D again', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();
    await openDevPanel(page);

    await page.keyboard.press('Control+Shift+D');
    await expect(page.getByText('DEV PANEL')).not.toBeVisible();
  });

  test('shows all control sections', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();
    await openDevPanel(page);

    await expect(page.getByText('Feed State')).toBeVisible();
    await expect(page.getByText('Onboarding', { exact: true })).toBeVisible();
    await expect(page.getByText('Bridge Logs')).toBeVisible();
  });

  test('inject missions populates feed', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();
    await openDevPanel(page);

    await page.getByRole('button', { name: 'inject' }).click();
    await page.keyboard.press('Control+Shift+D'); // close

    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });
  });

  test('toggle onboarding returns to onboarding screen', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();
    await openDevPanel(page);

    await page.getByRole('button', { name: 'toggle onboarding' }).click();

    // Should show onboarding
    await expect(page.getByText('Configurez en 30 secondes')).toBeVisible();
  });

  test('set state empty shows "Aucune mission"', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();
    await openDevPanel(page);

    await page.getByRole('button', { name: 'empty' }).click();
    await page.keyboard.press('Control+Shift+D'); // close

    await expect(page.getByText('Aucune mission')).toBeVisible({ timeout: 2000 });
  });
});
