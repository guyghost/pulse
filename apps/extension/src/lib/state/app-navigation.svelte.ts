/**
 * App Navigation State — extracted from App.svelte.
 *
 * Manages page routing, transition direction, and onboarding status.
 * Pure Svelte 5 runes, no chrome.* access.
 */
import { getProfile, saveProfile } from '$lib/shell/facades/settings.facade';
import {
  clearOnboardingCompleted,
  getFirstScanDone,
  getOnboardingCompleted,
  setOnboardingCompleted,
} from '$lib/shell/facades/app-flags.facade';
import { subscribeMessages } from '$lib/shell/messaging/bridge';
import type { UserProfile } from '$lib/core/types/profile';

export type Page = 'feed' | 'profile' | 'cv' | 'applications' | 'tjm' | 'settings' | 'onboarding';
export type AppBootStatus = 'bootstrapping' | 'ready' | 'error';
export type PageLoadStatus = 'loading' | 'ready' | 'error';

export interface PageLoadSnapshot {
  status: PageLoadStatus;
  requestId: string;
  attempt: number;
  error: string | null;
}

const PAGE_INDEX: Record<Page, number> = {
  onboarding: -1,
  feed: 0,
  profile: 1,
  cv: 2,
  applications: 3,
  tjm: 4,
  settings: 5,
};

export const NAV_ITEMS: { page: Page; label: string; icon: string; ariaLabel?: string }[] = [
  { page: 'feed', label: 'Feed', icon: 'briefcase' },
  { page: 'profile', label: 'Profil', icon: 'user' },
  { page: 'cv', label: 'CV', icon: 'file-text' },
  { page: 'applications', label: 'Suivi', icon: 'mail' },
  { page: 'tjm', label: 'TJM', icon: 'chart-column' },
  { page: 'settings', label: 'Réglages', ariaLabel: 'Réglages Settings', icon: 'settings' },
];

function resolveInitialPage(result: {
  profile: UserProfile | null;
  firstScanDone: boolean;
  onboardingCompleted: boolean;
}): Page {
  if (result.profile || result.firstScanDone || result.onboardingCompleted) {
    return 'feed';
  }
  return 'onboarding';
}

export function createAppNavigation() {
  let currentPage = $state<Page>('feed');
  let hasCompletedOnboarding = $state(false);
  let transitionDirection = $state<1 | -1>(1);
  let bootStatus = $state<AppBootStatus>('bootstrapping');
  let bootError = $state<string | null>(null);
  let previousPageIndex = PAGE_INDEX.feed;
  let profile: UserProfile | null = null;
  let bootstrapRevision = 0;
  let disposed = false;
  let unsubscribeMessages: (() => void) | null = null;

  async function bootstrap(): Promise<void> {
    if (disposed) {
      return;
    }

    const revision = (bootstrapRevision += 1);
    bootStatus = 'bootstrapping';
    bootError = null;

    try {
      const loadedProfile = await getProfile();
      if (disposed || revision !== bootstrapRevision) {
        return;
      }

      const [firstScanDone, onboardingCompleted] = loadedProfile
        ? [false, true]
        : await Promise.all([getFirstScanDone(), getOnboardingCompleted()]);
      const result = {
        profile: loadedProfile,
        firstScanDone,
        onboardingCompleted,
      };

      if (disposed || revision !== bootstrapRevision) {
        return;
      }

      if (result.profile) {
        profile = result.profile;
      }

      if (hasCompletedOnboarding) {
        if (currentPage === 'onboarding') {
          currentPage = 'feed';
        }
        previousPageIndex = PAGE_INDEX[currentPage];
      } else {
        hasCompletedOnboarding = Boolean(result.profile) || result.onboardingCompleted;
        currentPage = resolveInitialPage(result);
        previousPageIndex = PAGE_INDEX[currentPage];
      }

      transitionDirection = 1;
      bootStatus = 'ready';
    } catch (error: unknown) {
      if (disposed || revision !== bootstrapRevision) {
        return;
      }

      bootError = error instanceof Error ? error.message : 'Bootstrap failed.';
      bootStatus = 'error';
    }
  }

  function retryBootstrap(): Promise<void> {
    return bootstrap();
  }

  void bootstrap();

  try {
    unsubscribeMessages = subscribeMessages((message) => {
      if (!disposed && message.type === 'PROFILE_UPDATED') {
        profile = message.payload;
        hasCompletedOnboarding = true;
      }
    });
  } catch {
    // Outside extension context
  }

  function navigate(page: Page) {
    if (disposed || bootStatus !== 'ready') {
      return;
    }

    const newIndex = PAGE_INDEX[page];
    transitionDirection = newIndex > previousPageIndex ? 1 : -1;
    previousPageIndex = newIndex;
    currentPage = page;
  }

  async function completeOnboarding(): Promise<boolean> {
    if (disposed) {
      return false;
    }

    try {
      await setOnboardingCompleted();
    } catch {
      // The canonical flag writer is the truth. A `saved:false` response must
      // never be projected as a completed onboarding transition.
      return false;
    }
    if (disposed) {
      return false;
    }

    if (profile === null) {
      void import('$lib/core/profile/normalize-profile')
        .then(({ withProfileDefaults }) => {
          if (disposed || profile !== null) {
            return;
          }
          const seededProfile = withProfileDefaults({});
          profile = seededProfile;
          saveProfile(seededProfile).catch(() => {});
        })
        .catch(() => {});
    }

    hasCompletedOnboarding = true;
    transitionDirection = 1;
    previousPageIndex = PAGE_INDEX.feed;
    currentPage = 'feed';
    return true;
  }

  function resetToOnboarding() {
    if (disposed) {
      return;
    }

    clearOnboardingCompleted().catch(() => {});
    hasCompletedOnboarding = false;
    transitionDirection = -1;
    previousPageIndex = PAGE_INDEX.onboarding;
    currentPage = 'onboarding';
  }

  function dispose(): void {
    if (disposed) {
      return;
    }

    disposed = true;
    bootstrapRevision += 1;
    unsubscribeMessages?.();
    unsubscribeMessages = null;
  }

  return {
    get currentPage() {
      return currentPage;
    },
    get hasCompletedOnboarding() {
      return hasCompletedOnboarding;
    },
    get transitionDirection() {
      return transitionDirection;
    },
    get bootStatus(): AppBootStatus {
      return bootStatus;
    },
    get bootError(): string | null {
      return bootError;
    },

    navigate,
    retryBootstrap,
    completeOnboarding,
    resetToOnboarding,
    dispose,
  };
}
