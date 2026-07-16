import type { AppSettings } from '../lib/core/types/app-settings';
import {
  isLocalDataResetUuidV4,
  parseLocalDataResetFreshPreflightProof,
  parseLocalDataResetJournal,
  parseLocalDataResetPostClearAuthorityProof,
  parseLocalDataResetPostClearCompletionProof,
  resetRequestIdentitiesAreUnique,
  type LocalDataResetEvent,
  type LocalDataResetFreshPreflightProofV1,
  type LocalDataResetJournalV1,
  type LocalDataResetPostClearAuthorityProofV1,
  type LocalDataResetPostClearCompletionProofV1,
  type LocalDataResetProofExpectation,
} from './local-data-reset.contract';
import {
  cloneSettings,
  commandId as settingsCommandId,
  isStrictSettings,
  parseSettingsEnvelopeV2,
  parseSettledSettingsSnapshot,
  type SettingsEnvelopeV2,
  type SettingsSnapshotV1,
} from './settings-persistence.contract';

export const DATASET_STARTUP_MODEL_VERSION = 1 as const;
export const DATASET_STARTUP_TARGET_DB_VERSION = 6 as const;
export const DATASET_STARTUP_TARGET_DATA_VERSION = 3 as const;
export const DATASET_STARTUP_ERROR_MESSAGE_MAX_CHARS = 500;
export const DATASET_STARTUP_MAX_BOOTSTRAPS_PER_PUBLICATION = 64 as const;

export type DatasetStartupPendingResetRequest = Extract<
  LocalDataResetEvent,
  { type: 'RESET_REQUESTED' }
>;

export type DatasetStartupStage =
  | 'reset_gate'
  | 'reset_preflight'
  | 'versions'
  | 'structure'
  | 'data'
  | 'verification'
  | 'settings_envelope'
  | 'prepared_ledgers'
  | 'settings_recovery'
  | 'admission'
  | 'bootstrap'
  | 'failure_fence';

export type DatasetStartupErrorCode =
  | 'RESET_GATE_READ_FAILED'
  | 'RESET_JOURNAL_INVALID'
  | 'RESET_PREFLIGHT_FAILED'
  | 'OPEN_BLOCKED'
  | 'VERSION_READ_FAILED'
  | 'DOWNGRADE_BLOCKED'
  | 'VERSION_PROTOCOL_INVALID'
  | 'STRUCTURE_MIGRATION_FAILED'
  | 'DATA_MIGRATION_FAILED'
  | 'CRITICAL_VERIFICATION_FAILED'
  | 'CRITICAL_DATA_INVALID'
  | 'SETTINGS_ENVELOPE_FAILED'
  | 'SETTINGS_ENVELOPE_INVALID'
  | 'PREPARED_RECOVERY_FAILED'
  | 'PREPARED_RECOVERY_INVALID'
  | 'SETTINGS_RECOVERY_FAILED'
  | 'SETTINGS_RECOVERY_INVALID'
  | 'ADMISSION_FAILED'
  | 'ADMISSION_INVALID'
  | 'BOOTSTRAP_PUBLISH_FAILED'
  | 'AUTHORITY_FENCE_FAILED'
  | 'PROTOCOL_ERROR';

export interface DatasetStartupErrorV1 {
  version: typeof DATASET_STARTUP_MODEL_VERSION;
  code: DatasetStartupErrorCode;
  stage: DatasetStartupStage;
  message: string;
  retryable: boolean;
  destructiveEffectPerformed: false;
}

export interface DatasetStartupCapacityErrorV1 {
  version: typeof DATASET_STARTUP_MODEL_VERSION;
  code: 'BOOTSTRAP_BATCH_CAPACITY_EXCEEDED';
  stage: 'bootstrap';
  attemptId: string;
  workerEpoch: string;
  requestId: string;
  maxBatchSize: typeof DATASET_STARTUP_MAX_BOOTSTRAPS_PER_PUBLICATION;
  retryable: true;
}

export interface DatasetStartupVersionsV1 {
  version: typeof DATASET_STARTUP_MODEL_VERSION;
  databaseName: 'missionpulse';
  storedDbVersion: number;
  storedDataVersion: number | null;
  targetDbVersion: typeof DATASET_STARTUP_TARGET_DB_VERSION;
  targetDataVersion: typeof DATASET_STARTUP_TARGET_DATA_VERSION;
}

export interface DatasetStructureCommitProofV1 {
  version: typeof DATASET_STARTUP_MODEL_VERSION;
  databaseName: 'missionpulse';
  fromDbVersion: number;
  dbVersion: typeof DATASET_STARTUP_TARGET_DB_VERSION;
  transactionCommitted: true;
  destructiveRepairPerformed: false;
}

export interface DatasetDataCommitProofV1 {
  version: typeof DATASET_STARTUP_MODEL_VERSION;
  fromDataVersion: number | null;
  appDataVersion: typeof DATASET_STARTUP_TARGET_DATA_VERSION;
  transactionCommitted: true;
  markerReadBack: typeof DATASET_STARTUP_TARGET_DATA_VERSION;
  destructiveRepairPerformed: false;
}

export interface DatasetCriticalVerificationProofV1 {
  version: typeof DATASET_STARTUP_MODEL_VERSION;
  markerReadBack: typeof DATASET_STARTUP_TARGET_DATA_VERSION;
  criticalRecordsValid: true;
  authority: LocalDataResetPostClearAuthorityProofV1;
}

export type DatasetSettingsDecodePolicy = 'allow_migration' | 'v2_only';

export interface DatasetSettingsEnvelopeWrappedProofV1 {
  version: typeof DATASET_STARTUP_MODEL_VERSION;
  dataEpoch: string;
  markerReadBack: typeof DATASET_STARTUP_TARGET_DATA_VERSION;
  decodePolicy: DatasetSettingsDecodePolicy;
  readBack: true;
  envelope: SettingsEnvelopeV2;
}

export interface DatasetPreparedLedgersRecoveredProofV1 {
  version: typeof DATASET_STARTUP_MODEL_VERSION;
  workerEpoch: string;
  dataEpoch: string;
  recoveryCompleted: true;
  olderWorkerPreparedRemaining: 0;
}

export interface StartupSettingsRecoveredV1 {
  type: 'SETTINGS_RECOVERY_PASSED';
  attemptId: string;
  workerEpoch: string;
  dataEpoch: string;
  requestId: string;
  commandId: string;
  snapshot: SettingsSnapshotV1;
}

export interface DatasetAdmissionOpenedProofV1 {
  version: typeof DATASET_STARTUP_MODEL_VERSION;
  attemptId: string;
  workerEpoch: string;
  dataEpoch: string;
  authorityRevision: number;
  admission: 'open';
  proofId: string;
}

export interface DatasetStartupFailureFenceProofV1 {
  version: typeof DATASET_STARTUP_MODEL_VERSION;
  attemptId: string;
  workerEpoch: string;
  dataEpoch: string;
  admissionProofId: string;
  previousAuthorityRevision: number;
  authorityRevision: number;
  admission: 'closed';
  activeLeaseCount: 0;
  allLeasesRevoked: true;
}

export interface LocalDatasetBootstrapV1 {
  version: typeof DATASET_STARTUP_MODEL_VERSION;
  requestId: string;
  workerEpoch: string;
  dataEpoch: string;
}

export interface DatasetBootstrapPublicationProofV1 {
  version: typeof DATASET_STARTUP_MODEL_VERSION;
  attemptId: string;
  workerEpoch: string;
  dataEpoch: string;
  admissionProofId: string;
  bootstraps: LocalDatasetBootstrapV1[];
}

export type DatasetStartupResetTransferSource =
  | 'journal_at_boot'
  | 'pending_reset_fresh'
  | 'pending_reset_completed'
  | 'active_reset_preemption'
  | 'settings_reset_in_progress';

export interface DatasetStartupResetTransferV1 {
  version: typeof DATASET_STARTUP_MODEL_VERSION;
  source: DatasetStartupResetTransferSource;
  resetId: string;
  journal: LocalDataResetJournalV1 | null;
  proof: LocalDataResetFreshPreflightProofV1 | LocalDataResetPostClearCompletionProofV1 | null;
}

interface AttemptScopedCommand {
  version: typeof DATASET_STARTUP_MODEL_VERSION;
  attemptId: string;
  workerEpoch: string;
  commandId: string;
  allowsDatabaseOpen: boolean;
  destructiveRepairAllowed: false;
}

export type DatasetStartupCommand =
  | (AttemptScopedCommand & {
      type: 'READ_RESET_GATE';
      stage: 'reset_gate';
      allowsDatabaseOpen: false;
    })
  | (AttemptScopedCommand & {
      type: 'PREFLIGHT_RESET_REQUEST';
      stage: 'reset_preflight';
      allowsDatabaseOpen: false;
      request: DatasetStartupPendingResetRequest;
    })
  | (AttemptScopedCommand & {
      type: 'READ_VERSIONS';
      stage: 'versions';
      allowsDatabaseOpen: true;
      targetDbVersion: typeof DATASET_STARTUP_TARGET_DB_VERSION;
      targetDataVersion: typeof DATASET_STARTUP_TARGET_DATA_VERSION;
    })
  | (AttemptScopedCommand & {
      type: 'UPGRADE_STRUCTURE';
      stage: 'structure';
      allowsDatabaseOpen: true;
      fromDbVersion: number;
      toDbVersion: typeof DATASET_STARTUP_TARGET_DB_VERSION;
    })
  | (AttemptScopedCommand & {
      type: 'MIGRATE_DATA';
      stage: 'data';
      allowsDatabaseOpen: true;
      fromDataVersion: number | null;
      toDataVersion: typeof DATASET_STARTUP_TARGET_DATA_VERSION;
    })
  | (AttemptScopedCommand & {
      type: 'VERIFY_CRITICAL_AND_EPOCH';
      stage: 'verification';
      allowsDatabaseOpen: true;
    })
  | (AttemptScopedCommand & {
      type: 'WRAP_SETTINGS_ENVELOPE';
      stage: 'settings_envelope';
      allowsDatabaseOpen: false;
      dataEpoch: string;
      decodePolicy: DatasetSettingsDecodePolicy;
    })
  | (AttemptScopedCommand & {
      type: 'RECOVER_PREPARED_LEDGERS';
      stage: 'prepared_ledgers';
      allowsDatabaseOpen: true;
      dataEpoch: string;
    })
  | (AttemptScopedCommand & {
      type: 'RECOVER_SETTINGS_AND_ALARM';
      stage: 'settings_recovery';
      allowsDatabaseOpen: false;
      dataEpoch: string;
      requestId: string;
    })
  | (AttemptScopedCommand & {
      type: 'OPEN_EPOCH_ADMISSION';
      stage: 'admission';
      allowsDatabaseOpen: false;
      dataEpoch: string;
    })
  | (AttemptScopedCommand & {
      type: 'PUBLISH_BOOTSTRAPS';
      stage: 'bootstrap';
      allowsDatabaseOpen: false;
      dataEpoch: string;
      admissionProofId: string;
      requestIds: string[];
    })
  | (AttemptScopedCommand & {
      type: 'FENCE_STARTUP_FAILURE';
      stage: 'failure_fence';
      allowsDatabaseOpen: false;
      dataEpoch: string;
      admissionProofId: string;
      openedAuthorityRevision: number;
      failure: DatasetStartupErrorV1;
    })
  | {
      version: typeof DATASET_STARTUP_MODEL_VERSION;
      type: 'TRANSFER_RESET_OWNERSHIP';
      attemptId: string;
      workerEpoch: string;
      reset: DatasetStartupResetTransferV1;
    }
  | {
      version: typeof DATASET_STARTUP_MODEL_VERSION;
      type: 'REPORT_FAILURE';
      attemptId: string;
      workerEpoch: string;
      error: DatasetStartupErrorV1;
    }
  | {
      version: typeof DATASET_STARTUP_MODEL_VERSION;
      type: 'REPORT_DOWNGRADE';
      attemptId: string;
      workerEpoch: string;
      error: DatasetStartupErrorV1;
      versions: DatasetStartupVersionsV1;
    };

export interface DatasetStartupInput {
  workerEpoch: string;
  defaultSettings: AppSettings;
  includedConnectorIds: string[];
}

export interface DatasetStartupContext {
  workerEpoch: string;
  defaultSettings: AppSettings;
  includedConnectorIds: string[];
  attemptId: string | null;
  pendingRequestIds: string[];
  settingsRecoveryRequestId: string | null;
  retryCount: number;
  expectedStage: DatasetStartupStage | null;
  command: DatasetStartupCommand | null;
  pendingReset: DatasetStartupPendingResetRequest | null;
  versions: DatasetStartupVersionsV1 | null;
  entryDataVersion: number | null;
  structureProof: DatasetStructureCommitProofV1 | null;
  dataProof: DatasetDataCommitProofV1 | null;
  verificationProof: DatasetCriticalVerificationProofV1 | null;
  dataEpoch: string | null;
  settingsEnvelopeProof: DatasetSettingsEnvelopeWrappedProofV1 | null;
  preparedProof: DatasetPreparedLedgersRecoveredProofV1 | null;
  settingsRecoveryProof: StartupSettingsRecoveredV1 | null;
  admissionProof: DatasetAdmissionOpenedProofV1 | null;
  lastPublicationProof: DatasetBootstrapPublicationProofV1 | null;
  failureFenceProof: DatasetStartupFailureFenceProofV1 | null;
  fenceError: DatasetStartupErrorV1 | null;
  resetTransfer: DatasetStartupResetTransferV1 | null;
  error: DatasetStartupErrorV1 | null;
}

interface AttemptEvent {
  attemptId: string;
  workerEpoch: string;
}

interface CommandResultEvent extends AttemptEvent {
  commandId: string;
}

export type DatasetStartupEvent =
  | (AttemptEvent & {
      type: 'START';
      requestId: string;
      settingsRecoveryRequestId: string;
    })
  | (CommandResultEvent & { type: 'RESET_GATE_CLEARED' })
  | (CommandResultEvent & {
      type: 'RESET_REQUEST_PENDING';
      request: DatasetStartupPendingResetRequest;
    })
  | (CommandResultEvent & {
      type: 'RESET_JOURNAL_FOUND';
      journal: LocalDataResetJournalV1;
    })
  | (CommandResultEvent & {
      type: 'RESET_PREFLIGHT_FRESH';
      proof: LocalDataResetFreshPreflightProofV1;
    })
  | (CommandResultEvent & {
      type: 'RESET_COMPLETION_RECOGNIZED';
      proof: LocalDataResetPostClearCompletionProofV1;
    })
  | (CommandResultEvent & { type: 'VERSIONS_READ'; versions: DatasetStartupVersionsV1 })
  | (CommandResultEvent & {
      type: 'STRUCTURE_COMMITTED';
      proof: DatasetStructureCommitProofV1;
    })
  | (CommandResultEvent & { type: 'DATA_COMMITTED'; proof: DatasetDataCommitProofV1 })
  | (CommandResultEvent & {
      type: 'VERIFICATION_PASSED';
      proof: DatasetCriticalVerificationProofV1;
    })
  | (CommandResultEvent & {
      type: 'SETTINGS_ENVELOPE_WRAPPED';
      proof: DatasetSettingsEnvelopeWrappedProofV1;
    })
  | (CommandResultEvent & {
      type: 'PREPARED_RECOVERED';
      proof: DatasetPreparedLedgersRecoveredProofV1;
    })
  | StartupSettingsRecoveredV1
  | (CommandResultEvent & {
      type: 'SETTINGS_RESET_IN_PROGRESS';
      journal: LocalDataResetJournalV1;
    })
  | (CommandResultEvent & {
      type: 'ADMISSION_OPENED';
      proof: DatasetAdmissionOpenedProofV1;
    })
  | (CommandResultEvent & {
      type: 'BOOTSTRAP_PUBLISHED';
      proof: DatasetBootstrapPublicationProofV1;
    })
  | (CommandResultEvent & {
      type: 'FAILURE_FENCED';
      proof: DatasetStartupFailureFenceProofV1;
    })
  | (AttemptEvent & {
      type: 'STEP_FAILED';
      commandId: string;
      error: DatasetStartupErrorV1;
    })
  | (AttemptEvent & {
      type: 'RETRY';
      requestId: string;
      settingsRecoveryRequestId: string;
    })
  | (AttemptEvent & {
      type: 'RESET_PREEMPTED';
      resetId: string;
      journal: LocalDataResetJournalV1 | null;
    });

const STARTUP_STAGES = [
  'reset_gate',
  'reset_preflight',
  'versions',
  'structure',
  'data',
  'verification',
  'settings_envelope',
  'prepared_ledgers',
  'settings_recovery',
  'admission',
  'bootstrap',
  'failure_fence',
] as const satisfies readonly DatasetStartupStage[];

const STARTUP_ERROR_CODES = [
  'RESET_GATE_READ_FAILED',
  'RESET_JOURNAL_INVALID',
  'RESET_PREFLIGHT_FAILED',
  'OPEN_BLOCKED',
  'VERSION_READ_FAILED',
  'DOWNGRADE_BLOCKED',
  'VERSION_PROTOCOL_INVALID',
  'STRUCTURE_MIGRATION_FAILED',
  'DATA_MIGRATION_FAILED',
  'CRITICAL_VERIFICATION_FAILED',
  'CRITICAL_DATA_INVALID',
  'SETTINGS_ENVELOPE_FAILED',
  'SETTINGS_ENVELOPE_INVALID',
  'PREPARED_RECOVERY_FAILED',
  'PREPARED_RECOVERY_INVALID',
  'SETTINGS_RECOVERY_FAILED',
  'SETTINGS_RECOVERY_INVALID',
  'ADMISSION_FAILED',
  'ADMISSION_INVALID',
  'BOOTSTRAP_PUBLISH_FAILED',
  'AUTHORITY_FENCE_FAILED',
  'PROTOCOL_ERROR',
] as const satisfies readonly DatasetStartupErrorCode[];

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
    if (new Set(expectedKeys).size !== expectedKeys.length) {
      return null;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== expectedKeys.length ||
      ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) {
      return null;
    }
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        return null;
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function readExactDataArray(value: unknown, maxLength: number): unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      return null;
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      lengthDescriptor === undefined ||
      lengthDescriptor.enumerable !== false ||
      lengthDescriptor.configurable !== false ||
      !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')
    ) {
      return null;
    }
    const length = lengthDescriptor.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > maxLength) {
      return null;
    }
    const expectedKeys = [...Array.from({ length }, (_, index) => String(index)), 'length'];
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== expectedKeys.length ||
      ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) {
      return null;
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        return null;
      }
      snapshot.push(descriptor.value);
    }
    return snapshot;
  } catch {
    return null;
  }
}

function eventType(value: unknown): string | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, 'type');
    return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? typeof descriptor.value === 'string'
        ? descriptor.value
        : null
      : null;
  } catch {
    return null;
  }
}

function isStartupStage(value: unknown): value is DatasetStartupStage {
  return typeof value === 'string' && STARTUP_STAGES.includes(value as DatasetStartupStage);
}

function isStartupErrorCode(value: unknown): value is DatasetStartupErrorCode {
  return (
    typeof value === 'string' && STARTUP_ERROR_CODES.includes(value as DatasetStartupErrorCode)
  );
}

function isBoundedMessage(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= DATASET_STARTUP_ERROR_MESSAGE_MAX_CHARS
  );
}

export function datasetStartupCommandId(stage: DatasetStartupStage, attemptId: string): string {
  return `dataset-startup/${stage}/${attemptId}`;
}

export function datasetStartupInputIsValid(input: DatasetStartupInput): boolean {
  const ids = input.includedConnectorIds;
  return (
    isLocalDataResetUuidV4(input.workerEpoch) &&
    ids.length > 0 &&
    new Set(ids).size === ids.length &&
    [...ids].sort().every((id, index) => id === ids[index]) &&
    isStrictSettings(input.defaultSettings, ids)
  );
}

export function initialDatasetStartupContext(input: DatasetStartupInput): DatasetStartupContext {
  return {
    workerEpoch: input.workerEpoch,
    defaultSettings: cloneSettings(input.defaultSettings),
    includedConnectorIds: [...input.includedConnectorIds],
    attemptId: null,
    pendingRequestIds: [],
    settingsRecoveryRequestId: null,
    retryCount: 0,
    expectedStage: null,
    command: null,
    pendingReset: null,
    versions: null,
    entryDataVersion: null,
    structureProof: null,
    dataProof: null,
    verificationProof: null,
    dataEpoch: null,
    settingsEnvelopeProof: null,
    preparedProof: null,
    settingsRecoveryProof: null,
    admissionProof: null,
    lastPublicationProof: null,
    failureFenceProof: null,
    fenceError: null,
    resetTransfer: null,
    error: null,
  };
}

/**
 * Returns the typed, non-mutating backpressure result for a fresh START that
 * would exceed the one bounded publication batch. Duplicates already pending
 * remain idempotent and do not consume another slot.
 */
export function datasetStartupCapacityError(
  context: DatasetStartupContext,
  event: DatasetStartupEvent
): DatasetStartupCapacityErrorV1 | null {
  if (
    event.type !== 'START' ||
    context.error !== null ||
    context.attemptId === null ||
    event.attemptId !== context.attemptId ||
    event.workerEpoch !== context.workerEpoch ||
    event.settingsRecoveryRequestId !== context.settingsRecoveryRequestId ||
    context.pendingRequestIds.includes(event.requestId) ||
    context.pendingRequestIds.length < DATASET_STARTUP_MAX_BOOTSTRAPS_PER_PUBLICATION
  ) {
    return null;
  }
  return {
    version: DATASET_STARTUP_MODEL_VERSION,
    code: 'BOOTSTRAP_BATCH_CAPACITY_EXCEEDED',
    stage: 'bootstrap',
    attemptId: context.attemptId,
    workerEpoch: context.workerEpoch,
    requestId: event.requestId,
    maxBatchSize: DATASET_STARTUP_MAX_BOOTSTRAPS_PER_PUBLICATION,
    retryable: true,
  };
}

export function expectedSettingsDecodePolicy(
  context: DatasetStartupContext
): DatasetSettingsDecodePolicy {
  return context.entryDataVersion === DATASET_STARTUP_TARGET_DATA_VERSION
    ? 'v2_only'
    : 'allow_migration';
}

export function parseDatasetStartupError(value: unknown): DatasetStartupErrorV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'code',
    'stage',
    'message',
    'retryable',
    'destructiveEffectPerformed',
  ]);
  if (
    record === null ||
    record.version !== DATASET_STARTUP_MODEL_VERSION ||
    !isStartupErrorCode(record.code) ||
    !isStartupStage(record.stage) ||
    !isBoundedMessage(record.message) ||
    typeof record.retryable !== 'boolean' ||
    record.destructiveEffectPerformed !== false
  ) {
    return null;
  }
  const error: DatasetStartupErrorV1 = {
    version: DATASET_STARTUP_MODEL_VERSION,
    code: record.code,
    stage: record.stage,
    message: record.message,
    retryable: record.retryable,
    destructiveEffectPerformed: false,
  };
  return datasetStartupErrorContractIsValid(error) ? error : null;
}

export function datasetStartupErrorContractIsValid(error: DatasetStartupErrorV1): boolean {
  switch (error.code) {
    case 'RESET_GATE_READ_FAILED':
      return error.stage === 'reset_gate' && error.retryable;
    case 'RESET_JOURNAL_INVALID':
      return error.stage === 'reset_gate' && !error.retryable;
    case 'RESET_PREFLIGHT_FAILED':
      return error.stage === 'reset_preflight' && error.retryable;
    case 'OPEN_BLOCKED':
      return (
        ['versions', 'structure', 'data', 'verification'].includes(error.stage) && error.retryable
      );
    case 'VERSION_READ_FAILED':
      return error.stage === 'versions' && error.retryable;
    case 'DOWNGRADE_BLOCKED':
      return error.stage === 'versions' && !error.retryable;
    case 'VERSION_PROTOCOL_INVALID':
      return error.stage === 'versions' && !error.retryable;
    case 'STRUCTURE_MIGRATION_FAILED':
      return error.stage === 'structure' && error.retryable;
    case 'DATA_MIGRATION_FAILED':
      return error.stage === 'data' && error.retryable;
    case 'CRITICAL_VERIFICATION_FAILED':
      return error.stage === 'verification' && error.retryable;
    case 'CRITICAL_DATA_INVALID':
      return error.stage === 'verification' && !error.retryable;
    case 'SETTINGS_ENVELOPE_FAILED':
      return error.stage === 'settings_envelope' && error.retryable;
    case 'SETTINGS_ENVELOPE_INVALID':
      return error.stage === 'settings_envelope' && !error.retryable;
    case 'PREPARED_RECOVERY_FAILED':
      return error.stage === 'prepared_ledgers' && error.retryable;
    case 'PREPARED_RECOVERY_INVALID':
      return error.stage === 'prepared_ledgers' && !error.retryable;
    case 'SETTINGS_RECOVERY_FAILED':
      return error.stage === 'settings_recovery' && error.retryable;
    case 'SETTINGS_RECOVERY_INVALID':
      return error.stage === 'settings_recovery' && !error.retryable;
    case 'ADMISSION_FAILED':
      return error.stage === 'admission' && error.retryable;
    case 'ADMISSION_INVALID':
      return error.stage === 'admission' && !error.retryable;
    case 'BOOTSTRAP_PUBLISH_FAILED':
      return error.stage === 'bootstrap' && error.retryable;
    case 'AUTHORITY_FENCE_FAILED':
      return error.stage === 'failure_fence' && !error.retryable;
    case 'PROTOCOL_ERROR':
      return !error.retryable;
  }
}

export function parseDatasetStartupVersions(value: unknown): DatasetStartupVersionsV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'databaseName',
    'storedDbVersion',
    'storedDataVersion',
    'targetDbVersion',
    'targetDataVersion',
  ]);
  const dataVersion = record?.storedDataVersion;
  if (
    record === null ||
    record.version !== DATASET_STARTUP_MODEL_VERSION ||
    record.databaseName !== 'missionpulse' ||
    !Number.isSafeInteger(record.storedDbVersion) ||
    Number(record.storedDbVersion) < 0 ||
    (dataVersion !== null && (!Number.isSafeInteger(dataVersion) || Number(dataVersion) < 1)) ||
    record.targetDbVersion !== DATASET_STARTUP_TARGET_DB_VERSION ||
    record.targetDataVersion !== DATASET_STARTUP_TARGET_DATA_VERSION
  ) {
    return null;
  }
  return {
    version: DATASET_STARTUP_MODEL_VERSION,
    databaseName: 'missionpulse',
    storedDbVersion: Number(record.storedDbVersion),
    storedDataVersion: dataVersion === null ? null : Number(dataVersion),
    targetDbVersion: DATASET_STARTUP_TARGET_DB_VERSION,
    targetDataVersion: DATASET_STARTUP_TARGET_DATA_VERSION,
  };
}

export function datasetStartupVersionsAreCoherent(versions: DatasetStartupVersionsV1): boolean {
  if (versions.storedDbVersion === 0) {
    return versions.storedDataVersion === null;
  }
  if (versions.storedDbVersion < DATASET_STARTUP_TARGET_DB_VERSION) {
    return (
      versions.storedDataVersion === null ||
      versions.storedDataVersion < DATASET_STARTUP_TARGET_DATA_VERSION
    );
  }
  return true;
}

export function datasetStartupIsDowngrade(versions: DatasetStartupVersionsV1): boolean {
  return (
    versions.storedDbVersion > DATASET_STARTUP_TARGET_DB_VERSION ||
    (versions.storedDataVersion !== null &&
      versions.storedDataVersion > DATASET_STARTUP_TARGET_DATA_VERSION)
  );
}

export function parseDatasetStructureCommitProof(
  value: unknown,
  fromDbVersion: number
): DatasetStructureCommitProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'databaseName',
    'fromDbVersion',
    'dbVersion',
    'transactionCommitted',
    'destructiveRepairPerformed',
  ]);
  return record !== null &&
    record.version === DATASET_STARTUP_MODEL_VERSION &&
    record.databaseName === 'missionpulse' &&
    record.fromDbVersion === fromDbVersion &&
    record.dbVersion === DATASET_STARTUP_TARGET_DB_VERSION &&
    record.transactionCommitted === true &&
    record.destructiveRepairPerformed === false
    ? {
        version: DATASET_STARTUP_MODEL_VERSION,
        databaseName: 'missionpulse',
        fromDbVersion,
        dbVersion: DATASET_STARTUP_TARGET_DB_VERSION,
        transactionCommitted: true,
        destructiveRepairPerformed: false,
      }
    : null;
}

export function parseDatasetDataCommitProof(
  value: unknown,
  fromDataVersion: number | null
): DatasetDataCommitProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'fromDataVersion',
    'appDataVersion',
    'transactionCommitted',
    'markerReadBack',
    'destructiveRepairPerformed',
  ]);
  return record !== null &&
    record.version === DATASET_STARTUP_MODEL_VERSION &&
    record.fromDataVersion === fromDataVersion &&
    record.appDataVersion === DATASET_STARTUP_TARGET_DATA_VERSION &&
    record.transactionCommitted === true &&
    record.markerReadBack === DATASET_STARTUP_TARGET_DATA_VERSION &&
    record.destructiveRepairPerformed === false
    ? {
        version: DATASET_STARTUP_MODEL_VERSION,
        fromDataVersion,
        appDataVersion: DATASET_STARTUP_TARGET_DATA_VERSION,
        transactionCommitted: true,
        markerReadBack: DATASET_STARTUP_TARGET_DATA_VERSION,
        destructiveRepairPerformed: false,
      }
    : null;
}

export function parseDatasetCriticalVerificationProof(
  value: unknown
): DatasetCriticalVerificationProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'markerReadBack',
    'criticalRecordsValid',
    'authority',
  ]);
  if (
    record === null ||
    record.version !== DATASET_STARTUP_MODEL_VERSION ||
    record.markerReadBack !== DATASET_STARTUP_TARGET_DATA_VERSION ||
    record.criticalRecordsValid !== true
  ) {
    return null;
  }
  const authorityRecord = readExactDataRecord(record.authority, [
    'version',
    'databaseName',
    'dbVersion',
    'appDataVersion',
    'schemaVerified',
    'dataEpoch',
    'trackingMeta',
  ]);
  if (authorityRecord === null || !isLocalDataResetUuidV4(authorityRecord.dataEpoch)) {
    return null;
  }
  const authority = parseLocalDataResetPostClearAuthorityProof(
    record.authority,
    authorityRecord.dataEpoch
  );
  return authority === null
    ? null
    : {
        version: DATASET_STARTUP_MODEL_VERSION,
        markerReadBack: DATASET_STARTUP_TARGET_DATA_VERSION,
        criticalRecordsValid: true,
        authority,
      };
}

export function parseDatasetSettingsEnvelopeWrappedProof(
  value: unknown,
  context: DatasetStartupContext
): DatasetSettingsEnvelopeWrappedProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'dataEpoch',
    'markerReadBack',
    'decodePolicy',
    'readBack',
    'envelope',
  ]);
  if (
    record === null ||
    context.dataEpoch === null ||
    record.version !== DATASET_STARTUP_MODEL_VERSION ||
    record.dataEpoch !== context.dataEpoch ||
    record.markerReadBack !== DATASET_STARTUP_TARGET_DATA_VERSION ||
    record.decodePolicy !== expectedSettingsDecodePolicy(context) ||
    record.readBack !== true
  ) {
    return null;
  }
  const envelope = parseSettingsEnvelopeV2(
    record.envelope,
    context.dataEpoch,
    context.includedConnectorIds
  );
  return envelope === null
    ? null
    : {
        version: DATASET_STARTUP_MODEL_VERSION,
        dataEpoch: context.dataEpoch,
        markerReadBack: DATASET_STARTUP_TARGET_DATA_VERSION,
        decodePolicy: expectedSettingsDecodePolicy(context),
        readBack: true,
        envelope,
      };
}

export function parseDatasetPreparedLedgersRecoveredProof(
  value: unknown,
  context: DatasetStartupContext
): DatasetPreparedLedgersRecoveredProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'workerEpoch',
    'dataEpoch',
    'recoveryCompleted',
    'olderWorkerPreparedRemaining',
  ]);
  return record !== null &&
    context.dataEpoch !== null &&
    record.version === DATASET_STARTUP_MODEL_VERSION &&
    record.workerEpoch === context.workerEpoch &&
    record.dataEpoch === context.dataEpoch &&
    record.recoveryCompleted === true &&
    record.olderWorkerPreparedRemaining === 0
    ? {
        version: DATASET_STARTUP_MODEL_VERSION,
        workerEpoch: context.workerEpoch,
        dataEpoch: context.dataEpoch,
        recoveryCompleted: true,
        olderWorkerPreparedRemaining: 0,
      }
    : null;
}

export function parseStartupSettingsRecovered(
  value: unknown,
  context: DatasetStartupContext
): StartupSettingsRecoveredV1 | null {
  const record = readExactDataRecord(value, [
    'type',
    'attemptId',
    'workerEpoch',
    'dataEpoch',
    'requestId',
    'commandId',
    'snapshot',
  ]);
  if (
    record === null ||
    context.attemptId === null ||
    context.dataEpoch === null ||
    context.settingsRecoveryRequestId === null ||
    record.type !== 'SETTINGS_RECOVERY_PASSED' ||
    record.attemptId !== context.attemptId ||
    record.workerEpoch !== context.workerEpoch ||
    record.dataEpoch !== context.dataEpoch ||
    record.requestId !== context.settingsRecoveryRequestId ||
    record.commandId !== settingsCommandId('recover', context.settingsRecoveryRequestId)
  ) {
    return null;
  }
  const snapshot = parseSettledSettingsSnapshot(
    record.snapshot,
    context.dataEpoch,
    context.includedConnectorIds
  );
  if (
    snapshot === null ||
    snapshot.requestId !== record.requestId ||
    snapshot.commandId !== record.commandId
  ) {
    return null;
  }
  return {
    type: 'SETTINGS_RECOVERY_PASSED',
    attemptId: context.attemptId,
    workerEpoch: context.workerEpoch,
    dataEpoch: context.dataEpoch,
    requestId: context.settingsRecoveryRequestId,
    commandId: settingsCommandId('recover', context.settingsRecoveryRequestId),
    snapshot,
  };
}

export function parseDatasetAdmissionOpenedProof(
  value: unknown,
  context: DatasetStartupContext
): DatasetAdmissionOpenedProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'attemptId',
    'workerEpoch',
    'dataEpoch',
    'authorityRevision',
    'admission',
    'proofId',
  ]);
  return record !== null &&
    context.attemptId !== null &&
    context.dataEpoch !== null &&
    record.version === DATASET_STARTUP_MODEL_VERSION &&
    record.attemptId === context.attemptId &&
    record.workerEpoch === context.workerEpoch &&
    record.dataEpoch === context.dataEpoch &&
    Number.isSafeInteger(record.authorityRevision) &&
    Number(record.authorityRevision) >= 0 &&
    record.admission === 'open' &&
    isLocalDataResetUuidV4(record.proofId)
    ? {
        version: DATASET_STARTUP_MODEL_VERSION,
        attemptId: context.attemptId,
        workerEpoch: context.workerEpoch,
        dataEpoch: context.dataEpoch,
        authorityRevision: Number(record.authorityRevision),
        admission: 'open',
        proofId: record.proofId,
      }
    : null;
}

export function parseDatasetStartupFailureFenceProof(
  value: unknown,
  context: DatasetStartupContext
): DatasetStartupFailureFenceProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'attemptId',
    'workerEpoch',
    'dataEpoch',
    'admissionProofId',
    'previousAuthorityRevision',
    'authorityRevision',
    'admission',
    'activeLeaseCount',
    'allLeasesRevoked',
  ]);
  const admissionProof = context.admissionProof;
  if (
    record === null ||
    context.attemptId === null ||
    context.dataEpoch === null ||
    admissionProof === null ||
    record.version !== DATASET_STARTUP_MODEL_VERSION ||
    record.attemptId !== context.attemptId ||
    record.workerEpoch !== context.workerEpoch ||
    record.dataEpoch !== context.dataEpoch ||
    record.admissionProofId !== admissionProof.proofId ||
    record.previousAuthorityRevision !== admissionProof.authorityRevision ||
    !Number.isSafeInteger(record.authorityRevision) ||
    Number(record.authorityRevision) <= admissionProof.authorityRevision ||
    record.admission !== 'closed' ||
    record.activeLeaseCount !== 0 ||
    record.allLeasesRevoked !== true
  ) {
    return null;
  }
  return {
    version: DATASET_STARTUP_MODEL_VERSION,
    attemptId: context.attemptId,
    workerEpoch: context.workerEpoch,
    dataEpoch: context.dataEpoch,
    admissionProofId: admissionProof.proofId,
    previousAuthorityRevision: admissionProof.authorityRevision,
    authorityRevision: Number(record.authorityRevision),
    admission: 'closed',
    activeLeaseCount: 0,
    allLeasesRevoked: true,
  };
}

function parseBootstrap(
  value: unknown,
  requestId: string,
  workerEpoch: string,
  dataEpoch: string
): LocalDatasetBootstrapV1 | null {
  const record = readExactDataRecord(value, ['version', 'requestId', 'workerEpoch', 'dataEpoch']);
  return record !== null &&
    record.version === DATASET_STARTUP_MODEL_VERSION &&
    record.requestId === requestId &&
    record.workerEpoch === workerEpoch &&
    record.dataEpoch === dataEpoch
    ? {
        version: DATASET_STARTUP_MODEL_VERSION,
        requestId,
        workerEpoch,
        dataEpoch,
      }
    : null;
}

export function parseDatasetBootstrapPublicationProof(
  value: unknown,
  context: DatasetStartupContext
): DatasetBootstrapPublicationProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'attemptId',
    'workerEpoch',
    'dataEpoch',
    'admissionProofId',
    'bootstraps',
  ]);
  const bootstraps =
    record === null
      ? null
      : readExactDataArray(
          record.bootstraps,
          Math.min(context.pendingRequestIds.length, DATASET_STARTUP_MAX_BOOTSTRAPS_PER_PUBLICATION)
        );
  if (
    record === null ||
    bootstraps === null ||
    context.attemptId === null ||
    context.dataEpoch === null ||
    context.admissionProof === null ||
    record.version !== DATASET_STARTUP_MODEL_VERSION ||
    record.attemptId !== context.attemptId ||
    record.workerEpoch !== context.workerEpoch ||
    record.dataEpoch !== context.dataEpoch ||
    record.admissionProofId !== context.admissionProof.proofId ||
    context.pendingRequestIds.length === 0 ||
    context.pendingRequestIds.length > DATASET_STARTUP_MAX_BOOTSTRAPS_PER_PUBLICATION ||
    bootstraps.length !== context.pendingRequestIds.length
  ) {
    return null;
  }
  const dataEpoch = context.dataEpoch;
  const parsed = bootstraps.map((bootstrap, index) =>
    parseBootstrap(bootstrap, context.pendingRequestIds[index], context.workerEpoch, dataEpoch)
  );
  return parsed.some((bootstrap) => bootstrap === null)
    ? null
    : {
        version: DATASET_STARTUP_MODEL_VERSION,
        attemptId: context.attemptId,
        workerEpoch: context.workerEpoch,
        dataEpoch: context.dataEpoch,
        admissionProofId: context.admissionProof.proofId,
        bootstraps: parsed as LocalDatasetBootstrapV1[],
      };
}

function parsePendingResetRequest(value: unknown): DatasetStartupPendingResetRequest | null {
  const record = readExactDataRecord(value, [
    'type',
    'resetId',
    'previousDataEpoch',
    'nextDataEpoch',
    'settingsRecoveryRequestId',
    'settingsBootstrapRequestId',
    'requestedAt',
  ]);
  if (record === null || record.type !== 'RESET_REQUESTED') {
    return null;
  }
  const previousDataEpoch = record.previousDataEpoch;
  if (previousDataEpoch !== null && !isLocalDataResetUuidV4(previousDataEpoch)) {
    return null;
  }
  if (
    !resetRequestIdentitiesAreUnique({
      resetId: record.resetId,
      previousDataEpoch,
      nextDataEpoch: record.nextDataEpoch,
      settingsRecoveryRequestId: record.settingsRecoveryRequestId,
      settingsBootstrapRequestId: record.settingsBootstrapRequestId,
    }) ||
    previousDataEpoch === record.nextDataEpoch ||
    !Number.isSafeInteger(record.requestedAt) ||
    Number(record.requestedAt) < 0
  ) {
    return null;
  }
  return {
    type: 'RESET_REQUESTED',
    resetId: record.resetId as string,
    previousDataEpoch,
    nextDataEpoch: record.nextDataEpoch as string,
    settingsRecoveryRequestId: record.settingsRecoveryRequestId as string,
    settingsBootstrapRequestId: record.settingsBootstrapRequestId as string,
    requestedAt: Number(record.requestedAt),
  };
}

function resetProofExpectation(
  context: DatasetStartupContext
): LocalDataResetProofExpectation | null {
  const request = context.pendingReset;
  return request === null
    ? null
    : {
        resetId: request.resetId,
        previousDataEpoch: request.previousDataEpoch,
        nextDataEpoch: request.nextDataEpoch,
        settingsRecoveryRequestId: request.settingsRecoveryRequestId,
        settingsBootstrapRequestId: request.settingsBootstrapRequestId,
        requestedAt: request.requestedAt,
        defaultSettings: cloneSettings(context.defaultSettings),
        includedConnectorIds: [...context.includedConnectorIds],
      };
}

function commandMatches(context: DatasetStartupContext, record: Record<string, unknown>): boolean {
  const commandId = currentCommandId(context);
  return (
    context.attemptId !== null &&
    commandId !== null &&
    record.attemptId === context.attemptId &&
    record.workerEpoch === context.workerEpoch &&
    record.commandId === commandId
  );
}

function currentCommandId(context: DatasetStartupContext): string | null {
  return context.command !== null && 'commandId' in context.command
    ? context.command.commandId
    : null;
}

function requiredCommandId(context: DatasetStartupContext): string {
  const commandId = currentCommandId(context);
  if (commandId === null) {
    throw new Error('Dataset startup command identity is unavailable');
  }
  return commandId;
}

function requiredAttemptId(context: DatasetStartupContext): string {
  if (context.attemptId === null) {
    throw new Error('Dataset startup attempt identity is unavailable');
  }
  return context.attemptId;
}

function parseAttemptRecord(
  value: unknown,
  type: string,
  extraKeys: readonly string[]
): Record<string, unknown> | null {
  const record = readExactDataRecord(value, ['type', 'attemptId', 'workerEpoch', ...extraKeys]);
  return record !== null && record.type === type ? record : null;
}

function parseCommandRecord(
  value: unknown,
  type: string,
  extraKeys: readonly string[]
): Record<string, unknown> | null {
  return parseAttemptRecord(value, type, ['commandId', ...extraKeys]);
}

function normalizeStart(
  rawEvent: unknown,
  context: DatasetStartupContext,
  type: 'START' | 'RETRY'
): DatasetStartupEvent | null {
  const record = parseAttemptRecord(rawEvent, type, ['requestId', 'settingsRecoveryRequestId']);
  if (
    record === null ||
    !isLocalDataResetUuidV4(record.attemptId) ||
    record.workerEpoch !== context.workerEpoch ||
    !isLocalDataResetUuidV4(record.requestId) ||
    !isLocalDataResetUuidV4(record.settingsRecoveryRequestId) ||
    new Set([
      record.attemptId,
      record.workerEpoch,
      record.requestId,
      record.settingsRecoveryRequestId,
    ]).size !== 4
  ) {
    return null;
  }
  if (
    type === 'START' &&
    context.attemptId !== null &&
    (record.attemptId !== context.attemptId ||
      record.settingsRecoveryRequestId !== context.settingsRecoveryRequestId)
  ) {
    return null;
  }
  if (type === 'RETRY' && context.attemptId === record.attemptId) {
    return null;
  }
  return {
    type,
    attemptId: record.attemptId,
    workerEpoch: context.workerEpoch,
    requestId: record.requestId,
    settingsRecoveryRequestId: record.settingsRecoveryRequestId,
  };
}

/**
 * Strictly parses an untrusted event against the active attempt and command.
 * It never returns the caller object: all admitted events are fresh snapshots.
 */
export function normalizeDatasetStartupEvent(
  rawEvent: unknown,
  context: DatasetStartupContext
): DatasetStartupEvent | null {
  const type = eventType(rawEvent);
  if (type === 'START' || type === 'RETRY') {
    return normalizeStart(rawEvent, context, type);
  }
  if (type === 'SETTINGS_RECOVERY_PASSED') {
    return parseStartupSettingsRecovered(rawEvent, context);
  }

  if (type === 'RESET_PREEMPTED') {
    const record = parseAttemptRecord(rawEvent, type, ['resetId', 'journal']);
    if (
      record === null ||
      record.attemptId !== context.attemptId ||
      record.workerEpoch !== context.workerEpoch ||
      !isLocalDataResetUuidV4(record.resetId)
    ) {
      return null;
    }
    const journal = record.journal === null ? null : parseLocalDataResetJournal(record.journal);
    if (
      (record.journal !== null && journal === null) ||
      (journal !== null && journal.resetId !== record.resetId)
    ) {
      return null;
    }
    return {
      type: 'RESET_PREEMPTED',
      attemptId: requiredAttemptId(context),
      workerEpoch: context.workerEpoch,
      resetId: record.resetId,
      journal,
    };
  }

  if (type === 'RESET_GATE_CLEARED') {
    const record = parseCommandRecord(rawEvent, type, []);
    return record !== null && commandMatches(context, record)
      ? {
          type: 'RESET_GATE_CLEARED',
          attemptId: requiredAttemptId(context),
          workerEpoch: context.workerEpoch,
          commandId: requiredCommandId(context),
        }
      : null;
  }

  if (type === 'RESET_REQUEST_PENDING') {
    const record = parseCommandRecord(rawEvent, type, ['request']);
    const request = record === null ? null : parsePendingResetRequest(record.request);
    return record !== null && request !== null && commandMatches(context, record)
      ? {
          type,
          attemptId: requiredAttemptId(context),
          workerEpoch: context.workerEpoch,
          commandId: requiredCommandId(context),
          request,
        }
      : null;
  }

  if (type === 'RESET_JOURNAL_FOUND' || type === 'SETTINGS_RESET_IN_PROGRESS') {
    const record = parseCommandRecord(rawEvent, type, ['journal']);
    const journal = record === null ? null : parseLocalDataResetJournal(record.journal);
    return record !== null &&
      journal !== null &&
      commandMatches(context, record) &&
      (type !== 'SETTINGS_RESET_IN_PROGRESS' || context.expectedStage === 'settings_recovery')
      ? {
          type,
          attemptId: requiredAttemptId(context),
          workerEpoch: context.workerEpoch,
          commandId: requiredCommandId(context),
          journal,
        }
      : null;
  }

  if (type === 'RESET_PREFLIGHT_FRESH' || type === 'RESET_COMPLETION_RECOGNIZED') {
    const record = parseCommandRecord(rawEvent, type, ['proof']);
    const expected = resetProofExpectation(context);
    if (record === null || expected === null || !commandMatches(context, record)) {
      return null;
    }
    if (type === 'RESET_PREFLIGHT_FRESH') {
      const proof = parseLocalDataResetFreshPreflightProof(record.proof, expected);
      return proof === null
        ? null
        : {
            type,
            attemptId: requiredAttemptId(context),
            workerEpoch: context.workerEpoch,
            commandId: requiredCommandId(context),
            proof,
          };
    }
    const proof = parseLocalDataResetPostClearCompletionProof(record.proof, expected);
    return proof === null
      ? null
      : {
          type,
          attemptId: requiredAttemptId(context),
          workerEpoch: context.workerEpoch,
          commandId: requiredCommandId(context),
          proof,
        };
  }

  if (type === 'VERSIONS_READ') {
    const record = parseCommandRecord(rawEvent, type, ['versions']);
    const versions = record === null ? null : parseDatasetStartupVersions(record.versions);
    return record !== null && versions !== null && commandMatches(context, record)
      ? {
          type,
          attemptId: requiredAttemptId(context),
          workerEpoch: context.workerEpoch,
          commandId: requiredCommandId(context),
          versions,
        }
      : null;
  }

  const proofParsers: Partial<Record<string, (value: unknown) => DatasetStartupEvent | null>> = {
    STRUCTURE_COMMITTED: (value) => {
      const from = context.versions?.storedDbVersion;
      const proof = from === undefined ? null : parseDatasetStructureCommitProof(value, from);
      return proof === null
        ? null
        : {
            type: 'STRUCTURE_COMMITTED',
            attemptId: requiredAttemptId(context),
            workerEpoch: context.workerEpoch,
            commandId: requiredCommandId(context),
            proof,
          };
    },
    DATA_COMMITTED: (value) => {
      const proof = parseDatasetDataCommitProof(value, context.entryDataVersion);
      return proof === null
        ? null
        : {
            type: 'DATA_COMMITTED',
            attemptId: requiredAttemptId(context),
            workerEpoch: context.workerEpoch,
            commandId: requiredCommandId(context),
            proof,
          };
    },
    VERIFICATION_PASSED: (value) => {
      const proof = parseDatasetCriticalVerificationProof(value);
      return proof === null
        ? null
        : {
            type: 'VERIFICATION_PASSED',
            attemptId: requiredAttemptId(context),
            workerEpoch: context.workerEpoch,
            commandId: requiredCommandId(context),
            proof,
          };
    },
    SETTINGS_ENVELOPE_WRAPPED: (value) => {
      const proof = parseDatasetSettingsEnvelopeWrappedProof(value, context);
      return proof === null
        ? null
        : {
            type: 'SETTINGS_ENVELOPE_WRAPPED',
            attemptId: requiredAttemptId(context),
            workerEpoch: context.workerEpoch,
            commandId: requiredCommandId(context),
            proof,
          };
    },
    PREPARED_RECOVERED: (value) => {
      const proof = parseDatasetPreparedLedgersRecoveredProof(value, context);
      return proof === null
        ? null
        : {
            type: 'PREPARED_RECOVERED',
            attemptId: requiredAttemptId(context),
            workerEpoch: context.workerEpoch,
            commandId: requiredCommandId(context),
            proof,
          };
    },
    ADMISSION_OPENED: (value) => {
      const proof = parseDatasetAdmissionOpenedProof(value, context);
      return proof === null
        ? null
        : {
            type: 'ADMISSION_OPENED',
            attemptId: requiredAttemptId(context),
            workerEpoch: context.workerEpoch,
            commandId: requiredCommandId(context),
            proof,
          };
    },
    BOOTSTRAP_PUBLISHED: (value) => {
      const proof = parseDatasetBootstrapPublicationProof(value, context);
      return proof === null
        ? null
        : {
            type: 'BOOTSTRAP_PUBLISHED',
            attemptId: requiredAttemptId(context),
            workerEpoch: context.workerEpoch,
            commandId: requiredCommandId(context),
            proof,
          };
    },
    FAILURE_FENCED: (value) => {
      const proof = parseDatasetStartupFailureFenceProof(value, context);
      return proof === null
        ? null
        : {
            type: 'FAILURE_FENCED',
            attemptId: requiredAttemptId(context),
            workerEpoch: context.workerEpoch,
            commandId: requiredCommandId(context),
            proof,
          };
    },
  };
  const parseProof = type === null ? undefined : proofParsers[type];
  if (type !== null && parseProof !== undefined) {
    const record = parseCommandRecord(rawEvent, type, ['proof']);
    return record !== null && commandMatches(context, record) ? parseProof(record.proof) : null;
  }

  if (type === 'STEP_FAILED') {
    const record = parseCommandRecord(rawEvent, type, ['error']);
    const error = record === null ? null : parseDatasetStartupError(record.error);
    return record !== null &&
      error !== null &&
      commandMatches(context, record) &&
      error.stage === context.expectedStage
      ? {
          type,
          attemptId: requiredAttemptId(context),
          workerEpoch: context.workerEpoch,
          commandId: requiredCommandId(context),
          error,
        }
      : null;
  }

  return null;
}

export function datasetStartupProtocolError(
  stage: DatasetStartupStage,
  message: string
): DatasetStartupErrorV1 {
  return {
    version: DATASET_STARTUP_MODEL_VERSION,
    code: stage === 'versions' ? 'VERSION_PROTOCOL_INVALID' : 'PROTOCOL_ERROR',
    stage,
    message: message.slice(0, DATASET_STARTUP_ERROR_MESSAGE_MAX_CHARS),
    retryable: false,
    destructiveEffectPerformed: false,
  };
}

export function datasetStartupDowngradeError(): DatasetStartupErrorV1 {
  return {
    version: DATASET_STARTUP_MODEL_VERSION,
    code: 'DOWNGRADE_BLOCKED',
    stage: 'versions',
    message: 'La version locale est plus récente que cette extension.',
    retryable: false,
    destructiveEffectPerformed: false,
  };
}
