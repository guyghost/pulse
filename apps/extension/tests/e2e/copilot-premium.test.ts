import { expect, test } from '@playwright/test';

import { SIDE_PANEL } from './helpers';

test.skip(
  process.env.VITE_COPILOT_ROLLOUT_ENABLED !== 'true',
  'requires a dev build started with VITE_COPILOT_ROLLOUT_ENABLED=true'
);

test('consent → generated dossier → review/copy → reopen', async ({ page }, testInfo) => {
  const consoleProblems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleProblems.push(`${message.type()}: ${message.text()}`);
    }
  });
  await page.addInitScript(() => {
    window.localStorage.removeItem('__missionpulse_dev_copilot_jobs');
    window.localStorage.removeItem('__missionpulse_dev_copilot_dossiers');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (content: string) => {
          window.localStorage.setItem('__missionpulse_e2e_copied_copilot', content);
        },
      },
    });
  });

  await page.goto(SIDE_PANEL);
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation).toBeVisible();
  await navigation.getByRole('button', { name: 'Suivi' }).click();

  const panel = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Copilot Premium' }) });
  await expect(panel.getByText('Entitlement vérifié côté serveur')).toBeVisible();

  const createPitch = panel.getByRole('button', { name: /Préparer un pitch/ });
  await expect(createPitch).toBeDisabled();
  await panel.getByRole('checkbox', { name: /Lead Frontend · Fintech Scale-up/ }).check();
  await panel.getByRole('checkbox', { name: /Je consens à transmettre/ }).check();
  await expect(createPitch).toBeEnabled();
  await createPitch.click();

  await expect(panel.getByText('Prêt à relire', { exact: true })).toBeVisible();
  await expect(panel.getByText('Proposition IA non vérifiée')).toBeVisible();
  await expect(panel.getByText(/Je peux mobiliser mon expertise TypeScript/)).toBeVisible();
  await expect(panel.getByText('Questions à clarifier')).toBeVisible();

  await panel.getByRole('button', { name: 'Copier' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.localStorage.getItem('__missionpulse_e2e_copied_copilot'))
    )
    .toContain('Je peux mobiliser mon expertise TypeScript');

  await panel.getByRole('button', { name: 'Conserver' }).click();
  await expect(panel.getByText('Conservé', { exact: true })).toBeVisible();

  await navigation.getByRole('button', { name: 'Feed' }).click();
  await navigation.getByRole('button', { name: 'Suivi' }).click();

  const reopenedPanel = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Copilot Premium' }) });
  await expect(reopenedPanel.getByText('Conservé', { exact: true })).toBeVisible();
  await expect(reopenedPanel.getByText(/Je peux mobiliser mon expertise TypeScript/)).toBeVisible();
  await testInfo.attach('copilot-premium-final', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  expect(consoleProblems).toEqual([]);
});
