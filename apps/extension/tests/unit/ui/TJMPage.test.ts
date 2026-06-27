import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick } from 'svelte';
import type { TJMAnalysis } from '../../../src/lib/core/types/tjm';

const getTJMAnalysis = vi.hoisted(() => vi.fn());
const getProfile = vi.hoisted(() => vi.fn());
const subscribeMessages = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/shell/facades/tjm.facade', () => ({ getTJMAnalysis }));
vi.mock('../../../src/lib/shell/facades/settings.facade', () => ({ getProfile }));
vi.mock('../../../src/lib/shell/messaging/bridge', () => ({
  subscribeMessages,
  sendMessage: vi.fn(),
}));

import TJMPage from '../../../src/ui/pages/TJMPage.svelte';

const analysis: TJMAnalysis = {
  trend: 'up',
  confidence: 0.8,
  dataPoints: 20,
  junior: { min: 400, max: 500, median: 450 },
  confirmed: { min: 600, max: 700, median: 650 },
  senior: { min: 750, max: 900, median: 820 },
  trendDetail: null,
  recommendation: null,
  lastUpdated: '2026-05-22',
  topStacks: [],
  regionInsights: [
    {
      region: 'ile-de-france',
      label: 'Île-de-France',
      average: 700,
      min: 600,
      max: 800,
      sampleCount: 5,
      trend: 'up',
    },
    {
      region: 'lyon',
      label: 'Lyon',
      average: 620,
      min: 550,
      max: 700,
      sampleCount: 3,
      trend: 'stable',
    },
  ],
};

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('TJMPage region filter (TJM-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    getTJMAnalysis.mockResolvedValue(analysis);
    getProfile.mockResolvedValue(null);
    subscribeMessages.mockReturnValue(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('populates the region selector from the analysis and passes the region to getTJMAnalysis', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(TJMPage, { target });
    await tick();
    await flush();

    const select = target.querySelector('#tjm-region-filter') as HTMLSelectElement;
    expect(select, 'region selector should be rendered').not.toBeNull();
    expect([...select.options].map((o) => o.value)).toContain('lyon');

    // Initial (unfiltered) load has no region.
    expect(getTJMAnalysis).toHaveBeenLastCalledWith(undefined, undefined);

    select.value = 'lyon';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    await tick();

    expect(getTJMAnalysis).toHaveBeenLastCalledWith(undefined, 'lyon');
  });
});
