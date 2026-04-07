import { test, expect } from '@playwright/test';
import { showHiddenMissions, ensureFeedVisible, waitForMissions, expectMissionCount } from './helpers';

test.describe('Hidden Missions Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear hidden state from previous tests
    await page.addInitScript(() => {
      try { localStorage.removeItem('hiddenMissions'); } catch {}
    });
  });

  test('hides a mission and decreases count', async ({ page }) => {
    await ensureFeedVisible(page);
    await waitForMissions(page, 5, 10000);

    const initialCount = await page.locator('[role="button"][tabindex="0"]').count();

    const card = page.locator('[role="button"][tabindex="0"]').first();
    await expect(card.getByTitle('Masquer')).toBeVisible({ timeout: 3000 });
    await card.getByTitle('Masquer').click();

    await expectMissionCount(page, initialCount - 1);
    await expect(page.getByRole('button', { name: /Voir les 1 mission/ })).toBeVisible({ timeout: 5000 });
  });

  test('revealing hidden missions restores count', async ({ page }) => {
    await ensureFeedVisible(page);
    await waitForMissions(page, 5, 10000);

    const initialCount = await page.locator('[role="button"][tabindex="0"]').count();

    const card = page.locator('[role="button"][tabindex="0"]').first();
    await card.getByTitle('Masquer').click();
    await expectMissionCount(page, initialCount - 1);

    await showHiddenMissions(page);
    await expectMissionCount(page, initialCount);
  });

  test('hidden missions link is not visible when none are hidden', async ({ page }) => {
    await ensureFeedVisible(page);
    await waitForMissions(page, 5, 10000);

    await expect(page.getByRole('button', { name: /Voir les \d+ mission/ })).not.toBeVisible();
  });

  test('combining hide and favorite filters works', async ({ page }) => {
    await ensureFeedVisible(page);
    await waitForMissions(page, 5, 10000);

    const initialCount = await page.locator('[role="button"][tabindex="0"]').count();

    // Favorite the first card
    const firstCard = page.locator('[role="button"][tabindex="0"]').first();
    await firstCard.getByTitle('Ajouter aux favoris').click();
    await expect(firstCard.getByTitle('Retirer des favoris')).toBeVisible({ timeout: 3000 });

    // Hide a different card
    const cards = page.locator('[role="button"][tabindex="0"]');
    await cards.nth(1).getByTitle('Masquer').click();
    await expectMissionCount(page, initialCount - 1);

    // Show only favorites
    await page.getByTitle('Voir favoris').click();
    await expectMissionCount(page, 1);

    // Back to all
    await page.getByTitle('Voir toutes').click();
    await expectMissionCount(page, initialCount - 1);
    await expect(page.getByRole('button', { name: /Voir les 1 mission/ })).toBeVisible({ timeout: 5000 });
  });
});
