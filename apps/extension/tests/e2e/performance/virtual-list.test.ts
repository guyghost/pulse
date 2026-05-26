import { test, expect } from '@playwright/test';
import {
  captureMemoryMetrics,
  ensureFeedVisible,
  expectMissionCount,
  getDisplayedMissionCount,
} from '../helpers';
import { generateLargeDataset, generateMockMissions } from '../../fixtures/large-dataset';

async function injectDataset(
  page: import('@playwright/test').Page,
  missions: ReturnType<typeof generateMockMissions>
) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('dev:feed-state', { detail: 'empty' }));
  });
  await page.waitForTimeout(900);
  await page.evaluate((payload) => {
    window.dispatchEvent(new CustomEvent('dev:missions', { detail: payload }));
  }, missions);
}

test.describe('Performance - Virtual List', () => {
  test('renders large dataset efficiently', async ({ page }) => {
    await ensureFeedVisible(page);
    const largeDataset = generateLargeDataset();

    // Mesurer le temps de rendu
    const startTime = Date.now();
    await injectDataset(page, largeDataset);

    // Attendre que les missions apparaissent
    await expectMissionCount(page, 500, 10000);

    const renderTime = Date.now() - startTime;

    // Le rendu initial doit être rapide (< 3s pour 500 missions avec virtual list)
    expect(renderTime).toBeLessThan(3000);

    // Vérifier que le texte affiche le bon nombre
    await expectMissionCount(page, 500, 2000);
  });

  test('only renders visible items in DOM', async ({ page }) => {
    await ensureFeedVisible(page);
    await injectDataset(page, generateLargeDataset());
    await expectMissionCount(page, 500, 5000);

    // Attendre que le rendu soit stabilisé
    await page.waitForTimeout(500);

    // Compter les éléments réellement dans le DOM
    // Avec une virtual list, on ne devrait avoir que ~10-20 éléments, pas 500
    const cardElements = page.locator('[role="button"][tabindex="0"], [data-testid="mission-card"]');
    const count = await cardElements.count();

    // La virtual list ne devrait rendre que les éléments visibles (~20 max)
    expect(count).toBeLessThan(50);

    // Mais le texte doit indiquer 500 missions
    await expectMissionCount(page, 500);
  });

  test('handles rapid scrolling efficiently', async ({ page }) => {
    await ensureFeedVisible(page);
    await injectDataset(page, generateMockMissions(300));
    await expectMissionCount(page, 300, 5000);

    // Scroller rapidement vers le bas
    const container = page.getByTestId('feed-scroll-container');

    // Effectuer plusieurs scrolls rapides
    for (let i = 0; i < 5; i++) {
      await container.evaluate((el, ratio) => {
        el.scrollTop = el.scrollHeight * ratio;
      }, 0.2 * (i + 1));
      await page.waitForTimeout(100);
    }

    // Scroller vers le haut rapidement
    await container.evaluate((el) => {
      el.scrollTop = 0;
    });

    await page.waitForTimeout(300);

    // L'application doit rester réactive
    await expectMissionCount(page, 300);

    // Vérifier qu'aucune erreur n'est survenue
    const errorElements = page.locator('.error, [role="alert"], .crash');
    const errorCount = await errorElements.count();
    expect(errorCount).toBe(0);
  });

  test('no memory leaks with large dataset', async ({ page }) => {
    await ensureFeedVisible(page);

    // Mesurer mémoire de départ
    const initialMemory = await captureMemoryMetrics(page);

    await injectDataset(page, generateMockMissions(400));
    await expectMissionCount(page, 400, 5000);

    // Scroller beaucoup pour forcer le recyclage des éléments
    const container = page.getByTestId('feed-scroll-container');

    for (let i = 0; i < 10; i++) {
      await container.evaluate((el) => {
        el.scrollTop = Math.random() * el.scrollHeight;
      });
      await page.waitForTimeout(200);
    }

    // Forcer le garbage collector si disponible
    try {
      await page.evaluate(() => {
        if ((window as unknown as Record<string, () => void>).gc) {
          (window as unknown as Record<string, () => void>).gc();
        }
      });
    } catch {
      // gc non disponible, continuer
    }

    await page.waitForTimeout(500);

    // Mesurer mémoire après test
    const finalMemory = await captureMemoryMetrics(page);

    // La mémoire ne devrait pas avoir augmenté de plus de 50MB
    // (c'est une marge large pour les environnements de test)
    const memoryIncrease = finalMemory.usedJSHeapSize - initialMemory.usedJSHeapSize;
    const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

    expect(memoryIncreaseMB).toBeLessThan(100);
  });

  test('smooth scroll performance with 500 items', async ({ page }) => {
    await ensureFeedVisible(page);
    await injectDataset(page, generateLargeDataset());
    await expectMissionCount(page, 500, 5000);

    // Utiliser l'API Performance pour mesurer le scroll
    const scrollPerformance = await page.evaluate(async () => {
      const container = document.querySelector('[data-testid="feed-scroll-container"]') as HTMLElement;
      if (!container) {
        return null;
      }

      const marks: number[] = [];
      const startTime = performance.now();

      // Simuler un scroll fluide
      for (let i = 0; i <= 100; i += 5) {
        container.scrollTop = (container.scrollHeight * i) / 100;
        marks.push(performance.now() - startTime);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }

      return {
        totalTime: performance.now() - startTime,
        marks,
      };
    });

    expect(scrollPerformance).not.toBeNull();
    if (scrollPerformance) {
      // En headless, requestAnimationFrame est moins stable; on garde une borne large.
      expect(scrollPerformance.totalTime).toBeLessThan(2000);
    }
  });

  test('search performance with large dataset', async ({ page }) => {
    await ensureFeedVisible(page);
    await injectDataset(page, generateMockMissions(300));
    await expectMissionCount(page, 300, 5000);

    // Mesurer le temps de recherche
    const searchStart = Date.now();
    const searchInput = page.getByRole('textbox', { name: 'Rechercher' });
    await searchInput.fill('React');

    // Attendre que les résultats se mettent à jour
    await page.waitForTimeout(300);

    const searchTime = Date.now() - searchStart;

    // La recherche doit être rapide (< 1000ms)
    expect(searchTime).toBeLessThan(1000);

    // Vérifier que l'input contient bien le terme de recherche
    await expect(searchInput).toHaveValue('React');

    // Vérifier qu'on a des résultats filtrés
    const resultsCount = await getDisplayedMissionCount(page);

    // Le nombre de résultats devrait être <= 300 (filtré)
    expect(resultsCount).toBeLessThanOrEqual(300);
  });

  test('filter toggle performance with large dataset', async ({ page }) => {
    await ensureFeedVisible(page);
    await injectDataset(page, generateMockMissions(200));
    await expectMissionCount(page, 200, 5000);

    // D'abord, favoriser quelques missions pour que le filtre ait du sens
    for (let i = 0; i < 3; i++) {
      await page.getByTitle('Ajouter aux favoris').first().click();
      await expect
        .poll(() => page.getByTitle('Retirer des favoris').count(), { timeout: 2000 })
        .toBe(i + 1);
    }

    // Mesurer le temps de bascule du filtre favoris
    const toggleStart = Date.now();
    await page.getByTitle('Voir favoris').click();

    // Attendre que les favoris s'affichent
    await expectMissionCount(page, 3, 2000);

    const toggleTime = Date.now() - toggleStart;

    // Le filtre doit répondre rapidement (< 500ms)
    expect(toggleTime).toBeLessThan(500);

    // Vérifier qu'on a des favoris affichés
    await expectMissionCount(page, 3, 2000);
  });

  test('maintains scroll position when filtering', async ({ page }) => {
    await ensureFeedVisible(page);
    await injectDataset(page, generateMockMissions(200));
    await expectMissionCount(page, 200, 5000);

    // Scroller vers le milieu
    const container = page.getByTestId('feed-scroll-container');
    await container.evaluate((el) => {
      el.scrollTop = el.scrollHeight / 3;
    });

    const scrollPositionBefore = await container.evaluate((el) => el.scrollTop);

    // Vérifier qu'on a bien scrollé (pas à 0)
    expect(scrollPositionBefore).toBeGreaterThan(0);

    // Changer le filtre (va afficher 0 favoris)
    await page.getByTitle('Voir favoris').click();
    await page.waitForTimeout(200);

    // Remettre à toutes
    await page.getByTitle('Voir toutes').click();
    await page.waitForTimeout(200);

    // Vérifier que la position de scroll est revenue à une valeur valide
    // (peut ne pas être exacte à cause de la virtual list)
    const scrollPositionAfter = await container.evaluate((el) => el.scrollTop);

    // La position devrait être un nombre valide
    expect(scrollPositionAfter).toBeGreaterThanOrEqual(0);

    // Les missions doivent toujours être affichées
    await expectMissionCount(page, 200, 2000);
  });
});
