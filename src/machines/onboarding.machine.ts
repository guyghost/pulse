import { setup, assign } from 'xstate';
import type { UserProfile } from '../lib/types/profile';

type OnboardingContext = {
  profile: Partial<UserProfile>;
  enabledConnectors: string[];
  scanComplete: boolean;
};

type OnboardingEvent =
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'SET_PROFILE'; profile: Partial<UserProfile> }
  | { type: 'SET_CONNECTORS'; connectors: string[] }
  | { type: 'SCAN_DONE' }
  | { type: 'SKIP_SCAN' };

export const onboardingMachine = setup({
  types: {
    context: {} as OnboardingContext,
    events: {} as OnboardingEvent,
  },
  actions: {
    updateProfile: assign({
      profile: ({ context, event }) => {
        if (event.type === 'SET_PROFILE') return { ...context.profile, ...event.profile };
        return context.profile;
      },
    }),
    setConnectors: assign({
      enabledConnectors: ({ event }) => {
        if (event.type === 'SET_CONNECTORS') return event.connectors;
        return [];
      },
    }),
    markScanDone: assign({
      scanComplete: () => true,
    }),
  },
}).createMachine({
  id: 'onboarding',
  initial: 'welcome',
  context: {
    profile: {},
    enabledConnectors: [],
    scanComplete: false,
  },
  states: {
    welcome: {
      on: { NEXT: 'profile' },
    },
    profile: {
      on: {
        NEXT: 'connectors',
        BACK: 'welcome',
        SET_PROFILE: { actions: 'updateProfile' },
      },
    },
    connectors: {
      on: {
        NEXT: 'firstScan',
        BACK: 'profile',
        SET_CONNECTORS: { actions: 'setConnectors' },
      },
    },
    firstScan: {
      on: {
        SCAN_DONE: {
          target: 'done',
          actions: 'markScanDone',
        },
        SKIP_SCAN: 'done',
        BACK: 'connectors',
      },
    },
    done: {
      type: 'final',
    },
  },
});
