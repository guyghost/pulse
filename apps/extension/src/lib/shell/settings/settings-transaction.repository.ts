import {
  SETTINGS_STORAGE_KEY,
  cloneSettings,
  cloneSettingsEnvelope,
  expectedAlarm,
  isUuidV4,
  normalizeCorrelationIds,
  parseOriginDigest,
  parseSettingsCommandDigest,
  parseSettingsEnvelopeV2,
  parseSettingsGlobalStorageReservationProof,
  parseSettingsHostPermissionContainsProofV1,
  parseStrictSettings,
  projectSettingsMutationBytes,
  readStrictJsonArray,
  readStrictJsonRecord,
  settingsDigest,
  settingsEnvelopeDigest,
  settingsIdentitiesAreDisjointFromEpochs,
  settingsStorageEntryEncodedBytes,
  type AutoScanAlarmExpectationV1,
  type SettingsEnvelopeV2,
  type SettingsGlobalStorageReservationProofV1,
  type SettingsHostPermissionContainsProofV1,
  type SettingsJournalProofV1,
  type SettingsMutationOutcomeV1,
  type SettingsPersistenceCommand,
  type SettingsResetCorrelationV1,
  type SettingsSnapshotV1,
  type SettingMutation,
} from '../../../models/settings-persistence.contract';
import type {
  SettingsAtomicCommitGatePort,
  SettingsDatasetGateCapabilityV1,
} from './settings-dataset-gate';

export type { SettingsAtomicCommitGatePort } from './settings-dataset-gate';

type CompareCommand = Extract<SettingsPersistenceCommand, { type: 'COMPARE_AND_SETTLE_SETTINGS' }>;
type RecoverCommand = Extract<SettingsPersistenceCommand, { type: 'RECOVER_SETTINGS_TRANSACTION' }>;
type RebaseCommand = Extract<SettingsPersistenceCommand, { type: 'REBASE_SETTINGS_MUTATION' }>;
type ReconcileCommand = Extract<SettingsPersistenceCommand, { type: 'RECONCILE_SETTINGS' }>;
type LoadCommand = Extract<SettingsPersistenceCommand, { type: 'RECOVER_AND_LOAD_SETTINGS' }>;
export type SettingsPermissionCheckCommand = Extract<
  SettingsPersistenceCommand,
  { type: 'VERIFY_SETTINGS_HOST_PERMISSIONS' }
>;
export type SettingsAbortCommand = Extract<
  SettingsPersistenceCommand,
  { type: 'ABORT_SETTINGS_MUTATION' }
>;

export interface SettingsLocalStoragePort {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

/** Owns only the exact `auto-scan` alarm. It must never clear another alarm. */
export interface SettingsAutoScanAlarmPort {
  apply(expectation: AutoScanAlarmExpectationV1): Promise<void>;
  read(): Promise<unknown>;
}

export type SettingsResetAdmissionV1 =
  | {
      kind: 'absent';
      dataEpoch: string;
      capability: SettingsDatasetGateCapabilityV1;
      resetJournalAbsent: true;
    }
  | {
      kind: 'committed_joined';
      dataEpoch: string;
      resetCorrelation: SettingsResetCorrelationV1;
      capability: SettingsDatasetGateCapabilityV1;
      resetJournalAbsent: true;
    }
  | { kind: 'closed' };

/** Shared reset finalizer/admission boundary. No scalar absence proof is accepted. */
export interface SettingsResetJournalPort {
  admit(input: {
    dataEpoch: string;
    resetCorrelation: SettingsResetCorrelationV1 | null;
    capability: SettingsDatasetGateCapabilityV1;
  }): Promise<SettingsResetAdmissionV1>;
}

/**
 * Extension-global byte reservation authority. The concrete implementation is
 * deliberately outside this repository because every chrome.storage.local
 * writer must participate in the same authority.
 */
export interface SettingsReservationAuthorityPort {
  isActive(
    proof: SettingsGlobalStorageReservationProofV1,
    capability: SettingsDatasetGateCapabilityV1
  ): Promise<boolean>;
}

export interface SettingsMutationAdmissionEvidencePort {
  classify(command: ReconcileCommand): Promise<'provably_never_admitted' | 'admitted_or_unknown'>;
}

export type SettingsWriteAuthority =
  | {
      kind: 'system';
      capability: SettingsDatasetGateCapabilityV1;
    }
  | {
      kind: 'reservation';
      capability: SettingsDatasetGateCapabilityV1;
      reservationProof: SettingsGlobalStorageReservationProofV1;
    };

export interface SettingsStorageCapacityCheckV1 {
  capability: SettingsDatasetGateCapabilityV1;
  authority: SettingsWriteAuthority;
  currentEnvelope: SettingsEnvelopeV2;
  nextEnvelope: SettingsEnvelopeV2;
  currentSettingsEntryBytes: number;
  nextSettingsEntryBytes: number;
}

export interface SettingsStorageCapacityPort {
  assertWriteAllowed(input: SettingsStorageCapacityCheckV1): Promise<boolean>;
}

/** Contains-only. This port must never request or prompt for permissions. */
export interface SettingsHostPermissionContainsPort {
  contains(
    origins: readonly string[],
    capability: SettingsDatasetGateCapabilityV1
  ): Promise<boolean>;
}

export type SettingsCompareAndSettleResult =
  | { kind: 'committed'; snapshot: SettingsSnapshotV1 }
  | {
      kind: 'effect_failed';
      recoveryRequestId: string;
      journalProof: SettingsJournalProofV1;
    }
  | { kind: 'conflict' }
  | { kind: 'permission_missing' }
  | { kind: 'already_settled'; snapshot: SettingsSnapshotV1 };

export type SettingsCompensationResult =
  | { kind: 'compensated'; snapshot: SettingsSnapshotV1 }
  | { kind: 'already_settled'; snapshot: SettingsSnapshotV1 }
  | { kind: 'outcome_unknown' };

export type SettingsSettledReadResult =
  { kind: 'settled'; snapshot: SettingsSnapshotV1 } | { kind: 'recovery_required' };

export type SettingsPermissionMissingResult =
  | { kind: 'settled'; snapshot: SettingsSnapshotV1; outcome: SettingsMutationOutcomeV1 }
  | { kind: 'conflict' }
  | { kind: 'outcome_unknown' };

export type SettingsAbortResult =
  | {
      kind: 'cancelled' | 'already_settled';
      snapshot: SettingsSnapshotV1;
      outcome: SettingsMutationOutcomeV1;
    }
  | { kind: 'outcome_unknown' };

export type SettingsReconcileResult =
  | { kind: 'settled'; snapshot: SettingsSnapshotV1; outcome: SettingsMutationOutcomeV1 }
  | { kind: 'outcome_missing'; snapshot: SettingsSnapshotV1 }
  | { kind: 'outcome_unknown' };

export interface SettingsSettledSnapshotPort {
  /** Strict epoch+journal+alarm proof consumed by startup and scheduling fire. */
  recoverAndLoad(command: LoadCommand): Promise<SettingsSettledReadResult>;
}

export interface SettingsTransactionRepository extends SettingsSettledSnapshotPort {
  compareAndSettle(command: unknown): Promise<SettingsCompareAndSettleResult>;
  settlePermissionMissing(
    command: SettingsPermissionCheckCommand
  ): Promise<SettingsPermissionMissingResult>;
  recoverCompensation(command: RecoverCommand): Promise<SettingsCompensationResult>;
  readSettled(command: RebaseCommand): Promise<SettingsSettledReadResult>;
  abort(command: SettingsAbortCommand): Promise<SettingsAbortResult>;
  reconcile(command: ReconcileCommand): Promise<SettingsReconcileResult>;
}

export interface SettingsTransactionRepositoryDependencies {
  storage: SettingsLocalStoragePort;
  gate: SettingsAtomicCommitGatePort;
  resetJournal: SettingsResetJournalPort;
  reservationAuthority: SettingsReservationAuthorityPort;
  admissionEvidence: SettingsMutationAdmissionEvidencePort;
  capacity: SettingsStorageCapacityPort;
  permissions: SettingsHostPermissionContainsPort;
  alarm: SettingsAutoScanAlarmPort;
  includedConnectorIds: readonly string[];
  allocateId: () => string;
}

export class SettingsTransactionRepositoryError extends Error {
  constructor(
    readonly code:
      | 'invalid_storage'
      | 'invalid_command'
      | 'authority_closed'
      | 'permission_missing'
      | 'write_outcome_unknown'
      | 'identity_exhausted',
    message: string
  ) {
    super(message);
    this.name = 'SettingsTransactionRepositoryError';
  }
}

function sameAlarm(left: unknown, right: AutoScanAlarmExpectationV1): boolean {
  const record = readStrictJsonRecord(left, [
    'version',
    'kind',
    'alarmName',
    'enabled',
    'periodInMinutes',
  ]);
  return (
    record !== null &&
    record.version === right.version &&
    record.kind === right.kind &&
    record.alarmName === right.alarmName &&
    record.enabled === right.enabled &&
    record.periodInMinutes === right.periodInMinutes
  );
}

type SettingsOutcomeIdentity = Pick<
  CompareCommand,
  | 'mutationId'
  | 'commandDigest'
  | 'previousDigest'
  | 'candidateDigest'
  | 'baseRevision'
  | 'baseGeneration'
>;

function outcomeMatches(
  outcome: SettingsMutationOutcomeV1,
  command: SettingsOutcomeIdentity
): boolean {
  return (
    outcome.mutationId === command.mutationId &&
    outcome.commandDigest === command.commandDigest &&
    outcome.previousDigest === command.previousDigest &&
    outcome.candidateDigest === command.candidateDigest &&
    outcome.baseRevision === command.baseRevision &&
    outcome.baseGeneration === command.baseGeneration
  );
}

const COMPARE_COMMAND_KEYS = [
  'type',
  'commandId',
  'dataEpoch',
  'mutationId',
  'commandDigest',
  'baseRevision',
  'baseGeneration',
  'previousDigest',
  'candidateDigest',
  'correlationIds',
  'previousSettings',
  'candidateSettings',
  'permissionProof',
  'expectedAlarm',
  'storageReservationProof',
] as const;

const RESERVATION_PROOF_KEYS = [
  'version',
  'kind',
  'storageArea',
  'settingsKey',
  'dataEpoch',
  'mutationId',
  'commandDigest',
  'baseRevision',
  'baseGeneration',
  'reservationId',
  'gateLeaseId',
  'proofId',
  'quotaBytes',
  'bytesInUse',
  'currentSettingsEntryBytes',
  'reservedSettingsEntryBytes',
  'requiredAdditionalBytes',
  'systemReserveBytes',
  'resetReceiptReserveBytes',
  'availableAfterReservationBytes',
  'reservationActive',
  'allLocalWritersFenced',
  'resetJournalAbsent',
] as const;

const PERMISSION_PROOF_KEYS = [
  'version',
  'dataEpoch',
  'mutationId',
  'permissionCheckId',
  'activationId',
  'activationResultId',
  'originDigest',
  'verifiedOrigins',
  'containsVerified',
] as const;

const PERSISTENT_KEYS = [
  'autoScan',
  'scanIntervalMinutes',
  'notifications',
  'theme',
  'enabledConnectors',
] as const;

const SETTINGS_KEYS = [
  'scanIntervalMinutes',
  'enabledConnectors',
  'notifications',
  'autoScan',
  'maxSemanticPerScan',
  'notificationScoreThreshold',
  'respectRateLimits',
  'customDelayMs',
  'theme',
] as const;

const sameStringArray = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const sameSettingValue = (left: unknown, right: unknown): boolean =>
  Array.isArray(left) && Array.isArray(right)
    ? sameStringArray(left as string[], right as string[])
    : left === right;

interface ParsedCompareCommand {
  command: Omit<CompareCommand, 'storageReservationProof'>;
  mutation: SettingMutation;
  requiredOrigins: string[];
  reservationRecord: Record<string, unknown>;
}

function parseCompareCommand(
  value: unknown,
  includedConnectorIds: string[]
): ParsedCompareCommand | null {
  const record = readStrictJsonRecord(value, COMPARE_COMMAND_KEYS);
  if (record === null) {
    return null;
  }
  const previousSettings = parseStrictSettings(record.previousSettings, includedConnectorIds);
  const candidateSettings = parseStrictSettings(record.candidateSettings, includedConnectorIds);
  const correlations = readStrictJsonArray(record.correlationIds);
  const decodedDigest = parseSettingsCommandDigest(record.commandDigest);
  const requiredOrigins = parseOriginDigest(decodedDigest?.originDigest);
  const alarm = readStrictJsonRecord(record.expectedAlarm, [
    'version',
    'kind',
    'alarmName',
    'enabled',
    'periodInMinutes',
  ]);
  const reservationRecord = readStrictJsonRecord(
    record.storageReservationProof,
    RESERVATION_PROOF_KEYS
  );
  if (
    previousSettings === null ||
    candidateSettings === null ||
    correlations === null ||
    decodedDigest === null ||
    requiredOrigins === null ||
    alarm === null ||
    reservationRecord === null ||
    record.type !== 'COMPARE_AND_SETTLE_SETTINGS' ||
    !isUuidV4(record.dataEpoch) ||
    !isUuidV4(record.mutationId) ||
    record.commandId !== `settings/write/${String(record.mutationId)}` ||
    !Number.isSafeInteger(record.baseRevision) ||
    Number(record.baseRevision) < 0 ||
    !Number.isSafeInteger(record.baseGeneration) ||
    Number(record.baseGeneration) < 0 ||
    settingsDigest(previousSettings) !== record.previousDigest ||
    settingsDigest(candidateSettings) !== record.candidateDigest ||
    decodedDigest.dataEpoch !== record.dataEpoch ||
    decodedDigest.mutationId !== record.mutationId ||
    decodedDigest.baseRevision !== record.baseRevision ||
    decodedDigest.baseGeneration !== record.baseGeneration ||
    decodedDigest.previousDigest !== record.previousDigest ||
    decodedDigest.candidateDigest !== record.candidateDigest ||
    !correlations.every(isUuidV4) ||
    new Set(correlations).size !== correlations.length ||
    !sameStringArray(correlations as string[], [...(correlations as string[])].sort()) ||
    !sameStringArray(correlations as string[], decodedDigest.baseCorrelationIds) ||
    ![5, 7].includes(decodedDigest.baseCorrelationIds.length) ||
    alarm.version !== 1 ||
    alarm.kind !== 'AUTO_SCAN_ALARM' ||
    alarm.alarmName !== 'auto-scan'
  ) {
    return null;
  }
  const expected = expectedAlarm(candidateSettings);
  if (
    alarm.enabled !== expected.enabled ||
    alarm.periodInMinutes !== expected.periodInMinutes ||
    reservationRecord.dataEpoch !== record.dataEpoch ||
    reservationRecord.mutationId !== record.mutationId ||
    reservationRecord.commandDigest !== record.commandDigest ||
    reservationRecord.baseRevision !== record.baseRevision ||
    reservationRecord.baseGeneration !== record.baseGeneration ||
    !isUuidV4(reservationRecord.reservationId) ||
    !decodedDigest.baseCorrelationIds.includes(reservationRecord.reservationId)
  ) {
    return null;
  }
  const changedKeys = SETTINGS_KEYS.filter(
    (key) => !sameSettingValue(previousSettings[key], candidateSettings[key])
  );
  if (changedKeys.length !== 1 || !PERSISTENT_KEYS.includes(changedKeys[0] as never)) {
    return null;
  }

  let permissionProof: SettingsHostPermissionContainsProofV1 | null = null;
  let permissionCheckId: string;
  let activationId: string;
  let activationResultId: string;
  if (requiredOrigins.length === 0) {
    if (record.permissionProof !== null) {
      return null;
    }
    const opaqueIds = decodedDigest.baseCorrelationIds.filter(
      (id) => id !== record.mutationId && id !== reservationRecord.reservationId
    );
    if (opaqueIds.length < 3) {
      return null;
    }
    [permissionCheckId, activationId, activationResultId] = opaqueIds as [string, string, string];
  } else {
    const proofRecord = readStrictJsonRecord(record.permissionProof, PERMISSION_PROOF_KEYS);
    if (
      proofRecord === null ||
      !isUuidV4(proofRecord.permissionCheckId) ||
      !isUuidV4(proofRecord.activationId) ||
      !isUuidV4(proofRecord.activationResultId)
    ) {
      return null;
    }
    permissionCheckId = proofRecord.permissionCheckId;
    activationId = proofRecord.activationId;
    activationResultId = proofRecord.activationResultId;
    permissionProof = parseSettingsHostPermissionContainsProofV1(proofRecord, {
      dataEpoch: record.dataEpoch,
      mutationId: record.mutationId,
      permissionCheckId,
      activationId,
      activationResultId,
      origins: requiredOrigins,
    });
    if (permissionProof === null) {
      return null;
    }
  }
  const identityIds = [
    record.mutationId,
    permissionCheckId,
    activationId,
    activationResultId,
    reservationRecord.reservationId,
  ];
  if (
    new Set(identityIds).size !== identityIds.length ||
    !identityIds.every((id) => decodedDigest.baseCorrelationIds.includes(id)) ||
    !settingsIdentitiesAreDisjointFromEpochs(record.dataEpoch, null, correlations)
  ) {
    return null;
  }
  const key = changedKeys[0] as SettingMutation['key'];
  const mutation: SettingMutation = {
    key,
    previousSettings,
    candidateSettings,
    previous:
      key === 'enabledConnectors' ? [...previousSettings.enabledConnectors] : previousSettings[key],
    candidate:
      key === 'enabledConnectors'
        ? [...candidateSettings.enabledConnectors]
        : candidateSettings[key],
    previousDigest: record.previousDigest as string,
    candidateDigest: record.candidateDigest as string,
    commandDigest: record.commandDigest as string,
    correlationIds: [...(correlations as string[])],
    mutationId: record.mutationId,
    permissionCheckId,
    activationId,
    activationResultId,
    requiredOrigins,
    baseRevision: Number(record.baseRevision),
    baseGeneration: Number(record.baseGeneration),
    permissionProof,
    storageReservationId: reservationRecord.reservationId,
    storageReservationProof: null,
  };
  return {
    command: {
      type: 'COMPARE_AND_SETTLE_SETTINGS',
      commandId: record.commandId as string,
      dataEpoch: record.dataEpoch,
      mutationId: record.mutationId,
      commandDigest: record.commandDigest as string,
      baseRevision: Number(record.baseRevision),
      baseGeneration: Number(record.baseGeneration),
      previousDigest: record.previousDigest as string,
      candidateDigest: record.candidateDigest as string,
      correlationIds: [...(correlations as string[])],
      previousSettings,
      candidateSettings,
      permissionProof,
      expectedAlarm: expected,
    },
    mutation,
    requiredOrigins,
    reservationRecord,
  };
}

export function createSettingsTransactionRepository(
  dependencies: SettingsTransactionRepositoryDependencies
): SettingsTransactionRepository {
  const includedConnectorIds = [...dependencies.includedConnectorIds];

  const durableIdentityInventory = (envelope?: SettingsEnvelopeV2): string[] =>
    envelope === undefined
      ? []
      : [
          envelope.dataEpoch,
          ...(envelope.journal === null
            ? []
            : [envelope.journal.transactionId, ...envelope.journal.correlationIds]),
          ...envelope.outcomes.flatMap((outcome) => [
            outcome.mutationId,
            ...outcome.correlationIds,
          ]),
        ];

  const allocateFreshId = (forbidden: readonly string[], envelope?: SettingsEnvelopeV2): string => {
    const id = dependencies.allocateId();
    if (!isUuidV4(id) || new Set([...forbidden, ...durableIdentityInventory(envelope)]).has(id)) {
      throw new SettingsTransactionRepositoryError(
        'identity_exhausted',
        'Settings identity allocator returned an invalid or reused UUID.'
      );
    }
    return id;
  };

  const readEnvelope = async (dataEpoch: string): Promise<SettingsEnvelopeV2> => {
    const raw = await dependencies.storage.get(SETTINGS_STORAGE_KEY);
    const envelope = parseSettingsEnvelopeV2(raw, dataEpoch, includedConnectorIds);
    if (envelope === null) {
      throw new SettingsTransactionRepositoryError(
        'invalid_storage',
        'Settings storage is not an exact envelope for the active epoch.'
      );
    }
    return envelope;
  };

  const sameCapability = (
    left: SettingsDatasetGateCapabilityV1,
    right: SettingsDatasetGateCapabilityV1
  ): boolean =>
    left.version === right.version &&
    left.kind === right.kind &&
    left.dataEpoch === right.dataEpoch &&
    left.operationId === right.operationId &&
    left.purpose === right.purpose &&
    left.leaseId === right.leaseId &&
    left.authorityRevision === right.authorityRevision;

  const admitResetBoundary = async (
    capability: SettingsDatasetGateCapabilityV1,
    resetCorrelation: SettingsResetCorrelationV1 | null
  ): Promise<Exclude<SettingsResetAdmissionV1, { kind: 'closed' }> | null> => {
    const result = await dependencies.resetJournal.admit({
      dataEpoch: capability.dataEpoch,
      resetCorrelation,
      capability,
    });
    if (
      result.kind === 'closed' ||
      result.dataEpoch !== capability.dataEpoch ||
      result.resetJournalAbsent !== true ||
      !sameCapability(result.capability, capability) ||
      (result.kind === 'committed_joined' &&
        (resetCorrelation === null ||
          result.resetCorrelation.resetId !== resetCorrelation.resetId ||
          result.resetCorrelation.nextDataEpoch !== resetCorrelation.nextDataEpoch))
    ) {
      return null;
    }
    return result;
  };

  const assertAuthority = async (authority: SettingsWriteAuthority): Promise<void> => {
    const resetAdmission = await admitResetBoundary(authority.capability, null);
    const reservationActive =
      authority.kind === 'system'
        ? true
        : await dependencies.reservationAuthority.isActive(
            authority.reservationProof,
            authority.capability
          );
    if (resetAdmission?.kind !== 'absent' || !reservationActive) {
      throw new SettingsTransactionRepositoryError(
        'authority_closed',
        'Dataset epoch or Settings storage reservation is no longer authoritative.'
      );
    }
  };

  const writeExact = async (
    expectedCurrent: SettingsEnvelopeV2,
    envelope: SettingsEnvelopeV2,
    authority: SettingsWriteAuthority,
    preWriteCheck?: (capability: SettingsDatasetGateCapabilityV1) => Promise<boolean>
  ): Promise<SettingsEnvelopeV2> => {
    if (
      authority.capability.dataEpoch !== envelope.dataEpoch ||
      authority.capability.dataEpoch !== expectedCurrent.dataEpoch
    ) {
      throw new SettingsTransactionRepositoryError(
        'authority_closed',
        'Settings write capability targets a foreign dataset epoch.'
      );
    }
    await assertAuthority(authority);
    const parsedBeforeWrite = parseSettingsEnvelopeV2(
      envelope,
      envelope.dataEpoch,
      includedConnectorIds
    );
    if (parsedBeforeWrite === null) {
      throw new SettingsTransactionRepositoryError(
        'invalid_command',
        'Refusing to persist an invalid Settings envelope.'
      );
    }
    const expectedDigest = settingsEnvelopeDigest(expectedCurrent);
    const beforeCapacity = await readEnvelope(envelope.dataEpoch);
    if (settingsEnvelopeDigest(beforeCapacity) !== expectedDigest) {
      throw new SettingsTransactionRepositoryError(
        'write_outcome_unknown',
        'Settings CAS changed before capacity preflight.'
      );
    }
    if (
      !(await dependencies.capacity.assertWriteAllowed({
        capability: authority.capability,
        authority,
        currentEnvelope: cloneSettingsEnvelope(beforeCapacity),
        nextEnvelope: cloneSettingsEnvelope(parsedBeforeWrite),
        currentSettingsEntryBytes: settingsStorageEntryEncodedBytes(beforeCapacity),
        nextSettingsEntryBytes: settingsStorageEntryEncodedBytes(parsedBeforeWrite),
      }))
    ) {
      throw new SettingsTransactionRepositoryError(
        'authority_closed',
        'Settings write no longer has exact global storage capacity.'
      );
    }
    await assertAuthority(authority);
    const immediatelyBeforeWrite = await readEnvelope(envelope.dataEpoch);
    if (settingsEnvelopeDigest(immediatelyBeforeWrite) !== expectedDigest) {
      throw new SettingsTransactionRepositoryError(
        'write_outcome_unknown',
        'Settings CAS changed after capacity preflight.'
      );
    }
    if (preWriteCheck !== undefined && !(await preWriteCheck(authority.capability))) {
      throw new SettingsTransactionRepositoryError(
        'permission_missing',
        'Required connector host permissions are no longer present.'
      );
    }
    await assertAuthority(authority);
    const afterImmediateCheck = await readEnvelope(envelope.dataEpoch);
    if (settingsEnvelopeDigest(afterImmediateCheck) !== expectedDigest) {
      throw new SettingsTransactionRepositoryError(
        'write_outcome_unknown',
        'Settings CAS changed during the final pre-write check.'
      );
    }
    try {
      await dependencies.storage.set(SETTINGS_STORAGE_KEY, parsedBeforeWrite);
    } catch {
      // A rejected Chrome storage Promise can still be ambiguous. Only the
      // exact read-back below decides whether this idempotent write landed.
    }
    let readBack: SettingsEnvelopeV2;
    try {
      readBack = await readEnvelope(envelope.dataEpoch);
    } catch {
      throw new SettingsTransactionRepositoryError(
        'write_outcome_unknown',
        'Settings storage write outcome cannot be established by read-back.'
      );
    }
    if (settingsEnvelopeDigest(readBack) !== settingsEnvelopeDigest(parsedBeforeWrite)) {
      throw new SettingsTransactionRepositoryError(
        'write_outcome_unknown',
        'Settings storage read-back differs from the exact written envelope.'
      );
    }
    return readBack;
  };

  const makeSnapshot = async (
    envelope: SettingsEnvelopeV2,
    requestId: string,
    commandId: string,
    forbiddenIds: readonly string[],
    authority: SettingsWriteAuthority
  ): Promise<SettingsSnapshotV1> => {
    if (
      envelope.journal !== null ||
      (await admitResetBoundary(authority.capability, null))?.kind !== 'absent'
    ) {
      throw new SettingsTransactionRepositoryError(
        'authority_closed',
        'A settled Settings snapshot requires absent transaction and reset journals.'
      );
    }
    const alarm = await dependencies.alarm.read();
    const expectation = expectedAlarm(envelope.settings);
    if (!sameAlarm(alarm, expectation)) {
      throw new SettingsTransactionRepositoryError(
        'write_outcome_unknown',
        'The auto-scan alarm does not match the settled Settings envelope.'
      );
    }
    const proofId = allocateFreshId([...forbiddenIds, requestId], envelope);
    return {
      version: 1,
      dataEpoch: envelope.dataEpoch,
      requestId,
      commandId,
      resetJournalAbsent: true,
      envelope: cloneSettingsEnvelope(envelope),
      alarmProof: {
        ...expectation,
        dataEpoch: envelope.dataEpoch,
        envelopeRevision: envelope.revision,
        envelopeGeneration: envelope.generation,
        settingsDigest: settingsDigest(envelope.settings),
        proofId,
        requestId,
        commandId,
      },
    };
  };

  /**
   * Shared cold-start/rebase/reconcile recovery barrier. It consumes every
   * durable journal phase to a ledger-backed settled envelope, or returns null
   * while an idempotent external effect remains unprovable.
   */
  const recoverToSettled = async (
    initial: SettingsEnvelopeV2,
    authority: SettingsWriteAuthority
  ): Promise<SettingsEnvelopeV2 | null> => {
    let current = initial;
    while (current.journal !== null) {
      const journal = current.journal;
      if (journal.mutationId === null) {
        if (journal.phase !== 'effects_pending') {
          return null;
        }
        try {
          await dependencies.alarm.apply(journal.expectedAlarm);
          if (!sameAlarm(await dependencies.alarm.read(), journal.expectedAlarm)) {
            return null;
          }
        } catch {
          return null;
        }
        current = await writeExact(
          current,
          {
            ...cloneSettingsEnvelope(current),
            generation: current.generation + 1,
            journal: null,
          },
          authority
        );
        continue;
      }

      const decoded = parseSettingsCommandDigest(journal.commandDigest);
      if (
        decoded === null ||
        journal.previousSettings === null ||
        journal.previousDigest === null ||
        decoded.mutationId !== journal.mutationId ||
        decoded.baseRevision !== journal.baseRevision ||
        decoded.baseGeneration !== journal.baseGeneration ||
        decoded.previousDigest !== journal.previousDigest ||
        decoded.candidateDigest !== journal.candidateDigest
      ) {
        return null;
      }

      if (journal.phase === 'effects_pending') {
        try {
          await dependencies.alarm.apply(journal.expectedAlarm);
          if (!sameAlarm(await dependencies.alarm.read(), journal.expectedAlarm)) {
            throw new Error('candidate alarm read-back mismatch');
          }
          const outcome: SettingsMutationOutcomeV1 = {
            version: 1,
            dataEpoch: current.dataEpoch,
            mutationId: journal.mutationId,
            commandDigest: journal.commandDigest as string,
            previousDigest: journal.previousDigest,
            candidateDigest: journal.candidateDigest,
            baseRevision: journal.baseRevision,
            baseGeneration: journal.baseGeneration,
            settledRevision: journal.baseRevision + 1,
            settledGeneration: journal.baseGeneration + 2,
            correlationIds: [...decoded.baseCorrelationIds],
            outcome: 'committed',
          };
          current = await writeExact(
            current,
            {
              ...cloneSettingsEnvelope(current),
              generation: journal.baseGeneration + 2,
              journal: null,
              outcomes: [...current.outcomes, outcome],
            },
            authority
          );
          continue;
        } catch (error) {
          if (error instanceof SettingsTransactionRepositoryError) {
            throw error;
          }
          const recoveryRequestId = allocateFreshId(journal.correlationIds, current);
          current = await writeExact(
            current,
            {
              ...cloneSettingsEnvelope(current),
              generation: journal.baseGeneration + 2,
              journal: {
                ...journal,
                phase: 'compensation_pending',
                correlationIds: normalizeCorrelationIds([
                  ...journal.correlationIds,
                  recoveryRequestId,
                ]),
                expectedAlarm: expectedAlarm(journal.previousSettings),
              },
            },
            authority
          );
          continue;
        }
      }

      if (journal.phase === 'compensation_pending') {
        current = await writeExact(
          current,
          {
            ...cloneSettingsEnvelope(current),
            revision: journal.baseRevision + 2,
            generation: journal.baseGeneration + 3,
            settings: cloneSettings(journal.previousSettings),
            journal: {
              ...journal,
              phase: 'compensation_effects_pending',
              expectedAlarm: expectedAlarm(journal.previousSettings),
            },
          },
          authority
        );
        continue;
      }

      try {
        const previousExpectation = expectedAlarm(journal.previousSettings);
        await dependencies.alarm.apply(previousExpectation);
        if (!sameAlarm(await dependencies.alarm.read(), previousExpectation)) {
          return null;
        }
      } catch {
        return null;
      }
      const causalRecoveryIds = journal.correlationIds.filter(
        (id) => id !== journal.transactionId && !decoded.baseCorrelationIds.includes(id)
      );
      const outcome: SettingsMutationOutcomeV1 = {
        version: 1,
        dataEpoch: current.dataEpoch,
        mutationId: journal.mutationId,
        commandDigest: journal.commandDigest as string,
        previousDigest: journal.previousDigest,
        candidateDigest: journal.candidateDigest,
        baseRevision: journal.baseRevision,
        baseGeneration: journal.baseGeneration,
        settledRevision: journal.baseRevision + 2,
        settledGeneration: journal.baseGeneration + 4,
        correlationIds: normalizeCorrelationIds([
          ...decoded.baseCorrelationIds,
          ...causalRecoveryIds,
        ]),
        outcome: 'compensated',
      };
      current = await writeExact(
        current,
        {
          ...cloneSettingsEnvelope(current),
          generation: journal.baseGeneration + 4,
          journal: null,
          outcomes: [...current.outcomes, outcome],
        },
        authority
      );
    }
    return current;
  };

  const ensureAlarmAligned = async (
    envelope: SettingsEnvelopeV2,
    authority: SettingsWriteAuthority
  ): Promise<SettingsEnvelopeV2> => {
    const expectation = expectedAlarm(envelope.settings);
    if (sameAlarm(await dependencies.alarm.read(), expectation)) {
      return envelope;
    }
    if (envelope.journal !== null || envelope.generation > Number.MAX_SAFE_INTEGER - 2) {
      throw new SettingsTransactionRepositoryError(
        'write_outcome_unknown',
        'Auto-scan repair cannot start from an unsettled or exhausted envelope.'
      );
    }
    const transactionId = allocateFreshId([], envelope);
    const repairing = await writeExact(
      envelope,
      {
        ...cloneSettingsEnvelope(envelope),
        generation: envelope.generation + 1,
        journal: {
          version: 1,
          phase: 'effects_pending',
          transactionId,
          mutationId: null,
          commandDigest: null,
          baseRevision: envelope.revision,
          baseGeneration: envelope.generation,
          previousSettings: null,
          candidateSettings: cloneSettings(envelope.settings),
          previousDigest: null,
          candidateDigest: settingsDigest(envelope.settings),
          correlationIds: [transactionId],
          expectedAlarm: expectation,
        },
      },
      authority
    );
    try {
      await dependencies.alarm.apply(expectation);
      if (!sameAlarm(await dependencies.alarm.read(), expectation)) {
        throw new Error('auto-scan alarm read-back mismatch');
      }
    } catch {
      throw new SettingsTransactionRepositoryError(
        'write_outcome_unknown',
        'Auto-scan repair remains durably pending.'
      );
    }
    return writeExact(
      repairing,
      {
        ...cloneSettingsEnvelope(repairing),
        generation: envelope.generation + 2,
        journal: null,
      },
      authority
    );
  };

  return {
    recoverAndLoad(command) {
      return dependencies.gate.runExclusive(
        { dataEpoch: command.dataEpoch, operationId: command.requestId, purpose: 'load' },
        async (capability) => {
          const authority: SettingsWriteAuthority = { kind: 'system', capability };
          if ((await admitResetBoundary(capability, command.resetCorrelation)) === null) {
            return { kind: 'recovery_required' as const };
          }
          let current = await recoverToSettled(await readEnvelope(command.dataEpoch), authority);
          if (current === null) {
            return { kind: 'recovery_required' as const };
          }
          current = await ensureAlarmAligned(current, authority);
          return {
            kind: 'settled' as const,
            snapshot: await makeSnapshot(
              current,
              command.requestId,
              command.commandId,
              [command.dataEpoch],
              authority
            ),
          };
        }
      );
    },

    compareAndSettle(rawCommand) {
      const parsed = parseCompareCommand(rawCommand, includedConnectorIds);
      if (parsed === null) {
        return Promise.reject(
          new SettingsTransactionRepositoryError(
            'invalid_command',
            'Compare-and-settle command is not an exact canonical descriptor snapshot.'
          )
        );
      }
      const command = parsed.command;
      return dependencies.gate.runExclusive(
        {
          dataEpoch: command.dataEpoch,
          operationId: command.mutationId,
          purpose: 'candidate_write',
        },
        async (capability) => {
          const current = await recoverToSettled(await readEnvelope(command.dataEpoch), {
            kind: 'system',
            capability,
          });
          if (current === null) {
            return { kind: 'conflict' as const };
          }
          const existing = current.outcomes.find(
            (outcome) => outcome.mutationId === command.mutationId
          );
          if (existing) {
            if (!outcomeMatches(existing, command)) {
              throw new SettingsTransactionRepositoryError(
                'invalid_storage',
                'Mutation identity collides with a different durable Settings outcome.'
              );
            }
            return {
              kind: 'already_settled' as const,
              snapshot: await makeSnapshot(
                current,
                command.mutationId,
                command.commandId,
                command.correlationIds,
                { kind: 'system', capability }
              ),
            };
          }
          if (
            current.journal !== null ||
            current.revision !== command.baseRevision ||
            current.generation !== command.baseGeneration ||
            settingsDigest(current.settings) !== command.previousDigest
          ) {
            return { kind: 'conflict' as const };
          }

          const projection = projectSettingsMutationBytes(current, parsed.mutation);
          const reservationProof =
            projection === null
              ? null
              : parseSettingsGlobalStorageReservationProof(
                  parsed.reservationRecord,
                  command.dataEpoch,
                  parsed.mutation,
                  projection
                );
          if (reservationProof === null) {
            throw new SettingsTransactionRepositoryError(
              'invalid_command',
              'Settings reservation proof does not match the exact candidate byte projection.'
            );
          }
          const authority: SettingsWriteAuthority = {
            kind: 'reservation',
            capability,
            reservationProof,
          };
          await assertAuthority(authority);

          const transactionId = allocateFreshId(command.correlationIds, current);
          const effectsPending: SettingsEnvelopeV2 = {
            version: 2,
            dataEpoch: command.dataEpoch,
            revision: command.baseRevision + 1,
            generation: command.baseGeneration + 1,
            settings: cloneSettings(command.candidateSettings),
            journal: {
              version: 1,
              phase: 'effects_pending',
              transactionId,
              mutationId: command.mutationId,
              commandDigest: command.commandDigest,
              baseRevision: command.baseRevision,
              baseGeneration: command.baseGeneration,
              previousSettings: cloneSettings(command.previousSettings),
              candidateSettings: cloneSettings(command.candidateSettings),
              previousDigest: command.previousDigest,
              candidateDigest: command.candidateDigest,
              correlationIds: normalizeCorrelationIds([...command.correlationIds, transactionId]),
              expectedAlarm: expectedAlarm(command.candidateSettings),
            },
            outcomes: current.outcomes.map((outcome) => ({
              ...outcome,
              correlationIds: [...outcome.correlationIds],
            })),
          };
          let installed: SettingsEnvelopeV2;
          try {
            installed = await writeExact(
              current,
              effectsPending,
              authority,
              parsed.requiredOrigins.length === 0
                ? undefined
                : (currentCapability) =>
                    dependencies.permissions.contains(
                      [...parsed.requiredOrigins],
                      currentCapability
                    )
            );
          } catch (error) {
            if (
              error instanceof SettingsTransactionRepositoryError &&
              error.code === 'permission_missing'
            ) {
              return { kind: 'permission_missing' as const };
            }
            throw error;
          }

          try {
            await dependencies.alarm.apply(command.expectedAlarm);
            if (!sameAlarm(await dependencies.alarm.read(), command.expectedAlarm)) {
              throw new Error('auto-scan alarm read-back mismatch');
            }
          } catch {
            const recoveryRequestId = allocateFreshId(
              installed.journal?.correlationIds ?? [],
              installed
            );
            const compensationPending: SettingsEnvelopeV2 = {
              ...cloneSettingsEnvelope(installed),
              generation: command.baseGeneration + 2,
              journal: installed.journal
                ? {
                    ...installed.journal,
                    phase: 'compensation_pending',
                    correlationIds: normalizeCorrelationIds([
                      ...installed.journal.correlationIds,
                      recoveryRequestId,
                    ]),
                    expectedAlarm: expectedAlarm(command.previousSettings),
                  }
                : null,
            };
            const fenced = await writeExact(installed, compensationPending, authority);
            return {
              kind: 'effect_failed' as const,
              recoveryRequestId,
              journalProof: {
                version: 1,
                dataEpoch: command.dataEpoch,
                requestId: recoveryRequestId,
                commandId: command.commandId,
                resetJournalAbsent: true,
                envelope: fenced,
              },
            };
          }

          const outcome: SettingsMutationOutcomeV1 = {
            version: 1,
            dataEpoch: command.dataEpoch,
            mutationId: command.mutationId,
            commandDigest: command.commandDigest,
            previousDigest: command.previousDigest,
            candidateDigest: command.candidateDigest,
            baseRevision: command.baseRevision,
            baseGeneration: command.baseGeneration,
            settledRevision: command.baseRevision + 1,
            settledGeneration: command.baseGeneration + 2,
            correlationIds: [...command.correlationIds],
            outcome: 'committed',
          };
          const settled = await writeExact(
            installed,
            {
              ...cloneSettingsEnvelope(installed),
              generation: command.baseGeneration + 2,
              journal: null,
              outcomes: [...installed.outcomes, outcome],
            },
            authority
          );
          return {
            kind: 'committed' as const,
            snapshot: await makeSnapshot(
              settled,
              command.mutationId,
              command.commandId,
              [...command.correlationIds, transactionId],
              authority
            ),
          };
        }
      );
    },

    settlePermissionMissing(command) {
      return dependencies.gate.runExclusive(
        {
          dataEpoch: command.dataEpoch,
          operationId: command.permissionCheckId,
          purpose: 'permission_check',
        },
        async (capability) => {
          const authority: SettingsWriteAuthority = {
            kind: 'reservation',
            capability,
            reservationProof: command.storageReservationProof,
          };
          await assertAuthority(authority);
          let current = await recoverToSettled(await readEnvelope(command.dataEpoch), authority);
          if (current === null) {
            return { kind: 'outcome_unknown' as const };
          }
          current = await ensureAlarmAligned(current, authority);
          const existing = current.outcomes.find(
            (outcome) => outcome.mutationId === command.mutationId
          );
          if (existing !== undefined) {
            if (!outcomeMatches(existing, command)) {
              throw new SettingsTransactionRepositoryError(
                'invalid_storage',
                'Mutation identity collides with a different durable Settings outcome.'
              );
            }
            if (existing.outcome !== 'not_committed') {
              return { kind: 'conflict' as const };
            }
            return {
              kind: 'settled' as const,
              outcome: existing,
              snapshot: await makeSnapshot(
                current,
                command.permissionCheckId,
                command.commandId,
                command.correlationIds,
                authority
              ),
            };
          }
          if (
            current.journal !== null ||
            current.revision !== command.baseRevision ||
            current.generation !== command.baseGeneration ||
            settingsDigest(current.settings) !== command.previousDigest ||
            !command.correlationIds.includes(command.permissionCheckId)
          ) {
            return { kind: 'conflict' as const };
          }
          let contains: boolean;
          try {
            contains = await dependencies.permissions.contains([...command.origins], capability);
          } catch {
            return { kind: 'outcome_unknown' as const };
          }
          if (contains || current.generation >= Number.MAX_SAFE_INTEGER) {
            return contains ? { kind: 'conflict' as const } : { kind: 'outcome_unknown' as const };
          }
          const outcome: SettingsMutationOutcomeV1 = {
            version: 1,
            dataEpoch: command.dataEpoch,
            mutationId: command.mutationId,
            commandDigest: command.commandDigest,
            previousDigest: command.previousDigest,
            candidateDigest: command.candidateDigest,
            baseRevision: command.baseRevision,
            baseGeneration: command.baseGeneration,
            settledRevision: current.revision,
            settledGeneration: current.generation + 1,
            correlationIds: normalizeCorrelationIds(command.correlationIds),
            outcome: 'not_committed',
          };
          const settled = await writeExact(
            current,
            {
              ...cloneSettingsEnvelope(current),
              generation: current.generation + 1,
              outcomes: [...current.outcomes, outcome],
            },
            authority
          );
          return {
            kind: 'settled' as const,
            outcome,
            snapshot: await makeSnapshot(
              settled,
              command.permissionCheckId,
              command.commandId,
              command.correlationIds,
              authority
            ),
          };
        }
      );
    },

    recoverCompensation(command) {
      return dependencies.gate.runExclusive(
        { dataEpoch: command.dataEpoch, operationId: command.requestId, purpose: 'recovery' },
        async (capability) => {
          const authority: SettingsWriteAuthority = {
            kind: 'reservation',
            capability,
            reservationProof: command.storageReservationProof,
          };
          await assertAuthority(authority);
          const current = await readEnvelope(command.dataEpoch);
          const existing = current.outcomes.find(
            (outcome) => outcome.mutationId === command.mutationId
          );
          if (existing) {
            if (!outcomeMatches(existing, command)) {
              throw new SettingsTransactionRepositoryError(
                'invalid_storage',
                'Mutation identity collides with a different durable Settings outcome.'
              );
            }
            return {
              kind: 'already_settled' as const,
              snapshot: await makeSnapshot(
                current,
                command.requestId,
                command.commandId,
                command.correlationIds,
                authority
              ),
            };
          }
          const journal = current.journal;
          if (
            journal === null ||
            !['compensation_pending', 'compensation_effects_pending'].includes(journal.phase) ||
            journal.mutationId !== command.mutationId ||
            journal.commandDigest !== command.commandDigest ||
            journal.baseRevision !== command.baseRevision ||
            journal.baseGeneration !== command.baseGeneration ||
            journal.previousSettings === null ||
            !journal.correlationIds.includes(command.requestId)
          ) {
            return { kind: 'outcome_unknown' as const };
          }

          const compensationEffectsPending =
            journal.phase === 'compensation_effects_pending'
              ? current
              : await writeExact(
                  current,
                  {
                    ...cloneSettingsEnvelope(current),
                    revision: command.baseRevision + 2,
                    generation: command.baseGeneration + 3,
                    settings: cloneSettings(journal.previousSettings),
                    journal: {
                      ...journal,
                      phase: 'compensation_effects_pending',
                      correlationIds: normalizeCorrelationIds([
                        ...journal.correlationIds,
                        ...command.correlationIds,
                      ]),
                      expectedAlarm: expectedAlarm(journal.previousSettings),
                    },
                  },
                  authority
                );

          try {
            await dependencies.alarm.apply(expectedAlarm(journal.previousSettings));
            if (
              !sameAlarm(await dependencies.alarm.read(), expectedAlarm(journal.previousSettings))
            ) {
              return { kind: 'outcome_unknown' as const };
            }
          } catch {
            return { kind: 'outcome_unknown' as const };
          }

          const outcome: SettingsMutationOutcomeV1 = {
            version: 1,
            dataEpoch: command.dataEpoch,
            mutationId: command.mutationId,
            commandDigest: command.commandDigest,
            previousDigest: command.previousDigest,
            candidateDigest: command.candidateDigest,
            baseRevision: command.baseRevision,
            baseGeneration: command.baseGeneration,
            settledRevision: command.baseRevision + 2,
            settledGeneration: command.baseGeneration + 4,
            correlationIds: [...command.correlationIds],
            outcome: 'compensated',
          };
          const settled = await writeExact(
            compensationEffectsPending,
            {
              ...cloneSettingsEnvelope(compensationEffectsPending),
              generation: command.baseGeneration + 4,
              journal: null,
              outcomes: [...compensationEffectsPending.outcomes, outcome],
            },
            authority
          );
          return {
            kind: 'compensated' as const,
            snapshot: await makeSnapshot(
              settled,
              command.requestId,
              command.commandId,
              [...command.correlationIds, compensationEffectsPending.journal?.transactionId ?? ''],
              authority
            ),
          };
        }
      );
    },

    readSettled(command) {
      return dependencies.gate.runExclusive(
        { dataEpoch: command.dataEpoch, operationId: command.requestId, purpose: 'rebase' },
        async (capability) => {
          const authority: SettingsWriteAuthority = { kind: 'system', capability };
          if ((await admitResetBoundary(capability, null))?.kind !== 'absent') {
            return { kind: 'recovery_required' as const };
          }
          let current = await recoverToSettled(await readEnvelope(command.dataEpoch), authority);
          if (current === null) {
            return { kind: 'recovery_required' as const };
          }
          current = await ensureAlarmAligned(current, authority);
          return {
            kind: 'settled' as const,
            snapshot: await makeSnapshot(
              current,
              command.requestId,
              command.commandId,
              [command.mutationId],
              authority
            ),
          };
        }
      );
    },

    abort(command) {
      return dependencies.gate.runExclusive(
        { dataEpoch: command.dataEpoch, operationId: command.requestId, purpose: 'abort' },
        async (capability) => {
          const authority: SettingsWriteAuthority = command.storageReservationProof
            ? {
                kind: 'reservation',
                capability,
                reservationProof: command.storageReservationProof,
              }
            : { kind: 'system', capability };
          await assertAuthority(authority);
          let current = await recoverToSettled(await readEnvelope(command.dataEpoch), authority);
          if (current === null) {
            return { kind: 'outcome_unknown' as const };
          }
          current = await ensureAlarmAligned(current, authority);
          const existing = current.outcomes.find(
            (outcome) => outcome.mutationId === command.mutationId
          );
          if (existing !== undefined) {
            if (!outcomeMatches(existing, command)) {
              throw new SettingsTransactionRepositoryError(
                'invalid_storage',
                'Mutation identity collides with a different durable Settings outcome.'
              );
            }
            return {
              kind:
                existing.outcome === 'cancelled'
                  ? ('cancelled' as const)
                  : ('already_settled' as const),
              outcome: existing,
              snapshot: await makeSnapshot(
                current,
                command.requestId,
                command.commandId,
                command.correlationIds,
                authority
              ),
            };
          }
          if (
            current.journal !== null ||
            current.generation >= Number.MAX_SAFE_INTEGER ||
            !command.correlationIds.includes(command.requestId)
          ) {
            return { kind: 'outcome_unknown' as const };
          }
          const outcome: SettingsMutationOutcomeV1 = {
            version: 1,
            dataEpoch: command.dataEpoch,
            mutationId: command.mutationId,
            commandDigest: command.commandDigest,
            previousDigest: command.previousDigest,
            candidateDigest: command.candidateDigest,
            baseRevision: command.baseRevision,
            baseGeneration: command.baseGeneration,
            settledRevision: current.revision,
            settledGeneration: current.generation + 1,
            correlationIds: normalizeCorrelationIds(command.correlationIds),
            outcome: 'cancelled',
          };
          const settled = await writeExact(
            current,
            {
              ...cloneSettingsEnvelope(current),
              generation: current.generation + 1,
              outcomes: [...current.outcomes, outcome],
            },
            authority
          );
          return {
            kind: 'cancelled' as const,
            outcome,
            snapshot: await makeSnapshot(
              settled,
              command.requestId,
              command.commandId,
              command.correlationIds,
              authority
            ),
          };
        }
      );
    },

    reconcile(command) {
      return dependencies.gate.runExclusive(
        { dataEpoch: command.dataEpoch, operationId: command.requestId, purpose: 'reconcile' },
        async (capability) => {
          const authority: SettingsWriteAuthority = command.storageReservationProof
            ? {
                kind: 'reservation',
                capability,
                reservationProof: command.storageReservationProof,
              }
            : { kind: 'system', capability };
          await assertAuthority(authority);
          let current = await recoverToSettled(await readEnvelope(command.dataEpoch), authority);
          if (current === null) {
            return { kind: 'outcome_unknown' as const };
          }
          current = await ensureAlarmAligned(current, authority);
          const existing = current.outcomes.find(
            (outcome) => outcome.mutationId === command.mutationId
          );
          if (existing) {
            if (!outcomeMatches(existing, command)) {
              throw new SettingsTransactionRepositoryError(
                'invalid_storage',
                'Mutation identity collides with a different durable Settings outcome.'
              );
            }
            return {
              kind: 'settled' as const,
              outcome: existing,
              snapshot: await makeSnapshot(
                current,
                command.requestId,
                command.commandId,
                command.correlationIds,
                authority
              ),
            };
          }

          if (
            (await dependencies.admissionEvidence.classify(command)) !== 'provably_never_admitted'
          ) {
            return {
              kind: 'outcome_missing' as const,
              snapshot: await makeSnapshot(
                current,
                command.requestId,
                command.commandId,
                command.correlationIds,
                authority
              ),
            };
          }
          if (current.generation >= Number.MAX_SAFE_INTEGER) {
            return { kind: 'outcome_unknown' as const };
          }
          const outcome: SettingsMutationOutcomeV1 = {
            version: 1,
            dataEpoch: command.dataEpoch,
            mutationId: command.mutationId,
            commandDigest: command.commandDigest,
            previousDigest: command.previousDigest,
            candidateDigest: command.candidateDigest,
            baseRevision: command.baseRevision,
            baseGeneration: command.baseGeneration,
            settledRevision: current.revision,
            settledGeneration: current.generation + 1,
            correlationIds: [...command.correlationIds],
            outcome: 'not_committed',
          };
          const settled = await writeExact(
            current,
            {
              ...cloneSettingsEnvelope(current),
              generation: current.generation + 1,
              outcomes: [...current.outcomes, outcome],
            },
            authority
          );
          return {
            kind: 'settled' as const,
            outcome,
            snapshot: await makeSnapshot(
              settled,
              command.requestId,
              command.commandId,
              command.correlationIds,
              authority
            ),
          };
        }
      );
    },
  };
}
