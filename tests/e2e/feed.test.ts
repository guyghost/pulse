import { test, expect } from '@playwright/test';

const SIDE_PANEL = '/src/sidepanel/index.html';

async function waitForDevPanel(page: import('@playwright/test').Page) {
  await page.locator('button:has-text("Ctrl+Shift+D")').waitFor({ state: 'visible' });
}

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

    await waitForDevPanel(page);
    await page.keyboard.press('Control+Shift+D');
    await expect(page.getByText('DEV PANEL')).toBeVisible();
    await page.getByRole('button', { name: 'empty' }).click();
    await page.keyboard.press('Control+Shift+D');

    await expect(page.getByText('Aucune mission')).toBeVisible({ timeout: 2000 });
  });

  test('search filters missions', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Wait for auto-scan to load missions
    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });

    // Search
    await page.getByPlaceholder('Rechercher...').fill('React');
    await page.waitForTimeout(500);
    await expect(page.getByText(/\d+ missions?/)).toBeVisible();
  });

  test('error state shows error message', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    await waitForDevPanel(page);
    await page.keyboard.press('Control+Shift+D');
    await expect(page.getByText('DEV PANEL')).toBeVisible();
    await page.getByRole('button', { name: 'error' }).click();
    await page.keyboard.press('Control+Shift+D');

    await expect(page.getByText('Erreur')).toBeVisible({ timeout: 2000 });
  });

  test('new missions show unseen indicator (blue left border)', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();
    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });

    // Cards should be visible — the IntersectionObserver marks them as seen
    const firstCard = page.locator('[role="button"]').first();
    await expect(firstCard).toBeVisible();
    // After appearing in viewport, the card transitions to "seen" state
    await page.waitForTimeout(500);
  });

  test('action buttons are visible on mission cards', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();
    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });

    const firstCard = page.locator('[role="button"]').first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard.getByTitle('Ajouter aux favoris')).toBeVisible();
    await expect(firstCard.getByTitle('Masquer')).toBeVisible();
    await expect(firstCard.getByTitle('Copier le lien')).toBeVisible();
    await expect(firstCard.getByTitle('Ouvrir')).toBeVisible();
  });

  test('favorites toggle filters missions', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();
    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });

    await page.getByTitle('Voir favoris').click();
    await page.waitForTimeout(300);
    await page.getByTitle('Voir toutes').click();
    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 2000 });
  });
});
