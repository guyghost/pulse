import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { SIDE_PANEL } from './helpers';

for (const width of [320, 400]) {
  test(`local CV export and reminder controls fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(SIDE_PANEL);
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    await nav.getByRole('button', { name: 'CV', exact: true }).click();
    await page.getByRole('button', { name: 'Préparer mon CV' }).click();
    await expect(page.getByRole('article', { name: 'Aperçu du CV' })).toBeVisible();
    const downloadButton = page.getByRole('button', { name: 'Télécharger le CV HTML' });
    await expect(downloadButton).toBeDisabled();
    const missionSelect = page.getByLabel('Contexte de candidature');
    await missionSelect.selectOption({ index: 1 });
    await expect(page.getByRole('article', { name: 'Aperçu du CV' })).toContainText(
      'Candidature :'
    );
    if (width === 400) {
      await missionSelect.selectOption('');
      await expect(page.getByRole('article', { name: 'Aperçu du CV' })).not.toContainText(
        'Candidature :'
      );
    }
    await page
      .getByLabel('Introduction personnelle (facultative)')
      .fill('Mon parcours vérifié <script>alert(1)</script>');
    await page.getByRole('button', { name: 'Valider cet aperçu' }).focus();
    await page.keyboard.press('Enter');
    await expect(downloadButton).toBeEnabled();
    await page
      .getByLabel('Introduction personnelle (facultative)')
      .fill('Mon parcours vérifié <img src="https://evil.test">');
    await expect(downloadButton).toBeDisabled();
    await page.getByRole('button', { name: 'Valider cet aperçu' }).click();
    const downloaded = page.waitForEvent('download');
    await downloadButton.click();
    const download = await downloaded;
    const html = await readFile((await download.path())!, 'utf8');
    expect(html).toContain('&lt;img src=&quot;https://evil.test&quot;&gt;');
    expect(html).not.toContain('<img');
    expect(html).toContain('Enregistrer en PDF');
    await nav.getByRole('button', { name: 'Suivi', exact: true }).click();
    await expect(page.getByRole('heading', { name: /À relancer/ })).toBeVisible();
    const input = page.getByLabel('Prochaine action', { exact: true });
    await input.fill('2026-12-10T09:30');
    const save = page.getByRole('button', { name: 'Enregistrer', exact: true });
    const inputBox = await input.boundingBox();
    const saveBox = await save.boundingBox();
    expect(saveBox!.y).toBeGreaterThanOrEqual(inputBox!.y + inputBox!.height);
    expect(inputBox!.width).toBeGreaterThan(width - 160);
    await save.click();
    await expect(page.getByText('Relance enregistrée.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Effacer', exact: true }).click();
    await expect(page.getByText('Relance effacée.', { exact: true })).toBeVisible();
    await expect(input).toHaveValue('');
    await expect(page.getByText('Copilot Premium', { exact: true })).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  });
}

test('a detected mission with an explicit reminder appears in follow-ups without changing status', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('__missionpulse_dev_trackings', '[]');
  });
  await page.goto(SIDE_PANEL);
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('button', { name: 'Suivi', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'À relancer (0)', exact: true })).toBeVisible();
  const input = page.getByLabel('Prochaine action', { exact: true });
  await input.fill('2020-01-01T09:00');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Relance enregistrée.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'À relancer (1)', exact: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'À relancer', exact: true }).getByRole('button')
  ).toHaveCount(1);
  const readTracking = () =>
    page.evaluate(async () => {
      const response = (await chrome.runtime.sendMessage({ type: 'GET_TRACKINGS' })) as {
        payload: Array<{
          currentStatus: string;
          nextActionAt: string | null;
          history: Array<{ to: string }>;
        }>;
      };
      return response.payload;
    });
  const saved = await readTracking();
  expect(saved).toHaveLength(1);
  expect(saved[0].currentStatus).toBe('detected');
  expect(saved[0].history.every((event) => event.to === 'detected')).toBe(true);
  await page.getByText('Activité et étapes du suivi', { exact: true }).click();
  await expect(page.getByTestId('application-kanban')).toContainText('Détectée');
  await input.fill('2030-01-01T09:00');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'À relancer (0)', exact: true })).toBeVisible();
  await expect(page.getByTestId('application-kanban')).toContainText('Détectée');
  await page.getByRole('button', { name: 'Effacer', exact: true }).click();
  await expect(page.getByText('Relance effacée.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('application-kanban')).toHaveCount(0);
  expect((await readTracking())[0]).toMatchObject({
    currentStatus: 'detected',
    nextActionAt: null,
  });
});
