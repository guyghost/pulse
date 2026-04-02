import { test, expect } from '@playwright/test';
import { ensureFeedVisible, waitForMissions, expectMissionCount } from './helpers';

test.describe('Favorites Flow', () => {
  test('marks a mission as favorite and star becomes filled', async ({ page }) => {
    await ensureFeedVisible(page);
    await waitForMissions(page, 5, 10000);

    const card = page.locator('[role="button"][tabindex="0"]').first();
    await expect(card.getByTitle('Ajouter aux favoris')).toBeVisible({ timeout: 3000 });
    await card.getByTitle('Ajouter aux favoris').click();

    await expect(card.getByTitle('Retirer des favoris')).toBeVisible({ timeout: 3000 });
  });

  test('unfavorites a mission and star reverts', async ({ page }) => {
    await ensureFeedVisible(page);
    await waitForMissions(page, 5, 10000);

    const card = page.locator('[role="button"][tabindex="0"]').first();
    await card.getByTitle('Ajouter aux favoris').click();
    await expect(card.getByTitle('Retirer des favoris')).toBeVisible({ timeout: 3000 });

    await card.getByTitle('Retirer des favoris').click();
    await expect(card.getByTitle('Ajouter aux favoris')).toBeVisible({ timeout: 3000 });
  });

  test('favorites filter shows only favorited missions', async ({ page }) => {
    await ensureFeedVisible(page);
    await waitForMissions(page, 5, 10000);

    // Record initial count
    const initialCount = await page.locator('[role="button"][tabindex="0"]').count();

    // Favorite the first card
    const card = page.locator('[role="button"][tabindex="0"]').first();
    await card.getByTitle('Ajouter aux favoris').click();
    await expect(card.getByTitle('Retirer des favoris')).toBeVisible({ timeout: 3000 });

    // Toggle favorites filter
    await page.getByTitle('Voir favoris').click();
    await page.waitForTimeout(500);

    await expectMissionCount(page, 1);

    // Toggle back
    await page.getByTitle('Voir toutes').click();
    await expectMissionCount(page, initialCount);
  });

  test('favorites filter shows zero when no favorites', async ({ page }) => {
    await ensureFeedVisible(page);
    await waitForMissions(page, 5, 10000);

    await page.getByTitle('Voir favoris').click();
    await page.waitForTimeout(500);

    await expectMissionCount(page, 0);
  });
});
