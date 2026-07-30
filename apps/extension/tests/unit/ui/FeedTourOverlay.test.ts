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

  it('uses a literal white text color on the blue CTA for dark-mode contrast', async () => {
    const target = mountOverlay();
    await tick();

    const cta = Array.from(target.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Suivant')
    );

    expect(cta).toBeTruthy();
    // The CTA sits on a blue fill. text-surface-white flips to #1c1917 in dark
    // mode, so we use literal text-white to stay legible in both themes.
    expect(cta!.className).toContain('text-white');
    expect(cta!.className).not.toContain('text-text-900');
  });
});
