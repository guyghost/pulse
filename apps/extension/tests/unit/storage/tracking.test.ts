import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearTrackings,
  getAllTrackings,
  getTracking,
  getTrackingsByStatus,
  saveTracking,
} from '../../../src/lib/shell/storage/tracking';
import type { MissionTracking } from '../../../src/lib/core/types/tracking';

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
});
