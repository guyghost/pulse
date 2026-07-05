import type { UserProfile } from '$lib/core/types/profile';

/**
 * Runes-based profile lifecycle store. Replaces the former XState
 * `profile.machine.ts`. State graph, transitions, side effects and invariants
 * are documented in `src/models/profile-state.model.md` (source of truth).
 */

export interface ProfileStoreDeps {
  loadProfile(): Promise<UserProfile | null>;
  saveProfile(profile: UserProfile): Promise<UserProfile>;
}

export type ProfileStatus = 'loading' | 'missing' | 'editing' | 'saving' | 'ready' | 'error';

export interface ProfileContext {
  readonly current: UserProfile | null;
  readonly draft: UserProfile | null;
  readonly error: string | null;
}

export type ProfileEvent =
  | { type: 'LOAD' }
  | { type: 'EDIT' }
  | { type: 'CANCEL' }
  | { type: 'SUBMIT_PROFILE'; profile: UserProfile }
  | { type: 'PROFILE_UPDATED'; profile: UserProfile }
  | { type: 'RETRY' };

export interface ProfileSnapshot {
  readonly value: ProfileStatus;
  readonly context: ProfileContext;
  matches(state: ProfileStatus): boolean;
}

export interface ProfileStore {
  readonly snapshot: ProfileSnapshot;
  send(event: ProfileEvent): void;
  subscribe(listener: (snapshot: ProfileSnapshot) => void): () => void;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Erreur lors de la sauvegarde';

export function createProfileStore(deps: ProfileStoreDeps): ProfileStore {
  let status = $state<ProfileStatus>('loading');
  let currentProfile = $state<UserProfile | null>(null);
  let draftProfile = $state<UserProfile | null>(null);
  let profileError = $state<string | null>(null);

  const listeners = new Set<(snapshot: ProfileSnapshot) => void>();

  const context: ProfileContext = {
    get current() {
      return currentProfile;
    },
    get draft() {
      return draftProfile;
    },
    get error() {
      return profileError;
    },
  };

  const snapshot: ProfileSnapshot = {
    get value() {
      return status;
    },
    get context() {
      return context;
    },
    matches(state) {
      return status === state;
    },
  };

  function notify(): void {
    for (const listener of [...listeners]) {
      listener(snapshot);
    }
  }

  async function runLoad(): Promise<void> {
    try {
      const loaded = await deps.loadProfile();
      currentProfile = loaded;
      draftProfile = loaded;
      profileError = null;
      status = loaded ? 'ready' : 'missing';
      notify();
    } catch (error) {
      profileError = errorMessage(error);
      status = 'error';
      notify();
    }
  }

  async function runSave(profile: UserProfile): Promise<void> {
    try {
      const saved = await deps.saveProfile(profile);
      currentProfile = saved;
      draftProfile = saved;
      profileError = null;
      status = 'ready';
      notify();
    } catch (error) {
      profileError = errorMessage(error);
      status = 'error';
      notify();
    }
  }

  function send(event: ProfileEvent): void {
    // `saving` ignores all events until the in-flight save settles.
    if (status === 'saving') {
      return;
    }

    switch (event.type) {
      case 'LOAD': {
        if (status === 'missing' || status === 'ready' || status === 'error') {
          status = 'loading';
          notify();
          void runLoad();
        }
        return;
      }
      case 'EDIT': {
        if (status === 'ready') {
          draftProfile = currentProfile;
          profileError = null;
          status = 'editing';
          notify();
        } else if (status === 'error') {
          profileError = null;
          status = 'editing';
          notify();
        }
        return;
      }
      case 'CANCEL': {
        if (status === 'editing') {
          draftProfile = currentProfile;
          status = 'ready';
          notify();
        }
        return;
      }
      case 'SUBMIT_PROFILE': {
        draftProfile = event.profile;
        profileError = null;
        status = 'saving';
        notify();
        void runSave(event.profile);
        return;
      }
      case 'PROFILE_UPDATED': {
        currentProfile = event.profile;
        draftProfile = event.profile;
        profileError = null;
        notify();
        return;
      }
      case 'RETRY': {
        if (status === 'error' && draftProfile) {
          profileError = null;
          status = 'saving';
          notify();
          void runSave(draftProfile);
        }
        return;
      }
    }
  }

  // Mirror the machine's `initial: 'loading'` with an invoked loadProfile actor.
  void runLoad();

  return {
    get snapshot() {
      return snapshot;
    },
    send,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
