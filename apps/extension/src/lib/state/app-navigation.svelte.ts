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
  let previousPageIndex = PAGE_INDEX.feed;
  let profile: UserProfile | null = null;
  let bootstrapRevision = 0;

  async function bootstrap(): Promise<void> {
    const revision = (bootstrapRevision += 1);
    bootStatus = 'bootstrapping';

    try {
      const loadedProfile = await getProfile();
      const [firstScanDone, onboardingCompleted] = loadedProfile
        ? [false, true]
        : await Promise.all([getFirstScanDone(), getOnboardingCompleted()]);
      const result = {
        profile: loadedProfile,
        firstScanDone,
        onboardingCompleted,
      };

      if (revision !== bootstrapRevision) {
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
    } catch {
      bootStatus = 'error';
    }
  }

  void bootstrap();

  try {
    subscribeMessages((message) => {
      if (message.type === 'PROFILE_UPDATED') {
        profile = message.payload;
        hasCompletedOnboarding = true;
      }
    });
  } catch {
    // Outside extension context
  }

  function navigate(page: Page) {
    const newIndex = PAGE_INDEX[page];
    transitionDirection = newIndex > previousPageIndex ? 1 : -1;
    previousPageIndex = newIndex;
    currentPage = page;
  }

  function completeOnboarding() {
    setOnboardingCompleted().catch(() => {});

    if (profile === null) {
      void import('$lib/core/profile/normalize-profile')
        .then(({ withProfileDefaults }) => {
          if (profile !== null) {
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
  }

  function resetToOnboarding() {
    clearOnboardingCompleted().catch(() => {});
    hasCompletedOnboarding = false;
    transitionDirection = -1;
    previousPageIndex = PAGE_INDEX.onboarding;
    currentPage = 'onboarding';
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

    navigate,
    completeOnboarding,
    resetToOnboarding,
  };
}
