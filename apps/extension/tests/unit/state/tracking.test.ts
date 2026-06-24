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

describe('tracking store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads trackings through the service worker bridge', async () => {
    bridgeMock.sendMessage.mockResolvedValue({
      type: 'TRACKINGS_RESULT',
      payload: [makeTracking()],
    });
    const store = createTrackingStore();

    await store.loadTrackings();

    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({
      type: 'GET_TRACKINGS',
      payload: {},
    });
    expect(store.state).toBe('loaded');
    expect(store.getTrackingForMission('mission-1')).toEqual(makeTracking());
    expect(trackingStorageMock.getAllTrackings).not.toHaveBeenCalled();
  });

  it('updates tracking status through the service worker bridge', async () => {
    const updated = makeTracking({ currentStatus: 'applied' });
    bridgeMock.sendMessage.mockResolvedValue({
      type: 'TRACKING_UPDATED',
      payload: updated,
    });
    const store = createTrackingStore();

    await store.transitionStatus('mission-1', 'applied', 'Candidature envoyee');

    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({
      type: 'UPDATE_TRACKING',
      payload: {
        missionId: 'mission-1',
        status: 'applied',
        note: 'Candidature envoyee',
      },
    });
    expect(store.getTrackingForMission('mission-1')).toEqual(updated);
    expect(trackingStorageMock.saveTracking).not.toHaveBeenCalled();
  });

  it('updates next action through the service worker bridge', async () => {
    const updated = makeTracking({ nextActionAt: '2026-05-25T09:00:00.000Z' });
    bridgeMock.sendMessage.mockResolvedValue({
      type: 'TRACKING_UPDATED',
      payload: updated,
    });
    const store = createTrackingStore();

    await store.updateNextActionAt('mission-1', '2026-05-25T09:00:00.000Z');

    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({
      type: 'UPDATE_TRACKING_DETAILS',
      payload: {
        missionId: 'mission-1',
        nextActionAt: '2026-05-25T09:00:00.000Z',
      },
    });
    expect(store.getTrackingForMission('mission-1')).toEqual(updated);
    expect(trackingStorageMock.saveTracking).not.toHaveBeenCalled();
  });

  it('restores a previous tracking snapshot through the service worker bridge', async () => {
    const previous = makeTracking({ currentStatus: 'selected' });
    bridgeMock.sendMessage.mockResolvedValue({
      type: 'TRACKING_RESTORED',
      payload: previous,
    });
    const store = createTrackingStore();

    await store.restoreTracking('mission-1', previous);

    expect(bridgeMock.sendMessage).toHaveBeenCalledWith({
      type: 'RESTORE_TRACKING',
      payload: { missionId: 'mission-1', tracking: previous },
    });
    expect(store.getTrackingForMission('mission-1')).toEqual(previous);
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
        payload: null,
      });
    const store = createTrackingStore();

    await store.loadTrackings();
    await store.restoreTracking('mission-1', null);

    expect(bridgeMock.sendMessage).toHaveBeenLastCalledWith({
      type: 'RESTORE_TRACKING',
      payload: { missionId: 'mission-1', tracking: null },
    });
    expect(store.getTrackingForMission('mission-1')).toBeUndefined();
    expect(trackingStorageMock.saveTracking).not.toHaveBeenCalled();
  });

  it('surfaces bridge failures without falling back to IndexedDB', async () => {
    bridgeMock.sendMessage.mockRejectedValue(new Error('bridge unavailable'));
    const store = createTrackingStore();

    await store.loadTrackings();

    expect(store.state).toBe('error');
    expect(store.error).toBe('bridge unavailable');
    expect(trackingStorageMock.getAllTrackings).not.toHaveBeenCalled();
  });
});
