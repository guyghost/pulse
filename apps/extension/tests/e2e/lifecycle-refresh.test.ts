import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { dismissFeedTour, missionCards, openSettingsSection } from './helpers';
async function seed(page: Page) {
  await page.evaluate(async () => {
    const result = await chrome.runtime.sendMessage({ type: 'GET_FEED_MISSIONS' });
    const mission = {
      ...result.payload[0],
      id: 'lifecycle-1',
      title: 'Mission cycle de vie',
      stack: ['React'],
      tjm: 600,
      scrapedAt: new Date().toISOString(),
    };
    localStorage.setItem('__missionpulse_dev_missions', JSON.stringify([mission]));
    localStorage.setItem('__missionpulse_dev_trackings', '[]');
  });
  await page.reload();
  await dismissFeedTour(page);
  await expect(missionCards(page).filter({ hasText: 'Mission cycle de vie' })).toBeVisible();
}
test('follow-ups advance with the clock and refresh both sources without losing a draft', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-01T12:00:00Z') });
  await seed(page);
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await nav.getByRole('button', { name: 'Suivi', exact: true }).click();
  const input = page.getByLabel('Prochaine action', { exact: true });
  await input.fill('2026-10-01T12:01');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Relance enregistrée.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'À relancer (0)', exact: true })).toBeVisible();
  await page.clock.fastForward(90_000);
  await expect(page.getByRole('heading', { name: 'À relancer (1)', exact: true })).toBeVisible();
  await input.fill('2026-11-02T09:45');
  await expect(input).toHaveValue('2026-11-02T09:45');
  await nav.getByRole('button', { name: 'Missions', exact: true }).click();
  await expect(page.locator('#application-next-action')).toHaveValue('2026-11-02T09:45');
  const card = missionCards(page).filter({ hasText: 'Mission cycle de vie' });
  await card.getByRole('button', { name: /Afficher les détails de la mission/ }).click();
  await card.getByRole('button', { name: 'Ouvrir pour postuler', exact: true }).click();
  await expect(card.getByText('Sélectionnée', { exact: true })).toBeVisible();
  await expect(page.locator('#application-next-action')).toHaveValue('2026-11-02T09:45');
  await page.evaluate(async () => {
    const missions = JSON.parse(localStorage.getItem('__missionpulse_dev_missions')!);
    localStorage.setItem(
      '__missionpulse_dev_missions',
      JSON.stringify([
        ...missions,
        { ...missions[0], id: 'lifecycle-2', title: 'Nouvelle mission synchronisée' },
      ])
    );
    window.dispatchEvent(
      new CustomEvent('dev:missions', {
        detail: JSON.parse(localStorage.getItem('__missionpulse_dev_missions')!),
      })
    );
    await chrome.runtime.sendMessage({ type: 'MISSIONS_UPDATED' });
  });
  const newCard = missionCards(page).filter({ hasText: 'Nouvelle mission synchronisée' });
  await expect(newCard).toBeVisible();
  await newCard.getByRole('button', { name: /Afficher les détails de la mission/ }).click();
  await newCard.getByRole('button', { name: 'Ouvrir pour postuler', exact: true }).click();
  await expect(newCard.getByText('Sélectionnée', { exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Suivi', exact: true }).click();
  await expect(input).toHaveValue('2026-11-02T09:45');
  await expect(
    page.getByRole('heading', { name: 'Mission cycle de vie', exact: true }).last()
  ).toBeVisible();
  await expect(
    page.getByText('Nouvelle mission synchronisée', { exact: true }).first()
  ).toBeVisible();
  const records = await page.evaluate(
    async () => (await chrome.runtime.sendMessage({ type: 'GET_TRACKINGS' })).payload
  );
  expect(records.map((record: { currentStatus: string }) => record.currentStatus)).toEqual([
    'selected',
    'selected',
  ]);
  expect(records[0].history.filter((entry: { to: string }) => entry.to === 'applied')).toHaveLength(
    0
  );
});
test('TJM includes an unpriced source observation persisted after the terminal and reactivates with default filters', async ({
  page,
}) => {
  await seed(page);
  await page.evaluate(async () => {
    await chrome.storage.local.set({ tjm_history: { records: [], observations: [] } });
  });
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await nav.getByRole('button', { name: 'TJM', exact: true }).click();
  await expect(page.getByTestId('tjm-sample-total')).toHaveText('1');
  await page.evaluate(async () => {
    await chrome.runtime.sendMessage({ type: 'SCAN_COMPLETE', payload: { missions: [] } });
  });
  await expect(page.getByTestId('tjm-sample-total')).toHaveText('1');
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      tjm_history: {
        records: [],
        observations: [
          {
            identity: 'free-work:https://example.test/source-loser',
            observedAt: new Date().toISOString(),
            source: 'free-work',
            stacks: ['react'],
            tjm: null,
            category: null,
            seniority: null,
            remote: null,
            region: null,
          },
        ],
      },
    });
  });
  await expect(page.getByTestId('tjm-sample-total')).toHaveText('2');
  await expect(page.getByTestId('tjm-sample-coverage')).toHaveText(
    '1 avec TJM · 1 sans TJM · 2 au total'
  );
  await nav.getByRole('button', { name: 'Missions', exact: true }).click();
  await page.evaluate(() => {
    localStorage.setItem('__missionpulse_dev_missions', '[]');
  });
  await nav.getByRole('button', { name: 'TJM', exact: true }).click();
  await expect(page.getByTestId('tjm-sample-total')).toHaveText('1');
});
for (const width of [320, 400]) {
  test(`operational title and cloud disclosure use readable rows at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await dismissFeedTour(page);
    const banner = page.getByTestId('operational-story-inline').first();
    await expect(banner).toBeVisible();
    const title = banner.locator('p').first();
    const action = banner.getByRole('button').first();
    expect(await title.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true
    );
    const titleBox = await title.boundingBox();
    const actionBox = await action.boundingBox();
    expect(actionBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height);
    await page.screenshot({ path: testInfo.outputPath('feed-readable.png') });
    await page
      .getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('button', { name: 'Réglages', exact: true })
      .click();
    await openSettingsSection(page, 'account');
    const copy = page.getByText('Catégorise les missions via Vercel AI Gateway', { exact: false });
    await copy.scrollIntoViewIfNeeded();
    const paragraph = await copy.boundingBox();
    const toggle = await page
      .getByRole('switch', { name: 'Activer la classification des missions' })
      .boundingBox();
    const cloudCard = await copy.locator('..').boundingBox();
    expect(paragraph!.width).toBeGreaterThanOrEqual(cloudCard!.width - 26);
    expect(paragraph!.y).toBeGreaterThanOrEqual(toggle!.y + toggle!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({ path: testInfo.outputPath('cloud-readable.png') });
  });
}
