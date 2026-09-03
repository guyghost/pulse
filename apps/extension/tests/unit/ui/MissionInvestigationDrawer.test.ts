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
    trigger.textContent = 'Analyser';
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

  it('présente la mission avec une note alphabétique sans score brut', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(MissionInvestigationDrawer, {
      target,
      props: { mission, onClose: () => {} },
    });
    await tick();

    expect(document.body.textContent).toContain('Note');
    expect(document.body.textContent).toContain('A');
    expect(document.body.textContent).not.toMatch(/\b90\b/);
    expect(document.body.textContent).not.toContain('/100');
  });

  it('garantit que durée, début et description complète vivent dans le drawer', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(MissionInvestigationDrawer, {
      target,
      props: {
        mission: {
          ...mission,
          startDate: '2026-09-01',
          description: 'Une mission de test avec un descriptif technique complet.',
        },
        onClose: () => {},
      },
    });
    await tick();

    expect(document.body.textContent).toContain('Durée');
    expect(document.body.textContent).toContain('6 mois');
    expect(document.body.textContent).toContain('Début');
    expect(document.body.textContent).toContain('Détails techniques');
    expect(document.body.textContent).toContain(
      'Une mission de test avec un descriptif technique complet.'
    );
  });

  it('expose les actions secondaires comme cases à cocher de menu (menuitemcheckbox)', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(MissionInvestigationDrawer, {
      target,
      props: { mission, onClose: () => {} },
    });
    await tick();

    const kebab = document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
    kebab!.click();
    await tick();

    const items = document.querySelectorAll('[role="menu"] button');
    expect(items.length).toBe(2);
    const [compare, hide] = items;
    expect(compare.getAttribute('role')).toBe('menuitemcheckbox');
    expect(compare.getAttribute('aria-checked')).toBe('false');
    expect(compare.getAttribute('aria-pressed')).toBeNull();
    expect(hide.getAttribute('role')).toBe('menuitemcheckbox');
    expect(hide.getAttribute('aria-checked')).toBe('false');
    expect(hide.getAttribute('aria-pressed')).toBeNull();
  });
});
