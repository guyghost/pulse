import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mission } from '../../../src/lib/core/types/mission';
import { addRecords } from '../../../src/lib/core/tjm-history';
import { extractObservations } from '../../../src/lib/core/tjm-history/observations';
import {
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
