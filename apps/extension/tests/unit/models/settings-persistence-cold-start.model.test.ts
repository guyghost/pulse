import { describe, expect, it } from 'vitest';

import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import {
  SETTINGS_PENDING_INTENT_STORAGE_KEY,
  contractFor,
  createSettingsPendingIntentV1,
  expectedAlarm,
  makeError,
  normalizeCorrelationIds,
  parseSettingsColdStartRecoverySeedV1,
  settingsDigest,
  type SettingsColdStartRecoverySeedV1,
  type SettingsEnvelopeV2,
  type SettingsGlobalStorageReservationProofV1,
  type SettingsMutationOutcomeV1,
  type SettingsPendingIntentV1,
  type SettingsPendingIntentClearedProofV1,
  type SettingsPendingIntentPersistedProofV1,
  type SettingsSnapshotV1,
} from '../../../src/models/settings-persistence.contract';
import {
  createSettingsPersistenceController,
  type SettingsPersistenceController,
  type SettingsPersistencePublicView,
} from '../../../src/models/settings-persistence.machine';

const uuid = (suffix: number): string =>
  `20000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

const DATA_EPOCH = uuid(1);
const WORKER_A = uuid(2);
const WORKER_B = uuid(3);
const WORKER_C = uuid(4);
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
const PERMISSION_ORIGINS = { 'free-work': ['https://www.free-work.com/*'] };

type PublicCommand = NonNullable<SettingsPersistencePublicView['command']>;

function controller(
  workerEpoch = WORKER_A,
  coldStartSeed: SettingsColdStartRecoverySeedV1 | null = null,
  loadRequestId = uuid(10)
): SettingsPersistenceController {
  return createSettingsPersistenceController({
    dataEpoch: DATA_EPOCH,
    workerEpoch,
    defaultSettings: DEFAULT_SETTINGS,
    includedConnectorIds: INCLUDED_CONNECTORS,
    permissionOriginsByConnectorId: PERMISSION_ORIGINS,
    initialLoadRequestId: loadRequestId,
    coldStartSeed,
  });
}

function commandOfType<T extends PublicCommand['type']>(
  current: SettingsPersistenceController,
  type: T
): Extract<PublicCommand, { type: T }> {
  const command = current.getSnapshot().command;
  expect(command?.type).toBe(type);
  if (command?.type !== type) {
    throw new Error(`Expected ${type}`);
  }
  return command as Extract<PublicCommand, { type: T }>;
}

function envelope(
  settings: AppSettings = DEFAULT_SETTINGS,
  revision = 0,
  generation = 0,
  outcomes: SettingsMutationOutcomeV1[] = [],
  dataEpoch = DATA_EPOCH
): SettingsEnvelopeV2 {
  return {
    version: 2,
    dataEpoch,
    revision,
    generation,
    settings: { ...settings, enabledConnectors: [...settings.enabledConnectors] },
    journal: null,
    outcomes,
  };
}

type CrashEnvelopeKind =
  | 'base'
  | 'effects_pending'
  | 'compensation_pending'
  | 'compensation_effects_pending'
  | 'committed';

function mutationOutcome(
  pendingIntent: SettingsPendingIntentV1,
  outcome: 'committed' | 'not_committed' | 'compensated'
): SettingsMutationOutcomeV1 {
  const mutation = pendingIntent.mutation;
  const settledRevision =
    outcome === 'committed'
      ? mutation.baseRevision + 1
      : outcome === 'compensated'
        ? mutation.baseRevision + 2
        : mutation.baseRevision;
  const settledGeneration =
    outcome === 'committed'
      ? mutation.baseGeneration + 2
      : outcome === 'compensated'
        ? mutation.baseGeneration + 4
        : mutation.baseGeneration + 1;
  return {
    version: 1,
    dataEpoch: pendingIntent.dataEpoch,
    mutationId: mutation.mutationId,
    commandDigest: mutation.commandDigest,
    previousDigest: mutation.previousDigest,
    candidateDigest: mutation.candidateDigest,
    baseRevision: mutation.baseRevision,
    baseGeneration: mutation.baseGeneration,
    settledRevision,
    settledGeneration,
    correlationIds: [...mutation.correlationIds],
    outcome,
  };
}

function crashEnvelope(
  pendingIntent: SettingsPendingIntentV1,
  kind: CrashEnvelopeKind,
  transactionId: string
): SettingsEnvelopeV2 {
  const mutation = pendingIntent.mutation;
  if (kind === 'base') {
    return envelope(mutation.previousSettings, mutation.baseRevision, mutation.baseGeneration);
  }
  if (kind === 'committed') {
    const outcome = mutationOutcome(pendingIntent, 'committed');
    return envelope(
      mutation.candidateSettings,
      outcome.settledRevision,
      outcome.settledGeneration,
      [outcome]
    );
  }
  const phase = kind;
  const compensation = phase !== 'effects_pending';
  const settings =
    phase === 'compensation_effects_pending'
      ? mutation.previousSettings
      : mutation.candidateSettings;
  const revision = mutation.baseRevision + (phase === 'compensation_effects_pending' ? 2 : 1);
  const generation =
    mutation.baseGeneration +
    (phase === 'effects_pending' ? 1 : phase === 'compensation_pending' ? 2 : 3);
  return {
    version: 2,
    dataEpoch: pendingIntent.dataEpoch,
    revision,
    generation,
    settings: { ...settings, enabledConnectors: [...settings.enabledConnectors] },
    journal: {
      version: 1,
      phase,
      transactionId,
      mutationId: mutation.mutationId,
      commandDigest: mutation.commandDigest,
      baseRevision: mutation.baseRevision,
      baseGeneration: mutation.baseGeneration,
      previousSettings: {
        ...mutation.previousSettings,
        enabledConnectors: [...mutation.previousSettings.enabledConnectors],
      },
      candidateSettings: {
        ...mutation.candidateSettings,
        enabledConnectors: [...mutation.candidateSettings.enabledConnectors],
      },
      previousDigest: mutation.previousDigest,
      candidateDigest: mutation.candidateDigest,
      correlationIds: normalizeCorrelationIds([...mutation.correlationIds, transactionId]),
      expectedAlarm: expectedAlarm(
        compensation ? mutation.previousSettings : mutation.candidateSettings
      ),
    },
    outcomes: [],
  };
}

function settledEnvelope(
  pendingIntent: SettingsPendingIntentV1,
  outcomeKind: 'committed' | 'not_committed' | 'compensated'
): SettingsEnvelopeV2 {
  const outcome = mutationOutcome(pendingIntent, outcomeKind);
  const settings =
    outcomeKind === 'committed'
      ? pendingIntent.mutation.candidateSettings
      : pendingIntent.mutation.previousSettings;
  return envelope(settings, outcome.settledRevision, outcome.settledGeneration, [outcome]);
}

function snapshot(
  currentEnvelope: SettingsEnvelopeV2,
  requestId: string,
  commandId: string,
  proofId: string
): SettingsSnapshotV1 {
  const dataEpoch = currentEnvelope.dataEpoch;
  return {
    version: 1,
    dataEpoch,
    requestId,
    commandId,
    resetJournalAbsent: true,
    envelope: currentEnvelope,
    alarmProof: {
      ...expectedAlarm(currentEnvelope.settings),
      dataEpoch,
      envelopeRevision: currentEnvelope.revision,
      envelopeGeneration: currentEnvelope.generation,
      settingsDigest: settingsDigest(currentEnvelope.settings),
      proofId,
      requestId,
      commandId,
    },
  };
}

function finishLoad(current: SettingsPersistenceController): void {
  const command = commandOfType(current, 'RECOVER_AND_LOAD_SETTINGS');
  expect(
    current.dispatch({
      type: 'LOAD_SUCCEEDED',
      dataEpoch: DATA_EPOCH,
      requestId: command.requestId,
      commandId: command.commandId,
      snapshot: snapshot(envelope(), command.requestId, command.commandId, uuid(11)),
    })
  ).toEqual({ status: 'dispatched' });
}

function persistedProof(
  command: Extract<PublicCommand, { type: 'PERSIST_SETTINGS_PENDING_INTENT' }>,
  proofId: string
): SettingsPendingIntentPersistedProofV1 {
  return {
    version: 1,
    kind: 'SETTINGS_PENDING_INTENT_PERSISTED',
    storageArea: 'session',
    storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
    dataEpoch: command.dataEpoch,
    mutationId: command.pendingIntent.mutation.mutationId,
    originWorkerEpoch: command.pendingIntent.originWorkerEpoch,
    intentRevision: command.intentRevision,
    intentDigest: command.intentDigest,
    commandId: command.commandId,
    proofId,
    readBackVerified: true,
  };
}

function acknowledgePersist(
  current: SettingsPersistenceController,
  proofId: string
): Extract<PublicCommand, { type: 'RESERVE_SETTINGS_STORAGE' }> {
  const command = commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT');
  acknowledgeExactPersist(current, command, proofId);
  return commandOfType(current, 'RESERVE_SETTINGS_STORAGE');
}

function acknowledgeExactPersist(
  current: SettingsPersistenceController,
  command: Extract<PublicCommand, { type: 'PERSIST_SETTINGS_PENDING_INTENT' }>,
  proofId: string
): void {
  expect(
    current.dispatch({
      type: 'SETTINGS_PENDING_INTENT_PERSISTED',
      dataEpoch: command.dataEpoch,
      mutationId: command.pendingIntent.mutation.mutationId,
      commandId: command.commandId,
      proof: persistedProof(command, proofId),
    })
  ).toEqual({ status: 'dispatched' });
}

function startThemeMutation(current: SettingsPersistenceController): void {
  expect(
    current.dispatch({
      type: 'MUTATE',
      dataEpoch: DATA_EPOCH,
      mutationId: uuid(20),
      permissionCheckId: uuid(21),
      activationId: uuid(22),
      storageReservationId: uuid(23),
      activationResult: {
        version: 1,
        kind: 'SETTINGS_ACTIVATION_CONSUMED',
        dataEpoch: DATA_EPOCH,
        workerEpoch: WORKER_A,
        mutationId: uuid(20),
        permissionCheckId: uuid(21),
        activationId: uuid(22),
        storageReservationId: uuid(23),
        issuedAtMs: 1_000,
        expiresAtMs: 301_000,
        observedAtMs: 2_000,
        resultId: uuid(900),
        oneShotConsumed: true,
      },
      key: 'theme',
      candidate: 'dark',
    })
  ).toEqual({ status: 'dispatched' });
}

function reservationProof(
  command: Extract<PublicCommand, { type: 'RESERVE_SETTINGS_STORAGE' }>
): SettingsGlobalStorageReservationProofV1 {
  const quotaBytes = 10_000_000;
  return {
    version: 1,
    kind: 'CHROME_LOCAL_SETTINGS_RESERVATION',
    storageArea: 'local',
    settingsKey: 'settings',
    dataEpoch: command.dataEpoch,
    mutationId: command.mutationId,
    commandDigest: command.commandDigest,
    baseRevision: command.baseRevision,
    baseGeneration: command.baseGeneration,
    reservationId: command.reservationId,
    gateLeaseId: uuid(30),
    proofId: uuid(31),
    quotaBytes,
    bytesInUse: 0,
    currentSettingsEntryBytes: command.byteProjection.currentSettingsEntryBytes,
    reservedSettingsEntryBytes: command.byteProjection.reservedSettingsEntryBytes,
    requiredAdditionalBytes: command.byteProjection.requiredAdditionalBytes,
    systemReserveBytes: command.byteProjection.systemReserveBytes,
    resetReceiptReserveBytes: command.byteProjection.resetReceiptReserveBytes,
    availableAfterReservationBytes: quotaBytes - command.byteProjection.requiredAdditionalBytes,
    reservationActive: true,
    allLocalWritersFenced: true,
    resetJournalAbsent: true,
  };
}

function clearedProof(
  command: Extract<PublicCommand, { type: 'CLEAR_SETTINGS_PENDING_INTENT' }>,
  proofId: string
): SettingsPendingIntentClearedProofV1 {
  return {
    version: 1,
    kind: 'SETTINGS_PENDING_INTENT_CLEARED',
    storageArea: 'session',
    storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
    dataEpoch: command.dataEpoch,
    mutationId: command.mutationId,
    originWorkerEpoch: command.originWorkerEpoch,
    intentRevision: command.intentRevision,
    intentDigest: command.intentDigest,
    commandId: command.commandId,
    proofId,
    absenceReadBackVerified: true,
  };
}

describe('settings pending intent admission and terminal cleanup', () => {
  it('uses a distinct durable command identity for every intent revision', () => {
    const current = controller();
    finishLoad(current);
    startThemeMutation(current);

    const reservingIntent = commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT');
    const reserve = acknowledgePersist(current, uuid(24));
    expect(
      current.dispatch({
        type: 'STORAGE_RESERVATION_GRANTED',
        dataEpoch: DATA_EPOCH,
        mutationId: reserve.mutationId,
        commandId: reserve.commandId,
        proof: reservationProof(reserve),
      })
    ).toEqual({ status: 'dispatched' });
    const writingIntent = commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT');

    expect(reservingIntent.intentRevision).toBe(1);
    expect(writingIntent.intentRevision).toBe(2);
    expect(writingIntent.commandId).not.toBe(reservingIntent.commandId);
    expect(commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT')).toEqual(writingIntent);
  });

  it('persists and reads back the exact first intent before reservation admission', () => {
    const current = controller();
    finishLoad(current);
    startThemeMutation(current);

    expect(current.getSnapshot()).toMatchObject({
      state: 'persistingIntent',
      editingDisabled: true,
      terminalSettlement: null,
    });
    const persist = commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT');
    expect(persist).toMatchObject({
      storageArea: 'session',
      storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
      intentRevision: 1,
      pendingIntent: {
        version: 1,
        dataEpoch: DATA_EPOCH,
        originWorkerEpoch: WORKER_A,
        intentRevision: 1,
        phase: 'reserving',
        nextCommandType: 'RESERVE_SETTINGS_STORAGE',
      },
    });

    const stale = persistedProof(persist, uuid(32));
    expect(
      current.dispatch({
        type: 'SETTINGS_PENDING_INTENT_PERSISTED',
        dataEpoch: DATA_EPOCH,
        mutationId: persist.pendingIntent.mutation.mutationId,
        commandId: persist.commandId,
        proof: { ...stale, intentRevision: 2 },
      })
    ).toEqual({ status: 'rejected', reason: 'invalid_event' });
    expect(commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT').intentRevision).toBe(1);

    const reserve = acknowledgePersist(current, uuid(33));
    expect(current.getSnapshot().state).toBe('reserving');
    expect(reserve.mutationId).toBe(uuid(20));
  });

  it('retries an ambiguous first write idempotently and fails only with exact absence proof', () => {
    const current = controller();
    finishLoad(current);
    startThemeMutation(current);
    const persist = commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT');
    const ambiguous = makeError(
      contractFor('SETTINGS_TRANSPORT_ERROR', 'unknown', 'pending_intent'),
      'Session write outcome is unknown.'
    );
    expect(
      current.dispatch({
        type: 'SETTINGS_PENDING_INTENT_PERSIST_OUTCOME_UNKNOWN',
        dataEpoch: DATA_EPOCH,
        mutationId: persist.pendingIntent.mutation.mutationId,
        commandId: persist.commandId,
        error: ambiguous,
      })
    ).toEqual({ status: 'dispatched' });
    expect(commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT')).toEqual(persist);

    const absentProof = {
      version: 1 as const,
      kind: 'SETTINGS_PENDING_INTENT_ABSENT' as const,
      storageArea: 'session' as const,
      storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
      dataEpoch: persist.dataEpoch,
      mutationId: persist.pendingIntent.mutation.mutationId,
      originWorkerEpoch: persist.pendingIntent.originWorkerEpoch,
      intentRevision: 1 as const,
      intentDigest: persist.intentDigest,
      commandId: persist.commandId,
      proofId: uuid(80),
      absenceReadBackVerified: true as const,
    };
    const failure = makeError(
      contractFor('SETTINGS_STORAGE_FAILED', 'previous', 'pending_intent'),
      'Session storage proved the first intent absent.'
    );
    expect(
      current.dispatch({
        type: 'SETTINGS_PENDING_INTENT_PERSIST_FAILED',
        dataEpoch: DATA_EPOCH,
        mutationId: absentProof.mutationId,
        commandId: persist.commandId,
        proof: { ...absentProof, intentDigest: 'pending/v1:stale' },
        error: failure,
      })
    ).toEqual({ status: 'rejected', reason: 'invalid_event' });
    expect(
      current.dispatch({
        type: 'SETTINGS_PENDING_INTENT_PERSIST_FAILED',
        dataEpoch: DATA_EPOCH,
        mutationId: absentProof.mutationId,
        commandId: persist.commandId,
        proof: absentProof,
        error: failure,
      })
    ).toEqual({ status: 'dispatched' });
    expect(current.getSnapshot()).toMatchObject({
      state: 'failed',
      command: null,
      error: { code: 'SETTINGS_STORAGE_FAILED', operation: 'pending_intent' },
      terminalSettlement: null,
    });
  });

  it('keeps a causal terminal private until exact remove plus absence read-back', () => {
    const current = controller();
    finishLoad(current);
    startThemeMutation(current);
    const reserve = acknowledgePersist(current, uuid(40));
    expect(
      current.dispatch({
        type: 'STORAGE_RESERVATION_GRANTED',
        dataEpoch: DATA_EPOCH,
        mutationId: reserve.mutationId,
        commandId: reserve.commandId,
        proof: reservationProof(reserve),
      })
    ).toEqual({ status: 'dispatched' });

    const persistWrite = commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT');
    expect(persistWrite.intentRevision).toBe(2);
    expect(
      current.dispatch({
        type: 'SETTINGS_PENDING_INTENT_PERSISTED',
        dataEpoch: DATA_EPOCH,
        mutationId: reserve.mutationId,
        commandId: persistWrite.commandId,
        proof: persistedProof(persistWrite, uuid(41)),
      })
    ).toEqual({ status: 'dispatched' });
    const write = commandOfType(current, 'COMPARE_AND_SETTLE_SETTINGS');
    const outcome: SettingsMutationOutcomeV1 = {
      version: 1,
      dataEpoch: DATA_EPOCH,
      mutationId: write.mutationId,
      commandDigest: write.commandDigest,
      previousDigest: write.previousDigest,
      candidateDigest: write.candidateDigest,
      baseRevision: write.baseRevision,
      baseGeneration: write.baseGeneration,
      settledRevision: write.baseRevision + 1,
      settledGeneration: write.baseGeneration + 2,
      correlationIds: [...write.correlationIds],
      outcome: 'committed',
    };
    const committed = envelope(
      write.candidateSettings as AppSettings,
      write.baseRevision + 1,
      write.baseGeneration + 2,
      [outcome]
    );
    expect(
      current.dispatch({
        type: 'SAVE_SUCCEEDED',
        dataEpoch: DATA_EPOCH,
        mutationId: write.mutationId,
        commandId: write.commandId,
        snapshot: snapshot(committed, write.mutationId, write.commandId, uuid(42)),
      })
    ).toEqual({ status: 'dispatched' });

    expect(current.getSnapshot()).toMatchObject({
      state: 'clearingIntent',
      saveStatus: 'saving',
      editingDisabled: true,
      terminalSettlement: null,
      confirmedSettings: { theme: 'dark' },
    });
    const clear = commandOfType(current, 'CLEAR_SETTINGS_PENDING_INTENT');
    expect(
      current.dispatch({
        type: 'SETTINGS_PENDING_INTENT_CLEAR_OUTCOME_UNKNOWN',
        dataEpoch: DATA_EPOCH,
        mutationId: clear.mutationId,
        commandId: clear.commandId,
        error: makeError(
          contractFor('SETTINGS_TRANSPORT_ERROR', 'unknown', 'pending_intent'),
          'Session clear outcome is unknown.'
        ),
      })
    ).toEqual({ status: 'dispatched' });
    expect(commandOfType(current, 'CLEAR_SETTINGS_PENDING_INTENT')).toEqual(clear);
    expect(current.getSnapshot().terminalSettlement).toBeNull();
    expect(
      current.dispatch({
        type: 'SETTINGS_PENDING_INTENT_CLEARED',
        dataEpoch: DATA_EPOCH,
        mutationId: clear.mutationId,
        commandId: clear.commandId,
        proof: { ...clearedProof(clear, uuid(43)), intentDigest: 'pending/v1:stale' },
      })
    ).toEqual({ status: 'rejected', reason: 'invalid_event' });
    expect(current.getSnapshot().terminalSettlement).toBeNull();

    expect(
      current.dispatch({
        type: 'SETTINGS_PENDING_INTENT_CLEARED',
        dataEpoch: DATA_EPOCH,
        mutationId: clear.mutationId,
        commandId: clear.commandId,
        proof: clearedProof(clear, uuid(44)),
      })
    ).toEqual({ status: 'dispatched' });
    const settled = current.getSnapshot();
    expect(settled.state).toBe('saved');
    expect(settled.terminalSettlement).toMatchObject({
      version: 1,
      dataEpoch: DATA_EPOCH,
      mutationId: write.mutationId,
      requestId: write.mutationId,
      commandId: write.commandId,
      outcome,
    });
    expect(Object.isFrozen(settled.terminalSettlement)).toBe(true);
    expect(Object.isFrozen(settled.terminalSettlement?.outcome)).toBe(true);
  });

  it('clears the exact old-epoch intent before exposing reset readiness', () => {
    const current = controller();
    finishLoad(current);
    startThemeMutation(current);
    const resetId = uuid(70);
    const nextDataEpoch = uuid(71);
    const settingsBootstrapRequestId = uuid(72);

    expect(
      current.dispatch({
        type: 'RESET_EPOCH_READY_TO_COMMIT',
        payload: {
          version: 1,
          stage: 'ready_to_commit',
          resetId,
          previousDataEpoch: DATA_EPOCH,
          nextDataEpoch,
          settingsBootstrapRequestId,
        },
      })
    ).toEqual({ status: 'dispatched' });
    expect(current.getSnapshot()).toMatchObject({
      state: 'clearingIntent',
      loadStatus: 'reset_pending',
      terminalSettlement: null,
    });
    const clear = commandOfType(current, 'CLEAR_SETTINGS_PENDING_INTENT');
    expect(
      current.dispatch({
        type: 'SETTINGS_PENDING_INTENT_CLEARED',
        dataEpoch: DATA_EPOCH,
        mutationId: clear.mutationId,
        commandId: clear.commandId,
        proof: clearedProof(clear, uuid(73)),
      })
    ).toEqual({ status: 'dispatched' });
    expect(current.getSnapshot()).toMatchObject({
      state: 'resetPending',
      loadStatus: 'reset_pending',
      command: null,
    });
  });
});

describe('settings cold controller seed', () => {
  it('durably rotates controller B before reconciliation and never reuses a lease or candidate write', () => {
    const current = controller();
    finishLoad(current);
    startThemeMutation(current);
    const persist = commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT');
    const seed: SettingsColdStartRecoverySeedV1 = {
      version: 1,
      dataEpoch: DATA_EPOCH,
      recoveryWorkerEpoch: WORKER_B,
      recoveryRequestId: uuid(50),
      pendingIntent: persist.pendingIntent,
      envelope: envelope(),
    };
    current.stop();

    const recovered = controller(
      WORKER_B,
      JSON.parse(JSON.stringify(seed)) as typeof seed,
      uuid(51)
    );
    expect(recovered.getSnapshot()).toMatchObject({
      state: 'persistingIntent',
      terminalSettlement: null,
      editingDisabled: true,
    });
    const rotation = commandOfType(recovered, 'PERSIST_SETTINGS_PENDING_INTENT');
    expect(rotation).toMatchObject({
      intentRevision: persist.intentRevision + 1,
      pendingIntent: {
        phase: 'reconciling',
        nextCommandType: 'RECONCILE_SETTINGS',
        requestId: uuid(50),
        mutation: { storageReservationProof: null },
      },
    });
    expect(rotation.pendingIntent.mutation.correlationIds).toContain(uuid(50));
    acknowledgeExactPersist(recovered, rotation, uuid(52));
    const command = commandOfType(recovered, 'RECONCILE_SETTINGS');
    expect(command).toMatchObject({
      mutationId: uuid(20),
      requestId: uuid(50),
      reason: 'worker_restart',
      storageReservationProof: null,
    });
    expect(command.type).not.toBe('COMPARE_AND_SETTLE_SETTINGS');
  });

  it('keeps SETTINGS_OUTCOME_MISSING durably fenced across workers until explicit reset', () => {
    const controllerA = controller();
    finishLoad(controllerA);
    startThemeMutation(controllerA);
    const intentA = commandOfType(controllerA, 'PERSIST_SETTINGS_PENDING_INTENT');
    const envelopeWithoutOutcome = envelope();
    const seedB: SettingsColdStartRecoverySeedV1 = {
      version: 1,
      dataEpoch: DATA_EPOCH,
      recoveryWorkerEpoch: WORKER_B,
      recoveryRequestId: uuid(300),
      pendingIntent: intentA.pendingIntent,
      envelope: envelopeWithoutOutcome,
    };
    controllerA.stop();

    const controllerB = controller(
      WORKER_B,
      JSON.parse(JSON.stringify(seedB)) as SettingsColdStartRecoverySeedV1,
      uuid(301)
    );
    const durableRotationB = commandOfType(controllerB, 'PERSIST_SETTINGS_PENDING_INTENT');
    acknowledgeExactPersist(controllerB, durableRotationB, uuid(302));
    const reconcileB = commandOfType(controllerB, 'RECONCILE_SETTINGS');
    expect(
      controllerB.dispatch({
        type: 'RECONCILED',
        dataEpoch: DATA_EPOCH,
        requestId: reconcileB.requestId,
        commandId: reconcileB.commandId,
        snapshot: snapshot(
          envelopeWithoutOutcome,
          reconcileB.requestId,
          reconcileB.commandId,
          uuid(303)
        ),
      })
    ).toEqual({ status: 'dispatched' });
    expect(controllerB.getSnapshot()).toMatchObject({
      state: 'failed',
      saveStatus: 'failed',
      editingDisabled: true,
      command: null,
      terminalSettlement: null,
      error: { code: 'SETTINGS_OUTCOME_MISSING', recoverable: false },
    });

    const durableFenceForC = JSON.parse(
      JSON.stringify(durableRotationB.pendingIntent)
    ) as SettingsPendingIntentV1;
    controllerB.stop();
    expect(
      controllerB.dispatch({
        type: 'RECONCILED',
        dataEpoch: DATA_EPOCH,
        requestId: reconcileB.requestId,
        commandId: reconcileB.commandId,
        snapshot: snapshot(
          envelopeWithoutOutcome,
          reconcileB.requestId,
          reconcileB.commandId,
          uuid(304)
        ),
      })
    ).toEqual({ status: 'rejected', reason: 'inactive' });

    const seedC: SettingsColdStartRecoverySeedV1 = {
      version: 1,
      dataEpoch: DATA_EPOCH,
      recoveryWorkerEpoch: WORKER_C,
      recoveryRequestId: uuid(310),
      pendingIntent: durableFenceForC,
      envelope: envelopeWithoutOutcome,
    };
    expect(parseSettingsColdStartRecoverySeedV1(seedC, INCLUDED_CONNECTORS)).not.toBeNull();
    const controllerC = controller(WORKER_C, seedC, uuid(311));
    expect(controllerC.getSnapshot()).toMatchObject({
      state: 'persistingIntent',
      editingDisabled: true,
      terminalSettlement: null,
    });
    const durableRotationC = commandOfType(controllerC, 'PERSIST_SETTINGS_PENDING_INTENT');
    expect(durableRotationC.intentRevision).toBe(durableRotationB.intentRevision + 1);
    expect(durableRotationC.pendingIntent.originWorkerEpoch).toBe(WORKER_A);
    expect(durableRotationC.pendingIntent.mutation.correlationIds).toContain(uuid(310));
    acknowledgeExactPersist(controllerC, durableRotationC, uuid(312));
    const reconcileC = commandOfType(controllerC, 'RECONCILE_SETTINGS');
    expect(
      controllerC.dispatch({
        type: 'RECONCILED',
        dataEpoch: DATA_EPOCH,
        requestId: reconcileC.requestId,
        commandId: reconcileC.commandId,
        snapshot: snapshot(
          envelopeWithoutOutcome,
          reconcileC.requestId,
          reconcileC.commandId,
          uuid(313)
        ),
      })
    ).toEqual({ status: 'dispatched' });
    expect(controllerC.getSnapshot()).toMatchObject({
      state: 'failed',
      editingDisabled: true,
      command: null,
      terminalSettlement: null,
      error: { code: 'SETTINGS_OUTCOME_MISSING', recoverable: false },
    });

    const fatalSnapshot = controllerC.getSnapshot();
    expect(fatalSnapshot.lastRejection).toBeNull();
    const fatalRetry = {
      type: 'RETRY',
      dataEpoch: DATA_EPOCH,
      failedMutationId: uuid(20),
      mutationId: uuid(330),
      permissionCheckId: uuid(331),
      activationId: uuid(332),
      storageReservationId: uuid(333),
      activationResult: {
        version: 1,
        kind: 'SETTINGS_ACTIVATION_CONSUMED',
        dataEpoch: DATA_EPOCH,
        workerEpoch: WORKER_C,
        mutationId: uuid(330),
        permissionCheckId: uuid(331),
        activationId: uuid(332),
        storageReservationId: uuid(333),
        issuedAtMs: 10_000,
        expiresAtMs: 310_000,
        observedAtMs: 11_000,
        resultId: uuid(334),
        oneShotConsumed: true,
      },
      requestId: uuid(335),
    };
    expect(controllerC.dispatch(fatalRetry)).toEqual({ status: 'dispatched' });
    expect(controllerC.getSnapshot()).toStrictEqual(fatalSnapshot);
    expect(controllerC.dispatch(fatalRetry)).toEqual({ status: 'dispatched' });
    expect(controllerC.getSnapshot()).toStrictEqual(fatalSnapshot);

    expect(
      controllerC.dispatch({
        type: 'MUTATE',
        dataEpoch: DATA_EPOCH,
        mutationId: uuid(340),
        permissionCheckId: uuid(341),
        activationId: uuid(342),
        storageReservationId: uuid(343),
        activationResult: {
          version: 1,
          kind: 'SETTINGS_ACTIVATION_CONSUMED',
          dataEpoch: DATA_EPOCH,
          workerEpoch: WORKER_C,
          mutationId: uuid(340),
          permissionCheckId: uuid(341),
          activationId: uuid(342),
          storageReservationId: uuid(343),
          issuedAtMs: 20_000,
          expiresAtMs: 320_000,
          observedAtMs: 21_000,
          resultId: uuid(344),
          oneShotConsumed: true,
        },
        key: 'theme',
        candidate: 'light',
      })
    ).toEqual({ status: 'dispatched' });
    expect(controllerC.getSnapshot()).toStrictEqual(fatalSnapshot);
    expect(
      controllerC.dispatch({
        type: 'DISMISS_ERROR',
        dataEpoch: DATA_EPOCH,
        mutationId: uuid(20),
      })
    ).toEqual({ status: 'dispatched' });
    expect(controllerC.getSnapshot()).toStrictEqual(fatalSnapshot);
    expect(
      controllerC.dispatch({
        type: 'RECONCILED',
        dataEpoch: DATA_EPOCH,
        requestId: reconcileC.requestId,
        commandId: reconcileC.commandId,
        snapshot: snapshot(
          envelopeWithoutOutcome,
          reconcileC.requestId,
          reconcileC.commandId,
          uuid(314)
        ),
      })
    ).toEqual({ status: 'dispatched' });
    expect(controllerC.getSnapshot()).toStrictEqual(fatalSnapshot);

    const resetId = uuid(320);
    const nextDataEpoch = uuid(321);
    const settingsBootstrapRequestId = uuid(322);
    expect(
      controllerC.dispatch({
        type: 'RESET_EPOCH_READY_TO_COMMIT',
        payload: {
          version: 1,
          stage: 'ready_to_commit',
          resetId,
          previousDataEpoch: DATA_EPOCH,
          nextDataEpoch,
          settingsBootstrapRequestId,
        },
      })
    ).toEqual({ status: 'dispatched' });
    expect(controllerC.getSnapshot()).toMatchObject({
      state: 'clearingIntent',
      loadStatus: 'reset_pending',
      terminalSettlement: null,
    });
    const resetClear = commandOfType(controllerC, 'CLEAR_SETTINGS_PENDING_INTENT');
    expect(
      controllerC.dispatch({
        type: 'SETTINGS_PENDING_INTENT_CLEARED',
        dataEpoch: DATA_EPOCH,
        mutationId: resetClear.mutationId,
        commandId: resetClear.commandId,
        proof: clearedProof(resetClear, uuid(323)),
      })
    ).toEqual({ status: 'dispatched' });
    expect(controllerC.getSnapshot()).toMatchObject({
      state: 'resetPending',
      loadStatus: 'reset_pending',
      command: null,
    });

    expect(
      controllerC.dispatch({
        type: 'RESET_EPOCH_COMMITTED',
        payload: {
          version: 1,
          stage: 'committed',
          resetId,
          previousDataEpoch: DATA_EPOCH,
          nextDataEpoch,
          settingsBootstrapRequestId,
        },
      })
    ).toEqual({ status: 'dispatched' });
    const resetLoad = commandOfType(controllerC, 'RECOVER_AND_LOAD_SETTINGS');
    expect(resetLoad).toMatchObject({
      dataEpoch: nextDataEpoch,
      requestId: settingsBootstrapRequestId,
      resetCorrelation: { resetId, nextDataEpoch },
    });
    const envelopeE2 = envelope(DEFAULT_SETTINGS, 0, 0, [], nextDataEpoch);
    expect(
      controllerC.dispatch({
        type: 'LOAD_SUCCEEDED',
        dataEpoch: nextDataEpoch,
        requestId: resetLoad.requestId,
        commandId: resetLoad.commandId,
        snapshot: snapshot(envelopeE2, resetLoad.requestId, resetLoad.commandId, uuid(324)),
      })
    ).toEqual({ status: 'dispatched' });
    expect(controllerC.getSnapshot()).toMatchObject({
      state: 'saved',
      dataEpoch: nextDataEpoch,
      saveStatus: 'saved',
      lastRejection: null,
      command: null,
    });

    const savedE2Snapshot = controllerC.getSnapshot();
    expect(controllerC.dispatch(fatalRetry)).toEqual({ status: 'dispatched' });
    expect(controllerC.getSnapshot()).toStrictEqual(savedE2Snapshot);
    expect(
      controllerC.dispatch({
        type: 'MUTATE',
        dataEpoch: nextDataEpoch,
        mutationId: uuid(350),
        permissionCheckId: uuid(351),
        activationId: uuid(352),
        storageReservationId: uuid(353),
        activationResult: {
          version: 1,
          kind: 'SETTINGS_ACTIVATION_CONSUMED',
          dataEpoch: nextDataEpoch,
          workerEpoch: WORKER_C,
          mutationId: uuid(350),
          permissionCheckId: uuid(351),
          activationId: uuid(352),
          storageReservationId: uuid(353),
          issuedAtMs: 30_000,
          expiresAtMs: 330_000,
          observedAtMs: 31_000,
          resultId: uuid(354),
          oneShotConsumed: true,
        },
        key: 'theme',
        candidate: 'dark',
      })
    ).toEqual({ status: 'dispatched' });
    expect(controllerC.getSnapshot()).toMatchObject({
      state: 'persistingIntent',
      dataEpoch: nextDataEpoch,
      lastRejection: null,
      terminalSettlement: null,
    });
    expect(commandOfType(controllerC, 'PERSIST_SETTINGS_PENDING_INTENT')).toMatchObject({
      dataEpoch: nextDataEpoch,
      pendingIntent: { dataEpoch: nextDataEpoch, originWorkerEpoch: WORKER_C },
    });
  });

  it.each([
    {
      label: 'before candidate journal',
      seedKind: 'base' as const,
      outcome: 'not_committed' as const,
      idBase: 200,
    },
    {
      label: 'after effects_pending candidate',
      seedKind: 'effects_pending' as const,
      outcome: 'committed' as const,
      idBase: 210,
    },
    {
      label: 'after candidate alarm before outcome',
      seedKind: 'effects_pending' as const,
      outcome: 'committed' as const,
      idBase: 220,
    },
    {
      label: 'after compensation_pending',
      seedKind: 'compensation_pending' as const,
      outcome: 'compensated' as const,
      idBase: 230,
    },
    {
      label: 'after compensation_effects_pending',
      seedKind: 'compensation_effects_pending' as const,
      outcome: 'compensated' as const,
      idBase: 240,
    },
    {
      label: 'after previous alarm before outcome',
      seedKind: 'compensation_effects_pending' as const,
      outcome: 'compensated' as const,
      idBase: 250,
    },
    {
      label: 'after durable outcome before acknowledgement',
      seedKind: 'committed' as const,
      outcome: 'committed' as const,
      idBase: 260,
    },
  ])(
    'recovers $label with a fresh controller, one exact outcome and zero replay',
    ({ seedKind, outcome, idBase }) => {
      const current = controller();
      finishLoad(current);
      startThemeMutation(current);
      const reserve = acknowledgePersist(current, uuid(idBase));
      expect(
        current.dispatch({
          type: 'STORAGE_RESERVATION_GRANTED',
          dataEpoch: DATA_EPOCH,
          mutationId: reserve.mutationId,
          commandId: reserve.commandId,
          proof: reservationProof(reserve),
        })
      ).toEqual({ status: 'dispatched' });
      const durableWriting = commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT');
      acknowledgeExactPersist(current, durableWriting, uuid(idBase + 1));
      expect(current.getSnapshot().state).toBe('writing');

      const seed: SettingsColdStartRecoverySeedV1 = {
        version: 1,
        dataEpoch: DATA_EPOCH,
        recoveryWorkerEpoch: WORKER_B,
        recoveryRequestId: uuid(idBase + 2),
        pendingIntent: durableWriting.pendingIntent,
        envelope: crashEnvelope(durableWriting.pendingIntent, seedKind, uuid(idBase + 3)),
      };
      expect(parseSettingsColdStartRecoverySeedV1(seed, INCLUDED_CONNECTORS)).not.toBeNull();
      current.stop();

      const recovered = controller(
        WORKER_B,
        JSON.parse(JSON.stringify(seed)) as SettingsColdStartRecoverySeedV1,
        uuid(idBase + 4)
      );
      const observedCommands: PublicCommand['type'][] = [];
      const rotation = commandOfType(recovered, 'PERSIST_SETTINGS_PENDING_INTENT');
      observedCommands.push(rotation.type);
      expect(rotation.pendingIntent.mutation.storageReservationProof).toBeNull();
      acknowledgeExactPersist(recovered, rotation, uuid(idBase + 5));

      const reconcile = commandOfType(recovered, 'RECONCILE_SETTINGS');
      observedCommands.push(reconcile.type);
      const finalEnvelope = settledEnvelope(durableWriting.pendingIntent, outcome);
      expect(
        recovered.dispatch({
          type: 'RECONCILED',
          dataEpoch: DATA_EPOCH,
          requestId: reconcile.requestId,
          commandId: reconcile.commandId,
          snapshot: snapshot(
            finalEnvelope,
            reconcile.requestId,
            reconcile.commandId,
            uuid(idBase + 6)
          ),
        })
      ).toEqual({ status: 'dispatched' });

      const clear = commandOfType(recovered, 'CLEAR_SETTINGS_PENDING_INTENT');
      observedCommands.push(clear.type);
      expect(
        recovered.dispatch({
          type: 'SETTINGS_PENDING_INTENT_CLEARED',
          dataEpoch: DATA_EPOCH,
          mutationId: clear.mutationId,
          commandId: clear.commandId,
          proof: clearedProof(clear, uuid(idBase + 7)),
        })
      ).toEqual({ status: 'dispatched' });

      expect(recovered.getSnapshot().terminalSettlement?.outcome.outcome).toBe(outcome);
      expect(observedCommands).toEqual([
        'PERSIST_SETTINGS_PENDING_INTENT',
        'RECONCILE_SETTINGS',
        'CLEAR_SETTINGS_PENDING_INTENT',
      ]);
      expect(observedCommands).not.toContain('COMPARE_AND_SETTLE_SETTINGS');
      expect(observedCommands).not.toContain('RESERVE_SETTINGS_STORAGE');
      expect(observedCommands).not.toContain('VERIFY_SETTINGS_HOST_PERMISSIONS');
    }
  );

  it('rejects a stored reservation proof from another data epoch', () => {
    const current = controller();
    finishLoad(current);
    startThemeMutation(current);
    const reserve = acknowledgePersist(current, uuid(90));
    expect(
      current.dispatch({
        type: 'STORAGE_RESERVATION_GRANTED',
        dataEpoch: DATA_EPOCH,
        mutationId: reserve.mutationId,
        commandId: reserve.commandId,
        proof: reservationProof(reserve),
      })
    ).toEqual({ status: 'dispatched' });
    const persisted = commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT').pendingIntent;
    const foreignProof = {
      ...persisted.mutation.storageReservationProof!,
      dataEpoch: uuid(99),
    };
    const foreignPending = createSettingsPendingIntentV1({
      dataEpoch: persisted.dataEpoch,
      originWorkerEpoch: persisted.originWorkerEpoch,
      intentRevision: persisted.intentRevision,
      mutation: { ...persisted.mutation, storageReservationProof: foreignProof },
      retryIntent: persisted.retryIntent,
      phase: persisted.phase,
      nextCommandType: persisted.nextCommandType,
      nextCommandId: persisted.nextCommandId,
      requestId: persisted.requestId,
      terminalSettlement: persisted.terminalSettlement,
    });

    expect(
      parseSettingsColdStartRecoverySeedV1(
        {
          version: 1,
          dataEpoch: DATA_EPOCH,
          recoveryWorkerEpoch: WORKER_B,
          recoveryRequestId: uuid(98),
          pendingIntent: foreignPending,
          envelope: envelope(),
        },
        INCLUDED_CONNECTORS
      )
    ).toBeNull();
  });

  it('rejects stale, accessor, prototype and causally divergent seeds', () => {
    const current = controller();
    finishLoad(current);
    startThemeMutation(current);
    const persist = commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT');
    const valid: SettingsColdStartRecoverySeedV1 = {
      version: 1,
      dataEpoch: DATA_EPOCH,
      recoveryWorkerEpoch: WORKER_B,
      recoveryRequestId: uuid(60),
      pendingIntent: persist.pendingIntent,
      envelope: envelope(),
    };
    expect(parseSettingsColdStartRecoverySeedV1(valid, INCLUDED_CONNECTORS)).not.toBeNull();
    expect(
      parseSettingsColdStartRecoverySeedV1({ ...valid, dataEpoch: uuid(61) }, INCLUDED_CONNECTORS)
    ).toBeNull();
    expect(
      parseSettingsColdStartRecoverySeedV1(
        { ...valid, pendingIntent: { ...valid.pendingIntent, intentRevision: 2 } },
        INCLUDED_CONNECTORS
      )
    ).toBeNull();
    expect(
      parseSettingsColdStartRecoverySeedV1(
        {
          ...valid,
          pendingIntent: createSettingsPendingIntentV1({
            dataEpoch: valid.pendingIntent.dataEpoch,
            originWorkerEpoch: valid.pendingIntent.originWorkerEpoch,
            intentRevision: Number.MAX_SAFE_INTEGER,
            mutation: valid.pendingIntent.mutation,
            retryIntent: valid.pendingIntent.retryIntent,
            phase: valid.pendingIntent.phase,
            nextCommandType: valid.pendingIntent.nextCommandType,
            nextCommandId: valid.pendingIntent.nextCommandId,
            requestId: valid.pendingIntent.requestId,
            terminalSettlement: valid.pendingIntent.terminalSettlement,
          }),
        },
        INCLUDED_CONNECTORS
      )
    ).toBeNull();
    expect(
      parseSettingsColdStartRecoverySeedV1(
        { ...valid, recoveryWorkerEpoch: valid.pendingIntent.originWorkerEpoch },
        INCLUDED_CONNECTORS
      )
    ).toBeNull();
    expect(
      parseSettingsColdStartRecoverySeedV1(
        { ...valid, recoveryRequestId: valid.pendingIntent.mutation.mutationId },
        INCLUDED_CONNECTORS
      )
    ).toBeNull();
    expect(
      parseSettingsColdStartRecoverySeedV1(
        { ...valid, recoveryRequestId: valid.dataEpoch },
        INCLUDED_CONNECTORS
      )
    ).toBeNull();
    expect(
      parseSettingsColdStartRecoverySeedV1(
        { ...valid, recoveryRequestId: valid.recoveryWorkerEpoch },
        INCLUDED_CONNECTORS
      )
    ).toBeNull();
    expect(
      parseSettingsColdStartRecoverySeedV1(
        { ...valid, recoveryWorkerEpoch: valid.dataEpoch },
        INCLUDED_CONNECTORS
      )
    ).toBeNull();
    expect(
      parseSettingsColdStartRecoverySeedV1(
        Object.assign(Object.create({ inherited: true }) as object, valid),
        INCLUDED_CONNECTORS
      )
    ).toBeNull();

    let getterCalls = 0;
    const accessor = { ...valid } as Record<string, unknown>;
    Object.defineProperty(accessor, 'dataEpoch', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return DATA_EPOCH;
      },
    });
    expect(parseSettingsColdStartRecoverySeedV1(accessor, INCLUDED_CONNECTORS)).toBeNull();
    expect(getterCalls).toBe(0);

    const symbolSeed = { ...valid } as Record<PropertyKey, unknown>;
    symbolSeed[Symbol('foreign')] = true;
    expect(parseSettingsColdStartRecoverySeedV1(symbolSeed, INCLUDED_CONNECTORS)).toBeNull();

    const crossedActivationResultId = uuid(63);
    const crossedMutation = {
      ...valid.pendingIntent.mutation,
      activationResultId: crossedActivationResultId,
      correlationIds: normalizeCorrelationIds([
        ...valid.pendingIntent.mutation.correlationIds,
        crossedActivationResultId,
      ]),
    };
    const crossedPendingIntent = createSettingsPendingIntentV1({
      dataEpoch: valid.pendingIntent.dataEpoch,
      originWorkerEpoch: valid.pendingIntent.originWorkerEpoch,
      intentRevision: valid.pendingIntent.intentRevision,
      mutation: crossedMutation,
      retryIntent: valid.pendingIntent.retryIntent,
      phase: valid.pendingIntent.phase,
      nextCommandType: valid.pendingIntent.nextCommandType,
      nextCommandId: valid.pendingIntent.nextCommandId,
      requestId: valid.pendingIntent.requestId,
      terminalSettlement: valid.pendingIntent.terminalSettlement,
    });
    expect(
      parseSettingsColdStartRecoverySeedV1(
        { ...valid, pendingIntent: crossedPendingIntent },
        INCLUDED_CONNECTORS
      )
    ).toBeNull();

    const invalidController = controller(WORKER_B, { ...valid, dataEpoch: uuid(62) } as never);
    expect(invalidController.getSnapshot()).toMatchObject({
      state: 'modelError',
      command: null,
      terminalSettlement: null,
    });
  });

  it('fails closed before producing an intent revision the cold parser would reject', () => {
    const current = controller();
    finishLoad(current);
    startThemeMutation(current);
    const persisted = commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT').pendingIntent;
    const exhausted = createSettingsPendingIntentV1({
      dataEpoch: persisted.dataEpoch,
      originWorkerEpoch: persisted.originWorkerEpoch,
      intentRevision: Number.MAX_SAFE_INTEGER - 1,
      mutation: persisted.mutation,
      retryIntent: persisted.retryIntent,
      phase: persisted.phase,
      nextCommandType: persisted.nextCommandType,
      nextCommandId: persisted.nextCommandId,
      requestId: persisted.requestId,
      terminalSettlement: persisted.terminalSettlement,
    });
    const seed: SettingsColdStartRecoverySeedV1 = {
      version: 1,
      dataEpoch: DATA_EPOCH,
      recoveryWorkerEpoch: WORKER_B,
      recoveryRequestId: uuid(95),
      pendingIntent: exhausted,
      envelope: envelope(),
    };
    expect(parseSettingsColdStartRecoverySeedV1(seed, INCLUDED_CONNECTORS)).not.toBeNull();

    const recovered = controller(WORKER_B, seed, uuid(96));
    expect(recovered.getSnapshot()).toMatchObject({
      state: 'modelError',
      command: null,
      terminalSettlement: null,
    });
  });
});
