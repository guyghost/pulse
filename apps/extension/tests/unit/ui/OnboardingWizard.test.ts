import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mount, tick } from 'svelte';
import OnboardingWizard from '../../../src/ui/organisms/OnboardingWizard.svelte';

function mountWizard(props: Record<string, unknown> = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(OnboardingWizard, { target, props });
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

  it('submits a complete normalized profile from current fields', async () => {
    const onComplete = vi.fn();
    const target = mountWizard({ onComplete });
    await tick();

    (target.querySelector('#ob-firstname') as HTMLInputElement).value = ' Guy ';
    target.querySelector('#ob-firstname')?.dispatchEvent(new Event('input', { bubbles: true }));
    (target.querySelector('#ob-jobtitle') as HTMLInputElement).value = ' Dev React Senior ';
    target.querySelector('#ob-jobtitle')?.dispatchEvent(new Event('input', { bubbles: true }));
    (target.querySelector('#ob-stack') as HTMLInputElement).value = 'React';
    target.querySelector('#ob-stack')?.dispatchEvent(new Event('input', { bubbles: true }));
    (target.querySelector('button[aria-label="Ajouter la stack technique"]') as HTMLButtonElement)
      .click();
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
        stack: ['React'],
        tjmMin: 600,
        tjmMax: 750,
      })
    );
  });
});
