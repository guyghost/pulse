import { expect, test } from '@playwright/test';

test.describe('connected dashboard smoke', () => {
  test('renders feed, pipeline, CV, and sync surfaces without connected backend config', async ({
    page,
  }) => {
    await page.goto('/dashboard/');

    await expect(page.getByText('Checklist de setup', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Se connecter' }).first()).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Surfaces activées après setup' })
    ).toBeVisible();
    await expect(page.getByText('Le dashboard évite ainsi les métriques vides')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Feed connecté' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Radar TJM' })).toBeVisible();
    await expect(page.getByText('Aucune sync')).not.toBeVisible();
    await expect(page.getByText('Sans score')).not.toBeVisible();
    await expect(page.getByText('Aucune relance')).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: "Missions détectées par l'extension" })
    ).not.toBeVisible();
    await expect(page.getByText("Aucune mission reçue depuis l'extension")).not.toBeVisible();

    await page
      .getByLabel('Navigation dashboard')
      .getByRole('link', { name: 'Candidatures' })
      .click();
    await expect(page.getByRole('heading', { name: 'Pipeline activé après setup' })).toBeVisible();
    await expect(
      page.getByPlaceholder('Rechercher mission, client ou plateforme')
    ).not.toBeVisible();
    await expect(page.getByText('Aucune mission trouvée')).not.toBeVisible();

    await page.getByLabel('Navigation dashboard').getByRole('link', { name: 'CV' }).click();
    await expect(page.getByRole('heading', { name: 'CV principal' })).toBeVisible();
    await expect(page.getByText('Aucun CV canonique synchronisé')).toBeVisible();
    await expect(page.getByLabel('Titre du profil')).toBeVisible();

    await page
      .getByLabel('Navigation dashboard')
      .getByRole('link', { name: 'Synchronisation' })
      .click();
    await expect(page.getByRole('heading', { name: 'Synchronisation extension' })).toBeVisible();
    await expect(page.getByText('Alertes missions')).toBeVisible();
    await expect(page.getByText('Local ou non connecté')).toBeVisible();
    const syncSection = page.locator('section#sync');
    await expect(syncSection.getByText('Free-Work', { exact: true })).toBeVisible();
    await expect(syncSection.getByText('LinkedIn', { exact: true })).toBeVisible();
    await expect(syncSection.getByText('Extension requise').first()).toBeVisible();
  });

  test('renders connected data export and delete privacy controls safely when signed out', async ({
    page,
  }) => {
    await page.goto('/dashboard/');

    await expect(page.getByRole('heading', { name: 'Données connectées' })).toBeVisible();
    await expect(
      page.getByText('Les sessions et credentials des plateformes ne sont jamais stockés.')
    ).toBeVisible();

    const exportLink = page.getByRole('link', { name: 'Export JSON' });
    await expect(exportLink).toBeVisible();
    await expect(exportLink).toHaveAttribute('aria-disabled', 'true');
    await expect(exportLink).toHaveAttribute('href', /\/login/);

    await expect(page.getByText('Suppression irréversible')).toBeVisible();
    await expect(page.getByText('Impact : missions synchronisées')).toBeVisible();
    await expect(page.getByLabel('Tapez SUPPRIMER pour confirmer')).toBeVisible();
    await expect(page.getByPlaceholder('SUPPRIMER')).toBeVisible();
    const exportBeforeDeleteLink = page.getByRole('link', { name: 'Exporter avant suppression' });
    await expect(exportBeforeDeleteLink).toBeVisible();
    await expect(exportBeforeDeleteLink).toHaveAttribute('aria-disabled', 'true');
    await expect(
      page.getByRole('button', { name: 'Supprimer les données connectées' })
    ).toBeDisabled();
  });
});
