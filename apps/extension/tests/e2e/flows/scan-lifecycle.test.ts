import { test, expect } from '../fixtures';
import {
  expectMissionCount,
  feedSearchInput,
  getMissionTotalCount,
  injectMissions,
  missionCards,
  clearFeedSearch,
  waitForMissions,
  setFeedState,
  expectFeedEmptyState,
  triggerScan,
} from '../helpers';

test.describe('Scan Lifecycle', () => {
  test('feed loads with missions on mount', async ({ page }) => {
    // Missions appear after auto-scan / mock data
    await expect(page.getByText(/\d+ missions?/).first()).toBeVisible({ timeout: 10000 });
  });

  test('manual scan is triggerable from a loaded feed', async ({ page }) => {
    await waitForMissions(page, 1, 10000);
    const before = await getMissionTotalCount(page);
    expect(before).toBeGreaterThan(0);

    // Loaded feed → compact hero exposes no scan control; the `r` shortcut
    // is the manual trigger (see triggerScan).
    await triggerScan(page);

    // The default dev stub completes scans cleanly: no losses, no duplicates.
    await expectMissionCount(page, before);
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

    const filterPanel = page.getByRole('group', { name: 'Filtrer les missions' });
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
