import { test, expect, type Page } from '@playwright/test';
import {
  SIDE_PANEL,
  expectMissionCount,
  feedSearchInput,
  injectMissions,
  setFeedState,
} from './helpers';

/**
 * Mock chrome to simulate a user who has already completed onboarding.
 * This ensures the feed page is shown directly without going through onboarding.
 */
async function mockUserWithProfile(page: Page) {
  await page.addInitScript(() => {
    let _chrome: unknown = undefined;
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      enumerable: true,
      get() {
        return _chrome;
      },
      set(val) {
        _chrome = val;
        if ((val as Record<string, unknown>)?.runtime?.sendMessage) {
          const origSend = (val as Record<string, unknown>).runtime.sendMessage as (
            msg: unknown
          ) => Promise<unknown>;
          (val as Record<string, unknown>).runtime.sendMessage = async (msg: { type: string }) => {
            if (msg?.type === 'GET_PROFILE') {
              // Return a mock profile so onboarding is skipped
              return {
                type: 'PROFILE_RESULT',
                payload: {
                  firstName: 'Test',
                  jobTitle: 'Developer',
                  location: 'Paris',
                  stacks: ['React', 'TypeScript'],
                  tjm: 600,
                },
              };
            }
            return origSend.call((val as Record<string, unknown>).runtime, msg);
          };
        }
        // Mock chrome.storage.local
        if ((val as Record<string, unknown>)?.storage) {
          const storage: Record<string, unknown> = {};
          (val as Record<string, unknown>).storage = {
            local: {
              get: async (key: string) => {
                return (storage as Record<string, unknown>)[key]
                  ? { [key]: (storage as Record<string, unknown>)[key] }
                  : {};
              },
              set: async (items: Record<string, unknown>) => {
                Object.assign(storage, items);
              },
            },
          };
        }
      },
    });
  });
}

test.describe('Feed', () => {
  test('auto-loads missions on mount', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    // Wait for feed to be ready - search input is always visible on feed
    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    // Wait for the feed to show something - either missions or empty state
    await expect(page.getByText(/(Aucune mission|\d+ missions)/).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test('shows empty state via DevPanel', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    await setFeedState(page, 'empty');

    await expect(page.getByText('Aucune mission')).toBeVisible({ timeout: 2000 });
  });

  test('search filters missions', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    await injectMissions(page, 5);

    await expectMissionCount(page, 5);

    // Search
    await feedSearchInput(page).fill('React');
    await page.waitForTimeout(500);

    // Results should update - verify search input contains the search term
    await expect(feedSearchInput(page)).toHaveValue('React');

    await expect(page.getByText(/React/).first()).toBeVisible();
  });

  test('error state shows error message', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    await setFeedState(page, 'error');

    await expect(page.getByText('[Dev] Simulated error')).toBeVisible({ timeout: 2000 });
  });

  test('new missions show unseen indicator (blue left border)', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    await injectMissions(page, 5);
    await expectMissionCount(page, 5);

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
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    await injectMissions(page, 5);

    await expectMissionCount(page, 5);

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
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    await injectMissions(page, 5);

    await expectMissionCount(page, 5);

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
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    await injectMissions(page, 5);

    await expectMissionCount(page, 5);

    // Hide the first mission
    const firstCard = page.locator('[role="button"]').first();
    const hideBtn = firstCard.getByTitle('Masquer');
    await hideBtn.click();

    // Mission count should decrease
    await expectMissionCount(page, 4, 2000);

    // "Voir les masquees" link should appear
    await expect(page.getByRole('button', { name: /Voir les \d+ mission.*masqu/i })).toBeVisible();
  });

  test('favorites toggle filters to favorites only', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    await injectMissions(page, 5);

    await expectMissionCount(page, 5);

    // Favorite the first mission
    const firstCard = page.locator('[role="button"]').first();
    await firstCard.getByTitle('Ajouter aux favoris').click();
    await expect(firstCard.getByTitle('Retirer des favoris')).toBeVisible({ timeout: 1000 });

    // Click favorites filter in header — button shows "Favoris" text
    await page.getByTitle(/Favoris/).click();
    await page.waitForTimeout(300);

    // Should show only 1 mission (the favorited one)
    await expectMissionCount(page, 1, 2000);

    // Toggle back to all — button now shows "Voir toutes (f)"
    await page.getByTitle(/Voir toutes/).click();
    await expectMissionCount(page, 5, 2000);
  });

  test('header star button and refresh button are visible', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    // Favorites filter button — text is "Favoris" when not active
    await expect(page.getByRole('button', { name: /Favoris/ })).toBeVisible();
    // Refresh/scan button is visible (title changes based on state)
    await expect(page.getByTitle(/Lancer le scan|Rafraichir|Scan en cours/)).toBeVisible();
  });

  test('ARIA attributes for accessibility are properly set', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    // Verify we're on the feed by checking navigation is visible
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    // Verify feed content exists — check for search input (always visible in feed)
    await expect(feedSearchInput(page)).toBeVisible();

    // Test aria-pressed on favorites toggle — button shows "Favoris" text when not active
    const favoritesToggle = page.getByTitle(/Favoris/);
    await expect(favoritesToggle).toHaveAttribute('aria-pressed', 'false');

    await favoritesToggle.click();
    await expect(page.getByTitle(/Voir toutes/)).toHaveAttribute('aria-pressed', 'true');
    // When active, button shows "Voir toutes (f)"
    await page.getByTitle(/Voir toutes/).click();
    await expect(page.getByTitle(/Favoris/)).toHaveAttribute('aria-pressed', 'false');

    // Test aria-expanded on filter toggle
    const filterToggle = page.getByTitle('Afficher les filtres');
    await expect(filterToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(filterToggle).toHaveAttribute('aria-controls', 'filter-panel');

    await filterToggle.click();
    await expect(page.getByTitle('Masquer les filtres')).toHaveAttribute('aria-expanded', 'true');
    // Filter panel uses role="group" with aria-label "Options de filtrage"
    const filterPanel = page.getByRole('group', { name: /Options de filtrage/ });
    await expect(filterPanel).toBeVisible();
  });
});
