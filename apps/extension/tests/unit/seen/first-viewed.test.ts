import { describe, it, expect } from 'vitest';
import {
  mergeFirstViewed,
  capReviewJournal,
  coerceIso,
  MAX_REVIEW_JOURNAL,
  type ReviewJournal,
} from '../../../src/lib/core/seen/first-viewed';

describe('coerceIso', () => {
  it('accepts Date instances', () => {
    expect(coerceIso(new Date('2026-01-15T10:00:00Z'))).toBe('2026-01-15T10:00:00.000Z');
  });

  it('accepts ISO strings', () => {
    expect(coerceIso('2026-01-15T10:00:00Z')).toBe('2026-01-15T10:00:00.000Z');
  });

  it('returns null for invalid values', () => {
    expect(coerceIso('not-a-date')).toBeNull();
    expect(coerceIso(new Date('not-a-date'))).toBeNull();
    expect(coerceIso(42)).toBeNull();
    expect(coerceIso(null)).toBeNull();
    expect(coerceIso(undefined)).toBeNull();
  });
});

describe('mergeFirstViewed', () => {
  it('adds new entries with first-write-wins semantics', () => {
    const current: ReviewJournal = {
      'm-1': { firstViewedAt: '2026-01-10T09:00:00Z', capturedAt: '2026-01-09T09:00:00Z' },
    };
    const result = mergeFirstViewed(current, [
      {
        missionId: 'm-1',
        viewedAt: '2026-01-11T09:00:00Z',
        capturedAt: '2026-01-09T09:00:00Z',
      },
      {
        missionId: 'm-2',
        viewedAt: '2026-01-11T10:00:00Z',
        capturedAt: null,
      },
    ]);

    expect(result['m-1'].firstViewedAt).toBe('2026-01-10T09:00:00Z');
    expect(result['m-2'].firstViewedAt).toBe('2026-01-11T10:00:00Z');
    expect(result['m-2'].capturedAt).toBeNull();
  });

  it('does not mutate the input journal', () => {
    const current: ReviewJournal = {};
    mergeFirstViewed(current, [
      { missionId: 'm-1', viewedAt: '2026-01-10T09:00:00Z', capturedAt: null },
    ]);
    expect(current['m-1']).toBeUndefined();
  });

  it('caps at MAX_REVIEW_JOURNAL, evicting oldest first views', () => {
    const current: ReviewJournal = {};
    const entries = Array.from({ length: MAX_REVIEW_JOURNAL + 5 }, (_, i) => ({
      missionId: `m-${i}`,
      viewedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
      capturedAt: null,
    }));
    const result = mergeFirstViewed(current, entries);

    expect(Object.keys(result).length).toBe(MAX_REVIEW_JOURNAL);
    expect(result['m-0']).toBeUndefined();
    expect(result['m-4']).toBeUndefined();
    expect(result[`m-${MAX_REVIEW_JOURNAL + 4}`]).toBeDefined();
  });

  it('returns the same reference when nothing changes', () => {
    const current: ReviewJournal = {
      'm-1': { firstViewedAt: '2026-01-10T09:00:00Z', capturedAt: null },
    };
    expect(mergeFirstViewed(current, [])).toBe(current);
  });
});

describe('capReviewJournal', () => {
  it('keeps journals under the limit untouched', () => {
    const journal: ReviewJournal = {
      'm-1': { firstViewedAt: '2026-01-10T09:00:00Z', capturedAt: null },
    };
    expect(capReviewJournal(journal)).toBe(journal);
  });

  it('evicts by oldest firstViewedAt when over the limit', () => {
    const journal: ReviewJournal = {
      a: { firstViewedAt: '2026-01-03T00:00:00Z', capturedAt: null },
      b: { firstViewedAt: '2026-01-01T00:00:00Z', capturedAt: null },
      c: { firstViewedAt: '2026-01-02T00:00:00Z', capturedAt: null },
    };
    const capped = capReviewJournal(journal, 2);
    expect(Object.keys(capped).sort()).toEqual(['a', 'c']);
  });
});
