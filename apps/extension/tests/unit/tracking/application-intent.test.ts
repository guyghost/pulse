import { describe, expect, it, vi } from 'vitest';
import { applicationIntentPath } from '../../../src/lib/core/tracking/application-intent';
import { createTracking, transitionStatus } from '../../../src/lib/core/tracking/transitions';
import { executeApplicationIntent } from '../../../src/lib/shell/facades/application-intent';
import type { ApplicationStatus, MissionTracking } from '../../../src/lib/core/types/tracking';
describe('explicit application intent', () => {
  it.each([null, 'detected', 'selected', 'application_prepared'] as const)(
    'opens without claiming sending and confirms from %s through valid steps',
    async (status) => {
      let record: MissionTracking | undefined;
      if (status) {
        record = createTracking('m', 1);
        for (const next of applicationIntentPath('detected', 'confirm')) {
          if (record.currentStatus === status) {
            break;
          }
          record = transitionStatus(record, next, 2)!;
        }
      }
      const store = {
        getTrackingForMission: () => record,
        transitionStatus: vi.fn(async (_id: string, target: ApplicationStatus) => {
          const next = transitionStatus(record ?? createTracking('m', 1), target, 3);
          if (!next) {
            throw new Error('invalid transition');
          }
          record = next;
          return record;
        }),
      };
      const openSource = vi.fn(async () => {});
      await executeApplicationIntent({ missionId: 'm', intent: 'open', store, openSource });
      expect(record?.currentStatus).not.toBe('applied');
      await executeApplicationIntent({ missionId: 'm', intent: 'confirm', store, openSource });
      expect(record?.currentStatus).toBe('applied');
      const calls = store.transitionStatus.mock.calls.length;
      await executeApplicationIntent({ missionId: 'm', intent: 'confirm', store, openSource });
      expect(store.transitionStatus).toHaveBeenCalledTimes(calls);
      expect(openSource).toHaveBeenCalledTimes(1);
    }
  );
  it.each(['applied', 'interview', 'offer', 'accepted', 'rejected', 'archived'] as const)(
    'preserves later stage %s',
    (status) => {
      expect(applicationIntentPath(status, 'open')).toEqual([]);
      expect(applicationIntentPath(status, 'confirm')).toEqual([]);
    }
  );
  it('does not change tracking after an opening failure', async () => {
    const store = { getTrackingForMission: () => undefined, transitionStatus: vi.fn() };
    await expect(
      executeApplicationIntent({
        missionId: 'm',
        intent: 'open',
        store,
        openSource: async () => {
          throw new Error('open failed');
        },
      })
    ).rejects.toThrow('open failed');
    expect(store.transitionStatus).not.toHaveBeenCalled();
  });
  it('stops and exposes a failed transition without claiming applied', async () => {
    const store = {
      getTrackingForMission: () => undefined,
      transitionStatus: vi.fn(async () => {
        throw new Error('persist failed');
      }),
    };
    await expect(
      executeApplicationIntent({ missionId: 'm', intent: 'confirm', store, openSource: vi.fn() })
    ).rejects.toThrow('persist failed');
    expect(store.transitionStatus).toHaveBeenCalledTimes(1);
  });
});
