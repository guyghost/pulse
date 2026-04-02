import { describe, it, expect } from 'vitest';
import { filterNotifiableMissions } from '$lib/core/scoring/notification-filter';
import type { Mission } from '$lib/core/types/mission';

const makeMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'test-1',
  title: 'Test Mission',
  client: null,
  description: 'A test mission',
  stack: [],
  tjm: null,
  location: null,
  remote: null,
  duration: null,
  url: 'https://example.com',
  source: 'free-work',
  scrapedAt: new Date('2024-01-01'),
  score: null,
  semanticScore: null,
  semanticReason: null,
  ...overrides,
});

describe('filterNotifiableMissions', () => {
  it('returns empty array when missions is empty', () => {
    const result = filterNotifiableMissions([], [], 50);
    expect(result).toEqual([]);
  });

  it('returns empty array when all missions are seen', () => {
    const missions = [
      makeMission({ id: '1', score: 75 }),
      makeMission({ id: '2', score: 80 }),
      makeMission({ id: '3', score: 90 }),
    ];

    const result = filterNotifiableMissions(missions, ['1', '2', '3'], 50);
    expect(result).toEqual([]);
  });

  it('returns empty array when all missions are below threshold', () => {
    const missions = [
      makeMission({ id: '1', score: 30 }),
      makeMission({ id: '2', score: 40 }),
      makeMission({ id: '3', score: 49 }),
    ];

    const result = filterNotifiableMissions(missions, [], 50);
    expect(result).toEqual([]);
  });

  it('returns empty array when all missions have null score', () => {
    const missions = [
      makeMission({ id: '1', score: null }),
      makeMission({ id: '2', score: null }),
      makeMission({ id: '3', score: null }),
    ];

    const result = filterNotifiableMissions(missions, [], 50);
    expect(result).toEqual([]);
  });

  it('returns single mission above threshold and not seen', () => {
    const missions = [
      makeMission({ id: '1', score: 75 }),
    ];

    const result = filterNotifiableMissions(missions, [], 50);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
    expect(result[0].score).toBe(75);
  });

  it('filters to return only unseen missions above threshold', () => {
    const missions = [
      makeMission({ id: '1', score: 30 }),   // below threshold
      makeMission({ id: '2', score: 60 }),   // above, unseen
      makeMission({ id: '3', score: 80 }),   // above, but seen
      makeMission({ id: '4', score: 70 }),   // above, unseen
      makeMission({ id: '5', score: null }), // null score
    ];

    const result = filterNotifiableMissions(missions, ['3'], 50);
    expect(result).toHaveLength(2);
    expect(result.map(m => m.id)).toEqual(['4', '2']); // sorted by score desc
  });

  it('returns missions sorted by score descending', () => {
    const missions = [
      makeMission({ id: '1', score: 70 }),
      makeMission({ id: '2', score: 90 }),
      makeMission({ id: '3', score: 60 }),
      makeMission({ id: '4', score: 80 }),
    ];

    const result = filterNotifiableMissions(missions, [], 50);
    expect(result.map(m => m.score)).toEqual([90, 80, 70, 60]);
  });

  it('includes missions with score exactly equal to threshold when threshold is 0', () => {
    const missions = [
      makeMission({ id: '1', score: 0 }),
      makeMission({ id: '2', score: 25 }),
      makeMission({ id: '3', score: 50 }),
    ];

    const result = filterNotifiableMissions(missions, [], 0);
    expect(result).toHaveLength(3);
    expect(result.map(m => m.score)).toEqual([50, 25, 0]);
  });

  it('excludes missions with score just below threshold when threshold is 100', () => {
    const missions = [
      makeMission({ id: '1', score: 95 }),
      makeMission({ id: '2', score: 99 }),
      makeMission({ id: '3', score: 100 }),
      makeMission({ id: '4', score: 100 }),
    ];

    const result = filterNotifiableMissions(missions, [], 100);
    expect(result).toHaveLength(2);
    expect(result.every(m => m.score === 100)).toBe(true);
  });

  it('handles duplicate seen IDs correctly', () => {
    const missions = [
      makeMission({ id: '1', score: 60 }),
      makeMission({ id: '2', score: 70 }),
    ];

    const result = filterNotifiableMissions(missions, ['1', '1', '1', '2'], 50);
    expect(result).toHaveLength(0);
  });

  it('handles empty seenIds array', () => {
    const missions = [
      makeMission({ id: '1', score: 60 }),
      makeMission({ id: '2', score: 70 }),
    ];

    const result = filterNotifiableMissions(missions, [], 50);
    expect(result).toHaveLength(2);
  });

  it('handles mix of null scores and valid scores', () => {
    const missions = [
      makeMission({ id: '1', score: null }),
      makeMission({ id: '2', score: 60 }),
      makeMission({ id: '3', score: null }),
      makeMission({ id: '4', score: 70 }),
    ];

    const result = filterNotifiableMissions(missions, [], 50);
    expect(result).toHaveLength(2);
    expect(result.every(m => m.score !== null)).toBe(true);
  });

  it('prefers semantic score over basic score for filtering and sorting', () => {
    const missions = [
      makeMission({ id: '1', title: 'Basic only', score: 80, semanticScore: null }),
      makeMission({ id: '2', title: 'Semantic winner', score: 40, semanticScore: 95 }),
      makeMission({ id: '3', title: 'Filtered out', score: 49, semanticScore: null }),
    ];

    const result = filterNotifiableMissions(missions, [], 50);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.title)).toEqual(['Semantic winner', 'Basic only']);
  });

  it('maintains order when scores are equal', () => {
    const missions = [
      makeMission({ id: '1', score: 75, title: 'First' }),
      makeMission({ id: '2', score: 75, title: 'Second' }),
      makeMission({ id: '3', score: 75, title: 'Third' }),
    ];

    const result = filterNotifiableMissions(missions, [], 50);
    expect(result).toHaveLength(3);
    expect(result.map(m => m.title)).toEqual(['First', 'Second', 'Third']);
  });
});
