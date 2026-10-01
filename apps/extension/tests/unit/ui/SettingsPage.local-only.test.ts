/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick } from 'svelte';
import { installChromeStubs } from '../../../src/dev/chrome-stubs';
import SettingsPage from '../../../src/ui/pages/SettingsPage.svelte';

describe('SettingsPage with the connected surface disabled', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
      button.textContent?.includes('Intelligence artificielle')
    );
    expect(aiSectionButton).toBeDefined();
    aiSectionButton?.click();
    await tick();

    expect(target.textContent).toContain('Dans votre navigateur');
    const copy = target.textContent?.replace(/\s+/g, ' ');
    expect(copy).toContain('Titre, technologies, mode de travail et description sont transmis');
    expect(copy).toContain(
      'Le titre et la description peuvent contenir un tarif, un lieu ou d’autres données'
    );
    expect(copy).toContain(
      'profil utilisateur et les champs structurés TJM/localisation ne sont pas ajoutés'
    );
    expect(copy).not.toContain('TJM, localisation et sessions ne sont pas transmis');
  });

  it('keeps cloud off and exposes unknown verification after an unexpected key response', async () => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    vi.spyOn(chrome.runtime, 'sendMessage').mockImplementation(async (message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'AI_GATEWAY_KEY_STATUS'
      ) {
        return { type: 'SETTINGS_RESULT', payload: null };
      }
      return original(message);
    });
    const target = await mountAndLoad();
    [...target.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Intelligence artificielle'))
      ?.click();
    await tick();
    await vi.waitFor(() => expect(target.textContent).toContain('État inconnu — clé non vérifiée'));
    const cloud = target.querySelector(
      '[aria-label="Activer la classification des missions"]'
    ) as HTMLButtonElement;
    expect(cloud.getAttribute('aria-checked')).toBe('false');
    expect(cloud.disabled).toBe(true);
    expect(target.querySelector('[role="alert"]')?.textContent).toContain('Impossible de vérifier');
  });
});
