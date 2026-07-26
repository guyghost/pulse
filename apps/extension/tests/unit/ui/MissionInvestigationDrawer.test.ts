import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import MissionInvestigationDrawer from '../../../src/ui/organisms/MissionInvestigationDrawer.svelte';
import type { Mission } from '$lib/core/types/mission';

const mission: Mission = {
  id: 'mission-investigation',
  title: 'Lead Svelte',
  client: 'MissionPulse',
  description: 'Une mission de test.',
  stack: ['Svelte', 'TypeScript'],
  tjm: 750,
  location: 'Paris',
  remote: 'hybrid',
  duration: '6 mois',
  startDate: null,
  publishedAt: null,
  url: 'https://example.com/mission',
  source: 'free-work',
  scrapedAt: new Date('2026-07-16T10:00:00.000Z'),
  seniority: 'senior',
  score: 90,
  scoreBreakdown: null,
  semanticScore: null,
  semanticReason: null,
};

describe('MissionInvestigationDrawer modal focus', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses close, traps backwards Tab, closes on Escape and restores the trigger', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Investiguer';
    document.body.appendChild(trigger);
    trigger.focus();

    const target = document.createElement('div');
    document.body.appendChild(target);
    let component: ReturnType<typeof mount> | null = null;
    const onClose = vi.fn(() => {
      if (component) {
        void unmount(component);
      }
    });
    component = mount(MissionInvestigationDrawer, {
      target,
      props: { mission, onClose },
    });
    await tick();
    await Promise.resolve();

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const close = document.querySelector<HTMLButtonElement>(
      '[aria-label="Fermer l\'investigation"]'
    );
    const focusables = [...dialog!.querySelectorAll<HTMLElement>('*')].filter(
      (element) =>
        element.matches(
          'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]'
        ) && element.tabIndex >= 0
    );
    const last = focusables.at(-1);

    expect(document.activeElement).toBe(close);
    expect(dialog?.getAttribute('aria-modal')).toBe('true');

    close!.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    expect(document.activeElement).toBe(last);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
    await tick();
    await Promise.resolve();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });
});
