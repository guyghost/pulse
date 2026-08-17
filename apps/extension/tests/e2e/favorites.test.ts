import { test, expect } from './fixtures';
import {
  favoriteButton,
  favoritesToggle,
  missionCards,
  toggleFavoritesFilter,
  unfavoriteButton,
  waitForMissions,
  expectMissionCount,
} from './helpers';

test.describe('Favorites Flow', () => {
  test('marks a mission as favorite and star becomes filled', async ({ page }) => {
    await waitForMissions(page, 5, 10000);

    const card = missionCards(page).first();
    await expect(favoriteButton(card)).toBeVisible({ timeout: 3000 });
    await favoriteButton(card).click();

    await expect(unfavoriteButton(card)).toBeVisible({ timeout: 3000 });
  });

  test('unfavorites a mission and star reverts', async ({ page }) => {
    await waitForMissions(page, 5, 10000);

    const card = missionCards(page).first();
    await favoriteButton(card).click();
    await expect(unfavoriteButton(card)).toBeVisible({ timeout: 3000 });

    await unfavoriteButton(card).click();
    await expect(favoriteButton(card)).toBeVisible({ timeout: 3000 });
  });

  test('favorites filter shows only favorited missions', async ({ page }) => {
    await waitForMissions(page, 5, 10000);

    // Record initial count
    const initialCount = await missionCards(page).count();

    // Favorite the first card
    const card = missionCards(page).first();
    await favoriteButton(card).click();
    await expect(unfavoriteButton(card)).toBeVisible({ timeout: 3000 });

    // Toggle favorites filter (opens the operational dashboard first)
    await toggleFavoritesFilter(page, true);
    await expectMissionCount(page, 1, 5000);

    // Toggle back — the dashboard exposes a single toggle control
    await favoritesToggle(page).click();
    await expectMissionCount(page, initialCount);
  });

  test('favorites filter shows zero when no favorites', async ({ page }) => {
    await waitForMissions(page, 5, 10000);

    await toggleFavoritesFilter(page, true);

    await expectMissionCount(page, 0);
  });
});
