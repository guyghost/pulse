import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mount, tick } from 'svelte';
import KeyboardShortcutsHelp from '../../../src/ui/molecules/KeyboardShortcutsHelp.svelte';
import {
  getRegisteredShortcuts,
  registerShortcut,
  clearAllShortcuts,
  ShortcutCategories,
} from '../../../src/lib/shell/utils/keyboard-shortcuts';

const componentPath = 'src/ui/molecules/KeyboardShortcutsHelp.svelte';

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

    const text = target.textContent ?? '';
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

    const scrim = target.querySelector<HTMLElement>('[data-testid="shortcuts-help-scrim"]');
    const dialog = target.querySelector<HTMLElement>('[role="dialog"]');

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
      (target: HTMLElement) =>
        target.querySelector<HTMLButtonElement>('[aria-label="Fermer"]')?.click(),
    ],
    [
      'backdrop',
      (target: HTMLElement) =>
        target
          .querySelector<HTMLElement>('[data-testid="shortcuts-help-scrim"]')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    ],
    [
      'Escape',
      (target: HTMLElement) =>
        target
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

    expect(target.querySelector('[role="dialog"]')).toBeNull();
    expect(getRegisteredShortcuts()).toHaveLength(1);
  });
});
