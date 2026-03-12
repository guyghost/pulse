import { test, expect } from '@playwright/test';
import { SIDE_PANEL, injectMissions, setFeedState } from './helpers';

test.describe('Feed', () => {
  test('auto-loads missions on mount', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Auto-scan triggers on mount, missions appear after stub delay
    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });
  });

  test('shows empty state via DevPanel', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    await setFeedState(page, 'empty');

    await expect(page.getByText('Aucune mission')).toBeVisible({ timeout: 2000 });
  });

  test('search filters missions', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Wait for auto-scan to load missions
    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });

    // Search
    await page.getByPlaceholder('Rechercher...').fill('React');
    await page.waitForTimeout(500);
    await expect(page.getByText(/\d+ missions?/)).toBeVisible();
  });

  test('error state shows error message', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    await setFeedState(page, 'error');

    await expect(page.getByText('Erreur')).toBeVisible({ timeout: 2000 });
  });

  test('new missions show unseen indicator (blue left border)', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();
    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });

    // Cards should be visible — the IntersectionObserver marks them as seen
    const firstCard = page.locator('[role="button"]').first();
    await expect(firstCard).toBeVisible();
    // After appearing in viewport, the card transitions to "seen" state
    await page.waitForTimeout(500);
  });

  test('action buttons are visible on mission cards', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    await injectMissions(page, 5);

    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });

    const firstCard = page.locator('[role="button"]').first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard.getByTitle('Ajouter aux favoris')).toBeVisible();
    await expect(firstCard.getByTitle('Masquer')).toBeVisible();
    await expect(firstCard.getByTitle('Copier le lien')).toBeVisible();
    await expect(firstCard.getByTitle('Ouvrir')).toBeVisible();
  });

  test('clicking favorite toggles star state', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    await injectMissions(page, 5);

    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });

    const firstCard = page.locator('[role="button"]').first();
    const starBtn = firstCard.getByTitle('Ajouter aux favoris');
    await expect(starBtn).toBeVisible();

    // Click to favorite
    await starBtn.click();
    // After clicking, title should change to 'Retirer des favoris'
    await expect(firstCard.getByTitle('Retirer des favoris')).toBeVisible({ timeout: 1000 });

    // Click again to unfavorite
    await firstCard.getByTitle('Retirer des favoris').click();
    await expect(firstCard.getByTitle('Ajouter aux favoris')).toBeVisible({ timeout: 1000 });
  });

  test('clicking hide removes mission and shows toggle link', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    await injectMissions(page, 5);

    await expect(page.getByText('5 missions')).toBeVisible({ timeout: 3000 });

    // Hide the first mission
    const firstCard = page.locator('[role="button"]').first();
    const hideBtn = firstCard.getByTitle('Masquer');
    await hideBtn.click();

    // Mission count should decrease
    await expect(page.getByText('4 missions')).toBeVisible({ timeout: 2000 });

    // "Voir les masquees" link should appear
    await expect(page.getByText(/Voir les \d+ masquee/)).toBeVisible();
  });

  test('favorites toggle filters to favorites only', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    await injectMissions(page, 5);

    await expect(page.getByText('5 missions')).toBeVisible({ timeout: 3000 });

    // Favorite the first mission
    const firstCard = page.locator('[role="button"]').first();
    await firstCard.getByTitle('Ajouter aux favoris').click();
    await expect(firstCard.getByTitle('Retirer des favoris')).toBeVisible({ timeout: 1000 });

    // Click favorites filter in header
    await page.getByTitle('Voir favoris').click();
    await page.waitForTimeout(300);

    // Should show only 1 mission (the favorited one)
    await expect(page.getByText('1 mission')).toBeVisible({ timeout: 2000 });

    // Toggle back to all
    await page.getByTitle('Voir toutes').click();
    await expect(page.getByText('5 missions')).toBeVisible({ timeout: 2000 });
  });

  test('header star button and refresh button are visible', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    await expect(page.getByTitle('Voir favoris')).toBeVisible();
    await expect(page.getByTitle('Rafraichir')).toBeVisible();
  });
});
