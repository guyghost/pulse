import { describe, expect, it } from 'vitest';
import { deriveTopMatchSignals } from '$lib/core/scoring/top-match-signals';
import type { Mission } from '$lib/core/types/mission';
import type { ScoreBreakdown } from '$lib/core/types/score';

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-test',
    title: 'Senior Svelte / TS Architect',
    client: 'Acme Corp',
    description: 'Looking for a senior developer',
    stack: ['Svelte', 'TypeScript', 'TailwindCSS'],
    tjm: 650,
    location: 'Paris',
    remote: 'full',
    duration: '6 mois',
    startDate: '2026-10-01',
    publishedAt: '2026-09-22T10:00:00.000Z',
    url: 'https://example.com/mission',
    source: 'free-work',
    scrapedAt: new Date('2026-09-22T12:00:00.000Z'),
    seniority: 'senior',
    scoreBreakdown: null,
    score: null,
    semanticScore: null,
    semanticReason: null,
    ...overrides,
  };
}

function makeBreakdown(
  total: number,
  criteriaOverrides: Partial<ScoreBreakdown['criteria']> = {}
): ScoreBreakdown {
  return {
    criteria: {
      stack: 80,
      location: 70,
      tjm: 90,
      remote: 100,
      seniorityBonus: 0,
      startDateBonus: 0,
      ...criteriaOverrides,
    },
    deterministic: total,
    semantic: null,
    semanticReason: null,
    total,
    grade: total >= 80 ? 'A' : 'B',
  };
}

describe('deriveTopMatchSignals', () => {
  it('identifies Grade A missions as top matches', () => {
    const mission = makeMission({
      scoreBreakdown: makeBreakdown(88),
    });
    const signals = deriveTopMatchSignals(mission, { profileTjmMin: 550 });

    expect(signals.isTopMatch).toBe(true);
    expect(signals.score).toBe(88);
    expect(signals.highlights.length).toBeGreaterThan(0);
    expect(signals.highlights.length).toBeLessThanOrEqual(3);
  });

  it('rejects Grade B/C missions as non-top matches', () => {
    const mission = makeMission({
      scoreBreakdown: makeBreakdown(72),
    });
    const signals = deriveTopMatchSignals(mission);

    expect(signals.isTopMatch).toBe(false);
    expect(signals.score).toBe(72);
  });

  it('calculates TJM bonus percentage against profile floor', () => {
    const mission = makeMission({
      tjm: 700,
      scoreBreakdown: makeBreakdown(85),
    });
    const signals = deriveTopMatchSignals(mission, { profileTjmMin: 500 });

    // (700 - 500) / 500 = 40%
    expect(signals.highlights).toContain('+40% vs plancher (700€/j)');
  });

  it('mentions full remote and stack competence highlights', () => {
    const mission = makeMission({
      remote: 'full',
      scoreBreakdown: makeBreakdown(92, { stack: 90 }),
    });
    const signals = deriveTopMatchSignals(mission);

    expect(signals.highlights).toContain('Compétences clés maîtrisées');
    expect(signals.highlights).toContain('100% télétravail');
  });

  it('falls back gracefully when scoreBreakdown is absent but legacy score is >= 80', () => {
    const mission = makeMission({
      score: 82,
      stack: ['Vue', 'Node'],
      remote: 'hybrid',
      tjm: 600,
    });
    const signals = deriveTopMatchSignals(mission);

    expect(signals.isTopMatch).toBe(true);
    expect(signals.highlights).toContain('Stack : Vue, Node');
    expect(signals.highlights).toContain('600€/j annoncé');
    expect(signals.highlights).toContain('Télétravail hybride');
  });
});
