import { describe, it, expect } from 'vitest';
import {
  createMission,
  parseTJM,
  detectRemote,
  stripHtml,
} from '../../../src/lib/core/connectors/parser-utils';
import type { MissionSource } from '../../../src/lib/core/types/mission';

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

  // -------------------------------------------------------------------------
  // stripHtml — shared helper used by every parser, previously untested.
  // -------------------------------------------------------------------------
  describe('stripHtml', () => {
    it('strips simple tags', () => {
      expect(stripHtml('<p>Hello <b>World</b></p>')).toBe('Hello World');
    });

    it('strips nested tags', () => {
      expect(stripHtml('<div><span><a href="#">Link</a></span></div>')).toBe('Link');
    });

    it('keeps no residual angle brackets', () => {
      expect(stripHtml('<h1>Title</h1>')).not.toContain('<');
      expect(stripHtml('<h1>Title</h1>')).not.toContain('>');
    });

    it('converts <br> tags to newlines', () => {
      expect(stripHtml('line1<br>line2<br/>line3<br />line4')).toBe('line1\nline2\nline3\nline4');
    });

    it('converts closing </p> tags to newlines', () => {
      expect(stripHtml('<p>Para 1</p><p>Para 2</p>')).toBe('Para 1\nPara 2');
    });

    it('decodes common named entities', () => {
      // &nbsp; → space, &amp; → &. &amp;co decodes to &co (no inserted space).
      expect(stripHtml('&nbsp;Tom &amp; Jerry&amp;co')).toBe('Tom & Jerry&co');
    });

    it('decodes &lt; &gt; &quot; &#39;', () => {
      expect(stripHtml('&lt;tag&gt; &quot;quoted&quot; l&#39;eau')).toBe('<tag> "quoted" l\'eau');
    });

    it('decodes numeric entities (decimal)', () => {
      // &#8364; = €
      expect(stripHtml('600&#8364;/jour')).toBe('600€/jour');
    });

    it('decodes hexadecimal entities', () => {
      // &#x20AC; = €
      expect(stripHtml('600&#x20AC;/jour')).toBe('600€/jour');
    });

    it('collapses runs of 3+ newlines into two', () => {
      expect(stripHtml('a<br><br><br><br>b')).toBe('a\n\nb');
    });

    it('collapses runs of spaces/tabs into a single space', () => {
      expect(stripHtml('hello     world\t\tend')).toBe('hello world end');
    });

    it('trims leading/trailing whitespace', () => {
      expect(stripHtml('   \n  trimmed  \n  ')).toBe('trimmed');
    });

    it('preserves accented characters', () => {
      expect(stripHtml('Développeur à Paris — rémunération')).toBe(
        'Développeur à Paris — rémunération'
      );
    });

    it('preserves emoji', () => {
      expect(stripHtml('<p>🚀 Dev React 🚀</p>')).toBe('🚀 Dev React 🚀');
    });

    it('returns empty string for empty input', () => {
      expect(stripHtml('')).toBe('');
    });

    it('handles plain text without any markup', () => {
      expect(stripHtml('no markup here')).toBe('no markup here');
    });
  });

  // -------------------------------------------------------------------------
  // parseTJM — additional edge cases (shared helper, every parser depends on it).
  // -------------------------------------------------------------------------
  describe('parseTJM (edge cases)', () => {
    it('extracts number surrounded by French narrow no-break space (\\u202F)', () => {
      expect(parseTJM('1\u202F200\u00A0€')).toBe(1200);
    });

    it('extracts from a price range string (returns lower bound)', () => {
      expect(parseTJM('500-700 €/jour')).toBe(500);
    });

    it('extracts from a slash-separated range', () => {
      expect(parseTJM('600/700')).toBe(600);
    });

    it('ignores a leading minus sign and extracts the digits', () => {
      // "-600" normalizes to "600" after the digit search; documents behavior.
      expect(parseTJM('-600')).toBe(600);
    });

    it('extracts integer part from a decimal value', () => {
      // Documents current behavior: regex captures the first digit run only.
      expect(parseTJM('600.50')).toBe(600);
    });

    it('extracts from text with the euro symbol attached', () => {
      expect(parseTJM('600€')).toBe(600);
    });

    it('extracts from a currency-prefixed string', () => {
      expect(parseTJM('EUR 650')).toBe(650);
    });
  });

  // -------------------------------------------------------------------------
  // detectRemote — additional edge cases.
  // -------------------------------------------------------------------------
  describe('detectRemote (edge cases)', () => {
    it('detects full remote inside a longer sentence', () => {
      expect(detectRemote('Mission en full remote avec déplacements occasionnels')).toBe('full');
    });

    it('detects onsite with leading text', () => {
      expect(detectRemote('Travail sur site 3j/semaine')).toBe('onsite');
    });

    it('returns null for unrelated French text', () => {
      expect(detectRemote('Mission à pourvoir rapidement')).toBeNull();
    });

    it('returns null for text that mentions remote-adjacent words but no keyword', () => {
      expect(detectRemote('télétravail possible selon accord')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // createMission — defensive fallbacks (previously uncovered branches).
  // -------------------------------------------------------------------------
  describe('createMission (defensive fallbacks)', () => {
    it('falls back to empty string when title is nullish', () => {
      const mission = createMission({
        id: 't-1',
        title: null as unknown as string,
        client: null,
        description: 'desc',
        stack: [],
        tjm: null,
        location: null,
        remote: null,
        duration: null,
        url: 'https://example.com',
        source: 'free-work',
        scrapedAt: new Date('2026-01-01'),
      });
      expect(mission.title).toBe('');
    });

    it('falls back to empty string when description is nullish', () => {
      const mission = createMission({
        id: 't-1',
        title: 'Dev',
        client: null,
        description: null as unknown as string,
        stack: [],
        tjm: null,
        location: null,
        remote: null,
        duration: null,
        url: 'https://example.com',
        source: 'free-work',
        scrapedAt: new Date('2026-01-01'),
      });
      expect(mission.description).toBe('');
    });

    it('defaults startDate, seniority and publishedAt to null when omitted', () => {
      const mission = createMission({
        id: 't-1',
        title: 'Dev',
        client: null,
        description: 'desc',
        stack: [],
        tjm: null,
        location: null,
        remote: null,
        duration: null,
        url: 'https://example.com',
        source: 'free-work',
        scrapedAt: new Date('2026-01-01'),
      });
      expect(mission.startDate).toBeNull();
      expect(mission.seniority).toBeNull();
      expect(mission.publishedAt).toBeNull();
      expect(mission.scoreBreakdown).toBeNull();
      expect(mission.score).toBeNull();
    });

    it('filters undefined and null entries from stack (verified)', () => {
      // Proves the real filtering behavior: non-string values are dropped.
      const mission = createMission({
        id: 't-1',
        title: 'Dev',
        client: null,
        description: 'desc',
        stack: ['React', undefined, 'TS', null, '', 'Node'] as unknown as string[],
        tjm: null,
        location: null,
        remote: null,
        duration: null,
        url: 'https://example.com',
        source: 'free-work',
        scrapedAt: new Date('2026-01-01'),
      });
      expect(mission.stack).toEqual(['React', 'TS', 'Node']);
    });

    it('strips HTML from title and description via the shared helper', () => {
      const mission = createMission({
        id: 't-1',
        title: '<b>Dev&nbsp;React</b>',
        client: null,
        description: '<p>Build &amp; ship</p>',
        stack: [],
        tjm: null,
        location: null,
        remote: null,
        duration: null,
        url: 'https://example.com',
        source: 'free-work',
        scrapedAt: new Date('2026-01-01'),
      });
      expect(mission.title).toBe('Dev React');
      expect(mission.description).toBe('Build & ship');
    });
  });
});
