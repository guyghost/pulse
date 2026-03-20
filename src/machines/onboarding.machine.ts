import { setup, assign } from 'xstate';
import type { UserProfile } from '$lib/core/types/profile';

export interface OnboardingContext {
  profile: Partial<UserProfile>;
  error: string | null;
}

export type OnboardingEvent =
  | { type: 'UPDATE_PROFILE'; profile: Partial<UserProfile> }
  | { type: 'SAVE' }
  | { type: 'SAVE_SUCCESS' }
  | { type: 'SAVE_ERROR'; error: string }
  | { type: 'RETRY' }
  | { type: 'RESET' };

/**
 * Merges profile updates into existing profile data.
 */
const mergeProfile = (
  current: Partial<UserProfile>,
  update: Partial<UserProfile>,
): Partial<UserProfile> => ({
  ...current,
  ...update,
});

export const onboardingMachine = setup({
  types: {
    context: {} as OnboardingContext,
    events: {} as OnboardingEvent,
  },
  actions: {
    updateProfile: assign({
      profile: ({ context, event }) => {
        if (event.type !== 'UPDATE_PROFILE') return context.profile;
        return mergeProfile(context.profile, event.profile);
      },
    }),

    setError: assign({
      error: ({ event }) => {
        if (event.type !== 'SAVE_ERROR') return null;
        return event.error;
      },
    }),

    clearError: assign({
      error: () => null,
    }),

    resetContext: assign({
      profile: () => ({}),
      error: () => null,
    }),
  },
}).createMachine({
  id: 'onboarding',
  initial: 'idle',
  context: {
    profile: {},
    error: null,
  },
  on: {
    RESET: {
      target: '.idle',
      actions: 'resetContext',
    },
  },
  states: {
    idle: {
      on: {
        UPDATE_PROFILE: {
          target: 'idle',
          actions: 'updateProfile',
        },
        SAVE: {
          target: 'saving',
          actions: 'clearError',
        },
      },
    },
    saving: {
      on: {
        SAVE_SUCCESS: {
          target: 'complete',
        },
        SAVE_ERROR: {
          target: 'error',
          actions: 'setError',
        },
      },
    },
    complete: {},
    error: {
      on: {
        RETRY: {
          target: 'saving',
        },
        UPDATE_PROFILE: {
          target: 'error',
          actions: 'updateProfile',
        },
      },
    },
  },
});

/**
 * Helper to create onboarding events for sending to the machine.
 */
export const onboardingEvents = {
  updateProfile: (
    profile: Partial<UserProfile>,
  ): Extract<OnboardingEvent, { type: 'UPDATE_PROFILE' }> => ({
    type: 'UPDATE_PROFILE',
    profile,
  }),

  save: (): Extract<OnboardingEvent, { type: 'SAVE' }> => ({
    type: 'SAVE',
  }),

  saveSuccess: (): Extract<OnboardingEvent, { type: 'SAVE_SUCCESS' }> => ({
    type: 'SAVE_SUCCESS',
  }),

  saveError: (error: string): Extract<OnboardingEvent, { type: 'SAVE_ERROR' }> => ({
    type: 'SAVE_ERROR',
    error,
  }),

  retry: (): Extract<OnboardingEvent, { type: 'RETRY' }> => ({
    type: 'RETRY',
  }),

  reset: (): Extract<OnboardingEvent, { type: 'RESET' }> => ({
    type: 'RESET',
  }),
};
