import { describe, expect, it } from 'vitest';
import {
  buildProfileImpactItems,
  buildProfileImpactSimulation,
  computeProfileImpactCompletion,
  type ProfileImpactInput,
} from '../../../src/lib/core/profile/profile-impact';

function makeProfile(overrides: Partial<ProfileImpactInput> = {}): ProfileImpactInput {
  return {
    firstName: '',
    jobTitle: '',
    location: '',
    remote: 'any',
    tjmMin: 0,
    tjmMax: 0,
    stack: [],
    searchKeywords: [],
    ...overrides,
  };
}

describe('profile impact model', () => {
  it('orders fields by business impact instead of form order', () => {
    const items = buildProfileImpactItems(makeProfile());

    expect(items.map((item) => item.id).slice(0, 5)).toEqual([
      'stack',
      'tjm-min',
      'remote',
      'location',
      'search-keywords',
    ]);
    expect(items.map((item) => item.weight).slice(0, 5)).toEqual([25, 20, 15, 15, 10]);
  });

  it('computes weighted completion from completed impact fields', () => {
    const items = buildProfileImpactItems(
      makeProfile({
        firstName: 'Guy',
        stack: ['Svelte', 'TypeScript'],
        tjmMin: 650,
        location: 'Paris',
      })
    );

    expect(computeProfileImpactCompletion(items)).toBe(62);
  });

  it('simulates the gain from the three highest-impact missing fields', () => {
    const items = buildProfileImpactItems(makeProfile({ firstName: 'Guy' }));
    const simulation = buildProfileImpactSimulation(items);

    expect(simulation.currentCompletion).toBe(2);
    expect(simulation.nextCompletion).toBe(62);
    expect(simulation.delta).toBe(60);
    expect(simulation.prioritizedItems.map((item) => item.id)).toEqual([
      'stack',
      'tjm-min',
      'remote',
    ]);
    expect(simulation.title).toContain('Stack technique, TJM minimum, Mode de travail');
  });

  it('marks a fully specified profile as ready for scoring and alerts', () => {
    const items = buildProfileImpactItems(
      makeProfile({
        firstName: 'Guy',
        jobTitle: 'Développeur Svelte Senior',
        location: 'Paris',
        remote: 'hybrid',
        tjmMin: 650,
        tjmMax: 850,
        stack: ['Svelte', 'TypeScript'],
        searchKeywords: ['SaaS'],
      })
    );
    const simulation = buildProfileImpactSimulation(items);

    expect(simulation.currentCompletion).toBe(100);
    expect(simulation.nextCompletion).toBe(100);
    expect(simulation.delta).toBe(0);
    expect(simulation.prioritizedItems).toEqual([]);
    expect(simulation.description).toContain('scoring et les alertes');
  });
});
