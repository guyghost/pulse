import { beforeEach, describe, expect, it } from 'vitest';
import { mount, tick } from 'svelte';
import FeedTourOverlay, {
  type FeedTourStep,
} from '../../../src/ui/molecules/FeedTourOverlay.svelte';

const step: FeedTourStep = {
  id: 'score',
  title: 'La pertinence en premier',
  description: 'Chaque mission affiche un score.',
};

function mountOverlay(props: Record<string, unknown> = {}): HTMLDivElement {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(FeedTourOverlay, {
    target,
    props: {
      step,
      stepIndex: 0,
      totalSteps: 4,
      onNext: () => {},
      onSkip: () => {},
      ...props,
    },
  });
  return target;
}

describe('FeedTourOverlay CTA token', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('uses a valid surface-white text token on the blue CTA for contrast', async () => {
    const target = mountOverlay();
    await tick();

    const cta = Array.from(target.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Suivant')
    );

    expect(cta).toBeTruthy();
    // FEED-04: text-text-900 has no matching @theme token; the blue CTA needs
    // an explicit, theme-valid light text color.
    expect(cta!.className).toContain('text-surface-white');
    expect(cta!.className).not.toContain('text-text-900');
  });
});
