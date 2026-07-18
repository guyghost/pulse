import { beforeEach, describe, expect, it } from 'vitest';
import { mount, tick } from 'svelte';
import type { TJMAnalysis } from '../../../src/lib/core/types/tjm';
import TJMDashboard from '../../../src/ui/organisms/TJMDashboard.svelte';

const analysis: TJMAnalysis = {
  trend: 'up',
  confidence: 0.82,
  dataPoints: 24,
  junior: { min: 400, max: 500, median: 450 },
  confirmed: { min: 600, max: 700, median: 650 },
  senior: { min: 750, max: 900, median: 820 },
  trendDetail: 'Le marché monte.',
  recommendation: 'Visez le haut de fourchette.',
  lastUpdated: '2026-05-22',
  topStacks: [
    { stack: 'svelte', average: 820, trend: 'up', sampleCount: 3, lastUpdated: '2026-05-22' },
  ],
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
      average: 650,
      min: 550,
      max: 750,
      sampleCount: 4,
      trend: 'stable',
    },
  ],
};

function mountDashboard(props: Record<string, unknown> = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(TJMDashboard, {
    target,
    props: {
      analysis,
      userSeniority: 'confirmed',
      onRetry: () => {},
      onOpenProfile: () => {},
      onOpenFeed: () => {},
      ...props,
    },
  });
  return target;
}

function text(target: HTMLElement): string {
  return target.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('TJMDashboard inverted target validation (TJM-02)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a validation state instead of a misleading positioning when tjmMin > tjmMax', async () => {
    const target = mountDashboard({ userTjmMin: 700, userTjmMax: 400 });
    await tick();

    const rendered = text(target);

    expect(rendered).toContain('Fourchette invalide');
    expect(rendered).toContain('inversée');
    expect(rendered).toContain('700€');
    expect(rendered).toContain('400€');
    // The positioning card (which derives a median/écart) must stay hidden.
    expect(rendered).not.toContain('Votre positionnement');
    expect(rendered).toContain('Invalide');
  });

  it('renders the positioning card for a coherent target', async () => {
    const target = mountDashboard({ userTjmMin: 600, userTjmMax: 700 });
    await tick();

    const rendered = text(target);

    expect(rendered).toContain('Votre positionnement');
    expect(rendered).not.toContain('Fourchette invalide');
  });

  it('expose les régions dans une structure sémantique stable', async () => {
    const target = mountDashboard();
    await tick();

    const regions = target.querySelectorAll('section[aria-label="TJM par région"]');
    expect(regions).toHaveLength(1);
    expect(regions[0].querySelectorAll(':scope > h3')).toHaveLength(1);
    expect(regions[0].querySelector(':scope > h3')?.textContent?.trim()).toBe('TJM par région');

    const list = regions[0].querySelector('ul[aria-label="Régions analysées"]');
    const items = list?.querySelectorAll(':scope > li') ?? [];
    expect(items).toHaveLength(2);
    expect(Array.from(items, (item) => item.querySelector('h4')?.textContent?.trim())).toEqual([
      'Île-de-France',
      'Lyon',
    ]);
  });

  it('limite la liste sémantique aux résultats de l’analyse filtrée', async () => {
    const filteredAnalysis: TJMAnalysis = {
      ...analysis,
      dataPoints: 2,
      regionInsights: [analysis.regionInsights![0]],
    };
    const target = mountDashboard({ analysis: filteredAnalysis });
    await tick();

    const list = target.querySelector(
      'section[aria-label="TJM par région"] ul[aria-label="Régions analysées"]'
    );
    const headings = list?.querySelectorAll(':scope > li h4') ?? [];
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent?.trim()).toBe('Île-de-France');
  });
});
