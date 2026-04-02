import { test, expect, type Page } from '@playwright/test';
import { SIDE_PANEL, injectMissions, toggleOffline } from './helpers';

async function ensureFeedIsVisible(page: Page) {
  await page.goto(SIDE_PANEL);

  if (await page.getByText('Votre profil cible').isVisible().catch(() => false)) {
    await page.locator('#ob-firstname').fill('Jean');
    await page.locator('#ob-jobtitle').fill('Développeur React Senior');
    await page.locator('#ob-location').fill('Paris');
    await page.getByRole('button', { name: /C'est parti/ }).click();
  }

  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Feed' })).toBeVisible();
}

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
    await ensureFeedIsVisible(page);
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'TJM' })
    ).toBeVisible();
  });

  test('shows an empty state when no TJM history exists', async ({ page }) => {
    await ensureFeedIsVisible(page);

    await page.evaluate(async () => {
      await chrome.storage.local.remove('tjm_history');
    });

    await page.getByRole('button', { name: 'TJM' }).click();
    await expect(page.getByRole('button', { name: 'TJM' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('TJM Intelligence')).toBeVisible();
    await expect(page.getByText(/Lancez une analyse/)).toBeVisible();
  });

  test('renders dashboard data when TJM history is available', async ({ page }) => {
    await ensureFeedIsVisible(page);
    await seedTJMHistory(page);

    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'TJM' }).click();

    await expect(page.getByText('Radar marche')).toBeVisible();
    await expect(page.getByText('Analyse TJM')).toBeVisible();
    await expect(page.getByText('Stacks suivies')).toBeVisible();
    await expect(page.getByText('react', { exact: true })).toBeVisible();
    await expect(page.getByText('typescript', { exact: true })).toBeVisible();
    await expect(page.getByText('2026-04-02')).toBeVisible();
    await expect(page.getByText(/Le marche est orienté a la hausse/i)).toBeVisible();
  });

  test('shows cached TJM data while offline', async ({ page }) => {
    await ensureFeedIsVisible(page);
    await injectMissions(page, 3);
    await seedTJMHistory(page);

    await toggleOffline(page, true);
    await page.waitForTimeout(300);

    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'TJM' }).click();

    await expect(page.getByText('Mode hors ligne — Affichage des dernieres donnees en cache')).toBeVisible();
    await expect(page.getByText('Analyse TJM')).toBeVisible();
    await expect(page.getByText('react', { exact: true })).toBeVisible();

    await toggleOffline(page, false);
  });
});
