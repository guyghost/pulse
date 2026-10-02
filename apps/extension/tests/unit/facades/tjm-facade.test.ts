import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TJMSampleAnalysis } from '../../../src/lib/core/types/tjm';

const bridgeMock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock('../../../src/lib/shell/messaging/bridge', () => ({
  sendMessage: bridgeMock.sendMessage,
}));

import { getTJMAnalysis } from '../../../src/lib/shell/facades/tjm.facade';

const analysis: TJMSampleAnalysis = {
  total: 3,
  priced: 2,
  withoutTjm: 1,
  range: { min: 500, max: 700, median: 600 },
  lastUpdated: '2026-05-22',
  firstObservedAt: '2026-05-20',
  unknown: { category: 1, seniority: 1, remote: 1, region: 0 },
  sources: [{ source: 'free-work', count: 3 }],
  levels: [
    { seniority: 'junior', population: { total: 0, priced: 0, withoutTjm: 0, range: null } },
    {
      seniority: 'senior',
      population: {
        total: 3,
        priced: 2,
        withoutTjm: 1,
        range: { min: 500, max: 700, median: 600 },
      },
    },
  ],
  legacy: { recordCount: 0, series: [] },
};

describe('tjm facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads TJM analysis through the service worker bridge', async () => {
    bridgeMock.sendMessage.mockResolvedValue({
      type: 'TJM_ANALYSIS_RESULT',
      payload: { analysis },
    });

    await expect(getTJMAnalysis(['Svelte'], 'remote')).resolves.toEqual(analysis);
    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({
      type: 'GET_TJM_ANALYSIS',
      payload: { profileStacks: ['Svelte'], region: 'remote' },
    });
  });

  it('forwards all intersected segments without replacing unknown dimensions', async () => {
    bridgeMock.sendMessage.mockResolvedValue({
      type: 'TJM_ANALYSIS_RESULT',
      payload: { analysis },
    });
    await getTJMAnalysis(['React'], 'lyon', '7d', {
      category: 'unknown',
      seniority: 'senior',
      remote: 'full',
    });
    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({
      type: 'GET_TJM_ANALYSIS',
      payload: {
        profileStacks: ['React'],
        region: 'lyon',
        period: '7d',
        category: 'unknown',
        seniority: 'senior',
        remote: 'full',
      },
    });
  });

  it('surfaces invalid bridge responses', async () => {
    bridgeMock.sendMessage.mockResolvedValue({ type: 'SCAN_COMPLETE', payload: [] });

    await expect(getTJMAnalysis()).rejects.toThrow('Impossible de charger l’analyse TJM.');
  });
});
