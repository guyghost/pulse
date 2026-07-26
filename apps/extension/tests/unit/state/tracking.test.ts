import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MissionTracking } from '../../../src/lib/core/types/tracking';

const bridgeMock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

const trackingStorageMock = vi.hoisted(() => ({
  getAllTrackings: vi.fn(),
  getTracking: vi.fn(),
  saveTracking: vi.fn(),
}));

vi.mock('../../../src/lib/shell/messaging/bridge', () => ({
  sendMessage: bridgeMock.sendMessage,
}));

vi.mock('../../../src/lib/shell/storage/tracking', () => trackingStorageMock);

import { createTrackingStore } from '../../../src/lib/state/tracking.svelte';

function makeTracking(overrides: Partial<MissionTracking> = {}): MissionTracking {
  return {
    missionId: 'mission-1',
    currentStatus: 'selected',
    history: [{ from: 'detected', to: 'selected', timestamp: 1779436800000, note: null }],
    generatedAssetIds: [],
    userRating: null,
    notes: '',
    nextActionAt: null,
    ...overrides,
  };
}

function trackingFailure(
  intent: 'load' | 'transition' | 'details' | 'restore',
  missionId: string | null,
  code:
    'LOAD_FAILED' | 'PERSIST_FAILED' | 'INVALID_TRANSITION' | 'INVALID_DETAILS' | 'INVALID_RESTORE',
  message: string,
  recoverable: boolean
) {
  return {
    type: 'TRACKING_FAILED',
    payload: {
      version: 1,
      code,
      intent,
      missionId,
      mutationId: null,
      message,
      recoverable,
    },
  };
}

describe('tracking store', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads trackings through the service worker bridge', async () => {
    bridgeMock.sendMessage.mockResolvedValue({
      type: 'TRACKINGS_RESULT',
      payload: [makeTracking()],
    });
    const store = createTrackingStore();

    const loaded = await store.loadTrackings();

    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({
      type: 'GET_TRACKINGS',
      payload: {},
    });
    expect(store.state).toBe('loaded');
    expect(loaded).toEqual([makeTracking()]);
    expect(store.getTrackingForMission('mission-1')).toEqual(makeTracking());
    expect(trackingStorageMock.getAllTrackings).not.toHaveBeenCalled();
  });

  it('updates tracking status through the service worker bridge', async () => {
    const previous = makeTracking();
    const updated = makeTracking({
      currentStatus: 'applied',
      history: [
        ...previous.history,
        { from: 'selected', to: 'applied', timestamp: 1779436801000, note: null },
      ],
    });
    bridgeMock.sendMessage.mockResolvedValue({
      type: 'TRACKING_UPDATED',
      payload: updated,
    });
    const store = createTrackingStore();

    const result = await store.transitionStatus('mission-1', 'applied', 'Candidature envoyee');

    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({
      type: 'UPDATE_TRACKING',
      payload: {
        missionId: 'mission-1',
        status: 'applied',
        note: 'Candidature envoyee',
      },
    });
    expect(store.getTrackingForMission('mission-1')).toEqual(updated);
    expect(result).toEqual(updated);
    expect(trackingStorageMock.saveTracking).not.toHaveBeenCalled();
  });

  it('updates next action through the service worker bridge', async () => {
    const updated = makeTracking({ nextActionAt: '2026-05-25T09:00:00.000Z' });
    bridgeMock.sendMessage.mockResolvedValue({
      type: 'TRACKING_UPDATED',
      payload: updated,
    });
    const store = createTrackingStore();

    const result = await store.updateNextActionAt('mission-1', '2026-05-25T09:00:00.000Z');

    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({
      type: 'UPDATE_TRACKING_DETAILS',
      payload: {
        missionId: 'mission-1',
        nextActionAt: '2026-05-25T09:00:00.000Z',
      },
    });
    expect(store.getTrackingForMission('mission-1')).toEqual(updated);
    expect(result).toEqual(updated);
    expect(trackingStorageMock.saveTracking).not.toHaveBeenCalled();
  });

  it('restores a previous tracking snapshot through the service worker bridge', async () => {
    const previous = makeTracking({ currentStatus: 'selected' });
    bridgeMock.sendMessage.mockResolvedValue({
      type: 'TRACKING_RESTORED',
      payload: { missionId: 'mission-1', tracking: previous },
    });
    const store = createTrackingStore();

    const result = await store.restoreTracking('mission-1', previous);

    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({
      type: 'RESTORE_TRACKING',
      payload: { missionId: 'mission-1', tracking: previous },
    });
    expect(store.getTrackingForMission('mission-1')).toEqual(previous);
    expect(result).toEqual(previous);
    expect(trackingStorageMock.saveTracking).not.toHaveBeenCalled();
  });

  it('removes local tracking state when undo restores an untracked mission', async () => {
    bridgeMock.sendMessage
      .mockResolvedValueOnce({
        type: 'TRACKINGS_RESULT',
        payload: [makeTracking()],
      })
      .mockResolvedValueOnce({
        type: 'TRACKING_RESTORED',
        payload: { missionId: 'mission-1', tracking: null },
      });
    const store = createTrackingStore();

    await store.loadTrackings();
    const result = await store.restoreTracking('mission-1', null);

    expect(bridgeMock.sendMessage).toHaveBeenLastCalledWith({
      type: 'RESTORE_TRACKING',
      payload: { missionId: 'mission-1', tracking: null },
    });
    expect(store.getTrackingForMission('mission-1')).toBeUndefined();
    expect(result).toBeNull();
    expect(trackingStorageMock.saveTracking).not.toHaveBeenCalled();
  });

  it('rejects transport failure without falling back to IndexedDB', async () => {
    bridgeMock.sendMessage.mockRejectedValue(new Error('bridge unavailable'));
    const store = createTrackingStore();

    await expect(store.loadTrackings()).rejects.toMatchObject({
      name: 'ApplicationTrackingError',
      code: 'TRANSPORT_ERROR',
      intent: 'load',
      missionId: null,
      recoverable: true,
    });

    expect(store.state).toBe('error');
    expect(store.error).toMatchObject({ code: 'TRANSPORT_ERROR' });
    expect(trackingStorageMock.getAllTrackings).not.toHaveBeenCalled();
  });

  it.each([
    ['transition', 'transitionStatus'] as const,
    ['details', 'updateNextActionAt'] as const,
    ['restore', 'restoreTracking'] as const,
  ])(
    'rejects remote %s failure and preserves the exact confirmed record',
    async (intent, method) => {
      const previous = makeTracking({ notes: 'canonical' });
      bridgeMock.sendMessage
        .mockResolvedValueOnce({ type: 'TRACKINGS_RESULT', payload: [previous] })
        .mockResolvedValueOnce(
          trackingFailure(
            intent,
            'mission-1',
            'PERSIST_FAILED',
            intent === 'transition'
              ? 'Impossible d’enregistrer le nouveau statut.'
              : intent === 'details'
                ? 'Impossible d’enregistrer les détails de suivi.'
                : 'Impossible d’annuler la modification.',
            true
          )
        );
      const store = createTrackingStore();
      await store.loadTrackings();

      const action =
        method === 'transitionStatus'
          ? store.transitionStatus('mission-1', 'applied')
          : method === 'updateNextActionAt'
            ? store.updateNextActionAt('mission-1', '2026-05-25T09:00:00.000Z')
            : store.restoreTracking('mission-1', null);

      await expect(action).rejects.toMatchObject({
        name: 'ApplicationTrackingError',
        code: 'PERSIST_FAILED',
        intent,
        missionId: 'mission-1',
      });
      expect(store.getTrackingForMission('mission-1')).toEqual(previous);
      expect(store.error).toMatchObject({ code: 'PERSIST_FAILED', intent });
    }
  );

  it('preserves the confirmed collection when load returns TRACKING_FAILED', async () => {
    const previous = makeTracking();
    bridgeMock.sendMessage
      .mockResolvedValueOnce({ type: 'TRACKINGS_RESULT', payload: [previous] })
      .mockResolvedValueOnce(
        trackingFailure(
          'load',
          null,
          'LOAD_FAILED',
          'Impossible de charger le suivi des candidatures.',
          true
        )
      );
    const store = createTrackingStore();
    await store.loadTrackings();

    await expect(store.loadTrackings()).rejects.toMatchObject({ code: 'LOAD_FAILED' });

    expect(store.state).toBe('error');
    expect(store.getTrackingForMission('mission-1')).toEqual(previous);
  });

  it.each([
    {
      label: 'wrong success mission',
      response: { type: 'TRACKING_UPDATED', payload: makeTracking({ missionId: 'mission-2' }) },
    },
    {
      label: 'wrong failure intent',
      response: trackingFailure(
        'details',
        'mission-1',
        'PERSIST_FAILED',
        'Impossible d’enregistrer les détails de suivi.',
        true
      ),
    },
    { label: 'unexpected variant', response: { type: 'TRACKINGS_RESULT', payload: [] } },
  ])('classifies $label as PROTOCOL_ERROR without mutating state', async ({ response }) => {
    const previous = makeTracking();
    bridgeMock.sendMessage
      .mockResolvedValueOnce({ type: 'TRACKINGS_RESULT', payload: [previous] })
      .mockResolvedValueOnce(response);
    const store = createTrackingStore();
    await store.loadTrackings();

    await expect(store.transitionStatus('mission-1', 'applied')).rejects.toMatchObject({
      code: 'PROTOCOL_ERROR',
      intent: 'transition',
      missionId: 'mission-1',
    });
    expect(store.getTrackingForMission('mission-1')).toEqual(previous);
  });

  it('does not let a restore success delete another mission', async () => {
    const previous = makeTracking();
    bridgeMock.sendMessage
      .mockResolvedValueOnce({ type: 'TRACKINGS_RESULT', payload: [previous] })
      .mockResolvedValueOnce({
        type: 'TRACKING_RESTORED',
        payload: { missionId: 'mission-2', tracking: null },
      });
    const store = createTrackingStore();
    await store.loadTrackings();

    await expect(store.restoreTracking('mission-1', null)).rejects.toMatchObject({
      code: 'PROTOCOL_ERROR',
    });
    expect(store.getTrackingForMission('mission-1')).toEqual(previous);
  });

  it.each([
    ['transport', new Error('ack lost')],
    [
      'protocol',
      {
        type: 'TRACKING_UPDATED',
        payload: makeTracking({ missionId: 'mission-other' }),
      },
    ],
  ] as const)(
    'requires a canonical load before retrying after %s uncertainty',
    async (kind, uncertainOutcome) => {
      const previous = makeTracking();
      bridgeMock.sendMessage.mockResolvedValueOnce({
        type: 'TRACKINGS_RESULT',
        payload: [previous],
      });
      if (kind === 'transport') {
        bridgeMock.sendMessage.mockRejectedValueOnce(uncertainOutcome);
      } else {
        bridgeMock.sendMessage.mockResolvedValueOnce(uncertainOutcome);
      }
      const store = createTrackingStore();
      await store.loadTrackings();

      await expect(store.transitionStatus('mission-1', 'applied')).rejects.toMatchObject({
        code: kind === 'transport' ? 'TRANSPORT_ERROR' : 'PROTOCOL_ERROR',
      });
      const callsAfterUncertainty = bridgeMock.sendMessage.mock.calls.length;

      await expect(store.transitionStatus('mission-1', 'applied')).rejects.toMatchObject({
        code: 'PROTOCOL_ERROR',
      });
      expect(bridgeMock.sendMessage).toHaveBeenCalledTimes(callsAfterUncertainty);
      expect(store.state).toBe('error');
      expect(store.getTrackingForMission('mission-1')).toEqual(previous);

      bridgeMock.sendMessage
        .mockResolvedValueOnce({ type: 'TRACKINGS_RESULT', payload: [previous] })
        .mockResolvedValueOnce({
          type: 'TRACKING_UPDATED',
          payload: makeTracking({
            currentStatus: 'applied',
            history: [
              ...previous.history,
              {
                from: 'selected',
                to: 'applied',
                timestamp: 1779436801000,
                note: null,
              },
            ],
          }),
        });

      await store.loadTrackings();
      await expect(store.transitionStatus('mission-1', 'applied')).resolves.toMatchObject({
        currentStatus: 'applied',
      });
    }
  );

  it.each([
    ['transport', new Error('reload unavailable')],
    ['protocol', { type: 'TRACKINGS_RESULT', payload: 'not-a-collection' }],
  ] as const)(
    'requires a canonical load before mutating after a %s load uncertainty',
    async (kind, uncertainOutcome) => {
      const previous = makeTracking();
      bridgeMock.sendMessage.mockResolvedValueOnce({
        type: 'TRACKINGS_RESULT',
        payload: [previous],
      });
      const store = createTrackingStore();
      await store.loadTrackings();

      if (kind === 'transport') {
        bridgeMock.sendMessage.mockRejectedValueOnce(uncertainOutcome);
      } else {
        bridgeMock.sendMessage.mockResolvedValueOnce(uncertainOutcome);
      }

      await expect(store.loadTrackings()).rejects.toMatchObject({
        code: kind === 'transport' ? 'TRANSPORT_ERROR' : 'PROTOCOL_ERROR',
      });
      const callsAfterUncertainty = bridgeMock.sendMessage.mock.calls.length;

      await expect(store.transitionStatus('mission-1', 'applied')).rejects.toMatchObject({
        code: 'PROTOCOL_ERROR',
      });
      expect(bridgeMock.sendMessage).toHaveBeenCalledTimes(callsAfterUncertainty);
      expect(store.state).toBe('error');
      expect(store.getTrackingForMission('mission-1')).toEqual(previous);

      const updated = makeTracking({
        currentStatus: 'applied',
        history: [
          ...previous.history,
          {
            from: 'selected',
            to: 'applied',
            timestamp: 1779436801000,
            note: null,
          },
        ],
      });
      bridgeMock.sendMessage
        .mockResolvedValueOnce({ type: 'TRACKINGS_RESULT', payload: [previous] })
        .mockResolvedValueOnce({ type: 'TRACKING_UPDATED', payload: updated });

      await store.loadTrackings();
      await expect(store.transitionStatus('mission-1', 'applied')).resolves.toEqual(updated);
    }
  );
});
