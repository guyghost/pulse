import { expect, it } from 'vitest';
import { mount, unmount } from 'svelte';
import TJMSampleDashboard from '../../../src/ui/organisms/TJMSampleDashboard.svelte';
import type { TJMSampleAnalysis } from '../../../src/lib/core/types/tjm';
it('rounds fractional medians and averages to whole euros without duplicating the currency', async () => {
  const analysis: TJMSampleAnalysis = {
    total: 2,
    priced: 2,
    withoutTjm: 0,
    range: { min: 600, max: 601, median: 600.5 },
    firstObservedAt: null,
    lastUpdated: null,
    unknown: { category: 0, seniority: 0, remote: 0, region: 0 },
    sources: [],
    levels: [],
    legacy: { recordCount: 1, series: [{ date: '2026-10-01', average: 600.5 }] },
  };
  const target = document.createElement('div');
  const instance = mount(TJMSampleDashboard, { target, props: { analysis } });
  expect(target.querySelector('[data-testid="tjm-sample-median"]')?.textContent?.trim()).toBe(
    '601 €/j'
  );
  expect(target.textContent).toContain('moyenne agrégée 601 €/j');
  expect(target.textContent).not.toContain('600,5');
  expect(target.textContent).not.toContain('€ €/j');
  await unmount(instance);
});
