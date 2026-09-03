/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mount, tick } from 'svelte';
import { installChromeStubs } from '../../../src/dev/chrome-stubs';
import SettingsPage from '../../../src/ui/pages/SettingsPage.svelte';

describe('SettingsPage with the connected surface disabled', () => {
  beforeEach(() => {
    const globalRecord = globalThis as unknown as Record<string, unknown>;
    delete globalRecord.chrome;
    window.localStorage.clear();
    installChromeStubs();
    document.body.innerHTML = '';
  });

  async function mountAndLoad(): Promise<HTMLElement> {
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(SettingsPage, { target });
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tick();
    return target;
  }

  it('exposes local AI settings without any dashboard connection action', async () => {
    const target = await mountAndLoad();

    expect(target.textContent).not.toContain('Connecter mon compte');
    expect(target.textContent).not.toContain('Ouvrir le dashboard');
    expect(target.textContent).not.toContain('synchronisation dashboard');

    const aiSectionButton = [...target.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Analyse locale')
    );
    expect(aiSectionButton).toBeDefined();
    aiSectionButton?.click();
    await tick();

    expect(target.textContent).toContain('IA locale');
  });
});
