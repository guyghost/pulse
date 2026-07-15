/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installChromeStubs } from '../../../src/dev/chrome-stubs';
import type { MissionTracking } from '../../../src/lib/core/types/tracking';

type TrackingResponse = { type: string; payload: unknown };

async function send(message: unknown): Promise<TrackingResponse> {
  return (await chrome.runtime.sendMessage(message)) as TrackingResponse;
}

/**
 * Regression test for the Applications domain dev-stub improvement (a):
 * UPDATE_TRACKING / UPDATE_TRACKING_DETAILS must persist real history and the
 * updated nextActionAt/status to a localStorage-backed store (mirroring the
 * GET_TRACKINGS shape), and RESTORE_TRACKING must save/delete. Previously the
 * dev stub returned an empty history and never persisted, so dev edits were
 * lost and the Applications page showed fake data after every reload.
 */
describe('dev chrome stub — tracking persistence', () => {
  beforeEach(() => {
    const globalRecord = globalThis as unknown as Record<string, unknown>;
    delete globalRecord.chrome;
    try {
      window.localStorage?.clear();
    } catch {
      // ignore
    }
    installChromeStubs();
  });

  it('GET_TRACKINGS seeds default trackings on fresh storage', async () => {
    const response = await send({ type: 'GET_TRACKINGS' });
    expect(response.type).toBe('TRACKINGS_RESULT');
    const trackings = response.payload as MissionTracking[];
    expect(trackings.length).toBeGreaterThan(0);
    expect(trackings.some((t) => t.missionId === 'mock-0')).toBe(true);
  });

  it('UPDATE_TRACKING transitions status, appends history, and persists', async () => {
    const updated = (await send({
      type: 'UPDATE_TRACKING',
      payload: { missionId: 'mock-0', status: 'application_prepared' },
    }).then((r) => r.payload)) as MissionTracking;

    expect(updated.missionId).toBe('mock-0');
    expect(updated.currentStatus).toBe('application_prepared');
    expect(updated.history.length).toBeGreaterThanOrEqual(3);
    expect(updated.history[updated.history.length - 1]).toEqual(
      expect.objectContaining({ to: 'application_prepared' })
    );

    // Persistence: a fresh GET_TRACKINGS reflects the transition.
    const after = await send({ type: 'GET_TRACKINGS' }).then((r) => r.payload as MissionTracking[]);
    const mock0 = after.find((t) => t.missionId === 'mock-0');
    expect(mock0?.currentStatus).toBe('application_prepared');
    expect(mock0?.history.length).toBeGreaterThanOrEqual(3);
  });

  it('UPDATE_TRACKING_DETAILS persists nextActionAt on an existing tracking', async () => {
    const updated = (await send({
      type: 'UPDATE_TRACKING_DETAILS',
      payload: { missionId: 'mock-1', nextActionAt: '2026-08-01T00:00:00.000Z' },
    }).then((r) => r.payload)) as MissionTracking;

    expect(updated.missionId).toBe('mock-1');
    expect(updated.nextActionAt).toBe('2026-08-01T00:00:00.000Z');
    // Real history is preserved (not wiped to []).
    expect(updated.history.length).toBeGreaterThan(0);

    const after = await send({ type: 'GET_TRACKINGS' }).then((r) => r.payload as MissionTracking[]);
    expect(after.find((t) => t.missionId === 'mock-1')?.nextActionAt).toBe(
      '2026-08-01T00:00:00.000Z'
    );
  });

  it('UPDATE_TRACKING_DETAILS creates a fresh tracking when none exists', async () => {
    const updated = (await send({
      type: 'UPDATE_TRACKING_DETAILS',
      payload: { missionId: 'mission-new', nextActionAt: '2026-09-01T00:00:00.000Z' },
    }).then((r) => r.payload)) as MissionTracking;

    expect(updated.missionId).toBe('mission-new');
    expect(updated.currentStatus).toBe('detected');
    expect(updated.nextActionAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('RESTORE_TRACKING saves a provided tracking and deletes on null', async () => {
    const snapshot: MissionTracking = {
      missionId: 'mission-restore',
      currentStatus: 'applied',
      history: [{ from: null, to: 'applied', timestamp: 1, note: null }],
      generatedAssetIds: [],
      userRating: null,
      notes: 'restored',
      nextActionAt: null,
    };

    const saved = await send({
      type: 'RESTORE_TRACKING',
      payload: { missionId: 'mission-restore', tracking: snapshot },
    });
    expect(saved).toEqual({
      type: 'TRACKING_RESTORED',
      payload: { missionId: 'mission-restore', tracking: snapshot },
    });

    const afterSave = await send({ type: 'GET_TRACKINGS' }).then(
      (r) => r.payload as MissionTracking[]
    );
    expect(afterSave.find((t) => t.missionId === 'mission-restore')).toEqual(snapshot);

    const cleared = await send({
      type: 'RESTORE_TRACKING',
      payload: { missionId: 'mission-restore', tracking: null },
    });
    expect(cleared.payload).toEqual({ missionId: 'mission-restore', tracking: null });

    const afterClear = await send({ type: 'GET_TRACKINGS' }).then(
      (r) => r.payload as MissionTracking[]
    );
    expect(afterClear.find((t) => t.missionId === 'mission-restore')).toBeUndefined();
  });

  it('keeps a confirmed empty tracking collection empty instead of reseeding fixtures', async () => {
    const initial = await send({ type: 'GET_TRACKINGS' }).then(
      (response) => response.payload as MissionTracking[]
    );
    for (const record of initial) {
      await send({
        type: 'RESTORE_TRACKING',
        payload: { missionId: record.missionId, tracking: null },
      });
    }

    await expect(
      send({ type: 'GET_TRACKINGS' }).then((response) => response.payload)
    ).resolves.toEqual([]);
  });

  it.each(['accepted', 'rejected', 'archived'] as const)(
    'rejects a non-null follow-up for terminal status %s without persisting it',
    async (currentStatus) => {
      const snapshot: MissionTracking = {
        missionId: `terminal-${currentStatus}`,
        currentStatus,
        history: [{ from: 'offer', to: currentStatus, timestamp: 1, note: null }],
        generatedAssetIds: [],
        userRating: null,
        notes: '',
        nextActionAt: null,
      };
      await send({
        type: 'RESTORE_TRACKING',
        payload: { missionId: snapshot.missionId, tracking: snapshot },
      });

      const response = await send({
        type: 'UPDATE_TRACKING_DETAILS',
        payload: {
          missionId: snapshot.missionId,
          nextActionAt: '2026-08-01T00:00:00.000Z',
        },
      });

      expect(response).toMatchObject({
        type: 'TRACKING_FAILED',
        payload: { code: 'INVALID_DETAILS', intent: 'details', missionId: snapshot.missionId },
      });
      const after = await send({ type: 'GET_TRACKINGS' }).then(
        (result) => result.payload as MissionTracking[]
      );
      expect(
        after.find((record) => record.missionId === snapshot.missionId)?.nextActionAt
      ).toBeNull();
    }
  );

  it('returns the same typed failure contract for an invalid transition', async () => {
    const response = await send({
      type: 'UPDATE_TRACKING',
      payload: { missionId: 'mock-0', status: 'accepted' },
    });

    expect(response).toEqual({
      type: 'TRACKING_FAILED',
      payload: {
        version: 1,
        code: 'INVALID_TRANSITION',
        intent: 'transition',
        missionId: 'mock-0',
        mutationId: null,
        message: 'Ce changement de statut n’est pas autorisé.',
        recoverable: false,
      },
    });
  });

  it('rejects a restore snapshot belonging to another mission', async () => {
    const snapshot = (await send({ type: 'GET_TRACKINGS' }).then(
      (response) => response.payload
    )) as MissionTracking[];
    const response = await send({
      type: 'RESTORE_TRACKING',
      payload: { missionId: 'mission-other', tracking: snapshot[0] },
    });

    expect(response).toEqual({
      type: 'TRACKING_FAILED',
      payload: {
        version: 1,
        code: 'INVALID_RESTORE',
        intent: 'restore',
        missionId: 'mission-other',
        mutationId: null,
        message: 'Cette annulation n’est pas valide.',
        recoverable: false,
      },
    });
  });
});
