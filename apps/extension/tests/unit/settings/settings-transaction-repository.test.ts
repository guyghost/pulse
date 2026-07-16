import { describe, expect, it } from 'vitest';

import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import {
  LOCAL_DATA_RESET_RECEIPT_RESERVE_BYTES,
  SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES,
  SETTINGS_STORAGE_KEY,
  commandId,
  expectedAlarm,
  originDigest,
  projectSettingsMutationBytes,
  settingsCommandDigest,
  settingsDigest,
  type SettingMutation,
  type SettingsEnvelopeV2,
  type SettingsGlobalStorageReservationProofV1,
  type SettingsPersistenceCommand,
} from '../../../src/models/settings-persistence.contract';
import {
  createSettingsTransactionRepository,
  type SettingsAtomicCommitGatePort,
  type SettingsAutoScanAlarmPort,
  type SettingsHostPermissionContainsPort,
  type SettingsLocalStoragePort,
  type SettingsMutationAdmissionEvidencePort,
  type SettingsReservationAuthorityPort,
  type SettingsResetJournalPort,
  type SettingsStorageCapacityPort,
} from '../../../src/lib/shell/settings/settings-transaction.repository';

const uuid = (suffix: number): string =>
  `91000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const DATA_EPOCH = uuid(1);
const INCLUDED_CONNECTORS = ['free-work'];
const PREVIOUS: AppSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: INCLUDED_CONNECTORS,
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
  theme: 'system',
};
const CANDIDATE: AppSettings = { ...PREVIOUS, scanIntervalMinutes: 60 };

class MemoryLocalStorage implements SettingsLocalStoragePort {
  value: unknown;
  readonly writes: SettingsEnvelopeV2[] = [];
  throwAfterWriteCount = 0;

  constructor(value: unknown) {
    this.value = structuredClone(value);
  }

  async get(key: string): Promise<unknown | undefined> {
    expect(key).toBe(SETTINGS_STORAGE_KEY);
    return structuredClone(this.value);
  }

  async set(key: string, value: unknown): Promise<void> {
    expect(key).toBe(SETTINGS_STORAGE_KEY);
    this.value = structuredClone(value);
    this.writes.push(structuredClone(value) as SettingsEnvelopeV2);
    if (this.throwAfterWriteCount > 0) {
      this.throwAfterWriteCount -= 1;
      throw new Error('ambiguous local write');
    }
  }
}

class MemoryAlarm implements SettingsAutoScanAlarmPort {
  current = expectedAlarm(PREVIOUS);
  failNextApply = false;
  readonly applied: ReturnType<typeof expectedAlarm>[] = [];

  async apply(expectation: ReturnType<typeof expectedAlarm>): Promise<void> {
    this.applied.push(structuredClone(expectation));
    if (this.failNextApply) {
      this.failNextApply = false;
      throw new Error('alarm failed');
    }
    this.current = structuredClone(expectation);
  }

  async read(): Promise<ReturnType<typeof expectedAlarm>> {
    return structuredClone(this.current);
  }
}

const gate: SettingsAtomicCommitGatePort = {
  async runExclusive(_scope, effect) {
    return effect({
      version: 1,
      kind: 'DATASET_EPOCH_SETTINGS_LEASE',
      dataEpoch: _scope.dataEpoch,
      operationId: _scope.operationId,
      purpose: _scope.purpose,
      leaseId: uuid(900),
      authorityRevision: 0,
    });
  },
};
const resetJournal: SettingsResetJournalPort = {
  async admit(input) {
    return {
      kind: 'absent',
      dataEpoch: input.dataEpoch,
      capability: input.capability,
      resetJournalAbsent: true,
    };
  },
};
const reservationAuthority: SettingsReservationAuthorityPort = {
  async isActive() {
    return true;
  },
};
const admissionEvidence: SettingsMutationAdmissionEvidencePort = {
  async classify() {
    return 'provably_never_admitted';
  },
};
const capacity: SettingsStorageCapacityPort = {
  async assertWriteAllowed() {
    return true;
  },
};
const permissions: SettingsHostPermissionContainsPort = {
  async contains() {
    return true;
  },
};

const MUTATION_IDENTITY_KEYS = [
  'mutationId',
  'permissionCheckId',
  'activationId',
  'activationResultId',
  'storageReservationId',
] as const;
type MutationIdentityKey = (typeof MUTATION_IDENTITY_KEYS)[number];

function baseEnvelope(settings = PREVIOUS, revision = 0, generation = 0): SettingsEnvelopeV2 {
  return {
    version: 2,
    dataEpoch: DATA_EPOCH,
    revision,
    generation,
    settings,
    journal: null,
    outcomes: [],
  };
}

function mutation(overrides: Partial<Record<MutationIdentityKey, string>> = {}): SettingMutation {
  const identity = {
    mutationId: uuid(10),
    permissionCheckId: uuid(11),
    activationId: uuid(12),
    activationResultId: uuid(13),
    storageReservationId: uuid(14),
    ...overrides,
  };
  const { mutationId, permissionCheckId, activationId, activationResultId, storageReservationId } =
    identity;
  const identities = Object.values(identity).sort();
  const previousDigest = settingsDigest(PREVIOUS);
  const candidateDigest = settingsDigest(CANDIDATE);
  return {
    key: 'scanIntervalMinutes',
    previousSettings: PREVIOUS,
    candidateSettings: CANDIDATE,
    previous: 30,
    candidate: 60,
    previousDigest,
    candidateDigest,
    commandDigest: settingsCommandDigest({
      dataEpoch: DATA_EPOCH,
      mutationId,
      baseRevision: 0,
      baseGeneration: 0,
      previousDigest,
      candidateDigest,
      originDigest: originDigest([]),
      baseCorrelationIds: identities,
    }),
    correlationIds: identities,
    mutationId,
    permissionCheckId,
    activationId,
    activationResultId,
    requiredOrigins: [],
    baseRevision: 0,
    baseGeneration: 0,
    permissionProof: null,
    storageReservationId,
    storageReservationProof: null,
  };
}

function reservationProof(
  current: SettingMutation,
  envelope = baseEnvelope()
): SettingsGlobalStorageReservationProofV1 {
  const projection = projectSettingsMutationBytes(envelope, current);
  if (projection === null) {
    throw new Error('projection failed');
  }
  const quotaBytes = 20_000_000;
  const bytesInUse = 1_000;
  return {
    version: 1,
    kind: 'CHROME_LOCAL_SETTINGS_RESERVATION',
    storageArea: 'local',
    settingsKey: SETTINGS_STORAGE_KEY,
    dataEpoch: DATA_EPOCH,
    mutationId: current.mutationId,
    commandDigest: current.commandDigest,
    baseRevision: current.baseRevision,
    baseGeneration: current.baseGeneration,
    reservationId: current.storageReservationId,
    gateLeaseId: uuid(20),
    proofId: uuid(21),
    quotaBytes,
    bytesInUse,
    currentSettingsEntryBytes: projection.currentSettingsEntryBytes,
    reservedSettingsEntryBytes: projection.reservedSettingsEntryBytes,
    requiredAdditionalBytes: projection.requiredAdditionalBytes,
    systemReserveBytes: SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES,
    resetReceiptReserveBytes: LOCAL_DATA_RESET_RECEIPT_RESERVE_BYTES,
    availableAfterReservationBytes: quotaBytes - bytesInUse - projection.requiredAdditionalBytes,
    reservationActive: true,
    allLocalWritersFenced: true,
    resetJournalAbsent: true,
  };
}

function permissionCompareCommand(): Extract<
  SettingsPersistenceCommand,
  { type: 'COMPARE_AND_SETTLE_SETTINGS' }
> {
  const previousSettings: AppSettings = { ...PREVIOUS, enabledConnectors: [] };
  const candidateSettings: AppSettings = { ...PREVIOUS, enabledConnectors: ['free-work'] };
  const identities = [uuid(30), uuid(31), uuid(32), uuid(33), uuid(34)].sort();
  const [mutationId, permissionCheckId, activationId, activationResultId, storageReservationId] =
    identities as [string, string, string, string, string];
  const requiredOrigins = ['https://www.free-work.com/*'];
  const previousDigest = settingsDigest(previousSettings);
  const candidateDigest = settingsDigest(candidateSettings);
  const commandDigest = settingsCommandDigest({
    dataEpoch: DATA_EPOCH,
    mutationId,
    baseRevision: 0,
    baseGeneration: 0,
    previousDigest,
    candidateDigest,
    originDigest: originDigest(requiredOrigins),
    baseCorrelationIds: identities,
  });
  const current: SettingMutation = {
    key: 'enabledConnectors',
    previousSettings,
    candidateSettings,
    previous: [],
    candidate: ['free-work'],
    previousDigest,
    candidateDigest,
    commandDigest,
    correlationIds: identities,
    mutationId,
    permissionCheckId,
    activationId,
    activationResultId,
    requiredOrigins,
    baseRevision: 0,
    baseGeneration: 0,
    permissionProof: {
      version: 1,
      dataEpoch: DATA_EPOCH,
      mutationId,
      permissionCheckId,
      activationId,
      activationResultId,
      originDigest: originDigest(requiredOrigins),
      verifiedOrigins: requiredOrigins,
      containsVerified: true,
    },
    storageReservationId,
    storageReservationProof: null,
  };
  return {
    type: 'COMPARE_AND_SETTLE_SETTINGS',
    commandId: commandId('write', mutationId),
    dataEpoch: DATA_EPOCH,
    mutationId,
    commandDigest,
    baseRevision: 0,
    baseGeneration: 0,
    previousDigest,
    candidateDigest,
    correlationIds: identities,
    previousSettings,
    candidateSettings,
    permissionProof: current.permissionProof,
    expectedAlarm: expectedAlarm(candidateSettings),
    storageReservationProof: reservationProof(current, baseEnvelope(previousSettings)),
  };
}

function permissionVerifyCommand(): Extract<
  SettingsPersistenceCommand,
  { type: 'VERIFY_SETTINGS_HOST_PERMISSIONS' }
> {
  const compare = permissionCompareCommand();
  const proof = compare.permissionProof;
  if (proof === null) {
    throw new Error('permission proof fixture missing');
  }
  return {
    type: 'VERIFY_SETTINGS_HOST_PERMISSIONS',
    commandId: commandId('permission_check', proof.permissionCheckId),
    dataEpoch: compare.dataEpoch,
    mutationId: compare.mutationId,
    commandDigest: compare.commandDigest,
    baseRevision: compare.baseRevision,
    baseGeneration: compare.baseGeneration,
    previousDigest: compare.previousDigest,
    candidateDigest: compare.candidateDigest,
    correlationIds: [...compare.correlationIds],
    permissionCheckId: proof.permissionCheckId,
    activationId: proof.activationId,
    activationResultId: proof.activationResultId,
    origins: [...proof.verifiedOrigins],
    originDigest: proof.originDigest,
    storageReservationProof: compare.storageReservationProof,
  };
}

function abortCommand(): Extract<SettingsPersistenceCommand, { type: 'ABORT_SETTINGS_MUTATION' }> {
  const current = mutation();
  const requestId = uuid(350);
  return {
    type: 'ABORT_SETTINGS_MUTATION',
    commandId: commandId('abort', requestId),
    dataEpoch: DATA_EPOCH,
    requestId,
    mutationId: current.mutationId,
    commandDigest: current.commandDigest,
    baseRevision: current.baseRevision,
    baseGeneration: current.baseGeneration,
    previousDigest: current.previousDigest,
    candidateDigest: current.candidateDigest,
    correlationIds: [...current.correlationIds, requestId].sort(),
    storageReservationProof: reservationProof(current),
  };
}

function compareCommand(
  current = mutation()
): Extract<SettingsPersistenceCommand, { type: 'COMPARE_AND_SETTLE_SETTINGS' }> {
  return {
    type: 'COMPARE_AND_SETTLE_SETTINGS',
    commandId: commandId('write', current.mutationId),
    dataEpoch: DATA_EPOCH,
    mutationId: current.mutationId,
    commandDigest: current.commandDigest,
    baseRevision: current.baseRevision,
    baseGeneration: current.baseGeneration,
    previousDigest: current.previousDigest,
    candidateDigest: current.candidateDigest,
    correlationIds: current.correlationIds,
    previousSettings: PREVIOUS,
    candidateSettings: CANDIDATE,
    permissionProof: null,
    expectedAlarm: expectedAlarm(CANDIDATE),
    storageReservationProof: reservationProof(current),
  };
}

function crossedCompareCommand(
  identityKey: MutationIdentityKey
): Extract<SettingsPersistenceCommand, { type: 'COMPARE_AND_SETTLE_SETTINGS' }> {
  const validMutation = mutation();
  const validCommand = compareCommand(validMutation);
  const replacedId = validMutation[identityKey] as string;
  const crossed = { ...validMutation, [identityKey]: DATA_EPOCH };
  const correlationIds = validMutation.correlationIds
    .map((id) => (id === replacedId ? DATA_EPOCH : id))
    .sort();
  const commandDigest = settingsCommandDigest({
    dataEpoch: DATA_EPOCH,
    mutationId: crossed.mutationId,
    baseRevision: crossed.baseRevision,
    baseGeneration: crossed.baseGeneration,
    previousDigest: crossed.previousDigest,
    candidateDigest: crossed.candidateDigest,
    originDigest: originDigest(crossed.requiredOrigins),
    baseCorrelationIds: correlationIds,
  });
  return {
    ...validCommand,
    commandId: commandId('write', crossed.mutationId),
    mutationId: crossed.mutationId,
    commandDigest,
    correlationIds,
    storageReservationProof: {
      ...validCommand.storageReservationProof,
      mutationId: crossed.mutationId,
      commandDigest,
      reservationId: crossed.storageReservationId,
    },
  };
}

function effectsPendingEnvelope(
  command: Extract<SettingsPersistenceCommand, { type: 'COMPARE_AND_SETTLE_SETTINGS' }>
): SettingsEnvelopeV2 {
  const transactionId = uuid(401);
  return {
    version: 2,
    dataEpoch: command.dataEpoch,
    revision: command.baseRevision + 1,
    generation: command.baseGeneration + 1,
    settings: command.candidateSettings,
    journal: {
      version: 1,
      phase: 'effects_pending',
      transactionId,
      mutationId: command.mutationId,
      commandDigest: command.commandDigest,
      baseRevision: command.baseRevision,
      baseGeneration: command.baseGeneration,
      previousSettings: command.previousSettings,
      candidateSettings: command.candidateSettings,
      previousDigest: command.previousDigest,
      candidateDigest: command.candidateDigest,
      correlationIds: [...command.correlationIds, transactionId].sort(),
      expectedAlarm: command.expectedAlarm,
    },
    outcomes: [],
  };
}

function repository(storage: MemoryLocalStorage, alarm: MemoryAlarm) {
  let nextId = 100;
  return createSettingsTransactionRepository({
    storage,
    gate,
    resetJournal,
    reservationAuthority,
    admissionEvidence,
    capacity,
    permissions,
    alarm,
    includedConnectorIds: INCLUDED_CONNECTORS,
    allocateId: () => uuid(nextId++),
  });
}

describe('settings transaction repository', () => {
  it.each(MUTATION_IDENTITY_KEYS)(
    'rejects a compare descriptor whose %s reuses the data epoch',
    async (identityKey) => {
      const storage = new MemoryLocalStorage(baseEnvelope());
      const command = crossedCompareCommand(identityKey);

      await expect(
        repository(storage, new MemoryAlarm()).compareAndSettle(command)
      ).rejects.toMatchObject({ code: 'invalid_command' });
      expect(storage.writes).toHaveLength(0);
    }
  );

  it('rejects hostile compare descriptors without invoking accessors or entering the gate', async () => {
    const storage = new MemoryLocalStorage(baseEnvelope());
    const raw = { ...compareCommand() };
    let getterInvoked = false;
    Object.defineProperty(raw, 'dataEpoch', {
      enumerable: true,
      get() {
        getterInvoked = true;
        return DATA_EPOCH;
      },
    });

    await expect(
      repository(storage, new MemoryAlarm()).compareAndSettle(raw)
    ).rejects.toMatchObject({ code: 'invalid_command' });

    expect(getterInvoked).toBe(false);
    expect(storage.writes).toHaveLength(0);
  });

  it('rejects compare identities whose descriptor no longer matches the command digest', async () => {
    const storage = new MemoryLocalStorage(baseEnvelope());
    const raw = { ...compareCommand(), baseRevision: 1 };

    await expect(
      repository(storage, new MemoryAlarm()).compareAndSettle(raw)
    ).rejects.toMatchObject({ code: 'invalid_command' });

    expect(storage.writes).toHaveLength(0);
  });

  it('captures hostile alarm observations without evaluating accessors', async () => {
    const storage = new MemoryLocalStorage(baseEnvelope());
    let getterInvoked = false;
    const hostileAlarm: SettingsAutoScanAlarmPort = {
      async apply() {},
      async read() {
        const observation: Record<string, unknown> = {
          version: 1,
          kind: 'AUTO_SCAN_ALARM',
          alarmName: 'auto-scan',
          periodInMinutes: 30,
        };
        Object.defineProperty(observation, 'enabled', {
          enumerable: true,
          get() {
            getterInvoked = true;
            return true;
          },
        });
        return observation;
      },
    };
    const requestId = uuid(470);

    await expect(
      repository(storage, hostileAlarm).readSettled({
        type: 'REBASE_SETTINGS_MUTATION',
        commandId: commandId('rebase', requestId),
        dataEpoch: DATA_EPOCH,
        requestId,
        mutationId: uuid(471),
      })
    ).rejects.toMatchObject({ code: 'write_outcome_unknown' });

    expect(getterInvoked).toBe(false);
    expect(storage.value).toMatchObject({ journal: { phase: 'effects_pending' } });
  });

  it('revalidates the exact required origins under the dataset gate immediately before candidate write', async () => {
    const command = permissionCompareCommand();
    const storage = new MemoryLocalStorage(baseEnvelope(command.previousSettings));
    const observations: Array<{ origins: readonly string[]; purpose: string }> = [];
    const missingPermissions: SettingsHostPermissionContainsPort = {
      async contains(origins, capability) {
        observations.push({ origins: [...origins], purpose: capability.purpose });
        return false;
      },
    };
    let nextId = 780;
    const currentRepository = createSettingsTransactionRepository({
      storage,
      gate,
      resetJournal,
      reservationAuthority,
      admissionEvidence,
      capacity,
      permissions: missingPermissions,
      alarm: new MemoryAlarm(),
      includedConnectorIds: INCLUDED_CONNECTORS,
      allocateId: () => uuid(nextId++),
    });

    await expect(currentRepository.compareAndSettle(command)).resolves.toEqual({
      kind: 'permission_missing',
    });
    expect(observations).toEqual([
      { origins: ['https://www.free-work.com/*'], purpose: 'candidate_write' },
    ]);
    expect(storage.writes).toHaveLength(0);
  });

  it('uses the common recovery barrier to settle a user effects_pending journal during rebase', async () => {
    const command = compareCommand();
    const storage = new MemoryLocalStorage(effectsPendingEnvelope(command));
    const requestId = uuid(402);
    const result = await repository(storage, new MemoryAlarm()).readSettled({
      type: 'REBASE_SETTINGS_MUTATION',
      commandId: commandId('rebase', requestId),
      dataEpoch: DATA_EPOCH,
      requestId,
      mutationId: command.mutationId,
    });

    expect(result.kind).toBe('settled');
    expect(storage.value).toMatchObject({
      revision: 1,
      generation: 2,
      journal: null,
      outcomes: [{ mutationId: command.mutationId, outcome: 'committed' }],
    });
    const outcome = (storage.value as SettingsEnvelopeV2).outcomes[0];
    expect(outcome?.correlationIds).toEqual(command.correlationIds);
    expect(outcome?.correlationIds).not.toContain(uuid(401));
  });

  it('recovers its own durable journal before deduplicating a replayed compare command', async () => {
    const command = compareCommand();
    const storage = new MemoryLocalStorage(effectsPendingEnvelope(command));

    const result = await repository(storage, new MemoryAlarm()).compareAndSettle(command);

    expect(result.kind).toBe('already_settled');
    expect(storage.value).toMatchObject({
      generation: 2,
      journal: null,
      outcomes: [{ mutationId: command.mutationId, outcome: 'committed' }],
    });
  });

  it('rejects generated identities that collide with the complete durable outcome inventory', async () => {
    const storage = new MemoryLocalStorage(baseEnvelope());
    const alarm = new MemoryAlarm();
    await repository(storage, alarm).compareAndSettle(compareCommand());
    const writesBefore = storage.writes.length;
    const collidingId = mutation().mutationId;
    const requestId = uuid(480);
    const currentRepository = createSettingsTransactionRepository({
      storage,
      gate,
      resetJournal,
      reservationAuthority,
      admissionEvidence,
      capacity,
      permissions,
      alarm: new MemoryAlarm(),
      includedConnectorIds: INCLUDED_CONNECTORS,
      allocateId: () => collidingId,
    });

    await expect(
      currentRepository.readSettled({
        type: 'REBASE_SETTINGS_MUTATION',
        commandId: commandId('rebase', requestId),
        dataEpoch: DATA_EPOCH,
        requestId,
        mutationId: uuid(481),
      })
    ).rejects.toMatchObject({ code: 'identity_exhausted' });

    expect(storage.writes).toHaveLength(writesBefore);
  });

  it('joins only the exact committed reset correlation before returning a settled load proof', async () => {
    const storage = new MemoryLocalStorage(baseEnvelope());
    const resetCorrelation = { resetId: uuid(410), nextDataEpoch: DATA_EPOCH };
    const admissions: Array<{ resetCorrelation: typeof resetCorrelation | null }> = [];
    const joiningResetJournal: SettingsResetJournalPort = {
      async admit(current) {
        admissions.push({ resetCorrelation: current.resetCorrelation });
        return current.resetCorrelation === null
          ? {
              kind: 'absent',
              dataEpoch: current.dataEpoch,
              capability: current.capability,
              resetJournalAbsent: true,
            }
          : {
              kind: 'committed_joined',
              dataEpoch: current.dataEpoch,
              resetCorrelation: current.resetCorrelation,
              capability: current.capability,
              resetJournalAbsent: true,
            };
      },
    };
    let nextId = 420;
    const currentRepository = createSettingsTransactionRepository({
      storage,
      gate,
      resetJournal: joiningResetJournal,
      reservationAuthority,
      admissionEvidence,
      capacity,
      permissions,
      alarm: new MemoryAlarm(),
      includedConnectorIds: INCLUDED_CONNECTORS,
      allocateId: () => uuid(nextId++),
    });
    const requestId = uuid(411);

    const result = await currentRepository.recoverAndLoad({
      type: 'RECOVER_AND_LOAD_SETTINGS',
      commandId: commandId('load', requestId),
      dataEpoch: DATA_EPOCH,
      requestId,
      resetCorrelation,
    });

    expect(result.kind).toBe('settled');
    expect(admissions[0]).toEqual({ resetCorrelation });
    expect(admissions.at(-1)).toEqual({ resetCorrelation: null });
  });

  it('uses the common recovery barrier to finish compensation during cold load', async () => {
    const storage = new MemoryLocalStorage(baseEnvelope());
    const alarm = new MemoryAlarm();
    alarm.failNextApply = true;
    const currentRepository = repository(storage, alarm);
    const failed = await currentRepository.compareAndSettle(compareCommand());
    expect(failed.kind).toBe('effect_failed');
    const requestId = uuid(430);

    const loaded = await currentRepository.recoverAndLoad({
      type: 'RECOVER_AND_LOAD_SETTINGS',
      commandId: commandId('load', requestId),
      dataEpoch: DATA_EPOCH,
      requestId,
      resetCorrelation: null,
    });

    expect(loaded.kind).toBe('settled');
    expect(storage.value).toMatchObject({
      revision: 2,
      generation: 4,
      settings: PREVIOUS,
      journal: null,
      outcomes: [{ outcome: 'compensated' }],
    });
  });

  it('uses the common recovery barrier to finish compensation before reconciliation', async () => {
    const storage = new MemoryLocalStorage(baseEnvelope());
    const alarm = new MemoryAlarm();
    alarm.failNextApply = true;
    const currentRepository = repository(storage, alarm);
    const write = compareCommand();
    const failed = await currentRepository.compareAndSettle(write);
    if (failed.kind !== 'effect_failed') {
      throw new Error('expected effect failure');
    }
    const recover: Extract<SettingsPersistenceCommand, { type: 'RECOVER_SETTINGS_TRANSACTION' }> = {
      type: 'RECOVER_SETTINGS_TRANSACTION',
      commandId: commandId('recover', failed.recoveryRequestId),
      dataEpoch: DATA_EPOCH,
      requestId: failed.recoveryRequestId,
      mutationId: write.mutationId,
      commandDigest: write.commandDigest,
      baseRevision: write.baseRevision,
      baseGeneration: write.baseGeneration,
      previousDigest: write.previousDigest,
      candidateDigest: write.candidateDigest,
      correlationIds: [failed.recoveryRequestId, ...write.correlationIds].sort(),
      storageReservationProof: write.storageReservationProof,
    };
    alarm.failNextApply = true;
    expect(await currentRepository.recoverCompensation(recover)).toEqual({
      kind: 'outcome_unknown',
    });
    const requestId = uuid(431);
    const reconcile: Extract<SettingsPersistenceCommand, { type: 'RECONCILE_SETTINGS' }> = {
      type: 'RECONCILE_SETTINGS',
      commandId: commandId('reconcile', requestId),
      dataEpoch: DATA_EPOCH,
      requestId,
      mutationId: write.mutationId,
      commandDigest: write.commandDigest,
      baseRevision: write.baseRevision,
      baseGeneration: write.baseGeneration,
      previousDigest: write.previousDigest,
      candidateDigest: write.candidateDigest,
      correlationIds: [...recover.correlationIds, requestId].sort(),
      storageReservationProof: write.storageReservationProof,
      reason: 'compensation_unknown',
    };

    const result = await currentRepository.reconcile(reconcile);

    expect(result.kind).toBe('settled');
    if (result.kind === 'settled') {
      expect(result.outcome.outcome).toBe('compensated');
      expect(result.outcome.correlationIds).not.toContain(uuid(401));
    }
  });

  it('uses explicit system/reservation capabilities and never a null write proof', async () => {
    const systemStorage = new MemoryLocalStorage(baseEnvelope(CANDIDATE, 1, 1));
    const alarm = new MemoryAlarm();
    const authorities: string[] = [];
    const observingCapacity: SettingsStorageCapacityPort = {
      async assertWriteAllowed(input) {
        authorities.push(input.authority.kind);
        return true;
      },
    };
    let nextId = 700;
    const currentRepository = createSettingsTransactionRepository({
      storage: systemStorage,
      gate,
      resetJournal,
      reservationAuthority,
      admissionEvidence,
      capacity: observingCapacity,
      permissions,
      alarm,
      includedConnectorIds: INCLUDED_CONNECTORS,
      allocateId: () => uuid(nextId++),
    });
    const requestId = uuid(702);
    await currentRepository.recoverAndLoad({
      type: 'RECOVER_AND_LOAD_SETTINGS',
      commandId: commandId('load', requestId),
      dataEpoch: DATA_EPOCH,
      requestId,
      resetCorrelation: null,
    });
    const userStorage = new MemoryLocalStorage(baseEnvelope());
    const userRepository = createSettingsTransactionRepository({
      storage: userStorage,
      gate,
      resetJournal,
      reservationAuthority,
      admissionEvidence,
      capacity: observingCapacity,
      permissions,
      alarm: new MemoryAlarm(),
      includedConnectorIds: INCLUDED_CONNECTORS,
      allocateId: () => uuid(nextId++),
    });
    await userRepository.compareAndSettle(compareCommand());

    expect(authorities).toEqual(['system', 'system', 'reservation', 'reservation']);
  });

  it('rechecks the exact CAS after capacity preflight before every durable write', async () => {
    const storage = new MemoryLocalStorage(baseEnvelope());
    let checks = 0;
    const racingCapacity: SettingsStorageCapacityPort = {
      async assertWriteAllowed() {
        checks += 1;
        if (checks === 1) {
          storage.value = baseEnvelope({ ...PREVIOUS, notifications: false }, 1, 1);
        }
        return true;
      },
    };
    let nextId = 750;
    const currentRepository = createSettingsTransactionRepository({
      storage,
      gate,
      resetJournal,
      reservationAuthority,
      admissionEvidence,
      capacity: racingCapacity,
      permissions,
      alarm: new MemoryAlarm(),
      includedConnectorIds: INCLUDED_CONNECTORS,
      allocateId: () => uuid(nextId++),
    });

    await expect(currentRepository.compareAndSettle(compareCommand())).rejects.toMatchObject({
      code: 'write_outcome_unknown',
    });
    expect(storage.writes).toHaveLength(0);
    expect(storage.value).toMatchObject({ revision: 1, generation: 1 });
  });

  it('loads only a strict settled envelope and returns an alarm-correlated snapshot for fire', async () => {
    const storage = new MemoryLocalStorage(baseEnvelope());
    const requestId = uuid(303);
    const load: Extract<SettingsPersistenceCommand, { type: 'RECOVER_AND_LOAD_SETTINGS' }> = {
      type: 'RECOVER_AND_LOAD_SETTINGS',
      commandId: commandId('load', requestId),
      dataEpoch: DATA_EPOCH,
      requestId,
      resetCorrelation: null,
    };

    const result = await repository(storage, new MemoryAlarm()).recoverAndLoad(load);

    expect(result.kind).toBe('settled');
    if (result.kind !== 'settled') {
      return;
    }
    expect(result.snapshot).toMatchObject({
      dataEpoch: DATA_EPOCH,
      requestId,
      commandId: load.commandId,
      resetJournalAbsent: true,
      envelope: { journal: null, settings: PREVIOUS },
      alarmProof: { periodInMinutes: 30, envelopeGeneration: 0 },
    });
  });

  it('fails closed on invalid storage instead of falling back to default auto-scan', async () => {
    const storage = new MemoryLocalStorage({ autoScan: true });
    const requestId = uuid(304);
    const load: Extract<SettingsPersistenceCommand, { type: 'RECOVER_AND_LOAD_SETTINGS' }> = {
      type: 'RECOVER_AND_LOAD_SETTINGS',
      commandId: commandId('load', requestId),
      dataEpoch: DATA_EPOCH,
      requestId,
      resetCorrelation: null,
    };

    await expect(repository(storage, new MemoryAlarm()).recoverAndLoad(load)).rejects.toMatchObject(
      { code: 'invalid_storage' }
    );
    expect(storage.writes).toHaveLength(0);
  });

  it('CAS-writes candidate+journal, verifies the alarm, then settles one committed outcome', async () => {
    const storage = new MemoryLocalStorage(baseEnvelope());
    const alarm = new MemoryAlarm();

    const result = await repository(storage, alarm).compareAndSettle(compareCommand());

    expect(result.kind).toBe('committed');
    if (result.kind !== 'committed') {
      return;
    }
    expect(storage.writes).toHaveLength(2);
    expect(storage.writes[0]).toMatchObject({
      revision: 1,
      generation: 1,
      settings: CANDIDATE,
      journal: { phase: 'effects_pending' },
    });
    expect(storage.writes[1]).toMatchObject({
      revision: 1,
      generation: 2,
      settings: CANDIDATE,
      journal: null,
      outcomes: [{ mutationId: mutation().mutationId, outcome: 'committed' }],
    });
    expect(result.snapshot.alarmProof).toMatchObject({
      envelopeRevision: 1,
      envelopeGeneration: 2,
      periodInMinutes: 60,
    });
  });

  it('accepts an ambiguous storage Promise only when exact read-back proves the write', async () => {
    const storage = new MemoryLocalStorage(baseEnvelope());
    storage.throwAfterWriteCount = 1;

    const result = await repository(storage, new MemoryAlarm()).compareAndSettle(compareCommand());

    expect(result.kind).toBe('committed');
    expect(storage.value).toMatchObject({ generation: 2, journal: null });
  });

  it('durably fences an effect failure before exposing it', async () => {
    const storage = new MemoryLocalStorage(baseEnvelope());
    const alarm = new MemoryAlarm();
    alarm.failNextApply = true;

    const result = await repository(storage, alarm).compareAndSettle(compareCommand());

    expect(result.kind).toBe('effect_failed');
    if (result.kind !== 'effect_failed') {
      return;
    }
    expect(storage.writes.at(-1)).toMatchObject({
      revision: 1,
      generation: 2,
      settings: CANDIDATE,
      journal: {
        phase: 'compensation_pending',
        correlationIds: expect.arrayContaining([result.recoveryRequestId]),
      },
    });
    expect(result.journalProof.envelope.journal?.phase).toBe('compensation_pending');
  });

  it('compensates from the durable journal and restores the whole confirmed snapshot', async () => {
    const storage = new MemoryLocalStorage(baseEnvelope());
    const alarm = new MemoryAlarm();
    alarm.failNextApply = true;
    const currentRepository = repository(storage, alarm);
    const write = compareCommand();
    const failed = await currentRepository.compareAndSettle(write);
    if (failed.kind !== 'effect_failed') {
      throw new Error('expected effect failure');
    }
    const recover: Extract<SettingsPersistenceCommand, { type: 'RECOVER_SETTINGS_TRANSACTION' }> = {
      type: 'RECOVER_SETTINGS_TRANSACTION',
      commandId: commandId('recover', failed.recoveryRequestId),
      dataEpoch: DATA_EPOCH,
      requestId: failed.recoveryRequestId,
      mutationId: write.mutationId,
      commandDigest: write.commandDigest,
      baseRevision: write.baseRevision,
      baseGeneration: write.baseGeneration,
      previousDigest: write.previousDigest,
      candidateDigest: write.candidateDigest,
      correlationIds: [failed.recoveryRequestId, ...write.correlationIds].sort(),
      storageReservationProof: write.storageReservationProof,
    };

    const result = await currentRepository.recoverCompensation(recover);

    expect(result.kind).toBe('compensated');
    if (result.kind !== 'compensated') {
      return;
    }
    expect(storage.writes.at(-2)).toMatchObject({
      revision: 2,
      generation: 3,
      settings: PREVIOUS,
      journal: { phase: 'compensation_effects_pending' },
    });
    expect(storage.writes.at(-1)).toMatchObject({
      revision: 2,
      generation: 4,
      settings: PREVIOUS,
      journal: null,
      outcomes: [{ outcome: 'compensated' }],
    });
    expect(result.snapshot.envelope.settings).toEqual(PREVIOUS);
  });

  it('retries compensation idempotently from compensation_effects_pending', async () => {
    const storage = new MemoryLocalStorage(baseEnvelope());
    const alarm = new MemoryAlarm();
    alarm.failNextApply = true;
    const currentRepository = repository(storage, alarm);
    const write = compareCommand();
    const failed = await currentRepository.compareAndSettle(write);
    if (failed.kind !== 'effect_failed') {
      throw new Error('expected effect failure');
    }
    const recover: Extract<SettingsPersistenceCommand, { type: 'RECOVER_SETTINGS_TRANSACTION' }> = {
      type: 'RECOVER_SETTINGS_TRANSACTION',
      commandId: commandId('recover', failed.recoveryRequestId),
      dataEpoch: DATA_EPOCH,
      requestId: failed.recoveryRequestId,
      mutationId: write.mutationId,
      commandDigest: write.commandDigest,
      baseRevision: write.baseRevision,
      baseGeneration: write.baseGeneration,
      previousDigest: write.previousDigest,
      candidateDigest: write.candidateDigest,
      correlationIds: [failed.recoveryRequestId, ...write.correlationIds].sort(),
      storageReservationProof: write.storageReservationProof,
    };
    alarm.failNextApply = true;
    expect(await currentRepository.recoverCompensation(recover)).toEqual({
      kind: 'outcome_unknown',
    });
    expect(storage.value).toMatchObject({
      revision: 2,
      generation: 3,
      journal: { phase: 'compensation_effects_pending' },
    });

    const retried = await currentRepository.recoverCompensation(recover);

    expect(retried.kind).toBe('compensated');
    expect(storage.value).toMatchObject({ generation: 4, journal: null });
  });

  it('reports a revision/generation conflict without writing the candidate', async () => {
    const external = { ...PREVIOUS, notifications: false };
    const storage = new MemoryLocalStorage(baseEnvelope(external, 1, 1));

    const result = await repository(storage, new MemoryAlarm()).compareAndSettle(compareCommand());

    expect(result).toEqual({ kind: 'conflict' });
    expect(storage.writes).toHaveLength(0);
    expect(storage.value).toMatchObject({ settings: external, revision: 1, generation: 1 });
  });

  it('rebases a retry from the latest settled snapshot without writing', async () => {
    const external = { ...PREVIOUS, notifications: false };
    const storage = new MemoryLocalStorage(baseEnvelope(external, 1, 1));
    const current = mutation();
    const requestId = uuid(300);
    const rebase: Extract<SettingsPersistenceCommand, { type: 'REBASE_SETTINGS_MUTATION' }> = {
      type: 'REBASE_SETTINGS_MUTATION',
      commandId: commandId('rebase', requestId),
      dataEpoch: DATA_EPOCH,
      requestId,
      mutationId: current.mutationId,
    };

    const result = await repository(storage, new MemoryAlarm()).readSettled(rebase);

    expect(result.kind).toBe('settled');
    if (result.kind !== 'settled') {
      return;
    }
    expect(result.snapshot.envelope.settings).toEqual(external);
    expect(storage.writes).toHaveLength(0);
  });

  it('repairs a mismatched auto-scan alarm through a durable system journal before snapshotting', async () => {
    const storage = new MemoryLocalStorage(baseEnvelope(CANDIDATE, 1, 1));
    const alarm = new MemoryAlarm();
    const current = mutation();
    const requestId = uuid(302);
    const rebase: Extract<SettingsPersistenceCommand, { type: 'REBASE_SETTINGS_MUTATION' }> = {
      type: 'REBASE_SETTINGS_MUTATION',
      commandId: commandId('rebase', requestId),
      dataEpoch: DATA_EPOCH,
      requestId,
      mutationId: current.mutationId,
    };

    const result = await repository(storage, alarm).readSettled(rebase);

    expect(result.kind).toBe('settled');
    expect(storage.writes.at(-2)).toMatchObject({
      revision: 1,
      generation: 2,
      journal: { mutationId: null, phase: 'effects_pending' },
    });
    expect(storage.writes.at(-1)).toMatchObject({
      revision: 1,
      generation: 3,
      journal: null,
    });
    expect(alarm.current).toEqual(expectedAlarm(CANDIDATE));
  });

  it('reconciliation records causal not_committed without attributing candidate value equality', async () => {
    const storage = new MemoryLocalStorage(baseEnvelope(CANDIDATE, 1, 1));
    const current = mutation();
    const requestId = uuid(301);
    const reconcile: Extract<SettingsPersistenceCommand, { type: 'RECONCILE_SETTINGS' }> = {
      type: 'RECONCILE_SETTINGS',
      commandId: commandId('reconcile', requestId),
      dataEpoch: DATA_EPOCH,
      requestId,
      mutationId: current.mutationId,
      commandDigest: current.commandDigest,
      baseRevision: current.baseRevision,
      baseGeneration: current.baseGeneration,
      previousDigest: current.previousDigest,
      candidateDigest: current.candidateDigest,
      correlationIds: [...current.correlationIds, requestId].sort(),
      storageReservationProof: null,
      reason: 'save_failed',
    };

    const alarm = new MemoryAlarm();
    alarm.current = expectedAlarm(CANDIDATE);
    const result = await repository(storage, alarm).reconcile(reconcile);

    expect(result.kind).toBe('settled');
    if (result.kind !== 'settled') {
      return;
    }
    expect(result.outcome.outcome).toBe('not_committed');
    expect(result.snapshot.envelope.settings).toEqual(CANDIDATE);
    expect(result.snapshot.envelope.outcomes).toEqual([
      expect.objectContaining({ mutationId: current.mutationId, outcome: 'not_committed' }),
    ]);
  });

  it('settles contains=false durably as not_committed before returning its correlated snapshot', async () => {
    const command = permissionVerifyCommand();
    const compare = permissionCompareCommand();
    const storage = new MemoryLocalStorage(baseEnvelope(compare.previousSettings));
    const alarm = new MemoryAlarm();
    const currentRepository = createSettingsTransactionRepository({
      storage,
      gate,
      resetJournal,
      reservationAuthority,
      admissionEvidence,
      capacity,
      permissions: {
        async contains() {
          return false;
        },
      },
      alarm,
      includedConnectorIds: INCLUDED_CONNECTORS,
      allocateId: () => uuid(600),
    });

    const result = await currentRepository.settlePermissionMissing(command);

    expect(result.kind).toBe('settled');
    if (result.kind !== 'settled') {
      return;
    }
    expect(result.outcome).toMatchObject({
      mutationId: command.mutationId,
      outcome: 'not_committed',
      settledRevision: command.baseRevision,
      settledGeneration: command.baseGeneration + 1,
    });
    expect(result.outcome.correlationIds).toContain(command.permissionCheckId);
    expect(result.snapshot).toMatchObject({
      requestId: command.permissionCheckId,
      commandId: command.commandId,
      envelope: { journal: null, generation: command.baseGeneration + 1 },
    });
    expect(storage.writes).toHaveLength(1);
    expect(storage.writes[0].settings).toEqual(compare.previousSettings);
  });

  it('implements ABORT_SETTINGS_MUTATION as one durable cancelled outcome', async () => {
    const command = abortCommand();
    const storage = new MemoryLocalStorage(baseEnvelope());

    const result = await repository(storage, new MemoryAlarm()).abort(command);

    expect(result.kind).toBe('cancelled');
    if (result.kind !== 'cancelled') {
      return;
    }
    expect(result.outcome).toMatchObject({
      mutationId: command.mutationId,
      outcome: 'cancelled',
      settledRevision: 0,
      settledGeneration: 1,
    });
    expect(result.outcome.correlationIds).toContain(command.requestId);
    expect(result.snapshot).toMatchObject({
      requestId: command.requestId,
      commandId: command.commandId,
      envelope: { journal: null, generation: 1 },
    });
    expect(storage.writes).toHaveLength(1);
  });

  it('returns an exact settled snapshot for fatal outcome_missing without inventing an outcome', async () => {
    const storage = new MemoryLocalStorage(baseEnvelope());
    const current = mutation();
    const requestId = uuid(701);
    const command: Extract<SettingsPersistenceCommand, { type: 'RECONCILE_SETTINGS' }> = {
      type: 'RECONCILE_SETTINGS',
      commandId: commandId('reconcile', requestId),
      dataEpoch: DATA_EPOCH,
      requestId,
      mutationId: current.mutationId,
      commandDigest: current.commandDigest,
      baseRevision: current.baseRevision,
      baseGeneration: current.baseGeneration,
      previousDigest: current.previousDigest,
      candidateDigest: current.candidateDigest,
      correlationIds: [...current.correlationIds, requestId].sort(),
      storageReservationProof: null,
      reason: 'worker_restart',
    };
    const currentRepository = createSettingsTransactionRepository({
      storage,
      gate,
      resetJournal,
      reservationAuthority,
      admissionEvidence: {
        async classify() {
          return 'admitted_or_unknown';
        },
      },
      capacity,
      permissions,
      alarm: new MemoryAlarm(),
      includedConnectorIds: INCLUDED_CONNECTORS,
      allocateId: () => uuid(702),
    });

    const result = await currentRepository.reconcile(command);

    expect(result.kind).toBe('outcome_missing');
    if (result.kind !== 'outcome_missing') {
      return;
    }
    expect(result.snapshot).toMatchObject({
      requestId,
      commandId: command.commandId,
      envelope: { journal: null, outcomes: [] },
      alarmProof: { proofId: uuid(702) },
    });
    expect(storage.writes).toHaveLength(0);
  });
});
