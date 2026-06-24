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
});
