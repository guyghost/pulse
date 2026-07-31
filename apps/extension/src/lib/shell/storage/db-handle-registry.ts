import type { ResetAuthorityTokenV1 } from './dataset-epoch-authority';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type DbHandleRegistryErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_OWNER'
  | 'OPEN_RESERVATION_INVALIDATED'
  | 'HANDLE_ALREADY_REGISTERED'
  | 'OPEN_DENIED_DURING_RESET'
  | 'RESET_OWNER_MISMATCH'
  | 'REGISTRY_NOT_QUIESCENT'
  | 'INVALID_RESET_TOKEN';

export class DbHandleRegistryError extends Error {
  constructor(
    readonly code: DbHandleRegistryErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DbHandleRegistryError';
  }
}

export type DbOpenOwner =
  | { kind: 'startup'; attemptId: string }
  | { kind: 'business'; operationId: string }
  | { kind: 'reset'; resetOperationId: string; fenceRevision: number };

export interface DbOpenPermit {
  readonly version: 1;
  readonly owner: Readonly<DbOpenOwner>;
}

export interface RegisteredDbHandle {
  readonly version: 1;
  readonly owner: Readonly<DbOpenOwner>;
  readonly db: IDBDatabase;
}

export interface DbHandleRegistrySnapshot {
  readonly version: 1;
  readonly status:
    'open' | 'close_failed' | 'reset_fencing' | 'reset_fenced' | 'reset_fence_failed';
  readonly resetOwner: Readonly<{
    workerEpoch: string;
    resetOperationId: string;
    fenceRevision: number;
  }> | null;
  readonly reservationCount: number;
  readonly tombstoneCount: number;
  readonly handleCount: number;
  readonly closeInProgress: number;
  readonly reservations: readonly Readonly<{ owner: Readonly<DbOpenOwner> }>[];
  readonly handles: readonly Readonly<{ owner: Readonly<DbOpenOwner> }>[];
}

export interface HandlesClosedProofV1 {
  readonly version: 1;
  readonly status: 'handles_closed';
  readonly workerEpoch: string;
  readonly resetOperationId: string;
  readonly fenceRevision: number;
  readonly reservationCount: 0;
  readonly tombstoneCount: 0;
  readonly handleCount: 0;
  readonly closeInProgress: 0;
}

export interface DbHandleRegistry {
  reserveOpen(owner: DbOpenOwner): DbOpenPermit;
  register(permit: DbOpenPermit, db: IDBDatabase): RegisteredDbHandle;
  /**
   * Invalidates caller delivery after a local timeout/abandon without claiming
   * that the native IDB request reached a terminal event. A future db.ts timer
   * must use this path and must never settle or erase the resulting tombstone.
   */
  invalidateOpenForTimeout(permit: DbOpenPermit): void;
  /**
   * Settles a native open only after request.onerror, or after a synchronous
   * failure proving that no IDBOpenDBRequest was created. Caller timers and
   * local abandonment must never call this terminal path.
   */
  settleOpenFailure(permit: DbOpenPermit): void;
  release(db: IDBDatabase): void;
  enterResetFence(token: ResetAuthorityTokenV1): HandlesClosedProofV1;
  snapshot(): DbHandleRegistrySnapshot;
}

export interface DbHandleRegistryDependencies {
  readonly getActiveResetToken: () => ResetAuthorityTokenV1 | null;
}

function readExactDataRecord(
  value: unknown,
  expectedKeys: readonly string[]
): Record<string, unknown> | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return null;
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== expectedKeys.length ||
      keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) {
      return null;
    }
    const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        return null;
      }
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

function isUuidV4(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_PATTERN.test(value);
}

function parseOwner(value: unknown): Readonly<DbOpenOwner> | null {
  const startup = readExactDataRecord(value, ['kind', 'attemptId']);
  if (startup?.kind === 'startup' && isUuidV4(startup.attemptId)) {
    return Object.freeze({ kind: 'startup' as const, attemptId: startup.attemptId });
  }
  const business = readExactDataRecord(value, ['kind', 'operationId']);
  if (business?.kind === 'business' && isUuidV4(business.operationId)) {
    return Object.freeze({ kind: 'business' as const, operationId: business.operationId });
  }
  const reset = readExactDataRecord(value, ['kind', 'resetOperationId', 'fenceRevision']);
  if (
    reset?.kind === 'reset' &&
    isUuidV4(reset.resetOperationId) &&
    Number.isSafeInteger(reset.fenceRevision) &&
    Number(reset.fenceRevision) >= 0
  ) {
    return Object.freeze({
      kind: 'reset' as const,
      resetOperationId: reset.resetOperationId,
      fenceRevision: Number(reset.fenceRevision),
    });
  }
  return null;
}

export function createDbHandleRegistry(deps: DbHandleRegistryDependencies): DbHandleRegistry {
  const getActiveResetToken = deps?.getActiveResetToken;
  if (typeof getActiveResetToken !== 'function') {
    throw new DbHandleRegistryError(
      'INVALID_CONFIGURATION',
      'DB handle registry requires an active reset token provider.'
    );
  }
  const reservations = new Map<DbOpenPermit, Readonly<DbOpenOwner>>();
  const invalidatedPermits = new Set<DbOpenPermit>();
  const handles = new Map<IDBDatabase, Readonly<DbOpenOwner>>();
  const closedHandles = new WeakSet<IDBDatabase>();
  let activeResetToken: ResetAuthorityTokenV1 | null = null;
  let terminalCloseFailure: { readonly error: unknown } | null = null;
  let fencePhase: 'open' | 'fencing' | 'fenced' | 'failed' = 'open';
  let closeInProgress = 0;

  function getTerminalCloseFailure(): { readonly error: unknown } | null {
    return terminalCloseFailure;
  }

  function closeOnce(db: IDBDatabase): void {
    if (closedHandles.has(db)) {
      return;
    }
    closedHandles.add(db);
    closeInProgress += 1;
    try {
      db.close();
    } catch (error) {
      terminalCloseFailure ??= Object.freeze({ error });
      fencePhase = 'failed';
      throw error;
    } finally {
      closeInProgress -= 1;
    }
  }

  function release(db: IDBDatabase): void {
    if (!handles.delete(db)) {
      return;
    }
    closeOnce(db);
  }

  return Object.freeze({
    reserveOpen(owner: DbOpenOwner): DbOpenPermit {
      const parsedOwner = parseOwner(owner);
      if (parsedOwner === null) {
        throw new DbHandleRegistryError('INVALID_OWNER', 'DB open owner is invalid.');
      }
      const closeFailure = getTerminalCloseFailure();
      if (closeFailure !== null) {
        throw closeFailure.error;
      }
      if (
        parsedOwner.kind !== 'reset' &&
        (activeResetToken !== null || getActiveResetToken() !== null)
      ) {
        throw new DbHandleRegistryError(
          'OPEN_DENIED_DURING_RESET',
          'Only the active reset owner may reserve a database open while fenced.'
        );
      }
      if (
        activeResetToken !== null &&
        parsedOwner.kind === 'reset' &&
        activeResetToken !== getActiveResetToken()
      ) {
        throw new DbHandleRegistryError(
          'INVALID_RESET_TOKEN',
          'The active reset authority token is stale.'
        );
      }
      if (
        parsedOwner.kind === 'reset' &&
        (activeResetToken === null ||
          parsedOwner.resetOperationId !== activeResetToken.resetOperationId ||
          parsedOwner.fenceRevision !== activeResetToken.authorityRevision)
      ) {
        throw new DbHandleRegistryError(
          'RESET_OWNER_MISMATCH',
          'DB open owner does not match the active reset fence.'
        );
      }
      const permit = Object.freeze({ version: 1 as const, owner: parsedOwner });
      reservations.set(permit, permit.owner);
      return permit;
    },
    register(permit: DbOpenPermit, db: IDBDatabase): RegisteredDbHandle {
      if (handles.has(db)) {
        throw new DbHandleRegistryError(
          'HANDLE_ALREADY_REGISTERED',
          'Database handle is already registered.'
        );
      }
      const owner = reservations.get(permit);
      if (owner === undefined) {
        const wasInvalidated = invalidatedPermits.has(permit);
        closeOnce(db);
        if (wasInvalidated) {
          invalidatedPermits.delete(permit);
        }
        throw new DbHandleRegistryError(
          'OPEN_RESERVATION_INVALIDATED',
          'DB open permit is no longer active.'
        );
      }
      const closeFailure = getTerminalCloseFailure();
      if (closeFailure !== null) {
        reservations.delete(permit);
        closeOnce(db);
        throw closeFailure.error;
      }
      if (owner.kind !== 'reset' && getActiveResetToken() !== null) {
        reservations.delete(permit);
        invalidatedPermits.add(permit);
        closeOnce(db);
        invalidatedPermits.delete(permit);
        throw new DbHandleRegistryError(
          'OPEN_RESERVATION_INVALIDATED',
          'Non-reset DB open permit crossed the active authority fence.'
        );
      }
      if (
        owner.kind === 'reset' &&
        (terminalCloseFailure !== null || activeResetToken !== getActiveResetToken())
      ) {
        reservations.delete(permit);
        closeOnce(db);
        throw new DbHandleRegistryError(
          'OPEN_RESERVATION_INVALIDATED',
          'Reset DB open permit lost its exact authority token.'
        );
      }
      reservations.delete(permit);
      handles.set(db, owner);
      db.onversionchange = () => release(db);
      return Object.freeze({ version: 1 as const, owner, db });
    },
    invalidateOpenForTimeout(permit: DbOpenPermit): void {
      if (!reservations.has(permit)) {
        return;
      }
      reservations.delete(permit);
      invalidatedPermits.add(permit);
    },
    settleOpenFailure(permit: DbOpenPermit): void {
      reservations.delete(permit);
      invalidatedPermits.delete(permit);
    },
    release,
    enterResetFence(token: ResetAuthorityTokenV1): HandlesClosedProofV1 {
      if (fencePhase === 'fencing' || closeInProgress !== 0) {
        throw new DbHandleRegistryError(
          'REGISTRY_NOT_QUIESCENT',
          'DB handle registry cannot enter a reset fence while a close is in progress.'
        );
      }
      if (
        token !== getActiveResetToken() ||
        (activeResetToken !== null && token !== activeResetToken)
      ) {
        throw new DbHandleRegistryError(
          'INVALID_RESET_TOKEN',
          'Reset authority token is not the active exact token.'
        );
      }
      const initialCloseFailure = getTerminalCloseFailure();
      if (initialCloseFailure !== null) {
        throw initialCloseFailure.error;
      }
      activeResetToken = token;
      fencePhase = 'fencing';
      for (const permit of reservations.keys()) {
        invalidatedPermits.add(permit);
        reservations.delete(permit);
      }
      let firstCloseFailure: { readonly error: unknown } | null = null;
      for (const db of [...handles.keys()]) {
        try {
          release(db);
        } catch (error) {
          firstCloseFailure ??= Object.freeze({ error });
        }
      }
      if (firstCloseFailure !== null) {
        fencePhase = 'failed';
        throw firstCloseFailure.error;
      }
      const finalCloseFailure = getTerminalCloseFailure();
      if (finalCloseFailure !== null) {
        fencePhase = 'failed';
        throw finalCloseFailure.error;
      }
      if (token !== getActiveResetToken() || token !== activeResetToken) {
        fencePhase = 'fenced';
        throw new DbHandleRegistryError(
          'INVALID_RESET_TOKEN',
          'Reset authority token became stale before the close proof was produced.'
        );
      }
      if (
        reservations.size !== 0 ||
        invalidatedPermits.size !== 0 ||
        handles.size !== 0 ||
        closeInProgress !== 0
      ) {
        fencePhase = 'fenced';
        throw new DbHandleRegistryError(
          'REGISTRY_NOT_QUIESCENT',
          'DB handle registry is not quiescent after reset fencing.'
        );
      }
      fencePhase = 'fenced';
      return Object.freeze({
        version: 1 as const,
        status: 'handles_closed' as const,
        workerEpoch: token.workerEpoch,
        resetOperationId: token.resetOperationId,
        fenceRevision: token.authorityRevision,
        reservationCount: 0 as const,
        tombstoneCount: 0 as const,
        handleCount: 0 as const,
        closeInProgress: 0 as const,
      });
    },
    snapshot(): DbHandleRegistrySnapshot {
      let status: DbHandleRegistrySnapshot['status'];
      if (terminalCloseFailure !== null) {
        status = activeResetToken === null ? 'close_failed' : 'reset_fence_failed';
      } else if (fencePhase === 'fencing') {
        status = 'reset_fencing';
      } else {
        status = activeResetToken === null ? 'open' : 'reset_fenced';
      }
      const resetOwner =
        activeResetToken === null
          ? null
          : Object.freeze({
              workerEpoch: activeResetToken.workerEpoch,
              resetOperationId: activeResetToken.resetOperationId,
              fenceRevision: activeResetToken.authorityRevision,
            });
      return Object.freeze({
        version: 1 as const,
        status,
        resetOwner,
        reservationCount: reservations.size,
        tombstoneCount: invalidatedPermits.size,
        handleCount: handles.size,
        closeInProgress,
        reservations: Object.freeze(
          [...reservations.values()].map((owner) => Object.freeze({ owner }))
        ),
        handles: Object.freeze([...handles.values()].map((owner) => Object.freeze({ owner }))),
      });
    },
  });
}
