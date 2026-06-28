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
});
