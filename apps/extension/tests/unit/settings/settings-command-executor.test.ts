import { describe, expect, it, vi } from 'vitest';

import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import {
  createContainsOnlySettingsPermissionCommandPort,
  createSettingsCommandExecutor,
} from '../../../src/lib/shell/settings/settings-command-executor';
import type { SettingsBootstrapRepository } from '../../../src/lib/shell/settings/settings-bootstrap.repository';
import type { SettingsDatasetGateCapabilityV1 } from '../../../src/lib/shell/settings/settings-dataset-gate';
import type { SettingsPendingIntentRepository } from '../../../src/lib/shell/settings/settings-pending-intent.repository';
import type { SettingsGlobalStorageReservationAuthority } from '../../../src/lib/shell/settings/settings-storage-reservation-authority';
import type {
  SettingsHostPermissionContainsPort,
  SettingsReservationAuthorityPort,
  SettingsTransactionRepository,
} from '../../../src/lib/shell/settings/settings-transaction.repository';
import {
  SETTINGS_PENDING_INTENT_STORAGE_KEY,
  expectedAlarm,
  originDigest,
  settingsCommandDigest,
  settingsDigest,
  type SettingsEnvelopeV2,
  type SettingsGlobalStorageReservationDenialV1,
  type SettingsGlobalStorageReservationProofV1,
  type SettingsPersistenceCommand,
  type SettingsPersistenceInput,
  type SettingsSnapshotV1,
  type SettingsMutationOutcomeKind,
} from '../../../src/models/settings-persistence.contract';

const uuid = (value: number): string =>
  `93000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

const DATA_EPOCH = uuid(1);
const MUTATION_ID = uuid(6);
const PERMISSION_CHECK_ID = uuid(7);
const ACTIVATION_ID = uuid(8);
const RESERVATION_ID = uuid(9);
const ACTIVATION_RESULT_ID = uuid(10);
const SETTINGS: AppSettings = {
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
const CANDIDATE_SETTINGS: AppSettings = { ...SETTINGS, theme: 'dark' };
const IDENTITY_SEED: SettingsPersistenceInput = {
  dataEpoch: DATA_EPOCH,
  workerEpoch: uuid(200),
  defaultSettings: SETTINGS,
  includedConnectorIds: ['free-work'],
  permissionOriginsByConnectorId: { 'free-work': ['https://www.free-work.com/*'] },
  initialLoadRequestId: uuid(2),
  coldStartSeed: null,
};
const CORRELATION_IDS = [
  MUTATION_ID,
  PERMISSION_CHECK_ID,
  ACTIVATION_ID,
  RESERVATION_ID,
  ACTIVATION_RESULT_ID,
].sort();
const COMMAND_DIGEST = settingsCommandDigest({
  dataEpoch: DATA_EPOCH,
  mutationId: MUTATION_ID,
  baseRevision: 0,
  baseGeneration: 0,
  previousDigest: settingsDigest(SETTINGS),
  candidateDigest: settingsDigest(CANDIDATE_SETTINGS),
  originDigest: originDigest([]),
  baseCorrelationIds: CORRELATION_IDS,
});
const REQUIRED_ORIGINS = ['https://www.free-work.com/*'];
const VERIFY_COMMAND_DIGEST = settingsCommandDigest({
  dataEpoch: DATA_EPOCH,
  mutationId: MUTATION_ID,
  baseRevision: 0,
  baseGeneration: 0,
  previousDigest: settingsDigest(SETTINGS),
  candidateDigest: settingsDigest(CANDIDATE_SETTINGS),
  originDigest: originDigest(REQUIRED_ORIGINS),
  baseCorrelationIds: CORRELATION_IDS,
});

function envelope(outcomes: SettingsEnvelopeV2['outcomes'] = []): SettingsEnvelopeV2 {
  return {
    version: 2,
    dataEpoch: DATA_EPOCH,
    revision: 0,
    generation: outcomes.length,
    settings: SETTINGS,
    journal: null,
    outcomes,
  };
}

function snapshot(
  requestId: string,
  commandId: string,
  proofId = uuid(90),
  currentEnvelope = envelope()
): SettingsSnapshotV1 {
  return {
    version: 1,
    dataEpoch: DATA_EPOCH,
    requestId,
    commandId,
    resetJournalAbsent: true,
    envelope: currentEnvelope,
    alarmProof: {
      ...expectedAlarm(currentEnvelope.settings),
      dataEpoch: DATA_EPOCH,
      envelopeRevision: currentEnvelope.revision,
      envelopeGeneration: currentEnvelope.generation,
      settingsDigest: settingsDigest(currentEnvelope.settings),
      proofId,
      requestId,
      commandId,
    },
  };
}

function snapshotWithOutcome(
  command: Exclude<
    SettingsPersistenceCommand,
    | { type: 'PERSIST_SETTINGS_PENDING_INTENT' }
    | { type: 'CLEAR_SETTINGS_PENDING_INTENT' }
    | { type: 'RECOVER_AND_LOAD_SETTINGS' }
    | { type: 'RESERVE_SETTINGS_STORAGE' }
    | { type: 'REBASE_SETTINGS_MUTATION' }
  >,
  kind: SettingsMutationOutcomeKind,
  proofId: string
): SettingsSnapshotV1 {
  const settledRevision = kind === 'committed' ? 1 : kind === 'compensated' ? 2 : 0;
  const settledGeneration = kind === 'committed' ? 2 : kind === 'compensated' ? 4 : 1;
  const outcome = {
    version: 1 as const,
    dataEpoch: DATA_EPOCH,
    mutationId: command.mutationId,
    commandDigest: command.commandDigest,
    previousDigest: command.previousDigest,
    candidateDigest: command.candidateDigest,
    baseRevision: command.baseRevision,
    baseGeneration: command.baseGeneration,
    settledRevision,
    settledGeneration,
    correlationIds: [...command.correlationIds],
    outcome: kind,
  };
  return snapshot(
    command.type === 'COMPARE_AND_SETTLE_SETTINGS'
      ? command.mutationId
      : command.type === 'VERIFY_SETTINGS_HOST_PERMISSIONS'
        ? command.permissionCheckId
        : command.requestId,
    command.commandId,
    proofId,
    {
      version: 2,
      dataEpoch: DATA_EPOCH,
      revision: settledRevision,
      generation: settledGeneration,
      settings: kind === 'committed' ? CANDIDATE_SETTINGS : SETTINGS,
      journal: null,
      outcomes: [outcome],
    }
  );
}

const loadCommand = (): Extract<
  SettingsPersistenceCommand,
  { type: 'RECOVER_AND_LOAD_SETTINGS' }
> => ({
  type: 'RECOVER_AND_LOAD_SETTINGS',
  commandId: `settings/load/${uuid(2)}`,
  dataEpoch: DATA_EPOCH,
  requestId: uuid(2),
  resetCorrelation: null,
});

const pendingCommand = (): Extract<
  SettingsPersistenceCommand,
  { type: 'PERSIST_SETTINGS_PENDING_INTENT' }
> =>
  ({
    type: 'PERSIST_SETTINGS_PENDING_INTENT',
    commandId: `settings/persist_intent/${uuid(3)}`,
    dataEpoch: DATA_EPOCH,
    storageArea: 'session',
    storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
    intentRevision: 1,
    intentDigest: 'pending/v1:test',
    pendingIntent: {
      mutation: { mutationId: uuid(3) },
      originWorkerEpoch: uuid(4),
    },
  }) as Extract<SettingsPersistenceCommand, { type: 'PERSIST_SETTINGS_PENDING_INTENT' }>;

const clearCommand = (): Extract<
  SettingsPersistenceCommand,
  { type: 'CLEAR_SETTINGS_PENDING_INTENT' }
> => ({
  type: 'CLEAR_SETTINGS_PENDING_INTENT',
  commandId: `settings/clear_intent/${uuid(5)}`,
  dataEpoch: DATA_EPOCH,
  storageArea: 'session',
  storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
  mutationId: uuid(3),
  originWorkerEpoch: uuid(4),
  intentRevision: 2,
  intentDigest: 'pending/v1:test',
});

const reserveCommand = (): Extract<
  SettingsPersistenceCommand,
  { type: 'RESERVE_SETTINGS_STORAGE' }
> =>
  ({
    type: 'RESERVE_SETTINGS_STORAGE',
    commandId: `settings/reserve/${uuid(9)}`,
    dataEpoch: DATA_EPOCH,
    mutationId: MUTATION_ID,
    commandDigest: COMMAND_DIGEST,
    baseRevision: 0,
    baseGeneration: 0,
    previousDigest: settingsDigest(SETTINGS),
    candidateDigest: settingsDigest(CANDIDATE_SETTINGS),
    correlationIds: CORRELATION_IDS,
    reservationId: RESERVATION_ID,
    byteProjection: { version: 1 },
  }) as Extract<SettingsPersistenceCommand, { type: 'RESERVE_SETTINGS_STORAGE' }>;

function reservationProof(commandDigest = COMMAND_DIGEST): SettingsGlobalStorageReservationProofV1 {
  return {
    version: 1,
    kind: 'CHROME_LOCAL_SETTINGS_RESERVATION',
    storageArea: 'local',
    settingsKey: 'settings',
    dataEpoch: DATA_EPOCH,
    mutationId: MUTATION_ID,
    commandDigest,
    baseRevision: 0,
    baseGeneration: 0,
    reservationId: RESERVATION_ID,
    gateLeaseId: uuid(20),
    proofId: uuid(21),
    quotaBytes: 1_000_000,
    bytesInUse: 100,
    currentSettingsEntryBytes: 100,
    reservedSettingsEntryBytes: 200,
    requiredAdditionalBytes: 100,
    systemReserveBytes: 65_536,
    resetReceiptReserveBytes: 8_192,
    availableAfterReservationBytes: 999_800,
    reservationActive: true,
    allLocalWritersFenced: true,
    resetJournalAbsent: true,
  };
}

function reservationDenial(): SettingsGlobalStorageReservationDenialV1 {
  return {
    version: 1,
    kind: 'CHROME_LOCAL_SETTINGS_RESERVATION_DENIED',
    storageArea: 'local',
    settingsKey: 'settings',
    dataEpoch: DATA_EPOCH,
    mutationId: MUTATION_ID,
    commandDigest: COMMAND_DIGEST,
    baseRevision: 0,
    baseGeneration: 0,
    reservationId: RESERVATION_ID,
    gateLeaseId: uuid(20),
    proofId: uuid(21),
    quotaBytes: 100,
    bytesInUse: 100,
    currentSettingsEntryBytes: 100,
    reservedSettingsEntryBytes: 200,
    requiredAdditionalBytes: 100,
    systemReserveBytes: 65_536,
    resetReceiptReserveBytes: 8_192,
    availableBytes: 0,
    reason: 'INSUFFICIENT_GLOBAL_HEADROOM',
    allLocalWritersFenced: true,
    resetJournalAbsent: true,
  };
}

const verifyCommand = (): Extract<
  SettingsPersistenceCommand,
  { type: 'VERIFY_SETTINGS_HOST_PERMISSIONS' }
> => ({
  type: 'VERIFY_SETTINGS_HOST_PERMISSIONS',
  commandId: `settings/permission_check/${uuid(7)}`,
  dataEpoch: DATA_EPOCH,
  mutationId: MUTATION_ID,
  commandDigest: VERIFY_COMMAND_DIGEST,
  baseRevision: 0,
  baseGeneration: 0,
  previousDigest: settingsDigest(SETTINGS),
  candidateDigest: settingsDigest(CANDIDATE_SETTINGS),
  correlationIds: CORRELATION_IDS,
  permissionCheckId: PERMISSION_CHECK_ID,
  activationId: ACTIVATION_ID,
  activationResultId: ACTIVATION_RESULT_ID,
  origins: REQUIRED_ORIGINS,
  originDigest: originDigest(REQUIRED_ORIGINS),
  storageReservationProof: reservationProof(VERIFY_COMMAND_DIGEST),
});

function compareCommand(): Extract<
  SettingsPersistenceCommand,
  { type: 'COMPARE_AND_SETTLE_SETTINGS' }
> {
  return {
    type: 'COMPARE_AND_SETTLE_SETTINGS',
    commandId: `settings/write/${uuid(6)}`,
    dataEpoch: DATA_EPOCH,
    mutationId: MUTATION_ID,
    commandDigest: COMMAND_DIGEST,
    baseRevision: 0,
    baseGeneration: 0,
    previousDigest: settingsDigest(SETTINGS),
    candidateDigest: settingsDigest(CANDIDATE_SETTINGS),
    correlationIds: CORRELATION_IDS,
    previousSettings: SETTINGS,
    candidateSettings: CANDIDATE_SETTINGS,
    permissionProof: null,
    expectedAlarm: expectedAlarm(CANDIDATE_SETTINGS),
    storageReservationProof: reservationProof(),
  };
}

function requestCommand<
  T extends
    | 'RECOVER_SETTINGS_TRANSACTION'
    | 'REBASE_SETTINGS_MUTATION'
    | 'ABORT_SETTINGS_MUTATION'
    | 'RECONCILE_SETTINGS',
>(type: T, requestId: string): Extract<SettingsPersistenceCommand, { type: T }> {
  const base = {
    type,
    commandId: `settings/${
      type === 'RECOVER_SETTINGS_TRANSACTION'
        ? 'recover'
        : type === 'REBASE_SETTINGS_MUTATION'
          ? 'rebase'
          : type === 'ABORT_SETTINGS_MUTATION'
            ? 'abort'
            : 'reconcile'
    }/${requestId}`,
    dataEpoch: DATA_EPOCH,
    requestId,
    mutationId: MUTATION_ID,
  };
  if (type === 'REBASE_SETTINGS_MUTATION') {
    return base as Extract<SettingsPersistenceCommand, { type: T }>;
  }
  return {
    ...base,
    commandDigest: COMMAND_DIGEST,
    baseRevision: 0,
    baseGeneration: 0,
    previousDigest: settingsDigest(SETTINGS),
    candidateDigest: settingsDigest(CANDIDATE_SETTINGS),
    correlationIds: [...CORRELATION_IDS, requestId].sort(),
    storageReservationProof: type === 'RECOVER_SETTINGS_TRANSACTION' ? reservationProof() : null,
    ...(type === 'RECONCILE_SETTINGS' ? { reason: 'save_failed' as const } : {}),
  } as Extract<SettingsPersistenceCommand, { type: T }>;
}

function dependencies() {
  const pendingIntents: SettingsPendingIntentRepository = {
    persist: vi.fn(async () => ({ kind: 'outcome_unknown' as const })),
    clear: vi.fn(async () => ({ kind: 'outcome_unknown' as const })),
    load: vi.fn(async () => null),
  };
  const bootstrap: SettingsBootstrapRepository = {
    prepare: vi.fn(async () => ({ kind: 'ready' as const, migrated: false })),
  };
  const transactions: SettingsTransactionRepository = {
    recoverAndLoad: vi.fn(async () => ({ kind: 'recovery_required' as const })),
    compareAndSettle: vi.fn(async () => ({ kind: 'conflict' as const })),
    settlePermissionMissing: vi.fn(async () => ({ kind: 'outcome_unknown' as const })),
    recoverCompensation: vi.fn(async () => ({ kind: 'outcome_unknown' as const })),
    readSettled: vi.fn(async () => ({ kind: 'recovery_required' as const })),
    abort: vi.fn(async () => ({ kind: 'outcome_unknown' as const })),
    reconcile: vi.fn(async () => ({ kind: 'outcome_unknown' as const })),
  };
  const reservations: SettingsGlobalStorageReservationAuthority = {
    acquire: vi.fn(async () => {
      throw new Error('reservation outcome unknown');
    }),
    isActive: vi.fn(async () => true),
    release: vi.fn(async () => true),
    assertWriteAllowed: vi.fn(async () => true),
  };
  const permissionChecks = {
    verify: vi.fn(async () => ({ kind: 'outcome_unknown' as const })),
  };
  return {
    pendingIntents,
    bootstrap,
    transactions,
    reservations,
    permissionChecks,
    identitySeed: IDENTITY_SEED,
  };
}

describe('Settings command executor', () => {
  it('runs strict bootstrap before the repository recovery barrier', async () => {
    const ports = dependencies();
    const command = loadCommand();
    vi.mocked(ports.transactions.recoverAndLoad).mockResolvedValueOnce({
      kind: 'settled',
      snapshot: snapshot(command.requestId, command.commandId),
    });
    const executor = createSettingsCommandExecutor({
      ...ports,
      includedConnectorIds: ['free-work'],
      allocateId: () => uuid(80),
    });

    await expect(executor.execute(command)).resolves.toMatchObject({
      type: 'LOAD_SUCCEEDED',
      requestId: command.requestId,
      commandId: command.commandId,
    });
    expect(ports.bootstrap.prepare).toHaveBeenCalledBefore(
      vi.mocked(ports.transactions.recoverAndLoad)
    );
  });

  it('maps invalid bootstrap and reset closure to exact modeled Load failures', async () => {
    const ports = dependencies();
    const command = loadCommand();
    const executor = createSettingsCommandExecutor({
      ...ports,
      includedConnectorIds: ['free-work'],
      allocateId: () => uuid(80),
    });

    vi.mocked(ports.bootstrap.prepare).mockResolvedValueOnce({ kind: 'invalid' });
    await expect(executor.execute(command)).resolves.toMatchObject({
      type: 'LOAD_FAILED',
      error: { code: 'SETTINGS_INVALID', operation: 'load', recoverable: false },
    });
    vi.mocked(ports.bootstrap.prepare).mockResolvedValueOnce({ kind: 'reset_closed' });
    await expect(executor.execute(command)).resolves.toMatchObject({
      type: 'LOAD_FAILED',
      error: { code: 'SETTINGS_RESET_IN_PROGRESS', operation: 'load' },
    });
    expect(ports.transactions.recoverAndLoad).not.toHaveBeenCalled();
  });

  it('propagates exact pending-intent read-back proofs and never promotes ambiguity', async () => {
    const ports = dependencies();
    const persist = pendingCommand();
    const proof = {
      version: 1 as const,
      kind: 'SETTINGS_PENDING_INTENT_PERSISTED' as const,
      storageArea: 'session' as const,
      storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
      dataEpoch: persist.dataEpoch,
      mutationId: persist.pendingIntent.mutation.mutationId,
      originWorkerEpoch: persist.pendingIntent.originWorkerEpoch,
      intentRevision: persist.intentRevision,
      intentDigest: persist.intentDigest,
      commandId: persist.commandId,
      proofId: uuid(30),
      readBackVerified: true as const,
    };
    vi.mocked(ports.pendingIntents.persist).mockResolvedValueOnce({ kind: 'persisted', proof });
    const executor = createSettingsCommandExecutor({
      ...ports,
      includedConnectorIds: ['free-work'],
      allocateId: () => uuid(80),
    });

    await expect(executor.execute(persist)).resolves.toEqual({
      type: 'SETTINGS_PENDING_INTENT_PERSISTED',
      dataEpoch: persist.dataEpoch,
      mutationId: persist.pendingIntent.mutation.mutationId,
      commandId: persist.commandId,
      proof,
    });

    vi.mocked(ports.pendingIntents.clear).mockRejectedValueOnce(new Error('ambiguous remove'));
    await expect(executor.execute(clearCommand())).resolves.toMatchObject({
      type: 'SETTINGS_PENDING_INTENT_CLEAR_OUTCOME_UNKNOWN',
      error: { code: 'SETTINGS_TRANSPORT_ERROR', operation: 'pending_intent' },
    });
  });

  it('rejects pending-intent repository results with extra root fields', async () => {
    const ports = dependencies();
    const persist = pendingCommand();
    const proof = {
      version: 1 as const,
      kind: 'SETTINGS_PENDING_INTENT_PERSISTED' as const,
      storageArea: 'session' as const,
      storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
      dataEpoch: persist.dataEpoch,
      mutationId: persist.pendingIntent.mutation.mutationId,
      originWorkerEpoch: persist.pendingIntent.originWorkerEpoch,
      intentRevision: persist.intentRevision,
      intentDigest: persist.intentDigest,
      commandId: persist.commandId,
      proofId: uuid(30),
      readBackVerified: true as const,
    };
    vi.mocked(ports.pendingIntents.persist).mockResolvedValueOnce({
      kind: 'persisted',
      proof,
      extra: true,
    } as never);
    const executor = createSettingsCommandExecutor({
      ...ports,
      includedConnectorIds: ['free-work'],
      allocateId: () => uuid(80),
    });

    await expect(executor.execute(persist)).resolves.toMatchObject({
      type: 'SETTINGS_PENDING_INTENT_PERSIST_OUTCOME_UNKNOWN',
    });
  });

  it('maps reservation grant, denial and authority ambiguity without fabricating a proof', async () => {
    const ports = dependencies();
    const command = reserveCommand();
    const executor = createSettingsCommandExecutor({
      ...ports,
      includedConnectorIds: ['free-work'],
      allocateId: () => uuid(80),
    });

    vi.mocked(ports.reservations.acquire).mockResolvedValueOnce({
      kind: 'granted',
      proof: reservationProof(),
    });
    await expect(executor.execute(command)).resolves.toMatchObject({
      type: 'STORAGE_RESERVATION_GRANTED',
      proof: { reservationActive: true, allLocalWritersFenced: true },
    });

    vi.mocked(ports.reservations.acquire).mockResolvedValueOnce({
      kind: 'denied',
      denial: reservationDenial(),
    });
    await expect(executor.execute(command)).resolves.toMatchObject({
      type: 'STORAGE_RESERVATION_DENIED',
      error: { code: 'SETTINGS_GLOBAL_STORAGE_QUOTA_EXHAUSTED', operation: 'mutate' },
    });

    vi.mocked(ports.reservations.acquire).mockRejectedValueOnce(new Error('authority lost'));
    await expect(executor.execute(command)).resolves.toMatchObject({
      type: 'PROTOCOL_UNCERTAIN',
      error: { code: 'SETTINGS_PROTOCOL_ERROR', operation: 'reconcile' },
    });
  });

  it('bounds a hostile identity allocator and defers without consuming the command', async () => {
    const ports = dependencies();
    const command = reserveCommand();
    let attempts = 0;
    vi.mocked(ports.reservations.acquire).mockRejectedValueOnce(
      new Error('global writer cutover incomplete')
    );
    const executor = createSettingsCommandExecutor({
      ...ports,
      includedConnectorIds: ['free-work'],
      allocateId: () => {
        attempts += 1;
        return command.mutationId;
      },
    });

    await expect(executor.execute(command)).resolves.toEqual({
      type: 'SETTINGS_COMMAND_EXECUTION_DEFERRED',
      reason: 'identity_exhausted',
      commandType: command.type,
      commandId: command.commandId,
      dataEpoch: command.dataEpoch,
    });
    expect(attempts).toBe(128);
  });

  it('does not inspect accessors or allocate after an unsafe repository response', async () => {
    const ports = dependencies();
    const command = reserveCommand();
    const kindGetter = vi.fn(() => 'granted');
    const unsafeResult = {} as { kind: 'granted'; proof: SettingsGlobalStorageReservationProofV1 };
    Object.defineProperty(unsafeResult, 'kind', { enumerable: true, get: kindGetter });
    vi.mocked(ports.reservations.acquire).mockResolvedValueOnce(unsafeResult);
    const allocateId = vi.fn(() => uuid(80));
    const executor = createSettingsCommandExecutor({
      ...ports,
      includedConnectorIds: ['free-work'],
      allocateId,
    });

    await expect(executor.execute(command)).resolves.toEqual({
      type: 'SETTINGS_COMMAND_EXECUTION_DEFERRED',
      reason: 'identity_exhausted',
      commandType: command.type,
      commandId: command.commandId,
      dataEpoch: command.dataEpoch,
    });
    expect(kindGetter).not.toHaveBeenCalled();
    expect(allocateId).not.toHaveBeenCalled();
  });

  it('poisons allocation after a fail-first Proxy capture without inspecting it twice', async () => {
    const ports = dependencies();
    const command = reserveCommand();
    let kindDescriptorReads = 0;
    const target = { kind: 'granted' as const, proof: reservationProof() };
    const changingResult = new Proxy(target, {
      getOwnPropertyDescriptor(current, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(current, key);
        if (descriptor !== undefined && key === 'kind') {
          kindDescriptorReads += 1;
          return kindDescriptorReads === 1
            ? {
                configurable: true,
                enumerable: true,
                get: () => 'granted',
              }
            : descriptor;
        }
        return descriptor;
      },
    });
    vi.mocked(ports.reservations.acquire).mockResolvedValueOnce(changingResult);
    const allocateId = vi.fn(() => uuid(80));
    const executor = createSettingsCommandExecutor({
      ...ports,
      includedConnectorIds: ['free-work'],
      allocateId,
    });

    await expect(executor.execute(command)).resolves.toEqual({
      type: 'SETTINGS_COMMAND_EXECUTION_DEFERRED',
      reason: 'identity_exhausted',
      commandType: command.type,
      commandId: command.commandId,
      dataEpoch: command.dataEpoch,
    });
    expect(kindDescriptorReads).toBe(1);
    expect(allocateId).not.toHaveBeenCalled();
  });

  it('uses one detached descriptor capture and never reads a repository Proxy', async () => {
    const ports = dependencies();
    const command = reserveCommand();
    let kindDescriptorReads = 0;
    let businessGetReads = 0;
    const result = new Proxy(
      { kind: 'granted' as const, proof: reservationProof() },
      {
        get(target, key, receiver) {
          if (key === 'then') {
            return undefined;
          }
          businessGetReads += 1;
          return Reflect.get(target, key, receiver);
        },
        getOwnPropertyDescriptor(target, key) {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
          if (descriptor !== undefined && key === 'kind') {
            kindDescriptorReads += 1;
            return {
              ...descriptor,
              value: kindDescriptorReads === 1 ? 'granted' : 'denied',
            };
          }
          return descriptor;
        },
      }
    );
    vi.mocked(ports.reservations.acquire).mockResolvedValueOnce(result);
    const executor = createSettingsCommandExecutor({
      ...ports,
      includedConnectorIds: ['free-work'],
      allocateId: () => uuid(80),
    });

    await expect(executor.execute(command)).resolves.toMatchObject({
      type: 'STORAGE_RESERVATION_GRANTED',
    });
    expect(kindDescriptorReads).toBe(1);
    expect(businessGetReads).toBe(0);
  });

  it('rejects IDs already observed in durable snapshots and proof graphs', async () => {
    const ports = dependencies();
    const load = loadCommand();
    const historicalProofId = uuid(70);
    vi.mocked(ports.transactions.recoverAndLoad).mockResolvedValueOnce({
      kind: 'settled',
      snapshot: snapshot(load.requestId, load.commandId, historicalProofId),
    });
    vi.mocked(ports.reservations.acquire).mockRejectedValueOnce(new Error('outcome unknown'));
    const candidates = [historicalProofId, uuid(71)];
    const executor = createSettingsCommandExecutor({
      ...ports,
      includedConnectorIds: ['free-work'],
      allocateId: () => candidates.shift() ?? uuid(72),
    });

    await executor.execute(load);
    await expect(executor.execute(reserveCommand())).resolves.toMatchObject({
      type: 'PROTOCOL_UNCERTAIN',
      nextRequestId: uuid(71),
    });
    expect(candidates).toEqual([]);
  });

  it('never reallocates a worker identity from the immutable executor seed', async () => {
    const ports = dependencies();
    const candidates = [IDENTITY_SEED.workerEpoch, uuid(81)];
    const allocateId = vi.fn(() => candidates.shift() ?? uuid(82));
    const executor = createSettingsCommandExecutor({
      ...ports,
      includedConnectorIds: ['free-work'],
      allocateId,
    });

    await expect(executor.execute(reserveCommand())).resolves.toMatchObject({
      type: 'PROTOCOL_UNCERTAIN',
      nextRequestId: uuid(81),
    });
    expect(allocateId).toHaveBeenCalledTimes(2);
  });

  it('poisons allocation when the immutable identity seed is not capturable JSON', async () => {
    const ports = dependencies();
    const allocateId = vi.fn(() => uuid(81));
    const executor = createSettingsCommandExecutor({
      ...ports,
      identitySeed: { ...IDENTITY_SEED, coldStartSeed: () => uuid(999) },
      includedConnectorIds: ['free-work'],
      allocateId,
    });

    await expect(executor.execute(reserveCommand())).resolves.toMatchObject({
      type: 'SETTINGS_COMMAND_EXECUTION_DEFERRED',
      reason: 'identity_exhausted',
    });
    expect(allocateId).not.toHaveBeenCalled();
  });

  it('releases reserved capacity only after a proved permission-missing settlement', async () => {
    const ports = dependencies();
    const command = verifyCommand();
    const settled = snapshotWithOutcome(command, 'not_committed', uuid(96));
    vi.mocked(ports.permissionChecks.verify).mockResolvedValueOnce({
      kind: 'missing',
      snapshot: settled,
    });
    const executor = createSettingsCommandExecutor({
      ...ports,
      includedConnectorIds: ['free-work'],
      allocateId: () => uuid(80),
    });

    await expect(executor.execute(command)).resolves.toMatchObject({
      type: 'HOST_PERMISSIONS_MISSING',
      snapshot: settled,
    });
    expect(ports.reservations.release).toHaveBeenCalledWith(command.storageReservationProof);
  });

  it('keeps reconciliation mandatory when terminal reservation release is ambiguous', async () => {
    const ports = dependencies();
    const command = verifyCommand();
    const settled = snapshotWithOutcome(command, 'not_committed', uuid(96));
    vi.mocked(ports.permissionChecks.verify).mockResolvedValueOnce({
      kind: 'missing',
      snapshot: settled,
    });
    vi.mocked(ports.reservations.release).mockRejectedValueOnce(new Error('release ambiguous'));
    const executor = createSettingsCommandExecutor({
      ...ports,
      includedConnectorIds: ['free-work'],
      allocateId: () => uuid(80),
    });

    await expect(executor.execute(command)).resolves.toMatchObject({
      type: 'HOST_PERMISSIONS_OUTCOME_UNKNOWN',
      nextRequestId: uuid(80),
    });
  });

  it('maps repository CAS, recovery, rebase, abort and reconcile results to raw model events', async () => {
    const ports = dependencies();
    const write = compareCommand();
    const recover = requestCommand('RECOVER_SETTINGS_TRANSACTION', uuid(40));
    const rebase = requestCommand('REBASE_SETTINGS_MUTATION', uuid(41));
    const abort = {
      ...requestCommand('ABORT_SETTINGS_MUTATION', uuid(42)),
      storageReservationProof: reservationProof(),
    };
    const reconcile = {
      ...requestCommand('RECONCILE_SETTINGS', uuid(43)),
      storageReservationProof: reservationProof(),
    };
    const executor = createSettingsCommandExecutor({
      ...ports,
      includedConnectorIds: ['free-work'],
      allocateId: () => uuid(80),
    });

    vi.mocked(ports.transactions.compareAndSettle).mockResolvedValueOnce({
      kind: 'committed',
      snapshot: snapshotWithOutcome(write, 'committed', uuid(91)),
    });
    await expect(executor.execute(write)).resolves.toMatchObject({ type: 'SAVE_SUCCEEDED' });

    vi.mocked(ports.transactions.recoverCompensation).mockResolvedValueOnce({
      kind: 'compensated',
      snapshot: snapshotWithOutcome(recover, 'compensated', uuid(92)),
    });
    await expect(executor.execute(recover)).resolves.toMatchObject({
      type: 'COMPENSATION_SUCCEEDED',
    });

    vi.mocked(ports.transactions.readSettled).mockResolvedValueOnce({
      kind: 'settled',
      snapshot: snapshot(rebase.requestId, rebase.commandId, uuid(93)),
    });
    await expect(executor.execute(rebase)).resolves.toMatchObject({ type: 'RETRY_READY' });

    const abortSnapshot = snapshotWithOutcome(abort, 'cancelled', uuid(94));
    vi.mocked(ports.transactions.abort).mockResolvedValueOnce({
      kind: 'cancelled',
      snapshot: abortSnapshot,
      outcome: structuredClone(abortSnapshot.envelope.outcomes[0]!),
    });
    await expect(executor.execute(abort)).resolves.toMatchObject({ type: 'CANCEL_CONFIRMED' });

    vi.mocked(ports.transactions.reconcile).mockResolvedValueOnce({
      kind: 'settled',
      snapshot: snapshotWithOutcome(reconcile, 'not_committed', uuid(95)),
      outcome: {
        version: 1,
        dataEpoch: DATA_EPOCH,
        mutationId: reconcile.mutationId,
        commandDigest: COMMAND_DIGEST,
        previousDigest: reconcile.previousDigest,
        candidateDigest: settingsDigest(CANDIDATE_SETTINGS),
        baseRevision: reconcile.baseRevision,
        baseGeneration: reconcile.baseGeneration,
        settledRevision: 0,
        settledGeneration: 1,
        correlationIds: reconcile.correlationIds,
        outcome: 'not_committed',
      },
    });
    await expect(executor.execute(reconcile)).resolves.toMatchObject({ type: 'RECONCILED' });
    expect(ports.reservations.release).toHaveBeenCalledTimes(4);
  });

  it('rejects a malformed repository success as a modeled failure', async () => {
    const ports = dependencies();
    const command = loadCommand();
    vi.mocked(ports.transactions.recoverAndLoad).mockResolvedValueOnce({
      kind: 'settled',
      snapshot: { ...snapshot(command.requestId, command.commandId), requestId: uuid(77) },
    });
    const executor = createSettingsCommandExecutor({
      ...ports,
      includedConnectorIds: ['free-work'],
      allocateId: () => uuid(80),
    });

    await expect(executor.execute(command)).resolves.toMatchObject({
      type: 'LOAD_FAILED',
      error: { code: 'SETTINGS_PROTOCOL_ERROR', operation: 'load' },
    });
  });

  it('rejects an unknown bootstrap result kind as a Load protocol failure', async () => {
    const ports = dependencies();
    const command = loadCommand();
    vi.mocked(ports.bootstrap.prepare).mockResolvedValueOnce({ kind: 'bogus' } as never);
    const executor = createSettingsCommandExecutor({
      ...ports,
      includedConnectorIds: ['free-work'],
      allocateId: () => uuid(80),
    });

    await expect(executor.execute(command)).resolves.toMatchObject({
      type: 'LOAD_FAILED',
      error: { code: 'SETTINGS_PROTOCOL_ERROR', operation: 'load' },
    });
    expect(ports.transactions.recoverAndLoad).not.toHaveBeenCalled();
  });

  it('turns a matching malformed compare success into protocol uncertainty', async () => {
    const ports = dependencies();
    const command = compareCommand();
    vi.mocked(ports.transactions.compareAndSettle).mockResolvedValueOnce({
      kind: 'committed',
      snapshot: {
        ...snapshotWithOutcome(command, 'committed', uuid(97)),
        requestId: uuid(77),
      },
    });
    const executor = createSettingsCommandExecutor({
      ...ports,
      includedConnectorIds: ['free-work'],
      allocateId: () => uuid(80),
    });

    await expect(executor.execute(command)).resolves.toMatchObject({
      type: 'PROTOCOL_UNCERTAIN',
      mutationId: command.mutationId,
      nextRequestId: uuid(80),
      error: { code: 'SETTINGS_PROTOCOL_ERROR', operation: 'reconcile' },
    });
  });
});

describe('contains-only Settings permission command port', () => {
  const capability: SettingsDatasetGateCapabilityV1 = {
    version: 1,
    kind: 'DATASET_EPOCH_SETTINGS_LEASE',
    dataEpoch: DATA_EPOCH,
    operationId: uuid(7),
    purpose: 'permission_check',
    leaseId: uuid(60),
    authorityRevision: 1,
  };

  it('revalidates the reservation around contains and emits only the exact positive proof', async () => {
    const active = vi.fn(async () => true);
    const contains = vi.fn(async () => true);
    const transactions: Pick<SettingsTransactionRepository, 'settlePermissionMissing'> = {
      settlePermissionMissing: vi.fn(async () => ({ kind: 'outcome_unknown' as const })),
    };
    const port = createContainsOnlySettingsPermissionCommandPort({
      gate: { runExclusive: vi.fn(async (_scope, effect) => effect(capability)) },
      reservationAuthority: { isActive: active },
      permissions: { contains } satisfies SettingsHostPermissionContainsPort,
      transactions,
      includedConnectorIds: ['free-work'],
    });

    await expect(port.verify(verifyCommand())).resolves.toMatchObject({
      kind: 'verified',
      proof: {
        containsVerified: true,
        permissionCheckId: uuid(7),
        activationId: uuid(8),
        activationResultId: uuid(10),
      },
    });
    expect(active).toHaveBeenCalledTimes(2);
    expect(contains).toHaveBeenCalledOnce();
    expect(transactions.settlePermissionMissing).not.toHaveBeenCalled();
  });

  it('requires a durable not_committed settlement for contains=false', async () => {
    const permissions: SettingsHostPermissionContainsPort = {
      contains: vi.fn(async () => false),
    };
    const reservationAuthority: SettingsReservationAuthorityPort = {
      isActive: vi.fn(async () => true),
    };
    const port = createContainsOnlySettingsPermissionCommandPort({
      gate: { runExclusive: vi.fn(async (_scope, effect) => effect(capability)) },
      reservationAuthority,
      permissions,
      transactions: {
        settlePermissionMissing: vi.fn(async () => ({ kind: 'outcome_unknown' as const })),
      },
      includedConnectorIds: ['free-work'],
    });

    await expect(port.verify(verifyCommand())).resolves.toEqual({ kind: 'outcome_unknown' });
  });

  it('accepts contains=false only with the exact durable not_committed snapshot', async () => {
    const command = verifyCommand();
    const settled = snapshotWithOutcome(command, 'not_committed', uuid(96));
    const settlePermissionMissing = vi.fn(async () => ({
      kind: 'settled' as const,
      snapshot: settled,
      outcome: structuredClone(settled.envelope.outcomes[0]!),
    }));
    const port = createContainsOnlySettingsPermissionCommandPort({
      gate: { runExclusive: vi.fn(async (_scope, effect) => effect(capability)) },
      reservationAuthority: { isActive: vi.fn(async () => true) },
      permissions: { contains: vi.fn(async () => false) },
      transactions: { settlePermissionMissing },
      includedConnectorIds: ['free-work'],
    });

    await expect(port.verify(command)).resolves.toEqual({ kind: 'missing', snapshot: settled });
    expect(settlePermissionMissing).toHaveBeenCalledWith(command);
  });

  it('fails closed when the reservation is revoked and never calls contains', async () => {
    const permissions: SettingsHostPermissionContainsPort = {
      contains: vi.fn(async () => true),
    };
    const port = createContainsOnlySettingsPermissionCommandPort({
      gate: { runExclusive: vi.fn(async (_scope, effect) => effect(capability)) },
      reservationAuthority: { isActive: vi.fn(async () => false) },
      permissions,
      transactions: {
        settlePermissionMissing: vi.fn(async () => ({ kind: 'outcome_unknown' as const })),
      },
      includedConnectorIds: ['free-work'],
    });

    await expect(port.verify(verifyCommand())).resolves.toEqual({ kind: 'outcome_unknown' });
    expect(permissions.contains).not.toHaveBeenCalled();
  });

  it('does not expose or invoke an interactive permission API', async () => {
    const request = vi.fn(async () => true);
    const permissions = {
      contains: vi.fn(async () => true),
      request,
    };
    const port = createContainsOnlySettingsPermissionCommandPort({
      gate: { runExclusive: vi.fn(async (_scope, effect) => effect(capability)) },
      reservationAuthority: { isActive: vi.fn(async () => true) },
      permissions,
      transactions: {
        settlePermissionMissing: vi.fn(async () => ({ kind: 'outcome_unknown' as const })),
      },
      includedConnectorIds: ['free-work'],
    });

    await port.verify(verifyCommand());
    expect(request).not.toHaveBeenCalled();
  });
});
