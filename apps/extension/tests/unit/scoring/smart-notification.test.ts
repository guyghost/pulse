import { describe, it, expect } from 'vitest';
import {
  filterSmartNotifications,
  DEFAULT_SMART_CRITERIA,
  type SmartNotificationCriteria,
} from '../../../src/lib/core/scoring/smart-notification';
import type { Mission } from '../../../src/lib/core/types/mission';

const makeMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'test-1',
  title: 'Dev Mission',
  client: null,
  description: '',
  stack: ['React', 'TypeScript'],
  tjm: 600,
  location: 'Paris',
  remote: 'hybrid',
  duration: null,
  startDate: null,
  url: 'https://example.com',
  source: 'free-work',
  scrapedAt: new Date(),
  seniority: null,
  score: 80,
  semanticScore: null,
  semanticReason: null,
  ...overrides,
});

describe('filterSmartNotifications', () => {
  const missions = [
    makeMission({ id: 'a', score: 90, stack: ['React', 'TypeScript'], tjm: 700 }),
    makeMission({ id: 'b', score: 85, stack: ['Vue', 'Node.js'], tjm: 500 }),
    makeMission({ id: 'c', score: 60, stack: ['React'], tjm: 800 }),
    makeMission({ id: 'd', score: 75, stack: ['Java', 'Spring'], tjm: 650 }),
  ];

  it('filters by score threshold', () => {
    const result = filterSmartNotifications(missions, [], {
      ...DEFAULT_SMART_CRITERIA,
      scoreThreshold: 80,
    });
    expect(result.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('filters by required stacks', () => {
    const result = filterSmartNotifications(missions, [], {
      ...DEFAULT_SMART_CRITERIA,
      scoreThreshold: 0,
      requiredStacks: ['React'],
    });
    expect(result.map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('filters by minimum TJM', () => {
    const result = filterSmartNotifications(missions, [], {
      ...DEFAULT_SMART_CRITERIA,
      scoreThreshold: 0,
      minTJM: 650,
    });
    expect(result.map((m) => m.id)).toEqual(['a', 'd', 'c']);
  });

  it('combines all criteria', () => {
    const criteria: SmartNotificationCriteria = {
      scoreThreshold: 70,
      requiredStacks: ['React', 'TypeScript'],
      minTJM: 600,
      maxResults: 10,
    };
    const result = filterSmartNotifications(missions, [], criteria);
    expect(result.map((m) => m.id)).toEqual(['a']);
  });

  it('excludes seen missions', () => {
    const result = filterSmartNotifications(missions, ['a'], {
      ...DEFAULT_SMART_CRITERIA,
      scoreThreshold: 80,
    });
    expect(result.map((m) => m.id)).toEqual(['b']);
  });

  it('respects maxResults', () => {
    const result = filterSmartNotifications(missions, [], {
      ...DEFAULT_SMART_CRITERIA,
      scoreThreshold: 0,
      maxResults: 2,
    });
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a'); // highest score
  });

  it('is case-insensitive for stack matching', () => {
    const result = filterSmartNotifications(missions, [], {
      ...DEFAULT_SMART_CRITERIA,
      scoreThreshold: 0,
      requiredStacks: ['react'],
    });
    expect(result.map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('returns empty for no matches', () => {
    const result = filterSmartNotifications(missions, [], {
      ...DEFAULT_SMART_CRITERIA,
      scoreThreshold: 95,
    });
    expect(result).toEqual([]);
  });
});
