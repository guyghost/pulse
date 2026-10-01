import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { installChromeStubs } from '../../../src/dev/chrome-stubs';
import ProfilePage from '../../../src/ui/pages/ProfilePage.svelte';

const fullProfile = {
  firstName: 'Ada',
  jobTitle: 'Développeuse Svelte',
  location: 'Lyon',
  remote: 'remote',
  seniority: 'senior',
  tjmMin: 550,
  tjmMax: null,
  keywords: ['Svelte'],
  scoringWeights: null,
  experiences: [],
  availability: null,
};

beforeEach(() => {
  delete (globalThis as unknown as Record<string, unknown>).chrome;
  localStorage.clear();
  document.body.innerHTML = '';
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe('profile UX', () => {
  async function render(profile = fullProfile) {
    installChromeStubs();
    await chrome.runtime.sendMessage({ type: 'SAVE_PROFILE', payload: profile });
    const target = document.createElement('div');
    document.body.appendChild(target);
    const instance = mount(ProfilePage, { target });
    await tick();
    await vi.waitFor(() => expect(target.textContent).toContain('Bonjour Ada'));
    return { target, instance };
  }

  it('shows a stable ready state without duplicate impact cards or a zero gain', async () => {
    const { target, instance } = await render();
    expect(target.textContent).toContain('Profil prêt');
    expect(target.textContent).not.toContain('Gain estimé');
    expect(target.querySelector('[aria-label="Suggestion prioritaire"]')).toBeNull();
    expect(target.querySelector('details summary')?.textContent).toContain(
      'Consulter les critères'
    );
    await unmount(instance);
  });

  it('shows one concrete suggestion and focuses its field when activated', async () => {
    const { target, instance } = await render({ ...fullProfile, keywords: [] });
    expect(target.querySelectorAll('[aria-label="Suggestion prioritaire"]')).toHaveLength(1);
    const suggestion = [...target.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Compléter mots-clés')
    );
    expect(suggestion).toBeDefined();
    suggestion?.click();
    await tick();
    await vi.waitFor(() =>
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Mots-clés')
    );
    expect(target.querySelector('details summary')).not.toBeNull();
    await unmount(instance);
  });
});
