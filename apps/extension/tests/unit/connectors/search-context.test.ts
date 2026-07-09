import { describe, it, expect } from 'vitest';
import { buildSearchContext } from '../../../src/lib/core/connectors/search-context';
import type { UserProfile } from '../../../src/lib/core/types/profile';

/**
 * Helper to create a valid UserProfile with defaults and overrides.
 * keywords is now the unified field on UserProfile.
 */
function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    firstName: 'Test',
    keywords: ['TypeScript', 'React'],
    tjmMin: 500,
    tjmMax: 800,
    location: 'Paris',
    remote: 'hybrid',
    seniority: 'senior',
    jobTitle: 'Développeur Fullstack',
    ...overrides,
  };
}

describe('buildSearchContext', () => {
  /**
   * Test 1: With keywords — query should be keywords joined by space
   */
  describe('query from keywords', () => {
    it('builds query from keywords array joined by space', () => {
      const profile = makeProfile({
        keywords: ['React', 'Developer'],
      });
      const lastSync = new Date('2026-03-20T10:00:00Z');

      const context = buildSearchContext(profile, lastSync);

      expect(context.query).toBe('React Developer');
      expect(context.skills).toEqual([]);
    });

    it('handles single keyword', () => {
      const profile = makeProfile({
        keywords: ['Fullstack'],
      });
      const context = buildSearchContext(profile, null);

      expect(context.query).toBe('Fullstack');
    });

    it('handles keywords with many terms', () => {
      const profile = makeProfile({
        keywords: ['React', 'Node.js', 'Fullstack', 'Freelance'],
      });
      const context = buildSearchContext(profile, null);

      expect(context.query).toBe('React Node.js Fullstack Freelance');
    });
  });

  /**
   * Test 2: Without keywords (empty array), with jobTitle — query should be EMPTY
   * jobTitle is NOT used as fallback because it's too restrictive for API keyword search.
   * Relevance is handled by local scoring (scoreMission), not server-side filtering.
   */
  describe('query does NOT fallback to jobTitle', () => {
    it('returns empty query when keywords is empty (even if jobTitle exists)', () => {
      const profile = makeProfile({
        keywords: [],
        jobTitle: 'Développeur Frontend',
      });
      const context = buildSearchContext(profile, null);

      expect(context.query).toBe('');
    });

    it('returns empty query for special character jobTitle (no fallback)', () => {
      const profile = makeProfile({
        keywords: [],
        jobTitle: 'Développeur C#/.NET',
      });
      const context = buildSearchContext(profile, null);

      expect(context.query).toBe('');
    });
  });

  /**
   * Test 3: Without keywords or jobTitle — query should be empty string
   */
  describe('query empty fallback', () => {
    it('returns empty string when both keywords and jobTitle are empty', () => {
      const profile = makeProfile({
        keywords: [],
        jobTitle: '',
      });
      const context = buildSearchContext(profile, null);

      expect(context.query).toBe('');
    });

    it('trims leading/trailing whitespace from query', () => {
      const profile = makeProfile({
        keywords: ['  React  ', '  TypeScript  '],
      });
      const context = buildSearchContext(profile, null);

      expect(context.query).toBe('React TypeScript');
      // No leading/trailing whitespace
      expect(context.query.startsWith(' ')).toBe(false);
      expect(context.query.endsWith(' ')).toBe(false);
    });

    it('ignores blank keywords when building query', () => {
      const profile = makeProfile({
        keywords: ['React', ' ', '', '\t', 'TypeScript'],
      });
      const context = buildSearchContext(profile, null);

      expect(context.query).toBe('React TypeScript');
    });
  });

  /**
   * Test 4: Skills mapping — skills are always empty (not sent as server-side filters)
   * Skills are handled by local scoring (scoreMission), not server-side filtering,
   * because APIs use AND logic and skill names vary across platforms.
   */
  describe('skills mapping', () => {
    it('returns empty skills array (skills not sent to APIs)', () => {
      const profile = makeProfile({
        keywords: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
      });
      const context = buildSearchContext(profile, null);

      expect(context.skills).toEqual([]);
    });

    it('returns empty skills array even when keywords is empty', () => {
      const profile = makeProfile({
        keywords: [],
      });
      const context = buildSearchContext(profile, null);

      expect(context.skills).toEqual([]);
    });

    it('returns empty skills regardless of keywords contents', () => {
      const profile = makeProfile({
        keywords: ['Vue.js', 'Nuxt', 'TypeScript', 'GraphQL'],
      });
      const context = buildSearchContext(profile, null);

      expect(context.skills).toEqual([]);
    });
  });

  /**
   * Test 5: Location mapping
   */
  describe('location mapping', () => {
    it('maps location from profile.location', () => {
      const profile = makeProfile({
        location: 'Paris',
      });
      const context = buildSearchContext(profile, null);

      expect(context.location).toBe('Paris');
    });

    it('returns null when location is empty string', () => {
      const profile = makeProfile({
        location: '',
      });
      const context = buildSearchContext(profile, null);

      expect(context.location).toBeNull();
    });

    it('handles location with special characters', () => {
      const profile = makeProfile({
        location: 'Lyon, Auvergne-Rhône-Alpes',
      });
      const context = buildSearchContext(profile, null);

      expect(context.location).toBe('Lyon, Auvergne-Rhône-Alpes');
    });
  });

  /**
   * Test 6: Remote mapping
   */
  describe('remote mapping', () => {
    it('maps full remote from profile', () => {
      const profile = makeProfile({
        remote: 'full',
      });
      const context = buildSearchContext(profile, null);

      expect(context.remote).toBe('full');
    });

    it('maps hybrid remote from profile', () => {
      const profile = makeProfile({
        remote: 'hybrid',
      });
      const context = buildSearchContext(profile, null);

      expect(context.remote).toBe('hybrid');
    });

    it('maps onsite remote from profile', () => {
      const profile = makeProfile({
        remote: 'onsite',
      });
      const context = buildSearchContext(profile, null);

      expect(context.remote).toBe('onsite');
    });

    it('maps "any" remote preference from profile', () => {
      const profile = makeProfile({
        remote: 'any',
      });
      const context = buildSearchContext(profile, null);

      expect(context.remote).toBe('any');
    });
  });

  /**
   * Test 7: Last sync passthrough
   */
  describe('lastSync passthrough', () => {
    it('passes through lastSync date', () => {
      const profile = makeProfile();
      const lastSync = new Date('2026-03-20T10:00:00Z');
      const context = buildSearchContext(profile, lastSync);

      expect(context.lastSync).toBe(lastSync);
    });

    it('returns null when lastSync is null', () => {
      const profile = makeProfile();
      const context = buildSearchContext(profile, null);

      expect(context.lastSync).toBeNull();
    });

    it('handles recent lastSync date', () => {
      const profile = makeProfile();
      const lastSync = new Date('2026-03-24T08:30:00Z');
      const context = buildSearchContext(profile, lastSync);

      expect(context.lastSync).toEqual(lastSync);
    });
  });

  /**
   * Test 8: Complete profile — all fields populated correctly
   */
  describe('complete profile', () => {
    it('builds full context with all fields populated', () => {
      const profile = makeProfile({
        firstName: 'Jean',
        keywords: ['React', 'TypeScript', 'Senior'],
        tjmMin: 600,
        tjmMax: 800,
        location: 'Paris',
        remote: 'full',
        seniority: 'senior',
        jobTitle: 'Développeur Fullstack Senior',
      });
      const lastSync = new Date('2026-03-22T14:00:00Z');

      const context = buildSearchContext(profile, lastSync);

      expect(context.query).toBe('React TypeScript Senior');
      expect(context.skills).toEqual([]);
      expect(context.location).toBe('Paris');
      expect(context.remote).toBe('full');
      expect(context.lastSync).toEqual(lastSync);
    });
  });

  /**
   * Test 9: Minimal profile — only required fields
   */
  describe('minimal profile', () => {
    it('builds context with minimal profile (empty arrays, empty strings)', () => {
      const profile = makeProfile({
        keywords: [],
        location: '',
        jobTitle: '',
        remote: 'any',
      });
      const context = buildSearchContext(profile, null);

      expect(context.query).toBe('');
      expect(context.skills).toEqual([]);
      expect(context.location).toBeNull();
      expect(context.remote).toBe('any');
      expect(context.lastSync).toBeNull();
    });
  });

  /**
   * Test 10: Edge cases
   */
  describe('edge cases', () => {
    it('handles keywords with special characters', () => {
      const profile = makeProfile({
        keywords: ['C#', '.NET', 'Azure DevOps'],
      });
      const context = buildSearchContext(profile, null);

      expect(context.query).toBe('C# .NET Azure DevOps');
    });

    it('handles keywords with accented characters', () => {
      const profile = makeProfile({
        keywords: ['Développeur', 'Ingénieur', 'Études'],
      });
      const context = buildSearchContext(profile, null);

      expect(context.query).toBe('Développeur Ingénieur Études');
    });

    it('trims leading/trailing whitespace from keywords', () => {
      const profile = makeProfile({
        keywords: ['  React  ', '  TypeScript  '],
      });
      const context = buildSearchContext(profile, null);

      expect(context.query).toBe('React TypeScript');
      expect(context.query.startsWith(' ')).toBe(false);
      expect(context.query.endsWith(' ')).toBe(false);
    });
  });
});
