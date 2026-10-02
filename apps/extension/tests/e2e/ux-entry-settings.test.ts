import { test, expect } from '@playwright/test';
import {
  ensureFeedVisible,
  mockNoProfile,
  navButton,
  openSettingsSection,
  SIDE_PANEL,
} from './helpers';

for (const width of [320, 400]) {
  test(`named navigation and optional cloud at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 760 });
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    await ensureFeedVisible(page);
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    for (const label of ['Profil', 'Missions', 'CV', 'TJM', 'Réglages']) {
      const button = nav.getByRole('button', { name: label, exact: true });
      await expect(button).toBeVisible();
      const visibleLabel = button.locator('span[aria-hidden="true"]');
      if (label === 'Missions') {
        await expect(visibleLabel).toBeVisible();
      } else {
        await expect(visibleLabel).toBeHidden();
      }
    }
    await navButton(page, 'Profil').focus();
    await page.keyboard.press('Enter');
    await expect(navButton(page, 'Profil')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Consulter les critères du profil')).toBeVisible();
    await navButton(page, 'Réglages').click();
    await openSettingsSection(page, 'account');
    await expect(page.getByRole('heading', { name: 'Dans votre navigateur' })).toBeVisible();
    const cloud = page.getByRole('switch', { name: 'Activer la classification des missions' });
    await expect(cloud).toHaveAttribute('aria-checked', 'true');
    await expect(cloud).toBeEnabled();
    await expect(page.getByText('Inactive — clé manquante')).toBeVisible();
    await cloud.click();
    await expect(cloud).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText('Désactivée', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    expect(runtimeErrors).toEqual([]);
  });

  test(`onboarding source shortcuts stay in viewport and profile remains available at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 640 });
    await mockNoProfile(page);
    await page.goto(SIDE_PANEL);
    await page.getByRole('button', { name: 'Commencer', exact: true }).click();
    const skip = page.getByRole('button', { name: 'Continuer sans source', exact: true });
    await expect(skip).toBeInViewport();
    if (width === 320) {
      await page
        .getByRole('listitem')
        .filter({ hasText: 'Free-Work' })
        .getByRole('button', { name: 'Connecter', exact: true })
        .click();
      const scan = page.getByRole('button', { name: 'Scanner maintenant', exact: true });
      await expect(scan).toBeInViewport();
      await scan.click();
    } else {
      await skip.click();
    }
    await expect(navButton(page, 'Missions')).toHaveAttribute('aria-current', 'page');
    await navButton(page, 'Profil').click();
    await page.getByRole('button', { name: 'Modifier mes critères', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Prénom', exact: true })).toBeVisible();
    await navButton(page, 'Réglages').click();
    await expect(page.getByRole('button', { name: /Sources et fréquence/ })).toBeVisible();
  });
}
