import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick } from 'svelte';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { MissionTracking } from '../../../src/lib/core/types/tracking';

const sendMessage = vi.hoisted(() => vi.fn());
const getMissions = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const showToastAction = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/shell/messaging/bridge', () => ({
  sendMessage,
  subscribeMessages: () => () => {},
}));
vi.mock('../../../src/lib/shell/facades/feed-data.facade', () => ({ getMissions }));
vi.mock('../../../src/lib/shell/notifications/toast-service', () => ({
  showToast,
  showToastAction,
}));
vi.mock('../../../src/lib/shell/facades/availability.facade', () => ({
  createAvailabilityDeps: () => ({
    loadAvailability: () => Promise.resolve(null),
    saveAvailability: () => Promise.resolve(undefined),
    copyToClipboard: () => Promise.resolve(undefined),
    openUrl: () => Promise.resolve(undefined),
    platforms: [],
    now: () => 0,
  }),
  getAvailabilityPushTargets: () => [],
}));

import ApplicationsPage from '../../../src/ui/pages/ApplicationsPage.svelte';

const mission: Mission = {
  id: 'm1',
  title: 'Mission Svelte',
  client: 'Acme',
  description: 'desc',
  stack: ['Svelte'],
  tjm: 700,
  location: 'Paris',
  remote: 'hybrid',
  duration: null,
  startDate: null,
  publishedAt: null,
  url: 'https://example.com/m1',
  source: 'free-work',
  scrapedAt: new Date('2026-06-24T10:00:00.000Z'),
  seniority: null,
  scoreBreakdown: null,
  score: 80,
  semanticScore: null,
  semanticReason: null,
};

const tracking: MissionTracking = {
  missionId: 'm1',
  currentStatus: 'application_prepared',
  history: [{ from: null, to: 'detected', timestamp: 1, note: null }],
  generatedAssetIds: [],
  userRating: null,
  notes: '',
  nextActionAt: null,
};

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function clickButton(target: HTMLElement, matcher: RegExp | string) {
  const button = [...target.querySelectorAll('button')].find((btn) => {
    const text = btn.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    return typeof matcher === 'string' ? text.includes(matcher) : matcher.test(text);
  }) as HTMLButtonElement | undefined;
  expect(button, `button matching ${String(matcher)} should exist`).toBeTruthy();
  button!.click();
}

describe('ApplicationsPage next-action toast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    sendMessage.mockImplementation((message: { type: string }) => {
      switch (message.type) {
        case 'GET_TRACKINGS':
          return Promise.resolve({ type: 'TRACKINGS_RESULT', payload: [tracking] });
        case 'GET_GENERATED_ASSETS':
          return Promise.resolve({ type: 'GENERATED_ASSETS_RESULT', payload: [] });
        case 'UPDATE_TRACKING_DETAILS':
          return Promise.resolve({
            type: 'TRACKING_UPDATED',
            payload: { ...tracking, nextActionAt: '2026-07-01T07:00:00.000Z' },
          });
        default:
          return Promise.resolve({ type: 'NOOP' });
      }
    });
    getMissions.mockResolvedValue([mission]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a success toast when the next action is saved', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(ApplicationsPage, { target });
    await tick();
    await flush();

    const input = target.querySelector('#application-next-action') as HTMLInputElement;
    input.value = '2026-07-01T09:00';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();

    clickButton(target, 'Enregistrer');
    await flush();
    await tick();

    expect(showToast).toHaveBeenCalledWith('Prochaine action mise à jour', 'success');
  });

  it('shows an ERROR toast (not success) when persistence fails', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(ApplicationsPage, { target });
    await tick();
    await flush();

    // After initial load succeeds, make the next-action persist call fail.
    sendMessage.mockImplementationOnce(() =>
      Promise.reject(new Error('Impossible d’enregistrer la prochaine action'))
    );

    const input = target.querySelector('#application-next-action') as HTMLInputElement;
    input.value = '2026-07-01T09:00';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();

    clickButton(target, 'Enregistrer');
    await flush();
    await tick();

    const calls = showToast.mock.calls as Array<[string, string]>;
    const saveCall = calls.find(
      ([message, type]) => message === 'Prochaine action mise à jour' || type === 'success'
    );
    expect(saveCall, 'must not report success when persistence failed').toBeUndefined();
    expect(showToast).toHaveBeenCalledWith('Impossible d’enregistrer la prochaine action', 'error');
  });
});
