import { describe, expect, it, vi } from 'vitest';
import { createActor, type SnapshotFrom } from 'xstate';
import type { UserProfile } from '../../../src/lib/core/types/profile';
import type { Page } from '../../../src/lib/state/app-navigation.svelte';
import {
  appLifecycleMachine,
  type AppLifecycleDeps,
} from '../../../src/lib/shell/machines/app-lifecycle.machine';

const pageIndex: Record<Page, number> = {
  onboarding: -1,
  feed: 0,
  profile: 1,
  cv: 2,
  applications: 3,
  tjm: 4,
  settings: 5,
};

const profile: UserProfile = {
  firstName: 'Guy',
  stack: ['Svelte'],
  tjmMin: 600,
  tjmMax: 750,
  location: 'Paris',
  remote: 'any',
  seniority: 'senior',
  jobTitle: 'Dev Svelte',
  searchKeywords: [],
};

type AppActor = ReturnType<typeof createActor<typeof appLifecycleMachine>>;
type AppSnapshot = SnapshotFrom<typeof appLifecycleMachine>;

function waitForSnapshot(
  actor: AppActor,
  predicate: (snapshot: AppSnapshot) => boolean
): Promise<AppSnapshot> {
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

function createDeps(overrides: Partial<AppLifecycleDeps> = {}): AppLifecycleDeps {
  return {
    loadProfile: vi.fn().mockResolvedValue(null),
    saveProfile: vi.fn().mockResolvedValue(undefined),
    getFirstScanDone: vi.fn().mockResolvedValue(false),
    getOnboardingCompleted: vi.fn().mockResolvedValue(false),
    setOnboardingCompleted: vi.fn().mockResolvedValue(undefined),
    clearOnboardingCompleted: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('app lifecycle machine', () => {
  it('routes to onboarding when no profile and no first scan flags exist', async () => {
    const actor = createActor(appLifecycleMachine, {
      input: { deps: createDeps(), pageIndex },
    }).start();

    const snapshot = await waitForSnapshot(actor, (s) => s.matches('ready'));
    expect(snapshot.context.currentPage).toBe('onboarding');
    expect(snapshot.context.hasCompletedOnboarding).toBe(false);
  });

  it('routes to feed when a profile exists', async () => {
    const actor = createActor(appLifecycleMachine, {
      input: { deps: createDeps({ loadProfile: vi.fn().mockResolvedValue(profile) }), pageIndex },
    }).start();

    const snapshot = await waitForSnapshot(actor, (s) => s.matches('ready'));
    expect(snapshot.context.currentPage).toBe('feed');
    expect(snapshot.context.hasCompletedOnboarding).toBe(true);
  });

  it('does not let a stale bootstrap result undo completed onboarding', async () => {
    let resolveProfile: (profile: UserProfile | null) => void = () => {};
    const loadProfile = vi.fn(
      () =>
        new Promise<UserProfile | null>((resolve) => {
          resolveProfile = resolve;
        })
    );
    const deps = createDeps({ loadProfile });
    const actor = createActor(appLifecycleMachine, {
      input: { deps, pageIndex },
    }).start();

    actor.send({ type: 'COMPLETE_ONBOARDING' });
    expect(actor.getSnapshot().context.currentPage).toBe('feed');
    expect(actor.getSnapshot().context.hasCompletedOnboarding).toBe(true);

    resolveProfile(null);
    await Promise.resolve();

    expect(actor.getSnapshot().context.currentPage).toBe('feed');
    expect(actor.getSnapshot().context.hasCompletedOnboarding).toBe(true);
    expect(deps.setOnboardingCompleted).toHaveBeenCalledOnce();
  });

  // ONB-02: skipping onboarding must seed a minimal/default profile so the feed
  // can degrade gracefully instead of scoring against a null profile. Both the
  // skip path and the normal completion path funnel through COMPLETE_ONBOARDING,
  // so the machine must persist a non-null profile here (null only when a real
  // profile already exists, which is preserved).
  it('seeds a default profile when onboarding completes without one (skip path)', async () => {
    const deps = createDeps();
    const actor = createActor(appLifecycleMachine, {
      input: { deps, pageIndex },
    }).start();

    const bootstrapped = await waitForSnapshot(actor, (s) => s.matches('ready'));
    expect(bootstrapped.context.currentPage).toBe('onboarding');
    expect(bootstrapped.context.profile).toBeNull();

    actor.send({ type: 'COMPLETE_ONBOARDING' });
    const snapshot = actor.getSnapshot();

    expect(snapshot.context.hasCompletedOnboarding).toBe(true);
    expect(snapshot.context.currentPage).toBe('feed');
    expect(snapshot.context.profile, 'skip must seed a non-null profile').not.toBeNull();
    expect(snapshot.context.profile?.stack).toEqual([]);
    expect(snapshot.context.profile?.tjmMin).toBe(0);
  });

  it('preserves an existing profile when onboarding completes', async () => {
    const deps = createDeps({ loadProfile: vi.fn().mockResolvedValue(profile) });
    const actor = createActor(appLifecycleMachine, {
      input: { deps, pageIndex },
    }).start();

    await waitForSnapshot(actor, (s) => s.matches('ready'));
    expect(actor.getSnapshot().context.profile).toEqual(profile);

    actor.send({ type: 'COMPLETE_ONBOARDING' });
    expect(actor.getSnapshot().context.profile).toEqual(profile);
  });

  // ONB-02 regression: the seeded default profile must be persisted so that
  // skipping onboarding survives a reload (loadProfile returns it next boot).
  it('persists the seeded default profile when onboarding completes with none', async () => {
    const deps = createDeps();
    const actor = createActor(appLifecycleMachine, {
      input: { deps, pageIndex },
    }).start();

    await waitForSnapshot(actor, (s) => s.matches('ready'));
    expect(actor.getSnapshot().context.profile).toBeNull();

    actor.send({ type: 'COMPLETE_ONBOARDING' });

    expect(deps.saveProfile).toHaveBeenCalledOnce();
    // Persisted default profile carries every required field.
    expect(deps.saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: expect.any(String),
        stack: expect.any(Array),
        tjmMin: expect.any(Number),
        tjmMax: expect.any(Number),
        location: expect.any(String),
        remote: 'any',
        seniority: 'senior',
        jobTitle: expect.any(String),
        searchKeywords: expect.any(Array),
      })
    );
  });

  it('does not persist a profile when onboarding completes with an existing one', async () => {
    const deps = createDeps({ loadProfile: vi.fn().mockResolvedValue(profile) });
    const actor = createActor(appLifecycleMachine, {
      input: { deps, pageIndex },
    }).start();

    await waitForSnapshot(actor, (s) => s.matches('ready'));

    actor.send({ type: 'COMPLETE_ONBOARDING' });

    expect(deps.saveProfile).not.toHaveBeenCalled();
  });
});
