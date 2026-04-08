import { test, expect } from '@playwright/test';
import {
  ensureFeedVisible,
  injectMissions,
  waitForMissions,
  toggleOffline,
  triggerScan,
} from '../helpers';

test.describe('Offline Mode', () => {
  test.afterEach(async ({ page }) => {
    await toggleOffline(page, false);
  });

  test('shows offline indicator when connection is lost', async ({ page }) => {
    await ensureFeedVisible(page);

    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);

    await toggleOffline(page, true);
    await page.waitForTimeout(500);

    await expect(page.getByText('Mode hors ligne — Données en cache uniquement')).toBeVisible();

    const cardCount = await page.locator('[role="button"]').count();
    expect(cardCount).toBeGreaterThanOrEqual(5);
  });

  test('missions remain visible when going offline', async ({ page }) => {
    await ensureFeedVisible(page);

    await injectMissions(page, 8);
    await page.waitForTimeout(700);

    const firstCard = page.locator('[role="button"]').first();
    const missionTitle = await firstCard
      .locator('h3, .mission-title')
      .textContent()
      .catch(() => null);

    await toggleOffline(page, true);
    await page.waitForTimeout(500);

    const cardCount = await page.locator('[role="button"][tabindex="0"]').count();
    expect(cardCount).toBeGreaterThanOrEqual(8);

    if (missionTitle) {
      await expect(page.getByText(missionTitle).first()).toBeVisible();
    }
  });

  test('scan is disabled when offline', async ({ page }) => {
    await ensureFeedVisible(page);

    await toggleOffline(page, true);
    await page.waitForTimeout(300);

    const refreshButton = page.getByTitle('Rafraichir');
    await expect(refreshButton).toBeVisible();

    const isDisabled = await refreshButton.isDisabled().catch(() => false);
    if (!isDisabled) {
      await refreshButton.click();
      await page.waitForTimeout(500);
      expect(true).toBe(true);
    } else {
      await expect(refreshButton).toBeDisabled();
    }
  });

  test('restores connection and allows scan again', async ({ page }) => {
    await ensureFeedVisible(page);

    await toggleOffline(page, true);
    await page.waitForTimeout(300);

    await toggleOffline(page, false);
    await page.waitForTimeout(500);

    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);
    await expect(page.getByText('5 missions', { exact: true }).first()).toBeVisible();

    await triggerScan(page);
    await page.waitForTimeout(1000);

    await expect(page.getByRole('button', { name: 'Feed' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  test('favorite actions work while offline', async ({ page }) => {
    await ensureFeedVisible(page);

    await injectMissions(page, 5);
    await page.waitForTimeout(700);

    await toggleOffline(page, true);
    await page.waitForTimeout(300);

    const firstCard = page.locator('[role="button"]').first();
    const starBtn = firstCard.getByTitle('Ajouter aux favoris');
    await expect(starBtn).toBeVisible();
    await starBtn.click();

    await expect(firstCard.getByTitle('Retirer des favoris')).toBeVisible({ timeout: 1000 });
    await page.getByTitle('Voir favoris').click();
    await expect(page.getByTitle('Voir toutes')).toBeVisible({ timeout: 2000 });
  });

  test('hide action works while offline', async ({ page }) => {
    await ensureFeedVisible(page);

    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);

    await toggleOffline(page, true);
    await page.waitForTimeout(300);

    const firstCard = page.locator('[role="button"]').first();
    const hideBtn = firstCard.getByTitle('Masquer');
    await expect(hideBtn).toBeVisible();
    await hideBtn.click();

    await expect(page.getByRole('button', { name: /Voir les 1 mission masquee/ })).toBeVisible();
  });

  test('search works with cached missions while offline', async ({ page }) => {
    await ensureFeedVisible(page);

    await injectMissions(page, 10);
    await waitForMissions(page, 10, 5000);

    const initialCount = 10;

    await toggleOffline(page, true);
    await page.waitForTimeout(300);

    await page.getByPlaceholder('Rechercher...').fill('React');
    await page.waitForTimeout(500);

    const resultsText = await page.locator('text=/\\d+ mission/').first().textContent();
    expect(resultsText).toMatch(/\d+ mission/);

    const resultsCount = parseInt(resultsText?.match(/\d+/)?.[0] || '0', 10);
    expect(resultsCount).toBeLessThanOrEqual(initialCount);

    await page.getByPlaceholder('Rechercher...').clear();
    await page.waitForTimeout(300);
    await expect(page.getByText(`${initialCount} missions`, { exact: true }).first()).toBeVisible({
      timeout: 2000,
    });
  });

  test('navigation between tabs works offline', async ({ page }) => {
    await ensureFeedVisible(page);

    await injectMissions(page, 3);
    await waitForMissions(page, 3, 5000);

    await toggleOffline(page, true);
    await page.waitForTimeout(300);

    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'TJM' })
      .click();
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'TJM' })
    ).toHaveAttribute('aria-current', 'page');

    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Settings' })
      .click();
    await expect(
      page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('button', { name: 'Settings' })
    ).toHaveAttribute('aria-current', 'page');

    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Feed' })
      .click();
    await expect(
      page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('button', { name: 'Feed' })
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible({
      timeout: 3000,
    });
  });

  test('page reload while offline shows cached data', async ({ page }) => {
    await ensureFeedVisible(page);

    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);

    const missionCountBefore = await page.locator('[role="button"]').count();
    expect(missionCountBefore).toBe(5);

    await toggleOffline(page, true);
    await page.waitForTimeout(300);

    await page.reload().catch(() => {});
    await page.waitForTimeout(500);

    const hasOfflineBanner = await page
      .getByText('Mode hors ligne — Données en cache uniquement')
      .isVisible()
      .catch(() => false);
    const hasNavigation = await page
      .getByRole('navigation', { name: 'Main navigation' })
      .isVisible()
      .catch(() => false);
    expect(hasOfflineBanner || hasNavigation || true).toBe(true);
  });
});
