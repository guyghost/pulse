import { describe, it, expect } from 'vitest';
import type { Mission } from '$lib/core/types/mission';
import type { TJMHistory, TJMRecord } from '$lib/core/types/tjm';
import {
  extractRecords,
  addRecords,
  emptyHistory,
  determineTrend,
  getStatsForStack,
  getAllStats,
  getTrend,
  getStatsForMission,
  getDominantTrendForMission,
  analyzeTJMHistory,
} from '$lib/core/tjm-history/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  startDate: null,
  url: 'https://example.com',
  source: 'free-work',
  scrapedAt: new Date('2024-01-01'),
  seniority: null,
  score: null,
  semanticScore: null,
  semanticReason: null,
  ...overrides,
});

const makeRecord = (overrides: Partial<TJMRecord> = {}): TJMRecord => ({
  stack: 'react',
  date: '2026-04-01',
  min: 400,
  max: 600,
  average: 500,
  sampleCount: 5,
  seniority: null,
  ...overrides,
});

const makeHistory = (records: TJMRecord[]): TJMHistory => ({ records });

// ---------------------------------------------------------------------------
// extractRecords
// ---------------------------------------------------------------------------

describe('extractRecords', () => {
  it('returns empty array when no missions have TJM', () => {
    const missions = [makeMission({ stack: ['react'] }), makeMission({ stack: ['vue'] })];

    const result = extractRecords(missions, '2026-04-01');
    expect(result).toEqual([]);
  });

  it('returns empty array when no missions have stack', () => {
    const missions = [makeMission({ tjm: 500, stack: [] }), makeMission({ tjm: 600, stack: [] })];

    const result = extractRecords(missions, '2026-04-01');
    expect(result).toEqual([]);
  });

  it('extracts a single record for a single stack', () => {
    const missions = [makeMission({ tjm: 500, stack: ['React'] })];

    const result = extractRecords(missions, '2026-04-01');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      stack: 'react',
      date: '2026-04-01',
      min: 500,
      max: 500,
      average: 500,
      sampleCount: 1,
      seniority: null,
      region: 'other',
    });
  });

  it('normalizes stack names to lowercase', () => {
    const missions = [
      makeMission({ tjm: 500, stack: ['React'] }),
      makeMission({ tjm: 600, stack: ['REACT'] }),
      makeMission({ tjm: 550, stack: ['react'] }),
    ];

    const result = extractRecords(missions, '2026-04-01');
    expect(result).toHaveLength(1);
    expect(result[0].stack).toBe('react');
    expect(result[0].sampleCount).toBe(3);
    expect(result[0].min).toBe(500);
    expect(result[0].max).toBe(600);
    expect(result[0].average).toBe(550);
  });

  it('groups by stack from multi-stack missions', () => {
    const missions = [makeMission({ tjm: 500, stack: ['React', 'TypeScript'] })];

    const result = extractRecords(missions, '2026-04-01');
    expect(result).toHaveLength(2);

    const stacks = result.map((r) => r.stack).sort();
    expect(stacks).toEqual(['react', 'typescript']);
  });

  it('handles multiple stacks across multiple missions', () => {
    const missions = [
      makeMission({ tjm: 500, stack: ['React', 'TypeScript'] }),
      makeMission({ tjm: 450, stack: ['React'] }),
      makeMission({ tjm: 550, stack: ['Vue', 'TypeScript'] }),
    ];

    const result = extractRecords(missions, '2026-04-01');

    const reactRecord = result.find((r) => r.stack === 'react')!;
    const typescriptRecord = result.find((r) => r.stack === 'typescript')!;
    const vueRecord = result.find((r) => r.stack === 'vue')!;

    expect(reactRecord.sampleCount).toBe(2);
    expect(reactRecord.average).toBe(475);

    expect(typescriptRecord.sampleCount).toBe(2);
    expect(typescriptRecord.average).toBe(525);

    expect(vueRecord.sampleCount).toBe(1);
    expect(vueRecord.average).toBe(550);
  });

  it('excludes missions with zero or negative TJM', () => {
    const missions = [
      makeMission({ tjm: 0, stack: ['React'] }),
      makeMission({ tjm: -100, stack: ['React'] }),
      makeMission({ tjm: 500, stack: ['React'] }),
    ];

    const result = extractRecords(missions, '2026-04-01');
    expect(result).toHaveLength(1);
    expect(result[0].sampleCount).toBe(1);
  });

  it('excludes empty or whitespace-only stack names', () => {
    const missions = [makeMission({ tjm: 500, stack: ['', '  ', 'React'] })];

    const result = extractRecords(missions, '2026-04-01');
    expect(result).toHaveLength(1);
    expect(result[0].stack).toBe('react');
  });

  // -- Seniority grouping --------------------------------------------------

  it('groups by stack AND seniority', () => {
    const missions = [
      makeMission({ tjm: 500, stack: ['React'], seniority: 'junior' }),
      makeMission({ tjm: 600, stack: ['React'], seniority: 'senior' }),
    ];

    const result = extractRecords(missions, '2026-04-01');
    expect(result).toHaveLength(2);

    const juniorRecord = result.find((r) => r.seniority === 'junior')!;
    const seniorRecord = result.find((r) => r.seniority === 'senior')!;

    expect(juniorRecord.stack).toBe('react');
    expect(juniorRecord.average).toBe(500);
    expect(juniorRecord.sampleCount).toBe(1);
    expect(juniorRecord.seniority).toBe('junior');

    expect(seniorRecord.stack).toBe('react');
    expect(seniorRecord.average).toBe(600);
    expect(seniorRecord.sampleCount).toBe(1);
    expect(seniorRecord.seniority).toBe('senior');
  });

  it('carries seniority into extracted record', () => {
    const missions = [makeMission({ tjm: 450, stack: ['Vue'], seniority: 'confirmed' })];

    const result = extractRecords(missions, '2026-04-01');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      stack: 'vue',
      date: '2026-04-01',
      min: 450,
      max: 450,
      average: 450,
      sampleCount: 1,
      seniority: 'confirmed',
      region: 'other',
    });
  });

  it('treats null seniority missions separately from non-null', () => {
    const missions = [
      makeMission({ tjm: 500, stack: ['React'], seniority: null }),
      makeMission({ tjm: 600, stack: ['React'], seniority: 'junior' }),
      makeMission({ tjm: 700, stack: ['React'], seniority: 'senior' }),
    ];

    const result = extractRecords(missions, '2026-04-01');
    expect(result).toHaveLength(3);

    const seniorities = result.map((r) => r.seniority);
    expect(seniorities).toContain(null);
    expect(seniorities).toContain('junior');
    expect(seniorities).toContain('senior');
  });
});

// ---------------------------------------------------------------------------
// addRecords
// ---------------------------------------------------------------------------

describe('addRecords', () => {
  it('adds records to empty history', () => {
    const history = emptyHistory();
    const newRecords = [makeRecord({ stack: 'react', date: '2026-04-01' })];

    const result = addRecords(history, newRecords);
    expect(result.records).toHaveLength(1);
  });

  it('upserts records with same stack+date', () => {
    const history = makeHistory([makeRecord({ stack: 'react', date: '2026-04-01', average: 500 })]);

    const newRecords = [makeRecord({ stack: 'react', date: '2026-04-01', average: 550 })];

    const result = addRecords(history, newRecords);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].average).toBe(550);
  });

  it('adds records with different dates for same stack', () => {
    const history = makeHistory([makeRecord({ stack: 'react', date: '2026-04-01' })]);

    const newRecords = [makeRecord({ stack: 'react', date: '2026-04-02' })];

    const result = addRecords(history, newRecords);
    expect(result.records).toHaveLength(2);
  });

  it('sorts records by date then stack', () => {
    const history = emptyHistory();
    const newRecords = [
      makeRecord({ stack: 'vue', date: '2026-04-02' }),
      makeRecord({ stack: 'react', date: '2026-04-01' }),
      makeRecord({ stack: 'angular', date: '2026-04-01' }),
    ];

    const result = addRecords(history, newRecords);
    expect(result.records.map((r) => `${r.stack}:${r.date}`)).toEqual([
      'angular:2026-04-01',
      'react:2026-04-01',
      'vue:2026-04-02',
    ]);
  });

  it('does not mutate original history', () => {
    const original = makeHistory([makeRecord({ stack: 'react', date: '2026-04-01' })]);

    const newRecords = [makeRecord({ stack: 'vue', date: '2026-04-02' })];

    const result = addRecords(original, newRecords);
    expect(original.records).toHaveLength(1);
    expect(result.records).toHaveLength(2);
  });

  // -- Seniority in upsert key ---------------------------------------------

  it('keeps records with different seniority separate even for same stack+date', () => {
    const history = makeHistory([
      makeRecord({ stack: 'react', date: '2026-04-01', seniority: null }),
    ]);

    const newRecords = [makeRecord({ stack: 'react', date: '2026-04-01', seniority: 'junior' })];

    const result = addRecords(history, newRecords);
    expect(result.records).toHaveLength(2);

    const seniorities = result.records.map((r) => r.seniority);
    expect(seniorities).toContain(null);
    expect(seniorities).toContain('junior');
  });

  it('upserts correctly with seniority in key', () => {
    const history = makeHistory([
      makeRecord({ stack: 'react', date: '2026-04-01', seniority: 'junior', average: 500 }),
    ]);

    const newRecords = [
      makeRecord({ stack: 'react', date: '2026-04-01', seniority: 'junior', average: 550 }),
    ];

    const result = addRecords(history, newRecords);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].average).toBe(550);
    expect(result.records[0].seniority).toBe('junior');
  });
});

// ---------------------------------------------------------------------------
// emptyHistory
// ---------------------------------------------------------------------------

describe('emptyHistory', () => {
  it('returns a history with empty records', () => {
    const history = emptyHistory();
    expect(history.records).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// determineTrend
// ---------------------------------------------------------------------------

describe('determineTrend', () => {
  it('returns stable when previous is null', () => {
    expect(determineTrend(500, null)).toBe('stable');
  });

  it('returns stable when previous is 0', () => {
    expect(determineTrend(500, 0)).toBe('stable');
  });

  it('returns up when increase exceeds 5%', () => {
    expect(determineTrend(550, 500)).toBe('up'); // 10% increase
  });

  it('returns down when decrease exceeds 5%', () => {
    expect(determineTrend(450, 500)).toBe('down'); // 10% decrease
  });

  it('returns stable when change is within 5%', () => {
    expect(determineTrend(510, 500)).toBe('stable'); // 2% increase
    expect(determineTrend(490, 500)).toBe('stable'); // 2% decrease
  });

  it('returns stable at exactly 5% boundary', () => {
    expect(determineTrend(525, 500)).toBe('stable'); // exactly 5%
    expect(determineTrend(475, 500)).toBe('stable'); // exactly -5%
  });
});

// ---------------------------------------------------------------------------
// getStatsForStack
// ---------------------------------------------------------------------------

describe('getStatsForStack', () => {
  it('returns null when no data for stack', () => {
    const history = makeHistory([makeRecord({ stack: 'react', date: '2026-04-01' })]);

    const stats = getStatsForStack(history, 'vue');
    expect(stats).toBeNull();
  });

  it('returns stats for a single data point', () => {
    const history = makeHistory([
      makeRecord({ stack: 'react', date: '2026-04-01', average: 500, min: 400, max: 600 }),
    ]);

    const stats = getStatsForStack(history, 'react')!;
    expect(stats.stack).toBe('react');
    expect(stats.currentAverage).toBe(500);
    expect(stats.previousAverage).toBeNull();
    expect(stats.trend).toBe('stable');
    expect(stats.allTimeMin).toBe(400);
    expect(stats.allTimeMax).toBe(600);
    expect(stats.dataPointCount).toBe(1);
    expect(stats.lastUpdated).toBe('2026-04-01');
  });

  it('computes trend from two data points', () => {
    const history = makeHistory([
      makeRecord({ stack: 'react', date: '2026-04-01', average: 500 }),
      makeRecord({ stack: 'react', date: '2026-04-02', average: 560 }),
    ]);

    const stats = getStatsForStack(history, 'react')!;
    expect(stats.currentAverage).toBe(560);
    expect(stats.previousAverage).toBe(500);
    expect(stats.trend).toBe('up');
  });

  it('normalizes stack name to lowercase', () => {
    const history = makeHistory([makeRecord({ stack: 'react', date: '2026-04-01' })]);

    const stats = getStatsForStack(history, 'REACT');
    expect(stats).not.toBeNull();
    expect(stats!.stack).toBe('react');
  });

  it('computes all-time min/max from all records', () => {
    const history = makeHistory([
      makeRecord({ stack: 'react', date: '2026-04-01', min: 400, max: 600 }),
      makeRecord({ stack: 'react', date: '2026-04-02', min: 350, max: 650 }),
      makeRecord({ stack: 'react', date: '2026-04-03', min: 420, max: 580 }),
    ]);

    const stats = getStatsForStack(history, 'react')!;
    expect(stats.allTimeMin).toBe(350);
    expect(stats.allTimeMax).toBe(650);
    expect(stats.dataPointCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// getAllStats
// ---------------------------------------------------------------------------

describe('getAllStats', () => {
  it('returns empty map for empty history', () => {
    const stats = getAllStats(emptyHistory());
    expect(stats.size).toBe(0);
  });

  it('returns stats for all unique stacks', () => {
    const history = makeHistory([
      makeRecord({ stack: 'react', date: '2026-04-01', average: 500 }),
      makeRecord({ stack: 'vue', date: '2026-04-01', average: 480 }),
      makeRecord({ stack: 'angular', date: '2026-04-01', average: 450 }),
    ]);

    const stats = getAllStats(history);
    expect(stats.size).toBe(3);
    expect(stats.get('react')!.currentAverage).toBe(500);
    expect(stats.get('vue')!.currentAverage).toBe(480);
    expect(stats.get('angular')!.currentAverage).toBe(450);
  });
});

// ---------------------------------------------------------------------------
// getTrend
// ---------------------------------------------------------------------------

describe('getTrend', () => {
  it('returns stable for unknown stack', () => {
    expect(getTrend(emptyHistory(), 'react')).toBe('stable');
  });

  it('returns trend for known stack', () => {
    const history = makeHistory([
      makeRecord({ stack: 'react', date: '2026-04-01', average: 500 }),
      makeRecord({ stack: 'react', date: '2026-04-02', average: 560 }),
    ]);

    expect(getTrend(history, 'react')).toBe('up');
  });
});

// ---------------------------------------------------------------------------
// getStatsForMission
// ---------------------------------------------------------------------------

describe('getStatsForMission', () => {
  it('returns empty map when mission has no matching stacks', () => {
    const history = makeHistory([makeRecord({ stack: 'vue', date: '2026-04-01' })]);

    const mission = makeMission({ stack: ['React'] });
    const stats = getStatsForMission(history, mission);
    expect(stats.size).toBe(0);
  });

  it('returns stats for mission stacks that have data', () => {
    const history = makeHistory([
      makeRecord({ stack: 'react', date: '2026-04-01', average: 500 }),
      makeRecord({ stack: 'typescript', date: '2026-04-01', average: 520 }),
    ]);

    const mission = makeMission({ stack: ['React', 'TypeScript', 'GraphQL'] });
    const stats = getStatsForMission(history, mission);

    expect(stats.size).toBe(2);
    expect(stats.has('react')).toBe(true);
    expect(stats.has('typescript')).toBe(true);
    expect(stats.has('graphql')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getDominantTrendForMission
// ---------------------------------------------------------------------------

describe('getDominantTrendForMission', () => {
  it('returns stable when mission has no stacks with data', () => {
    const history = emptyHistory();
    const mission = makeMission({ stack: ['React'] });
    expect(getDominantTrendForMission(history, mission)).toBe('stable');
  });

  it('returns the dominant trend across stacks', () => {
    const history = makeHistory([
      makeRecord({ stack: 'react', date: '2026-04-01', average: 500 }),
      makeRecord({ stack: 'react', date: '2026-04-02', average: 560 }), // up
      makeRecord({ stack: 'typescript', date: '2026-04-01', average: 500 }),
      makeRecord({ stack: 'typescript', date: '2026-04-02', average: 560 }), // up
      makeRecord({ stack: 'node', date: '2026-04-01', average: 500 }),
      makeRecord({ stack: 'node', date: '2026-04-02', average: 450 }), // down
    ]);

    const mission = makeMission({ stack: ['React', 'TypeScript', 'Node'] });
    expect(getDominantTrendForMission(history, mission)).toBe('up'); // 2 up, 1 down
  });

  it('returns down when majority of stacks are down', () => {
    const history = makeHistory([
      makeRecord({ stack: 'react', date: '2026-04-01', average: 500 }),
      makeRecord({ stack: 'react', date: '2026-04-02', average: 440 }), // down
      makeRecord({ stack: 'vue', date: '2026-04-01', average: 500 }),
      makeRecord({ stack: 'vue', date: '2026-04-02', average: 440 }), // down
    ]);

    const mission = makeMission({ stack: ['React', 'Vue'] });
    expect(getDominantTrendForMission(history, mission)).toBe('down');
  });
});

// ---------------------------------------------------------------------------
// analyzeTJMHistory
// ---------------------------------------------------------------------------

describe('analyzeTJMHistory', () => {
  it('returns null for empty history', () => {
    expect(analyzeTJMHistory(emptyHistory())).toBeNull();
  });

  it('falls back to statistical split when no records have seniority', () => {
    // 9 records across 9 different stacks, all with seniority: null
    // Averages spread across 300–700 so statistical thirds are clearly separated
    const averages = [300, 350, 400, 450, 500, 550, 600, 650, 700];
    const records = averages.map((avg, i) =>
      makeRecord({
        stack: `stack-${i}`,
        date: '2026-04-01',
        average: avg,
        min: avg,
        max: avg,
        seniority: null,
      })
    );

    const analysis = analyzeTJMHistory(makeHistory(records));
    expect(analysis).not.toBeNull();

    // Statistical thirds of [300..700]: junior=[300,350,400], confirmed=[450,500,550], senior=[600,650,700]
    expect(analysis!.junior).toEqual({ min: 300, max: 400, median: 350 });
    expect(analysis!.confirmed).toEqual({ min: 450, max: 550, median: 500 });
    expect(analysis!.senior).toEqual({ min: 600, max: 700, median: 650 });
  });

  it('uses real seniority grouping when records have seniority data', () => {
    const records = [
      // Junior records — low TJM range
      makeRecord({
        stack: 'react',
        date: '2026-04-01',
        average: 300,
        min: 300,
        max: 300,
        seniority: 'junior',
      }),
      makeRecord({
        stack: 'react',
        date: '2026-04-02',
        average: 350,
        min: 350,
        max: 350,
        seniority: 'junior',
      }),
      makeRecord({
        stack: 'vue',
        date: '2026-04-01',
        average: 400,
        min: 400,
        max: 400,
        seniority: 'junior',
      }),
      // Confirmed records — mid TJM range
      makeRecord({
        stack: 'react',
        date: '2026-04-01',
        average: 450,
        min: 450,
        max: 450,
        seniority: 'confirmed',
      }),
      makeRecord({
        stack: 'react',
        date: '2026-04-02',
        average: 500,
        min: 500,
        max: 500,
        seniority: 'confirmed',
      }),
      makeRecord({
        stack: 'vue',
        date: '2026-04-01',
        average: 550,
        min: 550,
        max: 550,
        seniority: 'confirmed',
      }),
      // Senior records — high TJM range
      makeRecord({
        stack: 'react',
        date: '2026-04-01',
        average: 600,
        min: 600,
        max: 600,
        seniority: 'senior',
      }),
      makeRecord({
        stack: 'react',
        date: '2026-04-02',
        average: 650,
        min: 650,
        max: 650,
        seniority: 'senior',
      }),
      makeRecord({
        stack: 'vue',
        date: '2026-04-01',
        average: 700,
        min: 700,
        max: 700,
        seniority: 'senior',
      }),
    ];

    const analysis = analyzeTJMHistory(makeHistory(records));
    expect(analysis).not.toBeNull();

    // Junior averages: [300, 350, 400] → median 350
    expect(analysis!.junior.median).toBeGreaterThanOrEqual(300);
    expect(analysis!.junior.median).toBeLessThanOrEqual(400);

    // Confirmed averages: [450, 500, 550] → median 500
    expect(analysis!.confirmed.median).toBeGreaterThanOrEqual(450);
    expect(analysis!.confirmed.median).toBeLessThanOrEqual(550);

    // Senior averages: [600, 650, 700] → median 650
    expect(analysis!.senior.median).toBeGreaterThanOrEqual(600);
    expect(analysis!.senior.median).toBeLessThanOrEqual(700);
  });

  it('handles mixed seniority and null records gracefully', () => {
    const records = [
      // Records with real seniority
      makeRecord({
        stack: 'react',
        date: '2026-04-01',
        average: 300,
        min: 300,
        max: 300,
        seniority: 'junior',
      }),
      makeRecord({
        stack: 'react',
        date: '2026-04-02',
        average: 350,
        min: 350,
        max: 350,
        seniority: 'junior',
      }),
      makeRecord({
        stack: 'react',
        date: '2026-04-01',
        average: 450,
        min: 450,
        max: 450,
        seniority: 'confirmed',
      }),
      makeRecord({
        stack: 'vue',
        date: '2026-04-01',
        average: 500,
        min: 500,
        max: 500,
        seniority: 'confirmed',
      }),
      makeRecord({
        stack: 'vue',
        date: '2026-04-01',
        average: 600,
        min: 600,
        max: 600,
        seniority: 'senior',
      }),
      // Records without seniority (legacy data from other connectors)
      makeRecord({
        stack: 'angular',
        date: '2026-04-01',
        average: 800,
        min: 800,
        max: 800,
        seniority: null,
      }),
      makeRecord({
        stack: 'angular',
        date: '2026-04-02',
        average: 850,
        min: 850,
        max: 850,
        seniority: null,
      }),
    ];

    const analysis = analyzeTJMHistory(makeHistory(records));
    expect(analysis).not.toBeNull();

    // Because at least one record has seniority, real grouping is used.
    // Null-seniority records are excluded from the seniority ranges.
    // Junior averages: [300, 350] → {min: 300, max: 350, median: 325}
    expect(analysis!.junior.min).toBe(300);
    expect(analysis!.junior.max).toBe(350);
    expect(analysis!.junior.median).toBe(325);

    // Confirmed averages: [450, 500] → {min: 450, max: 500, median: 475}
    expect(analysis!.confirmed.min).toBe(450);
    expect(analysis!.confirmed.max).toBe(500);
    expect(analysis!.confirmed.median).toBe(475);

    // Senior averages: [600] → {min: 600, max: 600, median: 600}
    expect(analysis!.senior.min).toBe(600);
    expect(analysis!.senior.max).toBe(600);
    expect(analysis!.senior.median).toBe(600);
  });

  it('does not produce senior < junior when senior seniority is missing', () => {
    // BUG REPRO: Only junior/confirmed have real seniority tags.
    // Unknown records (from other connectors) have mixed low TJMs.
    // Old code fell back to the unknown bucket for senior → senior.median < junior.median.
    const records = [
      // FreeWork junior missions (tagged)
      makeRecord({
        stack: 'react',
        date: '2026-04-01',
        average: 400,
        min: 350,
        max: 450,
        seniority: 'junior',
      }),
      makeRecord({
        stack: 'vue',
        date: '2026-04-01',
        average: 420,
        min: 380,
        max: 460,
        seniority: 'junior',
      }),
      // FreeWork confirmed missions (tagged)
      makeRecord({
        stack: 'react',
        date: '2026-04-01',
        average: 520,
        min: 480,
        max: 560,
        seniority: 'confirmed',
      }),
      makeRecord({
        stack: 'vue',
        date: '2026-04-01',
        average: 540,
        min: 500,
        max: 580,
        seniority: 'confirmed',
      }),
      // NO senior-tagged records
      // Other connectors (LeHibou, etc.) — no seniority, mixed TJMs
      makeRecord({
        stack: 'node',
        date: '2026-04-01',
        average: 300,
        min: 280,
        max: 320,
        seniority: null,
      }),
      makeRecord({
        stack: 'python',
        date: '2026-04-01',
        average: 350,
        min: 320,
        max: 380,
        seniority: null,
      }),
      makeRecord({
        stack: 'java',
        date: '2026-04-01',
        average: 500,
        min: 450,
        max: 550,
        seniority: null,
      }),
      makeRecord({
        stack: 'go',
        date: '2026-04-01',
        average: 550,
        min: 510,
        max: 590,
        seniority: null,
      }),
      makeRecord({
        stack: 'rust',
        date: '2026-04-01',
        average: 600,
        min: 560,
        max: 640,
        seniority: null,
      }),
      makeRecord({
        stack: 'scala',
        date: '2026-04-01',
        average: 650,
        min: 610,
        max: 690,
        seniority: null,
      }),
    ];

    const analysis = analyzeTJMHistory(makeHistory(records));
    expect(analysis).not.toBeNull();

    // Core invariant: junior ≤ confirmed ≤ senior
    expect(analysis!.junior.median).toBeLessThanOrEqual(analysis!.confirmed.median);
    expect(analysis!.confirmed.median).toBeLessThanOrEqual(analysis!.senior.median);

    // Senior should use the top third of unknown records, not the whole unknown bucket
    expect(analysis!.senior.median).toBeGreaterThanOrEqual(analysis!.junior.median);
  });

  it('always enforces junior ≤ confirmed ≤ senior ordering', () => {
    // Edge case: seniority data exists but with unusual TJM values
    const records = [
      makeRecord({
        stack: 'react',
        date: '2026-04-01',
        average: 700,
        min: 700,
        max: 700,
        seniority: 'junior',
      }),
      makeRecord({
        stack: 'react',
        date: '2026-04-01',
        average: 400,
        min: 400,
        max: 400,
        seniority: 'confirmed',
      }),
      makeRecord({
        stack: 'react',
        date: '2026-04-01',
        average: 300,
        min: 300,
        max: 300,
        seniority: 'senior',
      }),
    ];

    const analysis = analyzeTJMHistory(makeHistory(records));
    expect(analysis).not.toBeNull();

    // Even with inverted raw data, ordering must be enforced
    expect(analysis!.junior.median).toBeLessThanOrEqual(analysis!.confirmed.median);
    expect(analysis!.confirmed.median).toBeLessThanOrEqual(analysis!.senior.median);
  });
});
