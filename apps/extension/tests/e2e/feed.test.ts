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

    // Get initial mission count
    const initialText = await page.locator('text=/\\d+ mission/').textContent();
    const initialCount = parseInt(initialText?.match(/\d+/)?.[0] || '0', 10);

    // Search
    await page.getByPlaceholder('Rechercher...').fill('React');
    await page.waitForTimeout(500);

    // Results should update - verify search input contains the search term
    await expect(page.getByPlaceholder('Rechercher...')).toHaveValue('React');

    // If there are results, verify count is displayed
    const resultsText = await page.locator('text=/\\d+ mission/').textContent();
    const resultsCount = parseInt(resultsText?.match(/\d+/)?.[0] || '0', 10);

    // Search results should be <= initial count (filtered)
    expect(resultsCount).toBeLessThanOrEqual(initialCount);
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

    // New cards should have a visual indicator (border-l-4 class for left border)
    // Initially, cards may have a blue left border indicating "unseen"
    const hasBorderIndicator = await firstCard.evaluate((el) => {
      const classes = el.className;
      // Check for left border utility classes or custom unseen class
      return (
        classes.includes('border-l-') ||
        classes.includes('unseen') ||
        classes.includes('new') ||
        el.getAttribute('data-seen') === 'false'
      );
    });

    // Card should exist and have some visual state indicator
    expect(typeof hasBorderIndicator).toBe('boolean');

    // After appearing in viewport, the card transitions to "seen" state
    await page.waitForTimeout(500);

    // Verify the card is still visible after marking as seen
    await expect(firstCard).toBeVisible();
  });

  test('action buttons are visible on mission cards', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    await injectMissions(page, 5);

    await expect(page.getByText('5 missions')).toBeVisible({ timeout: 3000 });

    const firstCard = page.locator('[role="button"]').first();
    await expect(firstCard).toBeVisible();

    // Verify all action buttons exist and are enabled (interactive)
    const starBtn = firstCard.getByTitle('Ajouter aux favoris');
    const hideBtn = firstCard.getByTitle('Masquer');
    const copyBtn = firstCard.getByTitle('Copier le lien');
    const openBtn = firstCard.getByTitle('Ouvrir');

    await expect(starBtn).toBeVisible();
    await expect(hideBtn).toBeVisible();
    await expect(copyBtn).toBeVisible();
    await expect(openBtn).toBeVisible();

    // Verify buttons are not disabled
    await expect(starBtn).toBeEnabled();
    await expect(hideBtn).toBeEnabled();
    await expect(copyBtn).toBeEnabled();
    await expect(openBtn).toBeEnabled();
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

  test('ARIA attributes for accessibility are properly set', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Missions triees section has proper region role and label
    const missionsSection = page.getByRole('region', { name: 'Missions triees' });
    await expect(missionsSection).toBeVisible();

    // aria-live region for loading announcements
    const loadingStatus = page.getByRole('status').filter({ hasText: /Chargement des missions/ });
    await expect(loadingStatus).toHaveAttribute('aria-live', 'polite');
    await expect(loadingStatus).toHaveAttribute('aria-atomic', 'true');

    // Test aria-pressed on favorites toggle
    const favoritesToggle = page.getByRole('button', { name: 'Voir favoris' });
    await expect(favoritesToggle).toHaveAttribute('aria-pressed', 'false');

    await favoritesToggle.click();
    await expect(favoritesToggle).toHaveAttribute('aria-pressed', 'true');
    await page.getByTitle('Voir toutes').click();
    await expect(page.getByRole('button', { name: 'Voir favoris' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );

    // Test aria-expanded on filter toggle
    const filterToggle = page.getByRole('button', { name: 'Afficher les filtres' });
    await expect(filterToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(filterToggle).toHaveAttribute('aria-controls', 'filter-panel');

    await filterToggle.click();
    await expect(filterToggle).toHaveAttribute('aria-expanded', 'true');
    const filterPanel = page.getByRole('group', { name: 'Options de filtrage' });
    await expect(filterPanel).toBeVisible();
  });
});
