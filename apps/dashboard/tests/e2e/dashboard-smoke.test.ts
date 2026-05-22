import { expect, test } from '@playwright/test';

test.describe('connected dashboard smoke', () => {
  test('renders feed, pipeline, CV, and sync surfaces without Supabase config', async ({
    page,
  }) => {
    await page.goto('/dashboard/');

    await expect(page.getByText('Configuration Supabase absente')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: "Missions détectées par l'extension" })
    ).toBeVisible();
    await expect(page.getByText('Aucune mission synchronisée')).toBeVisible();

    await page.getByRole('link', { name: 'Candidatures' }).click();
    await expect(page.getByPlaceholder('Rechercher mission, client ou plateforme')).toBeVisible();
    await expect(page.getByText('Aucune mission trouvée')).toBeVisible();

    await page.getByRole('link', { name: 'Profil CV' }).click();
    await expect(page.getByRole('heading', { name: 'CV principal' })).toBeVisible();
    await expect(page.getByText('Aucun CV canonique synchronisé')).toBeVisible();
    await expect(page.getByLabel('Titre du profil')).toBeVisible();

    await page.getByRole('link', { name: 'Synchronisation', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Synchronisation extension' })).toBeVisible();
    await expect(page.getByText('Alertes missions')).toBeVisible();
    await expect(page.getByText('Aucun appareil extension enregistré')).toBeVisible();
  });
});
