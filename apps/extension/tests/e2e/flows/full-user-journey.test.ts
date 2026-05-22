import { test, expect } from '@playwright/test';
import {
  SIDE_PANEL,
  mockNoProfile,
  completeOnboarding,
  waitForMissions,
  getFirstMissionCard,
  favoriteMission,
  feedSearchInput,
  hideMission,
  ensureFeedVisible,
  expectFeedReady,
  expectMissionCount,
  missionCards,
  navButton,
  toggleFavoritesFilter,
  showHiddenMissions,
  injectMissions,
  getDisplayedMissionCount,
  clearFeedSearch,
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

    await expect(page.getByRole('heading', { name: 'Affinez votre radar' })).toBeVisible({
      timeout: 5000,
    });

    // 2. Remplir le profil
    await completeOnboarding(page, {
      firstName: 'Jean',
      jobTitle: 'Développeur React Senior',
    });

    // 3. Arriver sur le feed
    await expect(page.getByText('Bonjour, Jean')).toBeVisible({ timeout: 3000 });
    await expectFeedReady(page);

    // 4. Lancer un scan (le scan auto démarre)
    // Attendre que le scan charge des missions
    await waitForMissions(page, 1, 10000);

    // 5. Voir des missions apparaître
    const initialCount = await getDisplayedMissionCount(page);
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // Injecter des missions supplémentaires pour les tests suivants
    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);

    // 6. Marquer une mission comme favorite
    const firstCard = await getFirstMissionCard(page);
    await favoriteMission(firstCard);

    // 7. Vérifier le compteur de favoris
    await toggleFavoritesFilter(page, true);
    await expectMissionCount(page, 1, 2000);

    // Retourner à toutes les missions
    await toggleFavoritesFilter(page, false);
    await expectMissionCount(page, 5, 2000);

    // 8. Masquer une mission
    const cardToHide = await getFirstMissionCard(page);
    await hideMission(cardToHide);

    // 9. Vérifier le filtre "masquées"
    // Le compteur doit avoir diminué
    await expectMissionCount(page, 4, 2000);

    // Le lien "Voir les masquées" doit apparaître
    await expect(page.getByRole('button', { name: /Voir les? \d+ mission.*masqu/i })).toBeVisible();

    // Afficher les missions masquées
    await showHiddenMissions(page);

    // On devrait revoir 5 missions
    await expectMissionCount(page, 5, 2000);

    // 10. Recharger la page → données persistées
    await page.reload();

    // Le profil doit être conservé (pas d'onboarding)
    await expect(page.getByText('Bonjour, Jean')).toBeVisible({ timeout: 3000 });
    await expectFeedReady(page);
  });

  test('user can favorite multiple missions and filter persists', async ({ page }) => {
    await ensureFeedVisible(page);

    // Injecter 10 missions
    await injectMissions(page, 10);
    await waitForMissions(page, 10, 5000);

    // Favoriser 3 missions
    for (let i = 0; i < 3; i++) {
      const card = missionCards(page).nth(i);
      await favoriteMission(card);
    }

    // Filtrer les favoris
    await toggleFavoritesFilter(page, true);
    await expectMissionCount(page, 3, 2000);

    // Recharger et vérifier que les favoris sont conservés
    await page.reload();

    // Attendre le chargement
    await expectFeedReady(page);

    // Le filtre revient à "toutes", mais les favoris sauvegardés restent disponibles.
    await expectMissionCount(page, 10, 5000);
    await toggleFavoritesFilter(page, true);
    await expectMissionCount(page, 3, 5000);
  });

  test('user can navigate through different views and back', async ({ page }) => {
    await ensureFeedVisible(page);

    // Injecter des missions
    await injectMissions(page, 3);
    await waitForMissions(page, 3, 5000);

    // Naviguer vers TJM
    await navButton(page, 'TJM').click();
    await expect(navButton(page, 'TJM')).toHaveAttribute('aria-current', 'page');

    // Naviguer vers Settings
    await navButton(page, 'Settings').click();
    await expect(navButton(page, 'Settings')).toHaveAttribute('aria-current', 'page');

    // Revenir au Feed
    await navButton(page, 'Feed').click();
    await expectFeedReady(page);

    // Les missions doivent toujours être là
    await expectMissionCount(page, 3, 3000);
  });

  test('user can search and favorite from search results', async ({ page }) => {
    await ensureFeedVisible(page);

    // Injecter des missions
    await injectMissions(page, 10);
    await waitForMissions(page, 10, 5000);

    // Mémoriser le nombre de missions
    const initialCount = 10;

    // Rechercher
    await feedSearchInput(page).fill('React');
    await page.waitForTimeout(500);

    // Vérifier qu'on a des résultats filtrés
    const filteredCount = await getDisplayedMissionCount(page);
    expect(filteredCount).toBeLessThanOrEqual(initialCount);

    // Vérifier que la recherche a bien filtré
    await expect(feedSearchInput(page)).toHaveValue('React');

    // Favoriser la première mission des résultats de recherche
    const firstResult = await getFirstMissionCard(page);
    await favoriteMission(firstResult);

    // Effacer la recherche
    await clearFeedSearch(page);
    await page.waitForTimeout(300);

    // Vérifier qu'on retrouve toutes les missions
    await expectMissionCount(page, initialCount, 2000);

    // Vérifier que le favori est toujours là
    await toggleFavoritesFilter(page, true);
    await expectMissionCount(page, 1, 2000);
  });

  test('hidden missions count shows correct number', async ({ page }) => {
    await ensureFeedVisible(page);

    // Injecter 8 missions
    await injectMissions(page, 8);
    await waitForMissions(page, 8, 5000);

    // Masquer 3 missions
    for (let i = 0; i < 3; i++) {
      const card = missionCards(page).first();
      await hideMission(card);
    }

    // Vérifier le compteur de masquées
    await expectMissionCount(page, 5, 2000);
    await expect(page.getByRole('button', { name: /Voir les 3 mission.*masqu/i })).toBeVisible();

    // Cliquer pour voir les masquées
    await showHiddenMissions(page);
    await expectMissionCount(page, 8, 2000);
  });
});
