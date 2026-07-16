import { describe, expect, it } from 'vitest';

import {
  createDbHandleRegistry,
  type DbOpenOwner,
} from '../../../src/lib/shell/storage/db-handle-registry';
import {
  createDatasetEpochAuthority,
  type ResetAuthorityTokenV1,
} from '../../../src/lib/shell/storage/dataset-epoch-authority';

const uuid = (suffix: number): string =>
  `40000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

interface FakeDatabase {
  db: IDBDatabase;
  closeCalls(): number;
  versionchange(): void;
}

function fakeDatabase(
  closeError?: unknown,
  onClose?: () => void,
  throwsOnClose = closeError !== undefined
): FakeDatabase {
  let calls = 0;
  const db = {
    close() {
      calls += 1;
      onClose?.();
      if (throwsOnClose) {
        throw closeError;
      }
    },
    onversionchange: null,
  } as unknown as IDBDatabase;
  return {
    db,
    closeCalls: () => calls,
    versionchange: () => db.onversionchange?.({} as IDBVersionChangeEvent),
  };
}

async function resetToken(resetOperationId: string) {
  const authority = createDatasetEpochAuthority({
    workerEpoch: uuid(90),
    allocateLeaseId: () => uuid(91),
  });
  return authority.acquireResetFence({
    version: 1,
    resetOperationId,
    previousDataEpoch: null,
    nextDataEpoch: uuid(92),
  });
}

function createRegistry(activeToken: ResetAuthorityTokenV1 | null = null) {
  return createDbHandleRegistry({ getActiveResetToken: () => activeToken });
}

function createMutableRegistry(activeToken: ResetAuthorityTokenV1 | null = null) {
  let currentToken = activeToken;
  return {
    registry: createDbHandleRegistry({ getActiveResetToken: () => currentToken }),
    setActiveToken(token: ResetAuthorityTokenV1 | null) {
      currentToken = token;
    },
  };
}

describe('DB handle registry', () => {
  it('exposes distinct timeout and native-terminal APIs without ambiguous failOpen', () => {
    const registry = createRegistry();

    expect(registry.invalidateOpenForTimeout).toBeTypeOf('function');
    expect(registry.settleOpenFailure).toBeTypeOf('function');
    expect('failOpen' in registry).toBe(false);
  });

  it('registers a permitted handle with its exact owner', () => {
    const registry = createRegistry();
    const owner: DbOpenOwner = { kind: 'startup', attemptId: uuid(1) };
    const permit = registry.reserveOpen(owner);
    const database = fakeDatabase();

    expect(Object.isFrozen(permit)).toBe(true);
    expect(Object.isFrozen(permit.owner)).toBe(true);
    expect(permit.owner).toEqual(owner);

    const registered = registry.register(permit, database.db);

    expect(Object.isFrozen(registered)).toBe(true);
    expect(registered).toMatchObject({ db: database.db, owner });
    expect(registry.snapshot()).toMatchObject({
      status: 'open',
      reservationCount: 0,
      handleCount: 1,
      handles: [{ owner }],
    });
    expect(database.closeCalls()).toBe(0);
  });

  it('releases idempotently after unregistering and closes exactly once', () => {
    const registry = createRegistry();
    const database = fakeDatabase();
    registry.register(
      registry.reserveOpen({ kind: 'business', operationId: uuid(2) }),
      database.db
    );

    registry.release(database.db);
    registry.release(database.db);

    expect(database.closeCalls()).toBe(1);
    expect(registry.snapshot()).toMatchObject({ reservationCount: 0, handleCount: 0 });
  });

  it('routes versionchange through the same release path', () => {
    const registry = createRegistry();
    const database = fakeDatabase();
    registry.register(registry.reserveOpen({ kind: 'startup', attemptId: uuid(3) }), database.db);

    database.versionchange();
    database.versionchange();

    expect(database.closeCalls()).toBe(1);
    expect(registry.snapshot()).toMatchObject({ reservationCount: 0, handleCount: 0 });
  });

  it('invalidates non-reset reservations, closes all handles, and proves zero at the reset fence', async () => {
    const token = await resetToken(uuid(8));
    const harness = createMutableRegistry();
    const { registry } = harness;
    const first = fakeDatabase();
    const second = fakeDatabase();
    registry.register(registry.reserveOpen({ kind: 'startup', attemptId: uuid(4) }), first.db);
    registry.register(registry.reserveOpen({ kind: 'business', operationId: uuid(5) }), second.db);
    const pendingStartup = registry.reserveOpen({ kind: 'startup', attemptId: uuid(6) });
    const pendingBusiness = registry.reserveOpen({ kind: 'business', operationId: uuid(7) });
    harness.setActiveToken(token);
    expect(() => registry.enterResetFence(token)).toThrowError(
      expect.objectContaining({ code: 'REGISTRY_NOT_QUIESCENT' })
    );
    expect(registry.snapshot()).toMatchObject({
      reservationCount: 0,
      tombstoneCount: 2,
      handleCount: 0,
    });
    registry.settleOpenFailure(pendingStartup);
    registry.settleOpenFailure(pendingBusiness);
    const proof = registry.enterResetFence(token);

    expect(Object.isFrozen(proof)).toBe(true);
    expect(proof).toEqual({
      version: 1,
      status: 'handles_closed',
      workerEpoch: uuid(90),
      resetOperationId: uuid(8),
      fenceRevision: 1,
      reservationCount: 0,
      tombstoneCount: 0,
      handleCount: 0,
      closeInProgress: 0,
    });
    expect(first.closeCalls()).toBe(1);
    expect(second.closeCalls()).toBe(1);
    expect(registry.snapshot()).toMatchObject({
      status: 'reset_fenced',
      resetOwner: { resetOperationId: uuid(8), fenceRevision: 1 },
      reservationCount: 0,
      handleCount: 0,
    });
  });

  it('closes a late success from an invalidated permit without registering or delivering it', async () => {
    const token = await resetToken(uuid(10));
    const harness = createMutableRegistry();
    const { registry } = harness;
    const invalidatedPermit = registry.reserveOpen({ kind: 'startup', attemptId: uuid(9) });
    harness.setActiveToken(token);
    expect(() => registry.enterResetFence(token)).toThrowError(
      expect.objectContaining({ code: 'REGISTRY_NOT_QUIESCENT' })
    );
    const lateDatabase = fakeDatabase();

    expect(() => registry.register(invalidatedPermit, lateDatabase.db)).toThrowError(
      expect.objectContaining({ code: 'OPEN_RESERVATION_INVALIDATED' })
    );
    expect(() => registry.register(invalidatedPermit, lateDatabase.db)).toThrowError(
      expect.objectContaining({ code: 'OPEN_RESERVATION_INVALIDATED' })
    );

    expect(lateDatabase.closeCalls()).toBe(1);
    expect(registry.snapshot()).toMatchObject({
      reservationCount: 0,
      tombstoneCount: 0,
      handleCount: 0,
    });
    expect(registry.enterResetFence(token)).toMatchObject({ status: 'handles_closed' });
  });

  it.each([
    { kind: 'startup' as const, attemptId: uuid(11) },
    { kind: 'business' as const, operationId: uuid(12) },
  ])('denies a $kind open reservation while reset-fenced', async (owner) => {
    const token = await resetToken(uuid(13));
    const registry = createRegistry(token);
    registry.enterResetFence(token);

    expect(() => registry.reserveOpen(owner)).toThrowError(
      expect.objectContaining({ code: 'OPEN_DENIED_DURING_RESET' })
    );
    expect(registry.snapshot()).toMatchObject({ reservationCount: 0, handleCount: 0 });
  });

  it('allows only the matching reset owner to reserve the reinitializer', async () => {
    const resetOperationId = uuid(14);
    const token = await resetToken(resetOperationId);
    const registry = createRegistry(token);
    registry.enterResetFence(token);

    expect(() =>
      registry.reserveOpen({
        kind: 'reset',
        resetOperationId: uuid(15),
        fenceRevision: token.authorityRevision,
      })
    ).toThrowError(expect.objectContaining({ code: 'RESET_OWNER_MISMATCH' }));
    expect(() =>
      registry.reserveOpen({
        kind: 'reset',
        resetOperationId,
        fenceRevision: token.authorityRevision + 1,
      })
    ).toThrowError(expect.objectContaining({ code: 'RESET_OWNER_MISMATCH' }));

    const permit = registry.reserveOpen({
      kind: 'reset',
      resetOperationId,
      fenceRevision: token.authorityRevision,
    });
    const database = fakeDatabase();
    registry.register(permit, database.db);

    expect(permit.owner).toEqual({
      kind: 'reset',
      resetOperationId,
      fenceRevision: token.authorityRevision,
    });
    expect(registry.snapshot()).toMatchObject({ reservationCount: 0, handleCount: 1 });
    expect(database.closeCalls()).toBe(0);
  });

  it('rejects a substituted or foreign token as the first reset fence authority', async () => {
    let activeToken: ResetAuthorityTokenV1 | null = null;
    const registry = createDbHandleRegistry({ getActiveResetToken: () => activeToken });
    const exactToken = await resetToken(uuid(16));
    activeToken = exactToken;
    const substitutedToken = Object.freeze({ ...exactToken });
    const foreignToken = await resetToken(uuid(17));

    expect(() => registry.enterResetFence(substitutedToken)).toThrowError(
      expect.objectContaining({ code: 'INVALID_RESET_TOKEN' })
    );
    expect(() => registry.enterResetFence(foreignToken)).toThrowError(
      expect.objectContaining({ code: 'INVALID_RESET_TOKEN' })
    );
    expect(registry.snapshot()).toMatchObject({ status: 'open' });

    expect(registry.enterResetFence(exactToken)).toMatchObject({
      status: 'handles_closed',
      resetOperationId: uuid(16),
    });
    expect(() => registry.enterResetFence(substitutedToken)).toThrowError(
      expect.objectContaining({ code: 'INVALID_RESET_TOKEN' })
    );
  });

  it('keeps closing after a close exception, unregisters everything, and returns no false proof', async () => {
    const token = await resetToken(uuid(18));
    const harness = createMutableRegistry();
    const { registry } = harness;
    const closeFailure = new Error('native close failed');
    const failingDatabase = fakeDatabase(closeFailure);
    const healthyDatabase = fakeDatabase();
    registry.register(
      registry.reserveOpen({ kind: 'startup', attemptId: uuid(19) }),
      failingDatabase.db
    );
    registry.register(
      registry.reserveOpen({ kind: 'business', operationId: uuid(20) }),
      healthyDatabase.db
    );
    registry.reserveOpen({ kind: 'startup', attemptId: uuid(21) });
    harness.setActiveToken(token);

    let returnedProof: unknown;
    expect(() => {
      returnedProof = registry.enterResetFence(token);
    }).toThrow(closeFailure);

    expect(returnedProof).toBeUndefined();
    expect(failingDatabase.closeCalls()).toBe(1);
    expect(healthyDatabase.closeCalls()).toBe(1);
    expect(registry.snapshot()).toMatchObject({
      status: 'reset_fence_failed',
      reservationCount: 0,
      handleCount: 0,
    });
    expect(() => registry.enterResetFence(token)).toThrow(closeFailure);
    expect(() =>
      registry.reserveOpen({
        kind: 'reset',
        resetOperationId: token.resetOperationId,
        fenceRevision: token.authorityRevision,
      })
    ).toThrow(closeFailure);
    expect(failingDatabase.closeCalls()).toBe(1);
    expect(healthyDatabase.closeCalls()).toBe(1);
  });

  it('rejects a consumed or forged permit without closing an already active handle', () => {
    const registry = createRegistry();
    const database = fakeDatabase();
    const permit = registry.reserveOpen({ kind: 'business', operationId: uuid(22) });
    registry.register(permit, database.db);
    const forgedPermit = Object.freeze({
      ...permit,
      owner: Object.freeze({ ...permit.owner }),
    });

    expect(() => registry.register(permit, database.db)).toThrowError(
      expect.objectContaining({ code: 'HANDLE_ALREADY_REGISTERED' })
    );
    expect(() => registry.register(forgedPermit, database.db)).toThrowError(
      expect.objectContaining({ code: 'HANDLE_ALREADY_REGISTERED' })
    );

    expect(database.closeCalls()).toBe(0);
    expect(registry.snapshot()).toMatchObject({ reservationCount: 0, handleCount: 1 });
  });

  it('settles a terminal open failure idempotently and only consumes the exact permit', () => {
    const registry = createRegistry();
    const permit = registry.reserveOpen({ kind: 'startup', attemptId: uuid(23) });
    const forgedPermit = Object.freeze({
      ...permit,
      owner: Object.freeze({ ...permit.owner }),
    });

    registry.settleOpenFailure(forgedPermit);
    expect(registry.snapshot()).toMatchObject({ reservationCount: 1, handleCount: 0 });
    registry.settleOpenFailure(permit);
    registry.settleOpenFailure(permit);
    expect(registry.snapshot()).toMatchObject({ reservationCount: 0, handleCount: 0 });

    const lateDatabase = fakeDatabase();
    expect(() => registry.register(permit, lateDatabase.db)).toThrowError(
      expect.objectContaining({ code: 'OPEN_RESERVATION_INVALIDATED' })
    );
    expect(lateDatabase.closeCalls()).toBe(1);
  });

  it('accepts only exact data-only owners without executing accessors', () => {
    const registry = createRegistry();
    expect(() =>
      registry.reserveOpen({ kind: 'startup', attemptId: uuid(24), extra: true } as DbOpenOwner)
    ).toThrowError(expect.objectContaining({ code: 'INVALID_OWNER' }));
    expect(() =>
      registry.reserveOpen({ kind: 'business', operationId: '' } as DbOpenOwner)
    ).toThrowError(expect.objectContaining({ code: 'INVALID_OWNER' }));
    expect(() =>
      registry.reserveOpen({
        kind: 'reset',
        resetOperationId: uuid(25),
        fenceRevision: -1,
      })
    ).toThrowError(expect.objectContaining({ code: 'INVALID_OWNER' }));

    let accessorReads = 0;
    const accessorOwner = { kind: 'startup' } as Record<string, unknown>;
    Object.defineProperty(accessorOwner, 'attemptId', {
      enumerable: true,
      get() {
        accessorReads += 1;
        return uuid(26);
      },
    });
    expect(() => registry.reserveOpen(accessorOwner as unknown as DbOpenOwner)).toThrowError(
      expect.objectContaining({ code: 'INVALID_OWNER' })
    );
    expect(accessorReads).toBe(0);
    expect(registry.snapshot()).toMatchObject({ reservationCount: 0, handleCount: 0 });
  });

  it('denies reset opens after the authority token becomes stale', async () => {
    let activeToken: ResetAuthorityTokenV1 | null = await resetToken(uuid(27));
    const registry = createDbHandleRegistry({ getActiveResetToken: () => activeToken });
    const exactToken = activeToken;
    registry.enterResetFence(exactToken);
    activeToken = null;

    expect(() =>
      registry.reserveOpen({
        kind: 'reset',
        resetOperationId: exactToken.resetOperationId,
        fenceRevision: exactToken.authorityRevision,
      })
    ).toThrowError(expect.objectContaining({ code: 'INVALID_RESET_TOKEN' }));
    expect(registry.snapshot()).toMatchObject({ reservationCount: 0, handleCount: 0 });
  });

  it('closes a reset open result when its exact authority token became stale after reservation', async () => {
    let activeToken: ResetAuthorityTokenV1 | null = await resetToken(uuid(28));
    const registry = createDbHandleRegistry({ getActiveResetToken: () => activeToken });
    const exactToken = activeToken;
    registry.enterResetFence(exactToken);
    const permit = registry.reserveOpen({
      kind: 'reset',
      resetOperationId: exactToken.resetOperationId,
      fenceRevision: exactToken.authorityRevision,
    });
    activeToken = null;
    const lateDatabase = fakeDatabase();

    expect(() => registry.register(permit, lateDatabase.db)).toThrowError(
      expect.objectContaining({ code: 'OPEN_RESERVATION_INVALIDATED' })
    );
    expect(lateDatabase.closeCalls()).toBe(1);
    expect(registry.snapshot()).toMatchObject({ reservationCount: 0, handleCount: 0 });
  });

  it('returns handles_closed only when both handle and reservation tables are actually zero', async () => {
    const token = await resetToken(uuid(29));
    const harness = createMutableRegistry();
    const { registry } = harness;
    let reentrantPermit: ReturnType<typeof registry.reserveOpen> | null = null;
    const database = fakeDatabase(undefined, () => {
      reentrantPermit = registry.reserveOpen({
        kind: 'reset',
        resetOperationId: token.resetOperationId,
        fenceRevision: token.authorityRevision,
      });
    });
    registry.register(registry.reserveOpen({ kind: 'startup', attemptId: uuid(30) }), database.db);
    harness.setActiveToken(token);

    expect(() => registry.enterResetFence(token)).toThrowError(
      expect.objectContaining({ code: 'REGISTRY_NOT_QUIESCENT' })
    );
    expect(registry.snapshot()).toMatchObject({ reservationCount: 1, handleCount: 0 });

    if (reentrantPermit === null) {
      throw new Error('expected reentrant reset permit');
    }
    registry.settleOpenFailure(reentrantPermit);
    expect(registry.enterResetFence(token)).toMatchObject({
      status: 'handles_closed',
      reservationCount: 0,
      handleCount: 0,
    });
  });

  it('denies reserve and register for non-reset owners as soon as the authority token is active', async () => {
    let activeToken: ResetAuthorityTokenV1 | null = null;
    const registry = createDbHandleRegistry({ getActiveResetToken: () => activeToken });
    const oldPermit = registry.reserveOpen({ kind: 'business', operationId: uuid(31) });
    activeToken = await resetToken(uuid(32));

    expect(() => registry.reserveOpen({ kind: 'startup', attemptId: uuid(33) })).toThrowError(
      expect.objectContaining({ code: 'OPEN_DENIED_DURING_RESET' })
    );

    const lateDatabase = fakeDatabase();
    expect(() => registry.register(oldPermit, lateDatabase.db)).toThrowError(
      expect.objectContaining({ code: 'OPEN_RESERVATION_INVALIDATED' })
    );
    expect(lateDatabase.closeCalls()).toBe(1);
    expect(registry.snapshot()).toMatchObject({ reservationCount: 0, handleCount: 0 });
  });

  it.each(['release', 'versionchange'] as const)(
    'keeps a terminal close failure from %s and never produces handles_closed',
    async (mode) => {
      const harness = createMutableRegistry();
      const { registry } = harness;
      const closeFailure = new Error(`${mode} close failed`);
      const database = fakeDatabase(closeFailure);
      registry.register(
        registry.reserveOpen({ kind: 'business', operationId: uuid(mode === 'release' ? 34 : 35) }),
        database.db
      );

      expect(() => {
        if (mode === 'release') {
          registry.release(database.db);
        } else {
          database.versionchange();
        }
      }).toThrow(closeFailure);
      expect(registry.snapshot()).toMatchObject({
        status: 'close_failed',
        reservationCount: 0,
        handleCount: 0,
      });

      const token = await resetToken(uuid(mode === 'release' ? 36 : 37));
      harness.setActiveToken(token);
      expect(() => registry.enterResetFence(token)).toThrow(closeFailure);
      expect(database.closeCalls()).toBe(1);
    }
  );

  it.each([
    { mode: 'release' as const, kind: 'startup' as const, suffix: 60 },
    { mode: 'release' as const, kind: 'business' as const, suffix: 63 },
    { mode: 'versionchange' as const, kind: 'startup' as const, suffix: 66 },
    { mode: 'versionchange' as const, kind: 'business' as const, suffix: 69 },
  ])(
    'fails closed for $kind reserve/register after a pre-reset $mode close failure',
    ({ mode, kind, suffix }) => {
      const registry = createRegistry();
      const pendingOwner: DbOpenOwner =
        kind === 'startup'
          ? { kind, attemptId: uuid(suffix) }
          : { kind, operationId: uuid(suffix) };
      const freshOwner: DbOpenOwner =
        kind === 'startup'
          ? { kind, attemptId: uuid(suffix + 1) }
          : { kind, operationId: uuid(suffix + 1) };
      const pendingPermit = registry.reserveOpen(pendingOwner);
      const closeFailure = new Error(`${mode} pre-reset close failed`);
      const failingDatabase = fakeDatabase(closeFailure);
      registry.register(
        registry.reserveOpen({ kind: 'business', operationId: uuid(suffix + 2) }),
        failingDatabase.db
      );

      expect(() => {
        if (mode === 'release') {
          registry.release(failingDatabase.db);
        } else {
          failingDatabase.versionchange();
        }
      }).toThrow(closeFailure);
      expect(registry.snapshot()).toMatchObject({ status: 'close_failed', handleCount: 0 });

      expect(() => registry.reserveOpen(freshOwner)).toThrow(closeFailure);
      const lateDatabase = fakeDatabase();
      let deliveredHandle: unknown;
      expect(() => {
        deliveredHandle = registry.register(pendingPermit, lateDatabase.db);
      }).toThrow(closeFailure);
      expect(deliveredHandle).toBeUndefined();
      expect(lateDatabase.closeCalls()).toBe(1);
      expect(registry.snapshot()).toMatchObject({
        status: 'close_failed',
        reservationCount: 0,
        handleCount: 0,
      });
    }
  );

  it('treats throw undefined as a durable close failure rather than a success sentinel', async () => {
    const harness = createMutableRegistry();
    const { registry } = harness;
    const database = fakeDatabase(undefined, undefined, true);
    registry.register(
      registry.reserveOpen({ kind: 'business', operationId: uuid(38) }),
      database.db
    );

    let releaseThrew = false;
    try {
      registry.release(database.db);
    } catch (error) {
      releaseThrew = true;
      expect(error).toBeUndefined();
    }
    expect(releaseThrew).toBe(true);
    expect(registry.snapshot()).toMatchObject({ status: 'close_failed', handleCount: 0 });

    const token = await resetToken(uuid(39));
    harness.setActiveToken(token);
    let fenceThrew = false;
    try {
      registry.enterResetFence(token);
    } catch (error) {
      fenceThrew = true;
      expect(error).toBeUndefined();
    }
    expect(fenceThrew).toBe(true);
    expect(database.closeCalls()).toBe(1);
  });

  it('retains an invalidated-open tombstone and fails permanently if its late result cannot close', async () => {
    const harness = createMutableRegistry();
    const { registry } = harness;
    const permit = registry.reserveOpen({ kind: 'business', operationId: uuid(40) });
    const token = await resetToken(uuid(41));
    harness.setActiveToken(token);

    expect(() => registry.enterResetFence(token)).toThrowError(
      expect.objectContaining({ code: 'REGISTRY_NOT_QUIESCENT' })
    );
    expect(registry.snapshot()).toMatchObject({
      status: 'reset_fenced',
      reservationCount: 0,
      tombstoneCount: 1,
      handleCount: 0,
    });

    const closeFailure = new Error('late invalidated close failed');
    const lateDatabase = fakeDatabase(closeFailure);
    expect(() => registry.register(permit, lateDatabase.db)).toThrow(closeFailure);
    expect(lateDatabase.closeCalls()).toBe(1);
    expect(registry.snapshot()).toMatchObject({
      status: 'reset_fence_failed',
      tombstoneCount: 1,
      handleCount: 0,
    });
    expect(() => registry.enterResetFence(token)).toThrow(closeFailure);

    registry.settleOpenFailure(permit);
    expect(registry.snapshot()).toMatchObject({ tombstoneCount: 0 });
    expect(() => registry.enterResetFence(token)).toThrow(closeFailure);
  });

  it('keeps a timed-out fenced open as a tombstone until its late success is closed', async () => {
    const token = await resetToken(uuid(52));
    const harness = createMutableRegistry();
    const { registry } = harness;
    const permit = registry.reserveOpen({ kind: 'business', operationId: uuid(53) });
    harness.setActiveToken(token);

    expect(() => registry.enterResetFence(token)).toThrowError(
      expect.objectContaining({ code: 'REGISTRY_NOT_QUIESCENT' })
    );
    registry.invalidateOpenForTimeout(permit);
    expect(registry.snapshot()).toMatchObject({
      reservationCount: 0,
      tombstoneCount: 1,
      handleCount: 0,
    });
    expect(() => registry.enterResetFence(token)).toThrowError(
      expect.objectContaining({ code: 'REGISTRY_NOT_QUIESCENT' })
    );

    const lateDatabase = fakeDatabase();
    expect(() => registry.register(permit, lateDatabase.db)).toThrowError(
      expect.objectContaining({ code: 'OPEN_RESERVATION_INVALIDATED' })
    );
    expect(lateDatabase.closeCalls()).toBe(1);
    expect(registry.snapshot()).toMatchObject({ tombstoneCount: 0, handleCount: 0 });
    expect(registry.enterResetFence(token)).toMatchObject({ status: 'handles_closed' });
  });

  it.each([
    { label: 'Error', closeError: new Error('late timed-out close failed') },
    { label: 'undefined', closeError: undefined },
  ])(
    'never returns proof before or after a timed-out late success whose close throws $label',
    async ({ closeError }) => {
      const token = await resetToken(uuid(closeError === undefined ? 54 : 55));
      const harness = createMutableRegistry();
      const { registry } = harness;
      const permit = registry.reserveOpen({
        kind: 'startup',
        attemptId: uuid(closeError === undefined ? 56 : 57),
      });
      harness.setActiveToken(token);

      expect(() => registry.enterResetFence(token)).toThrowError(
        expect.objectContaining({ code: 'REGISTRY_NOT_QUIESCENT' })
      );
      registry.invalidateOpenForTimeout(permit);
      let earlyProof: unknown;
      expect(() => {
        earlyProof = registry.enterResetFence(token);
      }).toThrowError(expect.objectContaining({ code: 'REGISTRY_NOT_QUIESCENT' }));
      expect(earlyProof).toBeUndefined();

      const lateDatabase = fakeDatabase(closeError, undefined, true);
      let lateCloseThrew = false;
      try {
        registry.register(permit, lateDatabase.db);
      } catch (error) {
        lateCloseThrew = true;
        expect(error).toBe(closeError);
      }
      expect(lateCloseThrew).toBe(true);
      expect(lateDatabase.closeCalls()).toBe(1);
      expect(registry.snapshot()).toMatchObject({
        status: 'reset_fence_failed',
        tombstoneCount: 1,
        handleCount: 0,
      });

      let laterProof: unknown;
      let laterFenceThrew = false;
      try {
        laterProof = registry.enterResetFence(token);
      } catch (error) {
        laterFenceThrew = true;
        expect(error).toBe(closeError);
      }
      expect(laterFenceThrew).toBe(true);
      expect(laterProof).toBeUndefined();
    }
  );

  it('settles a fenced tombstone only after the native open request reports terminal failure', async () => {
    const token = await resetToken(uuid(58));
    const harness = createMutableRegistry();
    const { registry } = harness;
    const permit = registry.reserveOpen({ kind: 'business', operationId: uuid(59) });
    harness.setActiveToken(token);

    expect(() => registry.enterResetFence(token)).toThrowError(
      expect.objectContaining({ code: 'REGISTRY_NOT_QUIESCENT' })
    );
    registry.invalidateOpenForTimeout(permit);
    expect(registry.snapshot()).toMatchObject({ tombstoneCount: 1 });

    registry.settleOpenFailure(permit);

    expect(registry.snapshot()).toMatchObject({
      reservationCount: 0,
      tombstoneCount: 0,
      handleCount: 0,
    });
    expect(registry.enterResetFence(token)).toMatchObject({ status: 'handles_closed' });
  });

  it('never returns handles_closed from a reentrant fence entry while close is still running', async () => {
    const token = await resetToken(uuid(42));
    const harness = createMutableRegistry();
    const { registry } = harness;
    let nestedProof: unknown;
    let nestedError: unknown;
    let snapshotDuringClose: ReturnType<typeof registry.snapshot> | null = null;
    let closeReturned = false;
    const database = fakeDatabase(undefined, () => {
      snapshotDuringClose = registry.snapshot();
      try {
        nestedProof = registry.enterResetFence(token);
      } catch (error) {
        nestedError = error;
      }
      expect(closeReturned).toBe(false);
    });
    registry.register(
      registry.reserveOpen({ kind: 'business', operationId: uuid(43) }),
      database.db
    );
    harness.setActiveToken(token);

    const outerProof = registry.enterResetFence(token);
    closeReturned = true;

    expect(nestedProof).toBeUndefined();
    expect(nestedError).toMatchObject({ code: 'REGISTRY_NOT_QUIESCENT' });
    expect(snapshotDuringClose).toMatchObject({ status: 'reset_fencing', closeInProgress: 1 });
    expect(outerProof).toMatchObject({ status: 'handles_closed' });
    expect(database.closeCalls()).toBe(1);
  });

  it('revalidates the exact authority token after every close before returning proof', async () => {
    const token = await resetToken(uuid(44));
    const harness = createMutableRegistry();
    const { registry } = harness;
    const database = fakeDatabase(undefined, () => harness.setActiveToken(null));
    registry.register(registry.reserveOpen({ kind: 'startup', attemptId: uuid(45) }), database.db);
    harness.setActiveToken(token);

    let returnedProof: unknown;
    expect(() => {
      returnedProof = registry.enterResetFence(token);
    }).toThrowError(expect.objectContaining({ code: 'INVALID_RESET_TOKEN' }));

    expect(returnedProof).toBeUndefined();
    expect(database.closeCalls()).toBe(1);
    expect(registry.snapshot()).toMatchObject({
      reservationCount: 0,
      tombstoneCount: 0,
      handleCount: 0,
    });
  });

  it('captures the authority provider once so later dependency mutation cannot substitute provenance', async () => {
    const deps: { getActiveResetToken: () => ResetAuthorityTokenV1 | null } = {
      getActiveResetToken: () => null,
    };
    const registry = createDbHandleRegistry(deps);
    const substitutedToken = await resetToken(uuid(46));
    deps.getActiveResetToken = () => substitutedToken;

    expect(() => registry.enterResetFence(substitutedToken)).toThrowError(
      expect.objectContaining({ code: 'INVALID_RESET_TOKEN' })
    );
    expect(registry.snapshot()).toMatchObject({ status: 'open', resetOwner: null });
  });

  it('reads and validates the authority provider property exactly once at construction', async () => {
    const substitutedToken = await resetToken(uuid(51));
    let providerReads = 0;
    const deps = {} as { getActiveResetToken: () => ResetAuthorityTokenV1 | null };
    Object.defineProperty(deps, 'getActiveResetToken', {
      enumerable: true,
      get() {
        providerReads += 1;
        return providerReads === 1 ? () => null : () => substitutedToken;
      },
    });

    const registry = createDbHandleRegistry(deps);

    expect(providerReads).toBe(1);
    expect(() => registry.enterResetFence(substitutedToken)).toThrowError(
      expect.objectContaining({ code: 'INVALID_RESET_TOKEN' })
    );
  });

  it('keeps a reentrant close failure terminal even when the close callback catches it', async () => {
    const token = await resetToken(uuid(47));
    const harness = createMutableRegistry();
    const { registry } = harness;
    const closeFailure = new Error('nested close failed');
    const failingDatabase = fakeDatabase(closeFailure);
    let nestedCloseError: unknown;
    const initiatingDatabase = fakeDatabase(undefined, () => {
      try {
        registry.release(failingDatabase.db);
      } catch (error) {
        nestedCloseError = error;
      }
    });
    registry.register(
      registry.reserveOpen({ kind: 'startup', attemptId: uuid(48) }),
      initiatingDatabase.db
    );
    registry.register(
      registry.reserveOpen({ kind: 'business', operationId: uuid(49) }),
      failingDatabase.db
    );
    harness.setActiveToken(token);

    let returnedProof: unknown;
    expect(() => {
      returnedProof = registry.enterResetFence(token);
    }).toThrow(closeFailure);

    expect(returnedProof).toBeUndefined();
    expect(nestedCloseError).toBe(closeFailure);
    expect(initiatingDatabase.closeCalls()).toBe(1);
    expect(failingDatabase.closeCalls()).toBe(1);
    expect(registry.snapshot()).toMatchObject({
      status: 'reset_fence_failed',
      closeInProgress: 0,
      handleCount: 0,
    });
  });

  it('returns an auditable proof only with exact authority and every quiescence counter at zero', async () => {
    const token = await resetToken(uuid(50));
    const registry = createRegistry(token);

    const proof = registry.enterResetFence(token);

    expect(proof).toEqual({
      version: 1,
      status: 'handles_closed',
      workerEpoch: token.workerEpoch,
      resetOperationId: token.resetOperationId,
      fenceRevision: token.authorityRevision,
      reservationCount: 0,
      tombstoneCount: 0,
      handleCount: 0,
      closeInProgress: 0,
    });
    expect(registry.snapshot()).toMatchObject({
      reservationCount: 0,
      tombstoneCount: 0,
      handleCount: 0,
      closeInProgress: 0,
    });
  });
});
