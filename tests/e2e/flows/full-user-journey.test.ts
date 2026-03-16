import { test, expect } from '@playwright/test';
import {
  SIDE_PANEL,
  mockNoProfile,
  completeOnboarding,
  waitForMissions,
  getFirstMissionCard,
  favoriteMission,
  hideMission,
  toggleFavoritesFilter,
  showHiddenMissions,
  injectMissions,
  triggerScan,
} from '../helpers';

test.describe('Full User Journey', () => {
  test.beforeEach(async ({ page }) => {
    // Cleanup: réinitialiser l'état avant chaque test
    await page.goto('about:blank');
  });

  test('complete user journey from onboarding to feed interactions', async ({ page }) => {
    // 1. Première ouverture → onboarding affiché
    await mockNoProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(page.getByText('Configurez en 30 secondes')).toBeVisible({ timeout: 5000 });

    // 2. Remplir le profil
    await completeOnboarding(page, {
      firstName: 'Jean',
      jobTitle: 'Développeur React Senior',
    });

    // 3. Arriver sur le feed
    await expect(page.getByText('Bonjour, Jean')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Missions')).toBeVisible();

    // 4. Lancer un scan (le scan auto démarre)
    // Attendre que le scan charge des missions
    await waitForMissions(page, 1, 10000);

    // 5. Voir des missions apparaître
    const initialCount = await page.locator('text=/\\d+ mission/').textContent();
    expect(initialCount).toMatch(/\d+ mission/);

    // Injecter des missions supplémentaires pour les tests suivants
    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);

    // 6. Marquer une mission comme favorite
    const firstCard = await getFirstMissionCard(page);
    await favoriteMission(firstCard);

    // 7. Vérifier le compteur de favoris
    await toggleFavoritesFilter(page, true);
    await expect(page.getByText('1 mission')).toBeVisible({ timeout: 2000 });

    // Retourner à toutes les missions
    await toggleFavoritesFilter(page, false);
    await expect(page.getByText('5 missions')).toBeVisible({ timeout: 2000 });

    // 8. Masquer une mission
    const cardToHide = await getFirstMissionCard(page);
    await hideMission(cardToHide);

    // 9. Vérifier le filtre "masquées"
    // Le compteur doit avoir diminué
    await expect(page.getByText('4 missions')).toBeVisible({ timeout: 2000 });

    // Le lien "Voir les masquées" doit apparaître
    await expect(page.getByText(/Voir les? \d+ masquee/)).toBeVisible();

    // Afficher les missions masquées
    await showHiddenMissions(page);

    // On devrait revoir 5 missions
    await expect(page.getByText('5 missions')).toBeVisible({ timeout: 2000 });

    // 10. Recharger la page → données persistées
    await page.reload();

    // Le profil doit être conservé (pas d'onboarding)
    await expect(page.getByText('Bonjour, Jean')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Missions')).toBeVisible();
  });

  test('user can favorite multiple missions and filter persists', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Injecter 10 missions
    await injectMissions(page, 10);
    await waitForMissions(page, 10, 5000);

    // Favoriser 3 missions
    for (let i = 0; i < 3; i++) {
      const card = page.locator('[role="button"]').nth(i);
      await favoriteMission(card);
    }

    // Filtrer les favoris
    await toggleFavoritesFilter(page, true);
    await expect(page.getByText('3 missions')).toBeVisible({ timeout: 2000 });

    // Recharger et vérifier que les favoris sont conservés
    await page.reload();

    // Attendre le chargement
    await expect(page.getByText('Missions')).toBeVisible();

    // Vérifier que le filtre favoris est toujours actif
    await expect(page.getByText('3 missions')).toBeVisible({ timeout: 5000 });
  });

  test('user can navigate through different views and back', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Injecter des missions
    await injectMissions(page, 3);
    await waitForMissions(page, 3, 5000);

    // Naviguer vers TJM
    await page.getByRole('button', { name: 'TJM' }).click();
    await expect(page.getByRole('button', { name: 'TJM' })).toHaveAttribute('aria-current', 'page');

    // Naviguer vers Settings
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');

    // Revenir au Feed
    await page.getByRole('button', { name: 'Feed' }).click();
    await expect(page.getByText('Missions')).toBeVisible();

    // Les missions doivent toujours être là
    await expect(page.getByText('3 missions')).toBeVisible({ timeout: 3000 });
  });

  test('user can search and favorite from search results', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Injecter des missions
    await injectMissions(page, 10);
    await waitForMissions(page, 10, 5000);

    // Rechercher
    await page.getByPlaceholder('Rechercher...').fill('React');
    await page.waitForTimeout(500);

    // Vérifier qu'on a des résultats
    const missionText = await page.locator('text=/\\d+ mission/').textContent();
    expect(missionText).toMatch(/\d+ mission/);

    // Favoriser la première mission des résultats de recherche
    const firstResult = await getFirstMissionCard(page);
    await favoriteMission(firstResult);

    // Effacer la recherche
    await page.getByPlaceholder('Rechercher...').clear();
    await page.waitForTimeout(300);

    // Vérifier que le favori est toujours là
    await toggleFavoritesFilter(page, true);
    await expect(page.getByText('1 mission')).toBeVisible({ timeout: 2000 });
  });

  test('hidden missions count shows correct number', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Injecter 8 missions
    await injectMissions(page, 8);
    await waitForMissions(page, 8, 5000);

    // Masquer 3 missions
    for (let i = 0; i < 3; i++) {
      const card = page.locator('[role="button"]').first();
      await hideMission(card);
    }

    // Vérifier le compteur de masquées
    await expect(page.getByText('5 missions')).toBeVisible({ timeout: 2000 });
    await expect(page.getByText(/Voir les 3 masqu/)).toBeVisible();

    // Cliquer pour voir les masquées
    await showHiddenMissions(page);
    await expect(page.getByText('8 missions')).toBeVisible({ timeout: 2000 });
  });
});
