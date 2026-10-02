import { afterEach, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import type { ConnectedAlertPreferences } from '../../../src/lib/core/types/alert-preferences';
import type { createOnboardingFlowController } from '../../../src/models/onboarding-flow.machine';
const state = vi.hoisted(() => ({
  controller: null as ReturnType<typeof createOnboardingFlowController> | null,
  load: vi.fn(),
}));
vi.mock('../../../src/models/onboarding-flow.machine', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/models/onboarding-flow.machine')>();
  return {
    ...actual,
    createOnboardingFlowController: (
      ...args: Parameters<typeof actual.createOnboardingFlowController>
    ) => {
      state.controller = actual.createOnboardingFlowController(...args);
      return state.controller;
    },
  };
});
vi.mock('../../../src/lib/shell/facades/alert-preferences.facade', () => ({
  getAlertPreferences: state.load,
  saveAlertPreferences: vi.fn(),
}));
vi.mock('../../../src/lib/shell/facades/settings.facade', () => ({
  getProfile: vi.fn(async () => null),
  saveProfile: vi.fn(),
  getSettings: vi.fn(),
  setSettings: vi.fn(),
}));
vi.mock('../../../src/lib/shell/facades/feed-controller.svelte', () => ({
  createFeedController: () => ({ dispose: vi.fn() }),
}));
import OnboardingPage from '../../../src/ui/pages/OnboardingPage.svelte';
afterEach(() => {
  document.body.innerHTML = '';
});
it('does not replace the explicit notification choice when stored preferences arrive late', async () => {
  let resolve!: (value: ConnectedAlertPreferences) => void;
  state.load.mockReturnValueOnce(
    new Promise<ConnectedAlertPreferences>((done) => {
      resolve = done;
    })
  );
  const target = document.createElement('div');
  document.body.append(target);
  const instance = mount(OnboardingPage, { target });
  const controller = state.controller!;
  controller.send({ type: 'START' });
  controller.send({ type: 'CONNECT_SOURCE', sourceId: 'free-work' });
  controller.send({ type: 'NEXT' });
  controller.send({
    type: 'UPDATE_PROFILE',
    partial: {
      firstName: 'Alex',
      jobTitle: 'Dev',
      tjmMin: 600,
      tjmMax: 800,
      keywords: ['TypeScript'],
    },
  });
  controller.send({ type: 'NEXT' });
  controller.send({ type: 'NEXT' });
  controller.send({ type: 'NEXT' });
  await tick();
  expect(controller.getSnapshot().phase).toBe('notifying');
  const toggle = target.querySelector('[role="switch"]') as HTMLButtonElement;
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  toggle.click();
  await tick();
  expect(controller.getSnapshot().notifyEnabled).toBe(true);
  resolve({
    enabled: false,
    scoreThreshold: 85,
    minDailyRate: 0,
    requiredStacks: [],
    maxResults: 5,
    mutedUntil: null,
    revision: 1,
    updatedAt: '',
  });
  await Promise.resolve();
  await tick();
  expect(controller.getSnapshot().notifyEnabled).toBe(true);
  expect(toggle.getAttribute('aria-checked')).toBe('true');
  expect(target.textContent).toContain('85/100');
  await unmount(instance);
});
