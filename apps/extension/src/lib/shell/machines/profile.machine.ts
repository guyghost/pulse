import { assign, fromPromise, setup } from 'xstate';
import type { UserProfile } from '$lib/core/types/profile';

export interface ProfileMachineDeps {
  loadProfile(): Promise<UserProfile | null>;
  saveProfile(profile: UserProfile): Promise<UserProfile>;
}

export type ProfileStatus = 'loading' | 'missing' | 'editing' | 'saving' | 'ready' | 'error';

export interface ProfileMachineContext {
  deps: ProfileMachineDeps;
  current: UserProfile | null;
  draft: UserProfile | null;
  error: string | null;
}

export type ProfileMachineEvent =
  | { type: 'LOAD' }
  | { type: 'EDIT' }
  | { type: 'CANCEL' }
  | { type: 'SUBMIT_PROFILE'; profile: UserProfile }
  | { type: 'PROFILE_UPDATED'; profile: UserProfile }
  | { type: 'RETRY' }
  | { type: 'xstate.done.actor.loadProfile'; output: UserProfile | null }
  | { type: 'xstate.error.actor.loadProfile'; error: unknown }
  | { type: 'xstate.done.actor.saveProfile'; output: UserProfile }
  | { type: 'xstate.error.actor.saveProfile'; error: unknown };

export interface ProfileMachineInput {
  deps: ProfileMachineDeps;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Erreur lors de la sauvegarde';

export const profileMachine = setup({
  types: {
    context: {} as ProfileMachineContext,
    events: {} as ProfileMachineEvent,
    input: {} as ProfileMachineInput,
  },
  actors: {
    loadProfile: fromPromise(async ({ input }: { input: ProfileMachineDeps }) =>
      input.loadProfile()
    ),
    saveProfile: fromPromise(
      async ({ input }: { input: { deps: ProfileMachineDeps; profile: UserProfile } }) =>
        input.deps.saveProfile(input.profile)
    ),
  },
  guards: {
    hasLoadedProfile: ({ event }) => event.type === 'xstate.done.actor.loadProfile' && !!event.output,
    hasDraft: ({ context }) => !!context.draft,
  },
  actions: {
    clearError: assign({ error: null }),
    setLoadedProfile: assign({
      current: ({ event }) =>
        event.type === 'xstate.done.actor.loadProfile' ? event.output : null,
      draft: ({ event }) => (event.type === 'xstate.done.actor.loadProfile' ? event.output : null),
      error: null,
    }),
    setMissingProfile: assign({
      current: null,
      draft: null,
      error: null,
    }),
    setDraftFromCurrent: assign({
      draft: ({ context }) => context.current,
      error: null,
    }),
    setSubmittedProfile: assign({
      draft: ({ event }) => (event.type === 'SUBMIT_PROFILE' ? event.profile : null),
      error: null,
    }),
    setSavedProfile: assign({
      current: ({ event }) =>
        event.type === 'xstate.done.actor.saveProfile' ? event.output : null,
      draft: ({ event }) => (event.type === 'xstate.done.actor.saveProfile' ? event.output : null),
      error: null,
    }),
    setExternalProfile: assign({
      current: ({ event }) => (event.type === 'PROFILE_UPDATED' ? event.profile : null),
      draft: ({ event }) => (event.type === 'PROFILE_UPDATED' ? event.profile : null),
      error: null,
    }),
    setError: assign({
      error: ({ event }) =>
        event.type === 'xstate.error.actor.loadProfile' || event.type === 'xstate.error.actor.saveProfile'
          ? errorMessage(event.error)
          : 'Erreur profil',
    }),
  },
}).createMachine({
  id: 'profile',
  initial: 'loading',
  context: ({ input }) => ({
    deps: input.deps,
    current: null,
    draft: null,
    error: null,
  }),
  states: {
    loading: {
      on: {
        SUBMIT_PROFILE: { target: 'saving', actions: 'setSubmittedProfile' },
        PROFILE_UPDATED: { target: 'ready', actions: 'setExternalProfile' },
      },
      invoke: {
        id: 'loadProfile',
        src: 'loadProfile',
        input: ({ context }) => context.deps,
        onDone: [
          {
            guard: 'hasLoadedProfile',
            target: 'ready',
            actions: 'setLoadedProfile',
          },
          {
            target: 'missing',
            actions: 'setMissingProfile',
          },
        ],
        onError: {
          target: 'error',
          actions: 'setError',
        },
      },
    },
    missing: {
      on: {
        LOAD: 'loading',
        SUBMIT_PROFILE: { target: 'saving', actions: 'setSubmittedProfile' },
        PROFILE_UPDATED: { target: 'ready', actions: 'setExternalProfile' },
      },
    },
    ready: {
      on: {
        LOAD: 'loading',
        EDIT: { target: 'editing', actions: 'setDraftFromCurrent' },
        SUBMIT_PROFILE: { target: 'saving', actions: 'setSubmittedProfile' },
        PROFILE_UPDATED: { actions: 'setExternalProfile' },
      },
    },
    editing: {
      on: {
        CANCEL: { target: 'ready', actions: 'setDraftFromCurrent' },
        SUBMIT_PROFILE: { target: 'saving', actions: 'setSubmittedProfile' },
        PROFILE_UPDATED: { target: 'ready', actions: 'setExternalProfile' },
      },
    },
    saving: {
      invoke: {
        id: 'saveProfile',
        src: 'saveProfile',
        input: ({ context }) => {
          if (!context.draft) {
            throw new Error('Aucun profil à sauvegarder');
          }
          return { deps: context.deps, profile: context.draft };
        },
        onDone: {
          target: 'ready',
          actions: 'setSavedProfile',
        },
        onError: {
          target: 'error',
          actions: 'setError',
        },
      },
    },
    error: {
      on: {
        LOAD: 'loading',
        EDIT: { target: 'editing', actions: 'clearError' },
        RETRY: { guard: 'hasDraft', target: 'saving', actions: 'clearError' },
        SUBMIT_PROFILE: { target: 'saving', actions: 'setSubmittedProfile' },
        PROFILE_UPDATED: { target: 'ready', actions: 'setExternalProfile' },
      },
    },
  },
});

export type ProfileMachine = typeof profileMachine;
