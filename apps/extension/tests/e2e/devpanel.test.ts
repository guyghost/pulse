import { test, expect } from '@playwright/test';
import { ensureFeedVisible, expectMissionCount, openDevPanel, closeDevPanel } from './helpers';

test.describe('DevPanel', () => {
  test('opens with Ctrl+Shift+D', async ({ page }) => {
    await ensureFeedVisible(page);
    await openDevPanel(page);

    // Verify panel content is visible
    await expect(page.getByText('DEV PANEL')).toBeVisible();
    await expect(page.getByText('Feed State')).toBeVisible();
  });

  test('closes with Ctrl+Shift+D again', async ({ page }) => {
    await ensureFeedVisible(page);
    await openDevPanel(page);

    await closeDevPanel(page);
  });

  test('shows all control sections', async ({ page }) => {
    await ensureFeedVisible(page);
    await openDevPanel(page);

    await expect(page.getByText('Feed State')).toBeVisible();
    await expect(page.getByText('Onboarding', { exact: true })).toBeVisible();
    await expect(page.getByText('Bridge Logs')).toBeVisible();
  });

  test('inject missions populates feed', async ({ page }) => {
    await ensureFeedVisible(page);
    await openDevPanel(page);

    // Verify slider value before clicking
    const slider = page.locator('input[type="range"]');
    const sliderValue = await slider.inputValue();
    const injectCount = parseInt(sliderValue, 10);
    expect(injectCount).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'inject' }).click();
    await closeDevPanel(page);

    // Verify exact count is displayed
    await expectMissionCount(page, injectCount, 3000);
  });

  test('toggle onboarding returns to onboarding screen', async ({ page }) => {
    await ensureFeedVisible(page);
    await openDevPanel(page);

    await page.getByRole('button', { name: 'toggle onboarding' }).click();

    // Should show onboarding — heading is now "Configurez votre premier scan".
    await expect(
      page.getByRole('heading', { name: 'Configurez votre premier scan' })
    ).toBeVisible();
  });

  test('set state empty shows "Aucune mission"', async ({ page }) => {
    await ensureFeedVisible(page);
    await openDevPanel(page);

    await page.getByRole('button', { name: 'empty' }).click();
    await closeDevPanel(page);

    await expect(page.getByText('Aucune mission')).toBeVisible({ timeout: 2000 });
  });
});
