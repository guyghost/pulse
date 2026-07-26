import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mount, tick } from 'svelte';
import OnboardingWizard from '../../../src/ui/organisms/OnboardingWizard.svelte';

const defaultSources = [
  { id: 'free-work', name: 'Free-Work' },
  { id: 'lehibou', name: 'LeHibou' },
  { id: 'hiway', name: 'Hiway' },
  { id: 'collective', name: 'Collective' },
  { id: 'cherry-pick', name: 'Cherry Pick' },
  { id: 'malt', name: 'Malt' },
];

function mountWizard(props: Record<string, unknown> = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(OnboardingWizard, { target, props: { sources: defaultSources, ...props } });
  return target;
}

function clickButton(target: HTMLElement, label: string | RegExp) {
  const buttons = [...target.querySelectorAll('button')];
  const button = buttons.find((candidate) => {
    const text = candidate.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    return typeof label === 'string' ? text.includes(label) : label.test(text);
  }) as HTMLButtonElement | undefined;

  expect(button, `button ${String(label)} should exist`).toBeTruthy();
  button!.click();
}

async function flushAsyncStep() {
  await Promise.resolve();
  await tick();
}

describe('OnboardingWizard', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('exposes the five progressive operational onboarding steps', async () => {
    const target = mountWizard();
    await tick();

    for (const label of [
      'Comprendre Pulse',
      'Connecter une source',
      'Observer une activité',
      'Créer une alerte',
      'Recevoir un insight',
    ]) {
      expect(target.querySelector(`button[aria-label="${label}"]`)).not.toBeNull();
    }

    expect(target.textContent).toContain('Comprendre Pulse');
    expect(target.textContent).toContain('1/5');
    expect(target.textContent).toContain('2 minutes');
    expect(target.textContent).toContain('Modifiable ensuite');
    expect(target.querySelector('button[aria-label="Passer l’onboarding"]')).not.toBeNull();

    clickButton(target, 'Configurer le radar');
    await tick();
    expect(target.textContent).toContain('Connecter une source');
    expect(target.textContent).toContain('2/5');

    clickButton(target, /Continuer avec/);
    await tick();
    expect(target.textContent).toContain('Observer une activité');
    expect(target.textContent).toContain('3/5');

    clickButton(target, 'Créer une première alerte');
    await tick();
    expect(target.textContent).toContain('Créer une alerte');
    expect(target.textContent).toContain('4/5');

    clickButton(target, 'Voir le premier insight');
    await flushAsyncStep();
    expect(target.textContent).toContain('Recevoir un insight');
    expect(target.textContent).toContain('5/5');
    expect(target.textContent).toContain('Action recommandée après le scan');
  });

  it('renders only connector sources shipped in the current build', async () => {
    const target = mountWizard({
      sources: [
        { id: 'free-work', name: 'Free-Work' },
        { id: 'malt', name: 'Malt' },
      ],
    });
    await tick();

    clickButton(target, 'Configurer le radar');
    await tick();

    expect(target.textContent).toContain('Free-Work');
    expect(target.textContent).toContain('Malt');
    expect(target.textContent).not.toContain('LeHibou');
    expect(target.textContent).not.toContain('Hiway');
    expect(target.textContent).not.toContain('Collective');
  });

  it('saves the first alert before showing the insight step', async () => {
    const onSaveAlertPreferences = vi.fn();
    const target = mountWizard({ onSaveAlertPreferences });
    await tick();

    clickButton(target, 'Configurer le radar');
    await tick();
    clickButton(target, /Continuer avec/);
    await tick();
    clickButton(target, 'Créer une première alerte');
    await tick();
    clickButton(target, 'Voir le premier insight');
    await flushAsyncStep();

    expect(onSaveAlertPreferences).toHaveBeenCalledOnce();
    expect(onSaveAlertPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        scoreThreshold: 70,
        minDailyRate: 600,
        maxResults: 5,
        mutedUntil: null,
      })
    );
    expect(target.textContent).toContain('Recevoir un insight');
  });

  // ONB-01: when the alert save fails, the wizard must stay on the alert step
  // so the user can retry, instead of advancing to the insight step.
  // The page signals failure by resolving to `false` (it catches the facade
  // error, shows a toast, and returns false). A resolved-but-false promise is
  // the faithful reproduction of the production bug: the old wizard ignored the
  // return value and always called goNext() after the await resolved.
  it('stays on the alert step when the alert save fails', async () => {
    const onSaveAlertPreferences = vi.fn().mockResolvedValue(false);
    const target = mountWizard({ onSaveAlertPreferences });
    await tick();

    clickButton(target, 'Configurer le radar');
    await tick();
    clickButton(target, /Continuer avec/);
    await tick();
    clickButton(target, 'Créer une première alerte');
    await tick();
    clickButton(target, 'Voir le premier insight');
    await flushAsyncStep();

    expect(onSaveAlertPreferences).toHaveBeenCalledOnce();
    // Still on the alert step (4/5)...
    expect(target.textContent).toContain('Alerte prioritaire');
    expect(target.textContent).not.toContain('Action recommandée après le scan');
  });

  // Defensive: a handler that throws (rejects) must also block advancement.
  it('stays on the alert step when the alert save rejects', async () => {
    const onSaveAlertPreferences = vi.fn().mockRejectedValue(new Error('boom'));
    const target = mountWizard({ onSaveAlertPreferences });
    await tick();

    clickButton(target, 'Configurer le radar');
    await tick();
    clickButton(target, /Continuer avec/);
    await tick();
    clickButton(target, 'Créer une première alerte');
    await tick();
    clickButton(target, 'Voir le premier insight');
    await flushAsyncStep();

    expect(onSaveAlertPreferences).toHaveBeenCalledOnce();
    expect(target.textContent).toContain('Alerte prioritaire');
    expect(target.textContent).not.toContain('Action recommandée après le scan');
  });

  it('submits a complete normalized profile from current fields', async () => {
    const onComplete = vi.fn();
    const target = mountWizard({ onComplete });
    await tick();

    (target.querySelector('#ob-firstname') as HTMLInputElement).value = ' Guy ';
    target.querySelector('#ob-firstname')?.dispatchEvent(new Event('input', { bubbles: true }));
    (target.querySelector('#ob-jobtitle') as HTMLInputElement).value = ' Dev React Senior ';
    target.querySelector('#ob-jobtitle')?.dispatchEvent(new Event('input', { bubbles: true }));
    (target.querySelector('#ob-keywords') as HTMLInputElement).value = 'React';
    target.querySelector('#ob-keywords')?.dispatchEvent(new Event('input', { bubbles: true }));
    (target.querySelector('button[aria-label="Ajouter le mot-clé"]') as HTMLButtonElement).click();
    (target.querySelector('#ob-location') as HTMLInputElement).value = ' Paris ';
    target.querySelector('#ob-location')?.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();

    clickButton(target, 'Sauvegarder mon profil');
    await tick();

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Guy',
        jobTitle: 'Dev React Senior',
        location: 'Paris',
        keywords: ['React'],
        tjmMin: 600,
        tjmMax: 750,
      })
    );
  });

  // B-1: incremental stack edits must signal onUpdateProfile so the hosting
  // page can propagate them (previously the wizard emitted the callback but
  // OnboardingPage never wired it, so every call was a no-op).
  it('emits incremental profile updates when keyword chips change', async () => {
    const onUpdateProfile = vi.fn();
    const target = mountWizard({ onUpdateProfile });
    await tick();

    const keywordInput = target.querySelector('#ob-keywords') as HTMLInputElement;
    keywordInput.value = 'React';
    keywordInput.dispatchEvent(new Event('input', { bubbles: true }));
    (target.querySelector('button[aria-label="Ajouter le mot-clé"]') as HTMLButtonElement).click();
    await tick();

    expect(onUpdateProfile).toHaveBeenCalledWith(expect.objectContaining({ keywords: ['React'] }));

    // Removing a chip also propagates the updated keywords.
    onUpdateProfile.mockClear();
    (
      [...target.querySelectorAll('button')].find((b) =>
        (b.textContent ?? '').includes('React')
      ) as HTMLButtonElement
    ).click();
    await tick();

    expect(onUpdateProfile).toHaveBeenCalledWith(expect.objectContaining({ keywords: [] }));
  });
});
