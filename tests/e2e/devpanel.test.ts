import { test, expect } from '@playwright/test';
import { SIDE_PANEL, openDevPanel, closeDevPanel } from './helpers';

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

    await closeDevPanel(page);
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
    await closeDevPanel(page);

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
    await closeDevPanel(page);

    await expect(page.getByText('Aucune mission')).toBeVisible({ timeout: 2000 });
  });
});
