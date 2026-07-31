import { test as baseTest, expect } from '@playwright/test';
import { test as feedTest } from '../fixtures';
import {
  SIDE_PANEL,
  mockNoProfile,
  completeOnboarding,
  waitForMissions,
  getFirstMissionCard,
  favoriteMission,
  feedSearchInput,
  hideMission,
  expectFeedReady,
  expectMissionCount,
  missionCards,
  navButton,
  toggleFavoritesFilter,
  showHiddenMissions,
  injectMissions,
  getDisplayedMissionCount,
  clearFeedSearch,
} from '../helpers';

baseTest.describe('Full User Journey', () => {
  baseTest('complete user journey from onboarding to feed interactions', async ({ page }) => {
    await mockNoProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(page.getByRole('heading', { name: 'Configurez votre premier scan' })).toBeVisible({
      timeout: 5000,
    });

    await completeOnboarding(page, {
      firstName: 'Jean',
      jobTitle: 'Développeur React Senior',
    });
    await page.waitForFunction(
      () => window.localStorage.getItem('__missionpulse_e2e_saved_profile') !== null,
      undefined,
      { timeout: 10000 }
    );

    await expectFeedReady(page);

    await waitForMissions(page, 1, 10000);

    const initialCount = await getDisplayedMissionCount(page);
    expect(initialCount).toBeGreaterThanOrEqual(1);

    await injectMissions(page, 5);
    await expectMissionCount(page, 5, 5000);

    const firstCard = await getFirstMissionCard(page);
    await favoriteMission(firstCard);

    await toggleFavoritesFilter(page, true);
    await expectMissionCount(page, 1, 5000);

    await toggleFavoritesFilter(page, false);
    await expectMissionCount(page, 5, 5000);

    const cardToHide = await getFirstMissionCard(page);
    await hideMission(cardToHide);

    await expectMissionCount(page, 4, 2000);
    await expect(page.getByRole('button', { name: /Voir les? \d+ mission.*masqu/i })).toBeVisible();

    await showHiddenMissions(page);
    await expectMissionCount(page, 5, 2000);

    await page.reload();

    await expect(page.locator('#ob-firstname')).not.toBeVisible({ timeout: 5000 });
    await expectFeedReady(page);
  });

  feedTest.describe('Feed interactions', () => {
    feedTest('user can favorite multiple missions and filter persists', async ({ page }) => {
      await injectMissions(page, 10);
      await waitForMissions(page, 10, 5000);

      for (let i = 0; i < 3; i++) {
        const card = missionCards(page).nth(i);
        await favoriteMission(card);
      }

      await toggleFavoritesFilter(page, true);
      await expectMissionCount(page, 3, 2000);

      await page.reload();
      await expectFeedReady(page);

      await expectMissionCount(page, 10, 5000);
      await toggleFavoritesFilter(page, true);
      await expectMissionCount(page, 3, 5000);
    });

    feedTest('user can navigate through different views and back', async ({ page }) => {
      await injectMissions(page, 3);
      await waitForMissions(page, 3, 5000);

      await navButton(page, 'TJM').click();
      await expect(navButton(page, 'TJM')).toHaveAttribute('aria-current', 'page');

      await navButton(page, 'Settings').click();
      await expect(navButton(page, 'Settings')).toHaveAttribute('aria-current', 'page');

      await navButton(page, 'Feed').click();
      await expectFeedReady(page);

      await expectMissionCount(page, 3, 3000);
    });

    feedTest('user can search and favorite from search results', async ({ page }) => {
      await injectMissions(page, 10);
      await waitForMissions(page, 10, 5000);

      const initialCount = 10;

      await feedSearchInput(page).fill('React');
      await page.waitForTimeout(500);

      const filteredCount = await getDisplayedMissionCount(page);
      expect(filteredCount).toBeLessThanOrEqual(initialCount);

      await expect(feedSearchInput(page)).toHaveValue('React');

      const firstResult = await getFirstMissionCard(page);
      await favoriteMission(firstResult);

      await clearFeedSearch(page);
      await page.waitForTimeout(300);

      await expectMissionCount(page, initialCount, 2000);

      await toggleFavoritesFilter(page, true);
      await expectMissionCount(page, 1, 2000);
    });

    feedTest('hidden missions count shows correct number', async ({ page }) => {
      await injectMissions(page, 8);
      await waitForMissions(page, 8, 5000);

      for (let i = 0; i < 3; i++) {
        const card = missionCards(page).first();
        await hideMission(card);
      }

      await expectMissionCount(page, 5, 2000);
      await expect(page.getByRole('button', { name: /Voir les 3 mission.*masqu/i })).toBeVisible();

      await showHiddenMissions(page);
      await expectMissionCount(page, 8, 2000);
    });
  });
});
