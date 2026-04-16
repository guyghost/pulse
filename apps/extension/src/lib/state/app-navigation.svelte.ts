/**
 * App Navigation State — extracted from App.svelte.
 *
 * Manages page routing, transition direction, and onboarding status.
 * Pure Svelte 5 runes, no chrome.* access.
 */
import { getProfile } from '$lib/shell/facades/settings.facade';
import { getFirstScanDone } from '$lib/shell/storage/first-scan';

export type Page = 'feed' | 'tjm' | 'settings' | 'onboarding';

const PAGE_INDEX: Record<Page, number> = {
  onboarding: -1,
  feed: 0,
  tjm: 1,
  settings: 2,
};

export const NAV_ITEMS: { page: Page; label: string; icon: string }[] = [
  { page: 'feed', label: 'Feed', icon: 'briefcase' },
  { page: 'tjm', label: 'TJM', icon: 'chart-column' },
  { page: 'settings', label: 'Settings', icon: 'settings' },
];

export function createAppNavigation() {
  let currentPage = $state<Page>('onboarding');
  let hasCompletedOnboarding = $state(false);
  let previousPageIndex = $state(PAGE_INDEX['onboarding']);
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
  }

  function resetToOnboarding() {
    hasCompletedOnboarding = false;
    transitionDirection = -1;
    previousPageIndex = PAGE_INDEX['onboarding'];
    currentPage = 'onboarding';
  }

  // Check if profile exists OR a first scan was done (zero-config flow)
  getProfile()
    .then(async (profile) => {
      if (profile) {
        hasCompletedOnboarding = true;
        previousPageIndex = PAGE_INDEX['feed'];
        currentPage = 'feed';
        return;
      }
      // No profile — check if zero-config first scan ran
      const firstScanDone = await getFirstScanDone();
      if (firstScanDone) {
        // Skip wizard — land directly on feed with refinement banner
        hasCompletedOnboarding = true;
        previousPageIndex = PAGE_INDEX['feed'];
        currentPage = 'feed';
      }
    })
    .catch(() => {
      // Outside extension context — show onboarding
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
