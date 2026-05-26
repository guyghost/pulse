import { test, expect } from '@playwright/test';
import {
  SIDE_PANEL,
  clearAndInjectMissions,
  completeOnboarding,
  ensureFeedVisible,
  expectMissionCount,
  getDisplayedMissionCount,
  resetStoredMissionState,
  toggleFavoritesFilter,
  showHiddenMissions,
  injectMissions,
  mockNoProfile,
  waitForMissions,
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

    await expect(page.getByRole('heading', { name: 'Le cockpit freelance' })).toBeVisible({
      timeout: 5000,
    });

    // 2. Remplir le profil
    await completeOnboarding(page, {
      firstName: 'Jean',
      jobTitle: 'Développeur React Senior',
    });

    // 3. Arriver sur le feed
    await expect(page.getByText('Bonjour, Jean')).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('region', { name: /Missions tri/i })).toBeVisible();

    // 4. Lancer un scan (le scan auto démarre)
    // Attendre que le scan charge des missions
    await waitForMissions(page, 1, 10000);

    // 5. Voir des missions apparaître
    await expect.poll(() => getDisplayedMissionCount(page), { timeout: 5000 }).toBeGreaterThan(0);
    const initialCount = await getDisplayedMissionCount(page);
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // Injecter des missions supplémentaires pour les tests suivants
    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);

    // 6. Marquer une mission comme favorite
    await page.getByTitle('Ajouter aux favoris').first().click();
    await expect
      .poll(() => page.getByTitle('Retirer des favoris').count(), { timeout: 2000 })
      .toBeGreaterThan(0);

    // 7. Vérifier le compteur de favoris
    await toggleFavoritesFilter(page, true);
    await expectMissionCount(page, 1, 2000);

    // Retourner à toutes les missions
    await toggleFavoritesFilter(page, false);
    await expectMissionCount(page, 5, 2000);

    // 8. Masquer une mission
    await page.getByTitle('Masquer').first().click();
    await expectMissionCount(page, 4, 2000);

    // 9. Vérifier le filtre "masquées"
    // Le lien "Voir les masquées" doit apparaître
    await expect(page.getByRole('button', { name: /Voir les \d+ mission/ })).toBeVisible();

    // Afficher les missions masquées
    await showHiddenMissions(page);

    // On devrait revoir 5 missions
    await expectMissionCount(page, 5, 2000);

    // 10. Recharger la page → données persistées
    await page.reload();

    // Le profil doit être conservé (pas d'onboarding)
    await expect(page.getByText('Bonjour, Jean')).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('region', { name: /Missions tri/i })).toBeVisible();
  });

  test('user can favorite multiple missions and filter persists', async ({ page }) => {
    await ensureFeedVisible(page);
    await resetStoredMissionState(page);
    await page.reload();
    await ensureFeedVisible(page);

    // Utiliser le jeu de missions persistant du mode dev pour tester le reload.
    await waitForMissions(page, 5, 10000);

    // Favoriser 3 missions
    for (let i = 0; i < 3; i++) {
      await page.getByTitle('Ajouter aux favoris').first().click();
      await expect
        .poll(() => page.getByTitle('Retirer des favoris').count(), { timeout: 2000 })
        .toBe(i + 1);
    }

    // Filtrer les favoris
    await toggleFavoritesFilter(page, true);
    await expectMissionCount(page, 3, 2000);

    // Recharger et vérifier que les favoris sont conservés
    await page.reload();

    // Attendre le chargement
    await expect(page.getByRole('region', { name: /Missions tri/i })).toBeVisible();

    // Les favoris persistent; le filtre lui-même n'est pas stocké.
    await toggleFavoritesFilter(page, true);
    await expectMissionCount(page, 3, 5000);
  });

  test('user can navigate through different views and back', async ({ page }) => {
    await ensureFeedVisible(page);

    // Injecter des missions
    await clearAndInjectMissions(page, 3);

    // Naviguer vers TJM
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'TJM' }).click();
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'TJM' })
    ).toHaveAttribute('aria-current', 'page');

    // Naviguer vers Settings
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Settings' })
      .click();
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Settings' })
    ).toHaveAttribute(
      'aria-current',
      'page'
    );

    // Revenir au Feed
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Feed' }).click();
    await expect(page.getByRole('region', { name: /Missions tri/i })).toBeVisible();

    // Le feed doit se réafficher avec des missions utilisables.
    await waitForMissions(page, 1, 3000);
  });

  test('user can search and favorite from search results', async ({ page }) => {
    await ensureFeedVisible(page);

    // Injecter des missions
    await clearAndInjectMissions(page, 10);

    // Mémoriser le nombre de missions
    const initialCount = 10;

    // Rechercher
    const searchInput = page.getByRole('textbox', { name: 'Rechercher' });
    await searchInput.fill('React');
    await page.waitForTimeout(500);

    // Vérifier qu'on a des résultats filtrés
    const filteredCount = await getDisplayedMissionCount(page);
    expect(filteredCount).toBeLessThanOrEqual(initialCount);

    // Vérifier que la recherche a bien filtré
    await expect(searchInput).toHaveValue('React');

    // Favoriser la première mission des résultats de recherche
    await page.getByTitle('Ajouter aux favoris').first().click();
    await expect
      .poll(() => page.getByTitle('Retirer des favoris').count(), { timeout: 2000 })
      .toBeGreaterThan(0);

    // Effacer la recherche
    await searchInput.clear();
    await page.waitForTimeout(300);

    // Vérifier qu'on retrouve toutes les missions
    await expectMissionCount(page, initialCount, 2000);

    // Vérifier que le favori est toujours là
    await toggleFavoritesFilter(page, true);
    await expectMissionCount(page, 1, 2000);
  });

  test('hidden missions count shows correct number', async ({ page }) => {
    await ensureFeedVisible(page);
    await resetStoredMissionState(page);
    await page.reload();
    await ensureFeedVisible(page);

    // Injecter 8 missions
    await clearAndInjectMissions(page, 8);

    // Masquer 3 missions
    let remainingCount = 8;
    for (let i = 0; i < 3; i++) {
      await page.locator('button[title="Masquer"]').first().click();
      remainingCount -= 1;
      await expectMissionCount(page, remainingCount, 3000);
    }

    // Vérifier le compteur de masquées
    await expectMissionCount(page, 5, 2000);
    await expect(page.getByRole('button', { name: /Voir les 3 mission/ })).toBeVisible();

    // Cliquer pour voir les masquées
    await showHiddenMissions(page);
    await expectMissionCount(page, 8, 2000);
  });
});
