import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearTrackings,
  getAllTrackings,
  getTracking,
  getTrackingsByStatus,
  saveTracking,
  saveTrackings,
} from '../../../src/lib/shell/storage/tracking';
import type { ApplicationStatus, MissionTracking } from '../../../src/lib/core/types/tracking';

const TRACKING_DB_NAME = 'missionpulse';

const CANONICAL_STATUSES: readonly ApplicationStatus[] = [
  'detected',
  'selected',
  'application_prepared',
  'applied',
  'interview',
  'offer',
  'accepted',
  'rejected',
  'archived',
];

/**
 * Build a tracking record with an arbitrary STORED currentStatus. Canonical
 * statuses type-check directly; legacy values are forced through `unknown`
 * the same way real on-disk legacy records bypass the canonical union.
 */
function makeTracking(missionId: string, storedStatus: string): MissionTracking {
  const stage = storedStatus as unknown as ApplicationStatus;
  return {
    missionId,
    currentStatus: stage,
    history: [{ from: null, to: stage, timestamp: 1779436800000, note: null }],
    generatedAssetIds: [],
    userRating: null,
    notes: '',
    nextActionAt: null,
  };
}

const legacyTracking = {
  missionId: 'mission-legacy',
  currentStatus: 'interested',
  history: [
    { from: null, to: 'new', timestamp: 1779436800000, note: null },
    { from: 'new', to: 'interested', timestamp: 1779436900000, note: 'Bon fit' },
  ],
  generatedAssetIds: [],
  userRating: null,
  notes: 'Legacy local record',
  nextActionAt: null,
} as unknown as MissionTracking;

describe('tracking storage', () => {
  afterEach(async () => {
    await clearTrackings();
  });

  it('migrates legacy local tracking statuses when records are read', async () => {
    await saveTracking(legacyTracking);

    await expect(getTracking('mission-legacy')).resolves.toEqual({
      missionId: 'mission-legacy',
      currentStatus: 'selected',
      history: [
        { from: null, to: 'detected', timestamp: 1779436800000, note: null },
        { from: 'detected', to: 'selected', timestamp: 1779436900000, note: 'Bon fit' },
      ],
      generatedAssetIds: [],
      userRating: null,
      notes: 'Legacy local record',
      nextActionAt: null,
    });
  });

  it('filters migrated legacy statuses through canonical status queries', async () => {
    await saveTracking(legacyTracking);

    const selected = await getTrackingsByStatus('selected');
    const all = await getAllTrackings();

    expect(selected.map((tracking) => tracking.missionId)).toEqual(['mission-legacy']);
    expect(all[0]?.currentStatus).toBe('selected');
  });

  it('exposes a currentStatus index on the mission_tracking store', async () => {
    await saveTracking(legacyTracking);

    const indexNames = await new Promise<string[]>((resolve, reject) => {
      const req = indexedDB.open(TRACKING_DB_NAME);
      req.onsuccess = () => {
        const handle = req.result;
        const tx = handle.transaction('mission_tracking', 'readonly');
        const names = Array.from(tx.objectStore('mission_tracking').indexNames);
        handle.close();
        resolve(names);
      };
      req.onerror = () => reject(req.error);
    });
    expect(indexNames).toContain('currentStatus');
  });

  it('getTrackingsByStatus matches a full-table scan for every canonical status', async () => {
    // Mix of canonical and legacy stored statuses across many records.
    const mixed: MissionTracking[] = [
      makeTracking('m-det-1', 'detected'),
      makeTracking('m-det-legacy', 'new'),
      makeTracking('m-sel-1', 'selected'),
      makeTracking('m-sel-int', 'interested'),
      makeTracking('m-sel-draft', 'draft'),
      makeTracking('m-prep-1', 'application_prepared'),
      makeTracking('m-prep-legacy', 'applying'),
      makeTracking('m-applied', 'applied'),
      makeTracking('m-interview', 'interview'),
      makeTracking('m-offer', 'offer'),
      makeTracking('m-accepted', 'accepted'),
      makeTracking('m-rejected', 'rejected'),
      makeTracking('m-arch-1', 'archived'),
      makeTracking('m-arch-withdrawn', 'withdrawn'),
    ];
    await saveTrackings(mixed);

    const sortById = (a: MissionTracking, b: MissionTracking) =>
      a.missionId < b.missionId ? -1 : a.missionId > b.missionId ? 1 : 0;

    for (const status of CANONICAL_STATUSES) {
      const viaIndex = await getTrackingsByStatus(status);
      const viaScan = (await getAllTrackings()).filter((t) => t.currentStatus === status);

      // Same set of mission ids, and equal normalized payloads in missionId order.
      expect(viaIndex.map((t) => t.missionId).sort()).toEqual(
        viaScan.map((t) => t.missionId).sort()
      );
      expect([...viaIndex].sort(sortById)).toEqual([...viaScan].sort(sortById));
    }
  });

  it('getTrackingsByStatus returns results sorted by missionId', async () => {
    const order: MissionTracking[] = [
      makeTracking('zeta', 'selected'),
      makeTracking('alpha', 'selected'),
      makeTracking('mid', 'selected'),
    ];
    await saveTrackings(order);

    const selected = await getTrackingsByStatus('selected');
    expect(selected.map((t) => t.missionId)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('rejects a corrupted stored record instead of normalizing it to absence or empty success', async () => {
    const corrupted = {
      ...makeTracking('mission-corrupted', 'applied'),
      history: [{ from: null, to: 'selected', timestamp: 1779436800000, note: null }],
    } as MissionTracking;
    await saveTracking(corrupted);

    await expect(getTracking('mission-corrupted')).rejects.toThrow(
      'Invalid stored mission tracking'
    );
    await expect(getAllTrackings()).rejects.toThrow('Invalid stored mission tracking');
    await expect(getTrackingsByStatus('applied')).rejects.toThrow(
      'Invalid stored mission tracking'
    );
  });

  it('rejects a record with an invalid internal history entry instead of repairing it silently', async () => {
    const corrupted = {
      ...makeTracking('mission-corrupted-history', 'applied'),
      history: [
        { from: null, to: 'selected', timestamp: 1779436800000, note: null },
        { from: 'selected', to: 'unknown-stage', timestamp: 1779436850000, note: null },
        { from: 'selected', to: 'applied', timestamp: 1779436900000, note: null },
      ],
    } as unknown as MissionTracking;
    await saveTracking(corrupted);

    await expect(getTracking('mission-corrupted-history')).rejects.toThrow(
      'Invalid stored mission tracking'
    );
    await expect(getAllTrackings()).rejects.toThrow('Invalid stored mission tracking');
    await expect(getTrackingsByStatus('applied')).rejects.toThrow(
      'Invalid stored mission tracking'
    );
  });
});
