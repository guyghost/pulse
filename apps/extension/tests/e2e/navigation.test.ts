import { test, expect } from '@playwright/test';
import { ensureFeedVisible } from './helpers';

test.describe('Navigation', () => {
  test('navigates between tabs: Feed → TJM → Settings → Feed', async ({ page }) => {
    await ensureFeedVisible(page);
    await expect(page.getByRole('button', { name: 'Feed' })).toHaveAttribute('aria-current', 'page');

    const nav = page.getByRole('navigation', { name: 'Main navigation' });

    await nav.getByRole('button', { name: 'TJM' }).click();
    await expect(nav.getByRole('button', { name: 'TJM' })).toHaveAttribute('aria-current', 'page');

    await nav.getByRole('button', { name: 'Settings' }).click();
    await expect(nav.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');

    await nav.getByRole('button', { name: 'Feed' }).click();
    await expect(nav.getByRole('button', { name: 'Feed' })).toHaveAttribute('aria-current', 'page');
  });

  test('active tab is visually highlighted', async ({ page }) => {
    await ensureFeedVisible(page);

    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    const feedTab = nav.getByRole('button', { name: 'Feed' });
    await expect(feedTab).toHaveAttribute('aria-current', 'page');

    await nav.getByRole('button', { name: 'TJM' }).click();
    const tjmTab = nav.getByRole('button', { name: 'TJM' });
    await expect(tjmTab).toHaveAttribute('aria-current', 'page');
    await expect(feedTab).not.toHaveAttribute('aria-current', 'page');
  });

  test('page transitions are smooth (content changes on nav)', async ({ page }) => {
    await ensureFeedVisible(page);

    const nav = page.getByRole('navigation', { name: 'Main navigation' });

    await nav.getByRole('button', { name: 'TJM' }).click();
    await expect(page.getByText('Radar marche')).toBeVisible();
    await expect(nav.getByRole('button', { name: 'TJM' })).toHaveAttribute('aria-current', 'page');

    await nav.getByRole('button', { name: 'Feed' }).click();
    await expect(nav.getByRole('button', { name: 'Feed' })).toHaveAttribute('aria-current', 'page');
  });
});
