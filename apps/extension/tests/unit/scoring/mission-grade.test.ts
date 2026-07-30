import { describe, expect, it } from 'vitest';
import { getMissionGrade, getMissionScore } from '$lib/core/scoring/mission-grade';
import type { Mission } from '$lib/core/types/mission';
import type { ScoreBreakdown } from '$lib/core/types/score';

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-1',
    title: 'Mission',
    client: null,
    description: '',
    stack: [],
    tjm: null,
    location: null,
    remote: null,
    duration: null,
    startDate: null,
    publishedAt: null,
    url: 'https://example.com/mission',
    source: 'free-work',
    scrapedAt: new Date('2026-07-29T12:00:00.000Z'),
    seniority: null,
    scoreBreakdown: null,
    score: null,
    semanticScore: null,
    semanticReason: null,
    ...overrides,
  };
}

function makeBreakdown(total: number): ScoreBreakdown {
  return {
    criteria: {
      stack: 0,
      location: 0,
      tjm: 0,
      remote: 0,
      seniorityBonus: 0,
      startDateBonus: 0,
    },
    deterministic: total,
    semantic: null,
    semanticReason: null,
    total,
    grade: 'F',
  };
}

describe('mission grade presentation', () => {
  it.each([
    [100, 'A'],
    [80, 'A'],
    [79, 'B'],
    [60, 'B'],
    [59, 'C'],
    [40, 'C'],
    [39, 'D'],
    [20, 'D'],
    [19, 'F'],
    [0, 'F'],
  ] as const)('projects %i to grade %s', (score, grade) => {
    expect(getMissionGrade(makeMission({ score }))).toBe(grade);
  });

  it('uses the structured total before contradictory legacy fields and grade metadata', () => {
    expect(
      getMissionGrade(
        makeMission({
          scoreBreakdown: makeBreakdown(85),
          semanticScore: 10,
          score: 15,
        })
      )
    ).toBe('A');
  });

  it('uses the historical semantic score before the legacy deterministic score', () => {
    const mission = makeMission({ semanticScore: 72, score: 45 });

    expect(getMissionScore(mission)).toBe(72);
    expect(getMissionGrade(mission)).toBe('B');
  });

  it('keeps absent and invalid scores unrated', () => {
    expect(getMissionGrade(makeMission())).toBeNull();
    expect(getMissionGrade(makeMission({ score: Number.NaN }))).toBeNull();
    expect(getMissionGrade(makeMission({ semanticScore: Number.POSITIVE_INFINITY }))).toBeNull();
  });

  it('projects historical out-of-range values to the extreme grades', () => {
    expect(getMissionGrade(makeMission({ score: 120 }))).toBe('A');
    expect(getMissionGrade(makeMission({ score: -10 }))).toBe('F');
  });
});
