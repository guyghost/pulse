import { test, expect } from '@playwright/test';
import {
  showHiddenMissions,
  allMissionsToggle,
  ensureFeedVisible,
  favoriteButton,
  favoritesToggle,
  hideButton,
  missionCards,
  unfavoriteButton,
  waitForMissions,
  expectMissionCount,
} from './helpers';

test.describe('Hidden Missions Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear hidden state from previous tests
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('hiddenMissions');
      } catch {
        /* ignore */
      }
    });
  });

  test('hides a mission and decreases count', async ({ page }) => {
    await ensureFeedVisible(page);
    await waitForMissions(page, 5, 10000);

    const initialCount = await missionCards(page).count();

    const card = missionCards(page).first();
    await expect(hideButton(card)).toBeVisible({ timeout: 3000 });
    await hideButton(card).click();

    await expectMissionCount(page, initialCount - 1);
    await expect(page.getByRole('button', { name: /Voir les 1 mission/ })).toBeVisible({
      timeout: 5000,
    });
  });

  test('revealing hidden missions restores count', async ({ page }) => {
    await ensureFeedVisible(page);
    await waitForMissions(page, 5, 10000);

    const initialCount = await missionCards(page).count();

    const card = missionCards(page).first();
    await hideButton(card).click();
    await expectMissionCount(page, initialCount - 1);

    await showHiddenMissions(page);
    await expectMissionCount(page, initialCount);
  });

  test('hidden missions link is not visible when none are hidden', async ({ page }) => {
    await ensureFeedVisible(page);
    await waitForMissions(page, 5, 10000);

    await expect(
      page.getByRole('button', { name: /Voir les \d+ mission.*masqu/i })
    ).not.toBeVisible();
  });

  test('combining hide and favorite filters works', async ({ page }) => {
    await ensureFeedVisible(page);
    await waitForMissions(page, 5, 10000);

    const initialCount = await missionCards(page).count();

    // Favorite the first card
    const firstCard = missionCards(page).first();
    await favoriteButton(firstCard).click();
    await expect(unfavoriteButton(firstCard)).toBeVisible({ timeout: 3000 });

    // Hide a different card
    const cards = missionCards(page);
    await hideButton(cards.nth(1)).click();
    await expectMissionCount(page, initialCount - 1);

    // Show only favorites
    await favoritesToggle(page).click();
    await expectMissionCount(page, 1);

    // Back to all
    await allMissionsToggle(page).click();
    await expectMissionCount(page, initialCount - 1);
    await expect(page.getByRole('button', { name: /Voir les 1 mission/ })).toBeVisible({
      timeout: 5000,
    });
  });
});
