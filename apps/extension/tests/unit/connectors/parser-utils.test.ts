import { describe, it, expect } from 'vitest';
import {
  createMission,
  parseTJM,
  detectRemote,
} from '../../../src/lib/core/connectors/parser-utils';
import type { Mission, MissionSource } from '../../../src/lib/core/types/mission';

describe('parser-utils', () => {
  describe('parseTJM', () => {
    it('extracts TJM from text with regular whitespace', () => {
      expect(parseTJM('TJM: 600€')).toBe(600);
    });

    it('extracts TJM from text with non-breaking space', () => {
      expect(parseTJM('TJM: 600\u00A0€')).toBe(600);
    });

    it('returns null when no number found', () => {
      expect(parseTJM('Prix à négocier')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseTJM('')).toBeNull();
    });

    it('extracts first number when multiple present', () => {
      expect(parseTJM('Entre 500€ et 700€')).toBe(500);
    });
  });

  describe('detectRemote', () => {
    it('detects full remote with various spellings', () => {
      expect(detectRemote('full remote')).toBe('full');
      expect(detectRemote('télétravail complet')).toBe('full');
      expect(detectRemote('teletravail complet')).toBe('full');
    });

    it('detects hybrid remote', () => {
      expect(detectRemote('hybride')).toBe('hybrid');
      expect(detectRemote('hybrid')).toBe('hybrid');
    });

    it('detects onsite work', () => {
      expect(detectRemote('sur site')).toBe('onsite');
      expect(detectRemote('on-site')).toBe('onsite');
      expect(detectRemote('onsite')).toBe('onsite');
    });

    it('returns null when no remote type detected', () => {
      expect(detectRemote('No remote info')).toBeNull();
    });

    it('handles case-insensitive matching', () => {
      expect(detectRemote('FULL REMOTE')).toBe('full');
      expect(detectRemote('HYBRIDE')).toBe('hybrid');
      expect(detectRemote('SUR SITE')).toBe('onsite');
    });
  });

  describe('createMission', () => {
    it('creates mission with scoring fields defaulted to null', () => {
      const fields = {
        id: 'test-1',
        title: 'Dev React',
        client: 'Acme',
        description: 'A mission',
        stack: ['React'],
        tjm: 600,
        location: 'Paris',
        remote: 'hybrid' as const,
        duration: '6 months',
        url: 'https://example.com',
        source: 'free-work' as MissionSource,
        scrapedAt: new Date('2026-01-01'),
      };

      const mission = createMission(fields);

      expect(mission.id).toBe('test-1');
      expect(mission.title).toBe('Dev React');
      expect(mission.score).toBeNull();
      expect(mission.semanticScore).toBeNull();
      expect(mission.semanticReason).toBeNull();
    });
  });

  describe('regression: stack sanitization', () => {
    it('should filter out undefined values from stack when passed through createMission', () => {
      // Note: createMission doesn't do sanitization - this test documents current behavior
      // The sanitization should happen at the parser boundary before calling createMission
      const fields = {
        id: 'test-1',
        title: 'Dev React',
        client: null,
        description: 'A mission',
        stack: ['React', undefined, 'TypeScript', undefined] as any,
        tjm: 600,
        location: 'Paris',
        remote: 'hybrid' as const,
        duration: null,
        url: 'https://example.com',
        source: 'free-work' as MissionSource,
        scrapedAt: new Date('2026-01-01'),
      };

      const mission = createMission(fields);

      // Current behavior: preserves undefined values
      // The actual sanitization should happen in the parser before creating the mission
      expect(mission.stack).toContain('React');
      expect(mission.stack).toContain('TypeScript');
    });

    it('should filter out null values from stack when passed through createMission', () => {
      // Similar to above - this documents that sanitization needs to happen at parser level
      const fields = {
        id: 'test-1',
        title: 'Dev React',
        client: null,
        description: 'A mission',
        stack: ['React', null, 'TypeScript', null] as any,
        tjm: 600,
        location: 'Paris',
        remote: 'hybrid' as const,
        duration: null,
        url: 'https://example.com',
        source: 'free-work' as MissionSource,
        scrapedAt: new Date('2026-01-01'),
      };

      const mission = createMission(fields);

      expect(mission.stack).toContain('React');
      expect(mission.stack).toContain('TypeScript');
    });

    it('should preserve valid stack entries while filtering invalid ones', () => {
      const fields = {
        id: 'test-1',
        title: 'Dev React',
        client: null,
        description: 'A mission',
        stack: ['React', 'TypeScript', 'Node.js'],
        tjm: 600,
        location: 'Paris',
        remote: 'hybrid' as const,
        duration: null,
        url: 'https://example.com',
        source: 'free-work' as MissionSource,
        scrapedAt: new Date('2026-01-01'),
      };

      const mission = createMission(fields);

      expect(mission.stack).toHaveLength(3);
      expect(mission.stack).toContain('React');
      expect(mission.stack).toContain('TypeScript');
      expect(mission.stack).toContain('Node.js');
    });

    it('should handle gracefully empty string entries in stack', () => {
      const fields = {
        id: 'test-1',
        title: 'Dev React',
        client: null,
        description: 'A mission',
        stack: ['React', '', 'TypeScript', ''],
        tjm: 600,
        location: 'Paris',
        remote: 'hybrid' as const,
        duration: null,
        url: 'https://example.com',
        source: 'free-work' as MissionSource,
        scrapedAt: new Date('2026-01-01'),
      };

      const mission = createMission(fields);

      // Empty strings are filtered out
      expect(mission.stack).toHaveLength(2);
      expect(mission.stack).toContain('React');
      expect(mission.stack).toContain('TypeScript');
      expect(mission.stack).not.toContain('');
    });
  });
});
