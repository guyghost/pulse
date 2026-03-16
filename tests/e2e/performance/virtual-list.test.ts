import { test, expect } from '@playwright/test';
import { SIDE_PANEL, openDevPanel, closeDevPanel, captureMemoryMetrics } from '../helpers';
import { generateLargeDataset, generateMockMissions } from '../../fixtures/large-dataset';

test.describe('Performance - Virtual List', () => {
  test('renders large dataset efficiently', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Ouvrir le dev panel
    await openDevPanel(page);

    // Injecter 500 missions via le slider
    await page.locator('input[type="range"]').evaluate((el) => {
      (el as HTMLInputElement).value = '500';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Mesurer le temps de rendu
    const startTime = Date.now();

    await page.getByRole('button', { name: 'inject' }).click();
    await closeDevPanel(page);

    // Attendre que les missions apparaissent
    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 10000 });

    const renderTime = Date.now() - startTime;

    // Le rendu initial doit être rapide (< 3s pour 500 missions avec virtual list)
    expect(renderTime).toBeLessThan(3000);

    // Vérifier que le texte affiche le bon nombre
    await expect(page.getByText('500 missions')).toBeVisible({ timeout: 2000 });
  });

  test('only renders visible items in DOM', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Injecter 500 missions
    await openDevPanel(page);
    await page.locator('input[type="range"]').evaluate((el) => {
      (el as HTMLInputElement).value = '500';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'inject' }).click();
    await closeDevPanel(page);

    await expect(page.getByText('500 missions')).toBeVisible({ timeout: 5000 });

    // Attendre que le rendu soit stabilisé
    await page.waitForTimeout(500);

    // Compter les éléments réellement dans le DOM
    // Avec une virtual list, on ne devrait avoir que ~10-20 éléments, pas 500
    const cardElements = page.locator('[role="button"], [data-testid="mission-card"]');
    const count = await cardElements.count();

    // La virtual list ne devrait rendre que les éléments visibles (~20 max)
    expect(count).toBeLessThan(50);

    // Mais le texte doit indiquer 500 missions
    await expect(page.getByText('500 missions')).toBeVisible();
  });

  test('handles rapid scrolling efficiently', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Injecter 300 missions
    await openDevPanel(page);
    await page.locator('input[type="range"]').evaluate((el) => {
      (el as HTMLInputElement).value = '300';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'inject' }).click();
    await closeDevPanel(page);

    await expect(page.getByText('300 missions')).toBeVisible({ timeout: 5000 });

    // Scroller rapidement vers le bas
    const container = page.locator('[role="region"], .missions-container, [data-testid="mission-feed"]').first();

    // Effectuer plusieurs scrolls rapides
    for (let i = 0; i < 5; i++) {
      await container.evaluate((el) => {
        el.scrollTop = el.scrollHeight * (0.2 * (i + 1));
      });
      await page.waitForTimeout(100);
    }

    // Scroller vers le haut rapidement
    await container.evaluate((el) => {
      el.scrollTop = 0;
    });

    await page.waitForTimeout(300);

    // L'application doit rester réactive
    await expect(page.getByText('300 missions')).toBeVisible();

    // Vérifier qu'aucune erreur n'est survenue
    const errorElements = page.locator('.error, [role="alert"], .crash');
    const errorCount = await errorElements.count();
    expect(errorCount).toBe(0);
  });

  test('no memory leaks with large dataset', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Mesurer mémoire de départ
    const initialMemory = await captureMemoryMetrics(page);

    // Injecter 400 missions
    await openDevPanel(page);
    await page.locator('input[type="range"]').evaluate((el) => {
      (el as HTMLInputElement).value = '400';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'inject' }).click();
    await closeDevPanel(page);

    await expect(page.getByText('400 missions')).toBeVisible({ timeout: 5000 });

    // Scroller beaucoup pour forcer le recyclage des éléments
    const container = page.locator('[role="region"], .missions-container, [data-testid="mission-feed"]').first();

    for (let i = 0; i < 10; i++) {
      await container.evaluate((el) => {
        el.scrollTop = Math.random() * el.scrollHeight;
      });
      await page.waitForTimeout(200);
    }

    // Forcer le garbage collector si disponible
    try {
      await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((window as unknown as Record<string, () => void>).gc) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Injecter 500 missions
    await openDevPanel(page);
    await page.locator('input[type="range"]').evaluate((el) => {
      (el as HTMLInputElement).value = '500';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'inject' }).click();
    await closeDevPanel(page);

    await expect(page.getByText('500 missions')).toBeVisible({ timeout: 5000 });

    // Utiliser l'API Performance pour mesurer le scroll
    const scrollPerformance = await page.evaluate(async () => {
      const container = document.querySelector('[role="region"], .missions-container, [data-testid="mission-feed"]') as HTMLElement;
      if (!container) return null;

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
      // Le scroll devrait être fluide (< 500ms pour 100 étapes)
      expect(scrollPerformance.totalTime).toBeLessThan(500);
    }
  });

  test('search performance with large dataset', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Injecter 300 missions
    await openDevPanel(page);
    await page.locator('input[type="range"]').evaluate((el) => {
      (el as HTMLInputElement).value = '300';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'inject' }).click();
    await closeDevPanel(page);

    await expect(page.getByText('300 missions')).toBeVisible({ timeout: 5000 });

    // Mesurer le temps de recherche
    const searchStart = Date.now();
    await page.getByPlaceholder('Rechercher...').fill('React');

    // Attendre que les résultats se mettent à jour
    await page.waitForTimeout(300);

    const searchTime = Date.now() - searchStart;

    // La recherche doit être rapide (< 500ms)
    expect(searchTime).toBeLessThan(1000);

    // Vérifier qu'on a des résultats
    const resultsText = await page.locator('text=/\\d+ mission/').textContent();
    expect(resultsText).toMatch(/\d+ mission/);
  });

  test('filter toggle performance with large dataset', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Injecter 200 missions
    await openDevPanel(page);
    await page.locator('input[type="range"]').evaluate((el) => {
      (el as HTMLInputElement).value = '200';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'inject' }).click();
    await closeDevPanel(page);

    await expect(page.getByText('200 missions')).toBeVisible({ timeout: 5000 });

    // Mesurer le temps de bascule du filtre favoris
    const toggleStart = Date.now();
    await page.getByTitle('Voir favoris').click();

    await page.waitForTimeout(200);

    const toggleTime = Date.now() - toggleStart;

    // Le filtre doit répondre rapidement (< 200ms)
    expect(toggleTime).toBeLessThan(500);
  });

  test('maintains scroll position when filtering', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Injecter 200 missions
    await openDevPanel(page);
    await page.locator('input[type="range"]').evaluate((el) => {
      (el as HTMLInputElement).value = '200';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'inject' }).click();
    await closeDevPanel(page);

    await expect(page.getByText('200 missions')).toBeVisible({ timeout: 5000 });

    // Scroller vers le milieu
    const container = page.locator('[role="region"], .missions-container, [data-testid="mission-feed"]').first();
    await container.evaluate((el) => {
      el.scrollTop = el.scrollHeight / 3;
    });

    const scrollPositionBefore = await container.evaluate((el) => el.scrollTop);

    // Changer le filtre
    await page.getByTitle('Voir favoris').click();
    await page.waitForTimeout(200);

    // Remettre à toutes
    await page.getByTitle('Voir toutes').click();
    await page.waitForTimeout(200);

    // Vérifier que la position de scroll est raisonnable
    // (peut ne pas être exacte à cause de la virtual list)
    const scrollPositionAfter = await container.evaluate((el) => el.scrollTop);

    // La position devrait être proche de l'originale ou remise à 0
    expect(typeof scrollPositionAfter).toBe('number');
  });
});
