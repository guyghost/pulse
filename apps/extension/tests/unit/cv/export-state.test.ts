import { describe, expect, it, vi } from 'vitest';
import { createCvExportStore } from '../../../src/lib/state/cv-export.svelte';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { UserProfile, Experience } from '../../../src/lib/core/types/profile';

const experience: Experience = {
  id: 'react',
  title: 'Developer',
  company: 'A',
  startDate: '2020-01',
  endDate: null,
  isCurrent: true,
  description: 'Work',
  location: null,
  employmentType: null,
  skills: ['React'],
  source: 'manual',
  sourceExternalId: null,
  positionIndex: 0,
  updatedAt: 1,
};
const profile: UserProfile = {
  firstName: 'Alice',
  jobTitle: 'Consultante',
  location: 'Paris',
  experiences: [experience, { ...experience, id: 'svelte', skills: ['Svelte'] }],
  keywords: ['Desired Rust'],
  tjmMin: 500,
  tjmMax: null,
  remote: 'any',
  seniority: 'senior',
  availability: null,
};
const mission: Mission = {
  id: 'mission',
  title: 'Lead Svelte recherché',
  client: null,
  description: '',
  stack: ['Svelte'],
  tjm: null,
  location: '',
  remote: null,
  duration: null,
  url: 'https://example.com',
  source: 'free-work',
  scrapedAt: new Date(0),
  score: 0,
  semanticScore: null,
  semanticReason: null,
};

describe('CV export selection and validation', () => {
  it('ranks existing facts for a mission, permits selection/order and requires revalidation after every edit', async () => {
    const download = vi.fn();
    const store = createCvExportStore({
      getProfile: async () => profile,
      getMissions: async () => [mission],
      download,
    });
    await store.open();
    store.download();
    expect(download).not.toHaveBeenCalled();
    store.selectMission(mission.id);
    expect(store.ids).toEqual(['svelte', 'react']);
    expect(store.skills).toEqual(['Svelte', 'React']);
    expect(store.document?.title).toBe('Consultante');
    expect(store.document?.applicationContext).toBe('Lead Svelte recherché');
    expect(store.skills).not.toContain('Desired Rust');
    store.toggleExperience('react');
    store.toggleSkill('React');
    store.validate();
    store.download();
    expect(download).toHaveBeenCalledOnce();
    expect(download.mock.calls[0][0]).not.toContain('React');
    store.setIntroduction('A personal introduction');
    expect(store.validated).toBe(false);
    store.download();
    expect(download).toHaveBeenCalledOnce();
    store.toggleExperience('react');
    store.moveExperience('react', -1);
    expect(store.ids).toEqual(['react', 'svelte']);
    store.selectMission('');
    expect(store.document?.applicationContext).toBe('');
    expect(profile.experiences.map((item) => item.id)).toEqual(['react', 'svelte']);
  });
  it('keeps the general export available when the mission list fails', async () => {
    const store = createCvExportStore({
      getProfile: async () => profile,
      getMissions: async () => {
        throw new Error('missions unavailable');
      },
      download: vi.fn(),
    });
    await store.open();
    expect(store.document?.title).toBe('Consultante');
    expect(store.document?.applicationContext).toBe('');
    expect(store.status).toContain('CV général');
    expect(store.error).toBe('');
  });

  it('reports missing profiles and download errors without claiming success', async () => {
    const empty = createCvExportStore({
      getProfile: async () => null,
      getMissions: async () => [],
      download: vi.fn(),
    });
    await empty.open();
    expect(empty.error).toContain('Enregistrez votre profil');
    expect(empty.document).toBeNull();
    const failed = createCvExportStore({
      getProfile: async () => profile,
      getMissions: async () => [],
      download: () => {
        throw new Error('blocked');
      },
    });
    await failed.open();
    failed.validate();
    failed.download();
    expect(failed.error).toContain('Impossible de télécharger');
    expect(failed.status).not.toContain('CV téléchargé');
  });
});
