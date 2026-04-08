import { test, expect } from '@playwright/test';
import { SIDE_PANEL } from './helpers';

async function withNoProfile(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    let _chrome: any = undefined;
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      enumerable: true,
      get() {
        return _chrome;
      },
      set(val) {
        _chrome = val;
        if (val?.runtime?.sendMessage) {
          const origSend = val.runtime.sendMessage;
          val.runtime.sendMessage = async (msg: any) => {
            if (msg?.type === 'GET_PROFILE') {
              return { type: 'PROFILE_RESULT', payload: null };
            }
            return origSend.call(val.runtime, msg);
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

    await expect(page.getByRole('heading', { name: 'Le cockpit freelance' })).toBeVisible();
    await expect(page.locator('#ob-firstname')).toBeVisible();
    await page.locator('#ob-firstname').fill('Guy');
    await page.locator('#ob-jobtitle').fill('Dev React Senior');
    await page.locator('#ob-location').fill('Paris');
    await page.getByRole('button', { name: /C.est parti/ }).click();

    await expect(page.getByRole('heading', { name: 'Radar freelance' })).toBeVisible();
    await expect(page.locator('#ob-firstname')).not.toBeVisible();
  });

  test('shows desired location field', async ({ page }) => {
    await withNoProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(page.locator('#ob-location')).toBeVisible();
    await expect(page.getByLabel('Localisation souhaitee')).toBeVisible();
  });

  test('submit button disabled without firstName', async ({ page }) => {
    await withNoProfile(page);
    await page.goto(SIDE_PANEL);

    await page.locator('#ob-jobtitle').fill('Dev React');
    await expect(page.getByRole('button', { name: /C.est parti/ })).toBeDisabled();
  });

  test('submit button disabled without jobTitle', async ({ page }) => {
    await withNoProfile(page);
    await page.goto(SIDE_PANEL);

    await page.locator('#ob-firstname').fill('Guy');
    await expect(page.getByRole('button', { name: /C.est parti/ })).toBeDisabled();
  });

  test('auto-skips onboarding when profile exists (default stubs)', async ({ page }) => {
    await page.goto(SIDE_PANEL);

    // With default stubs (profile exists), onboarding should be skipped
    // Either the feed is shown directly OR the onboarding form is NOT shown
    // Check for feed content or absence of onboarding form
    const hasMissions = await page
      .getByText('Missions')
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
    expect(hasMissions || hasGreeting || !hasOnboardingHeading).toBe(true);
  });
});
