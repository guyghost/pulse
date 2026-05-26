import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import type { UserProfile } from '../../src/lib/core/types/profile';
import type { Mission } from '../../src/lib/core/types/mission';

export const SIDE_PANEL = '/src/sidepanel/index.html';

// ============================================================================
// Dev Panel Helpers
// ============================================================================

export async function waitForDevPanel(page: Page) {
  await page.waitForLoadState('domcontentloaded');
}

export async function openDevPanel(page: Page) {
  await waitForDevPanel(page);
  await page.keyboard.press('Control+Shift+D');
  const panel = page.getByText('DEV PANEL');
  const opened = await panel.isVisible().catch(() => false);
  if (!opened) {
    const launcher = page.locator('button:has-text("Ctrl+Shift+D")');
    if (await launcher.isVisible().catch(() => false)) {
      await launcher.click();
    }
  }
  await expect(panel).toBeVisible();
}

export async function closeDevPanel(page: Page) {
  const panel = page.getByText('DEV PANEL');
  if (await panel.isVisible().catch(() => false)) {
    await page.keyboard.press('Control+Shift+D');
    if (await panel.isVisible().catch(() => false)) {
      const closeButton = page.locator('button').filter({ has: page.locator('svg') }).first();
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click();
      }
    }
  }
  await expect(panel).not.toBeVisible();
}

export async function setFeedState(page: Page, state: 'empty' | 'loading' | 'loaded' | 'error') {
  await openDevPanel(page);
  await page.getByRole('button', { name: state }).click();
  await closeDevPanel(page);
}

export async function injectMissions(page: Page, count: number) {
  await openDevPanel(page);
  await page.locator('input[type="range"]').evaluate((el, val) => {
    (el as HTMLInputElement).value = String(val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, count);
  await page.getByRole('button', { name: 'inject' }).click();
  await closeDevPanel(page);
}

/**
 * Vide le feed puis injecte exactement `count` missions.
 * Utilise le DevPanel pour garantir un état propre sans missions résiduelles.
 */
export async function clearAndInjectMissions(page: Page, count: number) {
  await setFeedState(page, 'empty');
  await page.waitForTimeout(200);
  // In dev mode, an initial auto-scan may still resolve shortly after mount.
  // Let that pending result flush before injecting a deterministic mission set.
  await page.waitForTimeout(900);
  await injectMissions(page, count);
  await waitForMissions(page, count, 5000);
}

/**
 * Reset persisted mission interaction state used by dev chrome stubs.
 * Keeps tests deterministic across reloads and scenario boundaries.
 */
export async function resetStoredMissionState(page: Page) {
  await page.evaluate(async () => {
    await chrome.storage.local.remove(['favoriteMissions', 'hiddenMissions']);
  });
}

// ============================================================================
// Onboarding Helpers
// ============================================================================

/**
 * Mock le profil utilisateur pour simuler une première visite (pas de profil)
 */
export async function mockNoProfile(page: Page) {
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
              return { type: 'PROFILE_RESULT', payload: null };
            }
            return origSend.call((val as Record<string, unknown>).runtime, msg);
          };
        }
      },
    });
  });
}

/**
 * Remplit le formulaire d'onboarding avec les données fournies
 */
export async function fillOnboardingForm(page: Page, profile: Partial<UserProfile>) {
  if (profile.firstName) {
    await page.locator('#ob-firstname').fill(profile.firstName);
  }
  if (profile.jobTitle) {
    await page.locator('#ob-jobtitle').fill(profile.jobTitle);
  }
  if (profile.location) {
    await page.locator('#ob-location').fill(profile.location);
  }
}

/**
 * Complète l'onboarding avec un profil complet
 */
export async function completeOnboarding(page: Page, profile: Partial<UserProfile> = {}) {
  const defaultProfile = {
    firstName: 'Test',
    jobTitle: 'Développeur Fullstack',
    location: 'Paris',
    ...profile,
  };

  await fillOnboardingForm(page, defaultProfile);
  await page.getByRole('button', { name: /C.est parti|Commencer/ }).click();
}

/**
 * Ouvre l'application et complète l'onboarding si nécessaire pour arriver sur le feed.
 */
export async function ensureFeedVisible(page: Page, profile: Partial<UserProfile> = {}) {
  await page.goto(SIDE_PANEL);

  const ensureOnce = async () => {
    const navVisible = await page
      .getByRole('navigation', { name: 'Main navigation' })
      .isVisible()
      .catch(() => false);
    if (navVisible) {
      return true;
    }

    const onboardingVisible = await page
      .getByText('Votre profil cible')
      .isVisible()
      .catch(() => false);
    if (onboardingVisible) {
      await completeOnboarding(page, {
        firstName: 'Jean',
        jobTitle: 'Développeur React Senior',
        location: 'Paris',
        ...profile,
      });
      return true;
    }

    return false;
  };

  const ready = await ensureOnce();
  if (!ready) {
    await page.reload().catch(() => {});
    await ensureOnce();
  }

  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByRole('button', { name: 'Feed' })).toBeVisible();
}

// ============================================================================
// Scan & Missions Helpers
// ============================================================================

/**
 * Mock les résultats de scan avec des missions personnalisées
 */
export async function mockScanResults(page: Page, missions: Mission[]) {
  await page.addInitScript((missionsData: Mission[]) => {
    // Stocker les missions pour le prochain scan
    (window as unknown as Record<string, unknown>).__mockMissions = missionsData;

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
            payload?: unknown;
          }) => {
            if (msg?.type === 'SCAN_START') {
              const mockMissions = (window as unknown as Record<string, unknown>).__mockMissions;
              setTimeout(() => {
                window.dispatchEvent(
                  new CustomEvent('dev:missions', {
                    detail: mockMissions,
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
  }, missions);
}

/**
 * Attend que le nombre spécifié de missions soit visible
 */
export async function waitForMissions(page: Page, count: number, timeout = 5000) {
  await expect
    .poll(async () => page.locator('[role="button"][tabindex="0"]').count(), { timeout })
    .toBeGreaterThanOrEqual(count);
}

/**
 * Attend que le feed soit chargé (scan terminé)
 */
export async function waitForScanComplete(page: Page, timeout = 10000) {
  await expect(page.getByText(/mission|Aucune mission/)).toBeVisible({ timeout });
}

/**
 * Lance un scan manuel via le bouton refresh
 */
export async function triggerScan(page: Page) {
  await page.getByTitle('Rafraichir').click();
}

// ============================================================================
// Mission Actions Helpers
// ============================================================================

/**
 * Récupère la première carte mission visible
 */
export async function getFirstMissionCard(page: Page): Promise<Locator> {
  return page.locator('[role="button"][tabindex="0"]').first();
}

/**
 * Marque une mission comme favorite
 */
export async function favoriteMission(card: Locator) {
  const starBtn = card.getByTitle('Ajouter aux favoris');
  await expect(starBtn).toBeVisible();
  await starBtn.click();
  await expect(card.getByTitle('Retirer des favoris')).toBeVisible({ timeout: 1000 });
}

/**
 * Retire une mission des favoris
 */
export async function unfavoriteMission(card: Locator) {
  const starBtn = card.getByTitle('Retirer des favoris');
  await expect(starBtn).toBeVisible();
  await starBtn.click();
  await expect(card.getByTitle('Ajouter aux favoris')).toBeVisible({ timeout: 1000 });
}

/**
 * Masque une mission
 */
export async function hideMission(card: Locator) {
  const hideBtn = card.getByTitle('Masquer');
  await expect(hideBtn).toBeVisible();
  await hideBtn.click();
}

/**
 * Active le filtre favoris
 */
export async function toggleFavoritesFilter(page: Page, showOnlyFavorites: boolean) {
  const favoritesToggle = page.getByTitle('Voir favoris');
  const allToggle = page.getByTitle('Voir toutes');

  if (showOnlyFavorites) {
    await favoritesToggle.click();
  } else {
    await allToggle.click();
  }
}

/**
 * Affiche les missions masquées
 */
export async function showHiddenMissions(page: Page) {
  const showHiddenBtn = page.getByRole('button', { name: /Voir les \d+ mission/ });
  await expect(showHiddenBtn).toBeVisible({ timeout: 5000 });
  await showHiddenBtn.click();
}

// ============================================================================
// Network & Offline Helpers
// ============================================================================

/**
 * Active/désactive le mode offline
 */
export async function toggleOffline(page: Page, offline: boolean) {
  await page.context().setOffline(offline);
}

/**
 * Simule une erreur réseau pour un connecteur spécifique
 */
export async function mockConnectorFailure(
  page: Page,
  connectorId: string,
  errorCode: number = 500
) {
  await page.addInitScript(
    ({ connector, code }: { connector: string; code: number }) => {
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
              if (msg?.type === 'SCAN_START' && msg?.payload?.connectorId === connector) {
                return {
                  type: 'SCAN_ERROR',
                  payload: {
                    connectorId: connector,
                    error: `HTTP ${code}`,
                    code,
                  },
                };
              }
              return origSend.call((val as Record<string, unknown>).runtime, msg);
            };
          }
        },
      });
    },
    { connector: connectorId, code: errorCode }
  );
}

// ============================================================================
// UI State Helpers
// ============================================================================

/**
 * Vérifie que le texte est visible (helper avec retry)
 */
export async function expectTextVisible(page: Page, text: string | RegExp, timeout = 2000) {
  await expect(page.getByText(text)).toBeVisible({ timeout });
}

/**
 * Attend que le loader disparaisse
 */
export async function waitForLoadingComplete(page: Page, timeout = 5000) {
  const loader = page.getByRole('status').filter({ hasText: /Chargement/ });
  await expect(loader).not.toBeVisible({ timeout });
}

/**
 * Récupère le nombre de missions affiché dans le header
 */
export async function getDisplayedMissionCount(page: Page): Promise<number> {
  const badge = page.locator('[aria-label$="missions visibles"]');
  const label = await badge.getAttribute('aria-label').catch(() => null);
  if (label) {
    const match = label.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  const missionText = await page
    .locator('text=/^\\d+ missions?$/')
    .first()
    .textContent()
    .catch(() => null);
  if (!missionText) {
    return 0;
  }

  const match = missionText.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Assert que le compteur de missions visibles affiche exactement `count`.
 * Utilise aria-label pour éviter les collisions de texte.
 */
export async function expectMissionCount(page: Page, count: number, timeout = 5000) {
  await expect
    .poll(() => getDisplayedMissionCount(page), { timeout })
    .toBe(count);
}

/**
 * Vérifie si l'indicateur offline est visible
 */
export async function isOfflineIndicatorVisible(page: Page): Promise<boolean> {
  const indicator = page.locator('[data-testid="offline-indicator"], text=Hors ligne').first();
  try {
    await expect(indicator).toBeVisible({ timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Prendre un snapshot de performance (mémoire)
 */
export async function captureMemoryMetrics(page: Page): Promise<{
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}> {
  const metrics = await page.evaluate(() => {
    const memory = (performance as unknown as Record<string, unknown>).memory as
      | {
          usedJSHeapSize: number;
          totalJSHeapSize: number;
          jsHeapSizeLimit: number;
        }
      | undefined;
    return {
      usedJSHeapSize: memory?.usedJSHeapSize ?? 0,
      totalJSHeapSize: memory?.totalJSHeapSize ?? 0,
      jsHeapSizeLimit: memory?.jsHeapSizeLimit ?? 0,
    };
  });
  return metrics;
}

/**
 * Compter les éléments dans le DOM
 */
export async function countDomElements(page: Page, selector: string): Promise<number> {
  return page.locator(selector).count();
}
