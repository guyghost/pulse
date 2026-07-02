import { describe, it, expect } from 'vitest';
import {
  rankMissions,
  missionRankScore,
  freshnessScore,
  DEFAULT_RANKING_WEIGHTS,
  DEFAULT_FRESHNESS_DECAY_DAYS,
} from '../../../src/lib/core/scoring/rank-missions';
import type { Mission } from '../../../src/lib/core/types/mission';

const NOW = new Date('2026-07-01T00:00:00Z');

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

// ---------------------------------------------------------------------------
// freshnessScore
// ---------------------------------------------------------------------------

describe('freshnessScore', () => {
  it('returns 100 for a mission published today', () => {
    expect(freshnessScore('2026-07-01', NOW)).toBe(100);
  });

  it('returns 100 for a future-dated mission', () => {
    expect(freshnessScore('2026-12-31', NOW)).toBe(100);
  });

  it('returns 50 (neutral) when publishedAt is null', () => {
    expect(freshnessScore(null, NOW)).toBe(50);
  });

  it('returns 50 (neutral) for an unparseable date', () => {
    expect(freshnessScore('not-a-date', NOW)).toBe(50);
  });

  it('decays linearly over the decay period', () => {
    // 7 days old with 14-day decay → halfway → 50
    expect(freshnessScore('2026-06-24', NOW, 14)).toBe(50);
  });

  it('returns 0 when older than the decay period', () => {
    expect(freshnessScore('2026-06-01', NOW, 14)).toBe(0);
  });

  it('respects a custom decay period', () => {
    // 3 days old with 6-day decay → halfway → 50
    expect(freshnessScore('2026-06-28', NOW, 6)).toBe(50);
  });

  it('handles ISO datetime strings', () => {
    // 1 day old datetime → 100 * (1 - 1/14) ≈ 93
    expect(freshnessScore('2026-06-30T00:00:00Z', NOW)).toBe(93);
  });
});

// ---------------------------------------------------------------------------
// missionRankScore
// ---------------------------------------------------------------------------

describe('missionRankScore', () => {
  it('combines relevance and freshness by weight', () => {
    // relevance 80, freshness 100, weights 0.75/0.25 → 60 + 25 = 85
    const mission = makeMission({ score: 80, publishedAt: '2026-07-01' });
    expect(missionRankScore(mission, NOW)).toBe(85);
  });

  it('penalizes old missions via freshness', () => {
    const fresh = makeMission({ id: 'fresh', score: 60, publishedAt: '2026-07-01' });
    const stale = makeMission({ id: 'stale', score: 60, publishedAt: '2026-06-01' });
    // Same relevance, but fresh should rank higher
    expect(missionRankScore(fresh, NOW)).toBeGreaterThan(missionRankScore(stale, NOW));
  });

  it('lets high relevance overcome low freshness', () => {
    const relevant = makeMission({ id: 'rel', score: 95, publishedAt: '2026-06-01' });
    const fresh = makeMission({ id: 'fresh', score: 50, publishedAt: '2026-07-01' });
    // 95 * 0.75 + 0 * 0.25 = 71.25 → 71  vs  50 * 0.75 + 100 * 0.25 = 62.5 → 63
    expect(missionRankScore(relevant, NOW)).toBeGreaterThan(missionRankScore(fresh, NOW));
  });

  it('normalizes weights that do not sum to 1', () => {
    const mission = makeMission({ score: 80, publishedAt: '2026-07-01' });
    // weights 3/1 → normalized 0.75/0.25 → same as default
    expect(missionRankScore(mission, NOW, { relevance: 3, freshness: 1 })).toBe(
      missionRankScore(mission, NOW, { relevance: 0.75, freshness: 0.25 })
    );
  });

  it('prefers scoreBreakdown.total over legacy score', () => {
    const mission = makeMission({
      score: 30,
      scoreBreakdown: {
        criteria: {
          stack: 80,
          location: 80,
          tjm: 80,
          remote: 80,
          seniorityBonus: 0,
          startDateBonus: 0,
        },
        deterministic: 80,
        semantic: null,
        semanticReason: null,
        total: 80,
        grade: 'B',
      },
      publishedAt: '2026-07-01',
    });
    // Should use 80 (breakdown) not 30 (legacy)
    expect(missionRankScore(mission, NOW)).toBe(85); // 80*0.75 + 100*0.25
  });

  it('treats null score as 0', () => {
    const mission = makeMission({ score: null, publishedAt: '2026-07-01' });
    // 0 * 0.75 + 100 * 0.25 = 25
    expect(missionRankScore(mission, NOW)).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// rankMissions
// ---------------------------------------------------------------------------

describe('rankMissions', () => {
  it('returns a new array (does not mutate input)', () => {
    const missions = [makeMission({ id: 'a', score: 50 }), makeMission({ id: 'b', score: 90 })];
    const original = [...missions];
    rankMissions(missions, NOW);
    expect(missions.map((m) => m.id)).toEqual(original.map((m) => m.id));
  });

  it('returns empty array for empty input', () => {
    expect(rankMissions([], NOW)).toEqual([]);
  });

  it('returns single-element array unchanged', () => {
    const missions = [makeMission({ id: 'a', score: 50 })];
    expect(rankMissions(missions, NOW).map((m) => m.id)).toEqual(['a']);
  });

  it('sorts by composite score when single source (no diversity benefit)', () => {
    const missions = [
      makeMission({ id: 'low', score: 30, publishedAt: '2026-06-20' }),
      makeMission({ id: 'high', score: 90, publishedAt: '2026-06-30' }),
      makeMission({ id: 'mid', score: 60, publishedAt: '2026-06-25' }),
    ];
    const result = rankMissions(missions, NOW);
    expect(result.map((m) => m.id)).toEqual(['high', 'mid', 'low']);
  });

  it('interleaves sources so no single source dominates', () => {
    // Source A has 4 high missions, source B has 2 — without diversity,
    // the top 4 would all be A. With diversity, B should appear in the top 3.
    const missions = [
      makeMission({ id: 'a1', score: 95, source: 'free-work', publishedAt: '2026-07-01' }),
      makeMission({ id: 'a2', score: 90, source: 'free-work', publishedAt: '2026-07-01' }),
      makeMission({ id: 'a3', score: 85, source: 'free-work', publishedAt: '2026-07-01' }),
      makeMission({ id: 'a4', score: 80, source: 'free-work', publishedAt: '2026-07-01' }),
      makeMission({ id: 'b1', score: 88, source: 'lehibou', publishedAt: '2026-07-01' }),
      makeMission({ id: 'b2', score: 78, source: 'lehibou', publishedAt: '2026-07-01' }),
    ];
    const result = rankMissions(missions, NOW);
    const ids = result.map((m) => m.id);

    // First mission should be the highest overall (a1)
    expect(ids[0]).toBe('a1');
    // Second mission should be from the other source (b1), not a2
    expect(ids[1]).toBe('b1');
    // All missions present
    expect(ids).toHaveLength(6);
  });

  it('skips interleaving when diversify is false', () => {
    const missions = [
      makeMission({ id: 'a1', score: 95, source: 'free-work', publishedAt: '2026-07-01' }),
      makeMission({ id: 'a2', score: 90, source: 'free-work', publishedAt: '2026-07-01' }),
      makeMission({ id: 'b1', score: 88, source: 'lehibou', publishedAt: '2026-07-01' }),
    ];
    const result = rankMissions(missions, NOW, { diversify: false });
    // Pure score order: a1(95), a2(90), b1(88)
    expect(result.map((m) => m.id)).toEqual(['a1', 'a2', 'b1']);
  });

  it('surfaces a fresh mid-score mission above a stale high-score mission', () => {
    const stale = makeMission({
      id: 'stale-high',
      score: 90,
      publishedAt: '2026-06-20', // 11 days old → freshness ~21
      source: 'free-work',
    });
    const fresh = makeMission({
      id: 'fresh-mid',
      score: 70,
      publishedAt: '2026-07-01', // today → freshness 100
      source: 'lehibou',
    });
    const result = rankMissions([stale, fresh], NOW, { diversify: false });
    // stale:  90*0.75 + 21*0.25 ≈ 73
    // fresh:  70*0.75 + 100*0.25 = 77.5 → 78
    expect(result[0].id).toBe('fresh-mid');
  });

  it('respects custom weights favoring freshness', () => {
    const stale = makeMission({
      id: 'stale-high',
      score: 90,
      publishedAt: '2026-06-24', // 7 days → freshness 50
      source: 'free-work',
    });
    const fresh = makeMission({
      id: 'fresh-low',
      score: 60,
      publishedAt: '2026-07-01', // freshness 100
      source: 'lehibou',
    });
    // Default (0.75/0.25): stale 79, fresh 70 → stale first
    const defaultResult = rankMissions([stale, fresh], NOW, { diversify: false });
    expect(defaultResult[0].id).toBe('stale-high');

    // Freshness-heavy (0.3/0.7): stale 62, fresh 82 → fresh first
    const freshResult = rankMissions([stale, fresh], NOW, {
      weights: { relevance: 0.3, freshness: 0.7 },
      diversify: false,
    });
    expect(freshResult[0].id).toBe('fresh-low');
  });

  it('handles missions with null publishedAt (neutral freshness)', () => {
    const noDate = makeMission({ id: 'no-date', score: 80, publishedAt: null });
    const fresh = makeMission({ id: 'fresh', score: 80, publishedAt: '2026-07-01' });
    const result = rankMissions([noDate, fresh], NOW, { diversify: false });
    // Same relevance, fresh has higher freshness → fresh first
    expect(result[0].id).toBe('fresh');
  });

  it('round-robin preserves score order within each source', () => {
    const missions = [
      makeMission({ id: 'a2', score: 80, source: 'free-work', publishedAt: '2026-07-01' }),
      makeMission({ id: 'a1', score: 95, source: 'free-work', publishedAt: '2026-07-01' }),
      makeMission({ id: 'b2', score: 70, source: 'lehibou', publishedAt: '2026-07-01' }),
      makeMission({ id: 'b1', score: 88, source: 'lehibou', publishedAt: '2026-07-01' }),
    ];
    const result = rankMissions(missions, NOW);
    const freeWork = result.filter((m) => m.source === 'free-work');
    const lehibou = result.filter((m) => m.source === 'lehibou');
    // Within each source, higher score comes first
    expect(freeWork.map((m) => m.id)).toEqual(['a1', 'a2']);
    expect(lehibou.map((m) => m.id)).toEqual(['b1', 'b2']);
  });

  it('uses default constants when no options given', () => {
    expect(DEFAULT_RANKING_WEIGHTS).toEqual({ relevance: 0.75, freshness: 0.25 });
    expect(DEFAULT_FRESHNESS_DECAY_DAYS).toBe(14);
  });
});
