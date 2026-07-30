import type { AppSettings, ThemePreference } from '../lib/core/types/app-settings';
import {
  parseLocalDataResetEpochEvent,
  type LocalDataResetEpochEventV1,
} from './local-data-reset-epoch.contract';

export type { LocalDataResetEpochEventV1 } from './local-data-reset-epoch.contract';

export type PersistentSettingKey =
  'autoScan' | 'scanIntervalMinutes' | 'notifications' | 'theme' | 'enabledConnectors';
export type SaveStatus = 'saved' | 'saving' | 'failed';
export type MutationOutcomeKnowledge = 'previous' | 'candidate' | 'unknown';
export type CanonicalKnowledge = 'known' | 'stale' | 'unknown';
export type CanonicalRelation = 'previous' | 'candidate' | 'other' | 'unknown';
export type SettingsOperation =
  | 'load'
  | 'mutate'
  | 'activation'
  | 'permission_check'
  | 'pending_intent'
  | 'rebase'
  | 'save'
  | 'effect'
  | 'compensate'
  | 'cancel'
  | 'reconcile';
export type SettingsErrorCode =
  | 'SETTINGS_LOAD_FAILED'
  | 'SETTINGS_INVALID'
  | 'SETTINGS_BUSY'
  | 'SETTINGS_ACTIVATION_REJECTED'
  | 'SETTINGS_ACTIVATION_CAPACITY_EXHAUSTED'
  | 'SETTINGS_HOST_PERMISSION_MISSING'
  | 'SETTINGS_STORAGE_FAILED'
  | 'SETTINGS_CONFLICT'
  | 'SETTINGS_RUNTIME_EFFECT_FAILED'
  | 'SETTINGS_COMPENSATION_FAILED'
  | 'SETTINGS_RECONCILE_FAILED'
  | 'SETTINGS_TRANSPORT_ERROR'
  | 'SETTINGS_PROTOCOL_ERROR'
  | 'SETTINGS_WORKER_RESTARTED'
  | 'SETTINGS_RESET_IN_PROGRESS'
  | 'SETTINGS_NOT_COMMITTED'
  | 'SETTINGS_SUPERSEDED'
  | 'SETTINGS_OUTCOME_MISSING'
  | 'SETTINGS_LEDGER_QUOTA_EXHAUSTED'
  | 'SETTINGS_GLOBAL_STORAGE_QUOTA_EXHAUSTED'
  | 'SETTINGS_GENERATION_EXHAUSTED'
  | 'SETTINGS_REVISION_EXHAUSTED';

export interface SettingsPersistenceError {
  version: 1;
  code: SettingsErrorCode;
  operation: SettingsOperation;
  message: string;
  recoverable: boolean;
  mutationOutcome: MutationOutcomeKnowledge;
  canonicalKnowledge: CanonicalKnowledge;
}

export type SettingsMutationOutcomeKind =
  'committed' | 'not_committed' | 'compensated' | 'cancelled';

export interface SettingsMutationOutcomeV1 {
  version: 1;
  dataEpoch: string;
  mutationId: string;
  commandDigest: string;
  previousDigest: string;
  candidateDigest: string;
  baseRevision: number;
  baseGeneration: number;
  settledRevision: number;
  settledGeneration: number;
  correlationIds: string[];
  outcome: SettingsMutationOutcomeKind;
}

export interface AutoScanAlarmExpectationV1 {
  version: 1;
  kind: 'AUTO_SCAN_ALARM';
  alarmName: 'auto-scan';
  enabled: boolean;
  periodInMinutes: number | null;
}

export interface AutoScanAlarmProofV1 extends AutoScanAlarmExpectationV1 {
  dataEpoch: string;
  envelopeRevision: number;
  envelopeGeneration: number;
  settingsDigest: string;
  proofId: string;
  requestId: string;
  commandId: string;
}

export type SettingsJournalPhase =
  'effects_pending' | 'compensation_pending' | 'compensation_effects_pending';

export interface SettingsDurableJournalV1 {
  version: 1;
  phase: SettingsJournalPhase;
  transactionId: string;
  mutationId: string | null;
  commandDigest: string | null;
  baseRevision: number;
  baseGeneration: number;
  previousSettings: AppSettings | null;
  candidateSettings: AppSettings;
  previousDigest: string | null;
  candidateDigest: string;
  correlationIds: string[];
  expectedAlarm: AutoScanAlarmExpectationV1;
}

export interface LegacySettingsEnvelopeV1 {
  version: 1;
  revision: number;
  settings: AppSettings;
}

export interface SettingsEnvelopeV2 {
  version: 2;
  dataEpoch: string;
  revision: number;
  generation: number;
  settings: AppSettings;
  journal: SettingsDurableJournalV1 | null;
  outcomes: SettingsMutationOutcomeV1[];
}

export interface SettingsSnapshotV1 {
  version: 1;
  dataEpoch: string;
  requestId: string;
  commandId: string;
  resetJournalAbsent: true;
  envelope: SettingsEnvelopeV2;
  alarmProof: AutoScanAlarmProofV1;
}

export interface SettingsJournalProofV1 {
  version: 1;
  dataEpoch: string;
  requestId: string;
  commandId: string;
  resetJournalAbsent: true;
  envelope: SettingsEnvelopeV2;
}

export interface SettingsHostPermissionContainsProofV1 {
  version: 1;
  dataEpoch: string;
  mutationId: string;
  permissionCheckId: string;
  activationId: string;
  activationResultId: string;
  originDigest: string;
  verifiedOrigins: string[];
  containsVerified: true;
}

export const SETTINGS_ACTIVATION_MAX_LIFETIME_MS = 5 * 60 * 1000;
export const MAX_SETTINGS_HANDLED_ACTIVATIONS_PER_WORKER = 4096;

export interface SettingsActivationIssueV1 {
  version: 1;
  mutationId: string;
  permissionCheckId: string;
  activationId: string;
  storageReservationId: string;
  ttlMs: number;
}

export interface SettingsActivationTokenV1 {
  version: 1;
  dataEpoch: string;
  workerEpoch: string;
  mutationId: string;
  permissionCheckId: string;
  activationId: string;
  storageReservationId: string;
  issuedAtMs: number;
  expiresAtMs: number;
}

interface SettingsActivationRegistryResultBaseV1 {
  version: 1;
  dataEpoch: string;
  workerEpoch: string;
  mutationId: string;
  permissionCheckId: string;
  activationId: string;
  storageReservationId: string;
  issuedAtMs: number;
  expiresAtMs: number;
  observedAtMs: number;
  resultId: string;
}

export type SettingsActivationRegistryResultV1 =
  | (SettingsActivationRegistryResultBaseV1 & {
      kind: 'SETTINGS_ACTIVATION_CONSUMED';
      oneShotConsumed: true;
    })
  | (SettingsActivationRegistryResultBaseV1 & {
      kind: 'SETTINGS_ACTIVATION_REJECTED';
      reason: 'expired' | 'replayed' | 'crossed';
    });

export interface SettingsMutationByteProjectionV1 {
  version: 1;
  settingsKey: 'settings';
  currentEnvelopeValueBytes: number;
  currentSettingsEntryBytes: number;
  maxJournalEnvelopeValueBytes: number;
  maxJournalSettingsEntryBytes: number;
  maxSettledEnvelopeValueBytes: number;
  maxSettledSettingsEntryBytes: number;
  reservedSettingsEntryBytes: number;
  requiredAdditionalBytes: number;
  systemReserveBytes: number;
  resetReceiptReserveBytes: number;
}

export interface SettingsGlobalStorageReservationProofV1 {
  version: 1;
  kind: 'CHROME_LOCAL_SETTINGS_RESERVATION';
  storageArea: 'local';
  settingsKey: 'settings';
  dataEpoch: string;
  mutationId: string;
  commandDigest: string;
  baseRevision: number;
  baseGeneration: number;
  reservationId: string;
  gateLeaseId: string;
  proofId: string;
  quotaBytes: number;
  bytesInUse: number;
  currentSettingsEntryBytes: number;
  reservedSettingsEntryBytes: number;
  requiredAdditionalBytes: number;
  systemReserveBytes: number;
  resetReceiptReserveBytes: number;
  availableAfterReservationBytes: number;
  reservationActive: true;
  allLocalWritersFenced: true;
  resetJournalAbsent: true;
}

export interface SettingsGlobalStorageReservationDenialV1 {
  version: 1;
  kind: 'CHROME_LOCAL_SETTINGS_RESERVATION_DENIED';
  storageArea: 'local';
  settingsKey: 'settings';
  dataEpoch: string;
  mutationId: string;
  commandDigest: string;
  baseRevision: number;
  baseGeneration: number;
  reservationId: string;
  gateLeaseId: string;
  proofId: string;
  quotaBytes: number;
  bytesInUse: number;
  currentSettingsEntryBytes: number;
  reservedSettingsEntryBytes: number;
  requiredAdditionalBytes: number;
  systemReserveBytes: number;
  resetReceiptReserveBytes: number;
  availableBytes: number;
  reason: 'INSUFFICIENT_GLOBAL_HEADROOM';
  allLocalWritersFenced: true;
  resetJournalAbsent: true;
}

export interface ResetFenceProofV1 {
  version: 1;
  kind: 'DATASET_EPOCH_RESET_FENCE';
  issuedTo: 'settings-bootstrap';
  resetId: string;
  nextDataEpoch: string;
  settingsBootstrapRequestId: string;
  resetPhase: 'committed';
  authorityFenceHeld: true;
  gateLeaseId: string;
  proofId: string;
}

export type SettingsStorageDecodeResult =
  | { kind: 'current'; envelope: SettingsEnvelopeV2 }
  | {
      kind: 'initialize' | 'migrate_v1' | 'migrate_bare_current' | 'migrate_bare_pre_theme';
      revision: number;
      generation: 0;
      settings: AppSettings;
    }
  | { kind: 'invalid' };

export type SettingValue = AppSettings[PersistentSettingKey];
export type TransactionPhase =
  | 'saved'
  | 'persisting_intent'
  | 'reserving'
  | 'permission_check'
  | 'rebasing'
  | 'writing'
  | 'compensating'
  | 'cancelling'
  | 'reconciling'
  | 'clearing_intent'
  | 'failed';
export type ReconcileReason =
  | 'permission_check_unknown'
  | 'save_failed'
  | 'conflict'
  | 'compensation_unknown'
  | 'cancel_unknown'
  | 'rebase_failed'
  | 'protocol_uncertain'
  | 'worker_restart'
  | 'external_revision'
  | 'manual_retry';

export interface SettingMutation {
  key: PersistentSettingKey;
  previousSettings: AppSettings;
  candidateSettings: AppSettings;
  previous: SettingValue;
  candidate: SettingValue;
  previousDigest: string;
  candidateDigest: string;
  commandDigest: string;
  correlationIds: string[];
  mutationId: string;
  permissionCheckId: string;
  activationId: string;
  activationResultId: string;
  requiredOrigins: string[];
  baseRevision: number;
  baseGeneration: number;
  permissionProof: SettingsHostPermissionContainsProofV1 | null;
  storageReservationId: string;
  storageReservationProof: SettingsGlobalStorageReservationProofV1 | null;
}

export interface RetryIntent {
  failedMutationId: string;
  mutationId: string;
  permissionCheckId: string;
  activationId: string;
  activationResultId: string;
  storageReservationId: string;
  requestId: string;
}

export type SettingsPendingIntentPhase =
  | 'reserving'
  | 'permission_check'
  | 'rebasing'
  | 'writing'
  | 'compensating'
  | 'cancelling'
  | 'reconciling'
  | 'clearing_intent';

export type SettingsPendingIntentNextCommandType =
  | 'RESERVE_SETTINGS_STORAGE'
  | 'VERIFY_SETTINGS_HOST_PERMISSIONS'
  | 'COMPARE_AND_SETTLE_SETTINGS'
  | 'RECOVER_SETTINGS_TRANSACTION'
  | 'REBASE_SETTINGS_MUTATION'
  | 'ABORT_SETTINGS_MUTATION'
  | 'RECONCILE_SETTINGS'
  | 'CLEAR_SETTINGS_PENDING_INTENT';

export interface SettingsTerminalSettlementV1 {
  version: 1;
  dataEpoch: string;
  mutationId: string;
  requestId: string;
  commandId: string;
  outcome: SettingsMutationOutcomeV1;
  error: SettingsPersistenceError | null;
}

export interface SettingsPendingIntentV1 {
  version: 1;
  storageKey: 'missionpulse.settingsPendingIntent.v1';
  dataEpoch: string;
  originWorkerEpoch: string;
  intentRevision: number;
  mutation: SettingMutation;
  retryIntent: RetryIntent | null;
  phase: SettingsPendingIntentPhase;
  nextCommandType: SettingsPendingIntentNextCommandType;
  nextCommandId: string;
  requestId: string | null;
  terminalSettlement: SettingsTerminalSettlementV1 | null;
  intentDigest: string;
}

export interface SettingsColdStartRecoverySeedV1 {
  version: 1;
  dataEpoch: string;
  recoveryWorkerEpoch: string;
  recoveryRequestId: string;
  pendingIntent: SettingsPendingIntentV1;
  envelope: SettingsEnvelopeV2;
}

export interface SettingsPendingIntentPersistedProofV1 {
  version: 1;
  kind: 'SETTINGS_PENDING_INTENT_PERSISTED';
  storageArea: 'session';
  storageKey: 'missionpulse.settingsPendingIntent.v1';
  dataEpoch: string;
  mutationId: string;
  originWorkerEpoch: string;
  intentRevision: number;
  intentDigest: string;
  commandId: string;
  proofId: string;
  readBackVerified: true;
}

export interface SettingsPendingIntentClearedProofV1 {
  version: 1;
  kind: 'SETTINGS_PENDING_INTENT_CLEARED';
  storageArea: 'session';
  storageKey: 'missionpulse.settingsPendingIntent.v1';
  dataEpoch: string;
  mutationId: string;
  originWorkerEpoch: string;
  intentRevision: number;
  intentDigest: string;
  commandId: string;
  proofId: string;
  absenceReadBackVerified: true;
}

export interface SettingsPendingIntentAbsentProofV1 {
  version: 1;
  kind: 'SETTINGS_PENDING_INTENT_ABSENT';
  storageArea: 'session';
  storageKey: 'missionpulse.settingsPendingIntent.v1';
  dataEpoch: string;
  mutationId: string;
  originWorkerEpoch: string;
  intentRevision: 1;
  intentDigest: string;
  commandId: string;
  proofId: string;
  absenceReadBackVerified: true;
}

export type PendingSettingsReset = LocalDataResetEpochEventV1;

export interface SettingsResetCorrelationV1 {
  resetId: string;
  nextDataEpoch: string;
}

export type SettingsPersistenceCommand =
  | {
      type: 'PERSIST_SETTINGS_PENDING_INTENT';
      commandId: string;
      dataEpoch: string;
      storageArea: 'session';
      storageKey: 'missionpulse.settingsPendingIntent.v1';
      intentRevision: number;
      intentDigest: string;
      pendingIntent: SettingsPendingIntentV1;
    }
  | {
      type: 'CLEAR_SETTINGS_PENDING_INTENT';
      commandId: string;
      dataEpoch: string;
      storageArea: 'session';
      storageKey: 'missionpulse.settingsPendingIntent.v1';
      mutationId: string;
      originWorkerEpoch: string;
      intentRevision: number;
      intentDigest: string;
    }
  | {
      type: 'RECOVER_AND_LOAD_SETTINGS';
      commandId: string;
      dataEpoch: string;
      requestId: string;
      resetCorrelation: SettingsResetCorrelationV1 | null;
    }
  | {
      type: 'RESERVE_SETTINGS_STORAGE';
      commandId: string;
      dataEpoch: string;
      mutationId: string;
      commandDigest: string;
      baseRevision: number;
      baseGeneration: number;
      previousDigest: string;
      candidateDigest: string;
      correlationIds: string[];
      reservationId: string;
      byteProjection: SettingsMutationByteProjectionV1;
    }
  | {
      type: 'VERIFY_SETTINGS_HOST_PERMISSIONS';
      commandId: string;
      dataEpoch: string;
      mutationId: string;
      commandDigest: string;
      baseRevision: number;
      baseGeneration: number;
      previousDigest: string;
      candidateDigest: string;
      correlationIds: string[];
      permissionCheckId: string;
      activationId: string;
      activationResultId: string;
      origins: string[];
      originDigest: string;
      storageReservationProof: SettingsGlobalStorageReservationProofV1;
    }
  | {
      type: 'COMPARE_AND_SETTLE_SETTINGS';
      commandId: string;
      dataEpoch: string;
      mutationId: string;
      commandDigest: string;
      baseRevision: number;
      baseGeneration: number;
      previousDigest: string;
      candidateDigest: string;
      correlationIds: string[];
      previousSettings: AppSettings;
      candidateSettings: AppSettings;
      permissionProof: SettingsHostPermissionContainsProofV1 | null;
      expectedAlarm: AutoScanAlarmExpectationV1;
      storageReservationProof: SettingsGlobalStorageReservationProofV1;
    }
  | {
      type: 'RECOVER_SETTINGS_TRANSACTION';
      commandId: string;
      dataEpoch: string;
      requestId: string;
      mutationId: string;
      commandDigest: string;
      baseRevision: number;
      baseGeneration: number;
      previousDigest: string;
      candidateDigest: string;
      correlationIds: string[];
      storageReservationProof: SettingsGlobalStorageReservationProofV1;
    }
  | {
      type: 'REBASE_SETTINGS_MUTATION';
      commandId: string;
      dataEpoch: string;
      requestId: string;
      mutationId: string;
    }
  | {
      type: 'ABORT_SETTINGS_MUTATION';
      commandId: string;
      dataEpoch: string;
      requestId: string;
      mutationId: string;
      commandDigest: string;
      baseRevision: number;
      baseGeneration: number;
      previousDigest: string;
      candidateDigest: string;
      correlationIds: string[];
      storageReservationProof: SettingsGlobalStorageReservationProofV1 | null;
    }
  | {
      type: 'RECONCILE_SETTINGS';
      commandId: string;
      dataEpoch: string;
      requestId: string;
      mutationId: string;
      commandDigest: string;
      baseRevision: number;
      baseGeneration: number;
      previousDigest: string;
      candidateDigest: string;
      correlationIds: string[];
      storageReservationProof: SettingsGlobalStorageReservationProofV1 | null;
      reason: ReconcileReason;
    };

export interface SettingsPersistenceInput {
  dataEpoch: string;
  workerEpoch: string;
  defaultSettings: AppSettings;
  includedConnectorIds: string[];
  permissionOriginsByConnectorId: Record<string, string[]>;
  initialLoadRequestId: string;
  coldStartSeed: unknown | null;
}

export type SettingsDeferredPersistenceCommand = Exclude<
  SettingsPersistenceCommand,
  | { type: 'PERSIST_SETTINGS_PENDING_INTENT' }
  | { type: 'CLEAR_SETTINGS_PENDING_INTENT' }
  | { type: 'RECOVER_AND_LOAD_SETTINGS' }
>;

export interface SettingsPersistenceContext {
  dataEpoch: string;
  workerEpoch: string;
  defaultSettings: AppSettings;
  includedConnectorIds: string[];
  permissionOriginsByConnectorId: Record<string, string[]>;
  coldStartSeedProvided: boolean;
  coldStartSeed: SettingsColdStartRecoverySeedV1 | null;
  loadStatus: 'loading' | 'reset_pending' | 'ready' | 'error';
  loadRequestId: string;
  phase: TransactionPhase;
  canonical: SettingsSnapshotV1 | null;
  projected: AppSettings;
  mutation: SettingMutation | null;
  mutationOutcome: MutationOutcomeKnowledge;
  canonicalKnowledge: CanonicalKnowledge;
  canonicalRelation: CanonicalRelation;
  retryIntent: RetryIntent | null;
  handledActivationIds: string[];
  handledActivationResultIds: string[];
  pendingIntent: SettingsPendingIntentV1 | null;
  deferredCommand: SettingsDeferredPersistenceCommand | null;
  pendingTerminalSettlement: SettingsTerminalSettlementV1 | null;
  pendingTerminalTarget: 'saved' | 'failed' | 'reset_pending' | 'reset_loading' | null;
  terminalSettlement: SettingsTerminalSettlementV1 | null;
  pendingReset: PendingSettingsReset | null;
  reconcileRequestId: string | null;
  reconcileReason: ReconcileReason | null;
  runtimeEffectError: SettingsPersistenceError | null;
  error: SettingsPersistenceError | null;
  lastRejection: SettingsPersistenceError | null;
  command: SettingsPersistenceCommand | null;
}

type EpochScoped = { dataEpoch: string };
type MutationScoped = EpochScoped & { mutationId: string };

export type SettingsPersistenceRawEvent =
  | (EpochScoped & { type: 'LOAD'; requestId: string })
  | (EpochScoped & {
      type: 'LOAD_SUCCEEDED';
      requestId: string;
      commandId: string;
      snapshot: SettingsSnapshotV1;
    })
  | (EpochScoped & {
      type: 'LOAD_FAILED';
      requestId: string;
      commandId: string;
      error: SettingsPersistenceError;
    })
  | (EpochScoped & {
      type: 'MUTATE';
      mutationId: string;
      permissionCheckId: string;
      activationId: string;
      storageReservationId: string;
      activationResult: SettingsActivationRegistryResultV1;
      key: PersistentSettingKey;
      candidate: unknown;
    })
  | (MutationScoped & {
      type: 'STORAGE_RESERVATION_GRANTED';
      commandId: string;
      proof: SettingsGlobalStorageReservationProofV1;
    })
  | (MutationScoped & {
      type: 'STORAGE_RESERVATION_DENIED';
      commandId: string;
      denial: SettingsGlobalStorageReservationDenialV1;
      error: SettingsPersistenceError;
    })
  | (MutationScoped & {
      type: 'HOST_PERMISSIONS_VERIFIED';
      commandId: string;
      proof: SettingsHostPermissionContainsProofV1;
    })
  | (MutationScoped & {
      type: 'HOST_PERMISSIONS_MISSING';
      commandId: string;
      snapshot: SettingsSnapshotV1;
      error: SettingsPersistenceError;
    })
  | (MutationScoped & {
      type: 'HOST_PERMISSIONS_OUTCOME_UNKNOWN';
      commandId: string;
      nextRequestId: string;
      error: SettingsPersistenceError;
    })
  | (MutationScoped & { type: 'SAVE_SUCCEEDED'; commandId: string; snapshot: SettingsSnapshotV1 })
  | (MutationScoped & {
      type: 'SAVE_FAILED';
      commandId: string;
      nextRequestId: string;
      error: SettingsPersistenceError;
    })
  | (MutationScoped & {
      type: 'RUNTIME_EFFECT_FAILED';
      commandId: string;
      recoveryRequestId: string;
      journalProof: SettingsJournalProofV1;
      error: SettingsPersistenceError;
    })
  | (MutationScoped & {
      type: 'COMPENSATION_SUCCEEDED';
      requestId: string;
      commandId: string;
      snapshot: SettingsSnapshotV1;
    })
  | (MutationScoped & {
      type: 'COMPENSATION_FAILED';
      requestId: string;
      commandId: string;
      nextRequestId: string;
      error: SettingsPersistenceError;
    })
  | (EpochScoped & {
      type: 'RETRY';
      failedMutationId: string;
      mutationId: string;
      permissionCheckId: string;
      activationId: string;
      storageReservationId: string;
      activationResult: SettingsActivationRegistryResultV1;
      requestId: string;
    })
  | (MutationScoped & {
      type: 'RETRY_READY';
      requestId: string;
      commandId: string;
      snapshot: SettingsSnapshotV1;
    })
  | (MutationScoped & {
      type: 'RETRY_FAILED';
      requestId: string;
      commandId: string;
      nextRequestId: string;
      error: SettingsPersistenceError;
    })
  | (MutationScoped & { type: 'CANCEL'; requestId: string })
  | (MutationScoped & {
      type: 'CANCEL_CONFIRMED';
      requestId: string;
      commandId: string;
      snapshot: SettingsSnapshotV1;
    })
  | (MutationScoped & {
      type: 'CANCEL_OUTCOME_UNKNOWN';
      requestId: string;
      commandId: string;
      nextRequestId: string;
      error: SettingsPersistenceError;
    })
  | (MutationScoped & { type: 'DISMISS_ERROR' })
  | (EpochScoped & { type: 'SERVICE_WORKER_RESTARTED'; requestId: string })
  | (MutationScoped & {
      type: 'PROTOCOL_UNCERTAIN';
      nextRequestId: string;
      error: SettingsPersistenceError;
    })
  | (EpochScoped & {
      type: 'RECONCILED';
      requestId: string;
      commandId: string;
      snapshot: SettingsSnapshotV1;
    })
  | (EpochScoped & {
      type: 'RECONCILE_FAILED';
      requestId: string;
      commandId: string;
      error: SettingsPersistenceError;
    })
  | (EpochScoped & { type: 'RETRY_RECONCILIATION'; requestId: string })
  | (MutationScoped & {
      type: 'SETTINGS_PENDING_INTENT_PERSISTED';
      commandId: string;
      proof: SettingsPendingIntentPersistedProofV1;
    })
  | (MutationScoped & {
      type: 'SETTINGS_PENDING_INTENT_CLEARED';
      commandId: string;
      proof: SettingsPendingIntentClearedProofV1;
    })
  | (MutationScoped & {
      type: 'SETTINGS_PENDING_INTENT_PERSIST_FAILED';
      commandId: string;
      proof: SettingsPendingIntentAbsentProofV1;
      error: SettingsPersistenceError;
    })
  | (MutationScoped & {
      type: 'SETTINGS_PENDING_INTENT_PERSIST_OUTCOME_UNKNOWN';
      commandId: string;
      error: SettingsPersistenceError;
    })
  | (MutationScoped & {
      type: 'SETTINGS_PENDING_INTENT_CLEAR_OUTCOME_UNKNOWN';
      commandId: string;
      error: SettingsPersistenceError;
    })
  | (EpochScoped & {
      type: 'CANONICAL_UPDATED';
      broadcastId: string;
      snapshot: SettingsSnapshotV1;
      nextRequestId: string;
    })
  | { type: 'RESET_EPOCH_READY_TO_COMMIT'; payload: unknown }
  | {
      type: 'RESET_EPOCH_COMMITTED';
      payload: unknown;
      resetFenceProof?: unknown;
    };

export type NormalizedSettingsEventType<T extends SettingsPersistenceRawEvent['type']> =
  `SETTINGS_CAPTURED/${T}`;

type NormalizeSettingsEvent<E> = E extends {
  type: 'RESET_EPOCH_READY_TO_COMMIT';
}
  ? Readonly<{
      type: 'SETTINGS_CAPTURED/RESET_EPOCH_READY_TO_COMMIT';
      payload: LocalDataResetEpochEventV1;
    }>
  : E extends { type: 'RESET_EPOCH_COMMITTED' }
    ? Readonly<{
        type: 'SETTINGS_CAPTURED/RESET_EPOCH_COMMITTED';
        payload: LocalDataResetEpochEventV1;
        resetFenceProof?: ResetFenceProofV1;
      }>
    : E extends { type: infer T extends string }
      ? Readonly<Omit<E, 'type'> & { type: `SETTINGS_CAPTURED/${T}` }>
      : never;

/**
 * Internal statechart event produced by `normalizeSettingsPersistenceEvent`.
 * Normalization alone grants no dispatch authority; only the controller's
 * synchronous dispatch-scoped capability can admit this object to XState.
 */
export type SettingsPersistenceEvent = NormalizeSettingsEvent<SettingsPersistenceRawEvent>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
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
const PRE_THEME_SETTINGS_KEYS = SETTINGS_KEYS.filter((key) => key !== 'theme');
const themes = new Set<ThemePreference>(['light', 'dark', 'system']);
export const MAX_SETTINGS_OUTCOMES_PER_EPOCH = 4096;
export const MAX_SETTINGS_ENVELOPE_ENCODED_BYTES = 1_048_576;
export const SETTINGS_ENVELOPE_HEADROOM_BYTES = 65_536;
export const MAX_SETTLED_SETTINGS_ENVELOPE_BYTES =
  MAX_SETTINGS_ENVELOPE_ENCODED_BYTES - SETTINGS_ENVELOPE_HEADROOM_BYTES;
export const MAX_SETTINGS_DIGEST_BYTES = 1_024;
export const MAX_SETTINGS_COMMAND_DIGEST_BYTES = 4_096;
export const MAX_SETTINGS_CORRELATION_IDS = 32;
export const SETTINGS_STORAGE_KEY = 'settings' as const;
export const SETTINGS_PENDING_INTENT_STORAGE_KEY = 'missionpulse.settingsPendingIntent.v1' as const;
export const MAX_SETTINGS_PENDING_INTENT_ENCODED_BYTES = 262_144;
export const LOCAL_DATA_RESET_RECEIPT_STORAGE_KEY =
  'missionpulse.localDataResetReceipt.v1' as const;
export const LOCAL_DATA_RESET_RECEIPT_RESERVE_BYTES = 8_192;
export const SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES = 65_536;

export const settingsRevisionHasMutationCapacity = (revision: number): boolean =>
  Number.isSafeInteger(revision) && revision >= 0 && revision <= Number.MAX_SAFE_INTEGER - 2;

export const settingsGenerationHasMutationCapacity = (generation: number): boolean =>
  Number.isSafeInteger(generation) && generation >= 0 && generation <= Number.MAX_SAFE_INTEGER - 4;

export const utf8ByteLength = (value: string): number => new TextEncoder().encode(value).byteLength;

export const isUuidV4 = (value: unknown): value is string =>
  typeof value === 'string' && UUID_V4.test(value);

/**
 * Proves that epoch identities cannot be reused by mutation-scoped identities.
 * Callers pass `null` when no worker epoch exists at that boundary.
 */
export function settingsIdentitiesAreDisjointFromEpochs(
  dataEpoch: unknown,
  originWorkerEpoch: unknown | null,
  identityIds: readonly unknown[]
): boolean {
  const epochs = originWorkerEpoch === null ? [dataEpoch] : [dataEpoch, originWorkerEpoch];
  return (
    epochs.every(isUuidV4) &&
    new Set(epochs).size === epochs.length &&
    identityIds.every(isUuidV4) &&
    identityIds.every((id) => !epochs.includes(id))
  );
}

/**
 * Reads one exact JSON-shaped object without evaluating an accessor.
 *
 * Boundary decoders must consume the returned snapshot, never the untrusted
 * source. Symbols, inherited fields, accessors and non-enumerable fields are
 * rejected. A transparent Proxy can only contribute copied descriptor values;
 * a revoked or throwing reflection trap fails closed. No property getter is
 * ever read by this decoder.
 */
export function readStrictJsonRecord(
  value: unknown,
  expectedKeys: readonly string[]
): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  try {
    if (Array.isArray(value)) {
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

/** Reads a dense, exact, ordinary JSON array without evaluating accessors. */
export function readStrictJsonArray(value: unknown): unknown[] | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  try {
    if (!Array.isArray(value)) {
      return null;
    }
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      return null;
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      lengthDescriptor === undefined ||
      !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      Number(lengthDescriptor.value) < 0
    ) {
      return null;
    }
    const length = Number(lengthDescriptor.value);
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== length + 1 ||
      ownKeys.some(
        (key) =>
          typeof key !== 'string' ||
          (key !== 'length' &&
            (!/^(0|[1-9]\d*)$/.test(key) ||
              !Number.isSafeInteger(Number(key)) ||
              Number(key) >= length))
      )
    ) {
      return null;
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const key = String(index);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
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
export const cloneSettings = (settings: AppSettings): AppSettings => ({
  ...settings,
  enabledConnectors: [...settings.enabledConnectors],
});
export const clonePermissionMap = (map: Record<string, string[]>): Record<string, string[]> =>
  Object.fromEntries(Object.entries(map).map(([id, origins]) => [id, [...origins]]));

export const normalizeCorrelationIds = (ids: string[]): string[] => [...new Set(ids)].sort();

function parseCorrelationIds(value: unknown, requiredId?: string): string[] | null {
  const ids = readStrictJsonArray(value);
  if (ids === null || ids.length < 1 || ids.length > MAX_SETTINGS_CORRELATION_IDS) {
    return null;
  }
  if (
    !ids.every(isUuidV4) ||
    new Set(ids).size !== ids.length ||
    ![...ids].sort().every((id, index) => id === ids[index]) ||
    (requiredId !== undefined && !ids.includes(requiredId))
  ) {
    return null;
  }
  return [...ids];
}

const validCorrelationIds = (value: unknown, requiredId?: string): value is string[] =>
  parseCorrelationIds(value, requiredId) !== null;

export function normalizeSettings(settings: AppSettings): AppSettings {
  return { ...settings, enabledConnectors: [...new Set(settings.enabledConnectors)].sort() };
}

export function settingsDigest(settings: AppSettings): string {
  const s = normalizeSettings(settings);
  return `settings/v1:${JSON.stringify([s.scanIntervalMinutes, s.enabledConnectors, s.notifications, s.autoScan, s.maxSemanticPerScan, s.notificationScoreThreshold, s.respectRateLimits, s.customDelayMs, s.theme])}`;
}

export function parseSettingsDigest(value: unknown): AppSettings | null {
  if (
    typeof value !== 'string' ||
    !value.startsWith('settings/v1:') ||
    utf8ByteLength(value) > MAX_SETTINGS_DIGEST_BYTES
  ) {
    return null;
  }
  try {
    const tuple = readStrictJsonArray(JSON.parse(value.slice('settings/v1:'.length)));
    if (tuple === null || tuple.length !== 9) {
      return null;
    }
    const connectors = readStrictJsonArray(tuple[1]);
    if (
      !Number.isInteger(tuple[0]) ||
      Number(tuple[0]) < 1 ||
      Number(tuple[0]) > 1440 ||
      connectors === null ||
      !connectors.every((id): id is string => typeof id === 'string' && id.length > 0) ||
      new Set(connectors).size !== connectors.length ||
      ![...connectors].sort().every((id, index) => id === connectors[index]) ||
      typeof tuple[2] !== 'boolean' ||
      typeof tuple[3] !== 'boolean' ||
      !Number.isInteger(tuple[4]) ||
      Number(tuple[4]) < 0 ||
      Number(tuple[4]) > 100 ||
      !Number.isInteger(tuple[5]) ||
      Number(tuple[5]) < 0 ||
      Number(tuple[5]) > 100 ||
      typeof tuple[6] !== 'boolean' ||
      !Number.isInteger(tuple[7]) ||
      Number(tuple[7]) < 0 ||
      Number(tuple[7]) > 60_000 ||
      typeof tuple[8] !== 'string' ||
      !themes.has(tuple[8] as ThemePreference)
    ) {
      return null;
    }
    const settings: AppSettings = {
      scanIntervalMinutes: Number(tuple[0]),
      enabledConnectors: [...connectors],
      notifications: tuple[2],
      autoScan: tuple[3],
      maxSemanticPerScan: Number(tuple[4]),
      notificationScoreThreshold: Number(tuple[5]),
      respectRateLimits: tuple[6],
      customDelayMs: Number(tuple[7]),
      theme: tuple[8] as ThemePreference,
    };
    return settingsDigest(settings) === value ? settings : null;
  } catch {
    return null;
  }
}

export const sameSettings = (left: AppSettings, right: AppSettings): boolean =>
  settingsDigest(left) === settingsDigest(right);
export const originDigest = (origins: string[]): string =>
  `origins/v1:${JSON.stringify([...new Set(origins)].sort())}`;

export function parseOriginDigest(value: unknown): string[] | null {
  if (
    typeof value !== 'string' ||
    !value.startsWith('origins/v1:') ||
    utf8ByteLength(value) > MAX_SETTINGS_COMMAND_DIGEST_BYTES
  ) {
    return null;
  }
  try {
    const tuple = readStrictJsonArray(JSON.parse(value.slice('origins/v1:'.length)));
    if (
      tuple === null ||
      !tuple.every(
        (origin): origin is string =>
          typeof origin === 'string' && origin.length > 0 && origin.length <= 2048
      ) ||
      new Set(tuple).size !== tuple.length ||
      ![...tuple].sort().every((origin, index) => origin === tuple[index])
    ) {
      return null;
    }
    return originDigest(tuple) === value ? [...tuple] : null;
  } catch {
    return null;
  }
}

export interface DecodedSettingsCommandDigest {
  dataEpoch: string;
  mutationId: string;
  baseRevision: number;
  baseGeneration: number;
  previousDigest: string;
  candidateDigest: string;
  originDigest: string;
  baseCorrelationIds: string[];
}

export function settingsCommandDigest(input: DecodedSettingsCommandDigest): string {
  return `command/v2:${JSON.stringify([
    input.dataEpoch,
    input.mutationId,
    input.baseRevision,
    input.baseGeneration,
    input.previousDigest,
    input.candidateDigest,
    input.originDigest,
    input.baseCorrelationIds,
  ])}`;
}

export function parseSettingsCommandDigest(value: unknown): DecodedSettingsCommandDigest | null {
  if (
    typeof value !== 'string' ||
    !value.startsWith('command/v2:') ||
    utf8ByteLength(value) > MAX_SETTINGS_COMMAND_DIGEST_BYTES
  ) {
    return null;
  }
  try {
    const tuple = readStrictJsonArray(JSON.parse(value.slice('command/v2:'.length)));
    if (
      tuple === null ||
      tuple.length !== 8 ||
      !isUuidV4(tuple[0]) ||
      !isUuidV4(tuple[1]) ||
      !Number.isSafeInteger(tuple[2]) ||
      Number(tuple[2]) < 0 ||
      !Number.isSafeInteger(tuple[3]) ||
      Number(tuple[3]) < 0 ||
      parseSettingsDigest(tuple[4]) === null ||
      parseSettingsDigest(tuple[5]) === null ||
      parseOriginDigest(tuple[6]) === null ||
      !validCorrelationIds(tuple[7], tuple[1]) ||
      !settingsIdentitiesAreDisjointFromEpochs(tuple[0], null, tuple[7] as unknown[])
    ) {
      return null;
    }
    const decoded: DecodedSettingsCommandDigest = {
      dataEpoch: tuple[0],
      mutationId: tuple[1],
      baseRevision: Number(tuple[2]),
      baseGeneration: Number(tuple[3]),
      previousDigest: tuple[4] as string,
      candidateDigest: tuple[5] as string,
      originDigest: tuple[6] as string,
      baseCorrelationIds: [...(tuple[7] as string[])],
    };
    return settingsCommandDigest(decoded) === value ? decoded : null;
  } catch {
    return null;
  }
}

export const isBoundedSettingsCommandDigest = (value: string): boolean =>
  parseSettingsCommandDigest(value) !== null;
export const commandId = (
  kind:
    | 'load'
    | 'persist_intent'
    | 'clear_intent'
    | 'reserve'
    | 'permission_check'
    | 'write'
    | 'recover'
    | 'rebase'
    | 'abort'
    | 'reconcile',
  id: string
): string => `settings/${kind}/${id}`;

export function isSettingsCommandId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const match =
    /^settings\/(load|persist_intent|clear_intent|reserve|permission_check|write|recover|rebase|abort|reconcile)\/(.+)$/.exec(
      value
    );
  return match !== null && isUuidV4(match[2]);
}

export function parseSettingsActivationRegistryResultV1(
  value: unknown,
  expected: {
    dataEpoch: string;
    workerEpoch: string;
    mutationId: string;
    permissionCheckId: string;
    activationId: string;
    storageReservationId: string;
  }
): SettingsActivationRegistryResultV1 | null {
  const consumed = readStrictJsonRecord(value, [
    'version',
    'kind',
    'dataEpoch',
    'workerEpoch',
    'mutationId',
    'permissionCheckId',
    'activationId',
    'storageReservationId',
    'issuedAtMs',
    'expiresAtMs',
    'observedAtMs',
    'resultId',
    'oneShotConsumed',
  ]);
  const rejected = readStrictJsonRecord(value, [
    'version',
    'kind',
    'dataEpoch',
    'workerEpoch',
    'mutationId',
    'permissionCheckId',
    'activationId',
    'storageReservationId',
    'issuedAtMs',
    'expiresAtMs',
    'observedAtMs',
    'resultId',
    'reason',
  ]);
  const record = consumed ?? rejected;
  if (record === null) {
    return null;
  }
  const identityIds = [
    record.mutationId,
    record.permissionCheckId,
    record.activationId,
    record.storageReservationId,
    record.resultId,
  ];
  if (
    record.version !== 1 ||
    record.dataEpoch !== expected.dataEpoch ||
    record.workerEpoch !== expected.workerEpoch ||
    record.mutationId !== expected.mutationId ||
    record.permissionCheckId !== expected.permissionCheckId ||
    record.activationId !== expected.activationId ||
    record.storageReservationId !== expected.storageReservationId ||
    !isUuidV4(record.dataEpoch) ||
    !isUuidV4(record.workerEpoch) ||
    !identityIds.every(isUuidV4) ||
    new Set(identityIds).size !== identityIds.length ||
    identityIds.includes(record.dataEpoch) ||
    identityIds.includes(record.workerEpoch) ||
    record.dataEpoch === record.workerEpoch ||
    !isSafeNonNegativeInteger(record.issuedAtMs) ||
    !isSafeNonNegativeInteger(record.expiresAtMs) ||
    !isSafeNonNegativeInteger(record.observedAtMs) ||
    Number(record.expiresAtMs) <= Number(record.issuedAtMs) ||
    Number(record.expiresAtMs) - Number(record.issuedAtMs) > SETTINGS_ACTIVATION_MAX_LIFETIME_MS ||
    Number(record.observedAtMs) < Number(record.issuedAtMs)
  ) {
    return null;
  }
  const base = {
    version: 1 as const,
    dataEpoch: expected.dataEpoch,
    workerEpoch: expected.workerEpoch,
    mutationId: expected.mutationId,
    permissionCheckId: expected.permissionCheckId,
    activationId: expected.activationId,
    storageReservationId: expected.storageReservationId,
    issuedAtMs: Number(record.issuedAtMs),
    expiresAtMs: Number(record.expiresAtMs),
    observedAtMs: Number(record.observedAtMs),
    resultId: record.resultId as string,
  };
  if (consumed !== null) {
    return consumed.kind === 'SETTINGS_ACTIVATION_CONSUMED' &&
      consumed.oneShotConsumed === true &&
      Number(consumed.observedAtMs) <= Number(consumed.expiresAtMs)
      ? { ...base, kind: 'SETTINGS_ACTIVATION_CONSUMED', oneShotConsumed: true }
      : null;
  }
  const reason = rejected?.reason;
  if (
    rejected?.kind !== 'SETTINGS_ACTIVATION_REJECTED' ||
    !['expired', 'replayed', 'crossed'].includes(String(reason)) ||
    (reason === 'expired' && Number(rejected.observedAtMs) <= Number(rejected.expiresAtMs))
  ) {
    return null;
  }
  return {
    ...base,
    kind: 'SETTINGS_ACTIVATION_REJECTED',
    reason: reason as 'expired' | 'replayed' | 'crossed',
  };
}

export function parseSettingsHostPermissionContainsProofV1(
  value: unknown,
  expected: {
    dataEpoch: string;
    mutationId: string;
    permissionCheckId: string;
    activationId: string;
    activationResultId: string;
    origins: string[];
  }
): SettingsHostPermissionContainsProofV1 | null {
  const record = readStrictJsonRecord(value, [
    'version',
    'dataEpoch',
    'mutationId',
    'permissionCheckId',
    'activationId',
    'activationResultId',
    'originDigest',
    'verifiedOrigins',
    'containsVerified',
  ]);
  const verifiedOrigins = readStrictJsonArray(record?.verifiedOrigins);
  if (record === null || verifiedOrigins === null) {
    return null;
  }

  const expectedOrigins = [...new Set(expected.origins)].sort();
  if (
    record.version !== 1 ||
    record.dataEpoch !== expected.dataEpoch ||
    record.mutationId !== expected.mutationId ||
    record.permissionCheckId !== expected.permissionCheckId ||
    record.activationId !== expected.activationId ||
    record.activationResultId !== expected.activationResultId ||
    !isUuidV4(record.dataEpoch) ||
    !isUuidV4(record.mutationId) ||
    !isUuidV4(record.permissionCheckId) ||
    !isUuidV4(record.activationId) ||
    !isUuidV4(record.activationResultId) ||
    new Set([
      record.mutationId,
      record.permissionCheckId,
      record.activationId,
      record.activationResultId,
    ]).size !== 4 ||
    record.containsVerified !== true ||
    !verifiedOrigins.every((origin): origin is string => typeof origin === 'string') ||
    new Set(verifiedOrigins).size !== verifiedOrigins.length ||
    ![...verifiedOrigins].sort().every((origin, index) => origin === verifiedOrigins[index]) ||
    verifiedOrigins.length !== expectedOrigins.length ||
    !verifiedOrigins.every((origin, index) => origin === expectedOrigins[index]) ||
    record.originDigest !== originDigest(expectedOrigins)
  ) {
    return null;
  }
  return {
    version: 1,
    dataEpoch: expected.dataEpoch,
    mutationId: expected.mutationId,
    permissionCheckId: expected.permissionCheckId,
    activationId: expected.activationId,
    activationResultId: expected.activationResultId,
    originDigest: record.originDigest,
    verifiedOrigins: [...verifiedOrigins],
    containsVerified: true,
  };
}

export function isSettingsHostPermissionContainsProofV1(
  value: unknown,
  expected: {
    dataEpoch: string;
    mutationId: string;
    permissionCheckId: string;
    activationId: string;
    activationResultId: string;
    origins: string[];
  }
): value is SettingsHostPermissionContainsProofV1 {
  return parseSettingsHostPermissionContainsProofV1(value, expected) !== null;
}

export function parseStrictSettings(value: unknown, includedIds: string[]): AppSettings | null {
  const record = readStrictJsonRecord(value, SETTINGS_KEYS);
  const connectors = readStrictJsonArray(record?.enabledConnectors);
  if (record === null || connectors === null) {
    return null;
  }
  const included = new Set(includedIds);
  if (
    !Number.isInteger(record.scanIntervalMinutes) ||
    Number(record.scanIntervalMinutes) < 1 ||
    Number(record.scanIntervalMinutes) > 1440 ||
    !connectors.every((id): id is string => typeof id === 'string' && included.has(id)) ||
    new Set(connectors).size !== connectors.length ||
    ![...connectors].sort().every((id, index) => id === connectors[index]) ||
    typeof record.notifications !== 'boolean' ||
    typeof record.autoScan !== 'boolean' ||
    !Number.isInteger(record.maxSemanticPerScan) ||
    Number(record.maxSemanticPerScan) < 0 ||
    Number(record.maxSemanticPerScan) > 100 ||
    !Number.isInteger(record.notificationScoreThreshold) ||
    Number(record.notificationScoreThreshold) < 0 ||
    Number(record.notificationScoreThreshold) > 100 ||
    typeof record.respectRateLimits !== 'boolean' ||
    !Number.isInteger(record.customDelayMs) ||
    Number(record.customDelayMs) < 0 ||
    Number(record.customDelayMs) > 60_000 ||
    typeof record.theme !== 'string' ||
    !themes.has(record.theme as ThemePreference)
  ) {
    return null;
  }
  const snapshot: AppSettings = {
    scanIntervalMinutes: Number(record.scanIntervalMinutes),
    enabledConnectors: [...connectors],
    notifications: record.notifications,
    autoScan: record.autoScan,
    maxSemanticPerScan: Number(record.maxSemanticPerScan),
    notificationScoreThreshold: Number(record.notificationScoreThreshold),
    respectRateLimits: record.respectRateLimits,
    customDelayMs: Number(record.customDelayMs),
    theme: record.theme as ThemePreference,
  };
  return utf8ByteLength(settingsDigest(snapshot)) <= MAX_SETTINGS_DIGEST_BYTES ? snapshot : null;
}

export function isStrictSettings(value: unknown, includedIds: string[]): value is AppSettings {
  return parseStrictSettings(value, includedIds) !== null;
}

function decodeBareLegacySettings(
  value: unknown,
  includedIds: string[],
  withTheme: boolean
): AppSettings | null {
  const keys = withTheme ? SETTINGS_KEYS : PRE_THEME_SETTINGS_KEYS;
  const record = readStrictJsonRecord(value, keys);
  const connectors = readStrictJsonArray(record?.enabledConnectors);
  if (record === null || connectors === null) {
    return null;
  }

  const theme = withTheme ? record.theme : 'system';
  if (
    !Number.isInteger(record.scanIntervalMinutes) ||
    Number(record.scanIntervalMinutes) < 1 ||
    Number(record.scanIntervalMinutes) > 1440 ||
    !connectors.every((id) => typeof id === 'string') ||
    typeof record.notifications !== 'boolean' ||
    typeof record.autoScan !== 'boolean' ||
    !Number.isInteger(record.maxSemanticPerScan) ||
    Number(record.maxSemanticPerScan) < 0 ||
    Number(record.maxSemanticPerScan) > 100 ||
    !Number.isInteger(record.notificationScoreThreshold) ||
    Number(record.notificationScoreThreshold) < 0 ||
    Number(record.notificationScoreThreshold) > 100 ||
    typeof record.respectRateLimits !== 'boolean' ||
    !Number.isInteger(record.customDelayMs) ||
    Number(record.customDelayMs) < 0 ||
    Number(record.customDelayMs) > 60_000 ||
    typeof theme !== 'string' ||
    !themes.has(theme as ThemePreference)
  ) {
    return null;
  }

  const included = new Set(includedIds);
  const migratedConnectors = [...new Set(connectors.filter((id) => included.has(id)))].sort();
  return {
    scanIntervalMinutes: Number(record.scanIntervalMinutes),
    enabledConnectors: migratedConnectors as string[],
    notifications: record.notifications,
    autoScan: record.autoScan,
    maxSemanticPerScan: Number(record.maxSemanticPerScan),
    notificationScoreThreshold: Number(record.notificationScoreThreshold),
    respectRateLimits: record.respectRateLimits,
    customDelayMs: Number(record.customDelayMs),
    theme: theme as ThemePreference,
  };
}

export function decodeSettingsStorage(
  value: unknown,
  dataEpoch: string,
  includedIds: string[],
  defaultSettings: AppSettings,
  legacyPolicy: 'allow_migration' | 'v2_only'
): SettingsStorageDecodeResult {
  if (value === undefined) {
    return legacyPolicy === 'allow_migration'
      ? {
          kind: 'initialize',
          revision: 0,
          generation: 0,
          settings: normalizeSettings(defaultSettings),
        }
      : { kind: 'invalid' };
  }
  const currentEnvelope = parseSettingsEnvelopeV2(value, dataEpoch, includedIds);
  if (currentEnvelope !== null) {
    return { kind: 'current', envelope: currentEnvelope };
  }
  if (legacyPolicy === 'v2_only') {
    return { kind: 'invalid' };
  }
  const legacyV1 = readStrictJsonRecord(value, ['version', 'revision', 'settings']);
  const legacySettings =
    legacyV1 === null ? null : parseStrictSettings(legacyV1.settings, includedIds);
  if (
    legacyV1 !== null &&
    legacyV1.version === 1 &&
    Number.isSafeInteger(legacyV1.revision) &&
    Number(legacyV1.revision) >= 0 &&
    legacySettings !== null
  ) {
    return {
      kind: 'migrate_v1',
      revision: Number(legacyV1.revision),
      generation: 0,
      settings: legacySettings,
    };
  }

  const current = decodeBareLegacySettings(value, includedIds, true);
  if (current) {
    return { kind: 'migrate_bare_current', revision: 0, generation: 0, settings: current };
  }
  const preTheme = decodeBareLegacySettings(value, includedIds, false);
  if (preTheme) {
    return { kind: 'migrate_bare_pre_theme', revision: 0, generation: 0, settings: preTheme };
  }
  return { kind: 'invalid' };
}

export const expectedAlarm = (settings: AppSettings): AutoScanAlarmExpectationV1 => ({
  version: 1,
  kind: 'AUTO_SCAN_ALARM',
  alarmName: 'auto-scan',
  enabled: settings.autoScan,
  periodInMinutes: settings.autoScan ? settings.scanIntervalMinutes : null,
});

const canonicalSettingsTuple = (settings: AppSettings): unknown[] => {
  const normalized = normalizeSettings(settings);
  return [
    normalized.scanIntervalMinutes,
    normalized.enabledConnectors,
    normalized.notifications,
    normalized.autoScan,
    normalized.maxSemanticPerScan,
    normalized.notificationScoreThreshold,
    normalized.respectRateLimits,
    normalized.customDelayMs,
    normalized.theme,
  ];
};

const canonicalAlarmTuple = (alarm: AutoScanAlarmExpectationV1): unknown[] => [
  alarm.version,
  alarm.kind,
  alarm.alarmName,
  alarm.enabled,
  alarm.periodInMinutes,
];

const canonicalJournalTuple = (journal: SettingsDurableJournalV1): unknown[] => [
  journal.version,
  journal.phase,
  journal.transactionId,
  journal.mutationId,
  journal.commandDigest,
  journal.baseRevision,
  journal.baseGeneration,
  journal.previousSettings ? canonicalSettingsTuple(journal.previousSettings) : null,
  canonicalSettingsTuple(journal.candidateSettings),
  journal.previousDigest,
  journal.candidateDigest,
  journal.correlationIds,
  canonicalAlarmTuple(journal.expectedAlarm),
];

const canonicalOutcomeTuple = (outcome: SettingsMutationOutcomeV1): unknown[] => [
  outcome.version,
  outcome.dataEpoch,
  outcome.mutationId,
  outcome.commandDigest,
  outcome.previousDigest,
  outcome.candidateDigest,
  outcome.baseRevision,
  outcome.baseGeneration,
  outcome.settledRevision,
  outcome.settledGeneration,
  outcome.correlationIds,
  outcome.outcome,
];

function canonicalEnvelopeEncoding(envelope: SettingsEnvelopeV2): string {
  return JSON.stringify([
    envelope.version,
    envelope.dataEpoch,
    envelope.revision,
    envelope.generation,
    canonicalSettingsTuple(envelope.settings),
    envelope.journal ? canonicalJournalTuple(envelope.journal) : null,
    envelope.outcomes.map(canonicalOutcomeTuple),
  ]);
}

export const settingsEnvelopeEncodedBytes = (envelope: SettingsEnvelopeV2): number =>
  utf8ByteLength(JSON.stringify(envelope));

export const settingsStorageEntryEncodedBytes = (envelope: SettingsEnvelopeV2): number =>
  utf8ByteLength(JSON.stringify({ [SETTINGS_STORAGE_KEY]: envelope }));

export const settingsEnvelopeDigest = (envelope: SettingsEnvelopeV2): string =>
  `envelope/v2:${canonicalEnvelopeEncoding(envelope)}`;

export function cloneSettingsEnvelope(envelope: SettingsEnvelopeV2): SettingsEnvelopeV2 {
  return {
    ...envelope,
    settings: cloneSettings(envelope.settings),
    journal: envelope.journal
      ? {
          ...envelope.journal,
          previousSettings: envelope.journal.previousSettings
            ? cloneSettings(envelope.journal.previousSettings)
            : null,
          candidateSettings: cloneSettings(envelope.journal.candidateSettings),
          correlationIds: [...envelope.journal.correlationIds],
          expectedAlarm: { ...envelope.journal.expectedAlarm },
        }
      : null,
    outcomes: envelope.outcomes.map((outcome) => ({
      ...outcome,
      correlationIds: [...outcome.correlationIds],
    })),
  };
}

export function cloneSettingsSnapshot(snapshot: SettingsSnapshotV1): SettingsSnapshotV1 {
  return {
    ...snapshot,
    envelope: cloneSettingsEnvelope(snapshot.envelope),
    alarmProof: { ...snapshot.alarmProof },
  };
}

export const settingsEnvelopeCorrelationIds = (envelope: SettingsEnvelopeV2): string[] => [
  ...envelope.outcomes.flatMap((outcome) => outcome.correlationIds),
  ...(envelope.journal?.correlationIds ?? []),
];

const quotaPlaceholderId = (index: number): string =>
  `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;

export function projectSettingsMutationBytes(
  envelope: SettingsEnvelopeV2,
  mutation: SettingMutation
): SettingsMutationByteProjectionV1 | null {
  if (
    envelope.journal !== null ||
    envelope.outcomes.length >= MAX_SETTINGS_OUTCOMES_PER_EPOCH ||
    !settingsRevisionHasMutationCapacity(envelope.revision) ||
    !settingsGenerationHasMutationCapacity(envelope.generation) ||
    !isBoundedSettingsCommandDigest(mutation.commandDigest) ||
    utf8ByteLength(mutation.previousDigest) > MAX_SETTINGS_DIGEST_BYTES ||
    utf8ByteLength(mutation.candidateDigest) > MAX_SETTINGS_DIGEST_BYTES ||
    !validCorrelationIds(mutation.correlationIds, mutation.mutationId)
  ) {
    return null;
  }

  const worstCorrelationIds = [
    mutation.mutationId,
    ...Array.from({ length: MAX_SETTINGS_CORRELATION_IDS - 1 }, (_, index) =>
      quotaPlaceholderId(index + 1)
    ),
  ].sort();
  const worstOutcome: SettingsMutationOutcomeV1 = {
    version: 1,
    dataEpoch: envelope.dataEpoch,
    mutationId: mutation.mutationId,
    commandDigest: mutation.commandDigest,
    previousDigest: mutation.previousDigest,
    candidateDigest: mutation.candidateDigest,
    baseRevision: mutation.baseRevision,
    baseGeneration: mutation.baseGeneration,
    settledRevision: Number.MAX_SAFE_INTEGER,
    settledGeneration: Number.MAX_SAFE_INTEGER,
    correlationIds: worstCorrelationIds,
    outcome: 'not_committed',
  };
  const settledProjection: SettingsEnvelopeV2 = {
    ...cloneSettingsEnvelope(envelope),
    revision: Number.MAX_SAFE_INTEGER,
    generation: Number.MAX_SAFE_INTEGER,
    settings: cloneSettings(mutation.candidateSettings),
    journal: null,
    outcomes: [...envelope.outcomes, worstOutcome],
  };
  const worstJournal: SettingsDurableJournalV1 = {
    version: 1,
    phase: 'compensation_effects_pending',
    transactionId: quotaPlaceholderId(0),
    mutationId: mutation.mutationId,
    commandDigest: mutation.commandDigest,
    baseRevision: mutation.baseRevision,
    baseGeneration: mutation.baseGeneration,
    previousSettings: cloneSettings(mutation.previousSettings),
    candidateSettings: cloneSettings(mutation.candidateSettings),
    previousDigest: mutation.previousDigest,
    candidateDigest: mutation.candidateDigest,
    correlationIds: worstCorrelationIds,
    expectedAlarm: expectedAlarm(mutation.previousSettings),
  };
  const journalProjection: SettingsEnvelopeV2 = {
    ...cloneSettingsEnvelope(envelope),
    revision: Number.MAX_SAFE_INTEGER,
    generation: Number.MAX_SAFE_INTEGER,
    settings: cloneSettings(mutation.previousSettings),
    journal: worstJournal,
  };
  const currentEnvelopeValueBytes = settingsEnvelopeEncodedBytes(envelope);
  const currentSettingsEntryBytes = settingsStorageEntryEncodedBytes(envelope);
  const maxJournalEnvelopeValueBytes = settingsEnvelopeEncodedBytes(journalProjection);
  const maxJournalSettingsEntryBytes = settingsStorageEntryEncodedBytes(journalProjection);
  const maxSettledEnvelopeValueBytes = settingsEnvelopeEncodedBytes(settledProjection);
  const maxSettledSettingsEntryBytes = settingsStorageEntryEncodedBytes(settledProjection);
  const reservedSettingsEntryBytes = Math.max(
    maxJournalSettingsEntryBytes,
    maxSettledSettingsEntryBytes
  );
  return {
    version: 1,
    settingsKey: SETTINGS_STORAGE_KEY,
    currentEnvelopeValueBytes,
    currentSettingsEntryBytes,
    maxJournalEnvelopeValueBytes,
    maxJournalSettingsEntryBytes,
    maxSettledEnvelopeValueBytes,
    maxSettledSettingsEntryBytes,
    reservedSettingsEntryBytes,
    requiredAdditionalBytes: Math.max(0, reservedSettingsEntryBytes - currentSettingsEntryBytes),
    systemReserveBytes: SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES,
    resetReceiptReserveBytes: LOCAL_DATA_RESET_RECEIPT_RESERVE_BYTES,
  };
}

export function hasSettingsMutationHeadroom(
  envelope: SettingsEnvelopeV2,
  mutation: SettingMutation
): boolean {
  const projection = projectSettingsMutationBytes(envelope, mutation);
  return (
    projection !== null &&
    projection.maxSettledEnvelopeValueBytes <= MAX_SETTLED_SETTINGS_ENVELOPE_BYTES &&
    projection.maxJournalEnvelopeValueBytes <= MAX_SETTINGS_ENVELOPE_ENCODED_BYTES
  );
}

const isSafeNonNegativeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

export function parseSettingsGlobalStorageReservationProof(
  value: unknown,
  dataEpoch: string,
  mutation: SettingMutation,
  projection: SettingsMutationByteProjectionV1
): SettingsGlobalStorageReservationProofV1 | null {
  const record = readStrictJsonRecord(value, [
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
  ]);
  if (record === null) {
    return null;
  }
  if (
    !isSafeNonNegativeInteger(record.quotaBytes) ||
    !isSafeNonNegativeInteger(record.bytesInUse) ||
    !isSafeNonNegativeInteger(record.availableAfterReservationBytes)
  ) {
    return null;
  }
  const quotaBytes = record.quotaBytes;
  const bytesInUse = record.bytesInUse;
  const requiredAdditionalBytes = projection.requiredAdditionalBytes;
  if (
    record.version !== 1 ||
    record.kind !== 'CHROME_LOCAL_SETTINGS_RESERVATION' ||
    record.storageArea !== 'local' ||
    record.settingsKey !== SETTINGS_STORAGE_KEY ||
    record.dataEpoch !== parseSettingsCommandDigest(mutation.commandDigest)?.dataEpoch ||
    record.dataEpoch !== dataEpoch ||
    record.mutationId !== mutation.mutationId ||
    record.commandDigest !== mutation.commandDigest ||
    record.baseRevision !== mutation.baseRevision ||
    record.baseGeneration !== mutation.baseGeneration ||
    record.reservationId !== mutation.storageReservationId ||
    !isUuidV4(record.gateLeaseId) ||
    !isUuidV4(record.proofId) ||
    new Set([record.gateLeaseId, record.proofId, record.reservationId]).size !== 3 ||
    record.gateLeaseId === dataEpoch ||
    record.proofId === dataEpoch ||
    mutation.correlationIds.includes(record.gateLeaseId) ||
    mutation.correlationIds.includes(record.proofId) ||
    record.currentSettingsEntryBytes !== projection.currentSettingsEntryBytes ||
    record.reservedSettingsEntryBytes !== projection.reservedSettingsEntryBytes ||
    record.requiredAdditionalBytes !== requiredAdditionalBytes ||
    record.systemReserveBytes !== SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES ||
    record.resetReceiptReserveBytes !== LOCAL_DATA_RESET_RECEIPT_RESERVE_BYTES ||
    quotaBytes < bytesInUse + requiredAdditionalBytes ||
    record.availableAfterReservationBytes !== quotaBytes - bytesInUse - requiredAdditionalBytes ||
    record.availableAfterReservationBytes < SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES ||
    record.reservationActive !== true ||
    record.allLocalWritersFenced !== true ||
    record.resetJournalAbsent !== true
  ) {
    return null;
  }
  return {
    version: 1,
    kind: 'CHROME_LOCAL_SETTINGS_RESERVATION',
    storageArea: 'local',
    settingsKey: SETTINGS_STORAGE_KEY,
    dataEpoch,
    mutationId: mutation.mutationId,
    commandDigest: mutation.commandDigest,
    baseRevision: mutation.baseRevision,
    baseGeneration: mutation.baseGeneration,
    reservationId: mutation.storageReservationId,
    gateLeaseId: record.gateLeaseId,
    proofId: record.proofId,
    quotaBytes,
    bytesInUse,
    currentSettingsEntryBytes: projection.currentSettingsEntryBytes,
    reservedSettingsEntryBytes: projection.reservedSettingsEntryBytes,
    requiredAdditionalBytes,
    systemReserveBytes: SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES,
    resetReceiptReserveBytes: LOCAL_DATA_RESET_RECEIPT_RESERVE_BYTES,
    availableAfterReservationBytes: record.availableAfterReservationBytes,
    reservationActive: true,
    allLocalWritersFenced: true,
    resetJournalAbsent: true,
  };
}

export function isSettingsGlobalStorageReservationProof(
  value: unknown,
  dataEpoch: string,
  mutation: SettingMutation,
  projection: SettingsMutationByteProjectionV1
): value is SettingsGlobalStorageReservationProofV1 {
  return (
    parseSettingsGlobalStorageReservationProof(value, dataEpoch, mutation, projection) !== null
  );
}

export function parseSettingsGlobalStorageReservationDenial(
  value: unknown,
  dataEpoch: string,
  mutation: SettingMutation,
  projection: SettingsMutationByteProjectionV1
): SettingsGlobalStorageReservationDenialV1 | null {
  const record = readStrictJsonRecord(value, [
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
    'availableBytes',
    'reason',
    'allLocalWritersFenced',
    'resetJournalAbsent',
  ]);
  if (
    record === null ||
    !isSafeNonNegativeInteger(record.quotaBytes) ||
    !isSafeNonNegativeInteger(record.bytesInUse) ||
    !isSafeNonNegativeInteger(record.availableBytes)
  ) {
    return null;
  }
  const availableBytes = Math.max(0, record.quotaBytes - record.bytesInUse);
  if (
    record.version !== 1 ||
    record.kind !== 'CHROME_LOCAL_SETTINGS_RESERVATION_DENIED' ||
    record.storageArea !== 'local' ||
    record.settingsKey !== SETTINGS_STORAGE_KEY ||
    record.dataEpoch !== dataEpoch ||
    record.mutationId !== mutation.mutationId ||
    record.commandDigest !== mutation.commandDigest ||
    record.baseRevision !== mutation.baseRevision ||
    record.baseGeneration !== mutation.baseGeneration ||
    record.reservationId !== mutation.storageReservationId ||
    !isUuidV4(record.gateLeaseId) ||
    !isUuidV4(record.proofId) ||
    new Set([record.gateLeaseId, record.proofId, record.reservationId]).size !== 3 ||
    record.currentSettingsEntryBytes !== projection.currentSettingsEntryBytes ||
    record.reservedSettingsEntryBytes !== projection.reservedSettingsEntryBytes ||
    record.requiredAdditionalBytes !== projection.requiredAdditionalBytes ||
    record.systemReserveBytes !== SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES ||
    record.resetReceiptReserveBytes !== LOCAL_DATA_RESET_RECEIPT_RESERVE_BYTES ||
    record.availableBytes !== availableBytes ||
    availableBytes >= projection.requiredAdditionalBytes + SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES ||
    record.reason !== 'INSUFFICIENT_GLOBAL_HEADROOM' ||
    record.allLocalWritersFenced !== true ||
    record.resetJournalAbsent !== true
  ) {
    return null;
  }
  return {
    version: 1,
    kind: 'CHROME_LOCAL_SETTINGS_RESERVATION_DENIED',
    storageArea: 'local',
    settingsKey: SETTINGS_STORAGE_KEY,
    dataEpoch,
    mutationId: mutation.mutationId,
    commandDigest: mutation.commandDigest,
    baseRevision: mutation.baseRevision,
    baseGeneration: mutation.baseGeneration,
    reservationId: mutation.storageReservationId,
    gateLeaseId: record.gateLeaseId,
    proofId: record.proofId,
    quotaBytes: record.quotaBytes,
    bytesInUse: record.bytesInUse,
    currentSettingsEntryBytes: projection.currentSettingsEntryBytes,
    reservedSettingsEntryBytes: projection.reservedSettingsEntryBytes,
    requiredAdditionalBytes: projection.requiredAdditionalBytes,
    systemReserveBytes: SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES,
    resetReceiptReserveBytes: LOCAL_DATA_RESET_RECEIPT_RESERVE_BYTES,
    availableBytes,
    reason: 'INSUFFICIENT_GLOBAL_HEADROOM',
    allLocalWritersFenced: true,
    resetJournalAbsent: true,
  };
}

export function isSettingsGlobalStorageReservationDenial(
  value: unknown,
  dataEpoch: string,
  mutation: SettingMutation,
  projection: SettingsMutationByteProjectionV1
): value is SettingsGlobalStorageReservationDenialV1 {
  return (
    parseSettingsGlobalStorageReservationDenial(value, dataEpoch, mutation, projection) !== null
  );
}

export function parseResetFenceProof(
  value: unknown,
  payload: LocalDataResetEpochEventV1
): ResetFenceProofV1 | null {
  const record = readStrictJsonRecord(value, [
    'version',
    'kind',
    'issuedTo',
    'resetId',
    'nextDataEpoch',
    'settingsBootstrapRequestId',
    'resetPhase',
    'authorityFenceHeld',
    'gateLeaseId',
    'proofId',
  ]);
  if (
    record === null ||
    record.version !== 1 ||
    record.kind !== 'DATASET_EPOCH_RESET_FENCE' ||
    record.issuedTo !== 'settings-bootstrap' ||
    record.resetId !== payload.resetId ||
    record.nextDataEpoch !== payload.nextDataEpoch ||
    record.settingsBootstrapRequestId !== payload.settingsBootstrapRequestId ||
    record.resetPhase !== 'committed' ||
    record.authorityFenceHeld !== true ||
    !isUuidV4(record.gateLeaseId) ||
    !isUuidV4(record.proofId) ||
    new Set([
      record.gateLeaseId,
      record.proofId,
      payload.resetId,
      payload.nextDataEpoch,
      payload.settingsBootstrapRequestId,
    ]).size !== 5
  ) {
    return null;
  }
  return {
    version: 1,
    kind: 'DATASET_EPOCH_RESET_FENCE',
    issuedTo: 'settings-bootstrap',
    resetId: payload.resetId,
    nextDataEpoch: payload.nextDataEpoch,
    settingsBootstrapRequestId: payload.settingsBootstrapRequestId,
    resetPhase: 'committed',
    authorityFenceHeld: true,
    gateLeaseId: record.gateLeaseId,
    proofId: record.proofId,
  };
}

export function isResetFenceProof(
  value: unknown,
  payload: LocalDataResetEpochEventV1
): value is ResetFenceProofV1 {
  return parseResetFenceProof(value, payload) !== null;
}

export function parseAutoScanAlarmProofV1(
  proof: unknown,
  envelope: SettingsEnvelopeV2,
  requestId: string,
  expectedCommandId: string
): AutoScanAlarmProofV1 | null {
  const record = readStrictJsonRecord(proof, [
    'version',
    'kind',
    'alarmName',
    'enabled',
    'periodInMinutes',
    'dataEpoch',
    'envelopeRevision',
    'envelopeGeneration',
    'settingsDigest',
    'proofId',
    'requestId',
    'commandId',
  ]);
  if (record === null) {
    return null;
  }
  const expected = expectedAlarm(envelope.settings);
  if (
    record.version !== 1 ||
    record.kind !== expected.kind ||
    record.alarmName !== expected.alarmName ||
    record.enabled !== expected.enabled ||
    record.periodInMinutes !== expected.periodInMinutes ||
    record.dataEpoch !== envelope.dataEpoch ||
    record.envelopeRevision !== envelope.revision ||
    record.envelopeGeneration !== envelope.generation ||
    record.settingsDigest !== settingsDigest(envelope.settings) ||
    !isUuidV4(record.proofId) ||
    record.requestId !== requestId ||
    record.commandId !== expectedCommandId
  ) {
    return null;
  }
  return {
    version: 1,
    kind: 'AUTO_SCAN_ALARM',
    alarmName: 'auto-scan',
    enabled: expected.enabled,
    periodInMinutes: expected.periodInMinutes,
    dataEpoch: envelope.dataEpoch,
    envelopeRevision: envelope.revision,
    envelopeGeneration: envelope.generation,
    settingsDigest: settingsDigest(envelope.settings),
    proofId: record.proofId,
    requestId,
    commandId: expectedCommandId,
  };
}

export function isAutoScanAlarmProofV1(
  proof: unknown,
  envelope: SettingsEnvelopeV2,
  requestId: string,
  expectedCommandId: string
): proof is AutoScanAlarmProofV1 {
  return parseAutoScanAlarmProofV1(proof, envelope, requestId, expectedCommandId) !== null;
}

function parseOutcome(
  value: unknown,
  epoch: string,
  maxRevision: number,
  maxGeneration: number
): SettingsMutationOutcomeV1 | null {
  const record = readStrictJsonRecord(value, [
    'version',
    'dataEpoch',
    'mutationId',
    'commandDigest',
    'previousDigest',
    'candidateDigest',
    'baseRevision',
    'baseGeneration',
    'settledRevision',
    'settledGeneration',
    'correlationIds',
    'outcome',
  ]);
  if (record === null) {
    return null;
  }
  const command = parseSettingsCommandDigest(record.commandDigest);
  const outcome = String(record.outcome);
  const baseRevision = Number(record.baseRevision);
  const baseGeneration = Number(record.baseGeneration);
  const settledRevision = Number(record.settledRevision);
  const settledGeneration = Number(record.settledGeneration);
  const expectedSettledRevision =
    outcome === 'committed'
      ? baseRevision + 1
      : outcome === 'compensated'
        ? baseRevision + 2
        : null;
  const expectedSettledGeneration =
    outcome === 'committed'
      ? baseGeneration + 2
      : outcome === 'compensated'
        ? baseGeneration + 4
        : null;
  if (!isUuidV4(record.mutationId)) {
    return null;
  }
  const correlationIds = parseCorrelationIds(record.correlationIds, record.mutationId);
  if (
    correlationIds === null ||
    record.version !== 1 ||
    record.dataEpoch !== epoch ||
    typeof record.outcome !== 'string' ||
    command === null ||
    command.dataEpoch !== epoch ||
    command.mutationId !== record.mutationId ||
    parseSettingsDigest(record.previousDigest) === null ||
    parseSettingsDigest(record.candidateDigest) === null ||
    !Number.isSafeInteger(record.baseRevision) ||
    baseRevision < 0 ||
    !Number.isSafeInteger(record.baseGeneration) ||
    baseGeneration < 0 ||
    command.baseRevision !== baseRevision ||
    command.baseGeneration !== baseGeneration ||
    command.previousDigest !== record.previousDigest ||
    command.candidateDigest !== record.candidateDigest ||
    !command.baseCorrelationIds.every((id) => correlationIds.includes(id)) ||
    !Number.isSafeInteger(record.settledRevision) ||
    settledRevision < baseRevision ||
    settledRevision > maxRevision ||
    !Number.isSafeInteger(record.settledGeneration) ||
    settledGeneration <= baseGeneration ||
    settledGeneration > maxGeneration ||
    !['committed', 'not_committed', 'compensated', 'cancelled'].includes(outcome) ||
    (expectedSettledRevision !== null && settledRevision !== expectedSettledRevision) ||
    (expectedSettledGeneration !== null && settledGeneration !== expectedSettledGeneration)
  ) {
    return null;
  }
  return {
    version: 1,
    dataEpoch: epoch,
    mutationId: record.mutationId,
    commandDigest: record.commandDigest as string,
    previousDigest: record.previousDigest as string,
    candidateDigest: record.candidateDigest as string,
    baseRevision,
    baseGeneration,
    settledRevision,
    settledGeneration,
    correlationIds,
    outcome: record.outcome as SettingsMutationOutcomeKind,
  };
}

function parseJournal(
  value: unknown,
  epoch: string,
  includedIds: string[],
  envelopeRevision: number,
  envelopeGeneration: number,
  envelopeSettings: AppSettings
): SettingsDurableJournalV1 | null {
  const record = readStrictJsonRecord(value, [
    'version',
    'phase',
    'transactionId',
    'mutationId',
    'commandDigest',
    'baseRevision',
    'baseGeneration',
    'previousSettings',
    'candidateSettings',
    'previousDigest',
    'candidateDigest',
    'correlationIds',
    'expectedAlarm',
  ]);
  if (record === null) {
    return null;
  }
  const previousSettings =
    record.previousSettings === null
      ? null
      : parseStrictSettings(record.previousSettings, includedIds);
  const candidateSettings = parseStrictSettings(record.candidateSettings, includedIds);
  if (
    (record.previousSettings !== null && previousSettings === null) ||
    candidateSettings === null
  ) {
    return null;
  }
  const userMutation = record.mutationId !== null;
  const command = parseSettingsCommandDigest(record.commandDigest);
  const compensationPhase =
    record.phase === 'compensation_pending' || record.phase === 'compensation_effects_pending';
  const previousDigest = previousSettings === null ? null : settingsDigest(previousSettings);
  const expectedTarget = compensationPhase ? previousSettings : candidateSettings;
  const expectedEnvelopeDigest =
    record.phase === 'compensation_effects_pending'
      ? previousDigest
      : settingsDigest(candidateSettings);
  const expectedEnvelopeRevision = userMutation
    ? Number(record.baseRevision) + (record.phase === 'compensation_effects_pending' ? 2 : 1)
    : Number(record.baseRevision);
  const generationDelta =
    record.phase === 'effects_pending' ? 1 : record.phase === 'compensation_pending' ? 2 : 3;
  const expectedEnvelopeGeneration = Number(record.baseGeneration) + generationDelta;
  const expectedAlarmValue = expectedTarget ? expectedAlarm(expectedTarget) : null;
  const alarm = readStrictJsonRecord(record.expectedAlarm, [
    'version',
    'kind',
    'alarmName',
    'enabled',
    'periodInMinutes',
  ]);
  if (
    !isUuidV4(record.transactionId) ||
    !(record.mutationId === null || isUuidV4(record.mutationId))
  ) {
    return null;
  }
  const correlationIds = parseCorrelationIds(record.correlationIds, record.transactionId);
  if (
    correlationIds === null ||
    alarm === null ||
    record.version !== 1 ||
    !['effects_pending', 'compensation_pending', 'compensation_effects_pending'].includes(
      String(record.phase)
    ) ||
    !(
      (userMutation &&
        command !== null &&
        command.dataEpoch === epoch &&
        command.mutationId === record.mutationId) ||
      (!userMutation && record.commandDigest === null && command === null)
    ) ||
    !Number.isSafeInteger(record.baseRevision) ||
    Number(record.baseRevision) < 0 ||
    Number(record.baseRevision) > envelopeRevision ||
    !Number.isSafeInteger(record.baseGeneration) ||
    Number(record.baseGeneration) < 0 ||
    Number(record.baseGeneration) >= envelopeGeneration ||
    !Number.isSafeInteger(expectedEnvelopeRevision) ||
    expectedEnvelopeRevision !== envelopeRevision ||
    !Number.isSafeInteger(expectedEnvelopeGeneration) ||
    expectedEnvelopeGeneration !== envelopeGeneration ||
    (userMutation &&
      (command?.baseRevision !== Number(record.baseRevision) ||
        command.baseGeneration !== Number(record.baseGeneration) ||
        command.previousDigest !== record.previousDigest ||
        command.candidateDigest !== record.candidateDigest)) ||
    (userMutation &&
      (command === null ||
        !command.baseCorrelationIds.every((id) => correlationIds.includes(id)))) ||
    record.previousDigest !== previousDigest ||
    record.candidateDigest !== settingsDigest(candidateSettings) ||
    (userMutation &&
      (previousSettings === null || record.previousDigest === record.candidateDigest)) ||
    (!userMutation && !(previousSettings === null && record.previousDigest === null)) ||
    (compensationPhase && !(userMutation && previousSettings !== null)) ||
    expectedTarget === null ||
    settingsDigest(envelopeSettings) !== expectedEnvelopeDigest ||
    expectedAlarmValue === null ||
    alarm.version !== expectedAlarmValue.version ||
    alarm.kind !== expectedAlarmValue.kind ||
    alarm.alarmName !== expectedAlarmValue.alarmName ||
    alarm.enabled !== expectedAlarmValue.enabled ||
    alarm.periodInMinutes !== expectedAlarmValue.periodInMinutes ||
    (userMutation && !correlationIds.includes(record.mutationId as string))
  ) {
    return null;
  }
  return {
    version: 1,
    phase: record.phase as SettingsJournalPhase,
    transactionId: record.transactionId,
    mutationId: record.mutationId as string | null,
    commandDigest: record.commandDigest as string | null,
    baseRevision: Number(record.baseRevision),
    baseGeneration: Number(record.baseGeneration),
    previousSettings,
    candidateSettings,
    previousDigest: record.previousDigest as string | null,
    candidateDigest: record.candidateDigest as string,
    correlationIds,
    expectedAlarm: { ...expectedAlarmValue },
  };
}

export function parseSettingsEnvelopeV2(
  value: unknown,
  dataEpoch: string,
  includedIds: string[]
): SettingsEnvelopeV2 | null {
  const record = readStrictJsonRecord(value, [
    'version',
    'dataEpoch',
    'revision',
    'generation',
    'settings',
    'journal',
    'outcomes',
  ]);
  if (record === null) {
    return null;
  }
  const outcomes = readStrictJsonArray(record.outcomes);
  const settings = parseStrictSettings(record.settings, includedIds);
  if (
    record.version !== 2 ||
    record.dataEpoch !== dataEpoch ||
    !Number.isSafeInteger(record.revision) ||
    Number(record.revision) < 0 ||
    !Number.isSafeInteger(record.generation) ||
    Number(record.generation) < 0 ||
    settings === null ||
    outcomes === null ||
    outcomes.length > MAX_SETTINGS_OUTCOMES_PER_EPOCH
  ) {
    return null;
  }
  const parsedOutcomes: SettingsMutationOutcomeV1[] = [];
  for (const outcome of outcomes) {
    const parsed = parseOutcome(
      outcome,
      dataEpoch,
      Number(record.revision),
      Number(record.generation)
    );
    if (parsed === null) {
      return null;
    }
    parsedOutcomes.push(parsed);
  }
  if (new Set(parsedOutcomes.map((outcome) => outcome.mutationId)).size !== parsedOutcomes.length) {
    return null;
  }
  if (
    !parsedOutcomes.every(
      (outcome, index) =>
        index === 0 ||
        Number(parsedOutcomes[index - 1]?.settledGeneration) < outcome.settledGeneration
    )
  ) {
    return null;
  }
  const journal =
    record.journal === null
      ? null
      : parseJournal(
          record.journal,
          dataEpoch,
          includedIds,
          Number(record.revision),
          Number(record.generation),
          settings
        );
  if (record.journal !== null && journal === null) {
    return null;
  }
  const outcomeCorrelationIds = parsedOutcomes.flatMap((outcome) => outcome.correlationIds);
  if (new Set(outcomeCorrelationIds).size !== outcomeCorrelationIds.length) {
    return null;
  }
  if (journal?.correlationIds.some((id) => outcomeCorrelationIds.includes(id))) {
    return null;
  }
  if (
    journal?.mutationId !== null &&
    journal?.mutationId !== undefined &&
    parsedOutcomes.some((outcome) => outcome.mutationId === journal.mutationId)
  ) {
    return null;
  }
  const envelope: SettingsEnvelopeV2 = {
    version: 2,
    dataEpoch,
    revision: Number(record.revision),
    generation: Number(record.generation),
    settings,
    journal,
    outcomes: parsedOutcomes,
  };
  const encodedBytes = settingsEnvelopeEncodedBytes(envelope);
  return encodedBytes <= MAX_SETTINGS_ENVELOPE_ENCODED_BYTES &&
    (journal !== null || encodedBytes <= MAX_SETTLED_SETTINGS_ENVELOPE_BYTES)
    ? envelope
    : null;
}

export function isSettingsEnvelopeV2(
  value: unknown,
  dataEpoch: string,
  includedIds: string[]
): value is SettingsEnvelopeV2 {
  return parseSettingsEnvelopeV2(value, dataEpoch, includedIds) !== null;
}

const PENDING_INTENT_PHASES = new Set<SettingsPendingIntentPhase>([
  'reserving',
  'permission_check',
  'rebasing',
  'writing',
  'compensating',
  'cancelling',
  'reconciling',
  'clearing_intent',
]);

const PENDING_INTENT_COMMAND_PREFIX = {
  RESERVE_SETTINGS_STORAGE: 'settings/reserve/',
  VERIFY_SETTINGS_HOST_PERMISSIONS: 'settings/permission_check/',
  COMPARE_AND_SETTLE_SETTINGS: 'settings/write/',
  RECOVER_SETTINGS_TRANSACTION: 'settings/recover/',
  REBASE_SETTINGS_MUTATION: 'settings/rebase/',
  ABORT_SETTINGS_MUTATION: 'settings/abort/',
  RECONCILE_SETTINGS: 'settings/reconcile/',
  CLEAR_SETTINGS_PENDING_INTENT: 'settings/clear_intent/',
} as const satisfies Record<SettingsPendingIntentNextCommandType, string>;

const PENDING_INTENT_PHASE_BY_COMMAND = {
  RESERVE_SETTINGS_STORAGE: 'reserving',
  VERIFY_SETTINGS_HOST_PERMISSIONS: 'permission_check',
  COMPARE_AND_SETTLE_SETTINGS: 'writing',
  RECOVER_SETTINGS_TRANSACTION: 'compensating',
  REBASE_SETTINGS_MUTATION: 'rebasing',
  ABORT_SETTINGS_MUTATION: 'cancelling',
  RECONCILE_SETTINGS: 'reconciling',
  CLEAR_SETTINGS_PENDING_INTENT: 'clearing_intent',
} as const satisfies Record<SettingsPendingIntentNextCommandType, SettingsPendingIntentPhase>;

const PENDING_INTENT_REQUEST_COMMANDS = new Set<SettingsPendingIntentNextCommandType>([
  'RECOVER_SETTINGS_TRANSACTION',
  'REBASE_SETTINGS_MUTATION',
  'ABORT_SETTINGS_MUTATION',
  'RECONCILE_SETTINGS',
  'CLEAR_SETTINGS_PENDING_INTENT',
]);

function cloneSettingValue(value: SettingValue): SettingValue {
  return Array.isArray(value) ? [...value] : value;
}

export function cloneSettingMutation(mutation: SettingMutation): SettingMutation {
  return {
    ...mutation,
    previousSettings: cloneSettings(mutation.previousSettings),
    candidateSettings: cloneSettings(mutation.candidateSettings),
    previous: cloneSettingValue(mutation.previous),
    candidate: cloneSettingValue(mutation.candidate),
    correlationIds: [...mutation.correlationIds],
    requiredOrigins: [...mutation.requiredOrigins],
    permissionProof:
      mutation.permissionProof === null
        ? null
        : {
            ...mutation.permissionProof,
            verifiedOrigins: [...mutation.permissionProof.verifiedOrigins],
          },
    storageReservationProof:
      mutation.storageReservationProof === null ? null : { ...mutation.storageReservationProof },
  };
}

export function cloneSettingsTerminalSettlementV1(
  settlement: SettingsTerminalSettlementV1
): SettingsTerminalSettlementV1 {
  return {
    ...settlement,
    outcome: { ...settlement.outcome, correlationIds: [...settlement.outcome.correlationIds] },
    error: settlement.error === null ? null : { ...settlement.error },
  };
}

function pendingIntentDigestTuple(input: Omit<SettingsPendingIntentV1, 'intentDigest'>): unknown[] {
  const mutation = input.mutation;
  return [
    input.version,
    input.storageKey,
    input.dataEpoch,
    input.originWorkerEpoch,
    input.intentRevision,
    {
      ...cloneSettingMutation(mutation),
      previousSettings: canonicalSettingsTuple(mutation.previousSettings),
      candidateSettings: canonicalSettingsTuple(mutation.candidateSettings),
    },
    input.retryIntent ? { ...input.retryIntent } : null,
    input.phase,
    input.nextCommandType,
    input.nextCommandId,
    input.requestId,
    input.terminalSettlement ? cloneSettingsTerminalSettlementV1(input.terminalSettlement) : null,
  ];
}

export function settingsPendingIntentDigest(
  input: Omit<SettingsPendingIntentV1, 'intentDigest'>
): string {
  return `pending/v1:${JSON.stringify(pendingIntentDigestTuple(input))}`;
}

export function createSettingsPendingIntentV1(
  input: Omit<SettingsPendingIntentV1, 'version' | 'storageKey' | 'intentDigest'>
): SettingsPendingIntentV1 {
  const base: Omit<SettingsPendingIntentV1, 'intentDigest'> = {
    version: 1,
    storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
    dataEpoch: input.dataEpoch,
    originWorkerEpoch: input.originWorkerEpoch,
    intentRevision: input.intentRevision,
    mutation: cloneSettingMutation(input.mutation),
    retryIntent: input.retryIntent ? { ...input.retryIntent } : null,
    phase: input.phase,
    nextCommandType: input.nextCommandType,
    nextCommandId: input.nextCommandId,
    requestId: input.requestId,
    terminalSettlement:
      input.terminalSettlement === null
        ? null
        : cloneSettingsTerminalSettlementV1(input.terminalSettlement),
  };
  return { ...base, intentDigest: settingsPendingIntentDigest(base) };
}

export function cloneSettingsPendingIntentV1(
  pendingIntent: SettingsPendingIntentV1
): SettingsPendingIntentV1 {
  return createSettingsPendingIntentV1({
    dataEpoch: pendingIntent.dataEpoch,
    originWorkerEpoch: pendingIntent.originWorkerEpoch,
    intentRevision: pendingIntent.intentRevision,
    mutation: pendingIntent.mutation,
    retryIntent: pendingIntent.retryIntent,
    phase: pendingIntent.phase,
    nextCommandType: pendingIntent.nextCommandType,
    nextCommandId: pendingIntent.nextCommandId,
    requestId: pendingIntent.requestId,
    terminalSettlement: pendingIntent.terminalSettlement,
  });
}

function parsePendingReservationProof(
  value: unknown,
  mutation: SettingMutation,
  dataEpoch: string
): SettingsGlobalStorageReservationProofV1 | null {
  const record = readStrictJsonRecord(value, [
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
  ]);
  const numericKeys = [
    'quotaBytes',
    'bytesInUse',
    'currentSettingsEntryBytes',
    'reservedSettingsEntryBytes',
    'requiredAdditionalBytes',
    'systemReserveBytes',
    'resetReceiptReserveBytes',
    'availableAfterReservationBytes',
  ] as const;
  const command = parseSettingsCommandDigest(mutation.commandDigest);
  if (
    record === null ||
    command === null ||
    record.version !== 1 ||
    record.kind !== 'CHROME_LOCAL_SETTINGS_RESERVATION' ||
    record.storageArea !== 'local' ||
    record.settingsKey !== SETTINGS_STORAGE_KEY ||
    record.dataEpoch !== dataEpoch ||
    record.dataEpoch !== command.dataEpoch ||
    record.mutationId !== mutation.mutationId ||
    record.commandDigest !== mutation.commandDigest ||
    record.baseRevision !== mutation.baseRevision ||
    record.baseGeneration !== mutation.baseGeneration ||
    record.reservationId !== mutation.storageReservationId ||
    !isUuidV4(record.dataEpoch) ||
    !isUuidV4(record.gateLeaseId) ||
    !isUuidV4(record.proofId) ||
    !numericKeys.every((key) => isSafeNonNegativeInteger(record[key])) ||
    record.reservationActive !== true ||
    record.allLocalWritersFenced !== true ||
    record.resetJournalAbsent !== true
  ) {
    return null;
  }
  const quotaBytes = Number(record.quotaBytes);
  const bytesInUse = Number(record.bytesInUse);
  const currentSettingsEntryBytes = Number(record.currentSettingsEntryBytes);
  const reservedSettingsEntryBytes = Number(record.reservedSettingsEntryBytes);
  const requiredAdditionalBytes = Number(record.requiredAdditionalBytes);
  const availableAfterReservationBytes = Number(record.availableAfterReservationBytes);
  if (
    requiredAdditionalBytes !==
      Math.max(0, reservedSettingsEntryBytes - currentSettingsEntryBytes) ||
    record.systemReserveBytes !== SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES ||
    record.resetReceiptReserveBytes !== LOCAL_DATA_RESET_RECEIPT_RESERVE_BYTES ||
    quotaBytes < bytesInUse + requiredAdditionalBytes ||
    availableAfterReservationBytes !== quotaBytes - bytesInUse - requiredAdditionalBytes ||
    availableAfterReservationBytes < SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES ||
    record.gateLeaseId === record.proofId ||
    record.gateLeaseId === dataEpoch ||
    record.proofId === dataEpoch ||
    mutation.correlationIds.includes(record.gateLeaseId) ||
    mutation.correlationIds.includes(record.proofId)
  ) {
    return null;
  }
  return { ...(record as unknown as SettingsGlobalStorageReservationProofV1) };
}

function parseSettingMutation(value: unknown, includedIds: string[]): SettingMutation | null {
  const record = readStrictJsonRecord(value, [
    'key',
    'previousSettings',
    'candidateSettings',
    'previous',
    'candidate',
    'previousDigest',
    'candidateDigest',
    'commandDigest',
    'correlationIds',
    'mutationId',
    'permissionCheckId',
    'activationId',
    'activationResultId',
    'requiredOrigins',
    'baseRevision',
    'baseGeneration',
    'permissionProof',
    'storageReservationId',
    'storageReservationProof',
  ]);
  const previousSettings = parseStrictSettings(record?.previousSettings, includedIds);
  const candidateSettings = parseStrictSettings(record?.candidateSettings, includedIds);
  const correlationIds = parseCorrelationIds(record?.correlationIds, record?.mutationId as string);
  const origins = readStrictJsonArray(record?.requiredOrigins);
  const command = parseSettingsCommandDigest(record?.commandDigest);
  const identityIds = [
    record?.mutationId,
    record?.permissionCheckId,
    record?.activationId,
    record?.activationResultId,
    record?.storageReservationId,
  ];
  if (
    record === null ||
    previousSettings === null ||
    candidateSettings === null ||
    sameSettings(previousSettings, candidateSettings) ||
    correlationIds === null ||
    origins === null ||
    !origins.every(
      (origin): origin is string =>
        typeof origin === 'string' && origin.length > 0 && origin.length <= 2048
    ) ||
    new Set(origins).size !== origins.length ||
    ![...origins].sort().every((origin, index) => origin === origins[index]) ||
    !['autoScan', 'scanIntervalMinutes', 'notifications', 'theme', 'enabledConnectors'].includes(
      String(record.key)
    ) ||
    !isUuidV4(record.mutationId) ||
    !isUuidV4(record.permissionCheckId) ||
    !isUuidV4(record.activationId) ||
    !isUuidV4(record.activationResultId) ||
    !isUuidV4(record.storageReservationId) ||
    new Set(identityIds).size !== 5 ||
    !Number.isSafeInteger(record.baseRevision) ||
    Number(record.baseRevision) < 0 ||
    !Number.isSafeInteger(record.baseGeneration) ||
    Number(record.baseGeneration) < 0 ||
    record.previousDigest !== settingsDigest(previousSettings) ||
    record.candidateDigest !== settingsDigest(candidateSettings) ||
    command === null ||
    !settingsIdentitiesAreDisjointFromEpochs(command.dataEpoch, null, correlationIds) ||
    command.mutationId !== record.mutationId ||
    command.baseRevision !== record.baseRevision ||
    command.baseGeneration !== record.baseGeneration ||
    command.previousDigest !== record.previousDigest ||
    command.candidateDigest !== record.candidateDigest ||
    command.originDigest !== originDigest(origins as string[]) ||
    !identityIds.every((id) => correlationIds.includes(id as string)) ||
    !identityIds.every((id) => command.baseCorrelationIds.includes(id as string)) ||
    ![5, 7].includes(command.baseCorrelationIds.length) ||
    !command.baseCorrelationIds.every((id) => correlationIds.includes(id))
  ) {
    return null;
  }
  const key = record.key as PersistentSettingKey;
  const previous =
    key === 'enabledConnectors' ? [...previousSettings.enabledConnectors] : previousSettings[key];
  const candidate =
    key === 'enabledConnectors' ? [...candidateSettings.enabledConnectors] : candidateSettings[key];
  if (
    JSON.stringify(record.previous) !== JSON.stringify(previous) ||
    JSON.stringify(record.candidate) !== JSON.stringify(candidate)
  ) {
    return null;
  }
  const baseMutation: SettingMutation = {
    key,
    previousSettings,
    candidateSettings,
    previous,
    candidate,
    previousDigest: record.previousDigest as string,
    candidateDigest: record.candidateDigest as string,
    commandDigest: record.commandDigest as string,
    correlationIds,
    mutationId: record.mutationId,
    permissionCheckId: record.permissionCheckId,
    activationId: record.activationId,
    activationResultId: record.activationResultId,
    requiredOrigins: [...(origins as string[])],
    baseRevision: Number(record.baseRevision),
    baseGeneration: Number(record.baseGeneration),
    permissionProof: null,
    storageReservationId: record.storageReservationId,
    storageReservationProof: null,
  };
  const permissionProof =
    record.permissionProof === null
      ? null
      : parseSettingsHostPermissionContainsProofV1(record.permissionProof, {
          dataEpoch: command.dataEpoch,
          mutationId: baseMutation.mutationId,
          permissionCheckId: baseMutation.permissionCheckId,
          activationId: baseMutation.activationId,
          activationResultId: baseMutation.activationResultId,
          origins: baseMutation.requiredOrigins,
        });
  const storageReservationProof =
    record.storageReservationProof === null
      ? null
      : parsePendingReservationProof(
          record.storageReservationProof,
          baseMutation,
          command.dataEpoch
        );
  if (
    (record.permissionProof !== null && permissionProof === null) ||
    (record.storageReservationProof !== null && storageReservationProof === null)
  ) {
    return null;
  }
  return { ...baseMutation, permissionProof, storageReservationProof };
}

function parseRetryIntent(value: unknown): RetryIntent | null {
  const record = readStrictJsonRecord(value, [
    'failedMutationId',
    'mutationId',
    'permissionCheckId',
    'activationId',
    'activationResultId',
    'storageReservationId',
    'requestId',
  ]);
  if (
    record === null ||
    ![
      record.failedMutationId,
      record.mutationId,
      record.permissionCheckId,
      record.activationId,
      record.activationResultId,
      record.storageReservationId,
      record.requestId,
    ].every(isUuidV4) ||
    new Set(Object.values(record)).size !== 7
  ) {
    return null;
  }
  return record as unknown as RetryIntent;
}

function outcomeMatchesMutation(
  outcome: SettingsMutationOutcomeV1,
  mutation: SettingMutation
): boolean {
  return (
    outcome.mutationId === mutation.mutationId &&
    outcome.commandDigest === mutation.commandDigest &&
    outcome.previousDigest === mutation.previousDigest &&
    outcome.candidateDigest === mutation.candidateDigest &&
    outcome.baseRevision === mutation.baseRevision &&
    outcome.baseGeneration === mutation.baseGeneration
  );
}

export function parseSettingsTerminalSettlementV1(
  value: unknown,
  mutation: SettingMutation
): SettingsTerminalSettlementV1 | null {
  const record = readStrictJsonRecord(value, [
    'version',
    'dataEpoch',
    'mutationId',
    'requestId',
    'commandId',
    'outcome',
    'error',
  ]);
  const outcomeRecord = readStrictJsonRecord(record?.outcome, [
    'version',
    'dataEpoch',
    'mutationId',
    'commandDigest',
    'previousDigest',
    'candidateDigest',
    'baseRevision',
    'baseGeneration',
    'settledRevision',
    'settledGeneration',
    'correlationIds',
    'outcome',
  ]);
  if (
    record === null ||
    outcomeRecord === null ||
    record.version !== 1 ||
    record.dataEpoch !== outcomeRecord.dataEpoch ||
    record.mutationId !== mutation.mutationId ||
    !isUuidV4(record.dataEpoch) ||
    !isUuidV4(record.requestId) ||
    !isSettingsCommandId(record.commandId) ||
    !Number.isSafeInteger(outcomeRecord.settledRevision) ||
    !Number.isSafeInteger(outcomeRecord.settledGeneration)
  ) {
    return null;
  }
  const outcome = parseOutcome(
    record.outcome,
    record.dataEpoch,
    Number(outcomeRecord.settledRevision),
    Number(outcomeRecord.settledGeneration)
  );
  const error = record.error === null ? null : parseExactSettingsError(record.error);
  if (
    outcome === null ||
    !outcomeMatchesMutation(outcome, mutation) ||
    !outcome.correlationIds.includes(record.requestId) ||
    (record.error !== null && error === null)
  ) {
    return null;
  }
  return {
    version: 1,
    dataEpoch: record.dataEpoch,
    mutationId: mutation.mutationId,
    requestId: record.requestId,
    commandId: record.commandId,
    outcome,
    error,
  };
}

export function parseSettingsPendingIntentV1(
  value: unknown,
  includedIds: string[]
): SettingsPendingIntentV1 | null {
  const record = readStrictJsonRecord(value, [
    'version',
    'storageKey',
    'dataEpoch',
    'originWorkerEpoch',
    'intentRevision',
    'mutation',
    'retryIntent',
    'phase',
    'nextCommandType',
    'nextCommandId',
    'requestId',
    'terminalSettlement',
    'intentDigest',
  ]);
  const mutation = parseSettingMutation(record?.mutation, includedIds);
  const retryIntent = record?.retryIntent === null ? null : parseRetryIntent(record?.retryIntent);
  const terminalSettlement =
    mutation === null || record?.terminalSettlement === null
      ? null
      : parseSettingsTerminalSettlementV1(record?.terminalSettlement, mutation);
  if (
    record === null ||
    mutation === null ||
    record.version !== 1 ||
    record.storageKey !== SETTINGS_PENDING_INTENT_STORAGE_KEY ||
    !isUuidV4(record.dataEpoch) ||
    !isUuidV4(record.originWorkerEpoch) ||
    !Number.isSafeInteger(record.intentRevision) ||
    Number(record.intentRevision) < 1 ||
    Number(record.intentRevision) >= Number.MAX_SAFE_INTEGER ||
    typeof record.phase !== 'string' ||
    !PENDING_INTENT_PHASES.has(record.phase as SettingsPendingIntentPhase) ||
    typeof record.nextCommandType !== 'string' ||
    !Object.prototype.hasOwnProperty.call(PENDING_INTENT_COMMAND_PREFIX, record.nextCommandType) ||
    !isSettingsCommandId(record.nextCommandId) ||
    (record.retryIntent === null ? retryIntent !== null : retryIntent === null) ||
    (record.terminalSettlement === null
      ? terminalSettlement !== null
      : terminalSettlement === null) ||
    (record.requestId !== null && !isUuidV4(record.requestId)) ||
    typeof record.intentDigest !== 'string'
  ) {
    return null;
  }
  const nextCommandType = record.nextCommandType as SettingsPendingIntentNextCommandType;
  const phase = record.phase as SettingsPendingIntentPhase;
  const mutationCommand = parseSettingsCommandDigest(mutation.commandDigest);
  const requestId = record.requestId as string | null;
  const pendingIdentityIds = [
    ...mutation.correlationIds,
    ...(mutation.storageReservationProof === null
      ? []
      : [mutation.storageReservationProof.gateLeaseId, mutation.storageReservationProof.proofId]),
    ...(retryIntent === null
      ? []
      : [
          retryIntent.failedMutationId,
          retryIntent.mutationId,
          retryIntent.permissionCheckId,
          retryIntent.activationId,
          retryIntent.activationResultId,
          retryIntent.storageReservationId,
          retryIntent.requestId,
        ]),
    ...(requestId === null ? [] : [requestId]),
    ...(terminalSettlement === null
      ? []
      : [terminalSettlement.requestId, ...terminalSettlement.outcome.correlationIds]),
  ];
  const commandIdentityValid = (() => {
    if (nextCommandType === 'RESERVE_SETTINGS_STORAGE') {
      return (
        retryIntent === null &&
        mutation.storageReservationProof === null &&
        record.nextCommandId === commandId('reserve', mutation.storageReservationId)
      );
    }
    if (nextCommandType === 'VERIFY_SETTINGS_HOST_PERMISSIONS') {
      return (
        retryIntent === null &&
        mutation.storageReservationProof !== null &&
        mutation.permissionProof === null &&
        mutation.requiredOrigins.length > 0 &&
        record.nextCommandId === commandId('permission_check', mutation.permissionCheckId)
      );
    }
    if (nextCommandType === 'COMPARE_AND_SETTLE_SETTINGS') {
      return (
        retryIntent === null &&
        mutation.storageReservationProof !== null &&
        (mutation.requiredOrigins.length === 0 || mutation.permissionProof !== null) &&
        record.nextCommandId === commandId('write', mutation.mutationId)
      );
    }
    if (nextCommandType === 'REBASE_SETTINGS_MUTATION') {
      return (
        retryIntent !== null &&
        retryIntent.failedMutationId === mutation.mutationId &&
        requestId === retryIntent.requestId &&
        record.nextCommandId === commandId('rebase', retryIntent.requestId)
      );
    }
    if (nextCommandType === 'CLEAR_SETTINGS_PENDING_INTENT') {
      return (
        retryIntent === null &&
        terminalSettlement !== null &&
        requestId === terminalSettlement.requestId &&
        record.nextCommandId === commandId('clear_intent', terminalSettlement.requestId)
      );
    }
    const kind =
      nextCommandType === 'RECOVER_SETTINGS_TRANSACTION'
        ? 'recover'
        : nextCommandType === 'ABORT_SETTINGS_MUTATION'
          ? 'abort'
          : 'reconcile';
    return (
      retryIntent === null &&
      requestId !== null &&
      (nextCommandType !== 'RECOVER_SETTINGS_TRANSACTION' ||
        mutation.storageReservationProof !== null) &&
      mutation.correlationIds.includes(requestId) &&
      record.nextCommandId === commandId(kind, requestId)
    );
  })();
  if (
    mutationCommand === null ||
    mutationCommand.dataEpoch !== record.dataEpoch ||
    !settingsIdentitiesAreDisjointFromEpochs(
      record.dataEpoch,
      record.originWorkerEpoch,
      pendingIdentityIds
    ) ||
    !record.nextCommandId.startsWith(PENDING_INTENT_COMMAND_PREFIX[nextCommandType]) ||
    PENDING_INTENT_PHASE_BY_COMMAND[nextCommandType] !== phase ||
    PENDING_INTENT_REQUEST_COMMANDS.has(nextCommandType) !== (record.requestId !== null) ||
    !commandIdentityValid
  ) {
    return null;
  }
  const parsed = createSettingsPendingIntentV1({
    dataEpoch: record.dataEpoch,
    originWorkerEpoch: record.originWorkerEpoch,
    intentRevision: Number(record.intentRevision),
    mutation,
    retryIntent,
    phase,
    nextCommandType,
    nextCommandId: record.nextCommandId,
    requestId: record.requestId as string | null,
    terminalSettlement,
  });
  return parsed.intentDigest === record.intentDigest &&
    utf8ByteLength(JSON.stringify(parsed)) <= MAX_SETTINGS_PENDING_INTENT_ENCODED_BYTES
    ? parsed
    : null;
}

export function parseSettingsColdStartRecoverySeedV1(
  value: unknown,
  includedIds: string[]
): SettingsColdStartRecoverySeedV1 | null {
  const record = readStrictJsonRecord(value, [
    'version',
    'dataEpoch',
    'recoveryWorkerEpoch',
    'recoveryRequestId',
    'pendingIntent',
    'envelope',
  ]);
  const pendingIntent = parseSettingsPendingIntentV1(record?.pendingIntent, includedIds);
  const envelope =
    typeof record?.dataEpoch === 'string'
      ? parseSettingsEnvelopeV2(record.envelope, record.dataEpoch, includedIds)
      : null;
  if (
    record === null ||
    record.version !== 1 ||
    pendingIntent === null ||
    envelope === null ||
    record.dataEpoch !== pendingIntent.dataEpoch ||
    !isUuidV4(record.recoveryWorkerEpoch) ||
    !isUuidV4(record.recoveryRequestId)
  ) {
    return null;
  }
  const mutation = pendingIntent.mutation;
  const journal = envelope.journal;
  const outcome = envelope.outcomes.find((item) => item.mutationId === mutation.mutationId) ?? null;
  const preexistingIds = new Set<string>([
    record.dataEpoch,
    pendingIntent.originWorkerEpoch,
    mutation.mutationId,
    mutation.permissionCheckId,
    mutation.activationId,
    mutation.activationResultId,
    mutation.storageReservationId,
    ...mutation.correlationIds,
    ...(mutation.storageReservationProof
      ? [mutation.storageReservationProof.gateLeaseId, mutation.storageReservationProof.proofId]
      : []),
    ...(pendingIntent.retryIntent
      ? [
          pendingIntent.retryIntent.mutationId,
          pendingIntent.retryIntent.permissionCheckId,
          pendingIntent.retryIntent.activationId,
          pendingIntent.retryIntent.activationResultId,
          pendingIntent.retryIntent.storageReservationId,
          pendingIntent.retryIntent.requestId,
        ]
      : []),
    ...(pendingIntent.terminalSettlement
      ? [
          pendingIntent.terminalSettlement.requestId,
          ...pendingIntent.terminalSettlement.outcome.correlationIds,
        ]
      : []),
    ...(journal ? [journal.transactionId, ...journal.correlationIds] : []),
    ...envelope.outcomes.flatMap((item) => item.correlationIds),
  ]);
  if (
    record.recoveryWorkerEpoch === record.recoveryRequestId ||
    preexistingIds.has(record.recoveryWorkerEpoch) ||
    preexistingIds.has(record.recoveryRequestId) ||
    (journal !== null &&
      (journal.mutationId !== mutation.mutationId ||
        journal.commandDigest !== mutation.commandDigest ||
        journal.previousDigest !== mutation.previousDigest ||
        journal.candidateDigest !== mutation.candidateDigest ||
        journal.baseRevision !== mutation.baseRevision ||
        journal.baseGeneration !== mutation.baseGeneration)) ||
    (outcome !== null && !outcomeMatchesMutation(outcome, mutation)) ||
    (pendingIntent.terminalSettlement !== null &&
      (outcome === null ||
        pendingIntent.terminalSettlement.outcome.outcome !== outcome.outcome ||
        pendingIntent.terminalSettlement.outcome.settledGeneration !==
          outcome.settledGeneration)) ||
    envelope.revision < mutation.baseRevision ||
    envelope.generation < mutation.baseGeneration ||
    (journal === null &&
      outcome === null &&
      envelope.revision === mutation.baseRevision &&
      settingsDigest(envelope.settings) !== mutation.previousDigest)
  ) {
    return null;
  }
  return {
    version: 1,
    dataEpoch: record.dataEpoch,
    recoveryWorkerEpoch: record.recoveryWorkerEpoch,
    recoveryRequestId: record.recoveryRequestId,
    pendingIntent,
    envelope,
  };
}

export function parseSettingsPendingIntentPersistedProofV1(
  value: unknown,
  context: SettingsPersistenceContext
): SettingsPendingIntentPersistedProofV1 | null {
  const command = context.command;
  const record = readStrictJsonRecord(value, [
    'version',
    'kind',
    'storageArea',
    'storageKey',
    'dataEpoch',
    'mutationId',
    'originWorkerEpoch',
    'intentRevision',
    'intentDigest',
    'commandId',
    'proofId',
    'readBackVerified',
  ]);
  if (
    command?.type !== 'PERSIST_SETTINGS_PENDING_INTENT' ||
    record === null ||
    record.version !== 1 ||
    record.kind !== 'SETTINGS_PENDING_INTENT_PERSISTED' ||
    record.storageArea !== 'session' ||
    record.storageKey !== SETTINGS_PENDING_INTENT_STORAGE_KEY ||
    record.dataEpoch !== command.dataEpoch ||
    record.mutationId !== command.pendingIntent.mutation.mutationId ||
    record.originWorkerEpoch !== command.pendingIntent.originWorkerEpoch ||
    record.intentRevision !== command.intentRevision ||
    record.intentDigest !== command.intentDigest ||
    record.commandId !== command.commandId ||
    !isUuidV4(record.proofId) ||
    record.readBackVerified !== true
  ) {
    return null;
  }
  return { ...(record as unknown as SettingsPendingIntentPersistedProofV1) };
}

export function parseSettingsPendingIntentAbsentProofV1(
  value: unknown,
  context: SettingsPersistenceContext
): SettingsPendingIntentAbsentProofV1 | null {
  const command = context.command;
  const record = readStrictJsonRecord(value, [
    'version',
    'kind',
    'storageArea',
    'storageKey',
    'dataEpoch',
    'mutationId',
    'originWorkerEpoch',
    'intentRevision',
    'intentDigest',
    'commandId',
    'proofId',
    'absenceReadBackVerified',
  ]);
  if (
    command?.type !== 'PERSIST_SETTINGS_PENDING_INTENT' ||
    command.intentRevision !== 1 ||
    command.pendingIntent.mutation.storageReservationProof !== null ||
    record === null ||
    record.version !== 1 ||
    record.kind !== 'SETTINGS_PENDING_INTENT_ABSENT' ||
    record.storageArea !== 'session' ||
    record.storageKey !== SETTINGS_PENDING_INTENT_STORAGE_KEY ||
    record.dataEpoch !== command.dataEpoch ||
    record.mutationId !== command.pendingIntent.mutation.mutationId ||
    record.originWorkerEpoch !== command.pendingIntent.originWorkerEpoch ||
    record.intentRevision !== 1 ||
    record.intentDigest !== command.intentDigest ||
    record.commandId !== command.commandId ||
    !isUuidV4(record.proofId) ||
    record.absenceReadBackVerified !== true
  ) {
    return null;
  }
  return { ...(record as unknown as SettingsPendingIntentAbsentProofV1) };
}

export function parseSettingsPendingIntentClearedProofV1(
  value: unknown,
  context: SettingsPersistenceContext
): SettingsPendingIntentClearedProofV1 | null {
  const command = context.command;
  const record = readStrictJsonRecord(value, [
    'version',
    'kind',
    'storageArea',
    'storageKey',
    'dataEpoch',
    'mutationId',
    'originWorkerEpoch',
    'intentRevision',
    'intentDigest',
    'commandId',
    'proofId',
    'absenceReadBackVerified',
  ]);
  if (
    command?.type !== 'CLEAR_SETTINGS_PENDING_INTENT' ||
    record === null ||
    record.version !== 1 ||
    record.kind !== 'SETTINGS_PENDING_INTENT_CLEARED' ||
    record.storageArea !== 'session' ||
    record.storageKey !== SETTINGS_PENDING_INTENT_STORAGE_KEY ||
    record.dataEpoch !== command.dataEpoch ||
    record.mutationId !== command.mutationId ||
    record.originWorkerEpoch !== command.originWorkerEpoch ||
    record.intentRevision !== command.intentRevision ||
    record.intentDigest !== command.intentDigest ||
    record.commandId !== command.commandId ||
    !isUuidV4(record.proofId) ||
    record.absenceReadBackVerified !== true
  ) {
    return null;
  }
  return { ...(record as unknown as SettingsPendingIntentClearedProofV1) };
}

export function parseSettledSettingsSnapshot(
  value: unknown,
  dataEpoch: string,
  includedIds: string[]
): SettingsSnapshotV1 | null {
  const record = readStrictJsonRecord(value, [
    'version',
    'dataEpoch',
    'requestId',
    'commandId',
    'resetJournalAbsent',
    'envelope',
    'alarmProof',
  ]);
  if (record === null) {
    return null;
  }
  const envelope = parseSettingsEnvelopeV2(record.envelope, dataEpoch, includedIds);
  if (
    record.version !== 1 ||
    record.dataEpoch !== dataEpoch ||
    !isUuidV4(record.requestId) ||
    !isSettingsCommandId(record.commandId) ||
    record.resetJournalAbsent !== true ||
    envelope === null ||
    envelope.journal !== null
  ) {
    return null;
  }
  const alarmProof = parseAutoScanAlarmProofV1(
    record.alarmProof,
    envelope,
    record.requestId,
    record.commandId
  );
  return alarmProof === null
    ? null
    : {
        version: 1,
        dataEpoch,
        requestId: record.requestId,
        commandId: record.commandId,
        resetJournalAbsent: true,
        envelope,
        alarmProof,
      };
}

export function isSettledSettingsSnapshot(
  value: unknown,
  dataEpoch: string,
  includedIds: string[]
): value is SettingsSnapshotV1 {
  return parseSettledSettingsSnapshot(value, dataEpoch, includedIds) !== null;
}

export function parseCompensationPendingJournalProof(
  value: unknown,
  dataEpoch: string,
  includedIds: string[],
  mutation: SettingMutation,
  recoveryRequestId: string,
  expectedCommandId: string
): SettingsJournalProofV1 | null {
  const record = readStrictJsonRecord(value, [
    'version',
    'dataEpoch',
    'requestId',
    'commandId',
    'resetJournalAbsent',
    'envelope',
  ]);
  if (record === null) {
    return null;
  }
  const envelope = parseSettingsEnvelopeV2(record.envelope, dataEpoch, includedIds);
  if (
    record.version !== 1 ||
    record.dataEpoch !== dataEpoch ||
    record.requestId !== recoveryRequestId ||
    record.commandId !== expectedCommandId ||
    record.resetJournalAbsent !== true ||
    envelope === null
  ) {
    return null;
  }
  const journal = envelope.journal;
  if (
    journal === null ||
    journal.phase !== 'compensation_pending' ||
    journal.mutationId !== mutation.mutationId ||
    journal.commandDigest !== mutation.commandDigest ||
    journal.baseRevision !== mutation.baseRevision ||
    journal.baseGeneration !== mutation.baseGeneration ||
    journal.previousDigest !== mutation.previousDigest ||
    journal.candidateDigest !== mutation.candidateDigest ||
    !journal.correlationIds.includes(recoveryRequestId)
  ) {
    return null;
  }
  return {
    version: 1,
    dataEpoch,
    requestId: recoveryRequestId,
    commandId: expectedCommandId,
    resetJournalAbsent: true,
    envelope,
  };
}

export function isCompensationPendingJournalProof(
  value: unknown,
  dataEpoch: string,
  includedIds: string[],
  mutation: SettingMutation,
  recoveryRequestId: string,
  expectedCommandId: string
): value is SettingsJournalProofV1 {
  return (
    parseCompensationPendingJournalProof(
      value,
      dataEpoch,
      includedIds,
      mutation,
      recoveryRequestId,
      expectedCommandId
    ) !== null
  );
}

export type ErrorContract = Omit<SettingsPersistenceError, 'version' | 'message'>;
const ERROR_CONTRACTS: ErrorContract[] = [
  {
    code: 'SETTINGS_LOAD_FAILED',
    operation: 'load',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_LOAD_FAILED',
    operation: 'rebase',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_INVALID',
    operation: 'load',
    recoverable: false,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_INVALID',
    operation: 'mutate',
    recoverable: true,
    mutationOutcome: 'previous',
    canonicalKnowledge: 'known',
  },
  {
    code: 'SETTINGS_BUSY',
    operation: 'mutate',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'known',
  },
  {
    code: 'SETTINGS_ACTIVATION_REJECTED',
    operation: 'activation',
    recoverable: true,
    mutationOutcome: 'previous',
    canonicalKnowledge: 'known',
  },
  {
    code: 'SETTINGS_ACTIVATION_CAPACITY_EXHAUSTED',
    operation: 'activation',
    recoverable: false,
    mutationOutcome: 'previous',
    canonicalKnowledge: 'known',
  },
  {
    code: 'SETTINGS_HOST_PERMISSION_MISSING',
    operation: 'permission_check',
    recoverable: true,
    mutationOutcome: 'previous',
    canonicalKnowledge: 'known',
  },
  {
    code: 'SETTINGS_STORAGE_FAILED',
    operation: 'permission_check',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_STORAGE_FAILED',
    operation: 'pending_intent',
    recoverable: true,
    mutationOutcome: 'previous',
    canonicalKnowledge: 'known',
  },
  {
    code: 'SETTINGS_STORAGE_FAILED',
    operation: 'load',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_STORAGE_FAILED',
    operation: 'rebase',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_STORAGE_FAILED',
    operation: 'save',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_STORAGE_FAILED',
    operation: 'compensate',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_STORAGE_FAILED',
    operation: 'cancel',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_STORAGE_FAILED',
    operation: 'reconcile',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_CONFLICT',
    operation: 'permission_check',
    recoverable: true,
    mutationOutcome: 'previous',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_CONFLICT',
    operation: 'save',
    recoverable: true,
    mutationOutcome: 'previous',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_RUNTIME_EFFECT_FAILED',
    operation: 'effect',
    recoverable: true,
    mutationOutcome: 'candidate',
    canonicalKnowledge: 'known',
  },
  {
    code: 'SETTINGS_RUNTIME_EFFECT_FAILED',
    operation: 'compensate',
    recoverable: true,
    mutationOutcome: 'previous',
    canonicalKnowledge: 'known',
  },
  {
    code: 'SETTINGS_COMPENSATION_FAILED',
    operation: 'compensate',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_RECONCILE_FAILED',
    operation: 'reconcile',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_TRANSPORT_ERROR',
    operation: 'load',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_TRANSPORT_ERROR',
    operation: 'pending_intent',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'known',
  },
  {
    code: 'SETTINGS_TRANSPORT_ERROR',
    operation: 'permission_check',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_TRANSPORT_ERROR',
    operation: 'rebase',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_TRANSPORT_ERROR',
    operation: 'save',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_TRANSPORT_ERROR',
    operation: 'compensate',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_TRANSPORT_ERROR',
    operation: 'cancel',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_TRANSPORT_ERROR',
    operation: 'reconcile',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_PROTOCOL_ERROR',
    operation: 'load',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_PROTOCOL_ERROR',
    operation: 'reconcile',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_WORKER_RESTARTED',
    operation: 'reconcile',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_RESET_IN_PROGRESS',
    operation: 'load',
    recoverable: true,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
  },
  {
    code: 'SETTINGS_NOT_COMMITTED',
    operation: 'reconcile',
    recoverable: true,
    mutationOutcome: 'previous',
    canonicalKnowledge: 'known',
  },
  {
    code: 'SETTINGS_SUPERSEDED',
    operation: 'reconcile',
    recoverable: true,
    mutationOutcome: 'candidate',
    canonicalKnowledge: 'known',
  },
  {
    code: 'SETTINGS_SUPERSEDED',
    operation: 'reconcile',
    recoverable: true,
    mutationOutcome: 'previous',
    canonicalKnowledge: 'known',
  },
  {
    code: 'SETTINGS_OUTCOME_MISSING',
    operation: 'reconcile',
    recoverable: false,
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'known',
  },
  {
    code: 'SETTINGS_LEDGER_QUOTA_EXHAUSTED',
    operation: 'mutate',
    recoverable: false,
    mutationOutcome: 'previous',
    canonicalKnowledge: 'known',
  },
  {
    code: 'SETTINGS_GLOBAL_STORAGE_QUOTA_EXHAUSTED',
    operation: 'mutate',
    recoverable: true,
    mutationOutcome: 'previous',
    canonicalKnowledge: 'known',
  },
  {
    code: 'SETTINGS_GENERATION_EXHAUSTED',
    operation: 'save',
    recoverable: false,
    mutationOutcome: 'previous',
    canonicalKnowledge: 'known',
  },
  {
    code: 'SETTINGS_REVISION_EXHAUSTED',
    operation: 'save',
    recoverable: false,
    mutationOutcome: 'previous',
    canonicalKnowledge: 'known',
  },
];

export function parseExactSettingsError(
  value: unknown,
  allowedCodes?: SettingsErrorCode[],
  allowedOperations?: SettingsOperation[]
): SettingsPersistenceError | null {
  const record = readStrictJsonRecord(value, [
    'version',
    'code',
    'operation',
    'message',
    'recoverable',
    'mutationOutcome',
    'canonicalKnowledge',
  ]);
  if (
    record === null ||
    record.version !== 1 ||
    typeof record.message !== 'string' ||
    record.message.length < 1 ||
    record.message.length > 500
  ) {
    return null;
  }
  const contract = ERROR_CONTRACTS.find(
    (contract) =>
      (!allowedCodes || allowedCodes.includes(contract.code)) &&
      (!allowedOperations || allowedOperations.includes(contract.operation)) &&
      record.code === contract.code &&
      record.operation === contract.operation &&
      record.recoverable === contract.recoverable &&
      record.mutationOutcome === contract.mutationOutcome &&
      record.canonicalKnowledge === contract.canonicalKnowledge
  );
  return contract
    ? {
        version: 1,
        ...contract,
        message: record.message,
      }
    : null;
}

export function isExactSettingsError(
  value: unknown,
  allowedCodes?: SettingsErrorCode[],
  allowedOperations?: SettingsOperation[]
): value is SettingsPersistenceError {
  return parseExactSettingsError(value, allowedCodes, allowedOperations) !== null;
}

export const makeError = (contract: ErrorContract, message: string): SettingsPersistenceError => ({
  version: 1,
  ...contract,
  message,
});

export function contractFor(
  code: SettingsErrorCode,
  outcome?: MutationOutcomeKnowledge,
  operation?: SettingsOperation
): ErrorContract {
  const contract = ERROR_CONTRACTS.find(
    (item) =>
      item.code === code &&
      (outcome === undefined || item.mutationOutcome === outcome) &&
      (operation === undefined || item.operation === operation)
  );
  if (!contract) {
    throw new Error(`Missing settings error contract: ${code}`);
  }
  return contract;
}

export function inputIsValid(context: SettingsPersistenceContext): boolean {
  const ids = context.includedConnectorIds;
  const keys = Object.keys(context.permissionOriginsByConnectorId).sort();
  const activationIds = context.handledActivationIds;
  const activationResultIds = context.handledActivationResultIds;
  return (
    isUuidV4(context.dataEpoch) &&
    isUuidV4(context.workerEpoch) &&
    isUuidV4(context.loadRequestId) &&
    (context.coldStartSeedProvided
      ? context.coldStartSeed !== null &&
        context.coldStartSeed.dataEpoch === context.dataEpoch &&
        context.coldStartSeed.recoveryWorkerEpoch === context.workerEpoch
      : context.coldStartSeed === null) &&
    activationIds.length === activationResultIds.length &&
    activationIds.length <= MAX_SETTINGS_HANDLED_ACTIVATIONS_PER_WORKER &&
    activationIds.every(isUuidV4) &&
    activationResultIds.every(isUuidV4) &&
    new Set(activationIds).size === activationIds.length &&
    new Set(activationResultIds).size === activationResultIds.length &&
    !activationIds.some((id) => activationResultIds.includes(id)) &&
    ids.length > 0 &&
    new Set(ids).size === ids.length &&
    [...ids].sort().every((id, index) => id === ids[index]) &&
    isStrictSettings(context.defaultSettings, ids) &&
    keys.length === ids.length &&
    keys.every((id, index) => id === ids[index]) &&
    keys.every((id) => {
      const origins = context.permissionOriginsByConnectorId[id];
      return (
        Array.isArray(origins) &&
        origins.length > 0 &&
        new Set(origins).size === origins.length &&
        origins.every(
          (origin) => typeof origin === 'string' && origin.length > 0 && origin.length <= 2048
        ) &&
        [...origins].sort().every((origin, index) => origin === origins[index])
      );
    })
  );
}

const INVALID_SETTINGS_EVENT_CAPTURE = Symbol('invalid-settings-event-capture');
const SETTINGS_EVENT_CAPTURE_MAX_DEPTH = 64;
const SETTINGS_EVENT_CAPTURE_MAX_NODES = 100_000;
export const SETTINGS_CAPTURED_EVENT_PREFIX = 'SETTINGS_CAPTURED/' as const;

type CapturedBoundaryValue = unknown | typeof INVALID_SETTINGS_EVENT_CAPTURE;

/**
 * Takes one recursive descriptor snapshot of an untrusted event graph.
 * Reflection against each source object/array and each own field happens once;
 * the returned graph is detached and deeply frozen before semantic parsing.
 */
function captureSettingsEventBoundary(value: unknown): CapturedBoundaryValue {
  const seen = new WeakSet<object>();
  let nodes = 0;

  function capture(current: unknown, depth: number): CapturedBoundaryValue {
    nodes += 1;
    if (nodes > SETTINGS_EVENT_CAPTURE_MAX_NODES || depth > SETTINGS_EVENT_CAPTURE_MAX_DEPTH) {
      return INVALID_SETTINGS_EVENT_CAPTURE;
    }
    if (
      current === null ||
      current === undefined ||
      typeof current === 'string' ||
      typeof current === 'boolean'
    ) {
      return current;
    }
    if (typeof current === 'number') {
      return Number.isFinite(current) ? current : INVALID_SETTINGS_EVENT_CAPTURE;
    }
    if (typeof current !== 'object' || seen.has(current)) {
      return INVALID_SETTINGS_EVENT_CAPTURE;
    }

    seen.add(current);
    try {
      if (Array.isArray(current)) {
        if (Object.getPrototypeOf(current) !== Array.prototype) {
          return INVALID_SETTINGS_EVENT_CAPTURE;
        }
        const lengthDescriptor = Object.getOwnPropertyDescriptor(current, 'length');
        if (
          lengthDescriptor === undefined ||
          !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
          !Number.isSafeInteger(lengthDescriptor.value) ||
          Number(lengthDescriptor.value) < 0
        ) {
          return INVALID_SETTINGS_EVENT_CAPTURE;
        }
        const length = Number(lengthDescriptor.value);
        const ownKeys = Reflect.ownKeys(current);
        if (
          ownKeys.length !== length + 1 ||
          ownKeys.some(
            (key) =>
              typeof key !== 'string' ||
              (key !== 'length' &&
                (!/^(0|[1-9]\d*)$/.test(key) ||
                  !Number.isSafeInteger(Number(key)) ||
                  Number(key) >= length))
          )
        ) {
          return INVALID_SETTINGS_EVENT_CAPTURE;
        }
        const array: unknown[] = [];
        for (let index = 0; index < length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (
            descriptor === undefined ||
            descriptor.enumerable !== true ||
            !Object.prototype.hasOwnProperty.call(descriptor, 'value')
          ) {
            return INVALID_SETTINGS_EVENT_CAPTURE;
          }
          const captured = capture(descriptor.value, depth + 1);
          if (captured === INVALID_SETTINGS_EVENT_CAPTURE) {
            return INVALID_SETTINGS_EVENT_CAPTURE;
          }
          array.push(captured);
        }
        return Object.freeze(array);
      }

      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        return INVALID_SETTINGS_EVENT_CAPTURE;
      }
      const ownKeys = Reflect.ownKeys(current);
      if (ownKeys.some((key) => typeof key !== 'string')) {
        return INVALID_SETTINGS_EVENT_CAPTURE;
      }
      const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const key of ownKeys as string[]) {
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (
          descriptor === undefined ||
          descriptor.enumerable !== true ||
          !Object.prototype.hasOwnProperty.call(descriptor, 'value')
        ) {
          return INVALID_SETTINGS_EVENT_CAPTURE;
        }
        const captured = capture(descriptor.value, depth + 1);
        if (captured === INVALID_SETTINGS_EVENT_CAPTURE) {
          return INVALID_SETTINGS_EVENT_CAPTURE;
        }
        record[key] = captured;
      }
      return Object.freeze(record);
    } catch {
      return INVALID_SETTINGS_EVENT_CAPTURE;
    }
  }

  return capture(value, 0);
}

export interface SettingsShellEventBoundaryCapture {
  readonly value: unknown;
  readonly uuidIds: readonly string[];
}

/**
 * Gives the Shell coordinator one stable descriptor snapshot to dispatch and
 * an exact conservative identity inventory for that same immutable graph.
 * This grants no machine capability; the controller still performs semantic
 * normalization and its private ephemeral admission check.
 */
export function captureSettingsShellEventBoundary(
  value: unknown
): SettingsShellEventBoundaryCapture | null {
  const captured = captureSettingsEventBoundary(value);
  if (captured === INVALID_SETTINGS_EVENT_CAPTURE) {
    return null;
  }
  const ids = new Set<string>();
  const visit = (current: unknown): void => {
    if (isUuidV4(current)) {
      ids.add(current);
      return;
    }
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (typeof current === 'object' && current !== null) {
      Object.values(current).forEach(visit);
    }
  };
  visit(captured);
  return Object.freeze({
    value: captured,
    uuidIds: Object.freeze([...ids].sort()),
  });
}

const SETTINGS_RAW_EVENT_KEYSETS = {
  LOAD: [['type', 'dataEpoch', 'requestId']],
  LOAD_SUCCEEDED: [['type', 'dataEpoch', 'requestId', 'commandId', 'snapshot']],
  LOAD_FAILED: [['type', 'dataEpoch', 'requestId', 'commandId', 'error']],
  MUTATE: [
    [
      'type',
      'dataEpoch',
      'mutationId',
      'permissionCheckId',
      'activationId',
      'storageReservationId',
      'activationResult',
      'key',
      'candidate',
    ],
  ],
  STORAGE_RESERVATION_GRANTED: [['type', 'dataEpoch', 'mutationId', 'commandId', 'proof']],
  STORAGE_RESERVATION_DENIED: [['type', 'dataEpoch', 'mutationId', 'commandId', 'denial', 'error']],
  HOST_PERMISSIONS_VERIFIED: [['type', 'dataEpoch', 'mutationId', 'commandId', 'proof']],
  HOST_PERMISSIONS_MISSING: [['type', 'dataEpoch', 'mutationId', 'commandId', 'snapshot', 'error']],
  HOST_PERMISSIONS_OUTCOME_UNKNOWN: [
    ['type', 'dataEpoch', 'mutationId', 'commandId', 'nextRequestId', 'error'],
  ],
  SAVE_SUCCEEDED: [['type', 'dataEpoch', 'mutationId', 'commandId', 'snapshot']],
  SAVE_FAILED: [['type', 'dataEpoch', 'mutationId', 'commandId', 'nextRequestId', 'error']],
  RUNTIME_EFFECT_FAILED: [
    ['type', 'dataEpoch', 'mutationId', 'commandId', 'recoveryRequestId', 'journalProof', 'error'],
  ],
  COMPENSATION_SUCCEEDED: [
    ['type', 'dataEpoch', 'mutationId', 'requestId', 'commandId', 'snapshot'],
  ],
  COMPENSATION_FAILED: [
    ['type', 'dataEpoch', 'mutationId', 'requestId', 'commandId', 'nextRequestId', 'error'],
  ],
  RETRY: [
    [
      'type',
      'dataEpoch',
      'failedMutationId',
      'mutationId',
      'permissionCheckId',
      'activationId',
      'storageReservationId',
      'activationResult',
      'requestId',
    ],
  ],
  RETRY_READY: [['type', 'dataEpoch', 'mutationId', 'requestId', 'commandId', 'snapshot']],
  RETRY_FAILED: [
    ['type', 'dataEpoch', 'mutationId', 'requestId', 'commandId', 'nextRequestId', 'error'],
  ],
  CANCEL: [['type', 'dataEpoch', 'mutationId', 'requestId']],
  CANCEL_CONFIRMED: [['type', 'dataEpoch', 'mutationId', 'requestId', 'commandId', 'snapshot']],
  CANCEL_OUTCOME_UNKNOWN: [
    ['type', 'dataEpoch', 'mutationId', 'requestId', 'commandId', 'nextRequestId', 'error'],
  ],
  DISMISS_ERROR: [['type', 'dataEpoch', 'mutationId']],
  SERVICE_WORKER_RESTARTED: [['type', 'dataEpoch', 'requestId']],
  PROTOCOL_UNCERTAIN: [['type', 'dataEpoch', 'mutationId', 'nextRequestId', 'error']],
  RECONCILED: [['type', 'dataEpoch', 'requestId', 'commandId', 'snapshot']],
  RECONCILE_FAILED: [['type', 'dataEpoch', 'requestId', 'commandId', 'error']],
  RETRY_RECONCILIATION: [['type', 'dataEpoch', 'requestId']],
  SETTINGS_PENDING_INTENT_PERSISTED: [['type', 'dataEpoch', 'mutationId', 'commandId', 'proof']],
  SETTINGS_PENDING_INTENT_CLEARED: [['type', 'dataEpoch', 'mutationId', 'commandId', 'proof']],
  SETTINGS_PENDING_INTENT_PERSIST_FAILED: [
    ['type', 'dataEpoch', 'mutationId', 'commandId', 'proof', 'error'],
  ],
  SETTINGS_PENDING_INTENT_PERSIST_OUTCOME_UNKNOWN: [
    ['type', 'dataEpoch', 'mutationId', 'commandId', 'error'],
  ],
  SETTINGS_PENDING_INTENT_CLEAR_OUTCOME_UNKNOWN: [
    ['type', 'dataEpoch', 'mutationId', 'commandId', 'error'],
  ],
  CANONICAL_UPDATED: [['type', 'dataEpoch', 'broadcastId', 'snapshot', 'nextRequestId']],
  RESET_EPOCH_READY_TO_COMMIT: [['type', 'payload']],
  RESET_EPOCH_COMMITTED: [
    ['type', 'payload'],
    ['type', 'payload', 'resetFenceProof'],
  ],
} as const satisfies Record<SettingsPersistenceRawEvent['type'], readonly (readonly string[])[]>;

const SETTINGS_EVENT_NON_STRING_FIELDS = new Set([
  'type',
  'candidate',
  'activationResult',
  'payload',
  'snapshot',
  'proof',
  'denial',
  'error',
  'journalProof',
  'resetFenceProof',
]);
const PERSISTENT_SETTING_KEYS = new Set<PersistentSettingKey>([
  'autoScan',
  'scanIntervalMinutes',
  'notifications',
  'theme',
  'enabledConnectors',
]);

function exactCapturedEventKeys(
  record: Record<string, unknown>,
  keysets: readonly (readonly string[])[]
): boolean {
  const keys = Object.keys(record);
  return keysets.some(
    (expected) => keys.length === expected.length && keys.every((key) => expected.includes(key))
  );
}

function deepFreezeNormalizedEventValue(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(deepFreezeNormalizedEventValue);
  } else {
    Object.values(value).forEach(deepFreezeNormalizedEventValue);
  }
  Object.freeze(value);
}

const SNAPSHOT_EVENT_TYPES = new Set<SettingsPersistenceRawEvent['type']>([
  'LOAD_SUCCEEDED',
  'HOST_PERMISSIONS_MISSING',
  'SAVE_SUCCEEDED',
  'COMPENSATION_SUCCEEDED',
  'RETRY_READY',
  'CANCEL_CONFIRMED',
  'RECONCILED',
  'CANONICAL_UPDATED',
]);

const ERROR_EVENT_TYPES = new Set<SettingsPersistenceRawEvent['type']>([
  'LOAD_FAILED',
  'STORAGE_RESERVATION_DENIED',
  'HOST_PERMISSIONS_MISSING',
  'HOST_PERMISSIONS_OUTCOME_UNKNOWN',
  'SAVE_FAILED',
  'RUNTIME_EFFECT_FAILED',
  'COMPENSATION_FAILED',
  'RETRY_FAILED',
  'CANCEL_OUTCOME_UNKNOWN',
  'PROTOCOL_UNCERTAIN',
  'RECONCILE_FAILED',
  'SETTINGS_PENDING_INTENT_PERSIST_FAILED',
  'SETTINGS_PENDING_INTENT_PERSIST_OUTCOME_UNKNOWN',
  'SETTINGS_PENDING_INTENT_CLEAR_OUTCOME_UNKNOWN',
]);

/**
 * Raw-event capture and normalization helper for the Settings controller.
 *
 * The complete source graph is descriptor-captured once, then semantic parsers
 * operate only on that detached graph. The returned event uses a distinct type
 * namespace, contains normalized proofs/snapshots/payloads, and is deeply
 * frozen. This helper grants no dispatch capability: only the controller may
 * temporarily admit the returned identity around its private `actor.send`.
 * Calling `actor.send` with a raw or merely normalized event cannot match any
 * transition.
 */
export function normalizeSettingsPersistenceEvent(
  value: unknown,
  context: SettingsPersistenceContext
): SettingsPersistenceEvent | null {
  const captured = captureSettingsEventBoundary(value);
  if (
    captured === INVALID_SETTINGS_EVENT_CAPTURE ||
    typeof captured !== 'object' ||
    captured === null ||
    Array.isArray(captured)
  ) {
    return null;
  }
  const record = captured as Record<string, unknown>;
  const rawType = record.type;
  if (
    typeof rawType !== 'string' ||
    !Object.prototype.hasOwnProperty.call(SETTINGS_RAW_EVENT_KEYSETS, rawType)
  ) {
    return null;
  }
  const type = rawType as SettingsPersistenceRawEvent['type'];
  if (!exactCapturedEventKeys(record, SETTINGS_RAW_EVENT_KEYSETS[type])) {
    return null;
  }
  for (const key of Object.keys(record)) {
    if (!SETTINGS_EVENT_NON_STRING_FIELDS.has(key) && typeof record[key] !== 'string') {
      return null;
    }
  }
  if (type === 'MUTATE' && !PERSISTENT_SETTING_KEYS.has(record.key as PersistentSettingKey)) {
    return null;
  }
  if (
    type === 'RESET_EPOCH_COMMITTED' &&
    Object.prototype.hasOwnProperty.call(record, 'resetFenceProof') &&
    record.resetFenceProof === undefined
  ) {
    return null;
  }

  const normalized: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== 'type') {
      normalized[key] = record[key];
    }
  }
  normalized.type = `${SETTINGS_CAPTURED_EVENT_PREFIX}${type}`;

  if (type === 'MUTATE' || type === 'RETRY') {
    const activationResult = parseSettingsActivationRegistryResultV1(record.activationResult, {
      dataEpoch: String(record.dataEpoch),
      workerEpoch: context.workerEpoch,
      mutationId: String(record.mutationId),
      permissionCheckId: String(record.permissionCheckId),
      activationId: String(record.activationId),
      storageReservationId: String(record.storageReservationId),
    });
    if (activationResult === null) {
      return null;
    }
    normalized.activationResult = activationResult;
  }

  if (SNAPSHOT_EVENT_TYPES.has(type)) {
    const dataEpoch = record.dataEpoch;
    if (typeof dataEpoch !== 'string') {
      return null;
    }
    const snapshot = parseSettledSettingsSnapshot(
      record.snapshot,
      dataEpoch,
      context.includedConnectorIds
    );
    if (snapshot === null) {
      return null;
    }
    normalized.snapshot = snapshot;
  }

  if (ERROR_EVENT_TYPES.has(type)) {
    const error = parseExactSettingsError(record.error);
    if (error === null) {
      return null;
    }
    normalized.error = error;
  }

  if (type === 'STORAGE_RESERVATION_GRANTED' || type === 'STORAGE_RESERVATION_DENIED') {
    const mutation = context.mutation;
    const command = context.command;
    if (mutation === null || command?.type !== 'RESERVE_SETTINGS_STORAGE') {
      return null;
    }
    if (type === 'STORAGE_RESERVATION_GRANTED') {
      const proof = parseSettingsGlobalStorageReservationProof(
        record.proof,
        context.dataEpoch,
        mutation,
        command.byteProjection
      );
      if (proof === null) {
        return null;
      }
      normalized.proof = proof;
    } else {
      const denial = parseSettingsGlobalStorageReservationDenial(
        record.denial,
        context.dataEpoch,
        mutation,
        command.byteProjection
      );
      if (denial === null) {
        return null;
      }
      normalized.denial = denial;
    }
  } else if (type === 'HOST_PERMISSIONS_VERIFIED') {
    const mutation = context.mutation;
    const command = context.command;
    if (mutation === null || command?.type !== 'VERIFY_SETTINGS_HOST_PERMISSIONS') {
      return null;
    }
    const proof = parseSettingsHostPermissionContainsProofV1(record.proof, {
      dataEpoch: context.dataEpoch,
      mutationId: mutation.mutationId,
      permissionCheckId: command.permissionCheckId,
      activationId: command.activationId,
      activationResultId: command.activationResultId,
      origins: command.origins,
    });
    if (proof === null) {
      return null;
    }
    normalized.proof = proof;
  } else if (
    type === 'SETTINGS_PENDING_INTENT_PERSISTED' ||
    type === 'SETTINGS_PENDING_INTENT_CLEARED' ||
    type === 'SETTINGS_PENDING_INTENT_PERSIST_FAILED'
  ) {
    const proof =
      type === 'SETTINGS_PENDING_INTENT_PERSISTED'
        ? parseSettingsPendingIntentPersistedProofV1(record.proof, context)
        : type === 'SETTINGS_PENDING_INTENT_CLEARED'
          ? parseSettingsPendingIntentClearedProofV1(record.proof, context)
          : parseSettingsPendingIntentAbsentProofV1(record.proof, context);
    if (proof === null) {
      return null;
    }
    normalized.proof = proof;
  } else if (type === 'RUNTIME_EFFECT_FAILED') {
    const mutation = context.mutation;
    if (
      mutation === null ||
      typeof record.recoveryRequestId !== 'string' ||
      typeof record.commandId !== 'string'
    ) {
      return null;
    }
    const journalProof = parseCompensationPendingJournalProof(
      record.journalProof,
      context.dataEpoch,
      context.includedConnectorIds,
      mutation,
      record.recoveryRequestId,
      record.commandId
    );
    if (journalProof === null) {
      return null;
    }
    normalized.journalProof = journalProof;
  } else if (type === 'RESET_EPOCH_READY_TO_COMMIT' || type === 'RESET_EPOCH_COMMITTED') {
    const payload = parseLocalDataResetEpochEvent(record.payload);
    const expectedStage = type === 'RESET_EPOCH_READY_TO_COMMIT' ? 'ready_to_commit' : 'committed';
    if (payload === null || payload.stage !== expectedStage) {
      return null;
    }
    normalized.payload = payload;
    if (
      type === 'RESET_EPOCH_COMMITTED' &&
      Object.prototype.hasOwnProperty.call(record, 'resetFenceProof')
    ) {
      const resetFenceProof = parseResetFenceProof(record.resetFenceProof, payload);
      if (resetFenceProof === null) {
        return null;
      }
      normalized.resetFenceProof = resetFenceProof;
    }
  }

  deepFreezeNormalizedEventValue(normalized);
  return normalized as unknown as SettingsPersistenceEvent;
}
