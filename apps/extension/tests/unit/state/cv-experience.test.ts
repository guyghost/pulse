import { describe, expect, it, vi } from 'vitest';
import type { Experience } from '../../../src/lib/core/types/profile';
import type { CvExperienceDeps } from '../../../src/lib/state/cv-experience.svelte';
import { createCvExperienceStore } from '../../../src/lib/state/cv-experience.svelte';

const NOW = 1_700_000_000_000;

const experience: Experience = {
  id: 'exp-1',
  title: 'Lead Frontend',
  company: 'Client',
  employmentType: null,
  location: 'Paris',
  startDate: '2024-01',
  endDate: null,
  isCurrent: true,
  description: 'Svelte app',
  skills: ['Svelte'],
  source: 'manual',
  sourceExternalId: null,
  positionIndex: 0,
  updatedAt: NOW - 1,
};

function makeDeps(overrides: Partial<CvExperienceDeps> = {}): CvExperienceDeps {
  return {
    loadExperiences: vi.fn().mockResolvedValue([]),
    saveExperiences: vi.fn().mockResolvedValue(undefined),
    copyToClipboard: vi.fn().mockResolvedValue(undefined),
    openUrl: vi.fn().mockResolvedValue(undefined),
    platforms: [{ id: 'linkedin', name: 'LinkedIn', profileUrl: 'https://www.linkedin.com/in/me/' }],
    now: () => NOW,
    generateId: vi.fn(() => 'exp-1'),
    ...overrides,
  };
}

describe('cv experience store', () => {
  it('starts a manual draft with no employment type', () => {
    const store = createCvExperienceStore(makeDeps({ platforms: [], now: () => 1 }));

    store.newExperience();

    expect(store.draft?.employmentType).toBeNull();
  });

  it('resets sync state after saving a local experience edit', async () => {
    const deps = makeDeps();
    const store = createCvExperienceStore(deps);
    store.applyProfileUpdate([experience]);

    await store.startSync();
    expect(store.syncStatus).toBe('synced');
    expect(store.lastSyncedAt).toBe(NOW);
    expect(store.platformStatuses.get('linkedin')).toBe('done');

    store.editExperience('exp-1');
    await store.saveExperience({ ...experience, title: 'Principal Frontend' });

    expect(store.syncStatus).toBe('idle');
    expect(store.lastSyncedAt).toBeNull();
    expect(store.syncError).toBeNull();
    expect(store.platformStatuses.size).toBe(0);
  });

  it('resets sync state after deleting a local experience', async () => {
    const store = createCvExperienceStore(makeDeps());
    store.applyProfileUpdate([experience]);

    await store.startSync();
    expect(store.syncStatus).toBe('synced');

    await store.deleteExperience('exp-1');

    expect(store.experiences).toEqual([]);
    expect(store.syncStatus).toBe('idle');
    expect(store.lastSyncedAt).toBeNull();
    expect(store.platformStatuses.size).toBe(0);
  });
});
