import { assign, fromPromise, setup } from 'xstate';
import type { UserProfile } from '$lib/core/types/profile';
import type { Page } from '$lib/state/app-navigation.svelte';

export interface AppLifecycleDeps {
  loadProfile(): Promise<UserProfile | null>;
  getFirstScanDone(): Promise<boolean>;
  getOnboardingCompleted(): Promise<boolean>;
  setOnboardingCompleted(): Promise<void>;
  clearOnboardingCompleted(): Promise<void>;
}

export type AppBootStatus = 'bootstrapping' | 'ready' | 'error';

export interface AppLifecycleContext {
  deps: AppLifecycleDeps;
  currentPage: Page;
  hasCompletedOnboarding: boolean;
  bootStatus: AppBootStatus;
  previousPageIndex: number;
  previousPageIndexFor(page: Page): number;
  transitionDirection: 1 | -1;
  profile: UserProfile | null;
  error: string | null;
}

export type AppLifecycleEvent =
  | { type: 'BOOTSTRAP' }
  | { type: 'NAVIGATE'; page: Page }
  | { type: 'COMPLETE_ONBOARDING' }
  | { type: 'RESET_ONBOARDING' }
  | { type: 'PROFILE_UPDATED'; profile: UserProfile }
  | { type: 'xstate.done.actor.bootstrap'; output: BootstrapResult }
  | { type: 'xstate.error.actor.bootstrap'; error: unknown };

export interface AppLifecycleInput {
  deps: AppLifecycleDeps;
  pageIndex: Record<Page, number>;
}

interface BootstrapResult {
  profile: UserProfile | null;
  firstScanDone: boolean;
  onboardingCompleted: boolean;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Erreur lors du bootstrap';

function resolveInitialPage(result: BootstrapResult): Page {
  if (result.profile || result.firstScanDone || result.onboardingCompleted) {
    return 'feed';
  }
  return 'onboarding';
}

export const appLifecycleMachine = setup({
  types: {
    context: {} as AppLifecycleContext,
    events: {} as AppLifecycleEvent,
    input: {} as AppLifecycleInput,
  },
  actors: {
    bootstrap: fromPromise(async ({ input }: { input: AppLifecycleDeps }): Promise<BootstrapResult> => {
      const profile = await input.loadProfile();
      if (profile) {
        return { profile, firstScanDone: false, onboardingCompleted: true };
      }

      const [firstScanDone, onboardingCompleted] = await Promise.all([
        input.getFirstScanDone(),
        input.getOnboardingCompleted(),
      ]);

      return { profile: null, firstScanDone, onboardingCompleted };
    }),
  },
  actions: {
    setBootstrapping: assign({
      bootStatus: 'bootstrapping' as const,
      error: null,
    }),
    setBootstrapResult: assign({
      bootStatus: 'ready' as const,
      profile: ({ context, event }) =>
        event.type === 'xstate.done.actor.bootstrap'
          ? (event.output.profile ?? context.profile)
          : context.profile,
      hasCompletedOnboarding: ({ context, event }) =>
        event.type === 'xstate.done.actor.bootstrap'
          ? context.hasCompletedOnboarding ||
            Boolean(event.output.profile) ||
            event.output.onboardingCompleted
          : context.hasCompletedOnboarding,
      currentPage: ({ context, event }) => {
        if (context.hasCompletedOnboarding) {
          return context.currentPage === 'onboarding' ? 'feed' : context.currentPage;
        }
        return event.type === 'xstate.done.actor.bootstrap'
          ? resolveInitialPage(event.output)
          : 'feed';
      },
      previousPageIndex: ({ context, event }) => {
        if (context.hasCompletedOnboarding) {
          const page = context.currentPage === 'onboarding' ? 'feed' : context.currentPage;
          return context.previousPageIndexFor(page);
        }
        return event.type === 'xstate.done.actor.bootstrap'
          ? context.previousPageIndexFor(resolveInitialPage(event.output))
          : context.previousPageIndex;
      },
      transitionDirection: 1 as const,
      error: null,
    }),
    setBootstrapError: assign({
      bootStatus: 'error' as const,
      error: ({ event }) =>
        event.type === 'xstate.error.actor.bootstrap' ? errorMessage(event.error) : null,
    }),
    navigate: assign(({ context, event }) => {
      if (event.type !== 'NAVIGATE') {
        return {};
      }

      const newIndex = context.previousPageIndexFor(event.page);
      return {
        transitionDirection: newIndex > context.previousPageIndex ? (1 as const) : (-1 as const),
        previousPageIndex: newIndex,
        currentPage: event.page,
      };
    }),
    completeOnboarding: assign(({ context }) => {
      context.deps.setOnboardingCompleted().catch(() => {});
      return {
        hasCompletedOnboarding: true,
        transitionDirection: 1 as const,
        previousPageIndex: context.previousPageIndexFor('feed'),
        currentPage: 'feed' as const,
      };
    }),
    resetOnboarding: assign(({ context }) => {
      context.deps.clearOnboardingCompleted().catch(() => {});
      return {
        hasCompletedOnboarding: false,
        transitionDirection: -1 as const,
        previousPageIndex: context.previousPageIndexFor('onboarding'),
        currentPage: 'onboarding' as const,
      };
    }),
    setExternalProfile: assign({
      profile: ({ event }) => (event.type === 'PROFILE_UPDATED' ? event.profile : null),
      hasCompletedOnboarding: true,
    }),
  },
}).createMachine({
  id: 'appLifecycle',
  initial: 'bootstrapping',
  context: ({ input }) => ({
    deps: input.deps,
    currentPage: 'feed',
    hasCompletedOnboarding: false,
    bootStatus: 'bootstrapping',
    previousPageIndex: input.pageIndex.feed,
    transitionDirection: 1,
    profile: null,
    error: null,
    previousPageIndexFor: (page: Page) => input.pageIndex[page],
  }),
  on: {
    NAVIGATE: { actions: 'navigate' },
    COMPLETE_ONBOARDING: { target: '.ready', actions: 'completeOnboarding' },
    RESET_ONBOARDING: { target: '.ready', actions: 'resetOnboarding' },
    PROFILE_UPDATED: { actions: 'setExternalProfile' },
  },
  states: {
    bootstrapping: {
      entry: 'setBootstrapping',
      invoke: {
        id: 'bootstrap',
        src: 'bootstrap',
        input: ({ context }) => context.deps,
        onDone: {
          target: 'ready',
          actions: 'setBootstrapResult',
        },
        onError: {
          target: 'ready',
          actions: 'setBootstrapError',
        },
      },
    },
    ready: {
      on: {
        BOOTSTRAP: 'bootstrapping',
      },
    },
  },
});

export type AppLifecycleMachine = typeof appLifecycleMachine;
