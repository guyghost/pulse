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
    scoreBreakdown: null,
    score: null,
    semanticScore: null,
    semanticReason: null,
    ...overrides,
  };
}

/**
 * Helper: call scoreMission and return the total numeric score.
 */
function score(mission: Mission, prof: UserProfile, now?: Date): number {
  return scoreMission(mission, prof, now).total;
}

/**
 * Helper: call scoreMission and return the full result with breakdown.
 */
function scoreWithBreakdown(mission: Mission, prof: UserProfile, now?: Date) {
  return scoreMission(mission, prof, now);
}

describe('scoreMission', () => {
  it('scores high for perfect match', () => {
    const mission = makeMission({
      stack: ['React', 'TypeScript', 'Node.js'],
      tjm: 600,
      location: 'Paris',
      remote: 'hybrid',
    });
    expect(score(mission, profile)).toBe(100);
  });

  it('scores low for no match', () => {
    const mission = makeMission({
      stack: ['Java', 'Spring'],
      tjm: 300,
      location: 'Marseille',
      remote: 'onsite',
    });
    expect(score(mission, profile)).toBeLessThan(25);
  });

  it('returns score between 0 and 100', () => {
    const mission = makeMission();
    expect(score(mission, profile)).toBeGreaterThanOrEqual(0);
    expect(score(mission, profile)).toBeLessThanOrEqual(100);
  });

  it('gives partial stack score', () => {
    const mission = makeMission({ stack: ['React', 'Vue', 'Angular'] });
    const s = score(mission, profile);
    // 1 match out of 3 = 40/3 ~ 13 for stack, plus null-field defaults (10+12+7=29)
    const stackOnly = s - 29; // subtract null defaults for location, tjm, remote
    expect(stackOnly).toBeGreaterThanOrEqual(13);
    expect(stackOnly).toBeLessThanOrEqual(14);
  });

  it('gives 12 for null TJM', () => {
    const missionWithTjm = makeMission({ tjm: 600 });
    const missionWithoutTjm = makeMission({ tjm: null });
    expect(score(missionWithTjm, profile)).toBeGreaterThan(score(missionWithoutTjm, profile));
  });

  it('handles case-insensitive stack matching', () => {
    const mission = makeMission({ stack: ['react', 'typescript'] });
    expect(score(mission, profile)).toBeGreaterThanOrEqual(30);
  });

  it('handles "any" remote preference', () => {
    const anyProfile: UserProfile = { ...profile, remote: 'any' };
    const mission = makeMission({ remote: 'onsite' });
    expect(score(mission, anyProfile)).toBeGreaterThanOrEqual(15);
  });

  it('gives full stack weight when profile has no stack (does not penalize user)', () => {
    const profileNoStack: UserProfile = { ...profile, stack: [] };
    const mission = makeMission({
      stack: ['React', 'TypeScript', 'Node.js'],
      tjm: 600,
      location: 'Paris',
      remote: 'hybrid',
    });
    const s = score(mission, profileNoStack);
    expect(s).toBeGreaterThanOrEqual(60);
    expect(s).toBeLessThanOrEqual(100);
  });

  describe('structured breakdown', () => {
    it('returns breakdown with criteria', () => {
      const mission = makeMission({
        stack: ['React', 'TypeScript'],
        tjm: 600,
        location: 'Paris',
        remote: 'hybrid',
      });
      const result = scoreWithBreakdown(mission, profile);

      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.stack).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.location).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.tjm).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.remote).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.seniorityBonus).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.seniorityBonus).toBeLessThanOrEqual(5);
    });

    it('provides seniority bonus for exact match', () => {
      const mission = makeMission({
        seniority: 'senior',
      });
      const result = scoreWithBreakdown(mission, profile);
      expect(result.breakdown.seniorityBonus).toBe(5);
    });

    it('provides partial seniority bonus for adjacent level', () => {
      const mission = makeMission({
        seniority: 'confirmed',
      });
      const result = scoreWithBreakdown(mission, profile);
      expect(result.breakdown.seniorityBonus).toBe(2);
    });

    it('provides start date bonus for missions starting within 7 days', () => {
      const now = new Date('2026-04-08');
      const mission = makeMission({
        startDate: '2026-04-12',
      });
      const result = scoreWithBreakdown(mission, profile, now);
      expect(result.breakdown.startDateBonus).toBe(5);
    });

    it('provides no start date bonus when no date provided', () => {
      const mission = makeMission({ startDate: null });
      const result = scoreWithBreakdown(mission, profile);
      expect(result.breakdown.startDateBonus).toBe(0);
    });
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
      const s = score(mission, baseProfile);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    });

    it('should not crash when profile has undefined entries in stack array', () => {
      const profileWithUndefined: UserProfile = {
        ...baseProfile,
        stack: ['TypeScript', undefined, 'React'] as any,
      };
      const mission = makeMission({ stack: ['React', 'TypeScript'] });
      const s = score(mission, profileWithUndefined);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    });

    it('should handle gracefully mission with empty string entries in stack', () => {
      const mission = makeMission({
        stack: ['TypeScript', '', 'React', ''],
      });
      const s = score(mission, baseProfile);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    });

    it('should not crash when mission has null entries in stack (runtime pollution)', () => {
      const mission = makeMission({
        stack: ['TypeScript', null, 'React', null] as any,
      });
      const s = score(mission, baseProfile);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
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
      const mission = makeMission({
        stack: ['TypeScript', 'React'],
        location: 'Nanterre',
        tjm: 600,
        remote: 'hybrid',
      });

      const exactMission = makeMission({
        stack: ['TypeScript', 'React'],
        location: 'Paris',
        tjm: 600,
        remote: 'hybrid',
      });

      const nearbyScore = score(mission, parisProfile);
      const exactScore = score(exactMission, parisProfile);

      expect(nearbyScore).toBeGreaterThan(0);
      expect(nearbyScore).toBeLessThan(exactScore);
      expect(exactScore - nearbyScore).toBe(6);
    });

    it('scores nearby (Courbevoie) higher than no match (Lyon) for Paris profile', () => {
      const nearbyMission = makeMission({
        stack: ['TypeScript', 'React'],
        location: 'Courbevoie',
        tjm: 600,
        remote: 'hybrid',
      });

      const noMatchMission = makeMission({
        stack: ['TypeScript', 'React'],
        location: 'Lyon',
        tjm: 600,
        remote: 'hybrid',
      });

      const nearbyScore = score(nearbyMission, parisProfile);
      const noMatchScore = score(noMatchMission, parisProfile);

      expect(nearbyScore).toBeGreaterThan(noMatchScore);
    });
  });
});
