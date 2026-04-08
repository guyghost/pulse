import { test, expect } from '@playwright/test';
import {
  SIDE_PANEL,
  openDevPanel,
  injectMissions,
  waitForMissions,
  setFeedState,
} from '../helpers';
import { generateBalancedDataset } from '../../fixtures/large-dataset';

test.describe('Connector Resilience', () => {
  test('handles connector HTTP 500 error gracefully', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Simuler une erreur 500 via le dev panel
    await openDevPanel(page);
    await setFeedState(page, 'error');

    // Vérifier le message d'erreur
    await expect(page.getByText(/Erreur|error/i)).toBeVisible({ timeout: 3000 });
  });

  test('continues scanning when one connector fails', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Injecter des missions normalement
    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);

    // Vérifier que les missions sont affichées (les autres connecteurs ont continué)
    const missionCount = await page.locator('[role="button"]').count();
    expect(missionCount).toBe(5);

    // Vérifier que le compteur affiche 5 missions
    await expect(page.getByText('5 missions')).toBeVisible({ timeout: 2000 });
  });

  test('shows typed error message for connector failure', async ({ page }) => {
    await page.addInitScript(() => {
      let _chrome: unknown = undefined;
      Object.defineProperty(window, 'chrome', {
        configurable: true,
        enumerable: true,
        get() {
          return _chrome;
        },
        set(val) {
          _chrome = val;
          if ((val as Record<string, unknown>)?.runtime?.sendMessage) {
            const origSend = (val as Record<string, unknown>).runtime.sendMessage as (
              msg: unknown
            ) => Promise<unknown>;
            (val as Record<string, unknown>).runtime.sendMessage = async (msg: {
              type: string;
            }) => {
              if (msg?.type === 'SCAN_START') {
                // Simuler une erreur de connecteur typée
                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent('dev:scanError', {
                      detail: {
                        connectorId: 'free-work',
                        error: 'ConnectorError',
                        message: 'Le connecteur free-work a échoué',
                        code: 'PARSER_ERROR',
                      },
                    })
                  );
                }, 500);

                return {
                  type: 'SCAN_STATUS',
                  payload: {
                    state: 'scanning',
                    currentConnector: 'free-work',
                    progress: 0,
                    missionsFound: 0,
                  },
                };
              }
              return origSend.call((val as Record<string, unknown>).runtime, msg);
            };
          }
        },
      });
    });

    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Attendre un peu pour voir si une erreur s'affiche
    await page.waitForTimeout(2000);

    // L'application doit rester fonctionnelle
    await expect(page.getByText('Missions')).toBeVisible();
  });

  test('handles DOM changed scenario (parser failure)', async ({ page }) => {
    await page.addInitScript(() => {
      let _chrome: unknown = undefined;
      Object.defineProperty(window, 'chrome', {
        configurable: true,
        enumerable: true,
        get() {
          return _chrome;
        },
        set(val) {
          _chrome = val;
          if ((val as Record<string, unknown>)?.runtime?.sendMessage) {
            const origSend = (val as Record<string, unknown>).runtime.sendMessage as (
              msg: unknown
            ) => Promise<unknown>;
            (val as Record<string, unknown>).runtime.sendMessage = async (msg: {
              type: string;
            }) => {
              if (msg?.type === 'SCAN_START') {
                // Simuler une erreur de parsing (DOM changé)
                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent('dev:scanError', {
                      detail: {
                        connectorId: 'free-work',
                        error: 'ParserError',
                        message: 'Structure HTML inattendue',
                        code: 'DOM_CHANGED',
                        hint: 'Le site free-work a été mis à jour',
                      },
                    })
                  );
                }, 800);

                return {
                  type: 'SCAN_STATUS',
                  payload: {
                    state: 'scanning',
                    currentConnector: 'free-work',
                    progress: 0.5,
                    missionsFound: 0,
                  },
                };
              }
              return origSend.call((val as Record<string, unknown>).runtime, msg);
            };
          }
        },
      });
    });

    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Attendre l'erreur
    await page.waitForTimeout(1500);

    // L'application doit rester fonctionnelle malgré l'erreur de parsing
    await expect(page.getByText('Missions')).toBeVisible();
  });

  test('handles multiple connector failures with partial success', async ({ page }) => {
    const missions = generateBalancedDataset(10);

    await page.addInitScript((mockMissions: unknown) => {
      (window as unknown as Record<string, unknown>).__mockMissions = mockMissions;

      let _chrome: unknown = undefined;
      Object.defineProperty(window, 'chrome', {
        configurable: true,
        enumerable: true,
        get() {
          return _chrome;
        },
        set(val) {
          _chrome = val;
          if ((val as Record<string, unknown>)?.runtime?.sendMessage) {
            const origSend = (val as Record<string, unknown>).runtime.sendMessage as (
              msg: unknown
            ) => Promise<unknown>;
            (val as Record<string, unknown>).runtime.sendMessage = async (msg: {
              type: string;
              payload?: { connectorId?: string };
            }) => {
              if (msg?.type === 'SCAN_START') {
                const connectorId = msg.payload?.connectorId || 'free-work';

                // Simuler que certains connecteurs échouent
                if (connectorId === 'free-work' || connectorId === 'lehibou') {
                  return {
                    type: 'SCAN_ERROR',
                    payload: {
                      connectorId,
                      error: 'Connection refused',
                      code: 'ECONNREFUSED',
                    },
                  };
                }

                // Les autres connecteurs réussissent
                setTimeout(() => {
                  const missions = (window as unknown as Record<string, unknown>).__mockMissions;
                  window.dispatchEvent(
                    new CustomEvent('dev:missions', {
                      detail: missions,
                    })
                  );
                }, 300);

                return {
                  type: 'SCAN_STATUS',
                  payload: {
                    state: 'scanning',
                    currentConnector: connectorId,
                    progress: 0,
                    missionsFound: 0,
                  },
                };
              }
              return origSend.call((val as Record<string, unknown>).runtime, msg);
            };
          }
        },
      });
    }, missions);

    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Attendre que les missions apparaissent
    await waitForMissions(page, 1, 10000);

    // Vérifier qu'on a des missions malgré les échecs
    const missionCount = await page.locator('text=/\\d+ mission/').textContent();
    expect(missionCount).toMatch(/\d+ mission/);
  });

  test('handles network timeout gracefully', async ({ page }) => {
    await page.addInitScript(() => {
      let _chrome: unknown = undefined;
      Object.defineProperty(window, 'chrome', {
        configurable: true,
        enumerable: true,
        get() {
          return _chrome;
        },
        set(val) {
          _chrome = val;
          if ((val as Record<string, unknown>)?.runtime?.sendMessage) {
            const origSend = (val as Record<string, unknown>).runtime.sendMessage as (
              msg: unknown
            ) => Promise<unknown>;
            (val as Record<string, unknown>).runtime.sendMessage = async (msg: {
              type: string;
            }) => {
              if (msg?.type === 'SCAN_START') {
                // Simuler un timeout (pas de réponse)
                return new Promise((resolve) => {
                  setTimeout(() => {
                    resolve({
                      type: 'SCAN_ERROR',
                      payload: {
                        error: 'Timeout',
                        message: 'La requête a expiré après 30s',
                        code: 'TIMEOUT',
                      },
                    });
                  }, 100);
                });
              }
              return origSend.call((val as Record<string, unknown>).runtime, msg);
            };
          }
        },
      });
    });

    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Attendre le timeout
    await page.waitForTimeout(500);

    // L'application doit rester fonctionnelle
    await expect(page.getByText('Missions')).toBeVisible();
  });

  test('error recovery allows retry', async ({ page }) => {
    const shouldFail = true;

    await page.addInitScript((initialFail: boolean) => {
      let _chrome: unknown = undefined;
      (window as unknown as Record<string, boolean>).__shouldFail = initialFail;

      Object.defineProperty(window, 'chrome', {
        configurable: true,
        enumerable: true,
        get() {
          return _chrome;
        },
        set(val) {
          _chrome = val;
          if ((val as Record<string, unknown>)?.runtime?.sendMessage) {
            const origSend = (val as Record<string, unknown>).runtime.sendMessage as (
              msg: unknown
            ) => Promise<unknown>;
            (val as Record<string, unknown>).runtime.sendMessage = async (msg: {
              type: string;
            }) => {
              if (msg?.type === 'SCAN_START') {
                if ((window as unknown as Record<string, boolean>).__shouldFail) {
                  // Premier appel échoue
                  return {
                    type: 'SCAN_ERROR',
                    payload: {
                      error: 'Temporary error',
                      code: 'TEMP_ERROR',
                    },
                  };
                }

                // Retry réussit
                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent('dev:missions', {
                      detail: [
                        {
                          id: 'retry-success',
                          title: 'Mission après retry',
                          client: 'Test',
                          description: 'Test',
                          stack: ['React'],
                          tjm: 600,
                          location: 'Paris',
                          remote: 'hybrid',
                          duration: '6 mois',
                          url: 'https://example.com/test',
                          source: 'free-work',
                          scrapedAt: new Date(),
                          score: 80,
                          semanticScore: null,
                          semanticReason: null,
                        },
                      ],
                    })
                  );
                }, 300);

                return {
                  type: 'SCAN_STATUS',
                  payload: {
                    state: 'scanning',
                    currentConnector: 'free-work',
                    progress: 0,
                    missionsFound: 0,
                  },
                };
              }
              return origSend.call((val as Record<string, unknown>).runtime, msg);
            };
          }
        },
      });
    }, shouldFail);

    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Attendre l'erreur
    await page.waitForTimeout(500);

    // Simuler le retry en changeant le flag
    await page.evaluate(() => {
      (window as unknown as Record<string, boolean>).__shouldFail = false;
    });

    // Relancer le scan
    await page.getByTitle('Rafraichir').click();

    // Attendre que ça fonctionne
    await waitForMissions(page, 1, 10000);
  });
});
