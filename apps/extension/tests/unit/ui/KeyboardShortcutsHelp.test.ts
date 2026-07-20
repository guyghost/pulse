import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mount, tick, unmount } from 'svelte';
import KeyboardShortcutsHelp from '../../../src/ui/molecules/KeyboardShortcutsHelp.svelte';
import MissionComparison from '../../../src/ui/organisms/MissionComparison.svelte';
import type { Mission } from '$lib/core/types/mission';
import {
  getRegisteredShortcuts,
  registerShortcut,
  clearAllShortcuts,
  ShortcutCategories,
} from '../../../src/lib/shell/utils/keyboard-shortcuts';

const componentPath = 'src/ui/molecules/KeyboardShortcutsHelp.svelte';

function makeMission(id: string): Mission {
  return {
    id,
    title: `Mission ${id}`,
    client: 'Client',
    description: 'Description',
    stack: ['Svelte'],
    tjm: 700,
    location: 'Paris',
    remote: 'hybrid',
    duration: '6 mois',
    startDate: null,
    publishedAt: null,
    url: `https://example.com/${id}`,
    source: 'free-work',
    scrapedAt: new Date('2026-07-16T10:00:00.000Z'),
    seniority: 'senior',
    score: 80,
    scoreBreakdown: null,
    semanticScore: null,
    semanticReason: null,
  };
}

describe('KeyboardShortcutsHelp — SET-05 idiomatic reactive grouping', () => {
  beforeEach(() => {
    clearAllShortcuts();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    clearAllShortcuts();
  });

  it('uses $derived.by so the grouping is an evaluated value (not a function)', () => {
    const source = readFileSync(componentPath, 'utf8');

    // Must use the $derived.by idiom, not $derived(() => …) which stores a
    // function and loses reactivity.
    expect(source).toContain('$derived.by(');
    expect(source).not.toMatch(/\$derived\(\(\)\s*=>/);
  });

  it('iterates the derived value directly (no stray function call in the each)', () => {
    const source = readFileSync(componentPath, 'utf8');

    // After switching to $derived.by, the value is already evaluated, so the
    // template must iterate `shortcutsByCategory` (not call it).
    expect(source).toContain('{#each shortcutsByCategory as');
    expect(source).not.toContain('{#each shortcutsByCategory() as');
  });

  it('renders grouped shortcuts without throwing', async () => {
    registerShortcut(
      { key: 'r', description: 'Rafraîchir le feed', category: ShortcutCategories.ACTIONS },
      () => {}
    );

    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(KeyboardShortcutsHelp, { target, props: { isOpen: true } });
    await tick();

    const text = document.body.textContent ?? '';
    expect(text).toContain('Raccourcis clavier');
    expect(text).toContain(ShortcutCategories.ACTIONS);
    expect(text).toContain('Rafraîchir le feed');
  });

  it('separates the dimming scrim from an opaque, readable dialog surface', async () => {
    registerShortcut(
      { key: 'r', description: 'Rafraîchir le feed', category: ShortcutCategories.ACTIONS },
      () => {}
    );

    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(KeyboardShortcutsHelp, { target, props: { isOpen: true } });
    await tick();

    const scrim = document.querySelector<HTMLElement>('[data-testid="shortcuts-help-scrim"]');
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');

    expect(scrim).not.toBeNull();
    expect(dialog).not.toBeNull();
    expect(scrim?.parentElement).toBe(dialog?.parentElement);
    expect(dialog?.className).toContain('bg-surface-white');
    expect(dialog?.className).toContain('shadow-xl');
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Fermer');
  });

  it.each([
    [
      'close button',
      (_target: HTMLElement) =>
        document.querySelector<HTMLButtonElement>('[aria-label="Fermer"]')?.click(),
    ],
    [
      'backdrop',
      (_target: HTMLElement) =>
        document
          .querySelector<HTMLElement>('[data-testid="shortcuts-help-scrim"]')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    ],
    [
      'Escape',
      (_target: HTMLElement) =>
        document
          .querySelector<HTMLElement>('[role="dialog"]')
          ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    ],
  ])('closes from %s without changing the registered shortcuts', async (_trigger, close) => {
    registerShortcut(
      { key: 'r', description: 'Rafraîchir le feed', category: ShortcutCategories.ACTIONS },
      () => {}
    );

    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(KeyboardShortcutsHelp, { target, props: { isOpen: true } });
    await tick();

    close(target);
    await tick();

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(getRegisteredShortcuts()).toHaveLength(1);
  });

  it('restores the trigger after Escape', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Aide clavier';
    document.body.appendChild(trigger);
    trigger.focus();

    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(KeyboardShortcutsHelp, {
      target,
      props: { isOpen: true },
    });
    await tick();
    await Promise.resolve();

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    dialog!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    await Promise.resolve();

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await unmount(component);
  });

  it('makes an underlying comparison inert and restores its trigger after nested close', async () => {
    const comparisonTarget = document.createElement('div');
    document.body.appendChild(comparisonTarget);
    const comparison = mount(MissionComparison, {
      target: comparisonTarget,
      props: {
        missions: [makeMission('a'), makeMission('b')],
        onClose: () => {},
      },
    });
    await tick();
    await Promise.resolve();

    const comparisonDialog = document.querySelector<HTMLElement>(
      '[role="dialog"][aria-labelledby="mission-comparison-title"]'
    );
    const comparisonClose =
      comparisonDialog?.querySelector<HTMLButtonElement>('[aria-label="Fermer"]');
    comparisonClose!.focus();

    const shortcutsTarget = document.createElement('div');
    document.body.appendChild(shortcutsTarget);
    const shortcuts = mount(KeyboardShortcutsHelp, {
      target: shortcutsTarget,
      props: { isOpen: true },
    });
    await tick();
    await Promise.resolve();

    const shortcutsDialog = document.querySelector<HTMLElement>(
      '[role="dialog"][aria-labelledby="shortcuts-title"]'
    );
    expect(shortcutsDialog?.getAttribute('aria-modal')).toBe('true');
    expect(comparisonDialog?.getAttribute('aria-modal')).toBe('false');
    expect(comparisonDialog?.getAttribute('aria-hidden')).toBe('true');
    expect(comparisonDialog?.inert).toBe(true);

    shortcutsDialog!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    await Promise.resolve();

    expect(comparisonDialog?.getAttribute('aria-modal')).toBe('true');
    expect(comparisonDialog?.inert).toBe(false);
    expect(document.activeElement).toBe(comparisonClose);

    await unmount(shortcuts);
    await unmount(comparison);
  });
});
