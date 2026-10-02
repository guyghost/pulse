import { test, expect } from './fixtures';
test.describe('Navigation', () => {
  test('navigates between tabs: Feed → TJM → Settings → Feed', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    // Scope to the nav: the feed also contains a "Missions" heading/section.
    await expect(nav.getByRole('button', { name: 'Missions' })).toHaveAttribute(
      'aria-current',
      'page'
    );

    await nav.getByRole('button', { name: 'TJM' }).click();
    await expect(nav.getByRole('button', { name: 'TJM' })).toHaveAttribute('aria-current', 'page');

    await nav.getByRole('button', { name: 'Réglages' }).click();
    await expect(nav.getByRole('button', { name: 'Réglages' })).toHaveAttribute(
      'aria-current',
      'page'
    );

    await nav.getByRole('button', { name: 'Missions' }).click();
    await expect(nav.getByRole('button', { name: 'Missions' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  test('active tab is visually highlighted', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    const feedTab = nav.getByRole('button', { name: 'Missions' });
    await expect(feedTab).toHaveAttribute('aria-current', 'page');

    await nav.getByRole('button', { name: 'TJM' }).click();
    const tjmTab = nav.getByRole('button', { name: 'TJM' });
    await expect(tjmTab).toHaveAttribute('aria-current', 'page');
    await expect(feedTab).not.toHaveAttribute('aria-current', 'page');
  });

  test('selected pill expands and reveals its label while inactive tabs stay compact', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 400, height: 760 });
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    const feedTab = nav.getByRole('button', { name: 'Missions', exact: true });
    const profileTab = nav.getByRole('button', { name: 'Profil', exact: true });
    const feedLabel = feedTab.locator('span[aria-hidden="true"]');
    const profileLabel = profileTab.locator('span[aria-hidden="true"]');

    await expect(feedLabel).toBeVisible();
    await expect(profileLabel).toBeHidden();
    await expect(feedTab).toHaveCSS('transition-duration', '0.18s');
    await expect
      .poll(async () => feedTab.evaluate((el) => el.getBoundingClientRect().width))
      .toBeGreaterThan(await profileTab.evaluate((el) => el.getBoundingClientRect().width));

    await profileTab.click();
    await expect(profileTab).toHaveAttribute('aria-current', 'page');
    await expect(profileLabel).toBeVisible();
    await expect(feedLabel).toBeHidden();
  });

  test('page transitions are smooth (content changes on nav)', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });

    await nav.getByRole('button', { name: 'TJM' }).click();
    // The TJM hero heading is now "Analyse TJM" (previously "Radar TJM").
    await expect(page.getByRole('heading', { name: 'Analyse TJM' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'TJM' })).toHaveAttribute('aria-current', 'page');

    await nav.getByRole('button', { name: 'Missions' }).click();
    await expect(nav.getByRole('button', { name: 'Missions' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });
});
