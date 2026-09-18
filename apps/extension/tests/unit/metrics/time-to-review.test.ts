import { describe, it, expect } from 'vitest';
import {
  buildReviewEvents,
  computeTimeToReview,
  percentile,
  REVIEW_WINDOW_DAYS,
  type ReviewEventInput,
} from '../../../src/lib/core/metrics/time-to-review';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { ReviewJournal } from '../../../src/lib/core/seen/first-viewed';

const HOUR_MS = 3_600_000;
void HOUR_MS;

function makeMission(id: string, scrapedAtIso: string): Mission {
  return {
    id,
    title: `Mission ${id}`,
    client: null,
    description: '',
    stack: [],
    tjm: null,
    location: null,
    remote: null,
    duration: null,
    startDate: null,
    publishedAt: null,
    url: `https://example.com/${id}`,
    source: 'free-work',
    scrapedAt: new Date(scrapedAtIso),
    seniority: null,
    scoreBreakdown: null,
    score: null,
    semanticScore: null,
    semanticReason: null,
  };
}

function event(
  missionId: string,
  capturedAtIso: string | null,
  firstViewedAtIso: string | null
): ReviewEventInput {
  return { missionId, capturedAt: capturedAtIso, firstViewedAt: firstViewedAtIso };
}

describe('percentile', () => {
  it('returns null on empty input', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([], 95)).toBeNull();
  });

  it('returns the single value', () => {
    expect(percentile([7], 50)).toBe(7);
    expect(percentile([7], 95)).toBe(7);
  });

  it('interpolates on even-sized input (p50 between the two middles)', () => {
    expect(percentile([1, 3], 50)).toBe(2);
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
  });

  it('picks the middle on odd-sized input', () => {
    expect(percentile([10, 20, 30], 50)).toBe(20);
  });

  it('interpolates p95 near the top of the distribution', () => {
    // idx = 0.95 * 19 = 18.05 → 18th + 0.05 of the gap towards the 19th
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(values, 95)).toBeCloseTo(19.05, 10);
  });

  it('sorts unsorted input', () => {
    expect(percentile([30, 10, 20], 50)).toBe(20);
  });
});

describe('buildReviewEvents', () => {
  it('unions missions (unviewed) with journal entries', () => {
    const missions = [makeMission('m-1', '2026-08-10T08:00:00Z')];
    const journal: ReviewJournal = {
      'm-1': { firstViewedAt: '2026-08-10T12:00:00Z', capturedAt: '2026-08-10T08:00:00Z' },
      orphan: { firstViewedAt: '2026-08-11T12:00:00Z', capturedAt: null },
    };

    const events = buildReviewEvents(missions, journal);

    expect(events).toHaveLength(2);
    const m1 = events.find((e) => e.missionId === 'm-1');
    expect(m1).toEqual({
      missionId: 'm-1',
      capturedAt: '2026-08-10T08:00:00.000Z',
      firstViewedAt: '2026-08-10T12:00:00Z',
    });
    const orphan = events.find((e) => e.missionId === 'orphan');
    expect(orphan).toEqual({
      missionId: 'orphan',
      capturedAt: null,
      firstViewedAt: '2026-08-11T12:00:00Z',
    });
  });

  it('falls back to journal snapshot when mission capturedAt is unreadable', () => {
    const broken = { ...makeMission('m-1', '2026-08-10T08:00:00Z'), scrapedAt: new Date('x') };
    const journal: ReviewJournal = {
      'm-1': { firstViewedAt: '2026-08-10T12:00:00Z', capturedAt: '2026-08-09T08:00:00Z' },
    };

    const events = buildReviewEvents([broken], journal);
    expect(events[0].capturedAt).toBe('2026-08-09T08:00:00Z');
  });
});

describe('computeTimeToReview', () => {
  const NOW = new Date('2026-09-11T12:00:00Z');

  it('returns hasData=false and null values on empty input (never a misleading zero)', () => {
    const result = computeTimeToReview([], NOW);

    expect(result.hasData).toBe(false);
    expect(result.p50.value).toBeNull();
    expect(result.p95.value).toBeNull();
    expect(result.unviewed.value).toBeNull();
    expect(result.series).toHaveLength(REVIEW_WINDOW_DAYS);
    expect(result.series.every((point) => point.p50 === null && point.p95 === null)).toBe(true);
  });

  it('computes p50/p95 in hours and unviewed share', () => {
    const day = '2026-09-10T08:00:00Z';
    const events = [
      event('a', day, '2026-09-10T10:00:00Z'), // 2 h
      event('b', day, '2026-09-10T14:00:00Z'), // 6 h
      event('c', day, '2026-09-10T20:00:00Z'), // 12 h
      event('d', day, null), // non vue
    ];

    const result = computeTimeToReview(events, NOW);

    expect(result.hasData).toBe(true);
    expect(result.p50.value).toBe(6);
    expect(result.p95.value).toBeCloseTo(11.4, 10);
    expect(result.unviewed.value).toBeCloseTo(0.25, 10);
  });

  it('excludes invalid events: future capture, negative delay, orphan journal', () => {
    const events = [
      event('future', '2026-09-15T08:00:00Z', '2026-09-15T09:00:00Z'), // captured after now
      event('negative', '2026-09-10T12:00:00Z', '2026-09-10T08:00:00Z'), // vue < capture
      event('orphan', null, '2026-09-10T09:00:00Z'), // capture inconnue
      event('valid', '2026-09-10T08:00:00Z', '2026-09-10T09:00:00Z'), // 1 h
    ];

    const result = computeTimeToReview(events, NOW);

    // "negative" is counted as viewed (outside percentiles) → unviewed = 0/2 comparable.
    expect(result.p50.value).toBe(1);
    expect(result.unviewed.value).toBe(0);
  });

  it('bounds series to 30 ascending UTC days ending today', () => {
    const old = '2026-01-01T08:00:00Z';
    const result = computeTimeToReview([event('old', old, old)], NOW);

    expect(result.series).toHaveLength(30);
    const days = result.series.map((point) => point.day);
    expect([...days].sort()).toEqual(days);
    expect(new Set(days).size).toBe(30);
    expect(days[days.length - 1]).toBe('2026-09-11');
    expect(days[0]).toBe('2026-08-13');
    // The out-of-window mission injects no data.
    expect(result.series.every((point) => point.p50 === null)).toBe(true);
    expect(result.hasData).toBe(false);
  });

  it('aggregates daily p50 into the series by capture day', () => {
    const events = [
      event('a', '2026-09-10T08:00:00Z', '2026-09-10T10:00:00Z'), // 2 h le 10
      event('b', '2026-09-10T08:00:00Z', '2026-09-10T14:00:00Z'), // 6 h le 10
      event('c', '2026-09-09T08:00:00Z', '2026-09-09T11:00:00Z'), // 3 h le 09
    ];

    const result = computeTimeToReview(events, NOW);

    const day10 = result.series.find((point) => point.day === '2026-09-10');
    expect(day10?.p50).toBe(4);
    const day09 = result.series.find((point) => point.day === '2026-09-09');
    expect(day09?.p50).toBe(3);
  });

  it('computes deltas as current minus previous period, null when a period is empty', () => {
    const inCurrent = '2026-09-01T08:00:00Z';
    const inPrevious = '2026-07-25T08:00:00Z'; // [now-60j ; now-30j)
    const events = [
      event('cur', inCurrent, '2026-09-01T10:00:00Z'), // 2 h
      event('prev', inPrevious, '2026-07-25T12:00:00Z'), // 4 h
    ];

    const result = computeTimeToReview(events, NOW);

    expect(result.p50.value).toBe(2);
    expect(result.p50.delta).toBeCloseTo(-2, 10);

    const noPrevious = computeTimeToReview([event('cur', inCurrent, '2026-09-01T10:00:00Z')], NOW);
    expect(noPrevious.p50.delta).toBeNull();
    expect(noPrevious.unviewed.delta).toBeNull();
  });

  it('delta on unviewed share is expressed in share points', () => {
    const events = [
      event('a', '2026-09-01T08:00:00Z', '2026-09-01T10:00:00Z'), // vue
      event('b', '2026-09-02T08:00:00Z', null), // non vue → 50 %
      event('c', '2026-07-20T08:00:00Z', '2026-07-20T09:00:00Z'), // period N-1: 0% unviewed
    ];

    const result = computeTimeToReview(events, NOW);

    expect(result.unviewed.value).toBeCloseTo(0.5, 10);
    expect(result.unviewed.delta).toBeCloseTo(0.5, 10);
  });

  it('respects invariant p50 ≤ p95 on the same population', () => {
    const events: ReviewEventInput[] = Array.from({ length: 25 }, (_, i) => {
      const day = `2026-09-0${(i % 9) + 1}`;
      const hour = 8 + (i % 12);
      return event(`m-${i}`, `${day}T08:00:00Z`, `${day}T${String(hour).padStart(2, '0')}:00:00Z`);
    });

    const result = computeTimeToReview(events, NOW);

    if (result.p50.value !== null && result.p95.value !== null) {
      expect(result.p50.value).toBeLessThanOrEqual(result.p95.value);
    }
    for (const point of result.series) {
      if (point.p50 !== null && point.p95 !== null) {
        expect(point.p50).toBeLessThanOrEqual(point.p95);
      }
    }
  });

  it('keeps missions outside the window but inside comparable scope out of percentiles', () => {
    const beforeCurrent = '2026-08-01T08:00:00Z'; // < now-30j
    const result = computeTimeToReview([event('old', beforeCurrent, beforeCurrent)], NOW);
    expect(result.p50.value).toBeNull();
    expect(result.hasData).toBe(false);
  });
});
