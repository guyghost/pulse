import { describe, it, expect } from 'vitest';
import {
  validateMission,
  validateParserOutput,
  validateNextData,
} from '../../../src/lib/core/connectors/validate-parser-output';
import type { Mission } from '../../../src/lib/core/types/mission';

/**
 * Builds a fully-valid Mission object used as the baseline for validation tests.
 * Each rejection-path test mutates exactly one field to trigger that path.
 */
function makeValidMission(): Mission {
  return {
    id: 'fw-12345',
    title: 'Développeur React Senior',
    client: 'Acme Corp',
    description: 'Mission React pour un grand compte.',
    stack: ['React', 'TypeScript'],
    tjm: 600,
    location: 'Paris',
    remote: 'hybrid',
    duration: '6 mois',
    startDate: null,
    publishedAt: '2026-03-11T10:00:00+01:00',
    url: 'https://www.free-work.com/fr/tech-it/developpeur/job-mission/dev-react',
    source: 'free-work',
    scrapedAt: new Date('2026-03-11T12:00:00Z'),
    seniority: 'senior',
    scoreBreakdown: null,
    score: null,
    semanticScore: null,
    semanticReason: null,
  };
}

describe('validateMission', () => {
  it('accepts a fully valid mission', () => {
    const result = validateMission(makeValidMission());
    expect(result.valid).toBe(true);
    expect(result.mission).toBeDefined();
    expect(result.reason).toBeUndefined();
  });

  // --- Type-level rejections ---
  it('rejects null', () => {
    const result = validateMission(null);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Mission is not an object');
  });

  it('rejects a primitive (string)', () => {
    const result = validateMission('not-an-object');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Mission is not an object');
  });

  it('rejects an array (arrays are objects but not mission-shaped)', () => {
    const result = validateMission(['id']);
    expect(result.valid).toBe(false);
  });

  // --- id ---
  it('rejects missing id', () => {
    const result = validateMission({ ...makeValidMission(), id: undefined });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Missing or invalid id');
  });

  it('rejects empty id', () => {
    const result = validateMission({ ...makeValidMission(), id: '' });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Missing or invalid id');
  });

  it('rejects non-string id', () => {
    const result = validateMission({ ...makeValidMission(), id: 123 });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Missing or invalid id');
  });

  // --- title ---
  it('rejects missing title', () => {
    const result = validateMission({ ...makeValidMission(), title: undefined });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Missing or invalid title');
  });

  it('rejects non-string title', () => {
    const result = validateMission({ ...makeValidMission(), title: 42 });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Missing or invalid title');
  });

  // --- source ---
  it('rejects unknown source', () => {
    const result = validateMission({ ...makeValidMission(), source: 'linkedin' });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid source: linkedin');
  });

  it('rejects non-string source', () => {
    const result = validateMission({ ...makeValidMission(), source: 1 });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Invalid source');
  });

  it('accepts every valid source', () => {
    const sources = ['free-work', 'lehibou', 'hiway', 'collective', 'cherry-pick', 'malt'];
    for (const source of sources) {
      const result = validateMission({ ...makeValidMission(), source });
      expect(result.valid).toBe(true);
    }
  });

  // --- scrapedAt ---
  it('rejects non-Date scrapedAt', () => {
    const result = validateMission({
      ...makeValidMission(),
      scrapedAt: '2026-03-11' as unknown as Date,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Missing or invalid scrapedAt (must be Date)');
  });

  it('rejects Invalid Date (NaN time)', () => {
    const result = validateMission({ ...makeValidMission(), scrapedAt: new Date('not-a-date') });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Missing or invalid scrapedAt (must be Date)');
  });

  // --- url ---
  it('rejects missing url', () => {
    const result = validateMission({ ...makeValidMission(), url: undefined });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Missing or invalid url');
  });

  it('rejects non-http url', () => {
    const result = validateMission({ ...makeValidMission(), url: 'ftp://example.com/x' });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Missing or invalid url');
  });

  it('rejects relative url', () => {
    const result = validateMission({ ...makeValidMission(), url: '/missions/123' });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Missing or invalid url');
  });

  // --- description ---
  it('rejects non-string description', () => {
    const result = validateMission({
      ...makeValidMission(),
      description: null as unknown as string,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Missing or invalid description (must be string)');
  });

  // --- Optional field type guards ---
  it('rejects non-string, non-null client', () => {
    const result = validateMission({ ...makeValidMission(), client: 123 });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid client type');
  });

  it('accepts null client', () => {
    const result = validateMission({ ...makeValidMission(), client: null });
    expect(result.valid).toBe(true);
  });

  it('rejects non-array stack', () => {
    const result = validateMission({
      ...makeValidMission(),
      stack: 'React' as unknown as string[],
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid stack type (must be array)');
  });

  it('rejects non-number, non-null tjm', () => {
    const result = validateMission({ ...makeValidMission(), tjm: '600' as unknown as number });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid tjm type');
  });

  it('accepts null tjm', () => {
    const result = validateMission({ ...makeValidMission(), tjm: null });
    expect(result.valid).toBe(true);
  });

  it('rejects non-string, non-null location', () => {
    const result = validateMission({ ...makeValidMission(), location: 42 });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid location type');
  });

  it('rejects invalid remote value', () => {
    const result = validateMission({
      ...makeValidMission(),
      remote: 'telework' as unknown as Mission['remote'],
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid remote value: telework');
  });

  it('accepts every valid remote value including null', () => {
    const remotes = [null, 'full', 'hybrid', 'onsite'] as const;
    for (const remote of remotes) {
      const result = validateMission({ ...makeValidMission(), remote });
      expect(result.valid).toBe(true);
    }
  });

  it('rejects non-string, non-null duration', () => {
    const result = validateMission({ ...makeValidMission(), duration: 6 as unknown as string });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid duration type');
  });
});

describe('validateParserOutput', () => {
  it('returns all missions valid and empty rejected when every mission is valid', () => {
    const result = validateParserOutput([makeValidMission(), makeValidMission()]);
    expect(result.valid).toBe(true);
    expect(result.missions).toHaveLength(2);
    expect(result.rejected).toEqual([]);
  });

  it('rejects invalid missions while keeping valid ones', () => {
    const bad = { ...makeValidMission(), id: '' };
    const result = validateParserOutput([makeValidMission(), bad, null]);
    expect(result.valid).toBe(false);
    expect(result.missions).toHaveLength(1);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0].reason).toBe('Missing or invalid id');
    expect(result.rejected[1].reason).toBe('Mission is not an object');
  });

  it('reports unknown reason fallback is never empty (reason always provided)', () => {
    // Every rejection path sets a reason; verify the rejected entry always carries one.
    const result = validateParserOutput([undefined]);
    expect(result.rejected[0].reason).toBeTruthy();
  });

  it('handles empty input array', () => {
    const result = validateParserOutput([]);
    expect(result.valid).toBe(true);
    expect(result.missions).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  // NOTE: the `result.reason ?? 'Unknown validation error'` fallback at line 107
  // is structurally unreachable — `validateMission` always returns a non-empty
  // string `reason` whenever `valid === false`, so `reason` is never
  // null/undefined when an entry is pushed to `rejected`. It is intentionally
  // left as a defensive branch (no test can hit it without monkey-patching).
});

describe('validateNextData', () => {
  it('extracts a valid __NEXT_DATA__ JSON object', () => {
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json">{"props":{"x":1}}</script></body></html>`;
    const result = validateNextData(html);
    expect(result).not.toBeNull();
    expect(result?.props).toMatchObject({ x: 1 });
  });

  it('returns null when __NEXT_DATA__ script is absent', () => {
    expect(validateNextData('<html><body></body></html>')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const html = `<html><body><script id="__NEXT_DATA__">{broken</script></body></html>`;
    expect(validateNextData(html)).toBeNull();
  });

  it('returns null when parsed JSON is not an object (string payload)', () => {
    const html = `<html><body><script id="__NEXT_DATA__">"just-a-string"</script></body></html>`;
    expect(validateNextData(html)).toBeNull();
  });

  it('returns null when parsed JSON is not an object (number payload)', () => {
    const html = `<html><body><script id="__NEXT_DATA__">42</script></body></html>`;
    expect(validateNextData(html)).toBeNull();
  });

  it('returns null when parsed JSON is null literal', () => {
    const html = `<html><body><script id="__NEXT_DATA__">null</script></body></html>`;
    expect(validateNextData(html)).toBeNull();
  });

  it('accepts a JSON array (typeof [] === "object"): arrays pass the object guard', () => {
    // Documents current behavior: the guard only rejects non-object primitives and null.
    // A JSON array satisfies typeof === 'object' && !== null, so it is returned as-is.
    // Downstream code relies on Array.isArray() checks before treating it as a record.
    const html = `<html><body><script id="__NEXT_DATA__">[1,2,3]</script></body></html>`;
    const result = validateNextData(html);
    expect(Array.isArray(result)).toBe(true);
  });

  it('matches script tag with extra attributes (type, crossorigin)', () => {
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json" crossorigin="anonymous">{"a":"b"}</script></body></html>`;
    const result = validateNextData(html);
    expect(result).toMatchObject({ a: 'b' });
  });
});
