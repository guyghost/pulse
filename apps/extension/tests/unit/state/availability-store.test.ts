import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Availability } from '../../../src/lib/core/types/availability';
import type { PlatformSyncTarget } from '../../../src/lib/core/cv/experience-helpers';
import type { AvailabilityDeps } from '../../../src/lib/state/availability.svelte';
import { createAvailabilityStore } from '../../../src/lib/state/availability.svelte';

const NOW = 1_700_000_000_000;

const PLATFORMS: PlatformSyncTarget[] = [
  { id: 'free-work', name: 'Free-Work', profileUrl: 'https://www.free-work.com' },
  { id: 'malt', name: 'Malt', profileUrl: 'https://www.malt.fr' },
];

function makeDeps(overrides: Partial<AvailabilityDeps> = {}): AvailabilityDeps {
  return {
    loadAvailability: vi.fn().mockResolvedValue(null),
    saveAvailability: vi.fn().mockResolvedValue(undefined),
    copyToClipboard: vi.fn().mockResolvedValue(undefined),
    openUrl: vi.fn().mockResolvedValue(undefined),
    platforms: PLATFORMS,
    now: () => NOW,
    ...overrides,
  };
}

const savedAvailability: Availability = {
  status: 'immediate',
  date: null,
  note: 'Remote 4j/5j',
  updatedAt: NOW - 1000,
};

describe('availability store — load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads availability and reaches idle status', async () => {
    const deps = makeDeps({
      loadAvailability: vi.fn().mockResolvedValue(savedAvailability),
    });
    const store = createAvailabilityStore(deps);

    await store.load();

    expect(store.availability).toEqual(savedAvailability);
    expect(store.loadStatus).toBe('idle');
    expect(store.loadError).toBeNull();
  });

  it('surfaces a load error', async () => {
    const deps = makeDeps({
      loadAvailability: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const store = createAvailabilityStore(deps);

    await store.load();

    expect(store.loadStatus).toBe('error');
    expect(store.loadError).toBe('boom');
    expect(store.availability).toBeNull();
  });
});

describe('availability store — edit', () => {
  it('starts editing from a blank draft when none is set', () => {
    const store = createAvailabilityStore(makeDeps());
    store.startEdit();
    expect(store.editStatus).toBe('editing');
    expect(store.draft).not.toBeNull();
    expect(store.draft?.status).toBe('immediate');
    expect(store.draft?.date).toBeNull();
  });

  it('starts editing from the existing availability', () => {
    const store = createAvailabilityStore(makeDeps());
    store.applyProfileUpdate(savedAvailability);
    store.startEdit();
    expect(store.draft?.note).toBe('Remote 4j/5j');
  });

  it('cancelEdit resets the draft', () => {
    const store = createAvailabilityStore(makeDeps());
    store.startEdit();
    store.cancelEdit();
    expect(store.editStatus).toBe('idle');
    expect(store.draft).toBeNull();
  });

  it('saveDraft persists, clears the draft and exposes the new availability', async () => {
    const deps = makeDeps();
    const store = createAvailabilityStore(deps);
    store.startEdit();
    await store.saveDraft('from-date', '2026-09-01', '  Note  ');
    expect(deps.saveAvailability).toHaveBeenCalledOnce();
    const persisted = deps.saveAvailability.mock.calls[0][0] as Availability;
    expect(persisted.status).toBe('from-date');
    expect(persisted.date).toBe('2026-09-01');
    expect(persisted.note).toBe('Note');
    expect(persisted.updatedAt).toBe(NOW);
    expect(store.editStatus).toBe('idle');
    expect(store.draft).toBeNull();
    expect(store.availability?.status).toBe('from-date');
  });

  it('saveDraft surfaces an error and keeps the draft', async () => {
    const deps = makeDeps({
      saveAvailability: vi.fn().mockRejectedValue(new Error('disk full')),
    });
    const store = createAvailabilityStore(deps);
    store.startEdit();
    await store.saveDraft('immediate', null, '');
    expect(store.editStatus).toBe('error');
    expect(store.editError).toBe('disk full');
    expect(store.draft).not.toBeNull();
  });

  it('forbids re-entrant startEdit while editing', () => {
    const store = createAvailabilityStore(makeDeps());
    store.startEdit();
    const firstDraft = store.draft;
    store.startEdit(); // no-op
    expect(store.draft).toBe(firstDraft);
  });
});

describe('availability store — push', () => {
  it('refuses to push when no availability is set', async () => {
    const deps = makeDeps();
    const store = createAvailabilityStore(deps);
    await store.startPush();
    expect(store.pushStatus).toBe('error');
    expect(deps.copyToClipboard).not.toHaveBeenCalled();
  });

  it('fails fast when clipboard write is denied', async () => {
    const deps = makeDeps({
      copyToClipboard: vi.fn().mockRejectedValue(new Error('denied')),
    });
    const store = createAvailabilityStore(deps);
    store.applyProfileUpdate(savedAvailability);
    await store.startPush();
    expect(store.pushStatus).toBe('error');
    expect(store.pushError).toContain('refusé');
    for (const target of PLATFORMS) {
      expect(store.platformStatuses.get(target.id)).toBe('error');
    }
    expect(deps.openUrl).not.toHaveBeenCalled();
  });

  it('pushes to every platform and reaches pushed status', async () => {
    const deps = makeDeps();
    const store = createAvailabilityStore(deps);
    store.applyProfileUpdate(savedAvailability);
    await store.startPush();
    expect(store.pushStatus).toBe('pushed');
    expect(store.lastPushedAt).toBe(NOW);
    expect(deps.copyToClipboard).toHaveBeenCalledOnce();
    expect(deps.openUrl).toHaveBeenCalledTimes(PLATFORMS.length);
    for (const target of PLATFORMS) {
      expect(store.platformStatuses.get(target.id)).toBe('done');
    }
  });

  it('reaches partial when some platforms fail', async () => {
    const deps = makeDeps({
      openUrl: vi
        .fn()
        .mockImplementation((url: string) =>
          url.includes('malt') ? Promise.reject(new Error('net')) : Promise.resolve()
        ),
    });
    const store = createAvailabilityStore(deps);
    store.applyProfileUpdate(savedAvailability);
    await store.startPush();
    expect(store.pushStatus).toBe('partial');
    expect(store.platformStatuses.get('malt')).toBe('error');
    expect(store.platformStatuses.get('free-work')).toBe('done');
  });

  it('cancelPush marks remaining platforms as skipped', async () => {
    let resolveFirst: () => void = () => {};
    const deps = makeDeps({
      openUrl: vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          })
      ),
    });
    const store = createAvailabilityStore(deps);
    store.applyProfileUpdate(savedAvailability);
    const pushPromise = store.startPush();
    store.cancelPush();
    resolveFirst();
    await pushPromise;
    expect(store.pushStatus).toBe('cancelled');
    // At least one platform should be skipped (the second one never started).
    expect(store.platformStatuses.get('malt')).toBe('skipped');
  });
});

describe('availability store — applyProfileUpdate', () => {
  it('applies an external update when idle', () => {
    const store = createAvailabilityStore(makeDeps());
    store.applyProfileUpdate(savedAvailability);
    expect(store.availability).toEqual(savedAvailability);
  });

  it('drops the update while editing', () => {
    const store = createAvailabilityStore(makeDeps());
    store.startEdit();
    store.applyProfileUpdate(savedAvailability);
    expect(store.availability).toBeNull();
  });

  it('drops the update while pushing', async () => {
    // Single platform + deferred openUrl so we can observe the in-flight
    // 'pushing' state before applying the external update.
    let resolveOpen: () => void = () => {};
    const singlePlatform: PlatformSyncTarget[] = [
      { id: 'free-work', name: 'Free-Work', profileUrl: 'https://www.free.work.com' },
    ];
    const openUrl = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          // Captured only once openUrl is actually invoked by the push loop,
          // so resolving later completes the in-flight 'pushing' step.
          resolveOpen = resolve;
        })
    );
    const deps = makeDeps({ platforms: singlePlatform, openUrl });
    const store = createAvailabilityStore(deps);
    store.applyProfileUpdate(savedAvailability);
    const pushPromise = store.startPush() as unknown as Promise<void>;
    // Reach the 'pushing' state (openUrl has been called and is pending).
    await vi.waitFor(() => {
      expect(openUrl).toHaveBeenCalledTimes(1);
    });
    // External update arrives mid-push — must be dropped.
    store.applyProfileUpdate({ ...savedAvailability, note: 'external' });
    resolveOpen();
    await pushPromise;
    expect(store.availability?.note).toBe('Remote 4j/5j');
  });
});
