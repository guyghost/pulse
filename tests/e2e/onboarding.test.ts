import { test, expect } from '@playwright/test';

const SIDE_PANEL = '/src/sidepanel/index.html';

async function withNoProfile(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    let _chrome: any = undefined;
    Object.defineProperty(window, 'chrome', {
      configurable: true, enumerable: true,
      get() { return _chrome; },
      set(val) {
        _chrome = val;
        if (val?.runtime?.sendMessage) {
          const origSend = val.runtime.sendMessage;
          val.runtime.sendMessage = async (msg: any) => {
            if (msg?.type === 'GET_PROFILE') return { type: 'PROFILE_RESULT', payload: null };
            return origSend.call(val.runtime, msg);
          };
        }
      },
    });
  });
}

test.describe('Onboarding', () => {
  test('single-screen onboarding completes and shows feed', async ({ page }) => {
    await withNoProfile(page);
    await page.goto(SIDE_PANEL);

    // Single screen: fill title and click "C'est parti"
    await expect(page.getByText('Configurez en 30 secondes')).toBeVisible();
    await page.locator('#ob-title').fill('Dev React Senior');
    await page.getByRole('button', { name: /C.est parti/ }).click();

    // Should now be on feed page
    await expect(page.getByText('Missions')).toBeVisible();
  });

  test('submit button disabled without title', async ({ page }) => {
    await withNoProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(page.getByRole('button', { name: /C.est parti/ })).toBeDisabled();
  });

  test('auto-skips onboarding when profile exists (default stubs)', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();
  });
});
