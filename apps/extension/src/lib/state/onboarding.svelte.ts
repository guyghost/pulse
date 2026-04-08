import type { UserProfile } from '$lib/core/types/profile';

export type OnboardingState = 'idle' | 'saving' | 'complete' | 'error';

export interface OnboardingStore {
  readonly state: OnboardingState;
  readonly profile: Partial<UserProfile>;
  readonly error: string | null;
  updateProfile(updates: Partial<UserProfile>): void;
  save(): void;
  saveSuccess(): void;
  saveError(error: string): void;
  retry(): void;
  reset(): void;
}

const mergeProfile = (
  current: Partial<UserProfile>,
  update: Partial<UserProfile>
): Partial<UserProfile> => ({
  ...current,
  ...update,
});

export function createOnboardingStore(): OnboardingStore {
  let state = $state<OnboardingState>('idle');
  let profile = $state<Partial<UserProfile>>({});
  let error = $state<string | null>(null);

  return {
    get state() {
      return state;
    },
    get profile() {
      return profile;
    },
    get error() {
      return error;
    },

    updateProfile(updates: Partial<UserProfile>) {
      if (state === 'idle' || state === 'error') {
        profile = mergeProfile(profile, updates);
      }
    },

    save() {
      state = 'saving';
      error = null;
    },

    saveSuccess() {
      state = 'complete';
    },

    saveError(message: string) {
      state = 'error';
      error = message;
    },

    retry() {
      if (state === 'error') {
        state = 'saving';
      }
    },

    reset() {
      state = 'idle';
      profile = {};
      error = null;
    },
  };
}
