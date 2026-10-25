import { expect, test } from '@playwright/test';

test.describe('dashboard without backend configuration', () => {
  test('shows the local setup checklist and setup-only surfaces', async ({ page }) => {
    await page.goto('/dashboard/');

    await expect(page.getByRole('heading', { name: 'Pilotage missions' })).toBeVisible();
    await expect(page.getByText('Setup local', { exact: true })).toBeVisible();
    await expect(
      page.getByText(/Le dashboard connecté attend la configuration Supabase/)
    ).toBeVisible();

    const setupChecklist = page.getByRole('region', { name: 'Checklist de setup' });
    await expect(setupChecklist).toBeVisible();
    await expect(setupChecklist.getByText('Ouvrir le compte MissionPulse')).toBeVisible();
    await expect(setupChecklist.getByText("Relier l'extension Chrome")).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Candidatures' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'CV' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Synchronisation' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', /login/);
    await expect(page.getByLabel('Navigation dashboard')).toHaveCount(0);
  });

  test('keeps connected-data privacy controls out of the setup-only screen', async ({ page }) => {
    await page.goto('/dashboard/');

    await expect(page.getByRole('heading', { name: 'Pilotage missions' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Données connectées' })).toHaveCount(0);
    await expect(page.getByText('Suppression irréversible')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Export JSON' })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Supprimer les données connectées' })
    ).toHaveCount(0);
  });
});
