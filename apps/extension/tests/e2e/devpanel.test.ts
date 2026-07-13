import { test, expect } from './fixtures';
import {
  expectMissionCount,
  getMissionTotalCount,
  openDevPanel,
  closeDevPanel,
  devPanel,
  devPanelMissionCountInput,
  expectFeedEmptyState,
} from './helpers';

test.describe('DevPanel', () => {
  test('opens with Ctrl+Shift+D', async ({ page }) => {
    await openDevPanel(page);

    // Verify panel content is visible
    await expect(page.getByText('DEV PANEL')).toBeVisible();
    await expect(page.getByText('Feed State')).toBeVisible();
  });

  test('closes with Ctrl+Shift+D again', async ({ page }) => {
    await openDevPanel(page);

    await closeDevPanel(page);
  });

  test('shows all control sections', async ({ page }) => {
    await openDevPanel(page);

    await expect(devPanel(page).getByText('Feed State')).toBeVisible();
    await expect(devPanel(page).getByText('Onboarding', { exact: true })).toBeVisible();
    await expect(devPanel(page).getByText('Bridge Logs')).toBeVisible();
  });

  test('inject missions populates feed', async ({ page }) => {
    await openDevPanel(page);

    // Verify slider value before clicking
    const slider = devPanelMissionCountInput(page);
    const sliderValue = await slider.inputValue();
    const injectCount = parseInt(sliderValue, 10);
    expect(injectCount).toBeGreaterThan(0);

    await devPanel(page).getByRole('button', { name: 'inject', exact: true }).click();
    await closeDevPanel(page);

    // Verify exact count is displayed
    await expectMissionCount(page, injectCount, 3000);
  });

  test('toggle onboarding returns to onboarding screen', async ({ page }) => {
    await openDevPanel(page);

    await page.getByRole('button', { name: 'toggle onboarding' }).click();

    // Should show onboarding — heading is now "Configurez votre premier scan".
    await expect(
      page.getByRole('heading', { name: 'Configurez votre premier scan' })
    ).toBeVisible();
  });

  test('set state empty shows "Aucune mission"', async ({ page }) => {
    // The dev-mode stub fires SCAN_COMPLETE after ~800ms and dispatches a
    // `dev:missions` event that overwrites the feed with mock missions.
    // Clicking "empty" before the scan settles causes the scan to race back
    // and clear the empty state before the assertion runs.
    // Wait for the initial scan to populate the feed first, then let it fully
    // settle, so no pending scan can overwrite our explicit empty click.
    await expect.poll(async () => getMissionTotalCount(page), { timeout: 5000 }).toBeGreaterThan(0);
    await page.waitForTimeout(900);

    await openDevPanel(page);

    await page.getByRole('button', { name: 'empty' }).click();
    await closeDevPanel(page);

    await expectFeedEmptyState(page, 2000);
  });
});
