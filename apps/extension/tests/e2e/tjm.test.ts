import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { toggleOffline } from './helpers';

async function seedAnnouncements(page: Page, empty = false) {
  await page.evaluate(
    async ({ empty }) => {
      const date = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
      const values = [
        {
          id: 'a',
          tjm: 500,
          category: 'frontend',
          seniority: 'senior',
          remote: 'full',
          location: 'Lyon',
          days: 1,
        },
        {
          id: 'b',
          tjm: 700,
          category: 'frontend',
          seniority: 'senior',
          remote: 'full',
          location: 'Lyon',
          days: 2,
        },
        {
          id: 'c',
          tjm: null,
          category: 'frontend',
          seniority: 'senior',
          remote: 'full',
          location: 'Lyon',
          days: 3,
        },
        {
          id: 'd',
          tjm: 300,
          category: null,
          seniority: null,
          remote: null,
          location: null,
          days: 1,
        },
        {
          id: 'e',
          tjm: 900,
          category: 'backend',
          seniority: 'junior',
          remote: 'onsite',
          location: 'Lyon',
          days: 40,
        },
      ];
      localStorage.setItem(
        '__missionpulse_dev_missions',
        JSON.stringify(
          empty
            ? []
            : values.map((value) => ({
                id: value.id,
                title: 'Annonce React',
                client: null,
                description: '',
                stack: ['React', 'TypeScript'],
                tjm: value.tjm,
                location: value.location,
                remote: value.remote,
                seniority: value.seniority,
                duration: null,
                startDate: null,
                publishedAt: null,
                source: 'free-work',
                url: `https://example.com/job/${value.id}`,
                scrapedAt: date(value.days),
                score: null,
                semanticScore: null,
                semanticReason: null,
                scoreBreakdown: null,
                classification: value.category
                  ? {
                      category: value.category,
                      remoteCompatible: true,
                      confidence: 1,
                      classifiedAt: Date.now(),
                    }
                  : null,
              }))
        )
      );
      await chrome.storage.local.set({
        tjm_history: {
          records: [
            {
              stack: 'react',
              date: date(60).slice(0, 10),
              min: 9999,
              max: 9999,
              average: 9999,
              sampleCount: 500,
              seniority: null,
              region: null,
            },
          ],
          observations: empty
            ? []
            : [
                {
                  identity: 'free-work:https://example.com/job/a',
                  observedAt: date(5),
                  source: 'free-work',
                  stacks: ['react', 'typescript'],
                  tjm: 100,
                  category: 'frontend',
                  seniority: 'senior',
                  remote: 'full',
                  region: 'lyon',
                },
              ],
        },
      });
    },
    { empty }
  );
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('button', { name: 'TJM', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Analyse TJM' })).toBeVisible();
  const refresh = page.getByRole('button', { name: "Rafraîchir l'analyse TJM" });
  await expect(refresh).toBeEnabled();
  await refresh.click();
  await expect(refresh).toBeEnabled();
}

test.describe('TJM local sample', () => {
  test('uses stored announcement dates and identities for a true median without a new scan', async ({
    page,
  }) => {
    await seedAnnouncements(page);
    await expect(page.getByTestId('tjm-sample-total')).toHaveText('5');
    await expect(page.getByTestId('tjm-sample-median')).toHaveText('600 €/j');
    await expect(page.getByTestId('tjm-sample-coverage')).toHaveText(
      '4 avec TJM · 1 sans TJM · 5 au total'
    );
    await page.getByRole('radio', { name: '7 jours', exact: true }).click();
    await expect(page.getByTestId('tjm-sample-total')).toHaveText('4');
    await expect(page.getByTestId('tjm-sample-median')).toHaveText('500 €/j');
  });

  test('intersects profession, seniority, work mode and region, including no-tariff announcements', async ({
    page,
  }) => {
    await seedAnnouncements(page);
    await page.getByLabel('Métier', { exact: true }).selectOption('frontend');
    await page.getByLabel('Expérience', { exact: true }).selectOption('senior');
    await page.getByLabel('Mode de travail', { exact: true }).selectOption('full');
    await page.getByLabel('Région', { exact: true }).selectOption('lyon');
    await expect(page.getByTestId('tjm-sample-coverage')).toHaveText(
      '2 avec TJM · 1 sans TJM · 3 au total'
    );
    await expect(page.getByTestId('tjm-sample-median')).toHaveText('600 €/j');
    await page.getByLabel('Métier', { exact: true }).selectOption('backend');
    await expect(page.getByText('Aucune annonce pour ce segment')).toBeVisible();
    await expect(page.getByTestId('tjm-sample-coverage')).toHaveText(
      '0 avec TJM · 0 sans TJM · 0 au total'
    );
    await expect(page.getByTestId('tjm-sample-median')).toHaveCount(0);
  });

  test('keeps unknown dimensions explicitly selectable', async ({ page }) => {
    await seedAnnouncements(page);
    for (const label of ['Métier', 'Expérience', 'Mode de travail', 'Région']) {
      await page.getByLabel(label, { exact: true }).selectOption('unknown');
    }
    await expect(page.getByTestId('tjm-sample-total')).toHaveText('1');
    await expect(page.getByTestId('tjm-sample-median')).toHaveText('300 €/j');
  });

  test('keeps legacy history separate when there are no identifiable announcements', async ({
    page,
  }) => {
    await seedAnnouncements(page, true);
    await expect(page.getByText('Aucune annonce pour ce segment')).toBeVisible();
    await expect(page.getByTestId('tjm-sample-coverage')).toHaveText(
      '0 avec TJM · 0 sans TJM · 0 au total'
    );
    await page.getByText('Historique agrégé ancien · hors segmentation').click();
    await expect(page.getByLabel('Moyennes historiques agrégées')).toContainText(/9\s999/);
    await expect(page.getByTestId('tjm-sample-median')).toHaveCount(0);
  });

  test('keeps the selected sample usable offline', async ({ page }) => {
    await seedAnnouncements(page);
    await toggleOffline(page, true);
    await expect(
      page.getByTestId('page-tjm').getByText('Mode hors ligne', { exact: true })
    ).toBeVisible();
    await page.getByLabel('Métier', { exact: true }).selectOption('frontend');
    await expect(page.getByTestId('tjm-sample-total')).toHaveText('3');
    await toggleOffline(page, false);
  });

  for (const width of [320, 400]) {
    test(`supports keyboard filters without horizontal overflow at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await seedAnnouncements(page);
      const all = page.getByRole('radio', { name: 'Tout', exact: true });
      await all.focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('radio', { name: '7 jours', exact: true })).toBeFocused();
      await expect(page.getByRole('radio', { name: '7 jours', exact: true })).toHaveAttribute(
        'aria-checked',
        'true'
      );
      await expect(page.getByTestId('tjm-sample-total')).toHaveText('4');
      await page.getByLabel('Métier', { exact: true }).focus();
      await page.keyboard.press('b');
      await page.keyboard.press('Enter');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
    });
  }
});
