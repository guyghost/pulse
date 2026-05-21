import { describe, expect, it } from 'vitest';
import { buildFavoriteMissionSnapshot } from '../../../src/lib/core/sync/favorite-mission';
import type { Mission } from '../../../src/lib/core/types/mission';

const mission: Mission = {
  id: 'free-work-123',
  title: 'Lead Svelte',
  client: 'ScaleOps',
  description: 'Mission Svelte 5 et TypeScript',
  stack: ['Svelte', 'TypeScript'],
  tjm: 720,
  location: 'Remote France',
  remote: 'full',
  duration: '6 mois',
  startDate: '2026-06-01',
  publishedAt: '2026-05-20T08:00:00.000Z',
  url: 'https://example.com/mission',
  source: 'free-work',
  scrapedAt: new Date('2026-05-21T08:00:00.000Z'),
  seniority: 'senior',
  scoreBreakdown: null,
  score: 90,
  semanticScore: 92,
  semanticReason: 'Très bon match',
};

describe('buildFavoriteMissionSnapshot', () => {
  it('serializes the mission data needed by the dashboard', () => {
    const snapshot = buildFavoriteMissionSnapshot(mission, new Date('2026-05-21T09:00:00.000Z'));

    expect(snapshot).toEqual({
      missionId: 'free-work-123',
      title: 'Lead Svelte',
      client: 'ScaleOps',
      description: 'Mission Svelte 5 et TypeScript',
      stack: ['Svelte', 'TypeScript'],
      tjm: 720,
      location: 'Remote France',
      remote: 'full',
      duration: '6 mois',
      startDate: '2026-06-01',
      publishedAt: '2026-05-20T08:00:00.000Z',
      url: 'https://example.com/mission',
      source: 'free-work',
      scrapedAt: '2026-05-21T08:00:00.000Z',
      score: 90,
      semanticScore: 92,
      semanticReason: 'Très bon match',
      favoritedAt: '2026-05-21T09:00:00.000Z',
    });
  });
});
