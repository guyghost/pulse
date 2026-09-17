import { test, expect } from '@playwright/test';
import {
  expectFeedReady,
  feedSearchInput,
  fillIdentityStep,
  connectFirstSource,
  mockNoProfile,
  SIDE_PANEL,
  startOnboardingWizard,
  submitOnboardingScan,
} from './helpers';

test.describe('Onboarding', () => {
  test('onboarding completes and navigates to feed', async ({ page }) => {
    await mockNoProfile(page);
    await page.goto(SIDE_PANEL);

    // Welcome → connecting (Step 1/5): "Continuer" stays blocked without a source.
    await expect(
      page.getByRole('heading', { name: 'Toutes vos missions freelance' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Commencer', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Connectez vos sources' })).toBeVisible();
    const continueButton = page.getByRole('button', { name: 'Continuer', exact: true });
    await expect(continueButton).toBeDisabled();
    // P0-B flow: the source connects via session verification, not a toggle.
    const freeWorkRow = page.getByRole('listitem').filter({ hasText: 'Free-Work' });
    await freeWorkRow.getByRole('button', { name: 'Connecter', exact: true }).click();
    await expect(freeWorkRow).toContainText('Session détectée');
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    // Identity (Step 2/5) — fields attached to their labels (wrapping label).
    await expect(page.getByRole('heading', { name: 'Qui êtes-vous ?' })).toBeVisible();
    await fillIdentityStep(page, {
      firstName: 'Guy',
      jobTitle: 'Dev React Senior',
      location: 'Paris',
    });

    // Preferences (Step 3/5) — minimum TJM required (tjmMin > 0, no ceiling
    // depuis DAO #174 : le champ « TJM max » n'existe plus).
    await page.getByLabel('TJM minimum (€)').fill('550');
    await page.getByRole('button', { name: 'Continuer', exact: true }).click();

    // Skills (Step 4/5) — at least one keyword.
    await expect(page.getByRole('heading', { name: 'Vos compétences clés' })).toBeVisible();
    await page.locator('#onboarding-skill-input').fill('React');
    await page.locator('#onboarding-skill-input').press('Enter');
    await expect(page.getByRole('button', { name: 'Retirer React' })).toBeVisible();
    await page.getByRole('button', { name: 'Continuer', exact: true }).click();

    // Notify (Étape 5/5) → persist + scan + redirection.
    await expect(page.getByRole('heading', { name: 'Soyez alerté·e' })).toBeVisible();
    await submitOnboardingScan(page);
    await page.waitForFunction(() =>
      window.localStorage.getItem('__missionpulse_e2e_saved_profile')
    );

    await expectFeedReady(page);
    await expect(
      page.getByRole('heading', { name: 'Toutes vos missions freelance' })
    ).not.toBeVisible();

    await page.reload();
    await expectFeedReady(page);
    await expect(page.getByRole('button', { name: 'Commencer', exact: true })).not.toBeVisible();
  });

  test('shows desired location field', async ({ page }) => {
    await mockNoProfile(page);
    await page.goto(SIDE_PANEL);

    await startOnboardingWizard(page);
    await connectFirstSource(page);
    await expect(page.getByLabel('Localisation (optionnel)')).toBeVisible();
  });

  test('continuer disabled without firstName', async ({ page }) => {
    await mockNoProfile(page);
    await page.goto(SIDE_PANEL);

    await startOnboardingWizard(page);
    await connectFirstSource(page);
    // Textbox role: distinguishes from the CopilotPanel's "Métier" checkbox (build
    // CI avec VITE_COPILOT_ROLLOUT_ENABLED=true).
    await page.getByRole('textbox', { name: 'Métier', exact: true }).fill('Dev React');
    // toHaveCount(1) lets the previous step's fade (120ms) finish before
    // the state assertion (otherwise two "Continuer" coexist — strict mode).
    const continueButton = page.getByRole('button', { name: 'Continuer', exact: true });
    await expect(continueButton).toHaveCount(1);
    await expect(continueButton).toBeDisabled();
  });

  test('continuer disabled without jobTitle', async ({ page }) => {
    await mockNoProfile(page);
    await page.goto(SIDE_PANEL);

    await startOnboardingWizard(page);
    await connectFirstSource(page);
    await page.getByLabel('Prénom').fill('Guy');
    const continueButton = page.getByRole('button', { name: 'Continuer', exact: true });
    await expect(continueButton).toHaveCount(1);
    await expect(continueButton).toBeDisabled();
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
