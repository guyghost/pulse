import { expect, test, type Page } from '@playwright/test';
import { dismissFeedTour, SIDE_PANEL } from './helpers';

const mission = {
  id: 'feed-tracking-failure-proof',
  title: 'Mission Feed — preuve de rejet du suivi',
  client: 'Atelier Causal',
  description: 'Mission témoin pour vérifier les erreurs de suivi depuis le Feed.',
  stack: ['Svelte', 'TypeScript'],
  tjm: 720,
  location: 'Paris',
  remote: 'hybrid',
  duration: '3 mois',
  startDate: '2026-08-01',
  publishedAt: '2026-07-15T08:00:00.000Z',
  url: 'https://example.com/missions/feed-tracking-failure-proof',
  source: 'free-work',
  scrapedAt: '2026-07-15T09:00:00.000Z',
  seniority: 'senior',
  scoreBreakdown: null,
  score: 91,
  semanticScore: null,
  semanticReason: null,
};

type TrackingFailureScenario = 'load-failure' | 'transition-failure' | 'restore-failure';

async function mockFeedTrackingBridge(
  page: Page,
  scenario: TrackingFailureScenario
): Promise<void> {
  await page.addInitScript(
    ({ missionRow, failureScenario }) => {
      type BridgeRequest = { type: string; payload?: unknown };
      type MissionTracking = {
        missionId: string;
        currentStatus: string;
        history: Array<{
          from: string | null;
          to: string;
          timestamp: number;
          note: string | null;
        }>;
        generatedAssetIds: string[];
        userRating: number | null;
        notes: string;
        nextActionAt: string | null;
      };

      const trackingRequests: string[] = [];
      const unhandledRejections: string[] = [];
      let confirmedTracking: MissionTracking | null = null;

      Object.defineProperty(window, '__feedTrackingRequests', {
        configurable: true,
        value: trackingRequests,
      });
      Object.defineProperty(window, '__feedTrackingUnhandledRejections', {
        configurable: true,
        value: unhandledRejections,
      });
      window.addEventListener('unhandledrejection', (event) => {
        unhandledRejections.push(
          event.reason instanceof Error ? event.reason.message : String(event.reason)
        );
      });

      const trackingFailure = (
        intent: 'load' | 'transition' | 'restore',
        message: string
      ): Record<string, unknown> => ({
        type: 'TRACKING_FAILED',
        payload: {
          version: 1,
          code: intent === 'load' ? 'LOAD_FAILED' : 'PERSIST_FAILED',
          intent,
          missionId: intent === 'load' ? null : missionRow.id,
          mutationId: null,
          message,
          recoverable: true,
        },
      });

      let chromeValue: unknown = undefined;
      Object.defineProperty(window, 'chrome', {
        configurable: true,
        enumerable: true,
        get() {
          return chromeValue;
        },
        set(value: unknown) {
          chromeValue = value;
          const chromeApi = value as {
            runtime?: {
              sendMessage?: (message: BridgeRequest) => Promise<unknown>;
            };
          };
          const originalSendMessage = chromeApi.runtime?.sendMessage;
          if (!originalSendMessage) {
            return;
          }

          chromeApi.runtime.sendMessage = async (message) => {
            if (message.type === 'GET_FEED_MISSIONS') {
              return { type: 'FEED_MISSIONS_RESULT', payload: [missionRow] };
            }
            if (message.type === 'GET_PERSISTED_CONNECTOR_STATUSES') {
              const now = Date.now();
              return {
                type: 'PERSISTED_CONNECTOR_STATUSES_RESULT',
                payload: [
                  {
                    connectorId: 'free-work',
                    connectorName: 'Free-Work',
                    lastState: 'done',
                    missionsCount: 1,
                    error: null,
                    lastSyncAt: now,
                    lastSuccessAt: now,
                  },
                ],
              };
            }
            if (message.type === 'GET_TRACKINGS') {
              trackingRequests.push(message.type);
              if (failureScenario === 'load-failure') {
                return trackingFailure('load', 'Impossible de charger le suivi des candidatures.');
              }
              return {
                type: 'TRACKINGS_RESULT',
                payload: confirmedTracking ? [confirmedTracking] : [],
              };
            }
            if (message.type === 'UPDATE_TRACKING') {
              trackingRequests.push(message.type);
              if (failureScenario === 'transition-failure') {
                return trackingFailure('transition', 'Impossible d’enregistrer le nouveau statut.');
              }

              confirmedTracking = {
                missionId: missionRow.id,
                currentStatus: 'selected',
                history: [
                  { from: null, to: 'detected', timestamp: 1, note: null },
                  { from: 'detected', to: 'selected', timestamp: 2, note: null },
                ],
                generatedAssetIds: [],
                userRating: null,
                notes: '',
                nextActionAt: null,
              };
              return { type: 'TRACKING_UPDATED', payload: confirmedTracking };
            }
            if (message.type === 'RESTORE_TRACKING') {
              trackingRequests.push(message.type);
              return trackingFailure('restore', 'Impossible d’annuler la modification.');
            }

            return originalSendMessage.call(chromeApi.runtime, message);
          };
        },
      });
    },
    { missionRow: mission, failureScenario: scenario }
  );
}

async function openTrackingAction(page: Page): Promise<ReturnType<Page['getByRole']>> {
  await page.goto(SIDE_PANEL);
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible({
    timeout: 10_000,
  });
  await dismissFeedTour(page);

  const card = page
    .getByTestId('mission-feed')
    .locator('[role="button"][tabindex="0"]')
    .filter({ hasText: mission.title });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.getByRole('button', { name: /Investiguer/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Investigation mission' });
  await expect(dialog).toBeVisible();
  return dialog;
}

function readBrowserFailures(page: Page): Promise<{ requests: string[]; unhandled: string[] }> {
  return page.evaluate(() => {
    const trace = window as unknown as {
      __feedTrackingRequests?: string[];
      __feedTrackingUnhandledRejections?: string[];
    };
    return {
      requests: [...(trace.__feedTrackingRequests ?? [])],
      unhandled: [...(trace.__feedTrackingUnhandledRejections ?? [])],
    };
  });
}

test.describe('Feed tracking failure settlement', () => {
  test('projects failed tracking load as unavailable and retries explicitly', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await mockFeedTrackingBridge(page, 'load-failure');
    const dialog = await openTrackingAction(page);

    await expect(
      dialog
        .locator('p[role="status"]')
        .filter({ hasText: 'Impossible de charger le suivi des candidatures.' })
    ).toBeVisible();
    await expect(dialog.getByText('Suivi indisponible', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Non suivie', { exact: true })).toHaveCount(0);
    const requestsBeforeRetry = await readBrowserFailures(page).then(
      ({ requests }) => requests.filter((type) => type === 'GET_TRACKINGS').length
    );
    await dialog.getByRole('button', { name: 'Réessayer le suivi' }).click();
    await expect
      .poll(async () => {
        const failures = await readBrowserFailures(page);
        return failures.requests.filter((type) => type === 'GET_TRACKINGS').length;
      })
      .toBe(requestsBeforeRetry + 1);

    const browserFailures = await readBrowserFailures(page);
    expect(browserFailures.requests).not.toContain('UPDATE_TRACKING');
    expect(browserFailures.unhandled).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('keeps the untracked badge and exposes no success or Undo after transition failure', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await mockFeedTrackingBridge(page, 'transition-failure');
    const dialog = await openTrackingAction(page);

    await dialog.getByRole('button', { name: 'Mettre en suivi' }).click();

    await expect(
      page.getByText('Impossible d’enregistrer le nouveau statut.', { exact: true })
    ).toBeVisible();
    await expect(dialog.getByText('Non suivie', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Mettre en suivi' })).toBeEnabled();
    await expect(page.getByText('Statut: Sélectionnée', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Annuler', exact: true })).toHaveCount(0);

    const browserFailures = await readBrowserFailures(page);
    expect(browserFailures.requests.filter((type) => type === 'UPDATE_TRACKING')).toHaveLength(1);
    expect(browserFailures.requests).not.toContain('RESTORE_TRACKING');
    expect(browserFailures.unhandled).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('handles a rejected Undo with one error toast and no unhandled rejection', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await mockFeedTrackingBridge(page, 'restore-failure');
    const dialog = await openTrackingAction(page);

    await dialog.getByRole('button', { name: 'Mettre en suivi' }).click();
    await expect(page.getByText('Statut: Sélectionnée', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Sélectionnée', { exact: true })).toBeVisible();

    const renderer = page.locator('[data-modal-feedback-renderer]');
    const undo = page.getByRole('button', { name: 'Annuler', exact: true });
    await expect(renderer).toHaveCount(1);
    await expect(dialog.locator('[data-modal-feedback-renderer]')).toHaveCount(1);
    await expect(
      page.locator('[data-feedback-application-host] > [data-modal-feedback-renderer]')
    ).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Annuler', exact: true })).toBeVisible();
    expect(
      await undo.evaluate((button) => {
        const bounds = button.getBoundingClientRect();
        const hit = document.elementFromPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2
        );
        return hit === button || button.contains(hit);
      })
    ).toBe(true);
    const dismissToast = dialog.getByRole('button', { name: 'Fermer la notification' });
    await undo.focus();
    await expect(undo).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dismissToast).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(undo).toBeFocused();
    await undo.press('Enter');

    await expect(
      page.getByText('Impossible d’annuler la modification.', { exact: true })
    ).toBeVisible();
    await expect(dialog.getByText('Sélectionnée', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Suivi: Sélectionnée' })).toBeDisabled();
    await expect(page.getByText('Statut: Sélectionnée', { exact: true })).toHaveCount(0);

    const browserFailures = await readBrowserFailures(page);
    expect(browserFailures.requests.filter((type) => type === 'UPDATE_TRACKING')).toHaveLength(1);
    expect(browserFailures.requests.filter((type) => type === 'RESTORE_TRACKING')).toHaveLength(1);
    expect(browserFailures.unhandled).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
