import { describe, expect, it } from 'vitest';

import { createDatasetEpochAuthority } from '../../../src/lib/shell/storage/dataset-epoch-authority';
import { createSettingsDatasetGate } from '../../../src/lib/shell/settings/settings-dataset-gate';

const uuid = (suffix: number): string =>
  `93000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('settings DatasetEpoch gate', () => {
  it('serializes repositories through DatasetEpochAuthority and exposes an exact lease capability', async () => {
    const workerEpoch = uuid(1);
    const dataEpoch = uuid(2);
    let leaseId = 100;
    const authority = createDatasetEpochAuthority({
      workerEpoch,
      allocateLeaseId: () => uuid(leaseId++),
    });
    authority.openAdmission({
      version: 1,
      attemptId: uuid(3),
      workerEpoch,
      dataEpoch,
      authorityRevision: 0,
      admission: 'open',
      proofId: uuid(4),
    });
    const gate = createSettingsDatasetGate(authority);
    const firstEntered = deferred();
    const releaseFirst = deferred();
    const order: string[] = [];

    const first = gate.runExclusive(
      { dataEpoch, operationId: uuid(10), purpose: 'pending_intent' },
      async (capability) => {
        order.push('first:start');
        expect(capability).toMatchObject({
          kind: 'DATASET_EPOCH_SETTINGS_LEASE',
          dataEpoch,
          operationId: uuid(10),
          authorityRevision: 0,
        });
        firstEntered.resolve();
        await releaseFirst.promise;
        order.push('first:end');
      }
    );
    await firstEntered.promise;
    const second = gate.runExclusive(
      { dataEpoch, operationId: uuid(11), purpose: 'pending_intent' },
      async () => {
        order.push('second');
      }
    );
    await Promise.resolve();
    expect(order).toEqual(['first:start']);

    releaseFirst.resolve();
    await Promise.all([first, second]);

    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });
});
