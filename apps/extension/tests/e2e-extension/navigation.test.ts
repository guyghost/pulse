import type { Page } from '@playwright/test';
import { expect, expectNoRuntimeErrors, test } from './fixtures';

interface NavigationSurface {
  ariaLabel: string;
  heading: RegExp;
  testId: string;
}

const navigationSurfaces: NavigationSurface[] = [
  { ariaLabel: 'Feed', heading: /Radar freelance|Bonjour,/, testId: 'feed-scroll-container' },
  {
    ariaLabel: 'Profil',
    heading: /Votre profil MissionPulse|Bonjour /,
    testId: 'page-profile',
  },
  { ariaLabel: 'CV', heading: /CV & expériences/, testId: 'page-cv' },
  { ariaLabel: 'Suivi', heading: /Candidatures/, testId: 'page-applications' },
  { ariaLabel: 'TJM', heading: /Analyse TJM/, testId: 'page-tjm' },
  { ariaLabel: 'Réglages Settings', heading: /Paramètres/, testId: 'page-settings' },
];

async function assertNoBlankOrLoadError(page: Page): Promise<void> {
  await expect(page.getByTestId('bootstrap-error')).toHaveCount(0);
  await expect(page.locator('[data-testid^="page-load-error-"]')).toHaveCount(0);
  await expect(page.locator('.panel-shell')).toBeVisible();

  const rendered = await page.locator('.panel-shell').evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    text: element.textContent?.trim() ?? '',
    width: element.getBoundingClientRect().width,
  }));
  expect(rendered.width).toBeGreaterThan(0);
  expect(rendered.height).toBeGreaterThan(0);
  expect(rendered.text.length).toBeGreaterThan(0);
}

async function traverseAllTabs(page: Page): Promise<void> {
  for (const surface of navigationSurfaces) {
    const tab = page.getByRole('button', { name: surface.ariaLabel, exact: true });
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(tab).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId(surface.testId)).toBeVisible();
    await expect(page.getByRole('heading', { name: surface.heading }).first()).toBeVisible();
    await assertNoBlankOrLoadError(page);
  }
}

test('cold boot shows the packaged onboarding without DEV stubs', async ({ extension }) => {
  const page = await extension.openSidePanel();

  await expect(page).toHaveURL(extension.sidePanelUrl);
  await expect(page.getByTestId('page-onboarding')).toBeVisible();
  await expect(page.getByText('Premier lancement', { exact: true })).toBeVisible();
  await assertNoBlankOrLoadError(page);

  const devState = await page.evaluate(() => ({
    devPanelReadyGlobal: '__devPanelReady' in window,
    devPanelVisible: document.body.textContent?.includes('DEV PANEL') ?? false,
    devStorageKeys: Object.keys(window.localStorage).filter((key) =>
      key.startsWith('__missionpulse_dev_')
    ),
  }));
  expect(devState).toEqual({
    devPanelReadyGlobal: false,
    devPanelVisible: false,
    devStorageKeys: [],
  });
  expectNoRuntimeErrors(extension.diagnostics);
});

test('all packaged tabs render on a cold visit and after a warm reload', async ({ extension }) => {
  await extension.seedStorage({
    feed_tour_seen: true,
    first_scan_done: true,
    kbd_cheatsheet_tip_seen: true,
    onboarding_completed: true,
    premium_enabled: true,
    profile_banner_dismissed: true,
  });

  const page = await extension.openSidePanel();
  const persistedBootstrap = await page.evaluate(async () => {
    const [onboarding, firstScan] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_ONBOARDING_COMPLETED' }),
      chrome.runtime.sendMessage({ type: 'GET_FIRST_SCAN_DONE' }),
    ]);
    return { firstScan, onboarding };
  });
  expect(persistedBootstrap).toEqual({
    firstScan: { type: 'FIRST_SCAN_DONE_RESULT', payload: true },
    onboarding: { type: 'ONBOARDING_COMPLETED_RESULT', payload: true },
  });

  await traverseAllTabs(page);
  expectNoRuntimeErrors(extension.diagnostics);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await traverseAllTabs(page);
  const activeWorker = await extension.waitForServiceWorker(page);
  expect(new URL(activeWorker.url()).hostname).toBe(extension.extensionId);
  expectNoRuntimeErrors(extension.diagnostics);
});

test('packaged shortcuts modal traps focus and restores its trigger', async ({ extension }) => {
  await extension.seedStorage({
    feed_tour_seen: true,
    first_scan_done: true,
    kbd_cheatsheet_tip_seen: true,
    onboarding_completed: true,
    premium_enabled: true,
    profile_banner_dismissed: true,
  });

  const page = await extension.openSidePanel();
  const trigger = page.getByRole('button', {
    name: "Afficher l'aide des raccourcis clavier",
    exact: true,
  });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Raccourcis clavier' });
  const close = dialog.getByRole('button', { name: 'Fermer', exact: true });
  const acknowledge = dialog.getByRole('button', { name: "J'ai compris", exact: true });
  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');

  await page.keyboard.press('Shift+Tab');
  await expect(acknowledge).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expectNoRuntimeErrors(extension.diagnostics);
});
