import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick } from 'svelte';
import ThemeSelector from '../../../src/ui/molecules/ThemeSelector.svelte';

function mountSelector(props: Record<string, unknown> = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(ThemeSelector, {
    target,
    props: { theme: 'system', ...props },
  });
  return target;
}

describe('ThemeSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('expose exactement les trois thèmes dans un groupe nommé', async () => {
    const target = mountSelector();
    await tick();

    const group = target.querySelector('[role="group"][aria-label="Apparence"]') as HTMLElement;
    const buttons = group.querySelectorAll(':scope > button');
    expect(buttons).toHaveLength(3);
    expect(Array.from(buttons, (button) => button.textContent?.trim())).toEqual([
      'Clair',
      'Sombre',
      'Système',
    ]);
    expect(group.getAttribute('aria-busy')).toBe('false');
    expect(Array.from(buttons, (button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
    ]);
  });

  it('demande le nouveau thème sans déplacer la sélection confirmée', async () => {
    const onSelect = vi.fn();
    const target = mountSelector({ theme: 'light', onSelect });
    await tick();

    const darkButton = Array.from(target.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Sombre'
    ) as HTMLButtonElement;
    darkButton.click();

    expect(onSelect).toHaveBeenCalledWith('dark');
    expect(darkButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('verrouille les trois contrôles pendant la confirmation', async () => {
    const target = mountSelector({ theme: 'light', busy: true });
    await tick();

    const group = target.querySelector('[role="group"][aria-label="Apparence"]') as HTMLElement;
    const buttons = Array.from(group.querySelectorAll('button'));
    expect(group.getAttribute('aria-busy')).toBe('true');
    expect(buttons.every((button) => button.disabled)).toBe(true);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
    ]);
  });
});
