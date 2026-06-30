import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { injectMissions, toggleOffline } from './helpers';

async function seedTJMHistory(page: Page) {
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      tjm_history: {
        records: [
          {
            stack: 'react',
            date: '2026-04-01',
            min: 500,
            max: 650,
            average: 580,
            sampleCount: 4,
          },
          {
            stack: 'react',
            date: '2026-04-02',
            min: 540,
            max: 700,
            average: 620,
            sampleCount: 5,
          },
          {
            stack: 'typescript',
            date: '2026-04-01',
            min: 480,
            max: 630,
            average: 560,
            sampleCount: 3,
          },
          {
            stack: 'typescript',
            date: '2026-04-02',
            min: 520,
            max: 680,
            average: 600,
            sampleCount: 4,
          },
          {
            stack: 'node',
            date: '2026-04-01',
            min: 450,
            max: 600,
            average: 530,
            sampleCount: 3,
          },
          {
            stack: 'node',
            date: '2026-04-02',
            min: 490,
            max: 640,
            average: 570,
            sampleCount: 4,
          },
        ],
      },
    });
  });
}

test.describe('TJM page', () => {
  test('shows TJM tab in main navigation', async ({ page }) => {
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'TJM' })
    ).toBeVisible();
  });

  test('shows an empty state when no TJM history exists', async ({ page }) => {
    await page.evaluate(async () => {
      await chrome.storage.local.remove('tjm_history');
    });

    // Scope to the main nav: the bare name 'TJM' also matches feed filter chips.
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('button', { name: 'TJM' }).click();
    await expect(nav.getByRole('button', { name: 'TJM' })).toHaveAttribute('aria-current', 'page');
    // Empty state renders an OperationalEmptyState + a "Alimenter le radar TJM" setup section.
    await expect(page.getByText('Aucune tendance TJM exploitable')).toBeVisible();
    await expect(page.getByText('Alimenter le radar TJM')).toBeVisible();
  });

  test('renders dashboard data when TJM history is available', async ({ page }) => {
    await seedTJMHistory(page);

    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'TJM' })
      .click();

    await expect(page.getByRole('heading', { name: 'Analyse TJM' })).toBeVisible();
    const tjmPage = page.getByTestId('page-tjm');
    await expect(tjmPage.getByText("Vue d'ensemble")).toBeVisible();
    await expect(tjmPage.getByText('Junior', { exact: true })).toBeVisible();
    await expect(tjmPage.getByText('Confirmé', { exact: true })).toBeVisible();
    await expect(tjmPage.getByText('Senior', { exact: true })).toBeVisible();
  });

  test('shows cached TJM data while offline', async ({ page }) => {
    await injectMissions(page, 3);
    await seedTJMHistory(page);

    await toggleOffline(page, true);
    await page.waitForTimeout(300);

    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'TJM' })
      .click();

    const tjmPage = page.getByTestId('page-tjm');
    await expect(tjmPage.getByText('Mode hors ligne', { exact: true })).toBeVisible();
    await expect(tjmPage.getByText("Vue d'ensemble")).toBeVisible();

    await toggleOffline(page, false);
  });
});
