import { describe, it, expect } from 'vitest';
import { buildSearchContext } from '../../../src/lib/core/connectors/search-context';
import type { UserProfile } from '../../../src/lib/core/types/profile';

/**
 * Helper to create a valid UserProfile with defaults and overrides.
 * searchKeywords is now a required field in UserProfile.
 */
function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    firstName: 'Test',
    stack: ['TypeScript', 'React'],
    tjmMin: 500,
    tjmMax: 800,
    location: 'Paris',
    remote: 'hybrid',
    seniority: 'senior',
    jobTitle: 'Développeur Fullstack',
    searchKeywords: [], // Default to empty array
    ...overrides,
  };
}

describe('buildSearchContext', () => {
  /**
   * Test 1: With searchKeywords — query should be searchKeywords joined by space
   */
  describe('query from searchKeywords', () => {
    it('builds query from searchKeywords array joined by space', () => {
      const profile = makeProfile({
        searchKeywords: ['React', 'Developer'],
        stack: ['React', 'TypeScript'],
      });
      const lastSync = new Date('2026-03-20T10:00:00Z');

      const context = buildSearchContext(profile, lastSync);

      expect(context.query).toBe('React Developer');
      expect(context.skills).toEqual(['React', 'TypeScript']);
    });

    it('handles single searchKeyword', () => {
      const profile = makeProfile({
        searchKeywords: ['Fullstack'],
      });
      const context = buildSearchContext(profile, null);

      expect(context.query).toBe('Fullstack');
    });

    it('handles searchKeywords with many terms', () => {
      const profile = makeProfile({
        searchKeywords: ['React', 'Node.js', 'Fullstack', 'Freelance'],
      });
      const context = buildSearchContext(profile, null);

      expect(context.query).toBe('React Node.js Fullstack Freelance');
    });
  });

  /**
   * Test 2: Without searchKeywords (empty array), with jobTitle — query should be jobTitle
   */
  describe('query fallback to jobTitle', () => {
    it('uses jobTitle when searchKeywords is empty', () => {
      const profile = makeProfile({
        searchKeywords: [],
        jobTitle: 'Développeur Frontend',
      });
      const context = buildSearchContext(profile, null);

      expect(context.query).toBe('Développeur Frontend');
    });

    it('uses jobTitle with special characters', () => {
      const profile = makeProfile({
        searchKeywords: [],
        jobTitle: 'Développeur C#/.NET',
      });
      const context = buildSearchContext(profile, null);

      expect(context.query).toBe('Développeur C#/.NET');
    });
  });

  /**
   * Test 3: Without searchKeywords or jobTitle — query should be empty string
   */
  describe('query empty fallback', () => {
    it('returns empty string when both searchKeywords and jobTitle are empty', () => {
      const profile = makeProfile({
        searchKeywords: [],
        jobTitle: '',
      });
      const context = buildSearchContext(profile, null);

      expect(context.query).toBe('');
    });

    it('trims leading/trailing whitespace from query', () => {
      const profile = makeProfile({
        searchKeywords: ['  React  ', '  TypeScript  '],
      });
      const context = buildSearchContext(profile, null);

      // Query is trimmed at edges, but internal whitespace from join is preserved
      // '  React  ' + ' ' + '  TypeScript  ' = '  React    TypeScript  ' → trim → 'React    TypeScript'
      // (2 trailing + 1 join + 2 leading = 5 spaces between words)
      expect(context.query).toBe('React     TypeScript');
      // No leading/trailing whitespace
      expect(context.query.startsWith(' ')).toBe(false);
      expect(context.query.endsWith(' ')).toBe(false);
    });
  });

  /**
   * Test 4: Skills mapping — skills should come from profile.stack
   */
  describe('skills mapping', () => {
    it('maps skills from profile.stack', () => {
      const profile = makeProfile({
        stack: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
      });
      const context = buildSearchContext(profile, null);

      expect(context.skills).toEqual(['React', 'TypeScript', 'Node.js', 'PostgreSQL']);
    });

    it('returns empty skills array when stack is empty', () => {
      const profile = makeProfile({
        stack: [],
      });
      const context = buildSearchContext(profile, null);

      expect(context.skills).toEqual([]);
    });

    it('preserves skill order from stack', () => {
      const profile = makeProfile({
        stack: ['Vue.js', 'Nuxt', 'TypeScript', 'GraphQL'],
      });
      const context = buildSearchContext(profile, null);

      expect(context.skills).toEqual(['Vue.js', 'Nuxt', 'TypeScript', 'GraphQL']);
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
        searchKeywords: ['React', 'TypeScript', 'Senior'],
        stack: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
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
      expect(context.skills).toEqual(['React', 'TypeScript', 'Node.js', 'PostgreSQL']);
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
        searchKeywords: [],
        stack: [],
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
    it('handles searchKeywords with special characters', () => {
      const profile = makeProfile({
        searchKeywords: ['C#', '.NET', 'Azure DevOps'],
      });
      const context = buildSearchContext(profile, null);

      expect(context.query).toBe('C# .NET Azure DevOps');
    });

    it('handles searchKeywords with accented characters', () => {
      const profile = makeProfile({
        searchKeywords: ['Développeur', 'Ingénieur', 'Études'],
      });
      const context = buildSearchContext(profile, null);

      expect(context.query).toBe('Développeur Ingénieur Études');
    });

    it('trims leading/trailing whitespace from searchKeywords', () => {
      const profile = makeProfile({
        searchKeywords: ['  React  ', '  TypeScript  '],
      });
      const context = buildSearchContext(profile, null);

      // trim() removes leading/trailing whitespace from the final joined string
      // Internal whitespace from join is preserved: '  React  ' + ' ' + '  TypeScript  ' = '  React    TypeScript  '
      expect(context.query).toBe('React     TypeScript');
      expect(context.query.startsWith(' ')).toBe(false);
      expect(context.query.endsWith(' ')).toBe(false);
    });
  });
});
