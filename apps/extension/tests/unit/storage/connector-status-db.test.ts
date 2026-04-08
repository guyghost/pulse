import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PersistedConnectorStatus } from '../../../src/lib/core/types/connector-status';
import {
  saveConnectorStatuses,
  getConnectorStatuses,
  clearConnectorStatuses,
} from '../../../src/lib/shell/storage/db';

function makeStatus(overrides: Partial<PersistedConnectorStatus> = {}): PersistedConnectorStatus {
  return {
    connectorId: 'free-work',
    connectorName: 'Free-Work',
    lastState: 'done',
    missionsCount: 42,
    error: null,
    lastSyncAt: 1710800000000,
    lastSuccessAt: 1710800000000,
    ...overrides,
  };
}

describe('connector_status IndexedDB store', () => {
  beforeEach(async () => {
    await clearConnectorStatuses();
  });

  it('saves and retrieves connector statuses', async () => {
    const statuses: PersistedConnectorStatus[] = [
      makeStatus({ connectorId: 'free-work', connectorName: 'Free-Work', missionsCount: 10 }),
      makeStatus({
        connectorId: 'malt',
        connectorName: 'Malt',
        missionsCount: 5,
        lastState: 'error',
        error: { code: 'AUTH_REQUIRED' },
        lastSuccessAt: null,
      }),
    ];

    await saveConnectorStatuses(statuses);
    const result = await getConnectorStatuses();

    expect(result).toHaveLength(2);

    const freeWork = result.find((s) => s.connectorId === 'free-work');
    expect(freeWork).toBeDefined();
    expect(freeWork!.connectorName).toBe('Free-Work');
    expect(freeWork!.missionsCount).toBe(10);
    expect(freeWork!.lastState).toBe('done');

    const malt = result.find((s) => s.connectorId === 'malt');
    expect(malt).toBeDefined();
    expect(malt!.connectorName).toBe('Malt');
    expect(malt!.lastState).toBe('error');
    expect(malt!.error).toEqual({ code: 'AUTH_REQUIRED' });
    expect(malt!.lastSuccessAt).toBeNull();
  });

  it('overwrites previous status on re-save (same connectorId)', async () => {
    await saveConnectorStatuses([
      makeStatus({ connectorId: 'free-work', missionsCount: 10, lastSyncAt: 1000 }),
    ]);
    await saveConnectorStatuses([
      makeStatus({ connectorId: 'free-work', missionsCount: 25, lastSyncAt: 2000 }),
    ]);

    const result = await getConnectorStatuses();
    expect(result).toHaveLength(1);
    expect(result[0].missionsCount).toBe(25);
    expect(result[0].lastSyncAt).toBe(2000);
  });

  it('clearConnectorStatuses empties the store', async () => {
    await saveConnectorStatuses([
      makeStatus({ connectorId: 'free-work' }),
      makeStatus({ connectorId: 'malt' }),
    ]);

    await clearConnectorStatuses();
    const result = await getConnectorStatuses();
    expect(result).toHaveLength(0);
  });
});
