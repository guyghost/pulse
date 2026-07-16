import { describe, expect, it } from 'vitest';

import {
  DATASET_STARTUP_ERROR_MESSAGE_MAX_CHARS,
  datasetStartupCommandId,
  type DatasetStartupErrorV1,
} from '../../../src/models/dataset-startup.contract';
import {
  createDatasetEpochAuthority,
  DatasetEpochAuthorityError,
  type DatasetStartupFailureFenceCommandV1,
  type DatasetEpochAuthorityErrorCode,
  type DatasetMutationScopeV2,
  type DatasetWriteLeaseV1,
  type ResetAuthorityRequestV1,
} from '../../../src/lib/shell/storage/dataset-epoch-authority';

const uuid = (suffix: number): string =>
  `30000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

const WORKER_EPOCH = uuid(1);
const DATA_EPOCH = uuid(2);

function openingProof(dataEpoch = DATA_EPOCH, authorityRevision = 0) {
  return {
    version: 1 as const,
    attemptId: uuid(10),
    workerEpoch: WORKER_EPOCH,
    dataEpoch,
    authorityRevision,
    admission: 'open' as const,
    proofId: uuid(11),
  };
}

function expectAuthorityError(run: () => unknown, code: DatasetEpochAuthorityErrorCode): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(DatasetEpochAuthorityError);
  expect(caught).toMatchObject({ code });
}

async function expectAuthorityRejection(
  promise: Promise<unknown>,
  code: DatasetEpochAuthorityErrorCode
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DatasetEpochAuthorityError);
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected DatasetEpochAuthorityError ${code}.`);
}

function scope(operationId: string, dataEpoch = DATA_EPOCH): DatasetMutationScopeV2 {
  return { version: 2, operationId, dataEpoch };
}

function resetRequest(
  resetOperationId: string,
  nextDataEpoch: string,
  previousDataEpoch: string | null = DATA_EPOCH
): ResetAuthorityRequestV1 {
  return { version: 1, resetOperationId, previousDataEpoch, nextDataEpoch };
}

function startupPublicationFailure(
  message = 'Bootstrap publication failed.'
): DatasetStartupErrorV1 {
  return {
    version: 1,
    code: 'BOOTSTRAP_PUBLISH_FAILED',
    stage: 'bootstrap',
    message,
    retryable: true,
    destructiveEffectPerformed: false,
  };
}

function failureFenceCommand(
  failure: DatasetStartupErrorV1 = startupPublicationFailure()
): DatasetStartupFailureFenceCommandV1 {
  const proof = openingProof();
  return {
    version: 1,
    type: 'FENCE_STARTUP_FAILURE',
    attemptId: proof.attemptId,
    workerEpoch: proof.workerEpoch,
    commandId: datasetStartupCommandId('failure_fence', proof.attemptId),
    allowsDatabaseOpen: false,
    destructiveRepairAllowed: false,
    stage: 'failure_fence',
    dataEpoch: proof.dataEpoch,
    admissionProofId: proof.proofId,
    openedAuthorityRevision: proof.authorityRevision,
    failure,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function revokedProxy<T extends object>(value: T): T {
  const revocable = Proxy.revocable(value, {});
  revocable.revoke();
  return revocable.proxy;
}

describe('dataset epoch authority', () => {
  it('starts closed and rejects null, empty, or foreign epochs', () => {
    let allocations = 0;
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => {
        allocations += 1;
        return uuid(100 + allocations);
      },
    });

    expect(authority.snapshot()).toEqual({ status: 'closed_startup', authorityRevision: 0 });
    expectAuthorityError(
      () =>
        authority.issueLease({
          version: 2,
          operationId: uuid(3),
          dataEpoch: null,
        } as unknown as DatasetMutationScopeV2),
      'INVALID_SCOPE'
    );
    expectAuthorityError(() => authority.issueLease(scope(uuid(4), '')), 'INVALID_SCOPE');
    expectAuthorityError(() => authority.issueLease(scope(uuid(5), uuid(6))), 'ADMISSION_CLOSED');
    expect(allocations).toBe(0);
  });

  it('opens only from an exact proof and issues an immutable canonical lease', () => {
    let allocations = 0;
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => {
        allocations += 1;
        return uuid(110 + allocations);
      },
    });

    expectAuthorityError(
      () => authority.openAdmission({ ...openingProof(), extra: true }),
      'INVALID_OPENING_PROOF'
    );
    expectAuthorityError(
      () => authority.openAdmission({ ...openingProof(), workerEpoch: uuid(12) }),
      'INVALID_OPENING_PROOF'
    );
    expectAuthorityError(
      () => authority.openAdmission({ ...openingProof(), authorityRevision: 1 }),
      'INVALID_OPENING_PROOF'
    );
    expect(authority.snapshot()).toEqual({ status: 'closed_startup', authorityRevision: 0 });

    authority.openAdmission(openingProof());
    expect(authority.snapshot()).toEqual({
      status: 'open',
      dataEpoch: DATA_EPOCH,
      authorityRevision: 0,
    });
    const lease = authority.issueLease(scope(uuid(13)));
    expect(lease).toEqual({
      version: 1,
      leaseId: uuid(111),
      operationId: uuid(13),
      dataEpoch: DATA_EPOCH,
      authorityRevision: 0,
    });
    expect(Object.isFrozen(lease)).toBe(true);
    expect(Reflect.set(lease, 'dataEpoch', uuid(14))).toBe(false);
    expect(allocations).toBe(1);
  });

  it.each([
    {
      collision: 'attemptId/workerEpoch',
      proof: { ...openingProof(), attemptId: WORKER_EPOCH },
    },
    {
      collision: 'dataEpoch/workerEpoch',
      proof: { ...openingProof(), dataEpoch: WORKER_EPOCH },
    },
    {
      collision: 'proofId/attemptId',
      proof: { ...openingProof(), proofId: openingProof().attemptId },
    },
  ])('rejects an opening proof with a $collision identity collision', ({ proof }) => {
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(115),
    });

    expectAuthorityError(() => authority.openAdmission(proof), 'INVALID_OPENING_PROOF');
    expect(authority.snapshot()).toEqual({ status: 'closed_startup', authorityRevision: 0 });
  });

  it('captures exact scope descriptor values once without executing get traps', async () => {
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(116),
    });
    authority.openAdmission(openingProof());
    const describedOperationId = uuid(17);
    const substitutedOperationId = uuid(18);
    let getTrapReads = 0;
    const rawScope = new Proxy(scope(describedOperationId), {
      get(target, property, receiver) {
        getTrapReads += 1;
        return property === 'operationId'
          ? substitutedOperationId
          : Reflect.get(target, property, receiver);
      },
    });

    const lease = authority.issueLease(rawScope);

    expect(getTrapReads).toBe(0);
    expect(lease.operationId).toBe(describedOperationId);
    await expect(
      authority.commit(lease, describedOperationId, async () => 'descriptor-bound')
    ).resolves.toBe('descriptor-bound');
  });

  it('translates revoked opening proofs and scopes to typed validation errors', () => {
    let allocations = 0;
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(116 + ++allocations),
    });

    expectAuthorityError(
      () => authority.openAdmission(revokedProxy(openingProof())),
      'INVALID_OPENING_PROOF'
    );
    expect(authority.snapshot()).toEqual({ status: 'closed_startup', authorityRevision: 0 });

    authority.openAdmission(openingProof());
    expectAuthorityError(
      () => authority.issueLease(revokedProxy(scope(uuid(16)))),
      'INVALID_SCOPE'
    );
    expect(allocations).toBe(0);
    expect(authority.snapshot()).toEqual({
      status: 'open',
      dataEpoch: DATA_EPOCH,
      authorityRevision: 0,
    });
  });

  it('captures validated worker and allocator dependencies once', () => {
    const originalLeaseId = uuid(117);
    const deps = {
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => originalLeaseId,
    };
    const authority = createDatasetEpochAuthority(deps);
    deps.workerEpoch = uuid(118);
    deps.allocateLeaseId = () => uuid(119);

    authority.openAdmission(openingProof());
    expect(authority.issueLease(scope(uuid(19))).leaseId).toBe(originalLeaseId);
  });

  it('translates a revoked dependency bag to INVALID_CONFIGURATION', () => {
    const dependencies = revokedProxy({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(119),
    });

    expectAuthorityError(() => createDatasetEpochAuthority(dependencies), 'INVALID_CONFIGURATION');
  });

  it('rejects accessor or extra dependency keys without executing a getter', () => {
    let getterReads = 0;
    const accessorDependencies = Object.defineProperties(Object.create(null), {
      workerEpoch: {
        enumerable: true,
        get() {
          getterReads += 1;
          return WORKER_EPOCH;
        },
      },
      allocateLeaseId: {
        enumerable: true,
        value: () => uuid(120),
      },
    }) as {
      workerEpoch: string;
      allocateLeaseId: () => string;
    };

    expectAuthorityError(
      () => createDatasetEpochAuthority(accessorDependencies),
      'INVALID_CONFIGURATION'
    );
    expect(getterReads).toBe(0);

    expectAuthorityError(
      () =>
        createDatasetEpochAuthority({
          workerEpoch: WORKER_EPOCH,
          allocateLeaseId: () => uuid(121),
          unexpected: true,
        } as unknown as Parameters<typeof createDatasetEpochAuthority>[0]),
      'INVALID_CONFIGURATION'
    );
  });

  it('rejects a global lease ID collision without polluting the new operation binding', () => {
    const collidingLeaseId = uuid(120);
    const uniqueLeaseId = uuid(121);
    const allocated = [collidingLeaseId, collidingLeaseId, uniqueLeaseId];
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => allocated.shift() ?? uuid(122),
    });
    authority.openAdmission(openingProof());
    authority.issueLease(scope(uuid(22)));
    const secondOperationId = uuid(23);

    expectAuthorityError(
      () => authority.issueLease(scope(secondOperationId)),
      'LEASE_ID_COLLISION'
    );
    const recoveredLease = authority.issueLease(scope(secondOperationId));
    expect(recoveredLease.leaseId).toBe(uniqueLeaseId);
    expect(recoveredLease.operationId).toBe(secondOperationId);
  });

  it.each([
    { label: 'Error', thrown: new Error('allocator failed'), recoveredLeaseId: uuid(225) },
    { label: 'undefined', thrown: undefined, recoveredLeaseId: uuid(226) },
    { label: 'primitive', thrown: 'allocator failed', recoveredLeaseId: uuid(227) },
  ])(
    'normalizes allocator throw $label to INVALID_LEASE_ID without an outer binding',
    ({ thrown, recoveredLeaseId }) => {
      let allocations = 0;
      const operationId = uuid(224);
      const authority = createDatasetEpochAuthority({
        workerEpoch: WORKER_EPOCH,
        allocateLeaseId: () => {
          allocations += 1;
          if (allocations === 1) {
            throw thrown;
          }
          return recoveredLeaseId;
        },
      });
      authority.openAdmission(openingProof());

      expectAuthorityError(() => authority.issueLease(scope(operationId)), 'INVALID_LEASE_ID');
      const recoveredLease = authority.issueLease(scope(operationId));

      expect(recoveredLease).toMatchObject({ operationId, leaseId: recoveredLeaseId });
      expect(allocations).toBe(2);
    }
  );

  it('burns a reentrant allocation but creates no lease or operation binding after reset queues', async () => {
    const operationId = uuid(24);
    const resetOperationId = uuid(25);
    const nextDataEpoch = uuid(26);
    const burnedLeaseId = uuid(123);
    const recoveredLeaseId = uuid(124);
    const request = resetRequest(resetOperationId, nextDataEpoch);
    let allocations = 0;
    let resetPromise: ReturnType<
      ReturnType<typeof createDatasetEpochAuthority>['acquireResetFence']
    > | null = null;
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => {
        allocations += 1;
        if (allocations === 1) {
          resetPromise = authority.acquireResetFence(request);
          return burnedLeaseId;
        }
        return allocations === 2 ? burnedLeaseId : recoveredLeaseId;
      },
    });
    authority.openAdmission(openingProof());

    expectAuthorityError(() => authority.issueLease(scope(operationId)), 'ADMISSION_CLOSED');
    expect(allocations).toBe(1);
    expect(authority.snapshot()).toEqual({
      status: 'reset_pending',
      resetOperationId,
      previousDataEpoch: DATA_EPOCH,
      nextDataEpoch,
      authorityRevision: 0,
    });

    expect(resetPromise).not.toBeNull();
    const resetToken = await resetPromise!;
    await authority.installResetEpoch(resetToken);
    authority.openAdmission({
      ...openingProof(nextDataEpoch, 1),
      attemptId: uuid(27),
      proofId: uuid(28),
    });

    expectAuthorityError(
      () => authority.issueLease(scope(operationId, nextDataEpoch)),
      'LEASE_ID_COLLISION'
    );
    const recoveredLease = authority.issueLease(scope(operationId, nextDataEpoch));
    expect(recoveredLease).toMatchObject({
      leaseId: recoveredLeaseId,
      operationId,
      dataEpoch: nextDataEpoch,
      authorityRevision: 1,
    });
    expect(allocations).toBe(3);
  });

  it('keeps the inner canonical lease when allocation reenters the same operation', async () => {
    const operationId = uuid(228);
    const secondOperationId = uuid(229);
    const innerLeaseId = uuid(230);
    const burnedOuterLeaseId = uuid(231);
    const recoveredLeaseId = uuid(232);
    let allocations = 0;
    let innerLease: DatasetWriteLeaseV1 | undefined;
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => {
        allocations += 1;
        if (allocations === 1) {
          innerLease = authority.issueLease(scope(operationId));
          return burnedOuterLeaseId;
        }
        if (allocations === 2) {
          return innerLeaseId;
        }
        return allocations === 3 ? burnedOuterLeaseId : recoveredLeaseId;
      },
    });
    authority.openAdmission(openingProof());

    const outerLease = authority.issueLease(scope(operationId));

    expect(innerLease).toBeDefined();
    expect(outerLease).toBe(innerLease);
    expect(outerLease.leaseId).toBe(innerLeaseId);
    expect(authority.issueLease(scope(operationId))).toBe(innerLease);
    expect(allocations).toBe(2);
    await expect(authority.commit(outerLease, operationId, async () => 'canonical')).resolves.toBe(
      'canonical'
    );

    expectAuthorityError(
      () => authority.issueLease(scope(secondOperationId)),
      'LEASE_ID_COLLISION'
    );
    const recoveredLease = authority.issueLease(scope(secondOperationId));
    expect(recoveredLease.leaseId).toBe(recoveredLeaseId);
    expect(allocations).toBe(4);
  });

  it('binds one operation to one epoch and returns no fresh duplicate lease', () => {
    let allocations = 0;
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(120 + ++allocations),
    });
    authority.openAdmission(openingProof());

    const operationId = uuid(20);
    const first = authority.issueLease(scope(operationId));
    const duplicate = authority.issueLease(scope(operationId));
    expect(duplicate).toBe(first);
    expect(allocations).toBe(1);
    expectAuthorityError(
      () => authority.issueLease(scope(operationId, uuid(21))),
      'OPERATION_REBOUND'
    );
    expect(allocations).toBe(1);
  });

  it.each([
    {
      identity: 'leaseId',
      code: 'LEASE_ID_MISMATCH' as const,
      lease: (value: DatasetWriteLeaseV1) => ({ ...value, leaseId: uuid(30) }),
      operationId: (value: DatasetWriteLeaseV1) => value.operationId,
    },
    {
      identity: 'operationId',
      code: 'OPERATION_ID_MISMATCH' as const,
      lease: (value: DatasetWriteLeaseV1) => value,
      operationId: () => uuid(31),
    },
    {
      identity: 'dataEpoch',
      code: 'DATA_EPOCH_MISMATCH' as const,
      lease: (value: DatasetWriteLeaseV1) => ({ ...value, dataEpoch: uuid(32) }),
      operationId: (value: DatasetWriteLeaseV1) => value.operationId,
    },
    {
      identity: 'authorityRevision',
      code: 'AUTHORITY_REVISION_MISMATCH' as const,
      lease: (value: DatasetWriteLeaseV1) => ({
        ...value,
        authorityRevision: value.authorityRevision + 1,
      }),
      operationId: (value: DatasetWriteLeaseV1) => value.operationId,
    },
  ])('rejects a substituted $identity before the durable effect', async (testCase) => {
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(130),
    });
    authority.openAdmission(openingProof());
    const lease = authority.issueLease(scope(uuid(33)));
    let writes = 0;

    await expect(
      authority.commit(testCase.lease(lease), testCase.operationId(lease), async () => {
        writes += 1;
        return 'written';
      })
    ).rejects.toMatchObject({ code: testCase.code });
    expect(writes).toBe(0);
  });

  it('rejects a non-callable durable effect synchronously before entering the queue', async () => {
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(135),
    });
    authority.openAdmission(openingProof());
    const lease = authority.issueLease(scope(uuid(34)));

    expectAuthorityError(
      () => authority.commit(lease, lease.operationId, null as unknown as () => Promise<never>),
      'INVALID_DURABLE_EFFECT'
    );
    await expect(
      authority.commit(lease, lease.operationId, async () => 'queue-remains-usable')
    ).resolves.toBe('queue-remains-usable');
  });

  it('rejects revoked lease, reset, failure command, and nested failure Proxies fail-closed', async () => {
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(136),
    });
    authority.openAdmission(openingProof());
    const lease = authority.issueLease(scope(uuid(35)));
    let writes = 0;

    await expectAuthorityRejection(
      authority.commit(revokedProxy({ ...lease }), lease.operationId, async () => {
        writes += 1;
      }),
      'INVALID_LEASE'
    );
    expect(writes).toBe(0);

    let resetPromise: Promise<unknown> | undefined;
    expect(() => {
      resetPromise = authority.acquireResetFence(revokedProxy(resetRequest(uuid(36), uuid(37))));
    }).not.toThrow();
    await expectAuthorityRejection(resetPromise!, 'INVALID_RESET_REQUEST');

    let failurePromise: Promise<unknown> | undefined;
    expect(() => {
      failurePromise = authority.fenceFailure(revokedProxy(failureFenceCommand()));
    }).not.toThrow();
    await expectAuthorityRejection(failurePromise!, 'INVALID_FAILURE_FENCE');

    const nestedRevokedFailure = revokedProxy(startupPublicationFailure());
    await expectAuthorityRejection(
      authority.fenceFailure(failureFenceCommand(nestedRevokedFailure)),
      'INVALID_FAILURE_FENCE'
    );
    expect(authority.snapshot()).toEqual({
      status: 'open',
      dataEpoch: DATA_EPOCH,
      authorityRevision: 0,
    });
  });

  it('serializes commits FIFO and holds the gate until the durable promise settles', async () => {
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: (() => {
        let id = 140;
        return () => uuid(++id);
      })(),
    });
    authority.openAdmission(openingProof());
    const firstLease = authority.issueLease(scope(uuid(40)));
    const secondLease = authority.issueLease(scope(uuid(41)));
    const firstEffect = deferred<string>();
    const secondEffect = deferred<string>();
    const entered: string[] = [];

    const firstCommit = authority.commit(firstLease, firstLease.operationId, () => {
      entered.push('first');
      return firstEffect.promise;
    });
    const secondCommit = authority.commit(secondLease, secondLease.operationId, () => {
      entered.push('second');
      return secondEffect.promise;
    });

    await Promise.resolve();
    expect(entered).toEqual(['first']);
    firstEffect.resolve('first-result');
    await expect(firstCommit).resolves.toBe('first-result');
    await Promise.resolve();
    expect(entered).toEqual(['first', 'second']);
    secondEffect.resolve('second-result');
    await expect(secondCommit).resolves.toBe('second-result');
  });

  it('continues the FIFO commit queue after a durable rejection', async () => {
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: (() => {
        let id = 150;
        return () => uuid(++id);
      })(),
    });
    authority.openAdmission(openingProof());
    const failedLease = authority.issueLease(scope(uuid(42)));
    const nextLease = authority.issueLease(scope(uuid(43)));
    const failedEffect = deferred<string>();
    const entered: string[] = [];

    const failedCommit = authority.commit(failedLease, failedLease.operationId, () => {
      entered.push('failed');
      return failedEffect.promise;
    });
    const nextCommit = authority.commit(nextLease, nextLease.operationId, async () => {
      entered.push('next');
      return 'recovered';
    });

    await Promise.resolve();
    expect(entered).toEqual(['failed']);
    const durableFailure = new Error('durable failure');
    failedEffect.reject(durableFailure);
    await expect(failedCommit).rejects.toBe(durableFailure);
    await expect(nextCommit).resolves.toBe('recovered');
    expect(entered).toEqual(['failed', 'next']);
  });

  it('waits for an admitted durable commit, then revokes leases before resolving reset', async () => {
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(160),
    });
    authority.openAdmission(openingProof());
    const lease = authority.issueLease(scope(uuid(50)));
    const durable = deferred<void>();
    let entered = 0;
    const commit = authority.commit(lease, lease.operationId, () => {
      entered += 1;
      return durable.promise;
    });
    await Promise.resolve();
    expect(entered).toBe(1);

    const resetOperationId = uuid(51);
    const nextDataEpoch = uuid(54);
    let resetResolved = false;
    const reset = authority
      .acquireResetFence(resetRequest(resetOperationId, nextDataEpoch))
      .then((token) => {
        resetResolved = true;
        return token;
      });
    await Promise.resolve();
    expect(resetResolved).toBe(false);
    expect(authority.snapshot()).toEqual({
      status: 'reset_pending',
      resetOperationId,
      previousDataEpoch: DATA_EPOCH,
      nextDataEpoch,
      authorityRevision: 0,
    });

    durable.resolve();
    await expect(commit).resolves.toBeUndefined();
    const token = await reset;
    expect(token).toEqual({
      version: 1,
      workerEpoch: WORKER_EPOCH,
      resetOperationId,
      previousDataEpoch: DATA_EPOCH,
      nextDataEpoch,
      authorityRevision: 1,
    });
    expect(Object.isFrozen(token)).toBe(true);
    expect(authority.snapshot()).toEqual({
      status: 'reset_owned',
      resetOperationId,
      previousDataEpoch: DATA_EPOCH,
      nextDataEpoch,
      authorityRevision: 1,
    });
    await expect(
      authority.commit(lease, lease.operationId, async () => 'stale')
    ).rejects.toMatchObject({ code: 'LEASE_REVOKED' });
    expectAuthorityError(() => authority.issueLease(scope(lease.operationId)), 'LEASE_REVOKED');
  });

  it('lets a reset queued before commit revoke the old lease with zero durable write', async () => {
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(170),
    });
    authority.openAdmission(openingProof());
    const lease = authority.issueLease(scope(uuid(52)));
    let writes = 0;

    const reset = authority.acquireResetFence(resetRequest(uuid(53), uuid(54)));
    const staleCommit = authority.commit(lease, lease.operationId, async () => {
      writes += 1;
      return 'written';
    });

    await expect(reset).resolves.toMatchObject({ authorityRevision: 1 });
    await expect(staleCommit).rejects.toMatchObject({ code: 'LEASE_REVOKED' });
    expect(writes).toBe(0);
  });

  it('closes lease issuance when reset queues without overtaking an earlier queued commit', async () => {
    let allocations = 0;
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(170 + ++allocations),
    });
    authority.openAdmission(openingProof());
    const firstLease = authority.issueLease(scope(uuid(55)));
    const queuedLease = authority.issueLease(scope(uuid(56)));
    const firstDurable = deferred<string>();
    const entered: string[] = [];
    const firstCommit = authority.commit(firstLease, firstLease.operationId, () => {
      entered.push('first');
      return firstDurable.promise;
    });
    const queuedCommit = authority.commit(queuedLease, queuedLease.operationId, async () => {
      entered.push('queued-before-reset');
      return 'queued-written';
    });
    await Promise.resolve();
    expect(entered).toEqual(['first']);

    const request = resetRequest(uuid(57), uuid(58));
    const reset = authority.acquireResetFence(request);
    expect(authority.snapshot()).toMatchObject({
      status: 'reset_pending',
      resetOperationId: request.resetOperationId,
      nextDataEpoch: request.nextDataEpoch,
    });
    expectAuthorityError(() => authority.issueLease(scope(uuid(59))), 'ADMISSION_CLOSED');
    expect(allocations).toBe(2);

    firstDurable.resolve('first-written');
    await expect(firstCommit).resolves.toBe('first-written');
    await expect(queuedCommit).resolves.toBe('queued-written');
    await expect(reset).resolves.toMatchObject({
      resetOperationId: request.resetOperationId,
      previousDataEpoch: request.previousDataEpoch,
      nextDataEpoch: request.nextDataEpoch,
    });
    expect(entered).toEqual(['first', 'queued-before-reset']);
  });

  it('rejects reset identity collisions or epoch mismatch before taking a queue position', async () => {
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(176),
    });
    authority.openAdmission(openingProof());

    await expect(
      authority.acquireResetFence(resetRequest(uuid(73), WORKER_EPOCH))
    ).rejects.toMatchObject({ code: 'INVALID_RESET_REQUEST' });
    await expect(
      authority.acquireResetFence(resetRequest(uuid(74), uuid(75), uuid(76)))
    ).rejects.toMatchObject({ code: 'RESET_EPOCH_MISMATCH' });
    expect(authority.snapshot()).toEqual({
      status: 'open',
      dataEpoch: DATA_EPOCH,
      authorityRevision: 0,
    });
  });

  it('captures the exact reset request without executing get traps', async () => {
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(177),
    });
    authority.openAdmission(openingProof());
    const request = resetRequest(uuid(77), uuid(78));
    let getTrapReads = 0;
    const rawRequest = new Proxy(request, {
      get(target, property, receiver) {
        getTrapReads += 1;
        return property === 'resetOperationId' ? uuid(79) : Reflect.get(target, property, receiver);
      },
    });

    const token = await authority.acquireResetFence(rawRequest);

    expect(getTrapReads).toBe(0);
    expect(token).toMatchObject(request);
  });

  it('installs the next epoch only with the exact reset token and keeps admission closed', async () => {
    let allocations = 180;
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(++allocations),
    });
    authority.openAdmission(openingProof());
    const oldOperationId = uuid(60);
    const oldLease = authority.issueLease(scope(oldOperationId));
    const nextEpoch = uuid(62);
    const token = await authority.acquireResetFence(resetRequest(uuid(61), nextEpoch));

    await expect(authority.installResetEpoch({ ...token })).rejects.toMatchObject({
      code: 'INVALID_RESET_TOKEN',
    });
    await expect(authority.installResetEpoch(token)).resolves.toBeUndefined();
    expect(authority.snapshot()).toEqual({ status: 'closed_startup', authorityRevision: 1 });
    expectAuthorityError(
      () => authority.issueLease(scope(uuid(63), nextEpoch)),
      'ADMISSION_CLOSED'
    );
    expectAuthorityError(
      () => authority.issueLease(scope(oldOperationId, nextEpoch)),
      'OPERATION_REBOUND'
    );
    await expect(authority.installResetEpoch(token)).rejects.toMatchObject({
      code: 'INVALID_RESET_TOKEN',
    });

    expectAuthorityError(
      () =>
        authority.openAdmission({
          ...openingProof(DATA_EPOCH, 1),
          attemptId: uuid(65),
          proofId: uuid(66),
        }),
      'INVALID_OPENING_PROOF'
    );
    authority.openAdmission({
      ...openingProof(nextEpoch, 1),
      attemptId: uuid(67),
      proofId: uuid(68),
    });
    expect(authority.snapshot()).toEqual({
      status: 'open',
      dataEpoch: nextEpoch,
      authorityRevision: 1,
    });

    let staleWrites = 0;
    await expect(
      authority.commit(oldLease, oldOperationId, async () => {
        staleWrites += 1;
      })
    ).rejects.toMatchObject({ code: 'LEASE_REVOKED' });
    expect(staleWrites).toBe(0);
    expectAuthorityError(
      () => authority.issueLease(scope(oldOperationId, nextEpoch)),
      'OPERATION_REBOUND'
    );
    const nextLease = authority.issueLease(scope(uuid(69), nextEpoch));
    await expect(
      authority.commit(nextLease, nextLease.operationId, async () => 'next-written')
    ).resolves.toBe('next-written');
  });

  it('fences failures through the commit gate and returns the exact closure proof', async () => {
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(190),
    });
    authority.openAdmission(openingProof());
    const lease = authority.issueLease(scope(uuid(70)));
    const durable = deferred<string>();
    const commit = authority.commit(lease, lease.operationId, () => durable.promise);
    await Promise.resolve();

    let fenceResolved = false;
    const command = failureFenceCommand();
    const fence = authority.fenceFailure(command).then((proof) => {
      fenceResolved = true;
      return proof;
    });
    await Promise.resolve();
    expect(fenceResolved).toBe(false);
    expect(authority.snapshot()).toEqual({
      status: 'open',
      dataEpoch: DATA_EPOCH,
      authorityRevision: 0,
    });

    durable.resolve('written-before-fence');
    await expect(commit).resolves.toBe('written-before-fence');
    const fenceProof = await fence;
    expect(Object.isFrozen(fenceProof)).toBe(true);
    expect(fenceProof).toEqual({
      version: 1,
      attemptId: command.attemptId,
      workerEpoch: command.workerEpoch,
      dataEpoch: command.dataEpoch,
      admissionProofId: command.admissionProofId,
      previousAuthorityRevision: command.openedAuthorityRevision,
      authorityRevision: 1,
      admission: 'closed',
      activeLeaseCount: 0,
      allLeasesRevoked: true,
    });
    const failureSnapshot = authority.snapshot();
    expect(failureSnapshot).toEqual({
      status: 'fenced_failure',
      authorityRevision: 1,
      failure: command.failure,
    });
    expect(Object.isFrozen(failureSnapshot)).toBe(true);
    expect(failureSnapshot.status).toBe('fenced_failure');
    if (failureSnapshot.status !== 'fenced_failure') {
      throw new Error('Expected a fenced failure snapshot.');
    }
    expect(Object.isFrozen(failureSnapshot.failure)).toBe(true);

    let staleWrites = 0;
    await expect(
      authority.commit(lease, lease.operationId, async () => {
        staleWrites += 1;
      })
    ).rejects.toMatchObject({ code: 'LEASE_REVOKED' });
    expect(staleWrites).toBe(0);
    expectAuthorityError(() => authority.issueLease(scope(uuid(71))), 'ADMISSION_CLOSED');
    await expect(
      authority.acquireResetFence(resetRequest(uuid(72), uuid(73)))
    ).rejects.toMatchObject({ code: 'FENCED_FAILURE' });
    expectAuthorityError(
      () => authority.openAdmission(openingProof(DATA_EPOCH, 1)),
      'INVALID_OPENING_PROOF'
    );
    await expect(authority.fenceFailure(command)).rejects.toMatchObject({
      code: 'FENCED_FAILURE',
    });
  });

  it.each([
    { label: 'free text', value: 'startup_publication_failed' },
    {
      label: 'whitespace message',
      value: failureFenceCommand(startupPublicationFailure('   ')),
    },
    {
      label: 'overlong message',
      value: failureFenceCommand(
        startupPublicationFailure('x'.repeat(DATASET_STARTUP_ERROR_MESSAGE_MAX_CHARS + 1))
      ),
    },
  ])('rejects a $label failure fence without changing admission', async ({ value }) => {
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(191),
    });
    authority.openAdmission(openingProof());

    await expect(
      authority.fenceFailure(value as DatasetStartupFailureFenceCommandV1)
    ).rejects.toMatchObject({ code: 'INVALID_FAILURE_FENCE' });
    expect(authority.snapshot()).toEqual({
      status: 'open',
      dataEpoch: DATA_EPOCH,
      authorityRevision: 0,
    });
  });

  it('captures the exact failure command and nested error without executing get traps', async () => {
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(192),
    });
    authority.openAdmission(openingProof());
    let getTrapReads = 0;
    const failure = new Proxy(startupPublicationFailure(), {
      get(target, property, receiver) {
        getTrapReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const command = new Proxy(failureFenceCommand(failure), {
      get(target, property, receiver) {
        getTrapReads += 1;
        return property === 'admissionProofId'
          ? uuid(193)
          : Reflect.get(target, property, receiver);
      },
    });

    const proof = await authority.fenceFailure(command);

    expect(getTrapReads).toBe(0);
    expect(proof.admissionProofId).toBe(openingProof().proofId);
    expect(authority.snapshot()).toMatchObject({
      status: 'fenced_failure',
      failure: startupPublicationFailure(),
    });
  });

  it('forbids failure fencing while reset owns the fence and preserves its exact token', async () => {
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(194),
    });
    authority.openAdmission(openingProof());
    const request = resetRequest(uuid(83), uuid(84));
    const token = await authority.acquireResetFence(request);
    const ownedSnapshot = authority.snapshot();

    await expect(authority.fenceFailure(failureFenceCommand())).rejects.toMatchObject({
      code: 'RESET_ALREADY_OWNED',
    });
    expect(authority.snapshot()).toBe(ownedSnapshot);
    await expect(authority.installResetEpoch(token)).resolves.toBeUndefined();
    expect(authority.snapshot()).toEqual({ status: 'closed_startup', authorityRevision: 1 });
  });

  it('fences permanently on revision overflow and performs no stale durable write', async () => {
    const authority = createDatasetEpochAuthority({
      workerEpoch: WORKER_EPOCH,
      allocateLeaseId: () => uuid(200),
      initialAuthorityRevision: Number.MAX_SAFE_INTEGER,
    });
    authority.openAdmission(openingProof(DATA_EPOCH, Number.MAX_SAFE_INTEGER));
    const lease = authority.issueLease(scope(uuid(80)));

    await expect(
      authority.acquireResetFence(resetRequest(uuid(81), uuid(83)))
    ).rejects.toMatchObject({ code: 'REVISION_OVERFLOW' });
    expect(authority.snapshot()).toMatchObject({
      status: 'fenced_failure',
      authorityRevision: Number.MAX_SAFE_INTEGER,
      failure: {
        version: 1,
        code: 'AUTHORITY_FENCE_FAILED',
        stage: 'failure_fence',
        retryable: false,
        destructiveEffectPerformed: false,
      },
    });

    let writes = 0;
    await expect(
      authority.commit(lease, lease.operationId, async () => {
        writes += 1;
      })
    ).rejects.toMatchObject({ code: 'LEASE_REVOKED' });
    expect(writes).toBe(0);
    await expect(
      authority.acquireResetFence(resetRequest(uuid(82), uuid(84)))
    ).rejects.toMatchObject({ code: 'FENCED_FAILURE' });
  });
});
