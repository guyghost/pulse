import { describe, expect, it } from 'vitest';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { TJMHistory, TJMObservation } from '../../../src/lib/core/types/tjm';
import {
  addObservations,
  analyzeTJMObservations,
  extractObservations as extractNormalizedObservations,
} from '../../../src/lib/core/tjm-history/observations';
import { addRecords } from '../../../src/lib/core/tjm-history';
import { validateMessage } from '../../../src/lib/shell/messaging/schemas';

const extractObservations = (missions: Mission[]) =>
  extractNormalizedObservations(
    missions,
    missions.map((mission) =>
      Number.isFinite(mission.scrapedAt.getTime()) ? mission.scrapedAt.toISOString() : null
    )
  );
const now = new Date('2026-10-01T12:00:00Z');
const observation = (
  identity: string,
  overrides: Partial<TJMObservation> = {}
): TJMObservation => ({
  identity,
  observedAt: '2026-09-30T12:00:00Z',
  source: 'free-work',
  stacks: ['react', 'typescript'],
  tjm: 500,
  category: 'frontend',
  seniority: 'senior',
  remote: 'full',
  region: 'lyon',
  ...overrides,
});
const history = (...observations: TJMObservation[]): TJMHistory => ({ records: [], observations });
const mission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'scan-1',
  title: 'React',
  client: null,
  description: '',
  stack: ['React', 'react', ' TypeScript '],
  tjm: 600,
  location: 'Lyon',
  remote: 'full',
  duration: null,
  startDate: null,
  publishedAt: null,
  url: 'https://example.com/jobs/1?utm_source=test#details',
  source: 'free-work',
  scrapedAt: new Date('2026-09-29T13:15:00Z'),
  seniority: null,
  scoreBreakdown: null,
  score: null,
  semanticScore: null,
  semanticReason: null,
  ...overrides,
});

describe('identifiable TJM observations', () => {
  it('uses real scrape dates, independent geography and actual supplied dimensions', () => {
    const [result] = extractObservations([mission()]);
    expect(result).toMatchObject({
      observedAt: '2026-09-29T13:15:00.000Z',
      category: null,
      seniority: null,
      remote: 'full',
      region: 'lyon',
      stacks: ['react', 'typescript'],
    });
    const [unknown] = extractObservations([
      mission({
        remote: null,
        location: null,
        classification: {
          category: 'frontend',
          remoteCompatible: true,
          confidence: 1,
          classifiedAt: now.getTime(),
        },
      }),
    ]);
    expect(unknown).toMatchObject({ category: 'frontend', remote: null, region: null });
  });

  it('deduplicates repeat scans, account IDs, tracking URLs and multiple stacks', () => {
    const observations = extractObservations([
      mission(),
      mission({
        id: 'scan-2-account-2',
        url: 'https://example.com/jobs/1/',
        scrapedAt: new Date('2026-09-30T12:00:00Z'),
        tjm: 700,
      }),
      mission({ id: 'other', url: 'https://example.com/jobs/2', tjm: null }),
    ]);
    const result = analyzeTJMObservations(
      history(...observations),
      { profileStacks: ['React', 'TypeScript'] },
      now
    );
    expect(result).toMatchObject({ total: 2, priced: 1, withoutTjm: 1, range: { median: 700 } });
    expect(result.sources).toEqual([{ source: 'free-work', count: 2 }]);
  });

  it('preserves meaningful URL query identity and excludes invalid dates without fabricating dates', () => {
    const observations = extractObservations([
      mission({ url: 'https://example.com/job?id=1' }),
      mission({ url: 'https://example.com/job?id=2' }),
      mission({ scrapedAt: new Date('invalid') }),
    ]);
    expect(analyzeTJMObservations(history(...observations), {}, now).total).toBe(2);
  });

  it('falls back to external identity for malformed URLs without losing the announcement', () => {
    const observations = extractObservations([
      mission({ id: 'scan-1', externalId: 'external-1', url: 'invalid' }),
      mission({ id: 'scan-2', externalId: 'external-1', url: '' }),
    ]);
    expect(analyzeTJMObservations(history(...observations), {}, now).total).toBe(1);
  });

  it('calculates the true median and denominator, including announcements with no stack or tariff', () => {
    const result = analyzeTJMObservations(
      history(
        observation('a', { tjm: 100 }),
        observation('b', { tjm: 201 }),
        observation('c', { tjm: 600 }),
        observation('d', { tjm: 1000 }),
        observation('e', { tjm: null, stacks: [] })
      ),
      {},
      now
    );
    expect(result).toMatchObject({
      total: 5,
      priced: 4,
      withoutTjm: 1,
      range: { min: 100, max: 1000, median: 400.5 },
    });
  });

  it('intersects every dimension and excludes unknowns from precise segments', () => {
    const input = history(
      observation('match'),
      observation('other-role', { category: 'backend' }),
      observation('other-experience', { seniority: 'junior' }),
      observation('other-mode', { remote: 'hybrid' }),
      observation('other-region', { region: 'lille' }),
      observation('other-stack', { stacks: ['java'] }),
      observation('old', { observedAt: '2026-09-01T12:00:00Z' }),
      observation('unknown', {
        category: null,
        seniority: null,
        remote: null,
        region: null,
        tjm: null,
      })
    );
    expect(
      analyzeTJMObservations(
        input,
        {
          category: 'frontend',
          seniority: 'senior',
          remote: 'full',
          region: 'lyon',
          profileStacks: ['REACT'],
          period: '7d',
        },
        now
      ).total
    ).toBe(1);
    const unknown = analyzeTJMObservations(
      input,
      { category: 'unknown', seniority: 'unknown', remote: 'unknown', region: 'unknown' },
      now
    );
    expect(unknown).toMatchObject({
      total: 1,
      priced: 0,
      withoutTjm: 1,
      range: null,
      unknown: { category: 1, seniority: 1, remote: 1, region: 1 },
    });
  });

  it('keeps the latest snapshot before applying dimensions rather than reviving stale tags', () => {
    const result = analyzeTJMObservations(
      history(
        observation('same', { category: 'frontend', observedAt: '2026-09-20T12:00:00Z' }),
        observation('same', { category: 'backend', observedAt: '2026-09-30T12:00:00Z' })
      ),
      { category: 'frontend' },
      now
    );
    expect(result.total).toBe(0);
    expect(result.range).toBeNull();
  });

  it('includes the rolling-window boundary and excludes future observations even for all-time', () => {
    const input = history(
      observation('boundary', { observedAt: '2026-09-24T12:00:00Z' }),
      observation('too-old', { observedAt: '2026-09-24T11:59:59Z' }),
      observation('future', { observedAt: '2026-10-02T12:00:00Z' })
    );
    expect(analyzeTJMObservations(input, { period: '7d' }, now).total).toBe(1);
    expect(analyzeTJMObservations(input, {}, now).total).toBe(2);
  });

  it('never reconstructs announcements or seniority medians from legacy means', () => {
    const input: TJMHistory = {
      records: [
        {
          stack: 'react',
          date: '2026-09-30',
          average: 800,
          min: 100,
          max: 1000,
          sampleCount: 1000,
          region: null,
          seniority: null,
        },
      ],
    };
    const empty = analyzeTJMObservations(input, {}, now);
    expect(empty).toMatchObject({
      total: 0,
      range: null,
      legacy: { recordCount: 1, series: [{ date: '2026-09-30', average: 800 }] },
    });
    expect(empty.levels.every((level) => level.population.range === null)).toBe(true);
    const inputWithUnknown = addObservations(
      input,
      [observation('unknown', { seniority: null })],
      now.getTime()
    );
    expect(addRecords(inputWithUnknown, []).observations).toEqual(inputWithUnknown.observations);
    const result = analyzeTJMObservations(inputWithUnknown, {}, now);
    expect(
      result.levels.find((level) => level.seniority === 'senior')?.population.range
    ).toBeNull();
    expect(
      result.levels.find((level) => level.seniority === 'unknown')?.population.range?.median
    ).toBe(500);
  });

  it('upserts exact snapshots without losing legacy records or previous observations', () => {
    const updated = addObservations(
      history(observation('a')),
      [observation('a', { tjm: 900 }), observation('b')],
      now.getTime()
    );
    expect(updated.observations).toHaveLength(2);
    expect(updated.observations?.[0].tjm).toBe(900);
  });

  it('validates the full response and all segment dimensions through the bridge schema', () => {
    const analysis = analyzeTJMObservations(history(observation('a')), {}, now);
    expect(validateMessage({ type: 'TJM_ANALYSIS_RESULT', payload: { analysis } }).valid).toBe(
      true
    );
    expect(
      validateMessage({
        type: 'GET_TJM_ANALYSIS',
        payload: {
          category: 'frontend',
          seniority: 'unknown',
          remote: 'full',
          region: 'unknown',
          period: '30d',
        },
      }).valid
    ).toBe(true);
    for (const payload of [
      { category: 'engineer' },
      { seniority: 'expert' },
      { remote: 'compatible' },
    ]) {
      expect(validateMessage({ type: 'GET_TJM_ANALYSIS', payload }).valid).toBe(false);
    }
    expect(
      validateMessage({
        type: 'TJM_ANALYSIS_RESULT',
        payload: { analysis: { ...analysis, range: { median: 0, min: 0, max: 0 } } },
      }).valid
    ).toBe(false);
  });
});

describe('TJM retention', () => {
  it('keeps only the latest daily snapshot and drops expired or future observations', () => {
    const input = history(
      observation('a', { observedAt: '2026-09-30T01:00:00.000Z', tjm: 400 }),
      observation('a', { observedAt: '2026-09-30T18:00:00.000Z', tjm: 800 }),
      observation('old', { observedAt: '2026-01-01T00:00:00.000Z' }),
      observation('future', { observedAt: '2027-01-01T00:00:00.000Z' })
    );
    const result = addObservations(input, [], now.getTime());
    expect(result.observations).toHaveLength(1);
    expect(result.observations?.[0].tjm).toBe(800);
    expect(input.observations).toHaveLength(4);
  });
  it('caps observation count and total UTF-8 bytes, including legacy records', () => {
    const lots = Array.from({ length: 6_000 }, (_, i) => observation(String(i)));
    const result = addObservations(history(), lots, now.getTime());
    expect(result.observations?.length).toBeLessThanOrEqual(5_000);
    const huge = lots.map((item) => ({ ...item, stacks: ['é'.repeat(10_000)] }));
    const budgeted = addObservations(history(), huge, now.getTime());
    expect(new TextEncoder().encode(JSON.stringify(budgeted)).byteLength).toBeLessThanOrEqual(
      2_000_000
    );
    expect(budgeted.observations?.length).toBeGreaterThan(0);
  });
  it('takes the observation date exclusively from the injected normalized value', () => {
    expect(
      extractNormalizedObservations([mission()], ['2026-01-01T00:00:00.000Z'])[0].observedAt
    ).toBe('2026-01-01T00:00:00.000Z');
    expect(extractNormalizedObservations([mission()], [null])).toEqual([]);
  });
});
