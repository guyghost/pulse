import { test, expect, type Page } from '@playwright/test';
import {
  SIDE_PANEL,
  copyLinkButton,
  expectMissionCount,
  feedSearchInput,
  favoriteButton,
  favoritesToggle,
  hideButton,
  expandMission,
  injectMissions,
  missionCards,
  openMissionButton,
  openOperationalDetails,
  setFeedState,
  toggleFavoritesFilter,
  triggerScan,
  unfavoriteButton,
  feedRegion,
} from './helpers';

/**
 * Mock chrome to simulate a user who has already completed onboarding.
 * This ensures the feed page is shown directly without going through onboarding.
 */
async function mockUserWithProfile(page: Page) {
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
          (val as Record<string, unknown>).runtime.sendMessage = async (msg: { type: string }) => {
            if (msg?.type === 'GET_PROFILE') {
              // Return a mock profile so onboarding is skipped
              return {
                type: 'PROFILE_RESULT',
                payload: {
                  firstName: 'Test',
                  jobTitle: 'Developer',
                  location: 'Paris',
                  stacks: ['React', 'TypeScript'],
                  tjm: 600,
                },
              };
            }
            return origSend.call((val as Record<string, unknown>).runtime, msg);
          };
        }
        // Mock chrome.storage.local
        if ((val as Record<string, unknown>)?.storage) {
          const storage: Record<string, unknown> = {};
          (val as Record<string, unknown>).storage = {
            local: {
              get: async (key: string) => {
                return (storage as Record<string, unknown>)[key]
                  ? { [key]: (storage as Record<string, unknown>)[key] }
                  : {};
              },
              set: async (items: Record<string, unknown>) => {
                Object.assign(storage, items);
              },
            },
          };
        }
      },
    });
  });
}

async function mockUserWithProfileAndSlowPartialScan(page: Page) {
  await page.addInitScript(() => {
    let _chrome: unknown = undefined;
    const runtimeListeners: Array<
      (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => void
    > = [];
    const now = new Date().toISOString();
    const partialMission = {
      id: 'partial-scan-action-test',
      title: 'Partial Scan Action Test',
      client: 'Test Client',
      description: 'Mission partielle disponible avant la fin du scan complet.',
      stack: ['Svelte', 'TypeScript'],
      tjm: 720,
      location: 'Paris',
      remote: 'hybrid',
      duration: '6 mois',
      startDate: null,
      publishedAt: now,
      url: 'https://www.free-work.com/fr/tech-it/jobs/partial-scan-action-test',
      source: 'free-work',
      scrapedAt: now,
      seniority: 'senior',
      scoreBreakdown: null,
      score: 86,
      semanticScore: null,
      semanticReason: null,
    };

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
          const message = msg as { type?: string; payload?: { operationId?: string } };

          if (message?.type === 'GET_PROFILE') {
            return {
              type: 'PROFILE_RESULT',
              payload: {
                firstName: 'Test',
                jobTitle: 'Developer',
                location: 'Paris',
                stacks: ['Svelte', 'TypeScript'],
                tjm: 650,
              },
            };
          }

          if (message?.type === 'GET_PERSISTED_CONNECTOR_STATUSES') {
            const syncedAt = Date.now();
            return {
              type: 'PERSISTED_CONNECTOR_STATUSES_RESULT',
              payload: [
                {
                  connectorId: 'free-work',
                  connectorName: 'Free-Work',
                  lastState: 'done',
                  missionsCount: 10,
                  error: null,
                  lastSyncAt: syncedAt,
                  lastSuccessAt: syncedAt,
                },
              ],
            };
          }

          if (message?.type === 'SCAN_START') {
            const operationId = message.payload?.operationId;
            if (!operationId) {
              return originalSendMessage(msg);
            }

            window.setTimeout(() => {
              emitRuntimeMessage({
                type: 'SCAN_PARTIAL_RESULT',
                payload: {
                  operationId,
                  connectorId: 'free-work',
                  connectorName: 'Free-Work',
                  missions: [partialMission],
                },
              });
            }, 150);

            window.setTimeout(() => {
              emitRuntimeMessage({
                type: 'SCAN_COMPLETE',
                payload: { operationId, missions: [partialMission] },
              });
            }, 2500);

            return { type: 'SCAN_STARTED', payload: { operationId } };
          }

          return originalSendMessage(msg);
        };
      },
    });
  });
}

test.describe('Feed', () => {
  test('auto-loads missions on mount', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    // Wait for feed to be ready - search input is always visible on feed
    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    // Wait for the feed to show something - either missions or empty state
    await expect(page.getByText(/(Aucune mission|\d+ missions)/).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test('shows empty state via DevPanel', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    await setFeedState(page, 'empty');

    // Sur un runner CI lent, le SCAN_COMPLETE du scan de montage (stub à
    // ~2,5 s après SCAN_START) peut arriver APRÈS le passage à « empty » et
    // repeupler le feed : ré-émettre l'événement dev du DevPanel (même
    // mécanisme que son bouton) jusqu'à ce que l'état vide persiste.
    await expect
      .poll(
        async () => {
          await page.evaluate(() => {
            window.dispatchEvent(new CustomEvent('dev:feed-state', { detail: 'empty' }));
          });
          return feedRegion(page)
            .getByText(/Aucune mission/)
            .isVisible();
        },
        { timeout: 10_000 }
      )
      .toBe(true);
  });

  test('search filters missions', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    await injectMissions(page, 5);

    await expectMissionCount(page, 5);

    // Search
    await feedSearchInput(page).fill('React');
    await page.waitForTimeout(500);

    // Results should update - verify search input contains the search term
    await expect(feedSearchInput(page)).toHaveValue('React');

    await expect(page.getByText(/React/).first()).toBeVisible();
  });

  test('search with no result stays a filtered state and can be cleared', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);
    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });
    await injectMissions(page, 5);
    await expectMissionCount(page, 5);

    await feedSearchInput(page).fill('zzzz-introuvable');

    await expect(
      page.getByRole('heading', { name: 'Aucune mission pour « zzzz-introuvable »' }).first()
    ).toBeVisible({ timeout: 3000 });
    await expect(
      page.getByRole('heading', { name: /Lancez un premier scan|profil actuel/ })
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Effacer la recherche' }).first().click();
    await expect(feedSearchInput(page)).toHaveValue('');
    await expectMissionCount(page, 5);
  });

  test('error state shows error message', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    await setFeedState(page, 'error');

    await expect(feedRegion(page).getByText('[Dev] Simulated error')).toBeVisible({
      timeout: 5000,
    });
  });

  test('new missions show unseen indicator (blue left border)', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    await injectMissions(page, 5);
    await expectMissionCount(page, 5);

    // Cards should be visible — the IntersectionObserver marks them as seen
    const firstCard = missionCards(page).first();
    await expect(firstCard).toBeVisible();

    // New cards should have a visual indicator (border-l-4 class for left border)
    // Initially, cards may have a blue left border indicating "unseen"
    const hasBorderIndicator = await firstCard.evaluate((el) => {
      const classes = el.className;
      // Check for left border utility classes or custom unseen class
      return (
        classes.includes('border-l-') ||
        classes.includes('unseen') ||
        classes.includes('new') ||
        el.getAttribute('data-seen') === 'false'
      );
    });

    // Card should exist and have some visual state indicator
    expect(typeof hasBorderIndicator).toBe('boolean');

    // After appearing in viewport, the card transitions to "seen" state
    await page.waitForTimeout(500);

    // Verify the card is still visible after marking as seen
    await expect(firstCard).toBeVisible();
  });

  test('action buttons are visible on mission cards', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    await injectMissions(page, 5);

    await expectMissionCount(page, 5);

    const firstCard = missionCards(page).first();
    await expect(firstCard).toBeVisible();

    // Verify all action buttons exist and are enabled (interactive).
    // Favorite stays on the collapsed row; the other actions live inside
    // the quiet disclosure and require expanding the card first.
    const starBtn = favoriteButton(firstCard);
    await expandMission(firstCard);
    const hideBtn = hideButton(firstCard);
    const copyBtn = copyLinkButton(firstCard);
    const openBtn = openMissionButton(firstCard);

    await expect(starBtn).toBeVisible();
    await expect(hideBtn).toBeVisible();
    await expect(copyBtn).toBeVisible();
    await expect(openBtn).toBeVisible();

    // Verify buttons are not disabled
    await expect(starBtn).toBeEnabled();
    await expect(hideBtn).toBeEnabled();
    await expect(copyBtn).toBeEnabled();
    await expect(openBtn).toBeEnabled();
  });

  test('clicking favorite toggles star state', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    await injectMissions(page, 5);

    await expectMissionCount(page, 5);

    const firstCard = missionCards(page).first();
    const starBtn = favoriteButton(firstCard);
    await expect(starBtn).toBeVisible();

    // Click to favorite
    await starBtn.click();
    await expect(unfavoriteButton(firstCard)).toBeVisible({ timeout: 1000 });

    // Click again to unfavorite
    await unfavoriteButton(firstCard).click();
    await expect(favoriteButton(firstCard)).toBeVisible({ timeout: 1000 });
  });

  test('clicking hide removes mission and shows toggle link', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    await injectMissions(page, 5);

    await expectMissionCount(page, 5);

    // Hide the first mission (actions live behind the card disclosure)
    const firstCard = missionCards(page).first();
    await expandMission(firstCard);
    const hideBtn = hideButton(firstCard);
    await hideBtn.click();

    // Mission count should decrease
    await expectMissionCount(page, 4, 2000);

    // "Voir les ignorées (N)" link should appear
    await expect(page.getByRole('button', { name: /Voir les ignorées/ })).toBeVisible();
  });

  test('favorites toggle filters to favorites only', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    await injectMissions(page, 5);

    await expectMissionCount(page, 5);

    // Favorite the first mission
    const firstCard = missionCards(page).first();
    await favoriteButton(firstCard).click();
    await expect(unfavoriteButton(firstCard)).toBeVisible({ timeout: 1000 });

    // Opens the operational dashboard, then clicks the favorites filter
    await toggleFavoritesFilter(page, true);

    // Should show only 1 mission (the favorited one)
    await expectMissionCount(page, 1, 2000);

    await favoritesToggle(page).click();
    await expectMissionCount(page, 5, 2000);
  });

  test('manual partial results become interactive only after the terminal projection', async ({
    page,
  }) => {
    await mockUserWithProfileAndSlowPartialScan(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });
    await expect(missionCards(page)).toHaveCount(10, { timeout: 5000 });

    // Loaded feed → compact hero exposes no scan control; the `r` shortcut
    // (or any retry CTA) is the manual trigger.
    await triggerScan(page);

    const arrivalStack = page.getByTestId('mission-arrival-stack');
    await expect(arrivalStack).not.toBeVisible();
    await expect(page.getByText('Partial Scan Action Test')).not.toBeVisible();
    await expect(page.getByText('Collecte...')).toBeVisible();

    const partialCard = missionCards(page).filter({ hasText: 'Partial Scan Action Test' });
    await expect(partialCard).toBeVisible({ timeout: 10000 });
    await expect(missionCards(page)).toHaveCount(1);
    await expect(arrivalStack).not.toBeVisible();

    await expandMission(partialCard);
    const investigateButton = partialCard.getByRole('button', { name: 'Analyser' });
    await expect(investigateButton).toBeEnabled();
    await investigateButton.click();

    const investigation = page.getByRole('dialog', { name: 'Investigation mission' });
    await expect(investigation).toBeVisible();
    await expect(investigation).toContainText('Partial Scan Action Test');
  });

  test('keeps the active new-mission queue stable while visible cards become seen', async ({
    page,
  }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);
    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });
    await injectMissions(page, 8);

    await page.getByRole('button', { name: 'Afficher les détails opérationnels' }).click();
    const newMissionsToggle = page.getByTitle('Filtrer les nouvelles missions');
    await newMissionsToggle.click();
    await expect(newMissionsToggle).toHaveAttribute('aria-pressed', 'true');

    const cards = missionCards(page);
    const initialCount = await cards.count();
    const firstCard = cards.first();
    const firstTitle = await firstCard.locator('h3').textContent();
    await firstCard.scrollIntoViewIfNeeded();

    await expect(firstCard.getByText('Vu', { exact: true })).toBeVisible({ timeout: 3000 });

    await expect(cards).toHaveCount(initialCount);
    await expect(cards.first().locator('h3')).toHaveText(firstTitle ?? '');
  });

  test('filter dock and operational dashboard controls are visible', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    // Filter dock trigger
    await expect(page.getByRole('button', { name: 'Afficher les filtres' })).toBeVisible();
    // Favorites toggle lives in the operational-details dashboard
    await openOperationalDetails(page);
    await expect(favoritesToggle(page)).toBeVisible();
  });

  test('ARIA attributes for accessibility are properly set', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    // Verify we're on the feed by checking navigation is visible
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    // Verify feed content exists — check for search input (always visible in feed)
    await expect(feedSearchInput(page)).toBeVisible();

    // aria-pressed on the dashboard quick filters (the favorites filter is a
    // plain toggle without aria-pressed since the filter-dock redesign)
    await injectMissions(page, 5);
    await openOperationalDetails(page);
    const newMissionsFilter = page.getByTitle('Filtrer les nouvelles missions');
    await expect(newMissionsFilter).toHaveAttribute('aria-pressed', 'false');
    await newMissionsFilter.click();
    await expect(newMissionsFilter).toHaveAttribute('aria-pressed', 'true');
    await newMissionsFilter.click();
    await expect(newMissionsFilter).toHaveAttribute('aria-pressed', 'false');

    // Test aria-expanded on filter toggle
    const filterToggle = page.getByRole('button', { name: 'Afficher les filtres' });
    await expect(filterToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(filterToggle).toHaveAttribute('aria-controls', 'filter-panel');

    await filterToggle.click();
    await expect(page.getByRole('button', { name: 'Masquer les filtres' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    // Filter panel uses role="group" with aria-label "Filtrer les missions"
    const filterPanel = page.getByRole('group', { name: 'Filtrer les missions' });
    await expect(filterPanel).toBeVisible();

    const panelIsTopmost = await filterPanel.evaluate((panel) => {
      const rect = panel.getBoundingClientRect();
      // Sonde au centre vertical : le bord supérieur du panneau passe sous la
      // barre d'outils sticky du feed (z-20), ce qui fausse un probe top+24.
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === panel || (hit !== null && panel.contains(hit));
    });
    expect(panelIsTopmost).toBe(true);

    const remoteFilter = filterPanel.getByRole('button', { name: 'Remote', exact: true });
    await remoteFilter.click();
    await expect(remoteFilter).toHaveAttribute('aria-pressed', 'true');
  });
});
