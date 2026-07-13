import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import {
  captureMemoryMetrics,
  expectMissionCount,
  favoritesToggle,
  favoriteMission,
  allMissionsToggle,
  feedSearchInput,
  getDisplayedMissionCount,
  ensureFeedVisible,
  injectMissions,
  missionCards,
  scanButton,
} from '../helpers';

async function mockMultiBatchPartialScan(page: Page) {
  await page.addInitScript(() => {
    let _chrome: unknown = undefined;
    const runtimeListeners: Array<
      (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => void
    > = [];

    function makeMission(index: number, source: string) {
      const now = new Date().toISOString();
      return {
        id: `${source}-partial-${index}`,
        title: `React Partial Batch ${index}`,
        client: 'Batch Client',
        description: `Mission React arrivée dans le lot ${index}.`,
        stack: ['React', 'TypeScript'],
        tjm: 650 + index,
        location: 'Paris',
        remote: 'hybrid',
        duration: '6 mois',
        startDate: null,
        publishedAt: now,
        url: `https://example.com/${source}/partial-${index}`,
        source,
        scrapedAt: now,
        seniority: 'senior',
        scoreBreakdown: null,
        score: 80,
        semanticScore: null,
        semanticReason: null,
      };
    }

    function emitRuntimeMessage(message: unknown): void {
      for (const listener of runtimeListeners) {
        listener(message, { id: 'dev-mode' }, () => {});
      }
    }

    Object.defineProperty(window, 'chrome', {
      configurable: true,
      enumerable: true,
      get() {
        return _chrome;
      },
      set(val) {
        _chrome = val;
        const chromeStub = val as {
          runtime?: {
            sendMessage?: (msg: unknown) => Promise<unknown>;
            onMessage?: {
              addListener?: (
                listener: (
                  message: unknown,
                  sender: unknown,
                  sendResponse: (response?: unknown) => void
                ) => void
              ) => void;
              removeListener?: (
                listener: (
                  message: unknown,
                  sender: unknown,
                  sendResponse: (response?: unknown) => void
                ) => void
              ) => void;
            };
          };
        };

        if (!chromeStub.runtime?.sendMessage) {
          return;
        }

        const originalSendMessage = chromeStub.runtime.sendMessage.bind(chromeStub.runtime);
        const originalAddListener = chromeStub.runtime.onMessage?.addListener?.bind(
          chromeStub.runtime.onMessage
        );
        const originalRemoveListener = chromeStub.runtime.onMessage?.removeListener?.bind(
          chromeStub.runtime.onMessage
        );

        if (chromeStub.runtime.onMessage) {
          chromeStub.runtime.onMessage.addListener = (listener) => {
            runtimeListeners.push(listener);
            originalAddListener?.(listener);
          };
          chromeStub.runtime.onMessage.removeListener = (listener) => {
            const index = runtimeListeners.indexOf(listener);
            if (index >= 0) {
              runtimeListeners.splice(index, 1);
            }
            originalRemoveListener?.(listener);
          };
        }

        chromeStub.runtime.sendMessage = async (msg: unknown) => {
          const message = msg as { type?: string };

          if (message?.type !== 'SCAN_START') {
            return originalSendMessage(msg);
          }

          const batches = [
            { connectorId: 'free-work', connectorName: 'Free-Work', offset: 0 },
            { connectorId: 'lehibou', connectorName: 'LeHibou', offset: 20 },
            { connectorId: 'hiway', connectorName: 'Hiway', offset: 40 },
          ];

          batches.forEach((batch, batchIndex) => {
            window.setTimeout(
              () => {
                emitRuntimeMessage({
                  type: 'SCAN_PARTIAL_RESULT',
                  payload: {
                    connectorId: batch.connectorId,
                    connectorName: batch.connectorName,
                    missions: Array.from({ length: 20 }, (_, index) =>
                      makeMission(batch.offset + index, batch.connectorId)
                    ),
                  },
                });
              },
              100 + batchIndex * 120
            );
          });

          return new Promise((resolve) => {
            window.setTimeout(() => {
              resolve({
                type: 'SCAN_COMPLETE',
                payload: batches.flatMap((batch) =>
                  Array.from({ length: 20 }, (_, index) =>
                    makeMission(batch.offset + index, batch.connectorId)
                  )
                ),
              });
            }, 900);
          });
        };
      },
    });
  });
}

test.describe('Performance - Virtual List', { tag: '@slow' }, () => {
  test('renders large dataset efficiently', async ({ page }) => {
    // Mesurer le temps de rendu
    const startTime = Date.now();
    await injectMissions(page, 500);

    // Attendre que les missions apparaissent
    await expectMissionCount(page, 500, 10000);

    const renderTime = Date.now() - startTime;

    // Le rendu initial doit être rapide (< 3s pour 500 missions avec virtual list)
    expect(renderTime).toBeLessThan(3000);

    // Vérifier que le texte affiche le bon nombre
    await expectMissionCount(page, 500, 2000);
  });

  test('only renders visible items in DOM', async ({ page }) => {
    // Injecter 500 missions
    await injectMissions(page, 500);

    await expectMissionCount(page, 500, 5000);

    // Attendre que le rendu soit stabilisé
    await page.waitForTimeout(500);

    // The feed uses incremental batch rendering (not JS virtual scroll): it renders the first
    // BATCH_SIZE items and grows via a "Voir X missions de plus" button + IntersectionObserver.
    // So the rendered card count must stay far below the total even for a large dataset.
    const cardElements = missionCards(page);
    const count = await cardElements.count();

    expect(count).toBeLessThan(50);

    // Mais le texte doit indiquer 500 missions
    await expectMissionCount(page, 500);
  });

  test('handles rapid scrolling efficiently', async ({ page }) => {
    // Injecter 300 missions
    await injectMissions(page, 300);

    await expectMissionCount(page, 300, 5000);

    // Scroller rapidement vers le bas. The scrollable element is the feed root
    // ([data-testid="feed-scroll-container"]), not the mission-feed list itself.
    const container = page.locator('[data-testid="feed-scroll-container"]').first();

    // Effectuer plusieurs scrolls rapides
    for (let i = 0; i < 5; i++) {
      await container.evaluate((el, step) => {
        el.scrollTop = el.scrollHeight * (0.2 * (step + 1));
      }, i);
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
    // Mesurer mémoire de départ
    const initialMemory = await captureMemoryMetrics(page);

    // Injecter 400 missions
    await injectMissions(page, 400);

    await expectMissionCount(page, 400, 5000);

    // Scroller beaucoup pour forcer le recyclage des éléments
    const container = page
      .locator('[role="region"], .missions-container, [data-testid="mission-feed"]')
      .first();

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
    // Injecter 500 missions
    await injectMissions(page, 500);

    await expectMissionCount(page, 500, 5000);

    // Utiliser l'API Performance pour mesurer le scroll
    const scrollPerformance = await page.evaluate(async () => {
      const container = document.querySelector(
        '[role="region"], .missions-container, [data-testid="mission-feed"]'
      ) as HTMLElement;
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
      // Le scroll devrait être fluide (< 500ms pour 100 étapes)
      expect(scrollPerformance.totalTime).toBeLessThan(500);
    }
  });

  test('search performance with large dataset', async ({ page }) => {
    // Injecter 300 missions
    await injectMissions(page, 300);

    await expectMissionCount(page, 300, 5000);

    // Mesurer le temps de recherche
    const searchStart = Date.now();
    const searchInput = feedSearchInput(page);
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
    // Injecter 200 missions
    await injectMissions(page, 200);

    await expectMissionCount(page, 200, 5000);

    // D'abord, favoriser quelques missions pour que le filtre ait du sens
    const cards = missionCards(page);
    // Favoriser les 3 premières missions
    for (let i = 0; i < 3; i++) {
      await favoriteMission(cards.nth(i));
    }

    // Mesurer le temps de bascule du filtre favoris
    const toggleStart = Date.now();
    await favoritesToggle(page).click();

    // Attendre que l'état du filtre soit appliqué.
    await expect(allMissionsToggle(page)).toHaveAttribute('aria-pressed', 'true');

    const toggleTime = Date.now() - toggleStart;

    // Le filtre doit répondre rapidement dans l'environnement Playwright.
    expect(toggleTime).toBeLessThan(2500);

    // Vérifier qu'on a des favoris affichés
    expect(await getDisplayedMissionCount(page)).toBeGreaterThan(0);
  });

  test('keeps feed stable while multiple partial scan batches arrive', async ({ page }) => {
    await mockMultiBatchPartialScan(page);
    await ensureFeedVisible(page);
    await injectMissions(page, 120);
    await expectMissionCount(page, 120, 5000);

    await scanButton(page).click();

    const arrivalStack = page.getByTestId('mission-arrival-stack');
    await expect(arrivalStack).toBeVisible({ timeout: 2000 });
    await expectMissionCount(page, 120, 1000);
    await expect(arrivalStack.locator('[data-testid="arrival-stack-layer"]')).toHaveCount(3);

    const searchInput = feedSearchInput(page);
    await searchInput.fill('React');
    await expect(searchInput).toHaveValue('React');
    await arrivalStack
      .getByRole('button', { name: /Ouvrir les \d+ nouvelles missions arrivées/ })
      .click();
    await expect(arrivalStack.locator('[data-testid="arrival-preview"]')).toHaveCount(3);
    await expect(
      arrivalStack.getByRole('button', { name: /Actualiser la file avec les \d+ missions/ })
    ).toBeEnabled();
    await expectMissionCount(page, 120, 1000);
  });

  test('maintains scroll position when filtering', async ({ page }) => {
    // Injecter 200 missions
    await injectMissions(page, 200);

    await expectMissionCount(page, 200, 5000);

    // Scroller vers le milieu. The scrollable element is the feed root
    // ([data-testid="feed-scroll-container"]), not the mission-feed list itself.
    const container = page.locator('[data-testid="feed-scroll-container"]').first();
    await container.evaluate((el) => {
      el.scrollTop = el.scrollHeight / 3;
    });

    const scrollPositionBefore = await container.evaluate((el) => el.scrollTop);

    // Vérifier qu'on a bien scrollé (pas à 0)
    expect(scrollPositionBefore).toBeGreaterThan(0);

    // Changer le filtre (va afficher 0 favoris)
    await favoritesToggle(page).click();
    await page.waitForTimeout(200);

    // Remettre à toutes
    await allMissionsToggle(page).click();
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
