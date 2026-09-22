import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, tick } from 'svelte';
import CatchUpBriefingBanner from '../../../src/ui/molecules/CatchUpBriefingBanner.svelte';
import type { CatchUpBriefing } from '$lib/core/feed/catch-up-briefing';

function mountBanner(props: {
  briefing?: CatchUpBriefing | null;
  waveActive?: boolean;
  onShowWave?: () => void;
  onExitWave?: () => void;
}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(CatchUpBriefingBanner, {
    target,
    props: {
      briefing: null,
      ...props,
    },
  });
  return target;
}

describe('CatchUpBriefingBanner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('ne rend rien lorsque briefing est null', async () => {
    const target = mountBanner({ briefing: null });
    await tick();
    expect(target.querySelector('[data-testid="catch-up-briefing"]')).toBeNull();
  });

  it('affiche le résumé avec le TJM moyen formaté via formatTJM', async () => {
    const briefing: CatchUpBriefing = {
      count: 4,
      gradeA: 2,
      meanTjm: 1200,
      topMission: {
        id: 'top-1',
        title: 'Lead Architect Svelte',
        score: 95,
      },
      waveMissionIds: ['top-1', 'm-2', 'm-3', 'm-4'],
    };

    const target = mountBanner({ briefing, waveActive: false });
    await tick();

    const banner = target.querySelector('[data-testid="catch-up-briefing"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('4 nouvelles missions depuis votre dernière visite');
    expect(banner?.textContent).toContain('2 pépites');
    // Vérifie le formatage locale fr-FR avec espace fine
    expect(banner?.textContent).toMatch(/TJM moyen 1[\s\u202F]200 €\/j/);
    expect(banner?.textContent).toContain('Top : Lead Architect Svelte');
  });

  it('appelle onShowWave au clic sur le bouton voir la vague', async () => {
    const onShowWave = vi.fn();
    const briefing: CatchUpBriefing = {
      count: 3,
      gradeA: 1,
      meanTjm: 650,
      topMission: null,
      waveMissionIds: ['m-1', 'm-2', 'm-3'],
    };

    const target = mountBanner({ briefing, waveActive: false, onShowWave });
    await tick();

    const btn = target.querySelector('button');
    expect(btn).not.toBeNull();
    btn?.click();
    await tick();

    expect(onShowWave).toHaveBeenCalledTimes(1);
  });
});
