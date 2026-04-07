import { describe, it, expect } from 'vitest';
import {
  isMission,
  isUserProfile,
  isSemanticResult,
  isMissionSource,
  isRemoteType,
  isSeniorityLevel,
  parseMission,
  parseUserProfile,
  parseSemanticResultSafe,
} from '../../../src/lib/core/types/type-guards';
import type { Mission, MissionSource, RemoteType } from '../../../src/lib/core/types/mission';
import type { UserProfile, SeniorityLevel } from '../../../src/lib/core/types/profile';

// ============================================================================
// Test fixtures
// ============================================================================

const makeValidMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'test-1',
  title: 'Test Mission',
  client: 'Acme Corp',
  description: 'A test mission description',
  stack: ['TypeScript', 'React'],
  tjm: 600,
  location: 'Paris',
  remote: 'hybrid',
  duration: '6 mois',
  startDate: null,
  url: 'https://example.com/mission/1',
  source: 'free-work',
  scrapedAt: new Date('2026-01-01T00:00:00.000Z'),
  seniority: 'senior',
  score: 75,
  semanticScore: 80,
  semanticReason: 'Good match',
  ...overrides,
});

const makeValidProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  firstName: 'John',
  stack: ['TypeScript', 'React'],
  tjmMin: 500,
  tjmMax: 800,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Developer',
  searchKeywords: [],
  ...overrides,
});

// ============================================================================
// isMission
// ============================================================================

describe('isMission', () => {
  it('returns true for a valid mission', () => {
    const mission = makeValidMission();
    expect(isMission(mission)).toBe(true);
  });

  it('returns true for mission with serialized date', () => {
    const serialized = {
      ...makeValidMission(),
      scrapedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(isMission(serialized)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isMission(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isMission(undefined)).toBe(false);
  });

  it('returns false for primitive', () => {
    expect(isMission('not an object')).toBe(false);
    expect(isMission(123)).toBe(false);
  });

  it('returns false for missing required fields', () => {
    const { id, ...partial } = makeValidMission();
    expect(isMission(partial)).toBe(false);
  });

  it('returns false for invalid source', () => {
    const mission = { ...makeValidMission(), source: 'invalid-source' };
    expect(isMission(mission)).toBe(false);
  });

  it('returns false for invalid remote type', () => {
    const mission = { ...makeValidMission(), remote: 'invalid' };
    expect(isMission(mission)).toBe(false);
  });

  it('returns true for mission with null optional fields', () => {
    const mission = makeValidMission({
      client: null,
      tjm: null,
      location: null,
      remote: null,
      duration: null,
      seniority: null,
      score: null,
      semanticScore: null,
      semanticReason: null,
    });
    expect(isMission(mission)).toBe(true);
  });
});

// ============================================================================
// isUserProfile
// ============================================================================

describe('isUserProfile', () => {
  it('returns true for a valid profile', () => {
    const profile = makeValidProfile();
    expect(isUserProfile(profile)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isUserProfile(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isUserProfile(undefined)).toBe(false);
  });

  it('returns false for missing required fields', () => {
    const { stack, ...partial } = makeValidProfile();
    expect(isUserProfile(partial)).toBe(false);
  });

  it('returns true for profile with empty stack array', () => {
    const profile = makeValidProfile({
      stack: [],
    });
    expect(isUserProfile(profile)).toBe(true);
  });

  it('returns false for invalid seniority', () => {
    const profile = { ...makeValidProfile(), seniority: 'expert' };
    expect(isUserProfile(profile)).toBe(false);
  });
});

// ============================================================================
// isSemanticResult
// ============================================================================

describe('isSemanticResult', () => {
  it('returns true for valid semantic result', () => {
    expect(isSemanticResult({ score: 85, reason: 'Good match' })).toBe(true);
  });

  it('returns true for score as string number', () => {
    expect(isSemanticResult({ score: '85', reason: 'Good match' })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isSemanticResult(null)).toBe(false);
  });

  it('returns false for missing fields', () => {
    expect(isSemanticResult({ score: 85 })).toBe(false);
    expect(isSemanticResult({ reason: 'Good match' })).toBe(false);
  });

  it('returns false for null score', () => {
    expect(isSemanticResult({ score: null, reason: 'Test' })).toBe(false);
  });

  it('returns false for object score', () => {
    expect(isSemanticResult({ score: { value: 85 }, reason: 'Test' })).toBe(false);
  });
});

// ============================================================================
// isMissionSource
// ============================================================================

describe('isMissionSource', () => {
  it('returns true for valid sources', () => {
    const validSources: MissionSource[] = [
      'free-work',
      'lehibou',
      'hiway',
      'collective',
      'cherry-pick',
    ];
    for (const source of validSources) {
      expect(isMissionSource(source)).toBe(true);
    }
  });

  it('returns false for invalid source', () => {
    expect(isMissionSource('invalid')).toBe(false);
    expect(isMissionSource('')).toBe(false);
  });

  it('returns false for non-string', () => {
    expect(isMissionSource(123)).toBe(false);
    expect(isMissionSource(null)).toBe(false);
  });
});

// ============================================================================
// isRemoteType
// ============================================================================

describe('isRemoteType', () => {
  it('returns true for valid remote types', () => {
    const validTypes: RemoteType[] = ['full', 'hybrid', 'onsite'];
    for (const type of validTypes) {
      expect(isRemoteType(type)).toBe(true);
    }
  });

  it('returns false for invalid remote type', () => {
    expect(isRemoteType('remote')).toBe(false);
    expect(isRemoteType('')).toBe(false);
  });
});

// ============================================================================
// isSeniorityLevel
// ============================================================================

describe('isSeniorityLevel', () => {
  it('returns true for valid seniority levels', () => {
    const validLevels: SeniorityLevel[] = ['junior', 'confirmed', 'senior'];
    for (const level of validLevels) {
      expect(isSeniorityLevel(level)).toBe(true);
    }
  });

  it('returns false for invalid seniority', () => {
    expect(isSeniorityLevel('expert')).toBe(false);
    expect(isSeniorityLevel('lead')).toBe(false);
    expect(isSeniorityLevel('')).toBe(false);
  });
});

// ============================================================================
// parseMission (validation used in db.ts)
// ============================================================================

describe('parseMission', () => {
  it('returns validated mission for valid input', () => {
    const input = {
      ...makeValidMission(),
      scrapedAt: '2026-01-01T00:00:00.000Z',
    };
    const result = parseMission(input);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('test-1');
    expect(result!.scrapedAt).toBeInstanceOf(Date);
  });

  it('returns null for invalid mission', () => {
    const input = { id: 'test' }; // Missing required fields
    expect(parseMission(input)).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseMission(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseMission(undefined)).toBeNull();
  });

  it('handles corrupted data gracefully', () => {
    const corrupted = {
      id: 'test',
      title: 123, // Wrong type
      source: 'invalid', // Invalid enum value
    };
    expect(parseMission(corrupted)).toBeNull();
  });

  it('validates stack array elements', () => {
    const mission = {
      ...makeValidMission(),
      scrapedAt: '2026-01-01T00:00:00.000Z',
      stack: ['TypeScript', null, 123], // Invalid elements
    };
    expect(parseMission(mission)).toBeNull();
  });
});

// ============================================================================
// parseUserProfile (validation used in db.ts)
// ============================================================================

describe('parseUserProfile', () => {
  it('returns validated profile for valid input', () => {
    const input = makeValidProfile();
    const result = parseUserProfile(input);
    expect(result).not.toBeNull();
    expect(result!.stack).toEqual(['TypeScript', 'React']);
  });

  it('returns null for invalid profile', () => {
    const input = { stack: 'not-an-array' };
    expect(parseUserProfile(input)).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseUserProfile(null)).toBeNull();
  });

  it('handles corrupted data gracefully', () => {
    const corrupted = {
      stack: ['React'],
      seniority: 'invalid-level',
    };
    expect(parseUserProfile(corrupted)).toBeNull();
  });
});

// ============================================================================
// parseSemanticResultSafe
// ============================================================================

describe('parseSemanticResultSafe', () => {
  it('returns validated result for valid input', () => {
    const input = { score: 85, reason: 'Good match' };
    const result = parseSemanticResultSafe(input);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(85);
    expect(result!.reason).toBe('Good match');
  });

  it('parses string score to number', () => {
    const input = { score: '75', reason: 'Decent match' };
    const result = parseSemanticResultSafe(input);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(75);
  });

  it('returns null for invalid input', () => {
    expect(parseSemanticResultSafe({ score: 85 })).toBeNull();
    expect(parseSemanticResultSafe({ reason: 'Test' })).toBeNull();
    expect(parseSemanticResultSafe(null)).toBeNull();
  });
});
