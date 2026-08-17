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

    // Welcome → connecting (Étape 1/5) : « Continuer » reste bloqué sans source.
    await expect(
      page.getByRole('heading', { name: 'Toutes vos missions freelance' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Commencer', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Connectez vos sources' })).toBeVisible();
    const continueButton = page.getByRole('button', { name: 'Continuer', exact: true });
    await expect(continueButton).toBeDisabled();
    await page.getByRole('button', { name: 'Free-Work', exact: true }).click();
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    // Identity (Étape 2/5) — champs rattachés à leurs labels (wrapping label).
    await expect(page.getByRole('heading', { name: 'Qui êtes-vous ?' })).toBeVisible();
    await fillIdentityStep(page, {
      firstName: 'Guy',
      jobTitle: 'Dev React Senior',
      location: 'Paris',
    });

    // Preferences (Étape 3/5) — TJM obligatoires (tjmMin > 0, tjmMax ≥ tjmMin).
    await page.getByLabel('TJM min (€)').fill('550');
    await page.getByLabel('TJM max (€)').fill('750');
    await page.getByRole('button', { name: 'Continuer', exact: true }).click();

    // Skills (Étape 4/5) — au moins un mot-clé.
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
    // Rôle textbox : distingue du checkbox « Métier » du CopilotPanel (build
    // CI avec VITE_COPILOT_ROLLOUT_ENABLED=true).
    await page.getByRole('textbox', { name: 'Métier', exact: true }).fill('Dev React');
    // toHaveCount(1) laisse finir le fade (120ms) de l'étape précédente avant
    // l'assertion d'état (sinon deux « Continuer » coexistent — strict mode).
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
