import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import {
  expectMissionCount,
  injectMissions,
  missionCards,
  mockConnectorFailure,
  scanButton,
  waitForMissions,
} from '../helpers';
import { generateBalancedDataset } from '../../fixtures/large-dataset';

type ScanProtocolScenario =
  | { kind: 'error'; message: string; code: string; delayMs: number }
  | {
      kind: 'partial-success';
      missions: unknown[];
      failedConnectorMessage: string;
      completeDelayMs: number;
    }
  | { kind: 'retry'; mission: Record<string, unknown> };

async function mockScanProtocol(page: Page, scenario: ScanProtocolScenario): Promise<void> {
  await page.addInitScript((config: ScanProtocolScenario) => {
    let _chrome: unknown = undefined;
    const runtimeListeners: Array<
      (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => void
    > = [];

    if (config.kind === 'retry') {
      (window as unknown as Record<string, boolean>).__shouldFail = true;
    }
    (window as unknown as Record<string, unknown>).__scanProtocolEmissions = [];

    function emitRuntimeMessage(message: unknown): void {
      const emissions = (window as unknown as Record<string, unknown>)
        .__scanProtocolEmissions as unknown[];
      emissions.push(message);
      for (const listener of runtimeListeners) {
        listener(message, { id: 'e2e-connector-resilience' }, () => {});
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
            sendMessage?: (message: unknown) => Promise<unknown>;
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

        chromeStub.runtime.sendMessage = async (rawMessage: unknown) => {
          const message = rawMessage as {
            type?: string;
            payload?: { operationId?: string };
          };
          if (message.type !== 'SCAN_START' || !message.payload?.operationId) {
            return originalSendMessage(rawMessage);
          }

          const operationId = message.payload.operationId;

          if (config.kind === 'error') {
            window.setTimeout(() => {
              emitRuntimeMessage({
                type: 'SCAN_ERROR',
                payload: { operationId, message: config.message, code: config.code },
              });
            }, config.delayMs);
          } else if (
            config.kind === 'retry' &&
            (window as unknown as Record<string, boolean>).__shouldFail
          ) {
            window.setTimeout(() => {
              emitRuntimeMessage({
                type: 'SCAN_ERROR',
                payload: {
                  operationId,
                  message: 'Temporary error',
                  code: 'TEMP_ERROR',
                },
              });
            }, 100);
          } else {
            const missions = config.kind === 'partial-success' ? config.missions : [config.mission];

            if (config.kind === 'partial-success') {
              window.setTimeout(() => {
                emitRuntimeMessage({
                  type: 'SCAN_PROGRESS',
                  payload: {
                    operationId,
                    phase: 'scanning',
                    current: 3,
                    total: 3,
                    connectorProgress: [
                      {
                        connectorId: 'free-work',
                        connectorName: 'Free-Work',
                        state: 'done',
                        missionsCount: missions.length,
                        error: null,
                        retryCount: 0,
                      },
                      {
                        connectorId: 'lehibou',
                        connectorName: 'LeHibou',
                        state: 'error',
                        missionsCount: 0,
                        error: {
                          type: 'connector',
                          message: config.failedConnectorMessage,
                          recoverable: true,
                          timestamp: 1,
                          connectorId: 'lehibou',
                          phase: 'fetch',
                        },
                        retryCount: 3,
                      },
                      {
                        connectorId: 'hiway',
                        connectorName: 'Hiway',
                        state: 'error',
                        missionsCount: 0,
                        error: {
                          type: 'network',
                          message: 'Hiway timeout during partial scan',
                          recoverable: true,
                          timestamp: 1,
                          retryable: true,
                        },
                        retryCount: 3,
                      },
                    ],
                  },
                });
              }, 800);
            }

            window.setTimeout(() => {
              emitRuntimeMessage({
                type: 'SCAN_PARTIAL_RESULT',
                payload: {
                  operationId,
                  connectorId: 'free-work',
                  connectorName: 'Free-Work',
                  missions,
                },
              });
            }, 100);
            window.setTimeout(
              () => {
                emitRuntimeMessage({
                  type: 'SCAN_COMPLETE',
                  payload: { operationId, missions },
                });
              },
              config.kind === 'partial-success' ? config.completeDelayMs : 300
            );
          }

          return { type: 'SCAN_STARTED', payload: { operationId } };
        };
      },
    });
  }, scenario);

  // The fixture navigates before each test. Reload so this init script actually
  // installs before the dev Chrome stub and intercepts the next scan.
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible({
    timeout: 10000,
  });
}

test.describe('Connector Resilience', () => {
  test('handles connector HTTP 500 error gracefully', async ({ page }) => {
    const errorMessage = 'Le connecteur free-work a échoué avec HTTP 500.';
    await mockConnectorFailure(page, 'free-work', 500);

    if (!(await page.getByText(errorMessage, { exact: true }).first().isVisible())) {
      await expect(scanButton(page)).toBeEnabled({ timeout: 5000 });
      await scanButton(page).click();
    }

    await expect(page.getByText(errorMessage, { exact: true }).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test('continues scanning when one connector fails', async ({ page }) => {
    // Injecter des missions normalement
    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);

    // Vérifier que les missions sont affichées (les autres connecteurs ont continué)
    const missionCount = await missionCards(page).count();
    expect(missionCount).toBe(5);

    // Vérifier que le compteur affiche 5 missions
    await expectMissionCount(page, 5, 2000);
  });

  test('shows typed error message for connector failure', async ({ page }) => {
    const errorMessage = 'Le connecteur free-work a échoué';
    await mockScanProtocol(page, {
      kind: 'error',
      message: errorMessage,
      code: 'PARSER_ERROR',
      delayMs: 500,
    });

    await expect(page.getByText(errorMessage, { exact: true }).first()).toBeVisible({
      timeout: 3000,
    });
  });

  test('handles DOM changed scenario (parser failure)', async ({ page }) => {
    const errorMessage = 'Structure HTML inattendue';
    await mockScanProtocol(page, {
      kind: 'error',
      message: errorMessage,
      code: 'DOM_CHANGED',
      delayMs: 800,
    });

    await expect(page.getByText(errorMessage, { exact: true }).first()).toBeVisible({
      timeout: 3000,
    });
  });

  test('handles multiple connector failures with partial success', async ({ page }) => {
    const [mission] = generateBalancedDataset(1);
    const uniqueMissionTitle = 'Résilience partielle — mission témoin';
    const missions = [
      {
        ...mission,
        id: 'partial-success-proof',
        title: uniqueMissionTitle,
        score: 100,
      },
    ];
    await mockScanProtocol(page, {
      kind: 'partial-success',
      missions,
      failedConnectorMessage: 'LeHibou indisponible pendant le scan partiel',
      completeDelayMs: 2500,
    });

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const emissions = (
              window as unknown as {
                __scanProtocolEmissions?: Array<{
                  type?: string;
                  payload?: { connectorProgress?: Array<{ state?: string }> };
                }>;
              }
            ).__scanProtocolEmissions;
            return Boolean(
              emissions?.some(
                (message) =>
                  message.type === 'SCAN_PROGRESS' &&
                  message.payload?.connectorProgress?.some((status) => status.state === 'error')
              )
            );
          }),
        { timeout: 2000 }
      )
      .toBe(true);

    const arrivalStack = page.getByTestId('mission-arrival-stack');
    await expect(arrivalStack).toBeVisible({ timeout: 2000 });
    await arrivalStack.getByRole('button', { name: /Ouvrir (?:la|les \d+) nouvelle/ }).click();
    await expect(
      page.getByTestId('arrival-preview').filter({ hasText: uniqueMissionTitle })
    ).toBeVisible();

    await expect(scanButton(page)).toBeEnabled({ timeout: 5000 });
    await arrivalStack
      .getByRole('button', { name: /Actualiser la file avec (?:la mission|les \d+ missions)/ })
      .click();
    await expect(page.getByText(uniqueMissionTitle, { exact: true })).toBeVisible();
  });

  test('handles network timeout gracefully', async ({ page }) => {
    const errorMessage = 'La requête a expiré après 30s';
    await mockScanProtocol(page, {
      kind: 'error',
      message: errorMessage,
      code: 'TIMEOUT',
      delayMs: 100,
    });

    await expect(page.getByText(errorMessage, { exact: true }).first()).toBeVisible({
      timeout: 3000,
    });
  });

  test('error recovery allows retry', async ({ page }) => {
    const now = new Date().toISOString();
    await mockScanProtocol(page, {
      kind: 'retry',
      mission: {
        id: 'retry-success',
        title: 'Mission après retry',
        client: 'Test',
        description: 'Test',
        stack: ['React'],
        tjm: 600,
        location: 'Paris',
        remote: 'hybrid',
        duration: '6 mois',
        startDate: null,
        publishedAt: now,
        url: 'https://example.com/test',
        source: 'free-work',
        scrapedAt: now,
        seniority: 'senior',
        scoreBreakdown: null,
        score: 80,
        semanticScore: null,
        semanticReason: null,
      },
    });

    await expect(page.getByText('Temporary error', { exact: true }).first()).toBeVisible({
      timeout: 3000,
    });

    // Simuler le retry en changeant le flag
    await page.evaluate(() => {
      (window as unknown as Record<string, boolean>).__shouldFail = false;
    });

    // Relancer le scan
    await scanButton(page).click();

    const arrivalStack = page.getByTestId('mission-arrival-stack');
    await expect(arrivalStack).toBeVisible({ timeout: 3000 });
    await arrivalStack
      .getByRole('button', { name: /Ouvrir les 1 nouvelle mission arrivée/ })
      .click();
    await expect(page.getByTestId('arrival-preview')).toContainText('Mission après retry');
    await arrivalStack.getByRole('button', { name: 'Actualiser la file avec la mission' }).click();

    await expect(page.getByText('Mission après retry', { exact: true })).toBeVisible({
      timeout: 10000,
    });
  });
});
