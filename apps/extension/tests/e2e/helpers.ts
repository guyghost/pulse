import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import type { UserProfile } from '../../src/lib/core/types/profile';
import type { Mission } from '../../src/lib/core/types/mission';

export const SIDE_PANEL = '/src/sidepanel/index.html';

/**
 * Active toutes les surfaces (onglets + couche connectée) pour un test e2e.
 *
 * Au lancement, `applications` et `connected` sont désactivés
 * (`EXTENSION_SURFACE_FLAGS`). Les tests qui couvrent ces surfaces seedent
 * l'override dev via localStorage avant le chargement du side panel — voir
 * `apps/extension/src/models/surface-feature-flags.model.md` §5bis.
 */
export async function enableAllSurfaceFlags(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      '__missionpulse_dev_surface_flags',
      JSON.stringify({
        feed: true,
        profile: true,
        cv: true,
        applications: true,
        tjm: true,
        settings: true,
        connected: true,
      })
    );
  });
}
export const FEED_SEARCH_PLACEHOLDER = 'Rechercher une mission…';

export function feedSearchInput(page: Page): Locator {
  return page.getByRole('textbox', { name: FEED_SEARCH_PLACEHOLDER });
}

export function mainNavigation(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Main navigation' });
}

export function navButton(page: Page, name: string): Locator {
  return mainNavigation(page).getByRole('button', { name });
}

type SettingsSectionId = 'sources' | 'alerts' | 'account' | 'data';

/**
 * Les réglages sont organisés en accordéon (`SettingsSectionId`, défini dans
 * SettingsPage.svelte) et seule la section 'sources' est ouverte par défaut.
 * Ce helper déplie la section demandée via les ids stables
 * `settings-trigger-{id}` / `settings-panel-{id}`.
 */
export async function openSettingsSection(page: Page, sectionId: SettingsSectionId): Promise<void> {
  const trigger = page.locator(`#settings-trigger-${sectionId}`);
  const panel = page.locator(`#settings-panel-${sectionId}`);
  // Échec rapide et diagnostic si l'id ne correspond plus au DOM (typo, refonte).
  await expect(trigger).toBeVisible({ timeout: 2000 });
  if (await panel.isVisible().catch(() => false)) {
    return;
  }
  await trigger.click();
  await expect(panel).toBeVisible();
}

export function missionCards(page: Page): Locator {
  return page.getByTestId('mission-feed').getByRole('article');
}

/**
 * Favorites filter — moved into the operational-details dashboard by the
 * filter-dock redesign. Anchored by its tooltip title; requires the details
 * panel to be open (see openOperationalDetails).
 */
export function favoritesToggle(page: Page): Locator {
  return page.getByTitle('Filtrer les favoris');
}

/** Alert-only mode exit button (rendered when the alert filter hides missions). */
export function allMissionsToggle(page: Page): Locator {
  return page.getByRole('button', { name: 'Afficher toutes les missions' });
}

/** Hidden-missions toggle — renamed by the filter-dock redesign. */
export function hiddenMissionsToggle(page: Page): Locator {
  return page.getByRole('button', { name: /Voir les ignorées|Masquer les ignorées/ });
}

/**
 * Hero scan control. Only rendered when the feed is EMPTY (heroCompact is
 * derived from totalMissions > 0 — with missions present there is no visible
 * scan control; manual scans go through the `r` shortcut, see triggerScan).
 */
export function scanButton(page: Page): Locator {
  return page.getByRole('button', {
    name: /^(Lancer le scan des missions|Réessayer le scan des missions|Stopper le scan en cours|Scan indisponible hors ligne)$/,
  });
}

/** Opens the operational-details dashboard and waits for its filters. */
export async function openOperationalDetails(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: /détails opérationnels/i });
  if ((await toggle.getAttribute('aria-expanded').catch(() => null)) !== 'true') {
    await toggle.click();
  }
  await expect(favoritesToggle(page)).toBeVisible({ timeout: 5000 });
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

export function missionDetailsToggle(card: Locator): Locator {
  return card.getByRole('button', { name: /les détails de la mission/ });
}

/**
 * Ouvre le disclosure de la carte pour exposer les actions (masquer,
 * comparer, copier, ouvrir, investiguer). Le content-first redesign garde
 * ces actions dans la zone de détails repliée par défaut.
 */
export async function expandMission(card: Locator) {
  const toggle = missionDetailsToggle(card);
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
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
  await expect(page.locator('[data-initial-shell]')).toHaveCount(0, {
    timeout: 10000,
  });
  await expect(navButton(page, 'Missions')).toHaveAttribute('aria-current', 'page', {
    timeout: 10000,
  });
  await expect(feedSearchInput(page)).toBeVisible({ timeout: 10000 });
  await dismissFeedTour(page);
}

// ============================================================================
// Dev Panel Helpers
// ============================================================================

export function devPanel(page: Page): Locator {
  return page.locator('div.fixed.bottom-0').filter({ has: page.getByText('DEV PANEL') });
}

export function devPanelMissionCountInput(page: Page): Locator {
  return devPanel(page).locator('input[type="range"][max="500"]');
}

export function feedRegion(page: Page): Locator {
  return page.getByTestId('mission-feed');
}

export async function expectFeedEmptyState(page: Page, timeout = 5000) {
  await expect(feedRegion(page).getByText(/Aucune mission/)).toBeVisible({ timeout });
}

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
  // Wait for DevPanel component to finish loading (it's dynamically imported in App.svelte)
  await page.waitForFunction(
    () => {
      return (window as unknown as { __devPanelReady?: boolean }).__devPanelReady === true;
    },
    { timeout: 10000 }
  );
  await page.keyboard.press('Control+Shift+KeyD');
  await expect(page.getByText('DEV PANEL')).toBeVisible({ timeout: 10000 });
}

export async function closeDevPanel(page: Page) {
  const closeButton = page.getByRole('button', { name: 'Fermer le centre de contrôle dev' });
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.dispatchEvent('click');
  } else {
    await page.keyboard.press('Control+Shift+D');
  }
  await expect(page.getByText('DEV PANEL')).not.toBeVisible();
}

export async function setFeedState(page: Page, state: 'empty' | 'loading' | 'loaded' | 'error') {
  await openDevPanel(page);
  await devPanel(page).getByRole('button', { name: state }).click();
  await closeDevPanel(page);
}

export async function injectMissions(page: Page, count: number) {
  await openDevPanel(page);
  const missionCountInput = devPanelMissionCountInput(page);
  await missionCountInput.evaluate((el, val) => {
    (el as HTMLInputElement).value = String(val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, count);
  await expect(missionCountInput).toHaveValue(String(count));
  // exact: true — the DevPanel also has an "Inject QA seed (500)" button whose
  // accessible name contains "inject", which would otherwise cause a strict-mode
  // violation (2 elements). We want the volume injector button named exactly "inject".
  await devPanel(page).getByRole('button', { name: 'inject', exact: true }).dispatchEvent('click');
  await closeDevPanel(page);

  // Two dev-mode timing hazards can mask the injected set:
  //  1. The feed wires its `dev:missions` listener in a Svelte $effect that may not be attached
  //     yet when the DevPanel click dispatches the event.
  //  2. `smartLoad()` auto-scans on mount; its delayed SCAN_COMPLETE (~800ms) re-reads the
  //     pre-injection localStorage snapshot and overwrites the feed with the default 10 missions.
  // Waiting for the scan to settle, then re-dispatching synchronously, makes the injection stick.
  await expect.poll(async () => getMissionTotalCount(page), { timeout: 5000 }).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const detail = JSON.parse(window.localStorage.getItem('__missionpulse_dev_missions') ?? '[]');
    window.dispatchEvent(new CustomEvent('dev:missions', { detail }));
  });
  await expect.poll(async () => getMissionTotalCount(page), { timeout: 5000 }).toBe(count);
}

/**
 * Vide le feed puis injecte exactement `count` missions.
 * Utilise le DevPanel pour garantir un état propre sans missions résiduelles.
 */
export async function clearAndInjectMissions(page: Page, count: number) {
  await setFeedState(page, 'empty');
  await page.waitForTimeout(200);
  await injectMissions(page, count);
  // The feed renders missions in batches (BATCH_SIZE=20), so missionCards().count() reflects only
  // the rendered slice. Assert on the feed's reported total instead.
  await expectMissionCount(page, count, 5000);
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
    const writeSavedProfile = (profile: unknown) => {
      window.localStorage.setItem(profileStorageKey, JSON.stringify(profile));
    };
    if (window.localStorage.getItem(profileStorageKey) === null) {
      window.localStorage.setItem('__missionpulse_dev_profile', 'null');
      window.localStorage.setItem('__missionpulse_dev_first_scan_done', 'false');
      window.localStorage.setItem('__missionpulse_dev_onboarding_completed', 'false');
    }
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
            if (msg?.type === 'SAVE_PROFILE') {
              const response = (await origSend.call(
                (val as Record<string, unknown>).runtime,
                msg
              )) as { type?: string; payload?: unknown };
              if (response.type === 'PROFILE_RESULT' && response.payload !== null) {
                writeSavedProfile(response.payload);
              }
              return response;
            }
            return origSend.call((val as Record<string, unknown>).runtime, msg);
          };
        }
      },
    });
  });
}

/**
 * Onboarding wizard — machine-driven 5-step flow (OnboardingFlow.svelte):
 * welcome → connecting (sources) → identity → preferences → skills →
 * notifying → persisting/scanning → completed. Guards live in the flow
 * machine: ≥1 source, firstName+jobTitle, tjmMin>0 ∧ tjmMax≥tjmMin, ≥1 keyword.
 */

/** Welcome heading of the outcome-led onboarding screen. */
export function onboardingWelcomeHeading(page: Page): Locator {
  return page.getByRole('heading', { name: 'Toutes vos missions freelance' });
}

/**
 * Attend exactement un bouton « Continuer » puis le clique. Les transitions
 * fade (120ms) de Svelte peuvent garder le bouton de l'étape précédente
 * attaché au DOM — toHaveCount(1) attend la fin de la transition.
 */
export async function clickContinue(page: Page) {
  const button = page.getByRole('button', { name: 'Continuer', exact: true });
  await expect(button).toHaveCount(1);
  await button.click();
}

/**
 * Passe l'écran d'accueil (outcome-led welcome) et attend l'étape « Connectez
 * vos sources » (phase `connecting` de la machine d'états).
 */
export async function startOnboardingWizard(page: Page) {
  const connectingHeading = page.getByRole('heading', { name: 'Connectez vos sources' });
  if (!(await connectingHeading.isVisible().catch(() => false))) {
    const welcomeStart = page.getByRole('button', { name: 'Commencer', exact: true });
    // Attendre que l'écran d'accueil soit monté avant de décider de cliquer
    // (isVisible() immédiat peut courir avant l'hydratation de l'app).
    await expect(welcomeStart.or(connectingHeading)).toBeVisible({ timeout: 10000 });
    if (await welcomeStart.isVisible().catch(() => false)) {
      await welcomeStart.click();
    }
  }
  await expect(connectingHeading).toBeVisible({ timeout: 10000 });
}

/** Connecte la première source proposée puis passe à l'étape identité. */
export async function connectFirstSource(page: Page, sourceName = 'Free-Work') {
  const source = page.getByRole('button', { name: sourceName, exact: true });
  await expect(source).toBeVisible();
  await source.click();
  await expect(source).toHaveAttribute('aria-pressed', 'true');
  await clickContinue(page);
  await expect(page.getByRole('heading', { name: 'Qui êtes-vous ?' })).toBeVisible();
}

/** Remplit l'étape identité (Prénom/Métier obligatoires) puis continue. */
export async function fillIdentityStep(
  page: Page,
  profile: { firstName?: string; jobTitle?: string; location?: string }
) {
  if (profile.firstName !== undefined) {
    await page.getByLabel('Prénom').fill(profile.firstName);
  }
  if (profile.jobTitle !== undefined) {
    // Rôle + textbox : avec VITE_COPILOT_ROLLOUT_ENABLED=true (CI), la page
    // Suivi montée en arrière-plan expose une case à cocher « Métier »
    // (CopilotPanel) — getByLabel brut violerait le strict mode. La requête
    // par rôle ignore aussi le sous-arbre aria-hidden.
    await page.getByRole('textbox', { name: 'Métier', exact: true }).fill(profile.jobTitle);
  }
  if (profile.location !== undefined) {
    await page.getByLabel('Localisation (optionnel)').fill(profile.location);
  }
  await clickContinue(page);
  await expect(page.getByRole('heading', { name: 'Quels sont vos critères ?' })).toBeVisible();
}

/** Remplit l'étape critères (TJM) puis continue vers les compétences. */
export async function fillPreferencesStep(page: Page, tjmMin = 500, tjmMax = 700) {
  await page.getByLabel('TJM min (€)').fill(String(tjmMin));
  await page.getByLabel('TJM max (€)').fill(String(tjmMax));
  await clickContinue(page);
  await expect(page.getByRole('heading', { name: 'Vos compétences clés' })).toBeVisible();
}

/** Ajoute un mot-clé (champ + Entrée) puis continue vers les alertes. */
export async function fillSkillsStep(page: Page, keyword = 'React') {
  const input = page.locator('#onboarding-skill-input');
  await expect(input).toBeVisible();
  await input.fill(keyword);
  await input.press('Enter');
  await expect(page.getByRole('button', { name: `Retirer ${keyword}` })).toBeVisible();
  await clickContinue(page);
  await expect(page.getByRole('heading', { name: 'Soyez alerté·e' })).toBeVisible();
}

/**
 * Lance le premier scan depuis l'étape notifications et attend la
 * redirection vers le feed (persist → scan → completed → onComplete).
 */
export async function submitOnboardingScan(page: Page) {
  const launch = page.getByRole('button', { name: 'Lancer mon premier scan' });
  await expect(launch).toBeEnabled({ timeout: 10000 });
  await launch.click();
  await expect(navButton(page, 'Missions')).toHaveAttribute('aria-current', 'page', {
    timeout: 15000,
  });
}

/**
 * Complète l'onboarding avec un profil complet (toutes les étapes).
 */
export async function completeOnboarding(page: Page, profile: Partial<UserProfile> = {}) {
  const {
    firstName = 'Test',
    jobTitle = 'Développeur Fullstack',
    location = 'Paris',
    tjmMin = 500,
    tjmMax = 700,
  } = profile;
  const keyword = profile.keywords?.[0] ?? 'React';

  await startOnboardingWizard(page);
  await connectFirstSource(page);
  await fillIdentityStep(page, { firstName, jobTitle, location });
  await fillPreferencesStep(page, tjmMin, tjmMax);
  await fillSkillsStep(page, keyword);
  await submitOnboardingScan(page);
}

/**
 * Ouvre l'application et complète l'onboarding si nécessaire pour arriver sur le feed.
 */
export async function ensureFeedVisible(page: Page, profile: Partial<UserProfile> = {}) {
  await page.goto(SIDE_PANEL);

  const navigation = mainNavigation(page);
  const welcomeStart = page.getByRole('button', { name: 'Commencer', exact: true });
  const connectingHeading = page.getByRole('heading', { name: 'Connectez vos sources' });
  await expect(navigation.or(welcomeStart).or(connectingHeading)).toBeVisible({
    timeout: 10000,
  });

  if (
    (await welcomeStart.isVisible().catch(() => false)) ||
    (await connectingHeading.isVisible().catch(() => false))
  ) {
    await completeOnboarding(page, {
      firstName: 'Jean',
      jobTitle: 'Développeur React Senior',
      location: 'Paris',
      ...profile,
    });
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
    const runtimeListeners: Array<
      (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => void
    > = [];

    function emitRuntimeMessage(message: unknown): void {
      for (const listener of runtimeListeners) {
        listener(message, { id: 'e2e-scan-results' }, () => {});
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
          if (message.type !== 'SCAN_START' || !message.payload?.operationId) {
            return originalSendMessage(msg);
          }

          const operationId = message.payload.operationId;
          const mockMissions = (window as unknown as Record<string, unknown>).__mockMissions;
          window.setTimeout(() => {
            emitRuntimeMessage({
              type: 'SCAN_COMPLETE',
              payload: { operationId, missions: mockMissions },
            });
          }, 0);

          return { type: 'SCAN_STARTED', payload: { operationId } };
        };
      },
    });
  }, missions);

  await page.reload();
  await expectFeedReady(page);
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
 * Lance un scan manuel. Prefers any visible scan-start control (empty-feed
 * hero, overview "Scanner" CTA, feed error retry); falls back to the `r`
 * keyboard shortcut, which is the ONLY manual affordance once missions are
 * loaded. The shortcut registers from a mount $effect — retry it a few times
 * (see src/models/keyboard-shortcuts-help.model.md, OPEN delivery).
 */
const SCAN_START_BUTTON_NAMES = [
  'Lancer le scan des missions',
  'Réessayer le scan des missions',
  'Scanner',
  'Relancer le scan',
  'Réessayer',
] as const;

export async function triggerScan(page: Page) {
  const busy = page.getByText('Collecte...', { exact: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await busy.isVisible().catch(() => false)) {
      return;
    }
    for (const name of SCAN_START_BUTTON_NAMES) {
      const button = page.getByRole('button', { name, exact: true }).first();
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        return;
      }
    }
    await page.keyboard.press('r');
    await page.waitForTimeout(300);
  }
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
  // 5000ms — dev-mode favorite persistence re-renders the (possibly filtered) list
  // asynchronously and can exceed 1s under parallel-suite load; the 1000ms poll flaked
  // ~1-in-3 full runs on the "favorite from search results" path. Aligns with the file's
  // other polls (injectMissions, expectMissionCount, waitForMissions all use 5000ms).
  await expect
    .poll(
      async () =>
        card.page().getByRole('button', { name: 'Retirer la mission des favoris' }).count(),
      { timeout: 5000 }
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
  // 5000ms — same dev-mode re-render timing as favoriteMission above.
  await expect(favoriteButton(card)).toBeVisible({ timeout: 5000 });
}

/**
 * Masque une mission
 */
export async function hideMission(card: Locator) {
  await expandMission(card);
  const hideBtn = hideButton(card);
  await expect(hideBtn).toBeVisible();
  await hideBtn.click();
}

/**
 * Active/désactive le filtre favoris. The dashboard exposes a single toggle
 * control (no aria-pressed), so both directions click the same button after
 * making sure the operational-details dashboard is open.
 */
export async function toggleFavoritesFilter(page: Page, _showOnlyFavorites: boolean) {
  await openOperationalDetails(page);
  await favoritesToggle(page).click();
  await dismissFeedTour(page);
}

/**
 * Affiche les missions masquées
 */
export async function showHiddenMissions(page: Page) {
  const showHiddenBtn = hiddenMissionsToggle(page);
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
      const runtimeListeners: Array<
        (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => void
      > = [];

      function emitRuntimeMessage(message: unknown): void {
        for (const listener of runtimeListeners) {
          listener(message, { id: 'e2e-connector-failure' }, () => {});
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
            if (message.type !== 'SCAN_START' || !message.payload?.operationId) {
              return originalSendMessage(msg);
            }

            const operationId = message.payload.operationId;
            window.setTimeout(() => {
              emitRuntimeMessage({
                type: 'SCAN_ERROR',
                payload: {
                  operationId,
                  message: `Le connecteur ${connector} a échoué avec HTTP ${code}.`,
                  code: `HTTP_${code}`,
                },
              });
            }, 0);

            return { type: 'SCAN_STARTED', payload: { operationId } };
          };
        },
      });
    },
    { connector: connectorId, code: errorCode }
  );

  await page.reload();
  await expectFeedReady(page);
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
  const labels = await page.locator('[aria-label]').evaluateAll((elements) =>
    elements
      .map((el) => el.getAttribute('aria-label'))
      // "N missions visibles" / "1 mission visible" — the compact hero
      // renders both singular and plural forms.
      .filter((label): label is string => /missions? visibles?$/.test(label ?? ''))
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
  // Certains états du feed (ex. après un cycle offline/restore) n'affichent
  // pas la ligne « N/N missions triées » — retomber sur l'aria-label compact
  // « N missions visibles » du hero.
  return getDisplayedMissionCount(page);
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
