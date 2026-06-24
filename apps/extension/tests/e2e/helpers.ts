import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import type { UserProfile } from '../../src/lib/core/types/profile';
import type { Mission } from '../../src/lib/core/types/mission';

export const SIDE_PANEL = '/src/sidepanel/index.html';
export const FEED_SEARCH_PLACEHOLDER = 'Rechercher une mission, une stack, un client...';

export function feedSearchInput(page: Page): Locator {
  return page.getByRole('textbox', { name: FEED_SEARCH_PLACEHOLDER });
}

export function mainNavigation(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Main navigation' });
}

export function navButton(page: Page, name: string): Locator {
  return mainNavigation(page).getByRole('button', { name });
}

export function missionCards(page: Page): Locator {
  return page.locator('[data-testid="mission-feed"] [role="button"][tabindex="0"]');
}

export function favoritesToggle(page: Page): Locator {
  return page.getByRole('button', { name: 'Filtrer les favoris' });
}

export function allMissionsToggle(page: Page): Locator {
  return page.getByRole('button', { name: 'Voir toutes les missions' });
}

export function scanButton(page: Page): Locator {
  return page.getByRole('button', {
    name: /Lancer le scan des missions|Scan en cours|Scan indisponible hors ligne/,
  });
}

export function favoriteButton(card: Locator): Locator {
  return card.getByRole('button', { name: 'Ajouter la mission aux favoris' });
}

export function unfavoriteButton(card: Locator): Locator {
  return card.getByRole('button', { name: 'Retirer la mission des favoris' });
}

export function hideButton(card: Locator): Locator {
  return card.getByRole('button', { name: 'Masquer la mission' });
}

export function copyLinkButton(card: Locator): Locator {
  return card.getByRole('button', { name: 'Copier le lien de la mission' });
}

export function openMissionButton(card: Locator): Locator {
  return card.getByRole('button', { name: 'Ouvrir la mission sur la plateforme source' });
}

export async function clearFeedSearch(page: Page) {
  const clearButton = page.getByRole('button', { name: 'Effacer la recherche' });
  if (await clearButton.isVisible().catch(() => false)) {
    await clearButton.click();
  } else {
    await feedSearchInput(page).fill('');
  }
  await expect(feedSearchInput(page)).toHaveValue('');
}

export async function dismissFeedTour(page: Page) {
  const skipButton = page.getByRole('button', { name: 'Passer' });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
  }
}

export async function expectFeedReady(page: Page) {
  await expect(mainNavigation(page)).toBeVisible({
    timeout: 10000,
  });
  await expect(navButton(page, 'Feed')).toHaveAttribute('aria-current', 'page', {
    timeout: 10000,
  });
  await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });
  await dismissFeedTour(page);
}

// ============================================================================
// Dev Panel Helpers
// ============================================================================

export async function waitForDevPanel(page: Page) {
  await page.locator('button:has-text("Ctrl+Shift+D")').waitFor({ state: 'visible' });
}

export async function openDevPanel(page: Page) {
  if (
    await page
      .getByText('DEV PANEL')
      .isVisible()
      .catch(() => false)
  ) {
    return;
  }
  await waitForDevPanel(page);
  await page.keyboard.press('Control+Shift+D');
  await expect(page.getByText('DEV PANEL')).toBeVisible();
}

export async function closeDevPanel(page: Page) {
  const closeButton = page.getByRole('button', { name: 'Fermer le centre de contrôle dev' });
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
  } else {
    await page.keyboard.press('Control+Shift+D');
  }
  await expect(page.getByText('DEV PANEL')).not.toBeVisible();
}

export async function setFeedState(page: Page, state: 'empty' | 'loading' | 'loaded' | 'error') {
  await openDevPanel(page);
  await page.getByRole('button', { name: state }).click();
  await closeDevPanel(page);
}

export async function injectMissions(page: Page, count: number) {
  await openDevPanel(page);
  const missionCountInput = page.locator('input[type="range"]');
  await missionCountInput.evaluate((el, val) => {
    (el as HTMLInputElement).value = String(val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, count);
  await expect(missionCountInput).toHaveValue(String(count));
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
  await injectMissions(page, count);
  await waitForMissions(page, count, 5000);
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
    const profileStorageKey = '__missionpulse_e2e_saved_profile';
    const readSavedProfile = (): unknown => {
      const rawProfile = window.localStorage.getItem(profileStorageKey);
      return rawProfile ? (JSON.parse(rawProfile) as unknown) : null;
    };
    const writeSavedProfile = (profile: unknown) => {
      window.localStorage.setItem(profileStorageKey, JSON.stringify(profile));
    };
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
            if (msg?.type === 'GET_PROFILE') {
              return { type: 'PROFILE_RESULT', payload: readSavedProfile() };
            }
            if (msg?.type === 'SAVE_PROFILE') {
              writeSavedProfile(msg.payload);
              return { type: 'PROFILE_RESULT', payload: readSavedProfile() };
            }
            if (msg?.type === 'GET_FIRST_SCAN_DONE') {
              return { type: 'FIRST_SCAN_DONE_RESULT', payload: Boolean(readSavedProfile()) };
            }
            if (msg?.type === 'GET_ONBOARDING_COMPLETED') {
              return { type: 'ONBOARDING_COMPLETED_RESULT', payload: Boolean(readSavedProfile()) };
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
  if (profile.stack?.[0]) {
    await page.locator('#ob-stack').fill(profile.stack[0]);
    await page.locator('#ob-stack + button').click();
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
    stack: ['React'],
    ...profile,
  };

  await fillOnboardingForm(page, defaultProfile);
  await page.getByRole('button', { name: /Sauvegarder mon profil|C.est parti|Commencer/ }).click();
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
      .locator('#ob-firstname')
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

  await expectFeedReady(page);
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
              return {
                type: 'SCAN_COMPLETE',
                payload: mockMissions,
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
    .poll(async () => missionCards(page).count(), { timeout })
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
  await scanButton(page).click();
}

// ============================================================================
// Mission Actions Helpers
// ============================================================================

/**
 * Récupère la première carte mission visible
 */
export async function getFirstMissionCard(page: Page): Promise<Locator> {
  return missionCards(page).first();
}

/**
 * Marque une mission comme favorite
 */
export async function favoriteMission(card: Locator) {
  const previousFavoritesCount = await card
    .page()
    .getByRole('button', { name: 'Retirer la mission des favoris' })
    .count();
  const starBtn = favoriteButton(card);
  await expect(starBtn).toBeVisible();
  await starBtn.click();
  await expect
    .poll(
      async () =>
        card.page().getByRole('button', { name: 'Retirer la mission des favoris' }).count(),
      { timeout: 1000 }
    )
    .toBeGreaterThan(previousFavoritesCount);
}

/**
 * Retire une mission des favoris
 */
export async function unfavoriteMission(card: Locator) {
  const starBtn = unfavoriteButton(card);
  await expect(starBtn).toBeVisible();
  await starBtn.click();
  await expect(favoriteButton(card)).toBeVisible({ timeout: 1000 });
}

/**
 * Masque une mission
 */
export async function hideMission(card: Locator) {
  const hideBtn = hideButton(card);
  await expect(hideBtn).toBeVisible();
  await hideBtn.click();
}

/**
 * Active le filtre favoris
 */
export async function toggleFavoritesFilter(page: Page, showOnlyFavorites: boolean) {
  if (showOnlyFavorites) {
    await favoritesToggle(page).click();
  } else {
    await allMissionsToggle(page).click();
  }
}

/**
 * Affiche les missions masquées
 */
export async function showHiddenMissions(page: Page) {
  const showHiddenBtn = page.getByRole('button', { name: /Voir les \d+ mission.*masqu/i });
  await expect(showHiddenBtn).toBeVisible({ timeout: 5000 });
  await dismissFeedTour(page);
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
  const labels = await page
    .locator('[aria-label]')
    .evaluateAll((elements) =>
      elements
        .map((el) => el.getAttribute('aria-label'))
        .filter((label): label is string => Boolean(label?.endsWith('missions visibles')))
    );
  const label = labels[0] ?? null;
  if (!label) {
    return 0;
  }
  const match = label.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export async function getMissionTotalCount(page: Page): Promise<number> {
  const summaries = await page
    .locator('p')
    .evaluateAll((elements) =>
      elements
        .map((element) => element.textContent?.trim() ?? '')
        .filter((text) => /^\d+\/\d+ missions? tri/.test(text))
    );
  const summary = summaries[0] ?? '';
  const match = summary.match(/^\d+\/(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
}

/**
 * Assert que le total filtré de missions affiche exactement `count`.
 */
export async function expectMissionCount(page: Page, count: number, timeout = 5000) {
  await expect.poll(async () => getMissionTotalCount(page), { timeout }).toBe(count);
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
