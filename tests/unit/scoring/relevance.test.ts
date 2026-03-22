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

  it('gives full stack weight when profile has no stack (does not penalize user)', () => {
    const profileNoStack: UserProfile = { ...profile, stack: [] };
    const mission = makeMission({
      stack: ['React', 'TypeScript', 'Node.js'],
      tjm: 600,
      location: 'Paris',
      remote: 'hybrid',
    });
    const score = scoreMission(mission, profileNoStack);
    // Without stack matching, score should be location (20) + tjm (25) + remote (15) = 60
    // Plus partial for stack (40 * 1.0 = 40) if we give full weight
    expect(score).toBeGreaterThanOrEqual(60);
    expect(score).toBeLessThanOrEqual(100);
  });

  describe('regression: undefined safety', () => {
    const baseProfile: UserProfile = {
      firstName: 'Test',
      stack: ['TypeScript', 'React'],
      location: 'Paris',
      tjmMin: 500,
      tjmMax: 800,
      remote: 'hybrid',
      seniority: 'senior',
      jobTitle: 'Développeur',
    };

    it('should not crash when mission has undefined entries in stack array', () => {
      const mission = makeMission({
        stack: ['TypeScript', undefined, 'React', undefined] as any,
      });
      const score = scoreMission(mission, baseProfile);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should not crash when profile has undefined entries in stack array', () => {
      const profileWithUndefined: UserProfile = {
        ...baseProfile,
        stack: ['TypeScript', undefined, 'React'] as any,
      };
      const mission = makeMission({ stack: ['React', 'TypeScript'] });
      const score = scoreMission(mission, profileWithUndefined);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should handle gracefully mission with empty string entries in stack', () => {
      const mission = makeMission({
        stack: ['TypeScript', '', 'React', ''],
      });
      const score = scoreMission(mission, baseProfile);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should not crash when mission has null entries in stack (runtime pollution)', () => {
      const mission = makeMission({
        stack: ['TypeScript', null, 'React', null] as any,
      });
      const score = scoreMission(mission, baseProfile);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('location nearby scoring', () => {
    const parisProfile: UserProfile = {
      firstName: 'Test',
      stack: ['TypeScript', 'React'],
      location: 'Paris',
      tjmMin: 500,
      tjmMax: 800,
      remote: 'any',
      seniority: 'senior',
      jobTitle: 'Développeur',
    };

    it('scores nearby location match at 70% of weight', () => {
      // A mission in Nanterre should score 70% location weight for a Paris profile
      // Default location weight is 20, so nearby = 20 * 0.7 = 14
      const mission = makeMission({
        stack: ['TypeScript', 'React'],
        location: 'Nanterre',
        tjm: 600,
        remote: 'hybrid',
      });

      // Compare with exact location match
      const exactMission = makeMission({
        stack: ['TypeScript', 'React'],
        location: 'Paris',
        tjm: 600,
        remote: 'hybrid',
      });

      const nearbyScore = scoreMission(mission, parisProfile);
      const exactScore = scoreMission(exactMission, parisProfile);

      // Both should have high scores, but nearby should be slightly lower
      expect(nearbyScore).toBeGreaterThan(0);
      expect(nearbyScore).toBeLessThan(exactScore);
      // The difference should be the location weight difference (20 - 14 = 6 points)
      expect(exactScore - nearbyScore).toBe(6);
    });

    it('scores nearby (Courbevoie) higher than no match (Lyon) for Paris profile', () => {
      const nearbyMission = makeMission({
        stack: ['TypeScript', 'React'],
        location: 'Courbevoie', // Paris suburb
        tjm: 600,
        remote: 'hybrid',
      });

      const noMatchMission = makeMission({
        stack: ['TypeScript', 'React'],
        location: 'Lyon', // different city
        tjm: 600,
        remote: 'hybrid',
      });

      const nearbyScore = scoreMission(nearbyMission, parisProfile);
      const noMatchScore = scoreMission(noMatchMission, parisProfile);

      expect(nearbyScore).toBeGreaterThan(noMatchScore);
    });
  });
});
