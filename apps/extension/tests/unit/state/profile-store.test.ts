import { describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../../../src/lib/core/types/profile';
import {
  createProfileStore,
  type ProfileSnapshot,
  type ProfileStore,
} from '../../../src/lib/state/profile.svelte';

const profile: UserProfile = {
  firstName: 'Guy',
  stack: ['Svelte', 'TypeScript'],
  tjmMin: 600,
  tjmMax: 800,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Lead Frontend',
  searchKeywords: ['mission svelte'],
};

function waitForSnapshot(
  store: ProfileStore,
  predicate: (snapshot: ProfileSnapshot) => boolean
): Promise<ProfileSnapshot> {
  return new Promise((resolve) => {
    if (predicate(store.snapshot)) {
      resolve(store.snapshot);
      return;
    }
    const unsubscribe = store.subscribe((snapshot) => {
      if (predicate(snapshot)) {
        unsubscribe();
        resolve(snapshot);
      }
    });
  });
}

describe('profile store', () => {
  it('loads a missing profile into the missing state', async () => {
    const store = createProfileStore({
      loadProfile: vi.fn().mockResolvedValue(null),
      saveProfile: vi.fn(),
    });

    const snapshot = await waitForSnapshot(store, (s) => s.matches('missing'));
    expect(snapshot.context.current).toBeNull();
  });

  it('loads an existing profile into ready', async () => {
    const store = createProfileStore({
      loadProfile: vi.fn().mockResolvedValue(profile),
      saveProfile: vi.fn(),
    });

    const snapshot = await waitForSnapshot(store, (s) => s.matches('ready'));
    expect(snapshot.context.current).toEqual(profile);
  });

  it('saves a submitted profile and stores it as current', async () => {
    const saveProfile = vi.fn().mockResolvedValue(profile);
    const store = createProfileStore({
      loadProfile: vi.fn().mockResolvedValue(null),
      saveProfile,
    });

    await waitForSnapshot(store, (s) => s.matches('missing'));
    store.send({ type: 'SUBMIT_PROFILE', profile });

    const snapshot = await waitForSnapshot(store, (s) => s.matches('ready'));
    expect(saveProfile).toHaveBeenCalledWith(profile);
    expect(snapshot.context.current).toEqual(profile);
  });

  it('moves to error when saving fails, then retries the draft', async () => {
    const saveProfile = vi
      .fn()
      .mockRejectedValueOnce(new Error('IndexedDB unavailable'))
      .mockResolvedValueOnce(profile);
    const store = createProfileStore({
      loadProfile: vi.fn().mockResolvedValue(null),
      saveProfile,
    });

    await waitForSnapshot(store, (s) => s.matches('missing'));
    store.send({ type: 'SUBMIT_PROFILE', profile });

    const errorSnapshot = await waitForSnapshot(store, (s) => s.matches('error'));
    expect(errorSnapshot.context.error).toBe('IndexedDB unavailable');

    store.send({ type: 'RETRY' });

    const readySnapshot = await waitForSnapshot(store, (s) => s.matches('ready'));
    expect(saveProfile).toHaveBeenCalledTimes(2);
    expect(readySnapshot.context.current).toEqual(profile);
  });

  it('ignores events while saving (no re-entrancy)', async () => {
    let resolveSave: (value: UserProfile) => void = () => {};
    const saveProfile = vi
      .fn()
      .mockImplementation(() => new Promise<UserProfile>((resolve) => (resolveSave = resolve)));
    const store = createProfileStore({
      loadProfile: vi.fn().mockResolvedValue(null),
      saveProfile,
    });

    await waitForSnapshot(store, (s) => s.matches('missing'));
    store.send({ type: 'SUBMIT_PROFILE', profile });
    await waitForSnapshot(store, (s) => s.matches('saving'));

    // These must be ignored: PROFILE_UPDATED and a second SUBMIT must not
    // clobber the in-flight save or change status.
    store.send({ type: 'PROFILE_UPDATED', profile });
    store.send({ type: 'SUBMIT_PROFILE', profile });

    expect(store.snapshot.matches('saving')).toBe(true);
    expect(saveProfile).toHaveBeenCalledTimes(1);

    resolveSave(profile);
    const snapshot = await waitForSnapshot(store, (s) => s.matches('ready'));
    expect(snapshot.context.current).toEqual(profile);
  });

  it('does not retry from error when there is no draft', async () => {
    const saveProfile = vi.fn();
    const store = createProfileStore({
      loadProfile: vi.fn().mockRejectedValue(new Error('load boom')),
      saveProfile,
    });

    await waitForSnapshot(store, (s) => s.matches('error'));
    // draft is null (load failed), so RETRY is a no-op (guard hasDraft).
    store.send({ type: 'RETRY' });
    expect(store.snapshot.matches('error')).toBe(true);
    expect(saveProfile).not.toHaveBeenCalled();
  });
});
