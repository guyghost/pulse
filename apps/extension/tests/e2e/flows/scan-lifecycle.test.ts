import { test, expect } from '../fixtures';
import {
  expectMissionCount,
  feedSearchInput,
  injectMissions,
  missionCards,
  scanButton,
  clearFeedSearch,
  waitForMissions,
  setFeedState,
  expectFeedEmptyState,
} from '../helpers';

test.describe('Scan Lifecycle', () => {
  test('feed loads with missions on mount', async ({ page }) => {
    // Missions appear after auto-scan / mock data
    await expect(page.getByText(/\d+ missions?/).first()).toBeVisible({ timeout: 10000 });
  });

  test('refresh button is visible and clickable', async ({ page }) => {
    const refreshBtn = scanButton(page);
    await expect(refreshBtn).toBeVisible();
    await expect(refreshBtn).toBeEnabled();
  });

  test('injecting missions populates the feed', async ({ page }) => {
    await injectMissions(page, 7);
    await waitForMissions(page, 7, 5000);
    await expectMissionCount(page, 7);
  });

  test('consecutive injections do not duplicate missions', async ({ page }) => {
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
    await injectMissions(page, 10);
    await waitForMissions(page, 10, 5000);

    // Search
    await feedSearchInput(page).fill('React');
    await page.waitForTimeout(500);

    await expect(feedSearchInput(page)).toHaveValue('React');

    // Clear search restores all
    await clearFeedSearch(page);
    await page.waitForTimeout(300);
    await expectMissionCount(page, 10);
  });

  test('filter panel toggles open and closed', async ({ page }) => {
    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);

    const filterToggle = page.getByRole('button', { name: 'Afficher les filtres' });
    await expect(filterToggle).toBeVisible();
    await filterToggle.click();

    const filterPanel = page.getByRole('group', { name: 'Options de filtrage' });
    await expect(filterPanel).toBeVisible();

    await page.getByRole('button', { name: 'Masquer les filtres' }).click();
    await expect(filterPanel).not.toBeVisible();
  });

  test('empty state shows when dev panel sets empty', async ({ page }) => {
    await setFeedState(page, 'empty');

    await expectFeedEmptyState(page, 5000);
  });

  test('mission cards are rendered with correct count', async ({ page }) => {
    await injectMissions(page, 10);
    await waitForMissions(page, 10, 5000);

    await expectMissionCount(page, 10);

    const cards = missionCards(page);
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(10);
  });
});
