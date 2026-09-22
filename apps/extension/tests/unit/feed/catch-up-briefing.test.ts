import { describe, expect, it } from 'vitest';
import {
  MIN_BRIEFING_INTERVAL_MS,
  VELOCITY_WINDOW_MS,
  arrivalEpochMs,
  computeCatchUpBriefing,
  formatVelocityLabel,
  inBriefingWave,
  selectTopOpportunity,
} from '$lib/core/feed/catch-up-briefing';
import type { Mission } from '$lib/core/types/mission';

const NOW = new Date('2026-09-22T12:00:00.000Z');

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-test',
    title: 'Senior Svelte / TS Architect',
    client: 'Acme Corp',
    description: 'Looking for a senior developer',
    stack: ['Svelte', 'TypeScript'],
    tjm: 650,
    location: 'Paris',
    remote: 'full',
    duration: '6 mois',
    startDate: '2026-10-01',
    publishedAt: '2026-09-22T10:00:00.000Z',
    url: 'https://example.com/mission',
    source: 'free-work',
    scrapedAt: new Date('2026-09-22T11:00:00.000Z'),
    seniority: 'senior',
    scoreBreakdown: null,
    score: null,
    semanticScore: null,
    semanticReason: null,
    ...overrides,
  };
}

describe('arrivalEpochMs', () => {
  it('prefers the later of scrapedAt and publishedAt', () => {
    const mission = makeMission({
      scrapedAt: new Date('2026-09-22T11:00:00.000Z'),
      publishedAt: '2026-09-22T10:00:00.000Z',
    });
    expect(arrivalEpochMs(mission)).toBe(new Date('2026-09-22T11:00:00.000Z').getTime());
  });

  it('falls back to publishedAt when scrapedAt is invalid', () => {
    const mission = makeMission({
      scrapedAt: new Date('invalid'),
      publishedAt: '2026-09-22T10:00:00.000Z',
    });
    expect(arrivalEpochMs(mission)).toBe(new Date('2026-09-22T10:00:00.000Z').getTime());
  });

  it('returns null when no timestamp is parseable', () => {
    const mission = makeMission({
      scrapedAt: new Date('invalid'),
      publishedAt: 'not-a-date',
    });
    expect(arrivalEpochMs(mission)).toBeNull();
  });
});

describe('inBriefingWave', () => {
  const lastVisit = new Date('2026-09-22T09:00:00.000Z');

  it('includes missions that arrived strictly after the last visit', () => {
    expect(inBriefingWave(makeMission(), lastVisit)).toBe(true);
  });

  it('excludes missions that arrived at or before the last visit', () => {
    const atVisit = makeMission({
      scrapedAt: new Date('2026-09-22T09:00:00.000Z'),
      publishedAt: '2026-09-22T09:00:00.000Z',
    });
    expect(inBriefingWave(atVisit, lastVisit)).toBe(false);
    const beforeVisit = makeMission({
      scrapedAt: new Date('2026-09-22T08:00:00.000Z'),
      publishedAt: '2026-09-22T07:00:00.000Z',
    });
    expect(inBriefingWave(beforeVisit, lastVisit)).toBe(false);
  });

  it('rejects a null/invalid lastVisitAt', () => {
    expect(inBriefingWave(makeMission(), new Date('invalid'))).toBe(false);
  });
});

describe('selectTopOpportunity', () => {
  function scored(id: string, score: number, tjm: number): Mission {
    return makeMission({ id, tjm, score: null, scoreBreakdown: null, semanticScore: score });
  }

  it('picks the highest-scored mission of the wave', () => {
    const top = selectTopOpportunity([scored('a', 55, 600), scored('b', 92, 650)]);
    expect(top?.id).toBe('b');
  });

  it('breaks score ties by higher TJM', () => {
    const top = selectTopOpportunity([scored('a', 80, 600), scored('b', 80, 700)]);
    expect(top?.id).toBe('b');
  });

  it('falls back to TJM when no score is present', () => {
    const top = selectTopOpportunity([
      makeMission({ id: 'a', score: null, semanticScore: null, tjm: 500 }),
      makeMission({ id: 'b', score: null, semanticScore: null, tjm: 850 }),
    ]);
    expect(top?.id).toBe('b');
  });

  it('returns null on an empty wave', () => {
    expect(selectTopOpportunity([])).toBeNull();
  });
});

describe('computeCatchUpBriefing', () => {
  it('returns null without a reliable lastVisitAt baseline', () => {
    expect(computeCatchUpBriefing([makeMission()], null, NOW)).toBeNull();
    expect(computeCatchUpBriefing([makeMission()], new Date('invalid'), NOW)).toBeNull();
  });

  it('returns null when the interval is below the 30-minute threshold', () => {
    const lastVisit = new Date(NOW.getTime() - MIN_BRIEFING_INTERVAL_MS + 1000);
    expect(computeCatchUpBriefing([makeMission()], lastVisit, NOW)).toBeNull();
  });

  it('returns null when no mission arrived since the last visit', () => {
    const lastVisit = new Date('2026-09-22T11:30:00.000Z');
    const old = makeMission({ scrapedAt: new Date('2026-09-22T11:00:00.000Z') });
    expect(computeCatchUpBriefing([old], lastVisit, NOW)).toBeNull();
  });

  it('computes count, Grade A gems, mean TJM and top opportunity', () => {
    const lastVisit = new Date('2026-09-22T08:00:00.000Z');
    const missions = [
      makeMission({
        id: 'm1',
        tjm: 600,
        semanticScore: 92, // Grade A
        scrapedAt: new Date('2026-09-22T10:00:00.000Z'),
      }),
      makeMission({
        id: 'm2',
        tjm: 800,
        semanticScore: 60, // not Grade A
        scrapedAt: new Date('2026-09-22T10:30:00.000Z'),
      }),
      makeMission({
        id: 'm-old',
        tjm: 900,
        semanticScore: 99,
        scrapedAt: new Date('2026-09-22T07:00:00.000Z'), // before lastVisit
        publishedAt: '2026-09-22T07:00:00.000Z', // publication also before baseline
      }),
    ];

    const briefing = computeCatchUpBriefing(missions, lastVisit, NOW);
    expect(briefing).not.toBeNull();
    expect(briefing!.count).toBe(2);
    expect(briefing!.gradeA).toBe(1);
    expect(briefing!.meanTjm).toBe(Math.round((600 + 800) / 2));
    expect(briefing!.topMission?.id).toBe('m1');
    expect(briefing!.waveMissionIds).toEqual(['m1', 'm2']);
  });

  it('drops the TJM average to null when no wave mission has a rate', () => {
    const lastVisit = new Date('2026-09-22T08:00:00.000Z');
    const missions = [
      makeMission({ id: 'm1', tjm: null, scrapedAt: new Date('2026-09-22T10:00:00.000Z') }),
    ];
    const briefing = computeCatchUpBriefing(missions, lastVisit, NOW);
    expect(briefing!.meanTjm).toBeNull();
    expect(briefing!.count).toBe(1);
  });

  it('uses duplicated-TJM-free missions in the average without skewing on missing dates', () => {
    const lastVisit = new Date('2026-09-22T08:00:00.000Z');
    const missions = [
      makeMission({ id: 'm1', tjm: 500, scrapedAt: new Date('2026-09-22T09:00:00.000Z') }),
      makeMission({ id: 'm2', tjm: 700, scrapedAt: new Date('2026-09-22T09:30:00.000Z') }),
    ];
    const briefing = computeCatchUpBriefing(missions, lastVisit, NOW);
    expect(briefing!.meanTjm).toBe(600);
  });
});

describe('formatVelocityLabel', () => {
  it('returns the discreet velocity label for a mission published less than an hour ago', () => {
    const mission = makeMission({
      publishedAt: new Date(NOW.getTime() - 5 * 60 * 1000).toISOString(),
    });
    expect(formatVelocityLabel(mission, NOW)).toBe('Publiée il y a < 1h');
  });

  it('returns null for missions published at or beyond the velocity window', () => {
    const atWindow = makeMission({
      publishedAt: new Date(NOW.getTime() - VELOCITY_WINDOW_MS).toISOString(),
    });
    expect(formatVelocityLabel(atWindow, NOW)).toBeNull();
    const beyond = makeMission({
      publishedAt: new Date(NOW.getTime() - VELOCITY_WINDOW_MS - 1000).toISOString(),
    });
    expect(formatVelocityLabel(beyond, NOW)).toBeNull();
  });

  it('returns null for future or missing publication dates', () => {
    expect(formatVelocityLabel(makeMission({ publishedAt: null }), NOW)).toBeNull();
    const future = makeMission({
      publishedAt: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
    });
    expect(formatVelocityLabel(future, NOW)).toBeNull();
  });

  it('returns null for an invalid published date', () => {
    expect(formatVelocityLabel(makeMission({ publishedAt: 'not-a-date' }), NOW)).toBeNull();
  });
});
