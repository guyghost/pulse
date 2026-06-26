import { describe, expect, it, vi } from 'vitest';
import { createActor, type SnapshotFrom } from 'xstate';
import type { UserProfile } from '../../../src/lib/core/types/profile';
import { profileMachine } from '../../../src/lib/shell/machines/profile.machine';

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

type ProfileActor = ReturnType<typeof createActor<typeof profileMachine>>;
type ProfileSnapshot = SnapshotFrom<typeof profileMachine>;

function waitForSnapshot(
  actor: ProfileActor,
  predicate: (snapshot: ProfileSnapshot) => boolean
): Promise<ProfileSnapshot> {
  return new Promise((resolve) => {
    const current = actor.getSnapshot();
    if (predicate(current)) {
      resolve(current);
      return;
    }

    const subscription = actor.subscribe((snapshot) => {
      if (predicate(snapshot)) {
        subscription.unsubscribe();
        resolve(snapshot);
      }
    });
  });
}

describe('profile machine', () => {
  it('loads a missing profile into the missing state', async () => {
    const actor = createActor(profileMachine, {
      input: {
        deps: {
          loadProfile: vi.fn().mockResolvedValue(null),
          saveProfile: vi.fn(),
        },
      },
    }).start();

    const snapshot = await waitForSnapshot(actor, (s) => s.matches('missing'));
    expect(snapshot.context.current).toBeNull();
  });

  it('loads an existing profile into ready', async () => {
    const actor = createActor(profileMachine, {
      input: {
        deps: {
          loadProfile: vi.fn().mockResolvedValue(profile),
          saveProfile: vi.fn(),
        },
      },
    }).start();

    const snapshot = await waitForSnapshot(actor, (s) => s.matches('ready'));
    expect(snapshot.context.current).toEqual(profile);
  });

  it('saves a submitted profile and stores it as current', async () => {
    const saveProfile = vi.fn().mockResolvedValue(profile);
    const actor = createActor(profileMachine, {
      input: {
        deps: {
          loadProfile: vi.fn().mockResolvedValue(null),
          saveProfile,
        },
      },
    }).start();

    await waitForSnapshot(actor, (s) => s.matches('missing'));
    actor.send({ type: 'SUBMIT_PROFILE', profile });

    const snapshot = await waitForSnapshot(actor, (s) => s.matches('ready'));
    expect(saveProfile).toHaveBeenCalledWith(profile);
    expect(snapshot.context.current).toEqual(profile);
  });

  it('moves to error when saving fails, then retries the draft', async () => {
    const saveProfile = vi
      .fn()
      .mockRejectedValueOnce(new Error('IndexedDB unavailable'))
      .mockResolvedValueOnce(profile);
    const actor = createActor(profileMachine, {
      input: {
        deps: {
          loadProfile: vi.fn().mockResolvedValue(null),
          saveProfile,
        },
      },
    }).start();

    await waitForSnapshot(actor, (s) => s.matches('missing'));
    actor.send({ type: 'SUBMIT_PROFILE', profile });

    const errorSnapshot = await waitForSnapshot(actor, (s) => s.matches('error'));
    expect(errorSnapshot.context.error).toBe('IndexedDB unavailable');

    actor.send({ type: 'RETRY' });

    const readySnapshot = await waitForSnapshot(actor, (s) => s.matches('ready'));
    expect(saveProfile).toHaveBeenCalledTimes(2);
    expect(readySnapshot.context.current).toEqual(profile);
  });
});
