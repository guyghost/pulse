import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import {
  LOCAL_DATA_RESET_EMPTY_STORES,
  isFreshResetSettingsEnvelope,
  parseLocalDataResetFreshPreflightProof,
  parseLocalDataResetInitialDatabaseProof,
  parseLocalDataResetJournal,
  parseLocalDataResetPostClearCompletionProof,
  parseLocalDataResetReceipt,
  parseResetOwnedSettingsAlignmentProof,
  settingsResetRecoveryCommandId,
  type LocalDataResetJournalV1,
  type LocalDataResetPostClearCompletionProofV1,
  type LocalDataResetProofExpectation,
  type LocalDataResetReceiptV1,
  type ResetOwnedSettingsAlignmentProofV1,
} from '../../../src/models/local-data-reset.contract';
import { parseLocalDataResetEpochEvent } from '../../../src/models/local-data-reset-epoch.contract';
import { localDataResetMachine } from '../../../src/models/local-data-reset.machine';
import {
  expectedAlarm,
  settingsDigest,
  type SettingsEnvelopeV2,
} from '../../../src/models/settings-persistence.contract';

const uuid = (suffix: number): string =>
  `20000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

const DEFAULT_SETTINGS: AppSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: ['free-work'],
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
  theme: 'system',
};
const INCLUDED_CONNECTORS = ['free-work'];
const RESET_ID = uuid(1);
const PREVIOUS_EPOCH = uuid(2);
const NEXT_EPOCH = uuid(3);
const SETTINGS_RECOVERY_REQUEST_ID = uuid(4);
const SETTINGS_BOOTSTRAP_REQUEST_ID = uuid(5);
const REQUESTED_AT = 42;

const request = {
  type: 'RESET_REQUESTED' as const,
  resetId: RESET_ID,
  previousDataEpoch: PREVIOUS_EPOCH,
  nextDataEpoch: NEXT_EPOCH,
  settingsRecoveryRequestId: SETTINGS_RECOVERY_REQUEST_ID,
  settingsBootstrapRequestId: SETTINGS_BOOTSTRAP_REQUEST_ID,
  requestedAt: REQUESTED_AT,
};

const proofExpectation: LocalDataResetProofExpectation = {
  resetId: RESET_ID,
  previousDataEpoch: PREVIOUS_EPOCH,
  nextDataEpoch: NEXT_EPOCH,
  settingsRecoveryRequestId: SETTINGS_RECOVERY_REQUEST_ID,
  settingsBootstrapRequestId: SETTINGS_BOOTSTRAP_REQUEST_ID,
  requestedAt: REQUESTED_AT,
  defaultSettings: DEFAULT_SETTINGS,
  includedConnectorIds: INCLUDED_CONNECTORS,
};

function createResetActor() {
  const actor = createActor(localDataResetMachine, {
    input: {
      defaultSettings: DEFAULT_SETTINGS,
      includedConnectorIds: INCLUDED_CONNECTORS,
    },
  });
  actor.start();
  return actor;
}

type ResetActor = ReturnType<typeof createResetActor>;

function expectActiveState(actor: ResetActor, state: string): void {
  expect(actor.getSnapshot().matches({ active: state })).toBe(true);
}

function freshPreflightProof() {
  return {
    version: 1,
    result: 'fresh' as const,
    resetId: RESET_ID,
    previousDataEpoch: PREVIOUS_EPOCH,
    nextDataEpoch: NEXT_EPOCH,
    settingsRecoveryRequestId: SETTINGS_RECOVERY_REQUEST_ID,
    settingsBootstrapRequestId: SETTINGS_BOOTSTRAP_REQUEST_ID,
    requestedAt: REQUESTED_AT,
    resetJournalAbsent: true as const,
    canonicalDataEpoch: PREVIOUS_EPOCH,
  };
}

function settingsEnvelope(generation: number): SettingsEnvelopeV2 {
  return {
    version: 2,
    dataEpoch: NEXT_EPOCH,
    revision: 0,
    generation,
    settings: { ...DEFAULT_SETTINGS, enabledConnectors: [...INCLUDED_CONNECTORS] },
    journal: null,
    outcomes: [],
  };
}

function initialDatabaseProof() {
  return {
    version: 1,
    databaseName: 'missionpulse' as const,
    dbVersion: 6,
    appDataVersion: 3,
    schemaVerified: true as const,
    dataEpoch: NEXT_EPOCH,
    trackingMeta: {
      key: 'tracking_meta' as const,
      schemaVersion: 1,
      dataEpoch: NEXT_EPOCH,
      collectionRevision: 0,
    },
    stores: LOCAL_DATA_RESET_EMPTY_STORES.map((name) => ({ name, rowCount: 0 as const })),
  };
}

function alignmentProof(generation: number): ResetOwnedSettingsAlignmentProofV1 {
  const currentEnvelope = settingsEnvelope(generation);
  const commandId = settingsResetRecoveryCommandId(SETTINGS_RECOVERY_REQUEST_ID);
  const alarm = expectedAlarm(currentEnvelope.settings);
  return {
    version: 1,
    resetId: RESET_ID,
    dataEpoch: NEXT_EPOCH,
    requestId: SETTINGS_RECOVERY_REQUEST_ID,
    commandId,
    resetPhase: 'database_reinitialized',
    envelope: currentEnvelope,
    alarmProof: {
      ...alarm,
      dataEpoch: NEXT_EPOCH,
      envelopeRevision: 0,
      envelopeGeneration: generation,
      settingsDigest: settingsDigest(DEFAULT_SETTINGS),
      proofId: uuid(10 + generation),
      requestId: SETTINGS_RECOVERY_REQUEST_ID,
      commandId,
    },
  };
}

function resetEpochPayload(stage: 'ready_to_commit' | 'committed') {
  return {
    version: 1,
    stage,
    resetId: RESET_ID,
    previousDataEpoch: PREVIOUS_EPOCH,
    nextDataEpoch: NEXT_EPOCH,
    settingsBootstrapRequestId: SETTINGS_BOOTSTRAP_REQUEST_ID,
  };
}

function receipt(resetId = RESET_ID): LocalDataResetReceiptV1 {
  return {
    schemaVersion: 1,
    resetId,
    previousDataEpoch: PREVIOUS_EPOCH,
    nextDataEpoch: NEXT_EPOCH,
    settingsRecoveryRequestId: SETTINGS_RECOVERY_REQUEST_ID,
    settingsBootstrapRequestId: SETTINGS_BOOTSTRAP_REQUEST_ID,
    requestedAt: REQUESTED_AT,
    phase: 'committed',
  };
}

function postClearProof(
  currentReceipt: LocalDataResetReceiptV1 = receipt(),
  collectionRevision = 29
): LocalDataResetPostClearCompletionProofV1 {
  return {
    version: 1,
    result: 'already_completed',
    resetId: RESET_ID,
    previousDataEpoch: PREVIOUS_EPOCH,
    nextDataEpoch: NEXT_EPOCH,
    settingsRecoveryRequestId: SETTINGS_RECOVERY_REQUEST_ID,
    settingsBootstrapRequestId: SETTINGS_BOOTSTRAP_REQUEST_ID,
    requestedAt: REQUESTED_AT,
    resetJournalAbsent: true,
    canonicalDataEpoch: NEXT_EPOCH,
    receipt: currentReceipt,
    authority: {
      version: 1,
      databaseName: 'missionpulse',
      dbVersion: 6,
      appDataVersion: 3,
      schemaVerified: true,
      dataEpoch: NEXT_EPOCH,
      trackingMeta: {
        key: 'tracking_meta',
        schemaVersion: 1,
        dataEpoch: NEXT_EPOCH,
        collectionRevision,
      },
    },
  };
}

function beginFreshReset(actor: ResetActor): void {
  actor.send(request);
  expectActiveState(actor, 'preflightingCompletion');
  actor.send({ type: 'RESET_PREFLIGHT_FRESH', resetId: RESET_ID, proof: freshPreflightProof() });
  expectActiveState(actor, 'journaling');
}

function advanceToAligningSettings(actor: ResetActor): void {
  beginFreshReset(actor);
  actor.send({ type: 'RESET_JOURNALED', resetId: RESET_ID });
  expectActiveState(actor, 'fencing');
  actor.send({ type: 'FENCE_ACQUIRED', resetId: RESET_ID });
  expectActiveState(actor, 'quiescing');
  actor.send({ type: 'SCAN_QUIESCED', resetId: RESET_ID });
  actor.send({ type: 'TRACKING_QUIESCED', resetId: RESET_ID });
  actor.send({ type: 'MIGRATION_QUIESCED', resetId: RESET_ID });
  actor.send({ type: 'OUTBOX_QUIESCED', resetId: RESET_ID });
  expectActiveState(actor, 'checkpointingQuiescence');
  actor.send({ type: 'QUIESCENCE_CHECKPOINTED', resetId: RESET_ID });
  expectActiveState(actor, 'closingDatabase');
  actor.send({ type: 'DB_HANDLES_CLOSED', resetId: RESET_ID });
  expectActiveState(actor, 'deletingDatabase');
  actor.send({ type: 'DATABASE_DELETED', resetId: RESET_ID });
  expectActiveState(actor, 'clearingSession');
  actor.send({ type: 'SESSION_CLEARED', resetId: RESET_ID });
  expectActiveState(actor, 'clearingLocal');
  actor.send({ type: 'LOCAL_CLEARED', resetId: RESET_ID });
  expectActiveState(actor, 'reinitializing');
  actor.send({
    type: 'DATABASE_REINITIALIZED',
    resetId: RESET_ID,
    dataEpoch: NEXT_EPOCH,
    databaseProof: initialDatabaseProof(),
    settingsEnvelope: settingsEnvelope(0),
  });
  expectActiveState(actor, 'aligningSettings');
}

function advanceToWritingReceipt(actor: ResetActor, generation = 0): void {
  advanceToAligningSettings(actor);
  actor.send({ type: 'SETTINGS_ALIGNED', resetId: RESET_ID, proof: alignmentProof(generation) });
  expectActiveState(actor, 'broadcastingReadiness');
  actor.send({
    type: 'RESET_READY_BROADCASTED',
    payload: resetEpochPayload('ready_to_commit'),
    delivery: 'delivered',
  });
  expectActiveState(actor, 'writingReceipt');
}

describe('local data reset model traces', () => {
  it('executes every nominal phase and persists the receipt before committed', () => {
    const actor = createResetActor();
    advanceToWritingReceipt(actor);

    actor.send({ type: 'RESET_COMMIT_CHECKPOINTED', resetId: RESET_ID });
    expectActiveState(actor, 'writingReceipt');
    expect(actor.getSnapshot().context).toMatchObject({
      phase: 'settings_aligned',
      receiptPersisted: false,
      commitCheckpointed: false,
    });

    actor.send({ type: 'RESET_RECEIPT_WRITTEN', resetId: RESET_ID, receipt: receipt() });
    expectActiveState(actor, 'checkpointingCommit');
    expect(actor.getSnapshot().context).toMatchObject({
      phase: 'settings_aligned',
      receiptPersisted: true,
      commitCheckpointed: false,
    });

    actor.send({
      type: 'RESET_COMMITTED_BROADCASTED',
      payload: resetEpochPayload('committed'),
      delivery: 'delivered',
    });
    expectActiveState(actor, 'checkpointingCommit');

    actor.send({ type: 'RESET_COMMIT_CHECKPOINTED', resetId: RESET_ID });
    expectActiveState(actor, 'broadcastingCommitted');
    expect(actor.getSnapshot().context).toMatchObject({
      phase: 'committed',
      receiptPersisted: true,
      commitCheckpointed: true,
    });
    actor.send({
      type: 'RESET_COMMITTED_BROADCASTED',
      payload: resetEpochPayload('committed'),
      delivery: 'no_receiver',
    });
    expectActiveState(actor, 'clearingJournal');
    actor.send({ type: 'JOURNAL_CLEARED', resetId: RESET_ID });
    expect(actor.getSnapshot().value).toBe('completed');
    expect(actor.getSnapshot().context).toMatchObject({
      phase: 'committed',
      completionDisposition: 'executed',
      journalPersisted: false,
      fenceAcquired: false,
      settingsAligned: true,
      receiptPersisted: true,
      commitCheckpointed: true,
    });
  });

  it('reacquires the live fence and resumes the exact durable phase after a crash', () => {
    const journal: LocalDataResetJournalV1 = {
      schemaVersion: 1,
      resetId: RESET_ID,
      previousDataEpoch: PREVIOUS_EPOCH,
      nextDataEpoch: NEXT_EPOCH,
      settingsRecoveryRequestId: SETTINGS_RECOVERY_REQUEST_ID,
      settingsBootstrapRequestId: SETTINGS_BOOTSTRAP_REQUEST_ID,
      phase: 'database_deleted',
      requestedAt: REQUESTED_AT,
      retryCount: 2,
      lastError: null,
    };
    const actor = createResetActor();
    actor.send({ type: 'SERVICE_WORKER_RESTARTED', journal });
    expectActiveState(actor, 'reacquiringFence');
    expect(actor.getSnapshot().context).toMatchObject({
      phase: 'database_deleted',
      restartDisposition: 'resume',
      databaseDeleted: true,
      sessionCleared: false,
      fenceAcquired: false,
      retryCount: 2,
    });

    actor.send({ type: 'FENCE_ACQUIRED', resetId: RESET_ID });
    expectActiveState(actor, 'reacquiringFence');
    actor.send({ type: 'BOOT_FENCE_ACQUIRED', resetId: RESET_ID });
    expectActiveState(actor, 'clearingSession');
    expect(actor.getSnapshot().context.fenceAcquired).toBe(true);

    actor.send({ type: 'SESSION_CLEARED', resetId: RESET_ID });
    expectActiveState(actor, 'clearingLocal');
    actor.send({ type: 'LOCAL_CLEARED', resetId: RESET_ID });
    expectActiveState(actor, 'reinitializing');
  });

  it('recognizes an exact latest receipt after E2 writes and rejects the wrong receipt', () => {
    const actor = createResetActor();
    actor.send(request);
    expectActiveState(actor, 'preflightingCompletion');

    const wrongReceipt = { ...receipt(), resetId: uuid(30) };
    actor.send({
      type: 'RESET_COMPLETION_RECOGNIZED',
      resetId: RESET_ID,
      proof: postClearProof(wrongReceipt),
    });
    expectActiveState(actor, 'preflightingCompletion');

    const proof = postClearProof(receipt(), 29);
    expect(parseLocalDataResetPostClearCompletionProof(proof, proofExpectation)).not.toBeNull();
    actor.send({ type: 'RESET_COMPLETION_RECOGNIZED', resetId: RESET_ID, proof });
    expect(actor.getSnapshot().value).toBe('completed');
    expect(actor.getSnapshot().context).toMatchObject({
      phase: 'committed',
      completionDisposition: 'recognized',
      databaseReinitialized: true,
      settingsAligned: true,
      receiptPersisted: true,
      commitCheckpointed: true,
    });
  });

  it('requires generation 0 for physical reinitialization but accepts generation 2 alignment', () => {
    const actor = createResetActor();
    advanceToAligningSettings(actor);
    const fresh = settingsEnvelope(0);
    const settled = settingsEnvelope(2);
    expect(
      isFreshResetSettingsEnvelope(fresh, NEXT_EPOCH, DEFAULT_SETTINGS, INCLUDED_CONNECTORS)
    ).toBe(true);
    expect(
      isFreshResetSettingsEnvelope(settled, NEXT_EPOCH, DEFAULT_SETTINGS, INCLUDED_CONNECTORS)
    ).toBe(false);

    const proof = alignmentProof(2);
    expect(
      parseResetOwnedSettingsAlignmentProof(proof, {
        resetId: RESET_ID,
        dataEpoch: NEXT_EPOCH,
        requestId: SETTINGS_RECOVERY_REQUEST_ID,
        commandId: settingsResetRecoveryCommandId(SETTINGS_RECOVERY_REQUEST_ID),
        defaultSettings: DEFAULT_SETTINGS,
        includedConnectorIds: INCLUDED_CONNECTORS,
      })
    ).not.toBeNull();
    actor.send({ type: 'SETTINGS_ALIGNED', resetId: RESET_ID, proof });
    expectActiveState(actor, 'broadcastingReadiness');

    const mismatchedAlarm = {
      ...proof,
      alarmProof: { ...proof.alarmProof, envelopeGeneration: 0 },
    };
    expect(
      parseResetOwnedSettingsAlignmentProof(mismatchedAlarm, {
        resetId: RESET_ID,
        dataEpoch: NEXT_EPOCH,
        requestId: SETTINGS_RECOVERY_REQUEST_ID,
        commandId: settingsResetRecoveryCommandId(SETTINGS_RECOVERY_REQUEST_ID),
        defaultSettings: DEFAULT_SETTINGS,
        includedConnectorIds: INCLUDED_CONNECTORS,
      })
    ).toBeNull();
  });
});

describe('local data reset strict proof parsers', () => {
  it('accepts canonical proof shapes and rejects extra symbol keys', () => {
    const epoch = resetEpochPayload('committed');
    expect(parseLocalDataResetEpochEvent(epoch)).toEqual(epoch);
    expect(
      parseLocalDataResetFreshPreflightProof(freshPreflightProof(), proofExpectation)
    ).not.toBeNull();
    expect(
      parseLocalDataResetInitialDatabaseProof(initialDatabaseProof(), NEXT_EPOCH)
    ).not.toBeNull();
    expect(parseLocalDataResetReceipt(receipt())).toEqual(receipt());
    expect(
      parseLocalDataResetPostClearCompletionProof(postClearProof(), proofExpectation)
    ).not.toBeNull();

    const withSymbol = { ...epoch, [Symbol('hidden')]: true };
    expect(parseLocalDataResetEpochEvent(withSymbol)).toBeNull();
  });

  it('rejects accessor descriptors without invoking them, including nested proofs', () => {
    let getterCalls = 0;
    const accessorReceipt: Record<string, unknown> = { ...receipt() };
    Object.defineProperty(accessorReceipt, 'resetId', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return RESET_ID;
      },
    });
    expect(parseLocalDataResetReceipt(accessorReceipt)).toBeNull();
    expect(getterCalls).toBe(0);

    const nestedAccessor = postClearProof();
    const trackingMeta: Record<string, unknown> = {
      ...nestedAccessor.authority.trackingMeta,
    };
    Object.defineProperty(trackingMeta, 'collectionRevision', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 29;
      },
    });
    const hostileProof = {
      ...nestedAccessor,
      authority: { ...nestedAccessor.authority, trackingMeta },
    };
    expect(parseLocalDataResetPostClearCompletionProof(hostileProof, proofExpectation)).toBeNull();
    expect(getterCalls).toBe(0);
  });

  it('returns null without throwing for revoked proxies across all public proof parsers', () => {
    const journal: LocalDataResetJournalV1 = {
      schemaVersion: 1,
      resetId: RESET_ID,
      previousDataEpoch: PREVIOUS_EPOCH,
      nextDataEpoch: NEXT_EPOCH,
      settingsRecoveryRequestId: SETTINGS_RECOVERY_REQUEST_ID,
      settingsBootstrapRequestId: SETTINGS_BOOTSTRAP_REQUEST_ID,
      phase: 'journaled',
      requestedAt: REQUESTED_AT,
      retryCount: 0,
      lastError: null,
    };
    const parsers: Array<{ value: object; parse: (value: unknown) => unknown }> = [
      { value: resetEpochPayload('committed'), parse: parseLocalDataResetEpochEvent },
      { value: journal, parse: parseLocalDataResetJournal },
      { value: receipt(), parse: parseLocalDataResetReceipt },
      {
        value: freshPreflightProof(),
        parse: (value) => parseLocalDataResetFreshPreflightProof(value, proofExpectation),
      },
      {
        value: initialDatabaseProof(),
        parse: (value) => parseLocalDataResetInitialDatabaseProof(value, NEXT_EPOCH),
      },
      {
        value: alignmentProof(2),
        parse: (value) =>
          parseResetOwnedSettingsAlignmentProof(value, {
            resetId: RESET_ID,
            dataEpoch: NEXT_EPOCH,
            requestId: SETTINGS_RECOVERY_REQUEST_ID,
            commandId: settingsResetRecoveryCommandId(SETTINGS_RECOVERY_REQUEST_ID),
            defaultSettings: DEFAULT_SETTINGS,
            includedConnectorIds: INCLUDED_CONNECTORS,
          }),
      },
      {
        value: postClearProof(),
        parse: (value) => parseLocalDataResetPostClearCompletionProof(value, proofExpectation),
      },
    ];

    for (const { value, parse } of parsers) {
      const revocable = Proxy.revocable(value, {});
      revocable.revoke();
      expect(() => parse(revocable.proxy)).not.toThrow();
      expect(parse(revocable.proxy)).toBeNull();
    }
  });

  it('descriptor-snapshots each receipt field once and never rereads the proxy source', () => {
    const source = receipt();
    const descriptorReads = new Map<PropertyKey, number>();
    const proxy = new Proxy(source, {
      getOwnPropertyDescriptor(target, key) {
        descriptorReads.set(key, (descriptorReads.get(key) ?? 0) + 1);
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });

    expect(parseLocalDataResetReceipt(proxy)).toEqual(source);
    for (const key of Reflect.ownKeys(source)) {
      expect(descriptorReads.get(key)).toBe(1);
    }
  });
});
