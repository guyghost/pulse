import { describe, expect, it, vi } from 'vitest';
import type { CvExperienceDeps } from '../../../src/lib/state/cv-experience.svelte';
import { createCvExperienceStore } from '../../../src/lib/state/cv-experience.svelte';

const NOW = 1_700_000_000_000;

function makeDeps(overrides: Partial<CvExperienceDeps> = {}): CvExperienceDeps {
  return {
    loadExperiences: vi.fn().mockResolvedValue([]),
    saveExperiences: vi.fn().mockResolvedValue(undefined),
    now: () => NOW,
    generateId: vi.fn(() => 'exp-1'),
    ...overrides,
  };
}

describe('cv experience store', () => {
  it('starts a manual draft with no employment type', () => {
    const store = createCvExperienceStore(makeDeps({ now: () => 1 }));

    store.newExperience();

    expect(store.draft?.employmentType).toBeNull();
  });
});
