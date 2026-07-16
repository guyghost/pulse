import type { AppSettings } from '../lib/core/types/app-settings';
import {
  isLocalDataResetUuidV4,
  localDataResetEpochEventMatches,
  type LocalDataResetEpochEventV1,
} from './local-data-reset-epoch.contract';
import {
  cloneSettings,
  isStrictSettings,
  parseAutoScanAlarmProofV1,
  parseSettingsEnvelopeV2,
  settingsDigest,
  type AutoScanAlarmProofV1,
  type SettingsEnvelopeV2,
} from './settings-persistence.contract';

export {
  LOCAL_DATA_RESET_EPOCH_EVENT_VERSION,
  isLocalDataResetUuidV4,
  localDataResetEpochEventMatches,
  parseLocalDataResetEpochEvent,
  type LocalDataResetEpochEventV1,
  type LocalDataResetEpochStage,
} from './local-data-reset-epoch.contract';

export const LOCAL_DATA_RESET_WIRE_VERSION = 1 as const;
export const LOCAL_DATA_RESET_JOURNAL_SCHEMA_VERSION = 1 as const;
export const LOCAL_DATA_RESET_RECEIPT_SCHEMA_VERSION = 1 as const;
export const LOCAL_DATA_RESET_RECEIPT_KEY = 'missionpulse.localDataResetReceipt.v1' as const;
export const LOCAL_DATA_RESET_ERROR_MESSAGE_MAX_CHARS = 500;

export type DatasetEpoch = string;

export type LocalDataResetPhase =
  | 'journaled'
  | 'fenced'
  | 'quiesced'
  | 'handles_closed'
  | 'database_deleted'
  | 'session_cleared'
  | 'local_cleared'
  | 'database_reinitialized'
  | 'settings_aligned'
  | 'committed';

export type LocalDataResetStep =
  | 'preflight'
  | 'journal'
  | 'fence'
  | 'quiescence'
  | 'handles'
  | 'database'
  | 'session'
  | 'local'
  | 'reinitialize'
  | 'settings_recovery'
  | 'readiness_broadcast'
  | 'receipt'
  | 'postcommit_broadcast';

export type LocalDataResetErrorCode =
  | 'PREFLIGHT_FAILED'
  | 'BLOCKED'
  | 'JOURNAL_CORRUPT'
  | 'JOURNAL_FAILED'
  | 'FENCE_FAILED'
  | 'QUIESCENCE_FAILED'
  | 'HANDLE_CLOSE_FAILED'
  | 'DATABASE_FAILED'
  | 'SESSION_CLEAR_FAILED'
  | 'LOCAL_CLEAR_FAILED'
  | 'REINITIALIZE_FAILED'
  | 'SETTINGS_ALIGNMENT_FAILED'
  | 'BROADCAST_FAILED'
  | 'RECEIPT_FAILED'
  | 'PROTOCOL_ERROR';

export type LocalDataResetErrorOrigin = 'workflow_step' | 'boot_fence_reacquisition';

export interface LocalDataResetError {
  code: LocalDataResetErrorCode;
  step: LocalDataResetStep;
  origin: LocalDataResetErrorOrigin;
  message: string;
  retryable: boolean;
}

export interface LocalDataResetJournalV1 {
  schemaVersion: typeof LOCAL_DATA_RESET_JOURNAL_SCHEMA_VERSION;
  resetId: string;
  previousDataEpoch: DatasetEpoch | null;
  nextDataEpoch: DatasetEpoch;
  settingsRecoveryRequestId: string;
  settingsBootstrapRequestId: string;
  phase: LocalDataResetPhase;
  requestedAt: number;
  retryCount: number;
  lastError: LocalDataResetError | null;
}

export interface LocalDataResetReceiptV1 {
  schemaVersion: typeof LOCAL_DATA_RESET_RECEIPT_SCHEMA_VERSION;
  resetId: string;
  previousDataEpoch: DatasetEpoch | null;
  nextDataEpoch: DatasetEpoch;
  settingsRecoveryRequestId: string;
  settingsBootstrapRequestId: string;
  requestedAt: number;
  phase: 'committed';
}

export interface AlignSettingsForResetV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  resetId: string;
  dataEpoch: DatasetEpoch;
  requestId: string;
  commandId: string;
  expectedResetPhase: 'database_reinitialized';
}

export interface ResetOwnedSettingsAlignmentProofV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  resetId: string;
  dataEpoch: DatasetEpoch;
  requestId: string;
  commandId: string;
  resetPhase: 'database_reinitialized';
  envelope: SettingsEnvelopeV2;
  alarmProof: AutoScanAlarmProofV1;
}

export const LOCAL_DATA_RESET_EMPTY_STORES = [
  'connector_status',
  'generated_assets',
  'mission_tracking',
  'missions',
  'profile',
  'quarantine',
  'tracking_mutations',
  'tracking_outbox',
] as const;

export type LocalDataResetEmptyStoreName = (typeof LOCAL_DATA_RESET_EMPTY_STORES)[number];

export interface LocalDataResetEmptyStoreProofV1 {
  name: LocalDataResetEmptyStoreName;
  rowCount: 0;
}

export interface LocalDataResetInitialDatabaseProofV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  databaseName: 'missionpulse';
  dbVersion: 6;
  appDataVersion: 3;
  schemaVerified: true;
  dataEpoch: DatasetEpoch;
  trackingMeta: {
    key: 'tracking_meta';
    schemaVersion: 1;
    dataEpoch: DatasetEpoch;
    collectionRevision: 0;
  };
  stores: LocalDataResetEmptyStoreProofV1[];
}

export interface LocalDataResetPostClearAuthorityProofV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  databaseName: 'missionpulse';
  dbVersion: 6;
  appDataVersion: 3;
  schemaVerified: true;
  dataEpoch: DatasetEpoch;
  trackingMeta: {
    key: 'tracking_meta';
    schemaVersion: 1;
    dataEpoch: DatasetEpoch;
    collectionRevision: number;
  };
}

export interface LocalDataResetPostClearCompletionProofV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  result: 'already_completed';
  resetId: string;
  previousDataEpoch: DatasetEpoch | null;
  nextDataEpoch: DatasetEpoch;
  settingsRecoveryRequestId: string;
  settingsBootstrapRequestId: string;
  requestedAt: number;
  resetJournalAbsent: true;
  canonicalDataEpoch: DatasetEpoch;
  receipt: LocalDataResetReceiptV1;
  authority: LocalDataResetPostClearAuthorityProofV1;
}

export interface LocalDataResetFreshPreflightProofV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  result: 'fresh';
  resetId: string;
  previousDataEpoch: DatasetEpoch | null;
  nextDataEpoch: DatasetEpoch;
  settingsRecoveryRequestId: string;
  settingsBootstrapRequestId: string;
  requestedAt: number;
  resetJournalAbsent: true;
  canonicalDataEpoch: DatasetEpoch | null;
}

export interface LocalDataResetMachineInput {
  defaultSettings: AppSettings;
  includedConnectorIds: string[];
}

export type LocalDataResetRestartClassification =
  | { kind: 'none' }
  | { kind: 'corrupt' }
  | { kind: 'resume'; journal: LocalDataResetJournalV1 }
  | { kind: 'blocked'; journal: LocalDataResetJournalV1 }
  | { kind: 'failed'; journal: LocalDataResetJournalV1 };

export interface LocalDataResetDurableFacts {
  scanQuiescent: boolean;
  trackingQuiescent: boolean;
  migrationQuiescent: boolean;
  outboxQuiescent: boolean;
  databaseHandlesClosed: boolean;
  databaseDeleted: boolean;
  sessionCleared: boolean;
  localCleared: boolean;
  databaseReinitialized: boolean;
  settingsAligned: boolean;
  receiptPersisted: boolean;
  commitCheckpointed: boolean;
}

export type LocalDataResetBroadcastDelivery = 'delivered' | 'no_receiver';
export type LocalDataResetRestartDisposition = 'resume' | 'blocked' | 'failed' | null;

export interface LocalDataResetContext extends LocalDataResetDurableFacts {
  defaultSettings: AppSettings;
  includedConnectorIds: string[];
  resetId: string | null;
  previousDataEpoch: DatasetEpoch | null;
  nextDataEpoch: DatasetEpoch | null;
  settingsRecoveryRequestId: string | null;
  settingsBootstrapRequestId: string | null;
  requestedAt: number | null;
  phase: 'none' | LocalDataResetPhase;
  expectedStep: LocalDataResetStep | null;
  expectedErrorOrigin: LocalDataResetErrorOrigin | null;
  journalCheckpointExpected: boolean;
  journalPersisted: boolean;
  fenceAcquired: boolean;
  restartDisposition: LocalDataResetRestartDisposition;
  readinessDelivery: LocalDataResetBroadcastDelivery | null;
  postCommitDelivery: LocalDataResetBroadcastDelivery | null;
  completionDisposition: 'executed' | 'recognized' | null;
  retryCount: number;
  error: LocalDataResetError | null;
}

export type LocalDataResetEvent =
  | {
      type: 'RESET_REQUESTED';
      resetId: string;
      previousDataEpoch: DatasetEpoch | null;
      nextDataEpoch: DatasetEpoch;
      settingsRecoveryRequestId: string;
      settingsBootstrapRequestId: string;
      requestedAt: number;
    }
  | { type: 'RESET_PREFLIGHT_FRESH'; resetId: string; proof: unknown }
  | { type: 'RESET_COMPLETION_RECOGNIZED'; resetId: string; proof: unknown }
  | { type: 'RESET_JOURNALED'; resetId: string }
  | { type: 'FENCE_ACQUIRED'; resetId: string }
  | { type: 'BOOT_FENCE_ACQUIRED'; resetId: string }
  | { type: 'SCAN_QUIESCED'; resetId: string }
  | { type: 'TRACKING_QUIESCED'; resetId: string }
  | { type: 'MIGRATION_QUIESCED'; resetId: string }
  | { type: 'OUTBOX_QUIESCED'; resetId: string }
  | { type: 'QUIESCENCE_CHECKPOINTED'; resetId: string }
  | { type: 'DB_HANDLES_CLOSED'; resetId: string }
  | { type: 'DATABASE_DELETED'; resetId: string }
  | { type: 'SESSION_CLEARED'; resetId: string }
  | { type: 'LOCAL_CLEARED'; resetId: string }
  | {
      type: 'DATABASE_REINITIALIZED';
      resetId: string;
      dataEpoch: DatasetEpoch;
      databaseProof: unknown;
      settingsEnvelope: unknown;
    }
  | { type: 'SETTINGS_ALIGNED'; resetId: string; proof: unknown }
  | {
      type: 'RESET_READY_BROADCASTED';
      payload: unknown;
      delivery: LocalDataResetBroadcastDelivery;
    }
  | { type: 'RESET_RECEIPT_WRITTEN'; resetId: string; receipt: unknown }
  | { type: 'RESET_COMMIT_CHECKPOINTED'; resetId: string }
  | {
      type: 'RESET_COMMITTED_BROADCASTED';
      payload: unknown;
      delivery: LocalDataResetBroadcastDelivery;
    }
  | { type: 'JOURNAL_CLEARED'; resetId: string }
  | { type: 'STEP_FAILED'; resetId: string; error: LocalDataResetError }
  | { type: 'RETRY'; resetId: string }
  | { type: 'SERVICE_WORKER_RESTARTED'; journal: unknown | null };

export function resetExpectation(
  expectedStep: LocalDataResetStep | null,
  journalCheckpointExpected: boolean,
  expectedErrorOrigin: LocalDataResetErrorOrigin | null = expectedStep === null
    ? null
    : 'workflow_step'
): Pick<
  LocalDataResetContext,
  'expectedStep' | 'expectedErrorOrigin' | 'journalCheckpointExpected'
> {
  return { expectedStep, expectedErrorOrigin, journalCheckpointExpected };
}

const RESET_PHASES = [
  'journaled',
  'fenced',
  'quiesced',
  'handles_closed',
  'database_deleted',
  'session_cleared',
  'local_cleared',
  'database_reinitialized',
  'settings_aligned',
  'committed',
] as const satisfies readonly LocalDataResetPhase[];

const ERROR_CODES = [
  'PREFLIGHT_FAILED',
  'BLOCKED',
  'JOURNAL_CORRUPT',
  'JOURNAL_FAILED',
  'FENCE_FAILED',
  'QUIESCENCE_FAILED',
  'HANDLE_CLOSE_FAILED',
  'DATABASE_FAILED',
  'SESSION_CLEAR_FAILED',
  'LOCAL_CLEAR_FAILED',
  'REINITIALIZE_FAILED',
  'SETTINGS_ALIGNMENT_FAILED',
  'BROADCAST_FAILED',
  'RECEIPT_FAILED',
  'PROTOCOL_ERROR',
] as const satisfies readonly LocalDataResetErrorCode[];

const RESET_STEPS = [
  'preflight',
  'journal',
  'fence',
  'quiescence',
  'handles',
  'database',
  'session',
  'local',
  'reinitialize',
  'settings_recovery',
  'readiness_broadcast',
  'receipt',
  'postcommit_broadcast',
] as const satisfies readonly LocalDataResetStep[];

const ERROR_ORIGINS = [
  'workflow_step',
  'boot_fence_reacquisition',
] as const satisfies readonly LocalDataResetErrorOrigin[];

/**
 * Takes one exact data-descriptor snapshot of an untrusted record.
 * Consumers must only read the returned snapshot, never the source value.
 */
function readExactDataRecord(
  value: unknown,
  expected: readonly string[]
): Record<string, unknown> | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return null;
    }
    if (new Set(expected).size !== expected.length) {
      return null;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== expected.length ||
      ownKeys.some((key) => typeof key !== 'string' || !expected.includes(key))
    ) {
      return null;
    }
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of expected) {
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

/** Takes one dense, exact data-descriptor snapshot of an untrusted array. */
function readExactDataArray(value: unknown, expectedLength: number): unknown[] | null {
  try {
    if (
      !Number.isSafeInteger(expectedLength) ||
      expectedLength < 0 ||
      !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype
    ) {
      return null;
    }
    const expectedKeys = [
      ...Array.from({ length: expectedLength }, (_, index) => String(index)),
      'length',
    ];
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== expectedKeys.length ||
      ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) {
      return null;
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      lengthDescriptor === undefined ||
      !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
      lengthDescriptor.enumerable !== false ||
      lengthDescriptor.value !== expectedLength
    ) {
      return null;
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < expectedLength; index += 1) {
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

export const isUuidV4 = isLocalDataResetUuidV4;

export function resetRequestIdentitiesAreUnique(input: {
  resetId: unknown;
  previousDataEpoch: unknown | null;
  nextDataEpoch: unknown;
  settingsRecoveryRequestId: unknown;
  settingsBootstrapRequestId: unknown;
}): boolean {
  const identities = [
    input.resetId,
    input.nextDataEpoch,
    input.settingsRecoveryRequestId,
    input.settingsBootstrapRequestId,
    ...(input.previousDataEpoch === null ? [] : [input.previousDataEpoch]),
  ];
  return identities.every(isUuidV4) && new Set(identities).size === identities.length;
}

function isResetPhase(value: unknown): value is LocalDataResetPhase {
  return typeof value === 'string' && RESET_PHASES.includes(value as LocalDataResetPhase);
}

function isErrorCode(value: unknown): value is LocalDataResetErrorCode {
  return typeof value === 'string' && ERROR_CODES.includes(value as LocalDataResetErrorCode);
}

function isResetStep(value: unknown): value is LocalDataResetStep {
  return typeof value === 'string' && RESET_STEPS.includes(value as LocalDataResetStep);
}

function isErrorOrigin(value: unknown): value is LocalDataResetErrorOrigin {
  return typeof value === 'string' && ERROR_ORIGINS.includes(value as LocalDataResetErrorOrigin);
}

function hasValidErrorMatrix(error: LocalDataResetError): boolean {
  if (error.origin === 'boot_fence_reacquisition') {
    return error.code === 'FENCE_FAILED' && error.step === 'fence' && error.retryable;
  }

  switch (error.code) {
    case 'PREFLIGHT_FAILED':
      return error.retryable && error.step === 'preflight';
    case 'BLOCKED':
      return error.retryable && ['handles', 'database', 'reinitialize'].includes(error.step);
    case 'JOURNAL_CORRUPT':
      return !error.retryable && error.step === 'journal';
    case 'JOURNAL_FAILED':
      return error.retryable && error.step === 'journal';
    case 'FENCE_FAILED':
      return error.retryable && error.step === 'fence';
    case 'QUIESCENCE_FAILED':
      return error.retryable && error.step === 'quiescence';
    case 'HANDLE_CLOSE_FAILED':
      return error.retryable && error.step === 'handles';
    case 'DATABASE_FAILED':
      return error.retryable && error.step === 'database';
    case 'SESSION_CLEAR_FAILED':
      return error.retryable && error.step === 'session';
    case 'LOCAL_CLEAR_FAILED':
      return error.retryable && error.step === 'local';
    case 'REINITIALIZE_FAILED':
      return error.retryable && error.step === 'reinitialize';
    case 'SETTINGS_ALIGNMENT_FAILED':
      return error.retryable && error.step === 'settings_recovery';
    case 'BROADCAST_FAILED':
      return (
        error.retryable && ['readiness_broadcast', 'postcommit_broadcast'].includes(error.step)
      );
    case 'RECEIPT_FAILED':
      return error.retryable && error.step === 'receipt';
    case 'PROTOCOL_ERROR':
      return !error.retryable && error.step !== 'journal';
  }
}

export function parseLocalDataResetError(value: unknown): LocalDataResetError | null {
  const record = readExactDataRecord(value, ['code', 'step', 'origin', 'message', 'retryable']);
  if (record === null) {
    return null;
  }
  if (
    !isErrorCode(record.code) ||
    !isResetStep(record.step) ||
    !isErrorOrigin(record.origin) ||
    typeof record.message !== 'string' ||
    record.message.length === 0 ||
    record.message.length > LOCAL_DATA_RESET_ERROR_MESSAGE_MAX_CHARS ||
    typeof record.retryable !== 'boolean'
  ) {
    return null;
  }
  const error: LocalDataResetError = {
    code: record.code,
    step: record.step,
    origin: record.origin,
    message: record.message,
    retryable: record.retryable,
  };
  return hasValidErrorMatrix(error) ? error : null;
}

export function expectedStepAfterPhase(phase: LocalDataResetPhase): LocalDataResetStep {
  switch (phase) {
    case 'journaled':
      return 'fence';
    case 'fenced':
      return 'quiescence';
    case 'quiesced':
      return 'handles';
    case 'handles_closed':
      return 'database';
    case 'database_deleted':
      return 'session';
    case 'session_cleared':
      return 'local';
    case 'local_cleared':
      return 'reinitialize';
    case 'database_reinitialized':
      return 'settings_recovery';
    case 'settings_aligned':
      return 'readiness_broadcast';
    case 'committed':
      return 'postcommit_broadcast';
  }
}

export function isJournalErrorConsistent(
  phase: LocalDataResetPhase,
  error: LocalDataResetError | null
): boolean {
  if (error === null) {
    return true;
  }
  if (error.origin === 'boot_fence_reacquisition') {
    return error.code === 'FENCE_FAILED' && error.step === 'fence' && error.retryable;
  }
  if (error.code === 'JOURNAL_FAILED') {
    return true;
  }
  if (phase === 'settings_aligned' && error.step === 'receipt') {
    return error.code === 'RECEIPT_FAILED' || error.code === 'PROTOCOL_ERROR';
  }
  return error.step === expectedStepAfterPhase(phase);
}

export function parseLocalDataResetJournal(value: unknown): LocalDataResetJournalV1 | null {
  const record = readExactDataRecord(value, [
    'schemaVersion',
    'resetId',
    'previousDataEpoch',
    'nextDataEpoch',
    'settingsRecoveryRequestId',
    'settingsBootstrapRequestId',
    'phase',
    'requestedAt',
    'retryCount',
    'lastError',
  ]);
  if (record === null) {
    return null;
  }
  const previousDataEpoch = record.previousDataEpoch;
  if (previousDataEpoch !== null && !isUuidV4(previousDataEpoch)) {
    return null;
  }
  const lastError = record.lastError === null ? null : parseLocalDataResetError(record.lastError);
  if (record.lastError !== null && lastError === null) {
    return null;
  }
  if (
    record.schemaVersion !== LOCAL_DATA_RESET_JOURNAL_SCHEMA_VERSION ||
    !isUuidV4(record.resetId) ||
    !isUuidV4(record.nextDataEpoch) ||
    !isUuidV4(record.settingsRecoveryRequestId) ||
    !isUuidV4(record.settingsBootstrapRequestId) ||
    !resetRequestIdentitiesAreUnique({
      resetId: record.resetId,
      previousDataEpoch,
      nextDataEpoch: record.nextDataEpoch,
      settingsRecoveryRequestId: record.settingsRecoveryRequestId,
      settingsBootstrapRequestId: record.settingsBootstrapRequestId,
    }) ||
    previousDataEpoch === record.nextDataEpoch ||
    !isResetPhase(record.phase) ||
    !Number.isSafeInteger(record.requestedAt) ||
    Number(record.requestedAt) < 0 ||
    !Number.isSafeInteger(record.retryCount) ||
    Number(record.retryCount) < 0 ||
    !isJournalErrorConsistent(record.phase, lastError)
  ) {
    return null;
  }
  return {
    schemaVersion: LOCAL_DATA_RESET_JOURNAL_SCHEMA_VERSION,
    resetId: record.resetId,
    previousDataEpoch,
    nextDataEpoch: record.nextDataEpoch,
    settingsRecoveryRequestId: record.settingsRecoveryRequestId,
    settingsBootstrapRequestId: record.settingsBootstrapRequestId,
    phase: record.phase,
    requestedAt: Number(record.requestedAt),
    retryCount: Number(record.retryCount),
    lastError: lastError === null ? null : { ...lastError },
  };
}

export function parseLocalDataResetReceipt(value: unknown): LocalDataResetReceiptV1 | null {
  const record = readExactDataRecord(value, [
    'schemaVersion',
    'resetId',
    'previousDataEpoch',
    'nextDataEpoch',
    'settingsRecoveryRequestId',
    'settingsBootstrapRequestId',
    'requestedAt',
    'phase',
  ]);
  if (record === null) {
    return null;
  }
  const previousDataEpoch = record.previousDataEpoch;
  if (previousDataEpoch !== null && !isUuidV4(previousDataEpoch)) {
    return null;
  }
  if (
    record.schemaVersion !== LOCAL_DATA_RESET_RECEIPT_SCHEMA_VERSION ||
    record.phase !== 'committed' ||
    !isUuidV4(record.resetId) ||
    !isUuidV4(record.nextDataEpoch) ||
    !isUuidV4(record.settingsRecoveryRequestId) ||
    !isUuidV4(record.settingsBootstrapRequestId) ||
    !resetRequestIdentitiesAreUnique({
      resetId: record.resetId,
      previousDataEpoch,
      nextDataEpoch: record.nextDataEpoch,
      settingsRecoveryRequestId: record.settingsRecoveryRequestId,
      settingsBootstrapRequestId: record.settingsBootstrapRequestId,
    }) ||
    !Number.isSafeInteger(record.requestedAt) ||
    Number(record.requestedAt) < 0
  ) {
    return null;
  }
  return {
    schemaVersion: LOCAL_DATA_RESET_RECEIPT_SCHEMA_VERSION,
    resetId: record.resetId,
    previousDataEpoch,
    nextDataEpoch: record.nextDataEpoch,
    settingsRecoveryRequestId: record.settingsRecoveryRequestId,
    settingsBootstrapRequestId: record.settingsBootstrapRequestId,
    requestedAt: Number(record.requestedAt),
    phase: 'committed',
  };
}

export function localDataResetReceiptMatches(
  value: unknown,
  expected: Omit<LocalDataResetReceiptV1, 'schemaVersion' | 'phase'>
): boolean {
  const receipt = parseLocalDataResetReceipt(value);
  return (
    receipt !== null &&
    receipt.resetId === expected.resetId &&
    receipt.previousDataEpoch === expected.previousDataEpoch &&
    receipt.nextDataEpoch === expected.nextDataEpoch &&
    receipt.settingsRecoveryRequestId === expected.settingsRecoveryRequestId &&
    receipt.settingsBootstrapRequestId === expected.settingsBootstrapRequestId &&
    receipt.requestedAt === expected.requestedAt
  );
}

export function classifyLocalDataResetRestart(
  value: unknown | null
): LocalDataResetRestartClassification {
  if (value === null) {
    return { kind: 'none' };
  }
  const journal = parseLocalDataResetJournal(value);
  if (journal === null) {
    return { kind: 'corrupt' };
  }
  if (journal.lastError === null) {
    return { kind: 'resume', journal };
  }
  if (journal.lastError.code === 'BLOCKED') {
    return { kind: 'blocked', journal };
  }
  return { kind: 'failed', journal };
}

export function isFailureAllowedForStep(
  expectedStep: LocalDataResetStep | null,
  expectedOrigin: LocalDataResetErrorOrigin | null,
  journalCheckpointExpected: boolean,
  value: unknown
): value is LocalDataResetError {
  const error = parseLocalDataResetError(value);
  if (
    error === null ||
    expectedStep === null ||
    expectedOrigin === null ||
    error.origin !== expectedOrigin
  ) {
    return false;
  }
  if (expectedOrigin === 'boot_fence_reacquisition') {
    return error.code === 'FENCE_FAILED' && expectedStep === 'fence';
  }
  if (error.code === 'JOURNAL_FAILED') {
    return journalCheckpointExpected;
  }
  return error.step === expectedStep;
}

export function settingsResetRecoveryCommandId(requestId: string): string {
  return `settings/reset-recover/${requestId}`;
}

export function parseAlignSettingsForReset(
  value: unknown,
  expected: Pick<AlignSettingsForResetV1, 'resetId' | 'dataEpoch' | 'requestId' | 'commandId'>
): AlignSettingsForResetV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'resetId',
    'dataEpoch',
    'requestId',
    'commandId',
    'expectedResetPhase',
  ]);
  if (record === null) {
    return null;
  }
  if (
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    record.resetId !== expected.resetId ||
    record.dataEpoch !== expected.dataEpoch ||
    record.requestId !== expected.requestId ||
    record.commandId !== expected.commandId ||
    record.commandId !== settingsResetRecoveryCommandId(expected.requestId) ||
    record.expectedResetPhase !== 'database_reinitialized' ||
    !isUuidV4(record.resetId) ||
    !isUuidV4(record.dataEpoch) ||
    !isUuidV4(record.requestId)
  ) {
    return null;
  }
  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    resetId: record.resetId,
    dataEpoch: record.dataEpoch,
    requestId: record.requestId,
    commandId: record.commandId,
    expectedResetPhase: 'database_reinitialized',
  };
}

export function localDataResetInputIsValid(input: LocalDataResetMachineInput): boolean {
  const ids = input.includedConnectorIds;
  return (
    ids.length > 0 &&
    new Set(ids).size === ids.length &&
    [...ids].sort().every((id, index) => id === ids[index]) &&
    isStrictSettings(input.defaultSettings, ids)
  );
}

export function isFreshResetSettingsEnvelope(
  value: unknown,
  dataEpoch: string,
  defaultSettings: AppSettings,
  includedConnectorIds: string[]
): boolean {
  const envelope = parseSettingsEnvelopeV2(value, dataEpoch, includedConnectorIds);
  return (
    envelope !== null &&
    envelope.revision === 0 &&
    envelope.generation === 0 &&
    envelope.journal === null &&
    envelope.outcomes.length === 0 &&
    settingsDigest(envelope.settings) === settingsDigest(defaultSettings)
  );
}

export function parseResetOwnedSettingsAlignmentProof(
  value: unknown,
  expected: {
    resetId: string;
    dataEpoch: string;
    requestId: string;
    commandId: string;
    defaultSettings: AppSettings;
    includedConnectorIds: string[];
  }
): ResetOwnedSettingsAlignmentProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'resetId',
    'dataEpoch',
    'requestId',
    'commandId',
    'resetPhase',
    'envelope',
    'alarmProof',
  ]);
  if (record === null) {
    return null;
  }
  if (
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    record.resetId !== expected.resetId ||
    record.dataEpoch !== expected.dataEpoch ||
    record.requestId !== expected.requestId ||
    record.commandId !== expected.commandId ||
    record.commandId !== settingsResetRecoveryCommandId(expected.requestId) ||
    record.resetPhase !== 'database_reinitialized'
  ) {
    return null;
  }
  const envelope = parseSettingsEnvelopeV2(
    record.envelope,
    expected.dataEpoch,
    expected.includedConnectorIds
  );
  if (
    envelope === null ||
    envelope.revision !== 0 ||
    !Number.isSafeInteger(envelope.generation) ||
    envelope.generation < 0 ||
    envelope.journal !== null ||
    envelope.outcomes.length !== 0 ||
    settingsDigest(envelope.settings) !== settingsDigest(expected.defaultSettings)
  ) {
    return null;
  }
  const alarmProof = parseAutoScanAlarmProofV1(
    record.alarmProof,
    envelope,
    expected.requestId,
    expected.commandId
  );
  if (alarmProof === null) {
    return null;
  }
  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    resetId: expected.resetId,
    dataEpoch: expected.dataEpoch,
    requestId: expected.requestId,
    commandId: expected.commandId,
    resetPhase: 'database_reinitialized',
    envelope,
    alarmProof,
  };
}

export interface LocalDataResetProofExpectation {
  resetId: string;
  previousDataEpoch: string | null;
  nextDataEpoch: string;
  settingsRecoveryRequestId: string;
  settingsBootstrapRequestId: string;
  requestedAt: number;
  defaultSettings: AppSettings;
  includedConnectorIds: string[];
}

function proofExpectationMatches(
  record: Record<string, unknown>,
  expected: LocalDataResetProofExpectation
): boolean {
  return (
    record.resetId === expected.resetId &&
    record.previousDataEpoch === expected.previousDataEpoch &&
    record.nextDataEpoch === expected.nextDataEpoch &&
    record.settingsRecoveryRequestId === expected.settingsRecoveryRequestId &&
    record.settingsBootstrapRequestId === expected.settingsBootstrapRequestId &&
    record.requestedAt === expected.requestedAt &&
    resetRequestIdentitiesAreUnique(expected)
  );
}

export function parseLocalDataResetFreshPreflightProof(
  value: unknown,
  expected: LocalDataResetProofExpectation
): LocalDataResetFreshPreflightProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'result',
    'resetId',
    'previousDataEpoch',
    'nextDataEpoch',
    'settingsRecoveryRequestId',
    'settingsBootstrapRequestId',
    'requestedAt',
    'resetJournalAbsent',
    'canonicalDataEpoch',
  ]);
  if (record === null) {
    return null;
  }
  const canonicalDataEpoch = record.canonicalDataEpoch;
  if (canonicalDataEpoch !== null && !isUuidV4(canonicalDataEpoch)) {
    return null;
  }
  if (
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    record.result !== 'fresh' ||
    record.resetJournalAbsent !== true ||
    !proofExpectationMatches(record, expected) ||
    canonicalDataEpoch !== expected.previousDataEpoch ||
    canonicalDataEpoch === expected.nextDataEpoch
  ) {
    return null;
  }
  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    result: 'fresh',
    resetId: expected.resetId,
    previousDataEpoch: expected.previousDataEpoch,
    nextDataEpoch: expected.nextDataEpoch,
    settingsRecoveryRequestId: expected.settingsRecoveryRequestId,
    settingsBootstrapRequestId: expected.settingsBootstrapRequestId,
    requestedAt: expected.requestedAt,
    resetJournalAbsent: true,
    canonicalDataEpoch,
  };
}

export function parseLocalDataResetInitialDatabaseProof(
  value: unknown,
  expectedDataEpoch: string
): LocalDataResetInitialDatabaseProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'databaseName',
    'dbVersion',
    'appDataVersion',
    'schemaVerified',
    'dataEpoch',
    'trackingMeta',
    'stores',
  ]);
  if (record === null) {
    return null;
  }
  const trackingMeta = readExactDataRecord(record.trackingMeta, [
    'key',
    'schemaVersion',
    'dataEpoch',
    'collectionRevision',
  ]);
  const stores = readExactDataArray(record.stores, LOCAL_DATA_RESET_EMPTY_STORES.length);
  if (trackingMeta === null || stores === null) {
    return null;
  }
  const storesAreExactlyEmpty = stores.every((store, index) => {
    const expectedName = LOCAL_DATA_RESET_EMPTY_STORES[index];
    const storeRecord = readExactDataRecord(store, ['name', 'rowCount']);
    return storeRecord !== null && storeRecord.name === expectedName && storeRecord.rowCount === 0;
  });
  if (
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    record.databaseName !== 'missionpulse' ||
    record.dbVersion !== 6 ||
    record.appDataVersion !== 3 ||
    record.schemaVerified !== true ||
    record.dataEpoch !== expectedDataEpoch ||
    trackingMeta.key !== 'tracking_meta' ||
    trackingMeta.schemaVersion !== 1 ||
    trackingMeta.dataEpoch !== expectedDataEpoch ||
    trackingMeta.collectionRevision !== 0 ||
    !storesAreExactlyEmpty
  ) {
    return null;
  }
  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    databaseName: 'missionpulse',
    dbVersion: 6,
    appDataVersion: 3,
    schemaVerified: true,
    dataEpoch: expectedDataEpoch,
    trackingMeta: {
      key: 'tracking_meta',
      schemaVersion: 1,
      dataEpoch: expectedDataEpoch,
      collectionRevision: 0,
    },
    stores: LOCAL_DATA_RESET_EMPTY_STORES.map((name) => ({ name, rowCount: 0 })),
  };
}

export function parseLocalDataResetPostClearAuthorityProof(
  value: unknown,
  expectedDataEpoch: string
): LocalDataResetPostClearAuthorityProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'databaseName',
    'dbVersion',
    'appDataVersion',
    'schemaVerified',
    'dataEpoch',
    'trackingMeta',
  ]);
  if (record === null) {
    return null;
  }
  const trackingMeta = readExactDataRecord(record.trackingMeta, [
    'key',
    'schemaVersion',
    'dataEpoch',
    'collectionRevision',
  ]);
  if (
    trackingMeta === null ||
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    record.databaseName !== 'missionpulse' ||
    record.dbVersion !== 6 ||
    record.appDataVersion !== 3 ||
    record.schemaVerified !== true ||
    record.dataEpoch !== expectedDataEpoch ||
    trackingMeta.key !== 'tracking_meta' ||
    trackingMeta.schemaVersion !== 1 ||
    trackingMeta.dataEpoch !== expectedDataEpoch ||
    !Number.isSafeInteger(trackingMeta.collectionRevision) ||
    Number(trackingMeta.collectionRevision) < 0
  ) {
    return null;
  }
  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    databaseName: 'missionpulse',
    dbVersion: 6,
    appDataVersion: 3,
    schemaVerified: true,
    dataEpoch: expectedDataEpoch,
    trackingMeta: {
      key: 'tracking_meta',
      schemaVersion: 1,
      dataEpoch: expectedDataEpoch,
      collectionRevision: Number(trackingMeta.collectionRevision),
    },
  };
}

export function parseLocalDataResetPostClearCompletionProof(
  value: unknown,
  expected: LocalDataResetProofExpectation
): LocalDataResetPostClearCompletionProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'result',
    'resetId',
    'previousDataEpoch',
    'nextDataEpoch',
    'settingsRecoveryRequestId',
    'settingsBootstrapRequestId',
    'requestedAt',
    'resetJournalAbsent',
    'canonicalDataEpoch',
    'receipt',
    'authority',
  ]);
  if (record === null) {
    return null;
  }
  const receipt = parseLocalDataResetReceipt(record.receipt);
  const authority = parseLocalDataResetPostClearAuthorityProof(
    record.authority,
    expected.nextDataEpoch
  );
  if (
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    record.result !== 'already_completed' ||
    record.resetJournalAbsent !== true ||
    record.canonicalDataEpoch !== expected.nextDataEpoch ||
    !proofExpectationMatches(record, expected) ||
    receipt === null ||
    !localDataResetReceiptMatches(receipt, expected) ||
    authority === null
  ) {
    return null;
  }
  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    result: 'already_completed',
    resetId: expected.resetId,
    previousDataEpoch: expected.previousDataEpoch,
    nextDataEpoch: expected.nextDataEpoch,
    settingsRecoveryRequestId: expected.settingsRecoveryRequestId,
    settingsBootstrapRequestId: expected.settingsBootstrapRequestId,
    requestedAt: expected.requestedAt,
    resetJournalAbsent: true,
    canonicalDataEpoch: expected.nextDataEpoch,
    receipt,
    authority,
  };
}

function proofExpectationFromContext(
  context: LocalDataResetContext
): LocalDataResetProofExpectation | null {
  if (
    context.resetId === null ||
    context.nextDataEpoch === null ||
    context.settingsRecoveryRequestId === null ||
    context.settingsBootstrapRequestId === null ||
    context.requestedAt === null
  ) {
    return null;
  }
  return {
    resetId: context.resetId,
    previousDataEpoch: context.previousDataEpoch,
    nextDataEpoch: context.nextDataEpoch,
    settingsRecoveryRequestId: context.settingsRecoveryRequestId,
    settingsBootstrapRequestId: context.settingsBootstrapRequestId,
    requestedAt: context.requestedAt,
    defaultSettings: context.defaultSettings,
    includedConnectorIds: context.includedConnectorIds,
  };
}

export function matchesFreshResetPreflight(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): boolean {
  const expected = proofExpectationFromContext(context);
  return (
    event.type === 'RESET_PREFLIGHT_FRESH' &&
    matchesReset(context, event) &&
    expected !== null &&
    parseLocalDataResetFreshPreflightProof(event.proof, expected) !== null
  );
}

export function matchesPostClearResetCompletion(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): boolean {
  const expected = proofExpectationFromContext(context);
  return (
    event.type === 'RESET_COMPLETION_RECOGNIZED' &&
    matchesReset(context, event) &&
    expected !== null &&
    parseLocalDataResetPostClearCompletionProof(event.proof, expected) !== null
  );
}

export function durableFactsAfterPhase(phase: LocalDataResetPhase): LocalDataResetDurableFacts {
  const atLeast = (expected: LocalDataResetPhase): boolean =>
    RESET_PHASES.indexOf(phase) >= RESET_PHASES.indexOf(expected);
  return {
    scanQuiescent: atLeast('quiesced'),
    trackingQuiescent: atLeast('quiesced'),
    migrationQuiescent: atLeast('quiesced'),
    outboxQuiescent: atLeast('quiesced'),
    databaseHandlesClosed: atLeast('handles_closed'),
    databaseDeleted: atLeast('database_deleted'),
    sessionCleared: atLeast('session_cleared'),
    localCleared: atLeast('local_cleared'),
    databaseReinitialized: atLeast('database_reinitialized'),
    settingsAligned: atLeast('settings_aligned'),
    receiptPersisted: atLeast('committed'),
    commitCheckpointed: atLeast('committed'),
  };
}

export function recognizedPostClearCompletionPatch(): Partial<LocalDataResetContext> {
  return {
    ...durableFactsAfterPhase('committed'),
    phase: 'committed',
    journalPersisted: false,
    fenceAcquired: false,
    completionDisposition: 'recognized',
    expectedStep: null,
    expectedErrorOrigin: null,
    journalCheckpointExpected: false,
    error: null,
  };
}

export function initialLocalDataResetContext(
  input: LocalDataResetMachineInput
): LocalDataResetContext {
  return {
    defaultSettings: cloneSettings(input.defaultSettings),
    includedConnectorIds: [...input.includedConnectorIds],
    resetId: null,
    previousDataEpoch: null,
    nextDataEpoch: null,
    settingsRecoveryRequestId: null,
    settingsBootstrapRequestId: null,
    requestedAt: null,
    phase: 'none',
    expectedStep: null,
    expectedErrorOrigin: null,
    journalCheckpointExpected: false,
    journalPersisted: false,
    fenceAcquired: false,
    restartDisposition: null,
    ...{
      scanQuiescent: false,
      trackingQuiescent: false,
      migrationQuiescent: false,
      outboxQuiescent: false,
      databaseHandlesClosed: false,
      databaseDeleted: false,
      sessionCleared: false,
      localCleared: false,
      databaseReinitialized: false,
      settingsAligned: false,
      receiptPersisted: false,
      commitCheckpointed: false,
    },
    readinessDelivery: null,
    postCommitDelivery: null,
    completionDisposition: null,
    retryCount: 0,
    error: null,
  };
}

export function restoredLocalDataResetContext(
  input: LocalDataResetMachineInput,
  journal: LocalDataResetJournalV1,
  disposition: Exclude<LocalDataResetRestartDisposition, null>
): LocalDataResetContext {
  return {
    ...initialLocalDataResetContext(input),
    ...durableFactsAfterPhase(journal.phase),
    resetId: journal.resetId,
    previousDataEpoch: journal.previousDataEpoch,
    nextDataEpoch: journal.nextDataEpoch,
    settingsRecoveryRequestId: journal.settingsRecoveryRequestId,
    settingsBootstrapRequestId: journal.settingsBootstrapRequestId,
    requestedAt: journal.requestedAt,
    phase: journal.phase,
    journalPersisted: true,
    restartDisposition: disposition,
    retryCount: journal.retryCount,
    error: journal.lastError === null ? null : { ...journal.lastError },
  };
}

export function restartClassification(
  event: LocalDataResetEvent
): LocalDataResetRestartClassification {
  return event.type === 'SERVICE_WORKER_RESTARTED'
    ? classifyLocalDataResetRestart(event.journal)
    : { kind: 'corrupt' };
}

export function restartHasKind(
  event: LocalDataResetEvent,
  kind: LocalDataResetRestartClassification['kind']
): boolean {
  return event.type === 'SERVICE_WORKER_RESTARTED' && restartClassification(event).kind === kind;
}

export function matchesReset(context: LocalDataResetContext, event: LocalDataResetEvent): boolean {
  return 'resetId' in event && context.resetId !== null && event.resetId === context.resetId;
}

export function restoreLocalDataResetContext(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): LocalDataResetContext | Record<string, never> {
  const classification = restartClassification(event);
  if (
    classification.kind === 'resume' ||
    classification.kind === 'blocked' ||
    classification.kind === 'failed'
  ) {
    return restoredLocalDataResetContext(
      {
        defaultSettings: context.defaultSettings,
        includedConnectorIds: context.includedConnectorIds,
      },
      classification.journal,
      classification.kind
    );
  }
  return {};
}

export function validLocalDataResetRequest(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): boolean {
  if (
    event.type !== 'RESET_REQUESTED' ||
    !localDataResetInputIsValid(context) ||
    !isUuidV4(event.resetId) ||
    (event.previousDataEpoch !== null && !isUuidV4(event.previousDataEpoch)) ||
    !isUuidV4(event.nextDataEpoch) ||
    !isUuidV4(event.settingsRecoveryRequestId) ||
    !isUuidV4(event.settingsBootstrapRequestId) ||
    event.previousDataEpoch === event.nextDataEpoch ||
    !Number.isSafeInteger(event.requestedAt) ||
    event.requestedAt < 0
  ) {
    return false;
  }
  return resetRequestIdentitiesAreUnique(event);
}

export function matchesReinitializedSettingsEnvelope(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): boolean {
  return (
    event.type === 'DATABASE_REINITIALIZED' &&
    matchesReset(context, event) &&
    context.nextDataEpoch !== null &&
    event.dataEpoch === context.nextDataEpoch &&
    parseLocalDataResetInitialDatabaseProof(event.databaseProof, context.nextDataEpoch) !== null &&
    isFreshResetSettingsEnvelope(
      event.settingsEnvelope,
      context.nextDataEpoch,
      context.defaultSettings,
      context.includedConnectorIds
    )
  );
}

export function matchesSettingsAlignment(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): boolean {
  if (
    event.type !== 'SETTINGS_ALIGNED' ||
    !matchesReset(context, event) ||
    context.phase !== 'database_reinitialized' ||
    context.resetId === null ||
    context.nextDataEpoch === null ||
    context.settingsRecoveryRequestId === null
  ) {
    return false;
  }
  const requestId = context.settingsRecoveryRequestId;
  return (
    parseResetOwnedSettingsAlignmentProof(event.proof, {
      resetId: context.resetId,
      dataEpoch: context.nextDataEpoch,
      requestId,
      commandId: settingsResetRecoveryCommandId(requestId),
      defaultSettings: context.defaultSettings,
      includedConnectorIds: context.includedConnectorIds,
    }) !== null
  );
}

export function matchesResetEpochBroadcast(
  context: LocalDataResetContext,
  event: LocalDataResetEvent,
  stage: LocalDataResetEpochEventV1['stage']
): boolean {
  const expectedType =
    stage === 'ready_to_commit' ? 'RESET_READY_BROADCASTED' : 'RESET_COMMITTED_BROADCASTED';
  return (
    event.type === expectedType &&
    (event.delivery === 'delivered' || event.delivery === 'no_receiver') &&
    context.resetId !== null &&
    context.nextDataEpoch !== null &&
    context.settingsBootstrapRequestId !== null &&
    localDataResetEpochEventMatches(event.payload, {
      stage,
      resetId: context.resetId,
      previousDataEpoch: context.previousDataEpoch,
      nextDataEpoch: context.nextDataEpoch,
      settingsBootstrapRequestId: context.settingsBootstrapRequestId,
    })
  );
}

export function matchesResetReceiptWrite(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): boolean {
  if (
    event.type !== 'RESET_RECEIPT_WRITTEN' ||
    !matchesReset(context, event) ||
    context.resetId === null ||
    context.nextDataEpoch === null ||
    context.settingsRecoveryRequestId === null ||
    context.settingsBootstrapRequestId === null ||
    context.requestedAt === null
  ) {
    return false;
  }
  return (
    context.phase === 'settings_aligned' &&
    context.journalPersisted &&
    context.fenceAcquired &&
    context.databaseReinitialized &&
    context.settingsAligned &&
    context.readinessDelivery !== null &&
    localDataResetReceiptMatches(event.receipt, {
      resetId: context.resetId,
      previousDataEpoch: context.previousDataEpoch,
      nextDataEpoch: context.nextDataEpoch,
      settingsRecoveryRequestId: context.settingsRecoveryRequestId,
      settingsBootstrapRequestId: context.settingsBootstrapRequestId,
      requestedAt: context.requestedAt,
    })
  );
}

export function commitCheckpointAllowed(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): boolean {
  return (
    event.type === 'RESET_COMMIT_CHECKPOINTED' &&
    matchesReset(context, event) &&
    context.phase === 'settings_aligned' &&
    context.settingsAligned &&
    context.receiptPersisted &&
    context.readinessDelivery !== null
  );
}

export function localDataResetCompletionProven(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): boolean {
  return (
    event.type === 'JOURNAL_CLEARED' &&
    matchesReset(context, event) &&
    context.phase === 'committed' &&
    context.journalPersisted &&
    context.fenceAcquired &&
    context.scanQuiescent &&
    context.trackingQuiescent &&
    context.migrationQuiescent &&
    context.outboxQuiescent &&
    context.databaseHandlesClosed &&
    context.databaseDeleted &&
    context.sessionCleared &&
    context.localCleared &&
    context.databaseReinitialized &&
    context.settingsAligned &&
    context.receiptPersisted &&
    context.commitCheckpointed &&
    context.postCommitDelivery !== null
  );
}
