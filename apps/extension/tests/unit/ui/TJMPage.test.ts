import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import type { TJMSampleAnalysis } from '../../../src/lib/core/types/tjm';

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
import TJMPageActivationStub from './TJMPageActivationStub.svelte';

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

    // Initial (unfiltered) load has no region and the default period 'all'.
    expect(getTJMAnalysis).toHaveBeenLastCalledWith(undefined, undefined, 'all', {});

    select.value = 'lyon';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    await tick();

    expect(getTJMAnalysis).toHaveBeenLastCalledWith(undefined, 'lyon', 'all', {});
  });

  it('passes the selected period to getTJMAnalysis when a preset is chosen', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(TJMPage, { target });
    await tick();
    await flush();

    const group = target.querySelector('[role="radiogroup"][aria-label*="Période"]');
    expect(group, 'period radiogroup should be rendered').not.toBeNull();

    const radios = [...group.querySelectorAll('[role="radio"]')];
    expect(radios.map((r) => r.textContent.trim())).toEqual(['7 jours', '30 jours', 'Tout']);
    expect(
      radios.map((r) => r.getAttribute('aria-checked')),
      'default period is "Tout"'
    ).toEqual(['false', 'false', 'true']);

    radios.find((r) => r.textContent.trim() === '7 jours')?.click();
    await flush();
    await tick();

    expect(getTJMAnalysis).toHaveBeenLastCalledWith(undefined, undefined, '7d', {});
    expect(
      group.querySelector('[data-period-option="7d"]')?.getAttribute('aria-checked'),
      'aria-checked follows the selection'
    ).toBe('true');
  });

  it('ignores a repeated selection of the already active period (no duplicate request)', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(TJMPage, { target });
    await tick();
    await flush();

    const group = target.querySelector('[role="radiogroup"][aria-label*="Période"]');
    const callCountBefore = getTJMAnalysis.mock.calls.length;

    group.querySelector('[data-period-option="all"]')?.click();
    await flush();
    await tick();

    expect(getTJMAnalysis.mock.calls.length).toBe(callCountBefore);
  });

  it('shows the profile as incomplete until both the floor and seniority are set', async () => {
    getProfile.mockResolvedValue({
      tjmMin: 500,
      tjmMax: null,
      keywords: [],
      seniority: null,
    });
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(TJMPage, { target });
    await tick();
    await flush();

    expect(target.textContent).toContain('Profil à définir');
  });

  it('treats a profile with a TJM floor and no ceiling as calibrated', async () => {
    getProfile.mockResolvedValue({
      tjmMin: 500,
      tjmMax: null,
      keywords: [],
      seniority: 'senior',
    });
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(TJMPage, { target });
    await tick();
    await flush();

    expect(target.textContent).toContain('Profil calibré');
  });

  it('resets period and region to their defaults when the page becomes active again', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const stub = mount(TJMPageActivationStub, { target });
    await tick();
    await flush();

    const group = target.querySelector('[role="radiogroup"][aria-label*="Période"]');
    group.querySelector('[data-period-option="7d"]')?.click();
    await flush();
    await tick();
    expect(getTJMAnalysis).toHaveBeenLastCalledWith(undefined, undefined, '7d', {});

    // Pages stay mounted under `inert`; leaving and coming back must restore
    // the default period (models/tjm-analysis-period.model.md).
    stub.setActive(false);
    await tick();
    stub.setActive(true);
    await tick();
    await flush();

    expect(getTJMAnalysis).toHaveBeenLastCalledWith(undefined, undefined, 'all', {});
    expect(
      group.querySelector('[data-period-option="all"]')?.getAttribute('aria-checked'),
      'period resets to "Tout" on re-activation'
    ).toBe('true');
  });
});

describe('TJM sample states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    getProfile.mockResolvedValue(null);
    subscribeMessages.mockReturnValue(() => {});
  });

  it('keeps absent groups empty and formats fractional medians in French', async () => {
    getTJMAnalysis.mockResolvedValue({ ...analysis, range: { min: 400, max: 601, median: 500.5 } });
    const target = document.createElement('div');
    const page = mount(TJMPage, { target });
    await tick();
    await flush();
    expect(target.querySelector('[data-testid="tjm-sample-median"]')?.textContent).toContain(
      '500,5'
    );
    expect(target.textContent).toContain('Aucun tarif renseigné');
    expect(target.textContent).not.toMatch(/(?:^|\s)0 €\/j/);
    await unmount(page);
  });

  it('renders an explicit read error and permits a successful retry', async () => {
    getTJMAnalysis.mockResolvedValueOnce(null).mockResolvedValue(analysis);
    const target = document.createElement('div');
    const page = mount(TJMPage, { target });
    await tick();
    await flush();
    expect(target.querySelector('[role="alert"]')?.textContent).toContain('Impossible de lire');
    target.querySelector<HTMLButtonElement>('[role="alert"] button')?.click();
    await flush();
    await tick();
    expect(target.querySelector('[data-testid="tjm-sample-total"]')?.textContent).toBe('3');
    await unmount(page);
  });

  it('discards late responses when filters change quickly and carries every segment', async () => {
    getTJMAnalysis.mockResolvedValue(analysis);
    const target = document.createElement('div');
    const page = mount(TJMPage, { target });
    await tick();
    await flush();
    let resolveEarlier: ((value: TJMSampleAnalysis) => void) | undefined;
    getTJMAnalysis.mockImplementationOnce(
      () =>
        new Promise<TJMSampleAnalysis>((resolve) => {
          resolveEarlier = resolve;
        })
    );
    const category = target.querySelector<HTMLSelectElement>('#tjm-category-filter')!;
    category.value = 'frontend';
    category.dispatchEvent(new Event('change', { bubbles: true }));
    const empty = {
      ...analysis,
      total: 0,
      priced: 0,
      withoutTjm: 0,
      range: null,
      sources: [],
      levels: [],
    };
    getTJMAnalysis.mockResolvedValueOnce(empty);
    const seniority = target.querySelector<HTMLSelectElement>('#tjm-seniority-filter')!;
    seniority.value = 'junior';
    seniority.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    await tick();
    expect(getTJMAnalysis).toHaveBeenLastCalledWith(undefined, undefined, 'all', {
      category: 'frontend',
      seniority: 'junior',
    });
    expect(target.textContent).toContain('Aucune annonce pour ce segment');
    resolveEarlier?.(analysis);
    await flush();
    await tick();
    expect(target.textContent).toContain('Aucune annonce pour ce segment');
    expect(target.querySelector('[data-testid="tjm-sample-median"]')).toBeNull();
    await unmount(page);
  });
});
