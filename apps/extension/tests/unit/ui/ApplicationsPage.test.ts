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
  history: [
    { from: null, to: 'detected', timestamp: 1, note: null },
    { from: 'detected', to: 'selected', timestamp: 2, note: null },
    { from: 'selected', to: 'application_prepared', timestamp: 3, note: null },
  ],
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

function persistenceFailure(intent: 'transition' | 'details' | 'restore') {
  const messages = {
    transition: 'Impossible d’enregistrer le nouveau statut.',
    details: 'Impossible d’enregistrer les détails de suivi.',
    restore: 'Impossible d’annuler la modification.',
  } as const;
  return {
    type: 'TRACKING_FAILED',
    payload: {
      version: 1,
      code: 'PERSIST_FAILED',
      intent,
      missionId: 'm1',
      mutationId: null,
      message: messages[intent],
      recoverable: true,
    },
  };
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

  it('keeps load failure distinct from a successful empty pipeline', async () => {
    sendMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'GET_TRACKINGS') {
        return Promise.resolve({
          type: 'TRACKING_FAILED',
          payload: {
            version: 1,
            code: 'LOAD_FAILED',
            intent: 'load',
            missionId: null,
            mutationId: null,
            message: 'Impossible de charger le suivi des candidatures.',
            recoverable: true,
          },
        });
      }
      return Promise.resolve({ type: 'NOOP' });
    });
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(ApplicationsPage, { target });
    await tick();
    await flush();

    expect(getMissions).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      'Impossible de charger le suivi des candidatures.',
      'error'
    );
    expect(target.textContent).toContain('Le pipeline candidatures ne peut pas être chargé');
    expect(target.textContent).not.toContain('Aucune candidature active pour le moment');
  });

  it('settles an explicit retry when loading fails again', async () => {
    sendMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'GET_TRACKINGS') {
        return Promise.resolve({
          type: 'TRACKING_FAILED',
          payload: {
            version: 1,
            code: 'LOAD_FAILED',
            intent: 'load',
            missionId: null,
            mutationId: null,
            message: 'Impossible de charger le suivi des candidatures.',
            recoverable: true,
          },
        });
      }
      return Promise.resolve({ type: 'NOOP' });
    });
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(ApplicationsPage, { target });
    await tick();
    await flush();

    clickButton(target, 'Réessayer');
    await flush();
    await tick();

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(getMissions).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledTimes(2);
    expect(showToast).toHaveBeenNthCalledWith(
      2,
      'Impossible de charger le suivi des candidatures.',
      'error'
    );
    expect(target.textContent).toContain('Le pipeline candidatures ne peut pas être chargé');
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
    sendMessage.mockImplementationOnce(() => Promise.resolve(persistenceFailure('details')));

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
    expect(showToast).toHaveBeenCalledWith(
      'Impossible d’enregistrer les détails de suivi.',
      'error'
    );
  });

  it('reports repeated identical detail failures as distinct outcomes', async () => {
    sendMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'GET_TRACKINGS') {
        return Promise.resolve({ type: 'TRACKINGS_RESULT', payload: [tracking] });
      }
      if (message.type === 'GET_GENERATED_ASSETS') {
        return Promise.resolve({ type: 'GENERATED_ASSETS_RESULT', payload: [] });
      }
      if (message.type === 'UPDATE_TRACKING_DETAILS') {
        return Promise.resolve(persistenceFailure('details'));
      }
      return Promise.resolve({ type: 'NOOP' });
    });
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
    clickButton(target, 'Enregistrer');
    await flush();

    expect(showToast).toHaveBeenCalledTimes(2);
    expect(showToast).toHaveBeenNthCalledWith(
      1,
      'Impossible d’enregistrer les détails de suivi.',
      'error'
    );
    expect(showToast).toHaveBeenNthCalledWith(
      2,
      'Impossible d’enregistrer les détails de suivi.',
      'error'
    );
    expect(showToastAction).not.toHaveBeenCalled();
    expect(showToast.mock.calls.some(([, type]) => type === 'success')).toBe(false);
  });

  it('shows one transition error and creates no success Undo action', async () => {
    sendMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'GET_TRACKINGS') {
        return Promise.resolve({ type: 'TRACKINGS_RESULT', payload: [tracking] });
      }
      if (message.type === 'GET_GENERATED_ASSETS') {
        return Promise.resolve({ type: 'GENERATED_ASSETS_RESULT', payload: [] });
      }
      if (message.type === 'UPDATE_TRACKING') {
        return Promise.resolve(persistenceFailure('transition'));
      }
      return Promise.resolve({ type: 'NOOP' });
    });
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(ApplicationsPage, { target });
    await tick();
    await flush();

    clickButton(target, 'Candidaté');
    await flush();
    await tick();

    expect(showToast).toHaveBeenCalledWith('Impossible d’enregistrer le nouveau statut.', 'error');
    expect(showToastAction).not.toHaveBeenCalled();
  });

  it('restores the visible next-action input when clear persistence fails', async () => {
    const nextActionIso = '2026-07-01T07:00:00.000Z';
    const ts = Date.parse(nextActionIso);
    const expectedLocalInput = new Date(ts - new Date(ts).getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    const withNextAction = { ...tracking, nextActionAt: nextActionIso };
    sendMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'GET_TRACKINGS') {
        return Promise.resolve({ type: 'TRACKINGS_RESULT', payload: [withNextAction] });
      }
      if (message.type === 'GET_GENERATED_ASSETS') {
        return Promise.resolve({ type: 'GENERATED_ASSETS_RESULT', payload: [] });
      }
      if (message.type === 'UPDATE_TRACKING_DETAILS') {
        return Promise.resolve(persistenceFailure('details'));
      }
      return Promise.resolve({ type: 'NOOP' });
    });
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(ApplicationsPage, { target });
    await tick();
    await flush();

    const input = target.querySelector('#application-next-action') as HTMLInputElement;
    expect(input.value).toBe(expectedLocalInput);
    clickButton(target, 'Effacer');
    await flush();
    await tick();

    expect(input.value).toBe(expectedLocalInput);
    expect(showToast).toHaveBeenCalledWith(
      'Impossible d’enregistrer les détails de suivi.',
      'error'
    );
  });

  it('handles a rejected Undo restore with an error toast', async () => {
    sendMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'GET_TRACKINGS') {
        return Promise.resolve({ type: 'TRACKINGS_RESULT', payload: [tracking] });
      }
      if (message.type === 'GET_GENERATED_ASSETS') {
        return Promise.resolve({ type: 'GENERATED_ASSETS_RESULT', payload: [] });
      }
      if (message.type === 'UPDATE_TRACKING') {
        return Promise.resolve({
          type: 'TRACKING_UPDATED',
          payload: {
            ...tracking,
            currentStatus: 'applied',
            history: [
              ...tracking.history,
              {
                from: 'application_prepared',
                to: 'applied',
                timestamp: 4,
                note: null,
              },
            ],
          },
        });
      }
      if (message.type === 'RESTORE_TRACKING') {
        return Promise.resolve(persistenceFailure('restore'));
      }
      return Promise.resolve({ type: 'NOOP' });
    });
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(ApplicationsPage, { target });
    await tick();
    await flush();

    clickButton(target, 'Candidaté');
    await flush();
    const action = showToastAction.mock.calls.at(-1)?.[2] as { onClick: () => void } | undefined;
    expect(action).toBeDefined();
    action?.onClick();
    await flush();

    expect(showToast).toHaveBeenCalledWith('Impossible d’annuler la modification.', 'error');
  });

  it.each(['accepted', 'rejected', 'archived'] as const)(
    'does not expose follow-up scheduling for terminal status %s',
    async (currentStatus) => {
      const terminalTracking: MissionTracking = {
        ...tracking,
        currentStatus,
        history: [
          ...tracking.history,
          {
            from: 'application_prepared',
            to: currentStatus,
            timestamp: 4,
            note: null,
          },
        ],
        nextActionAt: null,
      };
      sendMessage.mockImplementation((message: { type: string }) => {
        if (message.type === 'GET_TRACKINGS') {
          return Promise.resolve({ type: 'TRACKINGS_RESULT', payload: [terminalTracking] });
        }
        if (message.type === 'GET_GENERATED_ASSETS') {
          return Promise.resolve({ type: 'GENERATED_ASSETS_RESULT', payload: [] });
        }
        return Promise.resolve({ type: 'NOOP' });
      });
      const target = document.createElement('div');
      document.body.appendChild(target);
      mount(ApplicationsPage, { target });
      await tick();
      await flush();

      expect(target.querySelector('#application-next-action')).toBeNull();
      expect(target.textContent).toContain('Le suivi de relance est terminé');
    }
  );

  it('handles a tracking refresh failure after confirmed content generation', async () => {
    let trackingLoads = 0;
    sendMessage.mockImplementation((message: { type: string }) => {
      if (message.type === 'GET_TRACKINGS') {
        trackingLoads += 1;
        if (trackingLoads === 1) {
          return Promise.resolve({ type: 'TRACKINGS_RESULT', payload: [tracking] });
        }
        return Promise.resolve({
          type: 'TRACKING_FAILED',
          payload: {
            version: 1,
            code: 'LOAD_FAILED',
            intent: 'load',
            missionId: null,
            mutationId: null,
            message: 'Impossible de charger le suivi des candidatures.',
            recoverable: true,
          },
        });
      }
      if (message.type === 'GET_GENERATED_ASSETS') {
        return Promise.resolve({ type: 'GENERATED_ASSETS_RESULT', payload: [] });
      }
      if (message.type === 'GENERATE_ASSET') {
        return Promise.resolve({
          type: 'GENERATION_RESULT',
          payload: {
            asset: {
              id: 'asset-1',
              missionId: 'm1',
              type: 'pitch',
              content: 'Pitch confirmé',
              createdAt: 4,
              modelUsed: 'test',
            },
          },
        });
      }
      return Promise.resolve({ type: 'NOOP' });
    });
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(ApplicationsPage, { target });
    await tick();
    await flush();

    clickButton(target, 'Pitch candidature');
    await flush();
    await tick();

    expect(showToast).toHaveBeenCalledWith('Contenu généré', 'success');
    expect(showToast).toHaveBeenCalledWith(
      'Impossible de charger le suivi des candidatures.',
      'error'
    );
  });
});
