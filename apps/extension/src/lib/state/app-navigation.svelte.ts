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
import { appLifecycleMachine, type AppBootStatus } from '$lib/shell/machines/app-lifecycle.machine';
import { subscribeMessages } from '$lib/shell/messaging/bridge';
import { createSvelteActor } from '$lib/shell/state/xstate.svelte';

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
  const actor = createSvelteActor(appLifecycleMachine, {
    input: {
      deps: {
        loadProfile: getProfile,
        saveProfile,
        getFirstScanDone,
        getOnboardingCompleted,
        setOnboardingCompleted,
        clearOnboardingCompleted,
      },
      pageIndex: PAGE_INDEX,
    },
  });

  try {
    subscribeMessages((message) => {
      if (message.type === 'PROFILE_UPDATED') {
        actor.send({ type: 'PROFILE_UPDATED', profile: message.payload });
      }
    });
  } catch {
    // Outside extension context
  }

  function navigate(page: Page) {
    actor.send({ type: 'NAVIGATE', page });
  }

  function completeOnboarding() {
    actor.send({ type: 'COMPLETE_ONBOARDING' });
  }

  function resetToOnboarding() {
    actor.send({ type: 'RESET_ONBOARDING' });
  }

  return {
    get currentPage() {
      return actor.snapshot.context.currentPage;
    },
    get hasCompletedOnboarding() {
      return actor.snapshot.context.hasCompletedOnboarding;
    },
    get transitionDirection() {
      return actor.snapshot.context.transitionDirection;
    },
    get bootStatus(): AppBootStatus {
      return actor.snapshot.context.bootStatus;
    },

    navigate,
    completeOnboarding,
    resetToOnboarding,
  };
}
