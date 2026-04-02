import { test, expect } from '@playwright/test';
import { ensureFeedVisible,
  expectMissionCount, injectMissions, waitForMissions, triggerScan } from '../helpers';

test.describe('Scan Lifecycle', () => {
  test('feed loads with missions on mount', async ({ page }) => {
    await ensureFeedVisible(page);

    // Missions appear after auto-scan / mock data
    await expect(page.getByText(/\d+ missions?/).first()).toBeVisible({ timeout: 10000 });
  });

  test('refresh button is visible and clickable', async ({ page }) => {
    await ensureFeedVisible(page);

    const refreshBtn = page.getByTitle('Rafraichir');
    await expect(refreshBtn).toBeVisible();
    await expect(refreshBtn).toBeEnabled();
  });

  test('injecting missions populates the feed', async ({ page }) => {
    await ensureFeedVisible(page);

    await injectMissions(page, 7);
    await waitForMissions(page, 7, 5000);
    await expectMissionCount(page, 7);
  });

  test('consecutive injections do not duplicate missions', async ({ page }) => {
    await ensureFeedVisible(page);

    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);
    await expectMissionCount(page, 5);

    // Re-inject same count
    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);

    // Count should still be 5 (deduplication)
    await expectMissionCount(page, 5);
  });

  test('search works after missions are loaded', async ({ page }) => {
    await ensureFeedVisible(page);

    await injectMissions(page, 10);
    await waitForMissions(page, 10, 5000);

    // Search
    await page.getByPlaceholder('Rechercher...').fill('React');
    await page.waitForTimeout(500);

    await expect(page.getByPlaceholder('Rechercher...')).toHaveValue('React');

    // Clear search restores all
    await page.getByPlaceholder('Rechercher...').clear();
    await page.waitForTimeout(300);
    await expectMissionCount(page, 10);
  });

  test('filter panel toggles open and closed', async ({ page }) => {
    await ensureFeedVisible(page);

    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);

    const filterToggle = page.getByTitle('Afficher les filtres');
    await expect(filterToggle).toBeVisible();
    await filterToggle.click();

    const filterPanel = page.getByRole('group', { name: 'Options de filtrage' });
    await expect(filterPanel).toBeVisible();

    await page.getByTitle('Masquer les filtres').click();
    await expect(filterPanel).not.toBeVisible();
  });

  test('empty state shows when dev panel sets empty', async ({ page }) => {
    await ensureFeedVisible(page);

    await page.keyboard.press('Control+Shift+D');
    await expect(page.getByText('DEV PANEL')).toBeVisible();

    await page.getByRole('button', { name: 'empty' }).click();
    await page.keyboard.press('Control+Shift+D');

    await expect(page.getByText('Aucune mission')).toBeVisible({ timeout: 2000 });
  });

  test('mission cards are rendered with correct count', async ({ page }) => {
    await ensureFeedVisible(page);

    await injectMissions(page, 10);
    await waitForMissions(page, 10, 5000);

    await expectMissionCount(page, 10);

    const cards = page.locator('[role="button"][tabindex="0"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(10);
  });
});
