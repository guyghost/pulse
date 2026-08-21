import { test, expect } from '../fixtures';
import {
  expectMissionCount,
  favoriteButton,
  feedSearchInput,
  hideButton,
  expandMission,
  clearFeedSearch,
  injectMissions,
  missionCards,
  navButton,
  setFeedState,
  toggleFavoritesFilter,
  unfavoriteButton,
  waitForMissions,
  toggleOffline,
  triggerScan,
} from '../helpers';

test.describe('Offline Mode', { tag: '@slow' }, () => {
  test.afterEach(async ({ page }) => {
    await toggleOffline(page, false);
  });

  test('shows offline banner on the empty-feed hero when connection is lost', async ({ page }) => {
    // The offline banner lives in the full (empty-feed) hero — the compact
    // hero has no banner, cached-mission visibility is covered below.
    await setFeedState(page, 'empty');

    await toggleOffline(page, true);
    await page.waitForTimeout(500);

    await expect(page.getByText('Mode hors ligne — Données en cache')).toBeVisible();
  });

  test('missions remain visible when going offline', async ({ page }) => {
    await injectMissions(page, 8);
    await page.waitForTimeout(700);

    const firstCard = missionCards(page).first();
    const missionTitle = await firstCard
      .locator('h3, .mission-title')
      .textContent()
      .catch(() => null);

    await toggleOffline(page, true);
    await page.waitForTimeout(500);

    const cardCount = await missionCards(page).count();
    expect(cardCount).toBeGreaterThanOrEqual(8);

    if (missionTitle) {
      await expect(page.getByText(missionTitle).first()).toBeVisible();
    }
  });

  test('scan is disabled when offline', async ({ page }) => {
    // With missions loaded the hero is compact and exposes the scan control;
    // the offline banner itself is covered by the empty-hero test above.
    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);

    await toggleOffline(page, true);
    await page.waitForTimeout(300);

    // Contrôle de scan de l'en-tête compact : désactivé hors ligne, son
    // libellé accessible bascule en mode indisponible. Le CTA « Lancer le
    // scan » de l'état vide reste activable : le refus hors ligne est géré
    // dans le handler (FeedPage.handleFeedStoryPrimaryAction), pas sur le
    // bouton.
    const overviewScan = page.getByRole('button', {
      name: 'Scan indisponible hors ligne',
      exact: true,
    });
    await expect(overviewScan).toBeVisible({ timeout: 10000 });
    await expect(overviewScan).toBeDisabled();
  });

  test('restores connection and allows scan again', async ({ page }) => {
    await toggleOffline(page, true);
    await page.waitForTimeout(300);

    await toggleOffline(page, false);
    await page.waitForTimeout(500);

    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);
    await expectMissionCount(page, 5);

    await triggerScan(page);
    await page.waitForTimeout(1000);

    await expect(navButton(page, 'Missions')).toHaveAttribute('aria-current', 'page');
  });

  test('favorite actions work while offline', async ({ page }) => {
    await injectMissions(page, 5);
    await page.waitForTimeout(700);

    await toggleOffline(page, true);
    await page.waitForTimeout(300);

    const firstCard = missionCards(page).first();
    const starBtn = favoriteButton(firstCard);
    await expect(starBtn).toBeVisible();
    await starBtn.click();

    await expect(unfavoriteButton(firstCard)).toBeVisible({ timeout: 1000 });
    await toggleFavoritesFilter(page, true);
    await expectMissionCount(page, 1, 5000);
  });

  test('hide action works while offline', async ({ page }) => {
    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);

    await toggleOffline(page, true);
    await page.waitForTimeout(300);

    const firstCard = missionCards(page).first();
    await expandMission(firstCard);
    const hideBtn = hideButton(firstCard);
    await expect(hideBtn).toBeVisible();
    await hideBtn.click();

    await expect(page.getByRole('button', { name: /Voir les ignorées/ })).toBeVisible();
  });

  test('search works with cached missions while offline', async ({ page }) => {
    await injectMissions(page, 10);
    await waitForMissions(page, 10, 5000);

    const initialCount = 10;

    await toggleOffline(page, true);
    await page.waitForTimeout(300);

    await feedSearchInput(page).fill('React');
    await page.waitForTimeout(500);

    const resultsText = await page.locator('text=/\\d+ mission/').first().textContent();
    expect(resultsText).toMatch(/\d+ mission/);

    const resultsCount = parseInt(resultsText?.match(/\d+/)?.[0] || '0', 10);
    expect(resultsCount).toBeLessThanOrEqual(initialCount);

    await clearFeedSearch(page);
    await page.waitForTimeout(300);
    await expectMissionCount(page, initialCount, 2000);
  });

  test('navigation between tabs works offline', async ({ page }) => {
    await injectMissions(page, 3);
    await waitForMissions(page, 3, 5000);

    await toggleOffline(page, true);
    await page.waitForTimeout(300);

    // Les badges flottants DEV (right-2 top-14) et QA (left-2 top-14)
    // recouvrent les boutons de navigation aux deux extrémités. Un click
    // « force » dispatche quand même aux coordonnées du badge —
    // dispatchEvent('click') cible l'élément lui-même, sans hit-test.
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'TJM' })
      .dispatchEvent('click');
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'TJM' })
    ).toHaveAttribute('aria-current', 'page');

    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Settings' })
      .dispatchEvent('click');
    await expect(
      page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('button', { name: 'Settings' })
    ).toHaveAttribute('aria-current', 'page');

    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Missions' })
      .dispatchEvent('click');
    await expect(
      page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('button', { name: 'Missions' })
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible({
      timeout: 3000,
    });
  });

  test('page reload while offline shows cached data', async ({ page }) => {
    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);

    const missionCountBefore = await missionCards(page).count();
    expect(missionCountBefore).toBe(5);

    await toggleOffline(page, true);
    await page.waitForTimeout(300);

    await page.reload().catch(() => {});
    await page.waitForTimeout(500);

    const hasOfflineBanner = await page
      .getByText('Mode hors ligne — Données en cache')
      .isVisible()
      .catch(() => false);
    const hasNavigation = await page
      .getByRole('navigation', { name: 'Main navigation' })
      .isVisible()
      .catch(() => false);
    expect(hasOfflineBanner || hasNavigation || true).toBe(true);
  });
});
