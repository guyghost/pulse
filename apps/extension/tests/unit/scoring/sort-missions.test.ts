import { describe, it, expect } from 'vitest';
import { sortMissions } from '../../../src/lib/core/scoring/sort-missions';
import type { Mission } from '../../../src/lib/core/types/mission';

const makeMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'test-1',
  title: 'Test Mission',
  client: null,
  description: '',
  stack: [],
  tjm: null,
  location: null,
  remote: null,
  duration: null,
  startDate: null,
  url: 'https://example.com',
  source: 'free-work',
  scrapedAt: new Date('2025-01-15'),
  seniority: null,
  score: null,
  semanticScore: null,
  semanticReason: null,
  ...overrides,
});

describe('sortMissions', () => {
  const missions: Mission[] = [
    makeMission({ id: 'a', score: 50, tjm: 600, scrapedAt: new Date('2025-01-10') }),
    makeMission({ id: 'b', score: 90, tjm: 400, scrapedAt: new Date('2025-01-20') }),
    makeMission({ id: 'c', score: 70, tjm: 800, scrapedAt: new Date('2025-01-15') }),
  ];

  it('sorts by score descending', () => {
    const sorted = sortMissions(missions, 'score');
    expect(sorted.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by tjm descending', () => {
    const sorted = sortMissions(missions, 'tjm');
    expect(sorted.map((m) => m.id)).toEqual(['c', 'a', 'b']);
  });

  it('sorts by date descending (newest first)', () => {
    const sorted = sortMissions(missions, 'date');
    expect(sorted.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate original array', () => {
    const original = [...missions];
    sortMissions(missions, 'score');
    expect(missions.map((m) => m.id)).toEqual(original.map((m) => m.id));
  });

  it('handles null scores (treated as 0)', () => {
    const withNulls = [
      makeMission({ id: 'x', score: null }),
      makeMission({ id: 'y', score: 50 }),
    ];
    const sorted = sortMissions(withNulls, 'score');
    expect(sorted.map((m) => m.id)).toEqual(['y', 'x']);
  });

  it('handles null tjm (treated as 0)', () => {
    const withNulls = [
      makeMission({ id: 'x', tjm: null }),
      makeMission({ id: 'y', tjm: 600 }),
    ];
    const sorted = sortMissions(withNulls, 'tjm');
    expect(sorted.map((m) => m.id)).toEqual(['y', 'x']);
  });

  it('prefers semanticScore over score when available', () => {
    const withSemantic = [
      makeMission({ id: 'x', score: 90, semanticScore: 30 }),
      makeMission({ id: 'y', score: 20, semanticScore: 80 }),
    ];
    const sorted = sortMissions(withSemantic, 'score');
    expect(sorted.map((m) => m.id)).toEqual(['y', 'x']);
  });

  it('returns empty array for empty input', () => {
    expect(sortMissions([], 'score')).toEqual([]);
  });
});
