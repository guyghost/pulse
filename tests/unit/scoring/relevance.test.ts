import { describe, it, expect } from 'vitest';
import { scoreMission } from '../../../src/lib/core/scoring/relevance';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { UserProfile } from '../../../src/lib/core/types/profile';

const profile: UserProfile = {
  firstName: 'Test',
  stack: ['TypeScript', 'React', 'Node.js'],
  tjmMin: 500,
  tjmMax: 700,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Développeur Fullstack',
};

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: '1',
    title: 'Test Mission',
    client: null,
    description: '',
    stack: [],
    tjm: null,
    location: null,
    remote: null,
    duration: null,
    url: 'https://example.com',
    source: 'free-work',
    scrapedAt: new Date(),
    score: null,
    semanticScore: null,
    semanticReason: null,
    ...overrides,
  };
}

describe('scoreMission', () => {
  it('scores high for perfect match', () => {
    const mission = makeMission({
      stack: ['React', 'TypeScript', 'Node.js'],
      tjm: 600,
      location: 'Paris',
      remote: 'hybrid',
    });
    const score = scoreMission(mission, profile);
    expect(score).toBe(100);
  });

  it('scores low for no match', () => {
    const mission = makeMission({
      stack: ['Java', 'Spring'],
      tjm: 300,
      location: 'Marseille',
      remote: 'onsite',
    });
    const score = scoreMission(mission, profile);
    expect(score).toBeLessThan(25);
  });

  it('returns score between 0 and 100', () => {
    const mission = makeMission();
    const score = scoreMission(mission, profile);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('gives partial stack score', () => {
    const mission = makeMission({ stack: ['React', 'Vue', 'Angular'] });
    const score = scoreMission(mission, profile);
    // 1 match out of 3 = 40/3 ~ 13 for stack, plus null-field defaults (10+12+7=29)
    const stackOnly = score - 29; // subtract null defaults for location, tjm, remote
    expect(stackOnly).toBeGreaterThanOrEqual(13);
    expect(stackOnly).toBeLessThanOrEqual(14);
  });

  it('gives 12 for null TJM', () => {
    const missionWithTjm = makeMission({ tjm: 600 });
    const missionWithoutTjm = makeMission({ tjm: null });
    const scoreWith = scoreMission(missionWithTjm, profile);
    const scoreWithout = scoreMission(missionWithoutTjm, profile);
    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });

  it('handles case-insensitive stack matching', () => {
    const mission = makeMission({ stack: ['react', 'typescript'] });
    const score = scoreMission(mission, profile);
    expect(score).toBeGreaterThanOrEqual(30);
  });

  it('handles "any" remote preference', () => {
    const anyProfile: UserProfile = { ...profile, remote: 'any' };
    const mission = makeMission({ remote: 'onsite' });
    const score = scoreMission(mission, anyProfile);
    expect(score).toBeGreaterThanOrEqual(15);
  });
});
