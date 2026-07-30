import type {
  PersistedTrackingEnvelopeV2,
  TrackingControlIdentityV2,
  TrackingMutationCommandV2,
  TrackingRevisionTokenV2,
  TrackingSettlementV2,
  TrackingUndoTokenV2,
} from '../../../models/application-tracking.machine.contract';
import type { MissionTracking } from '../types/tracking';
import { createTracking, transitionStatus } from './transitions';
import { normalizeTrackingMutationCommandV2 } from './command-digest';
import {
  TRACKING_HISTORY_MAX_ITEMS,
  type PersistedTrackingMutationV2,
  type TrackingPlanFailureCodeV2,
  createTrackingMutationErrorV2,
  isCanonicalMissionTrackingV2,
  inspectPersistedTrackingEnvelopeV2,
  inspectPersistedTrackingMutationV2,
  inspectPlainTrackingRecordV2,
  inspectTrackingControlIdentityV2,
  isPersistedTrackingEnvelopeV2,
  isValidTrackingSettlementV2,
  trackingValuesEqualV2,
} from './v2-contract';

export type TrackingPreflightResultV2 =
  | {
      ok: true;
      txA: { actorBase: TrackingRevisionTokenV2; command: TrackingMutationCommandV2 };
    }
  | { ok: false; code: TrackingPlanFailureCodeV2 };

export type TrackingTransactionPlanResultV2 =
  | {
      ok: true;
      actorBase: TrackingRevisionTokenV2;
      candidate: { tracking: MissionTracking | null; committedAt: number };
      envelope: PersistedTrackingEnvelopeV2;
      undo: TrackingUndoTokenV2;
    }
  | { ok: false; code: TrackingPlanFailureCodeV2 };

export interface TrackingReconciliationObservationV2 {
  identity: TrackingControlIdentityV2;
  ledger: PersistedTrackingMutationV2 | null;
  canonical: PersistedTrackingEnvelopeV2 | null;
  currentWorkerEpoch: string;
  registeredActive: boolean;
  readFailure: 'PERSIST_FAILED' | 'TRANSPORT_ERROR' | 'WORKER_RESTARTED' | null;
}

export type TrackingReconciliationDecisionV2 =
  | { kind: 'join'; identity: TrackingControlIdentityV2 }
  | { kind: 'settlement'; settlement: TrackingSettlementV2 };

function commandFailureCode(value: unknown): TrackingPlanFailureCodeV2 {
  const record = inspectPlainTrackingRecordV2(value);
  if (record !== null) {
    if (record.intent === 'transition') {
      return 'INVALID_TRANSITION';
    }
    if (record.intent === 'details') {
      return 'INVALID_DETAILS';
    }
    if (record.intent === 'restore') {
      return 'INVALID_RESTORE';
    }
  }
  return 'PROTOCOL_ERROR';
}

function tokenFor(
  dataEpoch: string,
  canonical: PersistedTrackingEnvelopeV2 | null
): TrackingRevisionTokenV2 {
  return {
    dataEpoch,
    revision: canonical?.revision ?? 0,
    lastMutationId: canonical?.lastMutationId ?? null,
  };
}

function baseTracking(canonical: PersistedTrackingEnvelopeV2 | null): MissionTracking | null {
  return canonical?.kind === 'record' ? canonical.tracking : null;
}

function cloneTracking(tracking: MissionTracking): MissionTracking {
  return {
    missionId: tracking.missionId,
    currentStatus: tracking.currentStatus,
    history: tracking.history.map((transition) => ({ ...transition })),
    generatedAssetIds: [...tracking.generatedAssetIds],
    userRating: tracking.userRating,
    notes: tracking.notes,
    nextActionAt: tracking.nextActionAt ?? null,
  };
}

function cloneNullableTracking(tracking: MissionTracking | null): MissionTracking | null {
  return tracking === null ? null : cloneTracking(tracking);
}

function restoreFailure(
  command: Extract<TrackingMutationCommandV2, { intent: 'restore' }>,
  canonical: PersistedTrackingEnvelopeV2 | null
): TrackingPlanFailureCodeV2 | null {
  if (
    command.previousTracking !== null &&
    (!isCanonicalMissionTrackingV2(command.previousTracking) ||
      command.previousTracking.missionId !== command.missionId)
  ) {
    return 'INVALID_RESTORE';
  }
  if (
    canonical === null ||
    canonical.undoBase === null ||
    canonical.revision !== command.expectedCurrentRevision ||
    canonical.lastMutationId !== command.expectedCurrentMutationId ||
    canonical.undoBase.expectedCurrentRevision !== command.expectedCurrentRevision ||
    canonical.undoBase.expectedCurrentMutationId !== command.expectedCurrentMutationId ||
    !trackingValuesEqualV2(canonical.undoBase.previousTracking, command.previousTracking)
  ) {
    return 'STALE_UNDO';
  }
  return null;
}

function validateAgainstBase(
  command: TrackingMutationCommandV2,
  canonical: PersistedTrackingEnvelopeV2 | null
): TrackingPlanFailureCodeV2 | null {
  if (canonical !== null) {
    if (canonical.dataEpoch !== command.dataEpoch) {
      return 'EPOCH_CHANGED';
    }
    if (canonical.missionId !== command.missionId) {
      return 'PROTOCOL_ERROR';
    }
    if (canonical.revision === Number.MAX_SAFE_INTEGER) {
      return 'PERSIST_FAILED';
    }
  }

  const current = baseTracking(canonical);
  if (command.intent === 'restore') {
    return restoreFailure(command, canonical);
  }
  if (command.intent === 'details') {
    if (
      current !== null &&
      command.nextActionAt !== null &&
      ['accepted', 'rejected', 'archived'].includes(current.currentStatus)
    ) {
      return 'INVALID_DETAILS';
    }
    return null;
  }

  if (current !== null && current.history.length >= TRACKING_HISTORY_MAX_ITEMS) {
    return 'INVALID_TRANSITION';
  }
  const probe = current ?? createTracking(command.missionId, 0);
  return transitionStatus(probe, command.status, 0, command.note) === null
    ? 'INVALID_TRANSITION'
    : null;
}

function preflightAgainstCapturedBase(
  command: TrackingMutationCommandV2,
  canonical: PersistedTrackingEnvelopeV2 | null
): TrackingPreflightResultV2 {
  const failure = validateAgainstBase(command, canonical);
  if (failure !== null) {
    return { ok: false, code: failure };
  }
  return {
    ok: true,
    txA: { actorBase: tokenFor(command.dataEpoch, canonical), command },
  };
}

export function preflightTrackingMutationV2(
  value: unknown,
  canonical: PersistedTrackingEnvelopeV2 | null
): TrackingPreflightResultV2 {
  const command = normalizeTrackingMutationCommandV2(value);
  if (command === null) {
    return { ok: false, code: commandFailureCode(value) };
  }
  const canonicalSnapshot =
    canonical === null ? null : inspectPersistedTrackingEnvelopeV2(canonical);
  if (canonical !== null && canonicalSnapshot === null) {
    return { ok: false, code: 'PROTOCOL_ERROR' };
  }
  return preflightAgainstCapturedBase(command, canonicalSnapshot);
}

function buildCandidate(
  command: TrackingMutationCommandV2,
  canonical: PersistedTrackingEnvelopeV2 | null,
  committedAt: number
): MissionTracking | null {
  if (command.intent === 'restore') {
    return cloneNullableTracking(command.previousTracking);
  }
  const persisted = baseTracking(canonical);
  const current =
    persisted === null ? createTracking(command.missionId, committedAt) : cloneTracking(persisted);
  if (command.intent === 'details') {
    return { ...current, nextActionAt: command.nextActionAt };
  }
  const transitioned = transitionStatus(current, command.status, committedAt, command.note);
  if (transitioned === null) {
    return null;
  }
  return ['accepted', 'rejected', 'archived'].includes(transitioned.currentStatus)
    ? { ...transitioned, nextActionAt: null }
    : transitioned;
}

export function buildTrackingTransactionPlanV2(
  value: unknown,
  txABase: PersistedTrackingEnvelopeV2 | null,
  committedAt: number
): TrackingTransactionPlanResultV2 {
  if (!Number.isSafeInteger(committedAt) || committedAt < 0) {
    return { ok: false, code: 'PERSIST_FAILED' };
  }
  const command = normalizeTrackingMutationCommandV2(value);
  if (command === null) {
    return { ok: false, code: commandFailureCode(value) };
  }
  const capturedBase = txABase === null ? null : inspectPersistedTrackingEnvelopeV2(txABase);
  if (txABase !== null && capturedBase === null) {
    return { ok: false, code: 'PROTOCOL_ERROR' };
  }
  const preflight = preflightAgainstCapturedBase(command, capturedBase);
  if (!preflight.ok) {
    return preflight;
  }
  const { actorBase } = preflight.txA;
  const tracking = buildCandidate(command, capturedBase, committedAt);
  if (tracking !== null && !isCanonicalMissionTrackingV2(tracking)) {
    return { ok: false, code: commandFailureCode(command) };
  }

  const revision = actorBase.revision + 1;
  if (!Number.isSafeInteger(revision)) {
    return { ok: false, code: 'PERSIST_FAILED' };
  }
  const previousTracking = baseTracking(capturedBase);
  const candidateTracking = cloneNullableTracking(tracking);
  const undo: TrackingUndoTokenV2 = {
    version: 2,
    dataEpoch: command.dataEpoch,
    missionId: command.missionId,
    previousTracking: cloneNullableTracking(previousTracking),
    expectedCurrentRevision: revision,
    expectedCurrentMutationId: command.mutationId,
  };
  const envelope: PersistedTrackingEnvelopeV2 = {
    schemaVersion: 2,
    dataEpoch: command.dataEpoch,
    missionId: command.missionId,
    kind: tracking === null ? 'tombstone' : 'record',
    tracking: cloneNullableTracking(tracking),
    revision,
    lastMutationId: command.mutationId,
    lastMutationIntent: command.intent,
    committedAt,
    undoBase: {
      previousTracking: cloneNullableTracking(previousTracking),
      expectedCurrentRevision: revision,
      expectedCurrentMutationId: command.mutationId,
    },
  };
  if (!isPersistedTrackingEnvelopeV2(envelope)) {
    return { ok: false, code: commandFailureCode(command) };
  }
  return {
    ok: true,
    actorBase,
    candidate: { tracking: candidateTracking, committedAt },
    envelope,
    undo,
  };
}

function settlementBase(identity: TrackingControlIdentityV2) {
  return { version: 2 as const, ...identity, deduplicated: true };
}

function failedSettlement(
  identity: TrackingControlIdentityV2,
  outcome: 'not_committed' | 'inconsistent' | 'uncertain',
  canonical: PersistedTrackingEnvelopeV2 | null,
  code: Exclude<ReturnType<typeof createTrackingMutationErrorV2>['code'], 'LOAD_FAILED'>
): TrackingSettlementV2 {
  return {
    ...settlementBase(identity),
    outcome,
    canonical,
    committedRevision: null,
    undo: null,
    failure: createTrackingMutationErrorV2(identity, code),
    broadcastRequired: false,
  };
}

function observationCanonical(
  identity: TrackingControlIdentityV2,
  value: unknown
): PersistedTrackingEnvelopeV2 | null {
  const snapshot = inspectPersistedTrackingEnvelopeV2(value);
  return snapshot !== null &&
    snapshot.dataEpoch === identity.dataEpoch &&
    snapshot.missionId === identity.missionId
    ? snapshot
    : null;
}

function ledgerMatchesIdentity(
  ledger: PersistedTrackingMutationV2,
  identity: TrackingControlIdentityV2
): boolean {
  return (
    ledger.dataEpoch === identity.dataEpoch &&
    ledger.missionId === identity.missionId &&
    ledger.mutationId === identity.mutationId &&
    ledger.intent === identity.intent &&
    ledger.commandDigest === identity.commandDigest
  );
}

function durableObservationCoherent(
  ledger: PersistedTrackingMutationV2,
  canonical: PersistedTrackingEnvelopeV2 | null
): boolean {
  if (ledger.phase === 'committed') {
    if (ledger.committedRevision === null || canonical === null) {
      return false;
    }
    if (canonical.revision < ledger.committedRevision) {
      return false;
    }
    if (canonical.revision === ledger.committedRevision) {
      return (
        canonical.lastMutationId === ledger.mutationId &&
        canonical.lastMutationIntent === ledger.intent
      );
    }
    return canonical.lastMutationId !== ledger.mutationId;
  }

  if (canonical?.lastMutationId === ledger.mutationId) {
    return false;
  }
  if (canonical === null) {
    return ledger.baseRevision === 0 && ledger.baseLastMutationId === null;
  }
  if (canonical.revision < ledger.baseRevision) {
    return false;
  }
  if (canonical.revision === ledger.baseRevision) {
    return canonical.lastMutationId === ledger.baseLastMutationId;
  }
  return true;
}

export function classifyTrackingReconciliationV2(
  observation: TrackingReconciliationObservationV2
): TrackingReconciliationDecisionV2 {
  const identity = inspectTrackingControlIdentityV2(observation.identity);
  if (identity === null) {
    throw new TypeError('Invalid tracking reconciliation identity');
  }
  const canonical = observationCanonical(identity, observation.canonical);
  if (observation.canonical !== null && canonical === null) {
    return {
      kind: 'settlement',
      settlement: failedSettlement(identity, 'inconsistent', null, 'PROTOCOL_ERROR'),
    };
  }

  if (observation.readFailure !== null) {
    return {
      kind: 'settlement',
      settlement: failedSettlement(identity, 'uncertain', canonical, observation.readFailure),
    };
  }

  const ledger =
    observation.ledger === null ? null : inspectPersistedTrackingMutationV2(observation.ledger);
  if (
    observation.ledger !== null &&
    (ledger === null || !ledgerMatchesIdentity(ledger, identity))
  ) {
    return {
      kind: 'settlement',
      settlement: failedSettlement(identity, 'inconsistent', canonical, 'PROTOCOL_ERROR'),
    };
  }
  if (ledger === null) {
    const outcome =
      canonical?.lastMutationId === identity.mutationId ? 'inconsistent' : 'not_committed';
    return {
      kind: 'settlement',
      settlement: failedSettlement(
        identity,
        outcome,
        canonical,
        outcome === 'inconsistent' ? 'PROTOCOL_ERROR' : 'TRANSPORT_ERROR'
      ),
    };
  }
  if (!durableObservationCoherent(ledger, canonical)) {
    return {
      kind: 'settlement',
      settlement: failedSettlement(identity, 'inconsistent', canonical, 'PROTOCOL_ERROR'),
    };
  }

  if (ledger.phase === 'prepared') {
    if (
      ledger.ownerWorkerEpoch === observation.currentWorkerEpoch &&
      observation.registeredActive
    ) {
      return { kind: 'join', identity };
    }
    const currentWithoutActor = ledger.ownerWorkerEpoch === observation.currentWorkerEpoch;
    return {
      kind: 'settlement',
      settlement: failedSettlement(
        identity,
        currentWithoutActor ? 'inconsistent' : 'not_committed',
        canonical,
        currentWithoutActor ? 'PROTOCOL_ERROR' : 'WORKER_RESTARTED'
      ),
    };
  }

  if (ledger.phase === 'committed') {
    const committedRevision = ledger.committedRevision;
    if (committedRevision === null || canonical === null) {
      return {
        kind: 'settlement',
        settlement: failedSettlement(identity, 'inconsistent', canonical, 'PROTOCOL_ERROR'),
      };
    }
    if (canonical.revision > committedRevision) {
      return {
        kind: 'settlement',
        settlement: {
          ...settlementBase(identity),
          outcome: 'committed_superseded',
          canonical,
          committedRevision,
          undo: null,
          failure: null,
          broadcastRequired: false,
        },
      };
    }
    if (
      canonical.revision !== committedRevision ||
      canonical.lastMutationId !== identity.mutationId ||
      canonical.lastMutationIntent !== identity.intent ||
      canonical.undoBase === null
    ) {
      return {
        kind: 'settlement',
        settlement: failedSettlement(identity, 'inconsistent', canonical, 'PROTOCOL_ERROR'),
      };
    }
    const undo: TrackingUndoTokenV2 = {
      version: 2,
      dataEpoch: identity.dataEpoch,
      missionId: identity.missionId,
      previousTracking: cloneNullableTracking(canonical.undoBase.previousTracking),
      expectedCurrentRevision: canonical.undoBase.expectedCurrentRevision,
      expectedCurrentMutationId: canonical.undoBase.expectedCurrentMutationId,
    };
    const settlement: TrackingSettlementV2 = {
      ...settlementBase(identity),
      outcome: 'committed_current',
      canonical,
      committedRevision,
      undo,
      failure: null,
      broadcastRequired: false,
    };
    return isValidTrackingSettlementV2(settlement, identity, null)
      ? { kind: 'settlement', settlement }
      : {
          kind: 'settlement',
          settlement: failedSettlement(identity, 'inconsistent', canonical, 'PROTOCOL_ERROR'),
        };
  }

  const code = ledger.failureCode;
  if (code === null || code === 'LOAD_FAILED') {
    return {
      kind: 'settlement',
      settlement: failedSettlement(identity, 'inconsistent', canonical, 'PROTOCOL_ERROR'),
    };
  }
  return {
    kind: 'settlement',
    settlement: failedSettlement(identity, 'not_committed', canonical, code),
  };
}
