import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mission } from '../../../src/lib/core/types/mission';
import { addRecords } from '../../../src/lib/core/tjm-history';
import { deduplicateMissionsDetailed } from '../../../src/lib/core/scoring/dedup';
import { analyzeTJMObservations } from '../../../src/lib/core/tjm-history/observations';
import {
  extractMissionObservations as extractObservations,
  clearTJMHistory,
  loadTJMHistory,
  recordTJMFromMissions,
  saveTJMHistory,
} from '../../../src/lib/shell/storage/tjm-history';

const mission: Mission = {
  id: 'mission-a',
  title: 'Annonce',
  client: null,
  description: '',
  stack: [],
  tjm: null,
  location: null,
  remote: null,
  duration: null,
  startDate: null,
  publishedAt: null,
  url: 'https://example.com/a',
  source: 'free-work',
  scrapedAt: new Date('2026-08-01T10:15:00Z'),
  seniority: null,
  scoreBreakdown: null,
  score: null,
  semanticScore: null,
  semanticReason: null,
};
let stored: Record<string, unknown>;
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-01T12:00:00Z').getTime());
  stored = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async () => structuredClone(stored)),
        set: vi.fn(async (value: Record<string, unknown>) => {
          stored = { ...stored, ...structuredClone(value) };
        }),
        remove: vi.fn(async (key: string) => {
          delete stored[key];
        }),
      },
    },
  });
});

describe('TJM history persistence', () => {
  it('migrates legacy fields and retains valid observations while rejecting malformed entries', async () => {
    stored.tjm_history = {
      records: [
        { stack: 'react', date: '2026-07-01', min: 400, max: 700, average: 500, sampleCount: 3 },
        null,
      ],
      observations: [...extractObservations([mission]), { identity: 'invalid' }],
    };
    const history = await loadTJMHistory();
    expect(history.records).toHaveLength(1);
    expect(history.records[0]).toMatchObject({ seniority: null, region: null });
    expect(history.observations).toHaveLength(1);
    expect(history.observations?.[0].observedAt).toBe('2026-08-01T10:15:00.000Z');
    await saveTJMHistory(addRecords(history, []));
    expect(await loadTJMHistory()).toEqual(history);
  });

  it('records announcements with no tariff and no stack, retaining the actual scrape date', async () => {
    await recordTJMFromMissions([mission], '2026-10-01');
    const history = await loadTJMHistory();
    expect(history.records).toEqual([]);
    expect(history.observations?.[0]).toMatchObject({
      tjm: null,
      stacks: [],
      observedAt: '2026-08-01T10:15:00.000Z',
    });
  });

  it('retains the same source population for a combined scan and separate scans after feed deduplication', async () => {
    const priced: Mission = {
      ...mission,
      id: 'lh-a',
      title: 'Développeur React TypeScript',
      client: 'Acme',
      stack: ['React', 'TypeScript'],
      location: 'Lyon',
      remote: 'hybrid',
      source: 'lehibou',
      url: 'https://www.lehibou.com/annonce/a',
      tjm: 600,
      scrapedAt: new Date('2026-09-30T12:00:00Z'),
      seniority: 'senior',
      classification: {
        category: 'frontend',
        remoteCompatible: true,
        confidence: 1,
        classifiedAt: 1,
      },
    };
    const unpriced: Mission = {
      ...priced,
      id: 'fw-b',
      source: 'free-work',
      url: 'https://www.free-work.com/fr/tech-it/react/job-mission/b',
      tjm: null,
      seniority: null,
      classification: null,
    };
    const sourceMissions = [priced, unpriced];
    const combinedFeed = deduplicateMissionsDetailed(sourceMissions);
    expect(combinedFeed.missions).toHaveLength(1);
    expect(combinedFeed.duplicateRelations).toHaveLength(1);

    await recordTJMFromMissions(combinedFeed.missions, '2026-10-01', sourceMissions);
    const combinedHistory = await loadTJMHistory();
    const now = new Date('2026-10-01T12:00:00Z');
    const combined = analyzeTJMObservations(combinedHistory, {}, now);

    await clearTJMHistory();
    for (const sourceMission of sourceMissions) {
      const singleFeed = deduplicateMissionsDetailed([sourceMission]);
      await recordTJMFromMissions(singleFeed.missions, '2026-10-01', [sourceMission]);
    }
    const separate = analyzeTJMObservations(await loadTJMHistory(), {}, now);
    expect(combined).toMatchObject({
      total: 2,
      priced: 1,
      withoutTjm: 1,
      range: { median: 600 },
      unknown: { category: 1, seniority: 1, remote: 0, region: 0 },
      sources: [
        { source: 'free-work', count: 1 },
        { source: 'lehibou', count: 1 },
      ],
    });
    expect(separate).toEqual(combined);
    expect(combinedHistory.records.every((record) => record.sampleCount === 1)).toBe(true);
    expect(combinedHistory.observations).toHaveLength(2);
    expect(
      combinedHistory.observations?.every(
        (observation) => observation.observedAt === '2026-09-30T12:00:00.000Z'
      )
    ).toBe(true);
    expect(
      combinedHistory.observations?.find((observation) => observation.source === 'free-work')
    ).toMatchObject({ tjm: null, category: null, seniority: null });
  });

  it('serializes concurrent scan effects so neither observation is lost', async () => {
    await Promise.all([
      recordTJMFromMissions([mission], '2026-10-01'),
      recordTJMFromMissions([{ ...mission, id: 'b', url: 'https://example.com/b' }], '2026-10-01'),
    ]);
    expect((await loadTJMHistory()).observations).toHaveLength(2);
    await recordTJMFromMissions([mission], '2026-10-01');
    expect((await loadTJMHistory()).observations).toHaveLength(2);
  });

  it('recovers after a failed storage write without preventing the next recording', async () => {
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('quota'));
    await expect(recordTJMFromMissions([mission], '2026-10-01')).rejects.toThrow('quota');
    await recordTJMFromMissions([mission], '2026-10-01');
    expect((await loadTJMHistory()).observations).toHaveLength(1);
  });
});
