import { describe, expect, it } from 'vitest';
import { computeSessionTriageProgress } from '../../../src/lib/core/feed/session-triage';
import type { Mission } from '../../../src/lib/core/types/mission';

function makeMission(id: string): Mission {
  return {
    id,
    title: `Mission ${id}`,
    client: 'Acme',
    description: 'Description',
    stack: ['TypeScript'],
    tjm: 600,
    location: 'Paris',
    remote: 'full',
    duration: '3 mois',
    startDate: null,
    publishedAt: null,
    url: `https://example.com/${id}`,
    source: 'free-work',
    scrapedAt: new Date(),
    seniority: 'senior',
    scoreBreakdown: null,
    score: null,
    semanticScore: null,
    semanticReason: null,
  };
}

describe('computeSessionTriageProgress', () => {
  it('returns empty stats when no missions exist', () => {
    const progress = computeSessionTriageProgress([], [], {}, {});
    expect(progress.totalCount).toBe(0);
    expect(progress.qualifiedCount).toBe(0);
    expect(progress.unseenCount).toBe(0);
    expect(progress.isInboxZero).toBe(false);
  });

  it('computes partial triage progress accurately', () => {
    const missions = [makeMission('m1'), makeMission('m2'), makeMission('m3'), makeMission('m4')];
    const seenIds = ['m1'];
    const favorites = { m2: 12345 };
    const hidden = {};

    const progress = computeSessionTriageProgress(missions, seenIds, favorites, hidden);
    expect(progress.totalCount).toBe(4);
    expect(progress.qualifiedCount).toBe(2);
    expect(progress.unseenCount).toBe(2);
    expect(progress.percent).toBe(50);
    expect(progress.isInboxZero).toBe(false);
    expect(progress.favoritesCount).toBe(1);
    expect(progress.label).toBe('2/4 qualifiées');
  });

  it('detects Inbox Zero when all missions are qualified', () => {
    const missions = [makeMission('m1'), makeMission('m2')];
    const seenIds = new Set(['m1', 'm2']);
    const favorites = {};
    const hidden = {};

    const progress = computeSessionTriageProgress(missions, seenIds, favorites, hidden);
    expect(progress.totalCount).toBe(2);
    expect(progress.qualifiedCount).toBe(2);
    expect(progress.unseenCount).toBe(0);
    expect(progress.percent).toBe(100);
    expect(progress.isInboxZero).toBe(true);
    expect(progress.label).toBe('2/2 qualifiées');
  });

  it('counts hidden missions as qualified', () => {
    const missions = [makeMission('m1'), makeMission('m2')];
    const seenIds = [];
    const favorites = {};
    const hidden = { m1: 100, m2: 200 };

    const progress = computeSessionTriageProgress(missions, seenIds, favorites, hidden);
    expect(progress.qualifiedCount).toBe(2);
    expect(progress.unseenCount).toBe(0);
    expect(progress.isInboxZero).toBe(true);
  });

  it('handles duplicate qualification (seen and favorited) without overcounting', () => {
    const missions = [makeMission('m1')];
    const seenIds = ['m1'];
    const favorites = { m1: 100 };
    const hidden = { m1: 100 };

    const progress = computeSessionTriageProgress(missions, seenIds, favorites, hidden);
    expect(progress.qualifiedCount).toBe(1);
    expect(progress.percent).toBe(100);
    expect(progress.isInboxZero).toBe(true);
  });
});
