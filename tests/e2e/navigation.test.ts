import { test, expect } from '@playwright/test';

const SIDE_PANEL = '/src/sidepanel/index.html';

test.describe('Navigation', () => {
  test('navigates between tabs: Feed → TJM → Settings → Feed', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Navigate to TJM
    await page.getByRole('button', { name: 'TJM' }).click();
    // TJM page should have some content (heading or input)
    await expect(page.getByRole('button', { name: 'TJM' })).toHaveAttribute('aria-current', 'page');

    // Navigate to Settings
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');

    // Navigate back to Feed
    await page.getByRole('button', { name: 'Feed' }).click();
    await expect(page.getByText('Missions')).toBeVisible();
  });

  test('active tab is visually highlighted', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Feed tab should be active
    const feedTab = page.getByRole('button', { name: 'Feed' });
    await expect(feedTab).toHaveAttribute('aria-current', 'page');

    // Click TJM
    await page.getByRole('button', { name: 'TJM' }).click();
    const tjmTab = page.getByRole('button', { name: 'TJM' });
    await expect(tjmTab).toHaveAttribute('aria-current', 'page');

    // Feed should no longer be active
    await expect(feedTab).not.toHaveAttribute('aria-current', 'page');
  });
});
