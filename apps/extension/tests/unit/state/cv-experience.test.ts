import { describe, expect, it, vi } from 'vitest';
import { createCvExperienceStore } from '../../../src/lib/state/cv-experience.svelte';

describe('cv experience store', () => {
  it('starts a manual draft with no employment type', () => {
    const store = createCvExperienceStore({
      loadExperiences: async () => [],
      saveExperiences: async () => undefined,
      copyToClipboard: async () => undefined,
      openUrl: async () => undefined,
      platforms: [],
      now: () => 1,
      generateId: vi.fn(() => 'exp-1'),
    });

    store.newExperience();

    expect(store.draft?.employmentType).toBeNull();
  });
});
