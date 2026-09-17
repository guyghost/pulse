import { describe, expect, it, vi } from 'vitest';
import { mount, tick } from 'svelte';
import OnboardingFlow from '../../../src/ui/organisms/OnboardingFlow.svelte';
import type {
  OnboardingFlowEvent,
  OnboardingFlowSnapshot,
} from '../../../src/models/onboarding-flow.machine';

const SOURCES = [
  { id: 'free-work', name: 'Free-Work', url: 'https://www.free-work.com' },
  { id: 'lehibou', name: 'LeHibou', url: 'https://lehibou.com' },
];

function makeSnapshot(overrides: Partial<OnboardingFlowSnapshot> = {}): OnboardingFlowSnapshot {
  return {
    phase: 'connecting',
    wizardStep: 'identity',
    profile: {
      firstName: '',
      jobTitle: '',
      location: '',
      remote: 'any',
      keywords: [],
      tjmMin: 0,
      tjmMax: null,
    },
    connectedSources: [],
    notifyEnabled: true,
    progress: { current: 2, total: 5 },
    pendingEffect: null,
    error: null,
    terminal: false,
    canAdvance: false,
    ...overrides,
  };
}

function mountFlow(
  snapshot: OnboardingFlowSnapshot,
  handlers: {
    onEvent?: (event: OnboardingFlowEvent) => void;
    onVerifySource?: (sourceId: string) => void;
    onOpenSource?: (sourceId: string) => void;
    sourceVerifications?: Record<string, 'ready' | 'session-missing' | 'unavailable' | 'checking'>;
  } = {}
) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(OnboardingFlow, {
    target,
    props: {
      snapshot,
      sources: SOURCES,
      onEvent: handlers.onEvent ?? vi.fn(),
      onVerifySource: handlers.onVerifySource ?? vi.fn(),
      onOpenSource: handlers.onOpenSource ?? vi.fn(),
      sourceVerifications: handlers.sourceVerifications,
    },
  });
  return { target, instance };
}

describe('OnboardingFlow — connecting (P0-B)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('exige une session prouvée : « Continuer » désactivé sans source connectée', async () => {
    const { target } = mountFlow(makeSnapshot());
    await tick();

    const buttons = Array.from(target.querySelectorAll('button'));
    const next = buttons.find((b) => b.textContent?.trim() === 'Continuer');
    expect(next).toBeDefined();
    expect(next!.disabled).toBe(true);
  });

  it('propose l’escape hatch « Continuer sans source » qui émet SKIP', async () => {
    const onEvent = vi.fn();
    const { target } = mountFlow(makeSnapshot(), { onEvent });
    await tick();

    const escape = Array.from(target.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith('Continuer sans source')
    );
    expect(escape).toBeDefined();
    escape!.click();
    expect(onEvent).toHaveBeenCalledWith({ type: 'SKIP' });
  });

  it('une source prête affiche « Session détectée » et débloque « Continuer »', async () => {
    const { target } = mountFlow(makeSnapshot({ connectedSources: ['free-work'] }), {
      sourceVerifications: { 'free-work': 'ready' },
    });
    await tick();

    expect(target.textContent).toContain('Session détectée');
    const next = Array.from(target.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Continuer'
    );
    expect(next!.disabled).toBe(false);
  });

  it('une source sans session propose « Ouvrir {source} » (recheck au retour)', async () => {
    const onOpenSource = vi.fn();
    const { target } = mountFlow(makeSnapshot(), {
      sourceVerifications: { lehibou: 'session-missing' },
      onOpenSource,
    });
    await tick();

    expect(target.textContent).toContain('Pas de session');
    const open = Array.from(target.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Ouvrir LeHibou')
    ) as HTMLButtonElement;
    expect(open).toBeDefined();
    open.click();
    expect(onOpenSource).toHaveBeenCalledWith('lehibou');
  });

  it('une source idle propose « Connecter » qui déclenche la vérification', async () => {
    const onVerifySource = vi.fn();
    const { target } = mountFlow(makeSnapshot(), { onVerifySource });
    await tick();

    const connect = Array.from(target.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Connecter'
    ) as HTMLButtonElement;
    expect(connect).toBeDefined();
    connect.click();
    expect(onVerifySource).toHaveBeenCalledWith('free-work');
  });

  it('B-opt : « Scanner maintenant » proposé quand une session est prête, émet SKIP', async () => {
    const onEvent = vi.fn();
    const { target } = mountFlow(makeSnapshot({ connectedSources: ['free-work'] }), { onEvent });
    await tick();

    const scanNow = Array.from(target.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith('Scanner maintenant')
    ) as HTMLButtonElement;
    expect(scanNow).toBeDefined();
    scanNow.click();
    expect(onEvent).toHaveBeenCalledWith({ type: 'SKIP' });
    // The "no source" escape hatch makes no sense when a source is ready.
    expect(
      Array.from(target.querySelectorAll('button')).some((b) =>
        b.textContent?.trim().startsWith('Continuer sans source')
      )
    ).toBe(false);
  });

  it('B-opt : « Scanner maintenant » absent sans source connectée', async () => {
    const { target } = mountFlow(makeSnapshot());
    await tick();

    expect(
      Array.from(target.querySelectorAll('button')).some((b) =>
        b.textContent?.trim().startsWith('Scanner maintenant')
      )
    ).toBe(false);
  });

  it('un échec de vérification propose « Réessayer »', async () => {
    const onVerifySource = vi.fn();
    const { target } = mountFlow(makeSnapshot(), {
      sourceVerifications: { 'free-work': 'unavailable' },
      onVerifySource,
    });
    await tick();

    expect(target.textContent).toContain('Vérification impossible');
    const retry = Array.from(target.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Réessayer')
    ) as HTMLButtonElement;
    retry.click();
    expect(onVerifySource).toHaveBeenCalledWith('free-work');
  });
});
