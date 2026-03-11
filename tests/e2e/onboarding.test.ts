import { test, expect } from '@playwright/test';

const SIDE_PANEL = '/src/sidepanel/index.html';

/**
 * Patch Chrome stubs so GET_PROFILE returns null, forcing the onboarding flow.
 */
async function withNoProfile(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    let _chrome: any = undefined;

    Object.defineProperty(window, 'chrome', {
      configurable: true,
      enumerable: true,
      get() { return _chrome; },
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
  test('completes onboarding happy path and shows feed', async ({ page }) => {
    await withNoProfile(page);
    await page.goto(SIDE_PANEL);

    // Step 0 (welcome): Profile basics
    await expect(page.getByText('Votre profil')).toBeVisible();
    await page.locator('#ob-title').fill('Dev React Senior');

    // First "Suivant" goes from welcome -> profile (still step 0)
    await page.getByRole('button', { name: 'Suivant' }).click();
    // Second "Suivant" goes from profile -> connectors (step 1)
    await page.getByRole('button', { name: 'Suivant' }).click();

    // Step 1 (connectors): TJM & Location
    await expect(page.getByText('Tarif & Localisation')).toBeVisible();
    await page.getByRole('button', { name: 'Suivant' }).click();

    // Step 2 (firstScan): Récapitulatif
    await expect(page.getByRole('heading', { name: /capitulatif/i })).toBeVisible();
    await page.getByRole('button', { name: 'Commencer' }).click();

    // Should now be on feed page
    await expect(page.getByText('Missions')).toBeVisible();
  });

  test('navigates back through onboarding steps', async ({ page }) => {
    await withNoProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(page.getByText('Votre profil')).toBeVisible();

    // Go from welcome -> profile -> connectors (step 1)
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByText('Tarif & Localisation')).toBeVisible();

    // Go back: connectors -> profile (step 0)
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(page.getByText('Votre profil')).toBeVisible();
  });

  test('auto-skips onboarding when profile exists (default stubs)', async ({ page }) => {
    // Without patching, the chrome stubs return a mock profile
    await page.goto(SIDE_PANEL);

    // App should skip directly to feed
    await expect(page.getByText('Missions')).toBeVisible();
  });
});
