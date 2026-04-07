import { test, expect } from '@playwright/test';
import { ensureFeedVisible, injectMissions, waitForMissions } from './helpers';

test.describe('Export Flow', () => {
  test('export section is accessible from settings', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    await expect(page.getByText('Export').first()).toBeVisible({ timeout: 3000 });
  });

  test('all three export format buttons are visible and enabled', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    const jsonBtn = page.getByRole('button', { name: 'JSON' });
    const csvBtn = page.getByRole('button', { name: 'CSV' });
    const mdBtn = page.getByRole('button', { name: 'Markdown' });

    await expect(jsonBtn).toBeVisible();
    await expect(csvBtn).toBeVisible();
    await expect(mdBtn).toBeVisible();

    await expect(jsonBtn).toBeEnabled();
    await expect(csvBtn).toBeEnabled();
    await expect(mdBtn).toBeEnabled();
  });

  test('export JSON with no favorites shows error toast', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByText('Export').first()).toBeVisible({ timeout: 3000 });

    await page.getByRole('button', { name: 'JSON' }).click();

    // Toast should appear with error about no favorites
    await expect(page.getByText(/Aucune mission favorite/i)).toBeVisible({ timeout: 3000 });
  });

  test('export CSV with no favorites shows error toast', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByText('Export').first()).toBeVisible({ timeout: 3000 });

    await page.getByRole('button', { name: 'CSV' }).click();

    await expect(page.getByText(/Aucune mission favorite/i)).toBeVisible({ timeout: 3000 });
  });

  test('export Markdown with no favorites shows error toast', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByText('Export').first()).toBeVisible({ timeout: 3000 });

    await page.getByRole('button', { name: 'Markdown' }).click();

    await expect(page.getByText(/Aucune mission favorite/i)).toBeVisible({ timeout: 3000 });
  });

  test('export buttons remain enabled after failed export', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByText('Export').first()).toBeVisible({ timeout: 3000 });

    await page.getByRole('button', { name: 'JSON' }).click();
    await page.waitForTimeout(1000);

    await expect(page.getByRole('button', { name: 'JSON' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'CSV' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Markdown' })).toBeEnabled();
  });
});
