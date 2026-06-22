/**
 * App Navigation State — extracted from App.svelte.
 *
 * Manages page routing, transition direction, and onboarding status.
 * Pure Svelte 5 runes, no chrome.* access.
 */
import { getProfile } from '$lib/shell/facades/settings.facade';
import {
  clearOnboardingCompleted,
  getFirstScanDone,
  getOnboardingCompleted,
  setOnboardingCompleted,
} from '$lib/shell/facades/app-flags.facade';

export type Page = 'feed' | 'profile' | 'cv' | 'applications' | 'tjm' | 'settings' | 'onboarding';

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

export function createAppNavigation() {
  let currentPage = $state<Page>('feed');
  let hasCompletedOnboarding = $state(false);
  let previousPageIndex = $state(PAGE_INDEX['feed']);
  let transitionDirection = $state(1);

  function navigate(page: Page) {
    const newIndex = PAGE_INDEX[page];
    transitionDirection = newIndex > previousPageIndex ? 1 : -1;
    previousPageIndex = newIndex;
    currentPage = page;
  }

  function completeOnboarding() {
    hasCompletedOnboarding = true;
    transitionDirection = 1;
    previousPageIndex = PAGE_INDEX['feed'];
    currentPage = 'feed';
    void setOnboardingCompleted();
  }

  function resetToOnboarding() {
    hasCompletedOnboarding = false;
    transitionDirection = -1;
    previousPageIndex = PAGE_INDEX['onboarding'];
    currentPage = 'onboarding';
    void clearOnboardingCompleted();
  }

  // Fresh installs can land directly on the feed after the zero-config scan,
  // while still keeping onboarding available as a non-blocking flow.
  getProfile()
    .then(async (profile) => {
      if (profile) {
        hasCompletedOnboarding = true;
        previousPageIndex = PAGE_INDEX['feed'];
        currentPage = 'feed';
        return;
      }

      const [firstScanDone, onboardingCompleted] = await Promise.all([
        getFirstScanDone(),
        getOnboardingCompleted(),
      ]);

      hasCompletedOnboarding = onboardingCompleted;
      previousPageIndex = PAGE_INDEX['feed'];
      currentPage = firstScanDone ? 'feed' : onboardingCompleted ? 'feed' : 'onboarding';
    })
    .catch(() => {
      // Outside extension context — keep default feed/onboarding behaviour
    });

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

    navigate,
    completeOnboarding,
    resetToOnboarding,
  };
}
