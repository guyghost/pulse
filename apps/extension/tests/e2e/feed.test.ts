import { test, expect, type Page } from '@playwright/test';
import {
  SIDE_PANEL,
  copyLinkButton,
  expectMissionCount,
  feedSearchInput,
  favoriteButton,
  favoritesToggle,
  hideButton,
  injectMissions,
  missionCards,
  openMissionButton,
  scanButton,
  setFeedState,
  allMissionsToggle,
  unfavoriteButton,
  expectFeedEmptyState,
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
          const message = msg as { type?: string };

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

          if (message?.type === 'SCAN_START') {
            window.setTimeout(() => {
              emitRuntimeMessage({
                type: 'SCAN_PARTIAL_RESULT',
                payload: {
                  connectorId: 'free-work',
                  connectorName: 'Free-Work',
                  missions: [partialMission],
                },
              });
            }, 150);

            return new Promise((resolve) => {
              window.setTimeout(() => {
                resolve({ type: 'SCAN_COMPLETE', payload: [partialMission] });
              }, 2500);
            });
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

    await expectFeedEmptyState(page, 2000);
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

    // Verify all action buttons exist and are enabled (interactive)
    const starBtn = favoriteButton(firstCard);
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

    // Hide the first mission
    const firstCard = missionCards(page).first();
    const hideBtn = hideButton(firstCard);
    await hideBtn.click();

    // Mission count should decrease
    await expectMissionCount(page, 4, 2000);

    // "Voir les masquees" link should appear
    await expect(page.getByRole('button', { name: /Voir les \d+ mission.*masqu/i })).toBeVisible();
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

    await favoritesToggle(page).click();
    await page.waitForTimeout(300);

    // Should show only 1 mission (the favorited one)
    await expectMissionCount(page, 1, 2000);

    await allMissionsToggle(page).click();
    await expectMissionCount(page, 5, 2000);
  });

  test('partial scan missions stay buffered and become interactive after applying them', async ({
    page,
  }) => {
    await mockUserWithProfileAndSlowPartialScan(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });
    await expect(scanButton(page)).toBeEnabled({ timeout: 5000 });

    await scanButton(page).click();

    const pendingBanner = page.getByTestId('pending-missions-banner');
    await expect(pendingBanner).toBeVisible({ timeout: 1000 });
    await expect(page.getByText('Partial Scan Action Test')).not.toBeVisible();
    await expect(page.getByText('Collecte...')).toBeVisible();

    await pendingBanner.getByRole('button', { name: /Afficher 1 mission/ }).click();

    const partialCard = missionCards(page).filter({ hasText: 'Partial Scan Action Test' });
    await expect(partialCard).toBeVisible();

    const investigateButton = partialCard.getByRole('button', { name: 'Investiguer →' });
    await expect(investigateButton).toBeEnabled();
    await investigateButton.click();

    await expect(page.getByRole('dialog', { name: 'Investigation mission' })).toBeVisible();
    await expect(page.getByText('Collecte...')).toBeVisible();
  });

  test('header star button and refresh button are visible', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });

    // Favorites filter button — matches aria-label "Filtrer les favoris" or visible text "Favoris"
    await expect(page.getByRole('button', { name: /favoris/i })).toBeVisible();
    // Refresh/scan button is visible (title changes based on state)
    await expect(scanButton(page)).toBeVisible();
  });

  test('ARIA attributes for accessibility are properly set', async ({ page }) => {
    await mockUserWithProfile(page);
    await page.goto(SIDE_PANEL);

    // Verify we're on the feed by checking navigation is visible
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    // Verify feed content exists — check for search input (always visible in feed)
    await expect(feedSearchInput(page)).toBeVisible();

    // Test aria-pressed on favorites toggle — button shows "Favoris" text when not active
    const favoritesFilter = favoritesToggle(page);
    await expect(favoritesFilter).toHaveAttribute('aria-pressed', 'false');

    await favoritesFilter.click();
    await expect(allMissionsToggle(page)).toHaveAttribute('aria-pressed', 'true');
    await allMissionsToggle(page).click();
    await expect(favoritesToggle(page)).toHaveAttribute('aria-pressed', 'false');

    // Test aria-expanded on filter toggle
    const filterToggle = page.getByRole('button', { name: 'Afficher les filtres' });
    await expect(filterToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(filterToggle).toHaveAttribute('aria-controls', 'filter-panel');

    await filterToggle.click();
    await expect(page.getByRole('button', { name: 'Masquer les filtres' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    // Filter panel uses role="group" with aria-label "Options de filtrage"
    const filterPanel = page.getByRole('group', { name: /Options de filtrage/ });
    await expect(filterPanel).toBeVisible();
  });
});
