import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TJMAnalysis } from '../../../src/lib/core/types/tjm';

const bridgeMock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock('../../../src/lib/shell/messaging/bridge', () => ({
  sendMessage: bridgeMock.sendMessage,
}));

import { getTJMAnalysis } from '../../../src/lib/shell/facades/tjm.facade';

const analysis: TJMAnalysis = {
  trend: 'up',
  confidence: 0.82,
  dataPoints: 3,
  junior: { min: 400, max: 500, median: 450 },
  confirmed: { min: 600, max: 700, median: 650 },
  senior: { min: 750, max: 900, median: 820 },
  trendDetail: 'Le marché monte.',
  recommendation: 'Visez le haut de fourchette.',
  lastUpdated: '2026-05-22',
  topStacks: [
    {
      stack: 'svelte',
      average: 820,
      trend: 'up',
      sampleCount: 3,
      lastUpdated: '2026-05-22',
    },
  ],
  regionInsights: [],
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

  it('surfaces invalid bridge responses', async () => {
    bridgeMock.sendMessage.mockResolvedValue({ type: 'SCAN_COMPLETE', payload: [] });

    await expect(getTJMAnalysis()).rejects.toThrow('TJM analysis load failed.');
  });
});
