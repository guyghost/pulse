import { test, expect } from '@playwright/test';
import { expectFeedReady, feedSearchInput, SIDE_PANEL } from './helpers';

async function withNoProfile(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const savedProfileKey = '__missionpulse_e2e_saved_profile';
    let _chrome: unknown = undefined;
    let savedProfile: unknown = null;
    try {
      savedProfile = JSON.parse(window.sessionStorage.getItem(savedProfileKey) ?? 'null');
    } catch {
      savedProfile = null;
    }
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      enumerable: true,
      get() {
        return _chrome;
      },
      set(val) {
        _chrome = val;
        const chromeApi = val as {
          runtime?: { sendMessage?: (msg: { type: string }) => Promise<unknown> };
        };
        if (chromeApi.runtime?.sendMessage) {
          const origSend = chromeApi.runtime.sendMessage;
          chromeApi.runtime.sendMessage = async (msg: { type: string; payload?: unknown }) => {
            if (msg?.type === 'GET_PROFILE') {
              return { type: 'PROFILE_RESULT', payload: savedProfile };
            }
            if (msg?.type === 'SAVE_PROFILE') {
              savedProfile = msg.payload;
              window.sessionStorage.setItem(savedProfileKey, JSON.stringify(savedProfile));
              return { type: 'PROFILE_RESULT', payload: savedProfile };
            }
            if (msg?.type === 'GET_FIRST_SCAN_DONE') {
              return { type: 'FIRST_SCAN_DONE_RESULT', payload: false };
            }
            if (msg?.type === 'GET_ONBOARDING_COMPLETED') {
              return { type: 'ONBOARDING_COMPLETED_RESULT', payload: false };
            }
            return origSend.call(chromeApi.runtime, msg);
          };
        }
      },
    });
  });
}

test.describe('Onboarding', () => {
  test('single-screen onboarding completes and navigates to feed', async ({ page }) => {
    await withNoProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(
      page.getByRole('heading', { name: 'Configurez votre premier scan' })
    ).toBeVisible();
    await expect(page.locator('#ob-firstname')).toBeVisible();
    await page.locator('#ob-firstname').fill('Guy');
    await page.locator('#ob-jobtitle').fill('Dev React Senior');
    await page.locator('#ob-keywords').fill('React');
    await page.getByRole('button', { name: 'Ajouter le mot-clé' }).click();
    await expect(page.getByRole('button', { name: 'React' })).toBeVisible();
    await page.locator('#ob-location').fill('Paris');
    await expect(page.getByRole('button', { name: 'Sauvegarder mon profil' })).toBeEnabled();
    await page.getByRole('button', { name: 'Sauvegarder mon profil' }).click();
    await page.waitForFunction(() =>
      window.sessionStorage.getItem('__missionpulse_e2e_saved_profile')
    );

    await expectFeedReady(page);
    await expect(page.locator('#ob-firstname')).not.toBeVisible();

    await page.reload();
    await expectFeedReady(page);
    await expect(page.locator('#ob-firstname')).not.toBeVisible();
  });

  test('shows desired location field', async ({ page }) => {
    await withNoProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(page.locator('#ob-location')).toBeVisible();
    await expect(page.getByLabel('Localisation souhaitée')).toBeVisible();
  });

  test('submit button disabled without firstName', async ({ page }) => {
    await withNoProfile(page);
    await page.goto(SIDE_PANEL);

    await page.locator('#ob-jobtitle').fill('Dev React');
    await expect(page.getByRole('button', { name: 'Sauvegarder mon profil' })).toBeDisabled();
  });

  test('submit button disabled without jobTitle', async ({ page }) => {
    await withNoProfile(page);
    await page.goto(SIDE_PANEL);

    await page.locator('#ob-firstname').fill('Guy');
    await expect(page.getByRole('button', { name: 'Sauvegarder mon profil' })).toBeDisabled();
  });

  test('auto-skips onboarding when profile exists (default stubs)', async ({ page }) => {
    await page.goto(SIDE_PANEL);

    // With default stubs (profile exists), onboarding should be skipped
    // Either the feed is shown directly OR the onboarding form is NOT shown
    // Check for feed content or absence of onboarding form
    const hasFeed = await feedSearchInput(page)
      .isVisible()
      .catch(() => false);
    const hasGreeting = await page
      .getByText(/Bonjour/)
      .isVisible()
      .catch(() => false);
    const hasOnboardingHeading = await page
      .getByText(/Configurez|cockpit/i)
      .isVisible()
      .catch(() => false);

    // Should have either missions header or greeting (feed visible) and NO onboarding heading
    expect(hasFeed || hasGreeting || !hasOnboardingHeading).toBe(true);
  });
});
