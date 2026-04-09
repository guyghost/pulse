import { describe, it, expect } from 'vitest';
import {
  isMissionFresh,
  filterStaleMissions,
  DEFAULT_MAX_AGE_DAYS,
} from '../../../src/lib/core/scoring/mission-freshness';
import type { Mission } from '../../../src/lib/core/types/mission';

const makeMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'test-1',
  title: 'Test Mission',
  client: null,
  description: 'A test mission',
  stack: ['TypeScript'],
  tjm: 500,
  location: 'Paris',
  remote: null,
  duration: null,
  startDate: null,
  url: 'https://example.com/mission/1',
  source: 'free-work',
  scrapedAt: new Date(),
  seniority: null,
  scoreBreakdown: null,
  score: null,
  semanticScore: null,
  semanticReason: null,
  publishedAt: null,
  ...overrides,
});

describe('isMissionFresh', () => {
  it('returns true for a mission published today', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    const mission = makeMission({ publishedAt: '2026-04-09T08:00:00Z' });
    expect(isMissionFresh(mission, now)).toBe(true);
  });

  it('returns true for a mission published 29 days ago (default 30 days)', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    const mission = makeMission({ publishedAt: '2026-03-11T12:00:00Z' });
    expect(isMissionFresh(mission, now)).toBe(true);
  });

  it('returns false for a mission published 31 days ago (default 30 days)', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    const mission = makeMission({ publishedAt: '2026-03-09T12:00:00Z' });
    expect(isMissionFresh(mission, now)).toBe(false);
  });

  it('returns true for a mission without publishedAt', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    const mission = makeMission({ publishedAt: null });
    expect(isMissionFresh(mission, now)).toBe(true);
  });

  it('returns true for a mission with invalid publishedAt', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    const mission = makeMission({ publishedAt: 'not-a-date' });
    expect(isMissionFresh(mission, now)).toBe(true);
  });

  it('respects custom maxAgeDays', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    // 15 days old — stale for 7-day window, fresh for 30-day window
    const mission = makeMission({ publishedAt: '2026-03-25T12:00:00Z' });
    expect(isMissionFresh(mission, now, 7)).toBe(false);
    expect(isMissionFresh(mission, now, 30)).toBe(true);
  });

  it('default max age is 30 days', () => {
    expect(DEFAULT_MAX_AGE_DAYS).toBe(30);
  });
});

describe('filterStaleMissions', () => {
  it('filters out missions older than max age', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    const missions = [
      makeMission({ id: 'fresh', publishedAt: '2026-04-08T00:00:00Z' }),
      makeMission({ id: 'old', publishedAt: '2026-02-01T00:00:00Z' }),
      makeMission({ id: 'no-date', publishedAt: null }),
    ];

    const result = filterStaleMissions(missions, now, 30);
    expect(result.map((m) => m.id)).toEqual(['fresh', 'no-date']);
  });

  it('returns all missions when all are fresh', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    const missions = [
      makeMission({ id: 'a', publishedAt: '2026-04-09T00:00:00Z' }),
      makeMission({ id: 'b', publishedAt: '2026-04-08T00:00:00Z' }),
    ];

    const result = filterStaleMissions(missions, now);
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    const result = filterStaleMissions([], new Date());
    expect(result).toEqual([]);
  });
});
