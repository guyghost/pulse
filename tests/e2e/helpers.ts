import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import type { UserProfile } from '../../src/lib/core/types/profile';
import type { Mission } from '../../src/lib/core/types/mission';

export const SIDE_PANEL = '/src/sidepanel/index.html';

// ============================================================================
// Dev Panel Helpers
// ============================================================================

export async function waitForDevPanel(page: Page) {
  await page.locator('button:has-text("Ctrl+Shift+D")').waitFor({ state: 'visible' });
}

export async function openDevPanel(page: Page) {
  await waitForDevPanel(page);
  await page.keyboard.press('Control+Shift+D');
  await expect(page.getByText('DEV PANEL')).toBeVisible();
}

export async function closeDevPanel(page: Page) {
  await page.keyboard.press('Control+Shift+D');
  await expect(page.getByText('DEV PANEL')).not.toBeVisible();
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
            msg: unknown,
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
}

/**
 * Complète l'onboarding avec un profil complet
 */
export async function completeOnboarding(page: Page, profile: Partial<UserProfile> = {}) {
  const defaultProfile = {
    firstName: 'Test',
    jobTitle: 'Développeur Fullstack',
    ...profile,
  };

  await fillOnboardingForm(page, defaultProfile);
  await page.getByRole('button', { name: /C.est parti|Commencer/ }).click();
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
            msg: unknown,
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
                  }),
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
  const missionText = count === 1 ? '1 mission' : `${count} missions`;
  await expect(page.getByText(new RegExp(`${count} mission`))).toBeVisible({ timeout });
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
  return page.locator('[role="button"]').first();
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
  const showHiddenLink = page.getByText(/Voir les \d+ masquee/);
  await expect(showHiddenLink).toBeVisible();
  await showHiddenLink.click();
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
export async function mockConnectorFailure(page: Page, connectorId: string, errorCode: number = 500) {
  await page.addInitScript(({ connector, code }: { connector: string; code: number }) => {
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
            msg: unknown,
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
  }, { connector: connectorId, code: errorCode });
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
  const headerText = await page.locator('text=/\\d+ mission/').textContent();
  if (!headerText) return 0;
  const match = headerText.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
