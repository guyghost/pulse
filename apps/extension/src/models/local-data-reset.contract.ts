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
export const LOCAL_DATA_RESET_JOURNAL_KEY = 'missionpulse.localDataReset.v1' as const;
export const LOCAL_DATA_RESET_RECEIPT_KEY = 'missionpulse.localDataResetReceipt.v1' as const;
export const BACKGROUND_SCHEDULING_HANDOFF_SCHEMA_VERSION = 1 as const;
export const BACKGROUND_SCHEDULING_HANDOFF_KEY =
  'missionpulse.backgroundSchedulingHandoff.v1' as const;
export const BACKGROUND_SCHEDULING_HANDOFF_PAYLOAD_SCHEMA =
  'missionpulse.backgroundSchedulingHandoff.payload.v1' as const;
export const BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT = 131 as const;
export const BACKGROUND_SCHEDULING_HANDOFF_CONTROL_ATTEMPT_COUNT = 4 as const;
export const BACKGROUND_SCHEDULING_HANDOFF_CAS_ATTEMPTS_PER_TRANSITION = 3 as const;
export const BACKGROUND_SCHEDULING_HANDOFF_CAS_TRANSITIONS_PER_ATTEMPT = 132 as const;
export const BACKGROUND_SCHEDULING_HANDOFF_CAS_BUNDLE_COUNT = 1_584 as const;
export const BACKGROUND_SCHEDULING_HANDOFF_MANIFEST_ENTRY_COUNT = 1_587 as const;
export const BACKGROUND_SCHEDULING_HANDOFF_MAX_PAYLOAD_ENCODED_BYTES = 786_432 as const;
export const BACKGROUND_SCHEDULING_HANDOFF_MAX_SIDECAR_ENCODED_BYTES = 1_048_576 as const;
export const LOCAL_DATA_RESET_LOCAL_CLEAR_PRESERVED_KEYS = [
  LOCAL_DATA_RESET_JOURNAL_KEY,
  BACKGROUND_SCHEDULING_HANDOFF_KEY,
] as const;
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
  | 'committed'
  | 'handoff_adopted'
  | 'handoff_cleared';

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
  | 'postcommit_broadcast'
  | 'handoff_adoption'
  | 'handoff_cleanup'
  | 'post_clear_admission';

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
  | 'HANDOFF_ADOPTION_FAILED'
  | 'HANDOFF_CLEANUP_FAILED'
  | 'ADMISSION_OPEN_FAILED'
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
  backgroundSchedulingHandoff: BackgroundSchedulingHandoffReferenceV1 | null;
  requestedAt: number;
  retryCount: number;
  lastError: LocalDataResetError | null;
}

export interface BackgroundSchedulingHandoffReferenceV1 {
  schemaVersion: typeof BACKGROUND_SCHEDULING_HANDOFF_SCHEMA_VERSION;
  storageKey: typeof BACKGROUND_SCHEDULING_HANDOFF_KEY;
  sidecarId: string;
  handoffId: string;
  resetId: string;
  checkpointRevision: number;
  slotCount: number;
  payloadDigest: string;
  sourceControlLaneId: string;
  sourceControlLaneAttemptIndex: 0 | 1 | 2 | 3;
  sourceWorkerEpoch: string;
  capabilityManifestDigest: string;
  cleanupRecovery: BackgroundSchedulingHandoffCleanupRecoveryV1;
  sidecarEncodedBytes: number;
}

export interface BackgroundSchedulingHandoffCheckpointExpectationV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  resetId: string;
  previousDataEpoch: DatasetEpoch | null;
  sourceControlLaneId: string;
  sourceControlLaneAttemptIndex: 0 | 1 | 2 | 3;
  sourceWorkerEpoch: string;
  sidecarId: string;
  handoffId: string;
  capabilityManifestDigest: string;
}

export type BackgroundSchedulingHandoffJournalAtQuiescenceV1 =
  | {
      version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
      kind: 'present';
      journalRevision: number;
      proofId: string;
      readBackVerified: true;
    }
  | {
      version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
      kind: 'absent';
      journalRevision: null;
      proofId: string;
      absenceReadBackVerified: true;
    };

export interface BackgroundSchedulingHandoffWriterTransferV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  sourceWriterWorkerEpoch: string;
  handoffRevision: number;
  writerRevoked: true;
  activeLoadCommandId: null;
  activeCaptureCommandId: null;
  activeDrainCommandId: null;
  journalAtQuiescence: BackgroundSchedulingHandoffJournalAtQuiescenceV1;
  complete: true;
}

export type BackgroundSchedulingHandoffCapabilityKind =
  'sidecar_initialize' | 'slot_materialize' | 'sidecar_cleanup';

export interface BackgroundSchedulingHandoffCapabilityManifestEntryV1 {
  kind: BackgroundSchedulingHandoffCapabilityKind;
  controlAttemptIndex: 0 | 1 | 2 | 3 | null;
  transitionIndex: number;
  casAttempt: 0 | 1 | 2;
  commandId: string;
  resultId: string;
  capabilityId: string;
  bundleDigest: string;
}

export interface BackgroundSchedulingHandoffCapabilityManifestV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  sidecarId: string;
  handoffId: string;
  entries: BackgroundSchedulingHandoffCapabilityManifestEntryV1[];
}

export interface BackgroundSchedulingHandoffCapabilityManifestFactsV1 {
  manifest: BackgroundSchedulingHandoffCapabilityManifestV1;
  manifestDigest: string;
  cleanupRecovery: BackgroundSchedulingHandoffCleanupRecoveryV1;
}

export interface BackgroundSchedulingHandoffCleanupRecoveryV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  manifestDigest: string;
  bundles: [
    BackgroundSchedulingHandoffCapabilityManifestEntryV1,
    BackgroundSchedulingHandoffCapabilityManifestEntryV1,
    BackgroundSchedulingHandoffCapabilityManifestEntryV1,
  ];
}

export interface BackgroundSchedulingHandoffFrozenProvenanceV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  laneId: string;
  attemptIndex: 0 | 1 | 2 | 3;
  sourceWorkerEpoch: string;
  sidecarId: string;
  handoffId: string;
  capabilityManifest: BackgroundSchedulingHandoffCapabilityManifestV1;
  capabilityManifestDigest: string;
  frozenTargetDigest: string;
  frozenAtMailboxSequence: number;
}

export interface BackgroundSchedulingHandoffWorkerBoundCleanupTokenV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  kind: 'BACKGROUND_HANDOFF_WORKER_BOUND_CLEANUP_TOKEN';
  tokenId: string;
  resetId: string;
  sidecarId: string;
  handoffId: string;
  capabilityManifestDigest: string;
  sourceCapabilityId: string;
  sourceBundleDigest: string;
  cleanupCasAttempt: 0 | 1 | 2;
  laneId: string;
  workerEpoch: string;
  issuanceReceiptId: string;
  issuanceCommandId: string;
  issuanceResultId: string;
}

export interface BackgroundSchedulingHandoffReplacementLaneReceiptV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  kind: 'BACKGROUND_HANDOFF_REPLACEMENT_LANE_ISSUED';
  receiptId: string;
  commandId: string;
  resultId: string;
  resetId: string;
  sourceLaneId: string;
  sourceWorkerEpoch: string;
  replacementLaneId: string;
  replacementWorkerEpoch: string;
  sidecarId: string;
  handoffId: string;
  capabilityManifestDigest: string;
  previousAuthorityRevision: number;
  authorityRevision: number;
  sourceWorkerTokensInvalidated: true;
  commandResultReadBackVerified: true;
  cleanupTokens: [
    BackgroundSchedulingHandoffWorkerBoundCleanupTokenV1,
    BackgroundSchedulingHandoffWorkerBoundCleanupTokenV1,
    BackgroundSchedulingHandoffWorkerBoundCleanupTokenV1,
  ];
}

export interface BackgroundSchedulingHandoffCleanupExecutionProofV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  disposition: 'removed' | 'already_absent';
  executionLaneId: string;
  executingWorkerEpoch: string;
  cleanupCasAttempt: 0 | 1 | 2;
  cleanupCapabilityId: string;
  cleanupBundleDigest: string;
  replacementLaneReceipt: BackgroundSchedulingHandoffReplacementLaneReceiptV1 | null;
  cleanupToken: BackgroundSchedulingHandoffWorkerBoundCleanupTokenV1 | null;
}

export type BackgroundSchedulingHandoffSlotKind =
  'digest_first' | 'probe_first' | 'digest_duplicate' | 'probe_duplicate' | 'auto_scan';

export interface BackgroundSchedulingHandoffAlarmSlotV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  slotIndex: number;
  slotKind: BackgroundSchedulingHandoffSlotKind;
  alarmEventId: string;
  name: string;
  connectorId: string | null;
  firedAtMs: number;
  mailboxSequence: number;
  sourceWorkerEpoch: string;
}

export interface BackgroundSchedulingHandoffPayloadV1 {
  schemaVersion: typeof BACKGROUND_SCHEDULING_HANDOFF_SCHEMA_VERSION;
  payloadSchema: typeof BACKGROUND_SCHEDULING_HANDOFF_PAYLOAD_SCHEMA;
  sidecarId: string;
  handoffId: string;
  resetId: string;
  previousDataEpoch: DatasetEpoch | null;
  sourceWorkerEpoch: string;
  checkpointRevision: number;
  handoffClosed: true;
  closedAtMailboxSequence: number;
  lateCallbackPolicy: 'reject_reset_in_progress';
  controlLaneId: string;
  controlLaneAttemptIndex: 0 | 1 | 2 | 3;
  capabilityManifest: BackgroundSchedulingHandoffCapabilityManifestV1;
  capabilityManifestDigest: string;
  connectorOrder: string[];
  frozenTargetDigest: string;
  targetSlots: (BackgroundSchedulingHandoffAlarmSlotV1 | null)[];
  materializationCursor: number;
  casCursor: BackgroundSchedulingHandoffCasCursorV1 | null;
  slots: (BackgroundSchedulingHandoffAlarmSlotV1 | null)[];
  writerTransfer: BackgroundSchedulingHandoffWriterTransferV1;
}

export interface BackgroundSchedulingHandoffPayloadFactsV1 {
  payload: BackgroundSchedulingHandoffPayloadV1;
  canonicalPayloadJson: string;
  payloadDigest: string;
  writerTransferDigest: string;
  journalAtQuiescenceDigest: string;
  slotBitmap: string;
  slotCount: number;
  payloadEncodedBytes: number;
}

export interface BackgroundSchedulingHandoffSidecarV1 {
  schemaVersion: typeof BACKGROUND_SCHEDULING_HANDOFF_SCHEMA_VERSION;
  storageKey: typeof BACKGROUND_SCHEDULING_HANDOFF_KEY;
  payloadSchema: typeof BACKGROUND_SCHEDULING_HANDOFF_PAYLOAD_SCHEMA;
  sidecarId: string;
  handoffId: string;
  resetId: string;
  previousDataEpoch: DatasetEpoch | null;
  sourceWorkerEpoch: string;
  checkpointRevision: number;
  slotBitmap: string;
  slotCount: number;
  writerTransferDigest: string;
  journalAtQuiescenceDigest: string;
  payloadDigest: string;
  payloadEncodedBytes: number;
  payload: BackgroundSchedulingHandoffPayloadV1;
}

export interface BackgroundSchedulingHandoffCheckpointProofV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  kind: 'BACKGROUND_SCHEDULING_HANDOFF_CHECKPOINTED';
  resetId: string;
  previousDataEpoch: DatasetEpoch | null;
  reference: BackgroundSchedulingHandoffReferenceV1;
  sidecar: BackgroundSchedulingHandoffSidecarV1;
  frozenProvenance: BackgroundSchedulingHandoffFrozenProvenanceV1;
  sidecarIdPreallocatedBeforeWorkAdmission: true;
  readBackVerified: true;
}

export interface LocalDataResetSessionClearProofV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  kind: 'RESET_SESSION_CLEARED_WITH_HANDOFF_PRESERVED';
  resetId: string;
  storageArea: 'chrome.storage.session';
  reference: BackgroundSchedulingHandoffReferenceV1;
  sidecarReadBack: BackgroundSchedulingHandoffSidecarV1;
  sessionClearReadBackVerified: true;
}

export interface LocalDataResetLocalClearProofV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  kind: 'RESET_LOCAL_CLEARED_WITH_ALLOWLIST';
  resetId: string;
  storageArea: 'chrome.storage.local';
  preservedKeys: [typeof LOCAL_DATA_RESET_JOURNAL_KEY, typeof BACKGROUND_SCHEDULING_HANDOFF_KEY];
  reference: BackgroundSchedulingHandoffReferenceV1;
  sidecarReadBack: BackgroundSchedulingHandoffSidecarV1;
  journalKey: typeof LOCAL_DATA_RESET_JOURNAL_KEY;
  removedKeyCount: number;
  readBackVerified: true;
}

export interface BackgroundSchedulingHandoffAdoptionProofV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  kind: 'BACKGROUND_SCHEDULING_HANDOFF_ADOPTED';
  resetId: string;
  reference: BackgroundSchedulingHandoffReferenceV1;
  adoptingWorkerEpoch: string;
  adoptedSlotCount: number;
  adoptionReadBackVerified: true;
  sidecarStillPresent: true;
  journalCheckpointReadBackVerified: true;
}

export interface BackgroundSchedulingHandoffClearProofV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  kind: 'BACKGROUND_SCHEDULING_HANDOFF_CLEARED';
  resetId: string;
  reference: BackgroundSchedulingHandoffReferenceV1;
  cleanupExecution: BackgroundSchedulingHandoffCleanupExecutionProofV1;
  absenceReadBackVerified: true;
  journalCheckpointReadBackVerified: true;
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
  backgroundSchedulingHandoffAbsent: true;
  canonicalDataEpoch: DatasetEpoch;
  receipt: LocalDataResetReceiptV1;
  authority: LocalDataResetPostClearAuthorityProofV1;
}

export interface LocalDataResetAdmissionOpenedProofV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  kind: 'RESET_EPOCH_ADMISSION_OPENED';
  resetId: string;
  dataEpoch: DatasetEpoch;
  authorityRevision: number;
  admission: 'open';
  proofId: string;
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
  backgroundSchedulingHandoffAbsent: true;
  canonicalDataEpoch: DatasetEpoch | null;
}

export type LocalDataResetRehydrationDatabaseAuthorityV1 =
  | {
      kind: 'previous_epoch';
      dataEpoch: DatasetEpoch | null;
      readBackVerified: true;
    }
  | { kind: 'absent'; absenceReadBackVerified: true }
  | {
      kind: 'next_epoch';
      authority: LocalDataResetPostClearAuthorityProofV1;
      readBackVerified: true;
    };

export type LocalDataResetRehydrationHandoffAuthorityV1 =
  | { kind: 'not_checkpointed'; sidecarAbsent: true }
  | {
      kind: 'checkpointed_present';
      reference: BackgroundSchedulingHandoffReferenceV1;
      sidecar: BackgroundSchedulingHandoffSidecarV1;
    }
  | {
      kind: 'adopted_present';
      reference: BackgroundSchedulingHandoffReferenceV1;
      sidecar: BackgroundSchedulingHandoffSidecarV1;
      adoption: BackgroundSchedulingHandoffAdoptionProofV1;
    }
  | {
      kind: 'cleared_absent';
      reference: BackgroundSchedulingHandoffReferenceV1;
      absenceReadBackVerified: true;
      journalCheckpointReadBackVerified: true;
    };

export interface LocalDataResetRehydrationPhysicalAuthorityV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  journal: LocalDataResetJournalV1;
  authorityRevision: number;
  fenceRevision: number;
  database: LocalDataResetRehydrationDatabaseAuthorityV1;
  receipt: LocalDataResetReceiptV1 | null;
  handoffExpectation: BackgroundSchedulingHandoffCheckpointExpectationV1;
  handoff: LocalDataResetRehydrationHandoffAuthorityV1;
  replacementLaneReceipt: BackgroundSchedulingHandoffReplacementLaneReceiptV1 | null;
}

export interface ResetPreAdmissionReservationV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  kind: 'RESET_PRE_ADMISSION_REHYDRATED';
  reservationId: string;
  origin: 'journal_rehydration';
  resetId: string;
  workerEpoch: string;
  previousDataEpoch: DatasetEpoch | null;
  nextDataEpoch: DatasetEpoch;
  journalPhase: LocalDataResetPhase;
  journalDigest: string;
  physicalAuthorityDigest: string;
  authorityRevision: number;
  fenceRevision: number;
  journalStatus: 'durable_proven';
  handoffExpectation: BackgroundSchedulingHandoffCheckpointExpectationV1;
}

export interface LocalDataResetFenceAuthorityProofV1 {
  version: typeof LOCAL_DATA_RESET_WIRE_VERSION;
  kind: 'RESET_FENCE_AUTHORITY_ACQUIRED';
  fenceProofId: string;
  reservationId: string;
  resetId: string;
  workerEpoch: string;
  previousDataEpoch: DatasetEpoch | null;
  nextDataEpoch: DatasetEpoch;
  journalPhase: LocalDataResetPhase;
  journalDigest: string;
  physicalAuthorityDigest: string;
  previousAuthorityRevision: number;
  authorityRevision: number;
  previousFenceRevision: number;
  fenceRevision: number;
  handoffExpectation: BackgroundSchedulingHandoffCheckpointExpectationV1;
  oldLeasesRevoked: true;
  replacementLaneReceipt: BackgroundSchedulingHandoffReplacementLaneReceiptV1 | null;
}

export interface LocalDataResetMachineInput {
  workerEpoch: string;
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
  backgroundSchedulingHandoffCheckpointed: boolean;
  databaseHandlesClosed: boolean;
  databaseDeleted: boolean;
  sessionCleared: boolean;
  localCleared: boolean;
  databaseReinitialized: boolean;
  settingsAligned: boolean;
  receiptPersisted: boolean;
  commitCheckpointed: boolean;
  backgroundSchedulingHandoffAdopted: boolean;
  backgroundSchedulingHandoffCleared: boolean;
}

export type LocalDataResetBroadcastDelivery = 'delivered' | 'no_receiver';
export type LocalDataResetRestartDisposition = 'resume' | 'blocked' | 'failed' | null;

export interface LocalDataResetContext extends LocalDataResetDurableFacts {
  workerEpoch: string;
  defaultSettings: AppSettings;
  includedConnectorIds: string[];
  resetId: string | null;
  previousDataEpoch: DatasetEpoch | null;
  nextDataEpoch: DatasetEpoch | null;
  settingsRecoveryRequestId: string | null;
  settingsBootstrapRequestId: string | null;
  requestedAt: number | null;
  phase: 'none' | LocalDataResetPhase;
  backgroundSchedulingHandoff: BackgroundSchedulingHandoffReferenceV1 | null;
  backgroundSchedulingHandoffExpectation: BackgroundSchedulingHandoffCheckpointExpectationV1 | null;
  backgroundSchedulingCleanupReplacementRequired: boolean;
  backgroundSchedulingCleanupReplacementReceipt: BackgroundSchedulingHandoffReplacementLaneReceiptV1 | null;
  expectedStep: LocalDataResetStep | null;
  expectedErrorOrigin: LocalDataResetErrorOrigin | null;
  journalCheckpointExpected: boolean;
  journalPersisted: boolean;
  journalOutcome: 'none' | 'absent_proven' | 'outcome_unknown' | 'durable_proven';
  fenceAcquired: boolean;
  admissionOpen: boolean;
  restartDisposition: LocalDataResetRestartDisposition;
  readinessDelivery: LocalDataResetBroadcastDelivery | null;
  postCommitDelivery: LocalDataResetBroadcastDelivery | null;
  completionDisposition: 'executed' | 'recognized' | null;
  retryCount: number;
  error: LocalDataResetError | null;
  pendingFailure: LocalDataResetError | null;
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
  | { type: 'RESET_JOURNAL_OUTCOME_UNKNOWN'; resetId: string }
  | { type: 'RESET_JOURNAL_ABSENCE_PROVEN'; resetId: string }
  | { type: 'RESET_FENCE_AUTHORITY_ACQUIRED'; resetId: string; proof: unknown }
  | { type: 'FENCE_CHECKPOINTED'; resetId: string }
  | { type: 'BOOT_FENCE_ACQUIRED'; resetId: string; proof: unknown }
  | { type: 'SCAN_QUIESCED'; resetId: string }
  | { type: 'TRACKING_QUIESCED'; resetId: string }
  | { type: 'MIGRATION_QUIESCED'; resetId: string }
  | { type: 'OUTBOX_QUIESCED'; resetId: string }
  | {
      type: 'BACKGROUND_SCHEDULING_HANDOFF_CHECKPOINTED';
      resetId: string;
      proof: unknown;
    }
  | { type: 'QUIESCENCE_CHECKPOINTED'; resetId: string }
  | { type: 'DB_HANDLES_CLOSED'; resetId: string }
  | { type: 'DATABASE_DELETED'; resetId: string }
  | { type: 'SESSION_CLEARED'; resetId: string; proof: unknown }
  | { type: 'LOCAL_CLEARED'; resetId: string; proof: unknown }
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
  | { type: 'BACKGROUND_SCHEDULING_HANDOFF_ADOPTED'; resetId: string; proof: unknown }
  | { type: 'BACKGROUND_SCHEDULING_HANDOFF_CLEARED'; resetId: string; proof: unknown }
  | { type: 'JOURNAL_CLEARED'; resetId: string }
  | { type: 'RESET_EPOCH_ADMISSION_OPENED'; resetId: string; proof: unknown }
  | { type: 'FAILURE_CHECKPOINTED'; resetId: string; journal: unknown }
  | { type: 'FAILURE_CHECKPOINT_FAILED'; resetId: string }
  | { type: 'RETRY_FAILURE_CHECKPOINT'; resetId: string }
  | { type: 'RETRY_CHECKPOINTED'; resetId: string; journal: unknown }
  | { type: 'RETRY_CHECKPOINT_FAILED'; resetId: string }
  | { type: 'RETRY_RETRY_CHECKPOINT'; resetId: string }
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
  'handoff_adopted',
  'handoff_cleared',
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
  'HANDOFF_ADOPTION_FAILED',
  'HANDOFF_CLEANUP_FAILED',
  'ADMISSION_OPEN_FAILED',
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
  'handoff_adoption',
  'handoff_cleanup',
  'post_clear_admission',
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

/** Reads a dense array whose own length is bounded before enumerating entries. */
function readBoundedExactDataArray(value: unknown, maxLength: number): unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      return null;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      descriptor === undefined ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      !Number.isSafeInteger(descriptor.value) ||
      descriptor.value < 0 ||
      descriptor.value > maxLength
    ) {
      return null;
    }
    return readExactDataArray(value, descriptor.value);
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
    case 'HANDOFF_ADOPTION_FAILED':
      return error.retryable && error.step === 'handoff_adoption';
    case 'HANDOFF_CLEANUP_FAILED':
      return error.retryable && error.step === 'handoff_cleanup';
    case 'ADMISSION_OPEN_FAILED':
      return error.retryable && error.step === 'post_clear_admission';
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
    case 'handoff_adopted':
      return 'handoff_cleanup';
    case 'handoff_cleared':
      return 'journal';
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
  if (phase === 'committed' && error.step === 'handoff_adoption') {
    return error.code === 'HANDOFF_ADOPTION_FAILED' || error.code === 'PROTOCOL_ERROR';
  }
  return error.step === expectedStepAfterPhase(phase);
}

function isSha256Digest(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function utf8Bytes(value: string): number[] {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      return [];
    }
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >>> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >>> 12),
        0x80 | ((codePoint >>> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >>> 18),
        0x80 | ((codePoint >>> 12) & 0x3f),
        0x80 | ((codePoint >>> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    }
  }
  return bytes;
}

function utf8ByteLength(value: string): number {
  return utf8Bytes(value).length;
}

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/** Pure synchronous SHA-256 used only by the executable reset contract. */
export function backgroundSchedulingSha256Hex(value: string): string {
  const message = utf8Bytes(value);
  const bitLength = message.length * 8;
  message.push(0x80);
  while (message.length % 64 !== 56) {
    message.push(0);
  }
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) {
    message.push((high >>> shift) & 0xff);
  }
  for (let shift = 24; shift >= 0; shift -= 8) {
    message.push((low >>> shift) & 0xff);
  }

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < message.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      words[index] =
        ((message[base] ?? 0) << 24) |
        ((message[base + 1] ?? 0) << 16) |
        ((message[base + 2] ?? 0) << 8) |
        (message[base + 3] ?? 0);
    }
    for (let index = 16; index < 64; index += 1) {
      const x = words[index - 15] ?? 0;
      const y = words[index - 2] ?? 0;
      const sigma0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const sigma1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      words[index] = ((words[index - 16] ?? 0) + sigma0 + (words[index - 7] ?? 0) + sigma1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e ?? 0, 6) ^ rotateRight(e ?? 0, 11) ^ rotateRight(e ?? 0, 25);
      const choice = ((e ?? 0) & (f ?? 0)) ^ (~(e ?? 0) & (g ?? 0));
      const temp1 =
        ((h ?? 0) + sum1 + choice + (SHA256_ROUND_CONSTANTS[index] ?? 0) + (words[index] ?? 0)) >>>
        0;
      const sum0 = rotateRight(a ?? 0, 2) ^ rotateRight(a ?? 0, 13) ^ rotateRight(a ?? 0, 22);
      const majority = ((a ?? 0) & (b ?? 0)) ^ ((a ?? 0) & (c ?? 0)) ^ ((b ?? 0) & (c ?? 0));
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = ((d ?? 0) + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    hash[0] = ((hash[0] ?? 0) + (a ?? 0)) >>> 0;
    hash[1] = ((hash[1] ?? 0) + (b ?? 0)) >>> 0;
    hash[2] = ((hash[2] ?? 0) + (c ?? 0)) >>> 0;
    hash[3] = ((hash[3] ?? 0) + (d ?? 0)) >>> 0;
    hash[4] = ((hash[4] ?? 0) + (e ?? 0)) >>> 0;
    hash[5] = ((hash[5] ?? 0) + (f ?? 0)) >>> 0;
    hash[6] = ((hash[6] ?? 0) + (g ?? 0)) >>> 0;
    hash[7] = ((hash[7] ?? 0) + (h ?? 0)) >>> 0;
  }
  return hash.map((word) => word.toString(16).padStart(8, '0')).join('');
}

export function backgroundSchedulingHandoffBundleDigest(input: {
  sidecarId: string;
  handoffId: string;
  kind: BackgroundSchedulingHandoffCapabilityKind;
  controlAttemptIndex: 0 | 1 | 2 | 3 | null;
  transitionIndex: number;
  casAttempt: 0 | 1 | 2;
  commandId: string;
  resultId: string;
  capabilityId: string;
}): string {
  return backgroundSchedulingSha256Hex(
    JSON.stringify({
      sidecarId: input.sidecarId,
      handoffId: input.handoffId,
      kind: input.kind,
      controlAttemptIndex: input.controlAttemptIndex,
      transitionIndex: input.transitionIndex,
      casAttempt: input.casAttempt,
      commandId: input.commandId,
      resultId: input.resultId,
      capabilityId: input.capabilityId,
    })
  );
}

export interface BackgroundSchedulingHandoffCasCursorV1 {
  controlAttemptIndex: 0 | 1 | 2 | 3;
  transitionIndex: number;
  casAttempt: 0 | 1 | 2;
}

function parseBackgroundSchedulingHandoffCasCursor(
  value: unknown
): BackgroundSchedulingHandoffCasCursorV1 | null {
  const record = readExactDataRecord(value, [
    'controlAttemptIndex',
    'transitionIndex',
    'casAttempt',
  ]);
  if (
    record === null ||
    ![0, 1, 2, 3].includes(Number(record.controlAttemptIndex)) ||
    !Number.isSafeInteger(record.transitionIndex) ||
    Number(record.transitionIndex) < 1 ||
    Number(record.transitionIndex) >= BACKGROUND_SCHEDULING_HANDOFF_CAS_TRANSITIONS_PER_ATTEMPT ||
    ![0, 1, 2].includes(Number(record.casAttempt))
  ) {
    return null;
  }
  return {
    controlAttemptIndex: Number(record.controlAttemptIndex) as 0 | 1 | 2 | 3,
    transitionIndex: Number(record.transitionIndex),
    casAttempt: Number(record.casAttempt) as 0 | 1 | 2,
  };
}

export function advanceBackgroundSchedulingHandoffCasCursorAfterFailure(
  cursor: BackgroundSchedulingHandoffCasCursorV1
): BackgroundSchedulingHandoffCasCursorV1 | null {
  if (
    ![0, 1, 2, 3].includes(cursor.controlAttemptIndex) ||
    !Number.isSafeInteger(cursor.transitionIndex) ||
    cursor.transitionIndex < 0 ||
    cursor.transitionIndex >= BACKGROUND_SCHEDULING_HANDOFF_CAS_TRANSITIONS_PER_ATTEMPT ||
    ![0, 1, 2].includes(cursor.casAttempt)
  ) {
    return null;
  }
  if (cursor.casAttempt < 2) {
    return {
      ...cursor,
      casAttempt: (cursor.casAttempt + 1) as 1 | 2,
    };
  }
  if (cursor.controlAttemptIndex === 3) {
    return null;
  }
  return {
    controlAttemptIndex: (cursor.controlAttemptIndex + 1) as 1 | 2 | 3,
    transitionIndex: cursor.transitionIndex,
    casAttempt: 0,
  };
}

const backgroundSchedulingHandoffManifestFactsCache = new WeakMap<
  object,
  BackgroundSchedulingHandoffCapabilityManifestFactsV1
>();

export function deriveBackgroundSchedulingHandoffCapabilityManifestFacts(
  value: unknown
): BackgroundSchedulingHandoffCapabilityManifestFactsV1 | null {
  if (typeof value === 'object' && value !== null) {
    const cached = backgroundSchedulingHandoffManifestFactsCache.get(value);
    if (cached !== undefined) {
      return cached;
    }
  }
  const record = readExactDataRecord(value, ['version', 'sidecarId', 'handoffId', 'entries']);
  if (
    record === null ||
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    !isUuidV4(record.sidecarId) ||
    !isUuidV4(record.handoffId) ||
    record.sidecarId === record.handoffId
  ) {
    return null;
  }
  const values = readExactDataArray(
    record.entries,
    BACKGROUND_SCHEDULING_HANDOFF_MANIFEST_ENTRY_COUNT
  );
  if (values === null) {
    return null;
  }
  const entries: BackgroundSchedulingHandoffCapabilityManifestEntryV1[] = [];
  const identities = new Set<string>([record.sidecarId, record.handoffId]);
  for (let index = 0; index < values.length; index += 1) {
    const cleanup = index >= BACKGROUND_SCHEDULING_HANDOFF_CAS_BUNDLE_COUNT;
    const controlAttemptIndex = cleanup
      ? null
      : (Math.floor(
          index /
            (BACKGROUND_SCHEDULING_HANDOFF_CAS_TRANSITIONS_PER_ATTEMPT *
              BACKGROUND_SCHEDULING_HANDOFF_CAS_ATTEMPTS_PER_TRANSITION)
        ) as 0 | 1 | 2 | 3);
    const controlAttemptOffset = cleanup
      ? index - BACKGROUND_SCHEDULING_HANDOFF_CAS_BUNDLE_COUNT
      : index %
        (BACKGROUND_SCHEDULING_HANDOFF_CAS_TRANSITIONS_PER_ATTEMPT *
          BACKGROUND_SCHEDULING_HANDOFF_CAS_ATTEMPTS_PER_TRANSITION);
    const transitionIndex = cleanup
      ? BACKGROUND_SCHEDULING_HANDOFF_CAS_TRANSITIONS_PER_ATTEMPT
      : Math.floor(
          controlAttemptOffset / BACKGROUND_SCHEDULING_HANDOFF_CAS_ATTEMPTS_PER_TRANSITION
        );
    const casAttempt = (controlAttemptOffset %
      BACKGROUND_SCHEDULING_HANDOFF_CAS_ATTEMPTS_PER_TRANSITION) as 0 | 1 | 2;
    const kind: BackgroundSchedulingHandoffCapabilityKind = cleanup
      ? 'sidecar_cleanup'
      : transitionIndex === 0
        ? 'sidecar_initialize'
        : 'slot_materialize';
    const entry = readExactDataRecord(values[index], [
      'kind',
      'controlAttemptIndex',
      'transitionIndex',
      'casAttempt',
      'commandId',
      'resultId',
      'capabilityId',
      'bundleDigest',
    ]);
    if (
      entry === null ||
      entry.kind !== kind ||
      entry.controlAttemptIndex !== controlAttemptIndex ||
      entry.transitionIndex !== transitionIndex ||
      entry.casAttempt !== casAttempt ||
      !isUuidV4(entry.commandId) ||
      !isUuidV4(entry.resultId) ||
      !isUuidV4(entry.capabilityId) ||
      !isSha256Digest(entry.bundleDigest) ||
      identities.has(entry.commandId) ||
      identities.has(entry.resultId) ||
      identities.has(entry.capabilityId) ||
      new Set([entry.commandId, entry.resultId, entry.capabilityId]).size !== 3
    ) {
      return null;
    }
    const canonical: BackgroundSchedulingHandoffCapabilityManifestEntryV1 = {
      kind,
      controlAttemptIndex,
      transitionIndex,
      casAttempt,
      commandId: entry.commandId,
      resultId: entry.resultId,
      capabilityId: entry.capabilityId,
      bundleDigest: entry.bundleDigest,
    };
    if (
      backgroundSchedulingHandoffBundleDigest({
        sidecarId: record.sidecarId,
        handoffId: record.handoffId,
        ...canonical,
      }) !== canonical.bundleDigest
    ) {
      return null;
    }
    identities.add(canonical.commandId);
    identities.add(canonical.resultId);
    identities.add(canonical.capabilityId);
    entries.push(canonical);
  }
  const manifest: BackgroundSchedulingHandoffCapabilityManifestV1 = {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    sidecarId: record.sidecarId,
    handoffId: record.handoffId,
    entries,
  };
  const manifestDigest = backgroundSchedulingSha256Hex(JSON.stringify(manifest));
  const cleanupBundles = entries.slice(BACKGROUND_SCHEDULING_HANDOFF_CAS_BUNDLE_COUNT);
  if (cleanupBundles.length !== 3) {
    return null;
  }
  const facts: BackgroundSchedulingHandoffCapabilityManifestFactsV1 = {
    manifest,
    manifestDigest,
    cleanupRecovery: {
      version: LOCAL_DATA_RESET_WIRE_VERSION,
      manifestDigest,
      bundles: [cleanupBundles[0]!, cleanupBundles[1]!, cleanupBundles[2]!],
    },
  };
  for (const entry of entries) {
    Object.freeze(entry);
  }
  Object.freeze(entries);
  Object.freeze(manifest);
  Object.freeze(facts.cleanupRecovery.bundles);
  Object.freeze(facts.cleanupRecovery);
  Object.freeze(facts);
  backgroundSchedulingHandoffManifestFactsCache.set(manifest, facts);
  return facts;
}

function parseHandoffJournalAtQuiescence(
  value: unknown
): BackgroundSchedulingHandoffJournalAtQuiescenceV1 | null {
  const present = readExactDataRecord(value, [
    'version',
    'kind',
    'journalRevision',
    'proofId',
    'readBackVerified',
  ]);
  if (
    present !== null &&
    present.version === LOCAL_DATA_RESET_WIRE_VERSION &&
    present.kind === 'present' &&
    Number.isSafeInteger(present.journalRevision) &&
    Number(present.journalRevision) >= 0 &&
    isUuidV4(present.proofId) &&
    present.readBackVerified === true
  ) {
    return {
      version: LOCAL_DATA_RESET_WIRE_VERSION,
      kind: 'present',
      journalRevision: Number(present.journalRevision),
      proofId: present.proofId,
      readBackVerified: true,
    };
  }
  const absent = readExactDataRecord(value, [
    'version',
    'kind',
    'journalRevision',
    'proofId',
    'absenceReadBackVerified',
  ]);
  if (
    absent === null ||
    absent.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    absent.kind !== 'absent' ||
    absent.journalRevision !== null ||
    !isUuidV4(absent.proofId) ||
    absent.absenceReadBackVerified !== true
  ) {
    return null;
  }
  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    kind: 'absent',
    journalRevision: null,
    proofId: absent.proofId,
    absenceReadBackVerified: true,
  };
}

function parseHandoffWriterTransfer(
  value: unknown
): BackgroundSchedulingHandoffWriterTransferV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'sourceWriterWorkerEpoch',
    'handoffRevision',
    'writerRevoked',
    'activeLoadCommandId',
    'activeCaptureCommandId',
    'activeDrainCommandId',
    'journalAtQuiescence',
    'complete',
  ]);
  if (
    record === null ||
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    !isUuidV4(record.sourceWriterWorkerEpoch) ||
    !Number.isSafeInteger(record.handoffRevision) ||
    Number(record.handoffRevision) < 0 ||
    record.writerRevoked !== true ||
    record.activeLoadCommandId !== null ||
    record.activeCaptureCommandId !== null ||
    record.activeDrainCommandId !== null ||
    record.complete !== true
  ) {
    return null;
  }
  const journalAtQuiescence = parseHandoffJournalAtQuiescence(record.journalAtQuiescence);
  if (journalAtQuiescence === null) {
    return null;
  }
  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    sourceWriterWorkerEpoch: record.sourceWriterWorkerEpoch,
    handoffRevision: Number(record.handoffRevision),
    writerRevoked: true,
    activeLoadCommandId: null,
    activeCaptureCommandId: null,
    activeDrainCommandId: null,
    journalAtQuiescence,
    complete: true,
  };
}

function expectedHandoffSlot(
  index: number,
  connectorOrder: readonly string[]
): { slotKind: BackgroundSchedulingHandoffSlotKind; connectorId: string | null } | null {
  if (index === 0) {
    return { slotKind: 'digest_first', connectorId: null };
  }
  if (index >= 1 && index <= 64) {
    const connectorId = connectorOrder[index - 1];
    return connectorId === undefined ? null : { slotKind: 'probe_first', connectorId };
  }
  if (index === 65) {
    return { slotKind: 'digest_duplicate', connectorId: null };
  }
  if (index >= 66 && index <= 129) {
    const connectorId = connectorOrder[index - 66];
    return connectorId === undefined ? null : { slotKind: 'probe_duplicate', connectorId };
  }
  return index === 130 ? { slotKind: 'auto_scan', connectorId: null } : null;
}

function parseHandoffAlarmSlot(
  value: unknown,
  index: number,
  connectorOrder: readonly string[],
  sourceWorkerEpoch: string,
  closedAtMailboxSequence: number
): { slot: BackgroundSchedulingHandoffAlarmSlotV1 | null } | null {
  if (value === null) {
    return { slot: null };
  }
  const expected = expectedHandoffSlot(index, connectorOrder);
  if (expected === null) {
    return null;
  }
  const record = readExactDataRecord(value, [
    'version',
    'slotIndex',
    'slotKind',
    'alarmEventId',
    'name',
    'connectorId',
    'firedAtMs',
    'mailboxSequence',
    'sourceWorkerEpoch',
  ]);
  const expectedName =
    expected.slotKind === 'auto_scan'
      ? 'auto-scan'
      : expected.connectorId === null
        ? 'daily-digest'
        : `probe:${expected.connectorId}`;
  if (
    record === null ||
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    record.slotIndex !== index ||
    record.slotKind !== expected.slotKind ||
    !isUuidV4(record.alarmEventId) ||
    record.name !== expectedName ||
    record.connectorId !== expected.connectorId ||
    !Number.isSafeInteger(record.firedAtMs) ||
    Number(record.firedAtMs) < 0 ||
    !Number.isSafeInteger(record.mailboxSequence) ||
    Number(record.mailboxSequence) < 0 ||
    Number(record.mailboxSequence) >= closedAtMailboxSequence ||
    record.sourceWorkerEpoch !== sourceWorkerEpoch
  ) {
    return null;
  }
  return {
    slot: {
      version: LOCAL_DATA_RESET_WIRE_VERSION,
      slotIndex: index,
      slotKind: expected.slotKind,
      alarmEventId: record.alarmEventId,
      name: expectedName,
      connectorId: expected.connectorId,
      firedAtMs: Number(record.firedAtMs),
      mailboxSequence: Number(record.mailboxSequence),
      sourceWorkerEpoch,
    },
  };
}

export function deriveBackgroundSchedulingHandoffPayloadFacts(
  value: unknown
): BackgroundSchedulingHandoffPayloadFactsV1 | null {
  const record = readExactDataRecord(value, [
    'schemaVersion',
    'payloadSchema',
    'sidecarId',
    'handoffId',
    'resetId',
    'previousDataEpoch',
    'sourceWorkerEpoch',
    'checkpointRevision',
    'handoffClosed',
    'closedAtMailboxSequence',
    'lateCallbackPolicy',
    'controlLaneId',
    'controlLaneAttemptIndex',
    'capabilityManifest',
    'capabilityManifestDigest',
    'connectorOrder',
    'frozenTargetDigest',
    'targetSlots',
    'materializationCursor',
    'casCursor',
    'slots',
    'writerTransfer',
  ]);
  if (record === null) {
    return null;
  }
  const previousDataEpoch = record.previousDataEpoch;
  if (previousDataEpoch !== null && !isUuidV4(previousDataEpoch)) {
    return null;
  }
  const connectorOrderValues = readBoundedExactDataArray(record.connectorOrder, 64);
  if (
    connectorOrderValues === null ||
    connectorOrderValues.some(
      (entry) => typeof entry !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(entry)
    )
  ) {
    return null;
  }
  const connectorOrder = connectorOrderValues as string[];
  if (connectorOrder.some((entry, index) => index > 0 && connectorOrder[index - 1]! >= entry)) {
    return null;
  }
  const writerTransfer = parseHandoffWriterTransfer(record.writerTransfer);
  const manifestFacts = deriveBackgroundSchedulingHandoffCapabilityManifestFacts(
    record.capabilityManifest
  );
  const materializationCursor = Number(record.materializationCursor);
  const casCursor =
    record.casCursor === null ? null : parseBackgroundSchedulingHandoffCasCursor(record.casCursor);
  const identities = [
    record.sidecarId,
    record.handoffId,
    record.resetId,
    record.sourceWorkerEpoch,
    record.controlLaneId,
    ...(previousDataEpoch === null ? [] : [previousDataEpoch]),
  ];
  if (
    record.schemaVersion !== BACKGROUND_SCHEDULING_HANDOFF_SCHEMA_VERSION ||
    record.payloadSchema !== BACKGROUND_SCHEDULING_HANDOFF_PAYLOAD_SCHEMA ||
    !identities.every(isUuidV4) ||
    new Set(identities).size !== identities.length ||
    !Number.isSafeInteger(record.checkpointRevision) ||
    Number(record.checkpointRevision) < 0 ||
    record.handoffClosed !== true ||
    !Number.isSafeInteger(record.closedAtMailboxSequence) ||
    Number(record.closedAtMailboxSequence) < 0 ||
    record.lateCallbackPolicy !== 'reject_reset_in_progress' ||
    !isUuidV4(record.controlLaneId) ||
    ![0, 1, 2, 3].includes(Number(record.controlLaneAttemptIndex)) ||
    manifestFacts === null ||
    manifestFacts.manifest.sidecarId !== record.sidecarId ||
    manifestFacts.manifest.handoffId !== record.handoffId ||
    record.capabilityManifestDigest !== manifestFacts.manifestDigest ||
    !isSha256Digest(record.frozenTargetDigest) ||
    !Number.isSafeInteger(record.materializationCursor) ||
    materializationCursor < 0 ||
    materializationCursor > BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT ||
    (record.casCursor !== null && casCursor === null) ||
    (materializationCursor === BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT && casCursor !== null) ||
    (casCursor !== null &&
      (casCursor.transitionIndex !== materializationCursor + 1 ||
        casCursor.controlAttemptIndex < Number(record.controlLaneAttemptIndex) ||
        !manifestFacts?.manifest.entries.some(
          (entry) =>
            entry.kind === 'slot_materialize' &&
            entry.controlAttemptIndex === casCursor.controlAttemptIndex &&
            entry.transitionIndex === casCursor.transitionIndex &&
            entry.casAttempt === casCursor.casAttempt
        ))) ||
    manifestFacts.manifest.entries.some(
      (entry) =>
        identities.includes(entry.commandId) ||
        identities.includes(entry.resultId) ||
        identities.includes(entry.capabilityId)
    ) ||
    writerTransfer === null ||
    writerTransfer.sourceWriterWorkerEpoch !== record.sourceWorkerEpoch ||
    writerTransfer.handoffRevision !== record.checkpointRevision ||
    identities.includes(writerTransfer.journalAtQuiescence.proofId)
  ) {
    return null;
  }
  const targetValues = readExactDataArray(
    record.targetSlots,
    BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT
  );
  const slotValues = readExactDataArray(record.slots, BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT);
  if (
    targetValues === null ||
    slotValues === null ||
    targetValues.length !== BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT ||
    slotValues.length !== BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT
  ) {
    return null;
  }
  const targetSlots: (BackgroundSchedulingHandoffAlarmSlotV1 | null)[] = [];
  const slots: (BackgroundSchedulingHandoffAlarmSlotV1 | null)[] = [];
  const targetAlarmEventIds = new Set<string>();
  const targetMailboxSequences = new Set<number>();
  const materializedAlarmEventIds = new Set<string>();
  for (let index = 0; index < slotValues.length; index += 1) {
    const target = parseHandoffAlarmSlot(
      targetValues[index],
      index,
      connectorOrder,
      record.sourceWorkerEpoch as string,
      Number(record.closedAtMailboxSequence)
    );
    const materialized = parseHandoffAlarmSlot(
      slotValues[index],
      index,
      connectorOrder,
      record.sourceWorkerEpoch as string,
      Number(record.closedAtMailboxSequence)
    );
    if (target === null || materialized === null) {
      return null;
    }
    if (target.slot !== null) {
      if (
        identities.includes(target.slot.alarmEventId) ||
        targetAlarmEventIds.has(target.slot.alarmEventId)
      ) {
        return null;
      }
      if (targetMailboxSequences.has(target.slot.mailboxSequence)) {
        return null;
      }
      targetAlarmEventIds.add(target.slot.alarmEventId);
      targetMailboxSequences.add(target.slot.mailboxSequence);
    }
    const expectedMaterialized = index < materializationCursor ? target.slot : null;
    if (JSON.stringify(materialized.slot) !== JSON.stringify(expectedMaterialized)) {
      return null;
    }
    if (materialized.slot !== null) {
      materializedAlarmEventIds.add(materialized.slot.alarmEventId);
    }
    targetSlots.push(target.slot);
    slots.push(materialized.slot);
  }
  const frozenTargetDigest = backgroundSchedulingSha256Hex(JSON.stringify(targetSlots));
  if (
    record.frozenTargetDigest !== frozenTargetDigest ||
    Number(record.checkpointRevision) !== materializedAlarmEventIds.size
  ) {
    return null;
  }
  const payload: BackgroundSchedulingHandoffPayloadV1 = {
    schemaVersion: BACKGROUND_SCHEDULING_HANDOFF_SCHEMA_VERSION,
    payloadSchema: BACKGROUND_SCHEDULING_HANDOFF_PAYLOAD_SCHEMA,
    sidecarId: record.sidecarId as string,
    handoffId: record.handoffId as string,
    resetId: record.resetId as string,
    previousDataEpoch,
    sourceWorkerEpoch: record.sourceWorkerEpoch as string,
    checkpointRevision: Number(record.checkpointRevision),
    handoffClosed: true,
    closedAtMailboxSequence: Number(record.closedAtMailboxSequence),
    lateCallbackPolicy: 'reject_reset_in_progress',
    controlLaneId: record.controlLaneId as string,
    controlLaneAttemptIndex: Number(record.controlLaneAttemptIndex) as 0 | 1 | 2 | 3,
    capabilityManifest: manifestFacts.manifest,
    capabilityManifestDigest: manifestFacts.manifestDigest,
    connectorOrder,
    frozenTargetDigest,
    targetSlots,
    materializationCursor,
    casCursor,
    slots,
    writerTransfer,
  };
  const canonicalPayloadJson = JSON.stringify(payload);
  const canonicalWriterTransferJson = JSON.stringify(writerTransfer);
  const canonicalJournalJson = JSON.stringify(writerTransfer.journalAtQuiescence);
  const payloadEncodedBytes = utf8ByteLength(canonicalPayloadJson);
  if (
    payloadEncodedBytes < 1 ||
    payloadEncodedBytes > BACKGROUND_SCHEDULING_HANDOFF_MAX_PAYLOAD_ENCODED_BYTES
  ) {
    return null;
  }
  const slotBitmap = slots.map((slot) => (slot === null ? '0' : '1')).join('');
  return {
    payload,
    canonicalPayloadJson,
    payloadDigest: backgroundSchedulingSha256Hex(canonicalPayloadJson),
    writerTransferDigest: backgroundSchedulingSha256Hex(canonicalWriterTransferJson),
    journalAtQuiescenceDigest: backgroundSchedulingSha256Hex(canonicalJournalJson),
    slotBitmap,
    slotCount: materializedAlarmEventIds.size,
    payloadEncodedBytes,
  };
}

export function advanceBackgroundSchedulingHandoffMaterialization(
  value: BackgroundSchedulingHandoffPayloadV1
): BackgroundSchedulingHandoffPayloadV1 | null {
  const casCursor = parseBackgroundSchedulingHandoffCasCursor(value.casCursor);
  if (
    !Number.isSafeInteger(value.materializationCursor) ||
    value.materializationCursor < 0 ||
    value.materializationCursor >= BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT ||
    value.targetSlots.length !== BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT ||
    value.slots.length !== BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT ||
    casCursor === null ||
    casCursor.transitionIndex !== value.materializationCursor + 1 ||
    casCursor.controlAttemptIndex < value.controlLaneAttemptIndex ||
    value.frozenTargetDigest !== backgroundSchedulingSha256Hex(JSON.stringify(value.targetSlots)) ||
    value.slots.some(
      (slot, index) =>
        JSON.stringify(slot) !==
        JSON.stringify(index < value.materializationCursor ? value.targetSlots[index] : null)
    )
  ) {
    return null;
  }
  const cursor = value.materializationCursor;
  const slots = [...value.slots];
  slots[cursor] = value.targetSlots[cursor] ?? null;
  const checkpointRevision = slots.filter((slot) => slot !== null).length;
  const materializationCursor = cursor + 1;
  return {
    ...value,
    checkpointRevision,
    materializationCursor,
    casCursor:
      materializationCursor === BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT
        ? null
        : {
            controlAttemptIndex: casCursor.controlAttemptIndex,
            transitionIndex: materializationCursor + 1,
            casAttempt: 0,
          },
    slots,
    writerTransfer: {
      ...value.writerTransfer,
      handoffRevision: checkpointRevision,
    },
  };
}

function parseBackgroundSchedulingHandoffCleanupRecovery(
  value: unknown,
  expected: { sidecarId: string; handoffId: string; manifestDigest?: string }
): BackgroundSchedulingHandoffCleanupRecoveryV1 | null {
  const record = readExactDataRecord(value, ['version', 'manifestDigest', 'bundles']);
  const bundles = record === null ? null : readExactDataArray(record.bundles, 3);
  if (
    record === null ||
    bundles === null ||
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    !isSha256Digest(record.manifestDigest) ||
    (expected.manifestDigest !== undefined && record.manifestDigest !== expected.manifestDigest)
  ) {
    return null;
  }
  const parsed: BackgroundSchedulingHandoffCapabilityManifestEntryV1[] = [];
  const ids = new Set<string>([expected.sidecarId, expected.handoffId]);
  for (let casAttempt = 0; casAttempt < 3; casAttempt += 1) {
    const entry = readExactDataRecord(bundles[casAttempt], [
      'kind',
      'controlAttemptIndex',
      'transitionIndex',
      'casAttempt',
      'commandId',
      'resultId',
      'capabilityId',
      'bundleDigest',
    ]);
    if (
      entry === null ||
      entry.kind !== 'sidecar_cleanup' ||
      entry.controlAttemptIndex !== null ||
      entry.transitionIndex !== 132 ||
      entry.casAttempt !== casAttempt ||
      !isUuidV4(entry.commandId) ||
      !isUuidV4(entry.resultId) ||
      !isUuidV4(entry.capabilityId) ||
      !isSha256Digest(entry.bundleDigest) ||
      ids.has(entry.commandId) ||
      ids.has(entry.resultId) ||
      ids.has(entry.capabilityId) ||
      new Set([entry.commandId, entry.resultId, entry.capabilityId]).size !== 3
    ) {
      return null;
    }
    const canonical: BackgroundSchedulingHandoffCapabilityManifestEntryV1 = {
      kind: 'sidecar_cleanup',
      controlAttemptIndex: null,
      transitionIndex: 132,
      casAttempt: casAttempt as 0 | 1 | 2,
      commandId: entry.commandId,
      resultId: entry.resultId,
      capabilityId: entry.capabilityId,
      bundleDigest: entry.bundleDigest,
    };
    if (
      backgroundSchedulingHandoffBundleDigest({
        sidecarId: expected.sidecarId,
        handoffId: expected.handoffId,
        ...canonical,
      }) !== canonical.bundleDigest
    ) {
      return null;
    }
    ids.add(canonical.commandId);
    ids.add(canonical.resultId);
    ids.add(canonical.capabilityId);
    parsed.push(canonical);
  }
  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    manifestDigest: record.manifestDigest,
    bundles: [parsed[0]!, parsed[1]!, parsed[2]!],
  };
}

export function parseBackgroundSchedulingHandoffReference(
  value: unknown
): BackgroundSchedulingHandoffReferenceV1 | null {
  const record = readExactDataRecord(value, [
    'schemaVersion',
    'storageKey',
    'sidecarId',
    'handoffId',
    'resetId',
    'checkpointRevision',
    'slotCount',
    'payloadDigest',
    'sourceControlLaneId',
    'sourceControlLaneAttemptIndex',
    'sourceWorkerEpoch',
    'capabilityManifestDigest',
    'cleanupRecovery',
    'sidecarEncodedBytes',
  ]);
  const cleanupRecovery =
    record === null || !isUuidV4(record.sidecarId) || !isUuidV4(record.handoffId)
      ? null
      : parseBackgroundSchedulingHandoffCleanupRecovery(record.cleanupRecovery, {
          sidecarId: record.sidecarId,
          handoffId: record.handoffId,
          manifestDigest:
            typeof record.capabilityManifestDigest === 'string'
              ? record.capabilityManifestDigest
              : undefined,
        });
  if (
    record === null ||
    record.schemaVersion !== BACKGROUND_SCHEDULING_HANDOFF_SCHEMA_VERSION ||
    record.storageKey !== BACKGROUND_SCHEDULING_HANDOFF_KEY ||
    !isUuidV4(record.sidecarId) ||
    !isUuidV4(record.handoffId) ||
    !isUuidV4(record.resetId) ||
    !isUuidV4(record.sourceControlLaneId) ||
    ![0, 1, 2, 3].includes(Number(record.sourceControlLaneAttemptIndex)) ||
    !isUuidV4(record.sourceWorkerEpoch) ||
    new Set([
      record.sidecarId,
      record.handoffId,
      record.resetId,
      record.sourceControlLaneId,
      record.sourceWorkerEpoch,
    ]).size !== 5 ||
    !Number.isSafeInteger(record.checkpointRevision) ||
    Number(record.checkpointRevision) < 0 ||
    !Number.isSafeInteger(record.slotCount) ||
    Number(record.slotCount) < 0 ||
    Number(record.slotCount) > BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT ||
    Number(record.checkpointRevision) !== Number(record.slotCount) ||
    !isSha256Digest(record.payloadDigest) ||
    !isSha256Digest(record.capabilityManifestDigest) ||
    cleanupRecovery === null ||
    !Number.isSafeInteger(record.sidecarEncodedBytes) ||
    Number(record.sidecarEncodedBytes) < 1 ||
    Number(record.sidecarEncodedBytes) > BACKGROUND_SCHEDULING_HANDOFF_MAX_SIDECAR_ENCODED_BYTES
  ) {
    return null;
  }
  return {
    schemaVersion: BACKGROUND_SCHEDULING_HANDOFF_SCHEMA_VERSION,
    storageKey: BACKGROUND_SCHEDULING_HANDOFF_KEY,
    sidecarId: record.sidecarId,
    handoffId: record.handoffId,
    resetId: record.resetId,
    checkpointRevision: Number(record.checkpointRevision),
    slotCount: Number(record.slotCount),
    payloadDigest: record.payloadDigest,
    sourceControlLaneId: record.sourceControlLaneId,
    sourceControlLaneAttemptIndex: Number(record.sourceControlLaneAttemptIndex) as 0 | 1 | 2 | 3,
    sourceWorkerEpoch: record.sourceWorkerEpoch,
    capabilityManifestDigest: record.capabilityManifestDigest,
    cleanupRecovery,
    sidecarEncodedBytes: Number(record.sidecarEncodedBytes),
  };
}

export function parseBackgroundSchedulingHandoffSidecar(
  value: unknown
): BackgroundSchedulingHandoffSidecarV1 | null {
  const record = readExactDataRecord(value, [
    'schemaVersion',
    'storageKey',
    'payloadSchema',
    'sidecarId',
    'handoffId',
    'resetId',
    'previousDataEpoch',
    'sourceWorkerEpoch',
    'checkpointRevision',
    'slotBitmap',
    'slotCount',
    'writerTransferDigest',
    'journalAtQuiescenceDigest',
    'payloadDigest',
    'payloadEncodedBytes',
    'payload',
  ]);
  if (record === null) {
    return null;
  }
  const previousDataEpoch = record.previousDataEpoch;
  if (previousDataEpoch !== null && !isUuidV4(previousDataEpoch)) {
    return null;
  }
  const facts = deriveBackgroundSchedulingHandoffPayloadFacts(record.payload);
  if (
    record.schemaVersion !== BACKGROUND_SCHEDULING_HANDOFF_SCHEMA_VERSION ||
    record.storageKey !== BACKGROUND_SCHEDULING_HANDOFF_KEY ||
    record.payloadSchema !== BACKGROUND_SCHEDULING_HANDOFF_PAYLOAD_SCHEMA ||
    !isUuidV4(record.sidecarId) ||
    !isUuidV4(record.handoffId) ||
    !isUuidV4(record.resetId) ||
    !isUuidV4(record.sourceWorkerEpoch) ||
    new Set([
      record.sidecarId,
      record.handoffId,
      record.resetId,
      record.sourceWorkerEpoch,
      ...(previousDataEpoch === null ? [] : [previousDataEpoch]),
    ]).size !== (previousDataEpoch === null ? 4 : 5) ||
    !Number.isSafeInteger(record.checkpointRevision) ||
    Number(record.checkpointRevision) < 0 ||
    typeof record.slotBitmap !== 'string' ||
    !/^[01]{131}$/.test(record.slotBitmap) ||
    !Number.isSafeInteger(record.slotCount) ||
    Number(record.slotCount) !== [...record.slotBitmap].filter((bit) => bit === '1').length ||
    !isSha256Digest(record.writerTransferDigest) ||
    !isSha256Digest(record.journalAtQuiescenceDigest) ||
    !isSha256Digest(record.payloadDigest) ||
    facts === null ||
    facts.payload.sidecarId !== record.sidecarId ||
    facts.payload.handoffId !== record.handoffId ||
    facts.payload.resetId !== record.resetId ||
    facts.payload.previousDataEpoch !== previousDataEpoch ||
    facts.payload.sourceWorkerEpoch !== record.sourceWorkerEpoch ||
    facts.payload.checkpointRevision !== record.checkpointRevision ||
    facts.slotBitmap !== record.slotBitmap ||
    facts.slotCount !== record.slotCount ||
    facts.writerTransferDigest !== record.writerTransferDigest ||
    facts.journalAtQuiescenceDigest !== record.journalAtQuiescenceDigest ||
    facts.payloadDigest !== record.payloadDigest ||
    !Number.isSafeInteger(record.payloadEncodedBytes) ||
    Number(record.payloadEncodedBytes) !== facts.payloadEncodedBytes
  ) {
    return null;
  }
  const sidecar: BackgroundSchedulingHandoffSidecarV1 = {
    schemaVersion: BACKGROUND_SCHEDULING_HANDOFF_SCHEMA_VERSION,
    storageKey: BACKGROUND_SCHEDULING_HANDOFF_KEY,
    payloadSchema: BACKGROUND_SCHEDULING_HANDOFF_PAYLOAD_SCHEMA,
    sidecarId: record.sidecarId,
    handoffId: record.handoffId,
    resetId: record.resetId,
    previousDataEpoch,
    sourceWorkerEpoch: record.sourceWorkerEpoch,
    checkpointRevision: Number(record.checkpointRevision),
    slotBitmap: record.slotBitmap,
    slotCount: Number(record.slotCount),
    writerTransferDigest: record.writerTransferDigest,
    journalAtQuiescenceDigest: record.journalAtQuiescenceDigest,
    payloadDigest: record.payloadDigest,
    payloadEncodedBytes: facts.payloadEncodedBytes,
    payload: facts.payload,
  };
  const sidecarEncodedBytes = backgroundSchedulingHandoffSidecarEncodedBytes(sidecar);
  return sidecarEncodedBytes <= BACKGROUND_SCHEDULING_HANDOFF_MAX_SIDECAR_ENCODED_BYTES
    ? sidecar
    : null;
}

export function backgroundSchedulingHandoffSidecarEncodedBytes(
  sidecar: BackgroundSchedulingHandoffSidecarV1
): number {
  return utf8ByteLength(JSON.stringify(sidecar));
}

function handoffReferenceMatchesSidecar(
  reference: BackgroundSchedulingHandoffReferenceV1,
  sidecar: BackgroundSchedulingHandoffSidecarV1
): boolean {
  return (
    reference.sidecarId === sidecar.sidecarId &&
    reference.handoffId === sidecar.handoffId &&
    reference.resetId === sidecar.resetId &&
    reference.checkpointRevision === sidecar.checkpointRevision &&
    reference.slotCount === sidecar.slotCount &&
    reference.payloadDigest === sidecar.payloadDigest &&
    reference.sourceControlLaneId === sidecar.payload.controlLaneId &&
    reference.sourceControlLaneAttemptIndex === sidecar.payload.controlLaneAttemptIndex &&
    reference.sourceWorkerEpoch === sidecar.sourceWorkerEpoch &&
    reference.capabilityManifestDigest === sidecar.payload.capabilityManifestDigest &&
    JSON.stringify(reference.cleanupRecovery) ===
      JSON.stringify(
        deriveBackgroundSchedulingHandoffCapabilityManifestFacts(sidecar.payload.capabilityManifest)
          ?.cleanupRecovery
      ) &&
    reference.sidecarEncodedBytes === backgroundSchedulingHandoffSidecarEncodedBytes(sidecar)
  );
}

function parseBackgroundSchedulingHandoffFrozenProvenance(
  value: unknown,
  sidecar: BackgroundSchedulingHandoffSidecarV1
): BackgroundSchedulingHandoffFrozenProvenanceV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'laneId',
    'attemptIndex',
    'sourceWorkerEpoch',
    'sidecarId',
    'handoffId',
    'capabilityManifest',
    'capabilityManifestDigest',
    'frozenTargetDigest',
    'frozenAtMailboxSequence',
  ]);
  const manifestFacts =
    record === null
      ? null
      : deriveBackgroundSchedulingHandoffCapabilityManifestFacts(record.capabilityManifest);
  if (
    record === null ||
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    !isUuidV4(record.laneId) ||
    ![0, 1, 2, 3].includes(Number(record.attemptIndex)) ||
    record.sourceWorkerEpoch !== sidecar.sourceWorkerEpoch ||
    record.sidecarId !== sidecar.sidecarId ||
    record.handoffId !== sidecar.handoffId ||
    manifestFacts === null ||
    record.capabilityManifestDigest !== manifestFacts.manifestDigest ||
    record.frozenTargetDigest !== sidecar.payload.frozenTargetDigest ||
    record.frozenAtMailboxSequence !== sidecar.payload.closedAtMailboxSequence ||
    record.laneId !== sidecar.payload.controlLaneId ||
    record.attemptIndex !== sidecar.payload.controlLaneAttemptIndex ||
    record.capabilityManifestDigest !== sidecar.payload.capabilityManifestDigest ||
    JSON.stringify(manifestFacts.manifest) !== JSON.stringify(sidecar.payload.capabilityManifest) ||
    new Set([
      record.laneId,
      record.sourceWorkerEpoch,
      record.sidecarId,
      record.handoffId,
      sidecar.resetId,
    ]).size !== 5
  ) {
    return null;
  }
  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    laneId: record.laneId,
    attemptIndex: Number(record.attemptIndex) as 0 | 1 | 2 | 3,
    sourceWorkerEpoch: sidecar.sourceWorkerEpoch,
    sidecarId: sidecar.sidecarId,
    handoffId: sidecar.handoffId,
    capabilityManifest: manifestFacts.manifest,
    capabilityManifestDigest: manifestFacts.manifestDigest,
    frozenTargetDigest: sidecar.payload.frozenTargetDigest,
    frozenAtMailboxSequence: sidecar.payload.closedAtMailboxSequence,
  };
}

export function parseBackgroundSchedulingHandoffCheckpointExpectation(
  value: unknown
): BackgroundSchedulingHandoffCheckpointExpectationV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'resetId',
    'previousDataEpoch',
    'sourceControlLaneId',
    'sourceControlLaneAttemptIndex',
    'sourceWorkerEpoch',
    'sidecarId',
    'handoffId',
    'capabilityManifestDigest',
  ]);
  const previousDataEpoch = record?.previousDataEpoch;
  const identities =
    record === null
      ? []
      : [
          record.resetId,
          record.sourceControlLaneId,
          record.sourceWorkerEpoch,
          record.sidecarId,
          record.handoffId,
          ...(previousDataEpoch === null ? [] : [previousDataEpoch]),
        ];
  if (
    record === null ||
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    (previousDataEpoch !== null && !isUuidV4(previousDataEpoch)) ||
    !identities.every(isUuidV4) ||
    new Set(identities).size !== identities.length ||
    ![0, 1, 2, 3].includes(Number(record.sourceControlLaneAttemptIndex)) ||
    !isSha256Digest(record.capabilityManifestDigest)
  ) {
    return null;
  }
  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    resetId: record.resetId as string,
    previousDataEpoch: previousDataEpoch as DatasetEpoch | null,
    sourceControlLaneId: record.sourceControlLaneId as string,
    sourceControlLaneAttemptIndex: Number(record.sourceControlLaneAttemptIndex) as 0 | 1 | 2 | 3,
    sourceWorkerEpoch: record.sourceWorkerEpoch as string,
    sidecarId: record.sidecarId as string,
    handoffId: record.handoffId as string,
    capabilityManifestDigest: record.capabilityManifestDigest as string,
  };
}

export function parseBackgroundSchedulingHandoffCheckpointProof(
  value: unknown,
  expectedValue: BackgroundSchedulingHandoffCheckpointExpectationV1
): BackgroundSchedulingHandoffCheckpointProofV1 | null {
  const expected = parseBackgroundSchedulingHandoffCheckpointExpectation(expectedValue);
  const record = readExactDataRecord(value, [
    'version',
    'kind',
    'resetId',
    'previousDataEpoch',
    'reference',
    'sidecar',
    'frozenProvenance',
    'sidecarIdPreallocatedBeforeWorkAdmission',
    'readBackVerified',
  ]);
  if (
    expected === null ||
    record === null ||
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    record.kind !== 'BACKGROUND_SCHEDULING_HANDOFF_CHECKPOINTED' ||
    record.resetId !== expected.resetId ||
    record.previousDataEpoch !== expected.previousDataEpoch ||
    record.sidecarIdPreallocatedBeforeWorkAdmission !== true ||
    record.readBackVerified !== true
  ) {
    return null;
  }
  const reference = parseBackgroundSchedulingHandoffReference(record.reference);
  const sidecar = parseBackgroundSchedulingHandoffSidecar(record.sidecar);
  const frozenProvenance =
    sidecar === null
      ? null
      : parseBackgroundSchedulingHandoffFrozenProvenance(record.frozenProvenance, sidecar);
  if (
    reference === null ||
    sidecar === null ||
    frozenProvenance === null ||
    reference.resetId !== expected.resetId ||
    sidecar.resetId !== expected.resetId ||
    sidecar.previousDataEpoch !== expected.previousDataEpoch ||
    sidecar.payload.controlLaneId !== expected.sourceControlLaneId ||
    sidecar.payload.controlLaneAttemptIndex !== expected.sourceControlLaneAttemptIndex ||
    sidecar.sourceWorkerEpoch !== expected.sourceWorkerEpoch ||
    sidecar.sidecarId !== expected.sidecarId ||
    sidecar.handoffId !== expected.handoffId ||
    sidecar.payload.capabilityManifestDigest !== expected.capabilityManifestDigest ||
    sidecar.payload.materializationCursor !== BACKGROUND_SCHEDULING_HANDOFF_SLOT_COUNT ||
    JSON.stringify(sidecar.payload.slots) !== JSON.stringify(sidecar.payload.targetSlots) ||
    !handoffReferenceMatchesSidecar(reference, sidecar)
  ) {
    return null;
  }
  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    kind: 'BACKGROUND_SCHEDULING_HANDOFF_CHECKPOINTED',
    resetId: expected.resetId,
    previousDataEpoch: expected.previousDataEpoch,
    reference,
    sidecar,
    frozenProvenance,
    sidecarIdPreallocatedBeforeWorkAdmission: true,
    readBackVerified: true,
  };
}

function checkpointExpectationMatchesReference(
  expectation: BackgroundSchedulingHandoffCheckpointExpectationV1,
  reference: BackgroundSchedulingHandoffReferenceV1
): boolean {
  return (
    expectation.resetId === reference.resetId &&
    expectation.sourceControlLaneId === reference.sourceControlLaneId &&
    expectation.sourceControlLaneAttemptIndex === reference.sourceControlLaneAttemptIndex &&
    expectation.sourceWorkerEpoch === reference.sourceWorkerEpoch &&
    expectation.sidecarId === reference.sidecarId &&
    expectation.handoffId === reference.handoffId &&
    expectation.capabilityManifestDigest === reference.capabilityManifestDigest
  );
}

function resetReceiptMatchesJournal(
  receipt: LocalDataResetReceiptV1,
  journal: LocalDataResetJournalV1
): boolean {
  return (
    receipt.resetId === journal.resetId &&
    receipt.previousDataEpoch === journal.previousDataEpoch &&
    receipt.nextDataEpoch === journal.nextDataEpoch &&
    receipt.settingsRecoveryRequestId === journal.settingsRecoveryRequestId &&
    receipt.settingsBootstrapRequestId === journal.settingsBootstrapRequestId &&
    receipt.requestedAt === journal.requestedAt
  );
}

function parseLocalDataResetRehydrationPhysicalAuthority(
  value: unknown,
  expectedJournal: LocalDataResetJournalV1,
  currentWorkerEpoch: string
): LocalDataResetRehydrationPhysicalAuthorityV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'journal',
    'authorityRevision',
    'fenceRevision',
    'database',
    'receipt',
    'handoffExpectation',
    'handoff',
    'replacementLaneReceipt',
  ]);
  const journal = record === null ? null : parseLocalDataResetJournal(record.journal);
  const expectation =
    record === null
      ? null
      : parseBackgroundSchedulingHandoffCheckpointExpectation(record.handoffExpectation);
  const receipt =
    record === null || record.receipt === null ? null : parseLocalDataResetReceipt(record.receipt);
  if (
    record === null ||
    journal === null ||
    expectation === null ||
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    JSON.stringify(journal) !== JSON.stringify(expectedJournal) ||
    !Number.isSafeInteger(record.authorityRevision) ||
    Number(record.authorityRevision) < 0 ||
    !Number.isSafeInteger(record.fenceRevision) ||
    Number(record.fenceRevision) < 0 ||
    expectation.resetId !== journal.resetId ||
    expectation.previousDataEpoch !== journal.previousDataEpoch ||
    (record.receipt !== null && receipt === null)
  ) {
    return null;
  }

  const databaseRecord = readExactDataRecord(record.database, [
    'kind',
    'dataEpoch',
    'readBackVerified',
  ]);
  const absentDatabaseRecord = readExactDataRecord(record.database, [
    'kind',
    'absenceReadBackVerified',
  ]);
  const nextDatabaseRecord = readExactDataRecord(record.database, [
    'kind',
    'authority',
    'readBackVerified',
  ]);
  let database: LocalDataResetRehydrationDatabaseAuthorityV1 | null = null;
  if (
    databaseRecord !== null &&
    databaseRecord.kind === 'previous_epoch' &&
    databaseRecord.dataEpoch === journal.previousDataEpoch &&
    databaseRecord.readBackVerified === true
  ) {
    database = {
      kind: 'previous_epoch',
      dataEpoch: journal.previousDataEpoch,
      readBackVerified: true,
    };
  } else if (
    absentDatabaseRecord !== null &&
    absentDatabaseRecord.kind === 'absent' &&
    absentDatabaseRecord.absenceReadBackVerified === true
  ) {
    database = { kind: 'absent', absenceReadBackVerified: true };
  } else if (
    nextDatabaseRecord !== null &&
    nextDatabaseRecord.kind === 'next_epoch' &&
    nextDatabaseRecord.readBackVerified === true
  ) {
    const authority = parseLocalDataResetPostClearAuthorityProof(
      nextDatabaseRecord.authority,
      journal.nextDataEpoch
    );
    if (authority !== null) {
      database = { kind: 'next_epoch', authority, readBackVerified: true };
    }
  }
  if (database === null) {
    return null;
  }

  const phaseAllowsDatabase = (() => {
    switch (journal.phase) {
      case 'journaled':
      case 'fenced':
      case 'quiesced':
        return database.kind === 'previous_epoch';
      case 'handles_closed':
        return database.kind === 'previous_epoch' || database.kind === 'absent';
      case 'database_deleted':
      case 'session_cleared':
      case 'local_cleared':
        return database.kind === 'absent';
      case 'database_reinitialized':
      case 'settings_aligned':
      case 'committed':
      case 'handoff_adopted':
      case 'handoff_cleared':
        return database.kind === 'next_epoch';
    }
  })();
  if (!phaseAllowsDatabase) {
    return null;
  }

  const receiptMatches = receipt !== null && resetReceiptMatchesJournal(receipt, journal);
  if (
    (['committed', 'handoff_adopted', 'handoff_cleared'] as LocalDataResetPhase[]).includes(
      journal.phase
    )
      ? !receiptMatches
      : journal.phase === 'settings_aligned'
        ? receipt !== null && !receiptMatches
        : receipt !== null
  ) {
    return null;
  }

  let handoff: LocalDataResetRehydrationHandoffAuthorityV1 | null = null;
  const notCheckpointed = readExactDataRecord(record.handoff, ['kind', 'sidecarAbsent']);
  const checkpointed = readExactDataRecord(record.handoff, ['kind', 'reference', 'sidecar']);
  const adopted = readExactDataRecord(record.handoff, ['kind', 'reference', 'sidecar', 'adoption']);
  const cleared = readExactDataRecord(record.handoff, [
    'kind',
    'reference',
    'absenceReadBackVerified',
    'journalCheckpointReadBackVerified',
  ]);
  if (
    notCheckpointed !== null &&
    notCheckpointed.kind === 'not_checkpointed' &&
    notCheckpointed.sidecarAbsent === true &&
    journal.backgroundSchedulingHandoff === null &&
    (journal.phase === 'journaled' || journal.phase === 'fenced')
  ) {
    handoff = { kind: 'not_checkpointed', sidecarAbsent: true };
  } else if (
    checkpointed !== null &&
    checkpointed.kind === 'checkpointed_present' &&
    journal.backgroundSchedulingHandoff !== null
  ) {
    const reference = parseBackgroundSchedulingHandoffReference(checkpointed.reference);
    const sidecar = parseBackgroundSchedulingHandoffSidecar(checkpointed.sidecar);
    if (
      reference !== null &&
      sidecar !== null &&
      JSON.stringify(reference) === JSON.stringify(journal.backgroundSchedulingHandoff) &&
      checkpointExpectationMatchesReference(expectation, reference) &&
      handoffReferenceMatchesSidecar(reference, sidecar)
    ) {
      handoff = { kind: 'checkpointed_present', reference, sidecar };
    }
  } else if (
    adopted !== null &&
    adopted.kind === 'adopted_present' &&
    journal.phase === 'handoff_adopted' &&
    journal.backgroundSchedulingHandoff !== null
  ) {
    const reference = parseBackgroundSchedulingHandoffReference(adopted.reference);
    const sidecar = parseBackgroundSchedulingHandoffSidecar(adopted.sidecar);
    const adoption =
      reference === null
        ? null
        : parseBackgroundSchedulingHandoffAdoptionProof(adopted.adoption, {
            resetId: journal.resetId,
            reference,
          });
    if (
      reference !== null &&
      sidecar !== null &&
      adoption !== null &&
      JSON.stringify(reference) === JSON.stringify(journal.backgroundSchedulingHandoff) &&
      checkpointExpectationMatchesReference(expectation, reference) &&
      handoffReferenceMatchesSidecar(reference, sidecar)
    ) {
      handoff = { kind: 'adopted_present', reference, sidecar, adoption };
    }
  } else if (
    cleared !== null &&
    cleared.kind === 'cleared_absent' &&
    cleared.absenceReadBackVerified === true &&
    cleared.journalCheckpointReadBackVerified === true &&
    journal.phase === 'handoff_cleared' &&
    journal.backgroundSchedulingHandoff !== null
  ) {
    const reference = parseBackgroundSchedulingHandoffReference(cleared.reference);
    if (
      reference !== null &&
      JSON.stringify(reference) === JSON.stringify(journal.backgroundSchedulingHandoff) &&
      checkpointExpectationMatchesReference(expectation, reference)
    ) {
      handoff = {
        kind: 'cleared_absent',
        reference,
        absenceReadBackVerified: true,
        journalCheckpointReadBackVerified: true,
      };
    }
  }
  const checkpointedPhases: LocalDataResetPhase[] = [
    'quiesced',
    'handles_closed',
    'database_deleted',
    'session_cleared',
    'local_cleared',
    'database_reinitialized',
    'settings_aligned',
    'committed',
  ];
  if (
    handoff === null ||
    (checkpointedPhases.includes(journal.phase) && handoff.kind !== 'checkpointed_present') ||
    (journal.phase === 'handoff_adopted' && handoff.kind !== 'adopted_present') ||
    (journal.phase === 'handoff_cleared' && handoff.kind !== 'cleared_absent')
  ) {
    return null;
  }
  const expectedReference = journal.backgroundSchedulingHandoff;
  if (
    (journal.phase === 'handoff_adopted' || journal.phase === 'handoff_cleared') &&
    (expectedReference === null || expectedReference.sourceWorkerEpoch === currentWorkerEpoch)
  ) {
    return null;
  }
  const replacementLaneReceipt =
    record.replacementLaneReceipt === null || expectedReference === null
      ? null
      : parseBackgroundSchedulingHandoffReplacementLaneReceipt(record.replacementLaneReceipt, {
          resetId: journal.resetId,
          reference: expectedReference,
          currentWorkerEpoch,
        });
  const replacementRequired =
    expectedReference !== null &&
    journal.phase !== 'handoff_cleared' &&
    expectedReference.sourceWorkerEpoch !== currentWorkerEpoch;
  if (
    (record.replacementLaneReceipt !== null && replacementLaneReceipt === null) ||
    replacementRequired !== (replacementLaneReceipt !== null)
  ) {
    return null;
  }
  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    journal,
    authorityRevision: Number(record.authorityRevision),
    fenceRevision: Number(record.fenceRevision),
    database,
    receipt,
    handoffExpectation: expectation,
    handoff,
    replacementLaneReceipt,
  };
}

interface ResetPreAdmissionReservationRegistration {
  physicalAuthorityDigest: string;
  journal: LocalDataResetJournalV1;
}

const resetPreAdmissionReservations = new WeakMap<
  ResetPreAdmissionReservationV1,
  ResetPreAdmissionReservationRegistration
>();
const resetFenceProofsByReservation = new WeakMap<
  ResetPreAdmissionReservationV1,
  LocalDataResetFenceAuthorityProofV1
>();
const issuedLocalDataResetFenceProofs = new WeakSet<LocalDataResetFenceAuthorityProofV1>();

export function rehydrateResetPreAdmission(input: {
  journal: LocalDataResetJournalV1;
  physicalAuthority: unknown;
  workerEpoch: string;
  reservationId: string;
}): ResetPreAdmissionReservationV1 | null {
  const journal = parseLocalDataResetJournal(input.journal);
  if (
    journal === null ||
    !isUuidV4(input.workerEpoch) ||
    !isUuidV4(input.reservationId) ||
    [
      journal.resetId,
      journal.previousDataEpoch,
      journal.nextDataEpoch,
      journal.settingsRecoveryRequestId,
      journal.settingsBootstrapRequestId,
      input.workerEpoch,
    ].includes(input.reservationId)
  ) {
    return null;
  }
  const physicalAuthority = parseLocalDataResetRehydrationPhysicalAuthority(
    input.physicalAuthority,
    journal,
    input.workerEpoch
  );
  if (
    physicalAuthority === null ||
    physicalAuthority.authorityRevision >= Number.MAX_SAFE_INTEGER ||
    physicalAuthority.fenceRevision >= Number.MAX_SAFE_INTEGER
  ) {
    return null;
  }
  const journalDigest = backgroundSchedulingSha256Hex(JSON.stringify(journal));
  const physicalAuthorityDigest = backgroundSchedulingSha256Hex(JSON.stringify(physicalAuthority));
  const reservation: ResetPreAdmissionReservationV1 = {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    kind: 'RESET_PRE_ADMISSION_REHYDRATED',
    reservationId: input.reservationId,
    origin: 'journal_rehydration',
    resetId: journal.resetId,
    workerEpoch: input.workerEpoch,
    previousDataEpoch: journal.previousDataEpoch,
    nextDataEpoch: journal.nextDataEpoch,
    journalPhase: journal.phase,
    journalDigest,
    physicalAuthorityDigest,
    authorityRevision: physicalAuthority.authorityRevision,
    fenceRevision: physicalAuthority.fenceRevision,
    journalStatus: 'durable_proven',
    handoffExpectation: physicalAuthority.handoffExpectation,
  };
  Object.freeze(reservation.handoffExpectation);
  Object.freeze(reservation);
  resetPreAdmissionReservations.set(reservation, { physicalAuthorityDigest, journal });
  return reservation;
}

export function acquireResetFence(input: {
  reservation: ResetPreAdmissionReservationV1;
  physicalAuthority: unknown;
  fenceProofId: string;
}): LocalDataResetFenceAuthorityProofV1 | null {
  const registration = resetPreAdmissionReservations.get(input.reservation);
  if (registration === undefined) {
    return null;
  }
  const physicalAuthority = parseLocalDataResetRehydrationPhysicalAuthority(
    input.physicalAuthority,
    registration.journal,
    input.reservation.workerEpoch
  );
  if (
    physicalAuthority === null ||
    backgroundSchedulingSha256Hex(JSON.stringify(physicalAuthority)) !==
      registration.physicalAuthorityDigest ||
    !isUuidV4(input.fenceProofId) ||
    [
      input.reservation.reservationId,
      input.reservation.resetId,
      input.reservation.workerEpoch,
      input.reservation.previousDataEpoch,
      input.reservation.nextDataEpoch,
      input.reservation.handoffExpectation.sourceControlLaneId,
      input.reservation.handoffExpectation.sourceWorkerEpoch,
      input.reservation.handoffExpectation.sidecarId,
      input.reservation.handoffExpectation.handoffId,
    ].includes(input.fenceProofId)
  ) {
    return null;
  }
  const duplicate = resetFenceProofsByReservation.get(input.reservation);
  if (duplicate !== undefined) {
    return duplicate.fenceProofId === input.fenceProofId ? duplicate : null;
  }
  const proof: LocalDataResetFenceAuthorityProofV1 = {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    kind: 'RESET_FENCE_AUTHORITY_ACQUIRED',
    fenceProofId: input.fenceProofId,
    reservationId: input.reservation.reservationId,
    resetId: input.reservation.resetId,
    workerEpoch: input.reservation.workerEpoch,
    previousDataEpoch: input.reservation.previousDataEpoch,
    nextDataEpoch: input.reservation.nextDataEpoch,
    journalPhase: input.reservation.journalPhase,
    journalDigest: input.reservation.journalDigest,
    physicalAuthorityDigest: input.reservation.physicalAuthorityDigest,
    previousAuthorityRevision: input.reservation.authorityRevision,
    authorityRevision: input.reservation.authorityRevision + 1,
    previousFenceRevision: input.reservation.fenceRevision,
    fenceRevision: input.reservation.fenceRevision + 1,
    handoffExpectation: input.reservation.handoffExpectation,
    oldLeasesRevoked: true,
    replacementLaneReceipt: physicalAuthority.replacementLaneReceipt,
  };
  Object.freeze(proof);
  issuedLocalDataResetFenceProofs.add(proof);
  resetFenceProofsByReservation.set(input.reservation, proof);
  return proof;
}

export function parseLocalDataResetFenceAuthorityProof(
  value: unknown
): LocalDataResetFenceAuthorityProofV1 | null {
  return typeof value === 'object' &&
    value !== null &&
    issuedLocalDataResetFenceProofs.has(value as LocalDataResetFenceAuthorityProofV1)
    ? (value as LocalDataResetFenceAuthorityProofV1)
    : null;
}

export function parseLocalDataResetSessionClearProof(
  value: unknown,
  expected: { resetId: string; reference: BackgroundSchedulingHandoffReferenceV1 }
): LocalDataResetSessionClearProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'kind',
    'resetId',
    'storageArea',
    'reference',
    'sidecarReadBack',
    'sessionClearReadBackVerified',
  ]);
  if (
    record === null ||
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    record.kind !== 'RESET_SESSION_CLEARED_WITH_HANDOFF_PRESERVED' ||
    record.resetId !== expected.resetId ||
    record.storageArea !== 'chrome.storage.session' ||
    record.sessionClearReadBackVerified !== true
  ) {
    return null;
  }
  const reference = parseBackgroundSchedulingHandoffReference(record.reference);
  const sidecarReadBack = parseBackgroundSchedulingHandoffSidecar(record.sidecarReadBack);
  if (
    reference === null ||
    sidecarReadBack === null ||
    JSON.stringify(reference) !== JSON.stringify(expected.reference) ||
    !handoffReferenceMatchesSidecar(reference, sidecarReadBack)
  ) {
    return null;
  }
  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    kind: 'RESET_SESSION_CLEARED_WITH_HANDOFF_PRESERVED',
    resetId: expected.resetId,
    storageArea: 'chrome.storage.session',
    reference,
    sidecarReadBack,
    sessionClearReadBackVerified: true,
  };
}

export function parseLocalDataResetLocalClearProof(
  value: unknown,
  expected: { resetId: string; reference: BackgroundSchedulingHandoffReferenceV1 }
): LocalDataResetLocalClearProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'kind',
    'resetId',
    'storageArea',
    'preservedKeys',
    'reference',
    'sidecarReadBack',
    'journalKey',
    'removedKeyCount',
    'readBackVerified',
  ]);
  const preservedKeys = record === null ? null : readExactDataArray(record.preservedKeys, 2);
  if (
    record === null ||
    preservedKeys === null ||
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    record.kind !== 'RESET_LOCAL_CLEARED_WITH_ALLOWLIST' ||
    record.resetId !== expected.resetId ||
    record.storageArea !== 'chrome.storage.local' ||
    record.journalKey !== LOCAL_DATA_RESET_JOURNAL_KEY ||
    preservedKeys[0] !== LOCAL_DATA_RESET_JOURNAL_KEY ||
    preservedKeys[1] !== BACKGROUND_SCHEDULING_HANDOFF_KEY ||
    !Number.isSafeInteger(record.removedKeyCount) ||
    Number(record.removedKeyCount) < 0 ||
    record.readBackVerified !== true
  ) {
    return null;
  }
  const reference = parseBackgroundSchedulingHandoffReference(record.reference);
  const sidecarReadBack = parseBackgroundSchedulingHandoffSidecar(record.sidecarReadBack);
  if (
    reference === null ||
    sidecarReadBack === null ||
    JSON.stringify(reference) !== JSON.stringify(expected.reference) ||
    !handoffReferenceMatchesSidecar(reference, sidecarReadBack)
  ) {
    return null;
  }
  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    kind: 'RESET_LOCAL_CLEARED_WITH_ALLOWLIST',
    resetId: expected.resetId,
    storageArea: 'chrome.storage.local',
    preservedKeys: [...LOCAL_DATA_RESET_LOCAL_CLEAR_PRESERVED_KEYS],
    reference,
    sidecarReadBack,
    journalKey: LOCAL_DATA_RESET_JOURNAL_KEY,
    removedKeyCount: Number(record.removedKeyCount),
    readBackVerified: true,
  };
}

export function parseBackgroundSchedulingHandoffAdoptionProof(
  value: unknown,
  expected: { resetId: string; reference: BackgroundSchedulingHandoffReferenceV1 }
): BackgroundSchedulingHandoffAdoptionProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'kind',
    'resetId',
    'reference',
    'adoptingWorkerEpoch',
    'adoptedSlotCount',
    'adoptionReadBackVerified',
    'sidecarStillPresent',
    'journalCheckpointReadBackVerified',
  ]);
  if (
    record === null ||
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    record.kind !== 'BACKGROUND_SCHEDULING_HANDOFF_ADOPTED' ||
    record.resetId !== expected.resetId ||
    !isUuidV4(record.adoptingWorkerEpoch) ||
    record.adoptingWorkerEpoch === expected.resetId ||
    record.adoptedSlotCount !== expected.reference.slotCount ||
    record.adoptionReadBackVerified !== true ||
    record.sidecarStillPresent !== true ||
    record.journalCheckpointReadBackVerified !== true
  ) {
    return null;
  }
  const reference = parseBackgroundSchedulingHandoffReference(record.reference);
  if (reference === null || JSON.stringify(reference) !== JSON.stringify(expected.reference)) {
    return null;
  }
  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    kind: 'BACKGROUND_SCHEDULING_HANDOFF_ADOPTED',
    resetId: expected.resetId,
    reference,
    adoptingWorkerEpoch: record.adoptingWorkerEpoch,
    adoptedSlotCount: expected.reference.slotCount,
    adoptionReadBackVerified: true,
    sidecarStillPresent: true,
    journalCheckpointReadBackVerified: true,
  };
}

const issuedBackgroundSchedulingReplacementReceipts =
  new WeakSet<BackgroundSchedulingHandoffReplacementLaneReceiptV1>();
const issuedBackgroundSchedulingCleanupTokens =
  new WeakSet<BackgroundSchedulingHandoffWorkerBoundCleanupTokenV1>();

export function issueBackgroundSchedulingHandoffReplacementLane(input: {
  resetId: string;
  reference: BackgroundSchedulingHandoffReferenceV1;
  replacementWorkerEpoch: string;
  replacementLaneId: string;
  commandId: string;
  resultId: string;
  receiptId: string;
  cleanupTokenIds: [string, string, string];
  previousAuthorityRevision: number;
}): BackgroundSchedulingHandoffReplacementLaneReceiptV1 | null {
  const reference = parseBackgroundSchedulingHandoffReference(input.reference);
  const identities = [
    input.resetId,
    input.replacementWorkerEpoch,
    input.replacementLaneId,
    input.commandId,
    input.resultId,
    input.receiptId,
    ...input.cleanupTokenIds,
    ...(reference === null
      ? []
      : [
          reference.sourceControlLaneId,
          reference.sourceWorkerEpoch,
          reference.sidecarId,
          reference.handoffId,
        ]),
  ];
  if (
    reference === null ||
    input.resetId !== reference.resetId ||
    !identities.every(isUuidV4) ||
    new Set(identities).size !== identities.length ||
    input.replacementWorkerEpoch === reference.sourceWorkerEpoch ||
    input.replacementLaneId === reference.sourceControlLaneId ||
    !Number.isSafeInteger(input.previousAuthorityRevision) ||
    input.previousAuthorityRevision < 0 ||
    input.previousAuthorityRevision >= Number.MAX_SAFE_INTEGER
  ) {
    return null;
  }
  const cleanupTokens = reference.cleanupRecovery.bundles.map(
    (bundle, cleanupCasAttempt): BackgroundSchedulingHandoffWorkerBoundCleanupTokenV1 => ({
      version: LOCAL_DATA_RESET_WIRE_VERSION,
      kind: 'BACKGROUND_HANDOFF_WORKER_BOUND_CLEANUP_TOKEN',
      tokenId: input.cleanupTokenIds[cleanupCasAttempt]!,
      resetId: reference.resetId,
      sidecarId: reference.sidecarId,
      handoffId: reference.handoffId,
      capabilityManifestDigest: reference.capabilityManifestDigest,
      sourceCapabilityId: bundle.capabilityId,
      sourceBundleDigest: bundle.bundleDigest,
      cleanupCasAttempt: cleanupCasAttempt as 0 | 1 | 2,
      laneId: input.replacementLaneId,
      workerEpoch: input.replacementWorkerEpoch,
      issuanceReceiptId: input.receiptId,
      issuanceCommandId: input.commandId,
      issuanceResultId: input.resultId,
    })
  ) as BackgroundSchedulingHandoffReplacementLaneReceiptV1['cleanupTokens'];
  const receipt: BackgroundSchedulingHandoffReplacementLaneReceiptV1 = {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    kind: 'BACKGROUND_HANDOFF_REPLACEMENT_LANE_ISSUED',
    receiptId: input.receiptId,
    commandId: input.commandId,
    resultId: input.resultId,
    resetId: reference.resetId,
    sourceLaneId: reference.sourceControlLaneId,
    sourceWorkerEpoch: reference.sourceWorkerEpoch,
    replacementLaneId: input.replacementLaneId,
    replacementWorkerEpoch: input.replacementWorkerEpoch,
    sidecarId: reference.sidecarId,
    handoffId: reference.handoffId,
    capabilityManifestDigest: reference.capabilityManifestDigest,
    previousAuthorityRevision: input.previousAuthorityRevision,
    authorityRevision: input.previousAuthorityRevision + 1,
    sourceWorkerTokensInvalidated: true,
    commandResultReadBackVerified: true,
    cleanupTokens,
  };
  for (const token of cleanupTokens) {
    Object.freeze(token);
    issuedBackgroundSchedulingCleanupTokens.add(token);
  }
  Object.freeze(cleanupTokens);
  Object.freeze(receipt);
  issuedBackgroundSchedulingReplacementReceipts.add(receipt);
  return receipt;
}

export function parseBackgroundSchedulingHandoffReplacementLaneReceipt(
  value: unknown,
  expected: {
    resetId: string;
    reference: BackgroundSchedulingHandoffReferenceV1;
    currentWorkerEpoch: string;
  }
): BackgroundSchedulingHandoffReplacementLaneReceiptV1 | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !issuedBackgroundSchedulingReplacementReceipts.has(
      value as BackgroundSchedulingHandoffReplacementLaneReceiptV1
    )
  ) {
    return null;
  }
  const receipt = value as BackgroundSchedulingHandoffReplacementLaneReceiptV1;
  return receipt.resetId === expected.resetId &&
    receipt.sourceLaneId === expected.reference.sourceControlLaneId &&
    receipt.sourceWorkerEpoch === expected.reference.sourceWorkerEpoch &&
    receipt.replacementWorkerEpoch === expected.currentWorkerEpoch &&
    receipt.sidecarId === expected.reference.sidecarId &&
    receipt.handoffId === expected.reference.handoffId &&
    receipt.capabilityManifestDigest === expected.reference.capabilityManifestDigest
    ? receipt
    : null;
}

function parseBackgroundSchedulingHandoffWorkerBoundCleanupToken(
  value: unknown,
  receipt: BackgroundSchedulingHandoffReplacementLaneReceiptV1,
  cleanupCasAttempt: 0 | 1 | 2
): BackgroundSchedulingHandoffWorkerBoundCleanupTokenV1 | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !issuedBackgroundSchedulingCleanupTokens.has(
      value as BackgroundSchedulingHandoffWorkerBoundCleanupTokenV1
    )
  ) {
    return null;
  }
  const token = value as BackgroundSchedulingHandoffWorkerBoundCleanupTokenV1;
  return token === receipt.cleanupTokens[cleanupCasAttempt] &&
    token.cleanupCasAttempt === cleanupCasAttempt &&
    token.laneId === receipt.replacementLaneId &&
    token.workerEpoch === receipt.replacementWorkerEpoch &&
    token.issuanceReceiptId === receipt.receiptId &&
    token.issuanceCommandId === receipt.commandId &&
    token.issuanceResultId === receipt.resultId
    ? token
    : null;
}

function parseBackgroundSchedulingHandoffCleanupExecutionProof(
  value: unknown,
  reference: BackgroundSchedulingHandoffReferenceV1,
  replacementLaneRequired: boolean,
  currentWorkerEpoch: string,
  expectedReplacementLaneReceipt: BackgroundSchedulingHandoffReplacementLaneReceiptV1 | null
): BackgroundSchedulingHandoffCleanupExecutionProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'disposition',
    'executionLaneId',
    'executingWorkerEpoch',
    'cleanupCasAttempt',
    'cleanupCapabilityId',
    'cleanupBundleDigest',
    'replacementLaneReceipt',
    'cleanupToken',
  ]);
  if (
    record === null ||
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    (record.disposition !== 'removed' && record.disposition !== 'already_absent') ||
    !isUuidV4(record.executionLaneId) ||
    !isUuidV4(record.executingWorkerEpoch) ||
    ![0, 1, 2].includes(Number(record.cleanupCasAttempt)) ||
    !isUuidV4(record.cleanupCapabilityId) ||
    !isSha256Digest(record.cleanupBundleDigest)
  ) {
    return null;
  }
  const cleanupCasAttempt = Number(record.cleanupCasAttempt) as 0 | 1 | 2;
  const bundle = reference.cleanupRecovery.bundles[cleanupCasAttempt];
  if (
    bundle.capabilityId !== record.cleanupCapabilityId ||
    bundle.bundleDigest !== record.cleanupBundleDigest
  ) {
    return null;
  }
  const replacementLaneReceipt =
    record.replacementLaneReceipt === null
      ? null
      : parseBackgroundSchedulingHandoffReplacementLaneReceipt(record.replacementLaneReceipt, {
          resetId: reference.resetId,
          reference,
          currentWorkerEpoch,
        });
  const cleanupToken =
    replacementLaneReceipt === null
      ? null
      : parseBackgroundSchedulingHandoffWorkerBoundCleanupToken(
          record.cleanupToken,
          replacementLaneReceipt,
          cleanupCasAttempt
        );
  if (
    record.executingWorkerEpoch !== currentWorkerEpoch ||
    (record.replacementLaneReceipt !== null && replacementLaneReceipt === null) ||
    (replacementLaneRequired &&
      (replacementLaneReceipt === null ||
        cleanupToken === null ||
        replacementLaneReceipt !== expectedReplacementLaneReceipt)) ||
    (!replacementLaneRequired &&
      (replacementLaneReceipt !== null || record.cleanupToken !== null)) ||
    (replacementLaneReceipt === null &&
      (record.executionLaneId !== reference.sourceControlLaneId ||
        record.executingWorkerEpoch !== reference.sourceWorkerEpoch)) ||
    (replacementLaneReceipt !== null &&
      (record.executionLaneId !== replacementLaneReceipt.replacementLaneId ||
        record.executingWorkerEpoch !== replacementLaneReceipt.replacementWorkerEpoch ||
        cleanupToken?.sourceCapabilityId !== bundle.capabilityId ||
        cleanupToken.sourceBundleDigest !== bundle.bundleDigest))
  ) {
    return null;
  }
  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    disposition: record.disposition,
    executionLaneId: record.executionLaneId,
    executingWorkerEpoch: record.executingWorkerEpoch,
    cleanupCasAttempt,
    cleanupCapabilityId: bundle.capabilityId,
    cleanupBundleDigest: bundle.bundleDigest,
    replacementLaneReceipt,
    cleanupToken,
  };
}

export function parseBackgroundSchedulingHandoffClearProof(
  value: unknown,
  expected: {
    resetId: string;
    reference: BackgroundSchedulingHandoffReferenceV1;
    replacementLaneRequired: boolean;
    currentWorkerEpoch: string;
    replacementLaneReceipt: BackgroundSchedulingHandoffReplacementLaneReceiptV1 | null;
  }
): BackgroundSchedulingHandoffClearProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'kind',
    'resetId',
    'reference',
    'cleanupExecution',
    'absenceReadBackVerified',
    'journalCheckpointReadBackVerified',
  ]);
  if (
    record === null ||
    !isUuidV4(expected.currentWorkerEpoch) ||
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    record.kind !== 'BACKGROUND_SCHEDULING_HANDOFF_CLEARED' ||
    record.resetId !== expected.resetId ||
    record.absenceReadBackVerified !== true ||
    record.journalCheckpointReadBackVerified !== true
  ) {
    return null;
  }
  const reference = parseBackgroundSchedulingHandoffReference(record.reference);
  const cleanupExecution =
    reference === null
      ? null
      : parseBackgroundSchedulingHandoffCleanupExecutionProof(
          record.cleanupExecution,
          reference,
          expected.replacementLaneRequired,
          expected.currentWorkerEpoch,
          expected.replacementLaneReceipt
        );
  if (
    reference === null ||
    cleanupExecution === null ||
    JSON.stringify(reference) !== JSON.stringify(expected.reference)
  ) {
    return null;
  }
  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    kind: 'BACKGROUND_SCHEDULING_HANDOFF_CLEARED',
    resetId: expected.resetId,
    reference,
    cleanupExecution,
    absenceReadBackVerified: true,
    journalCheckpointReadBackVerified: true,
  };
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
    'backgroundSchedulingHandoff',
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
  const backgroundSchedulingHandoff =
    record.backgroundSchedulingHandoff === null
      ? null
      : parseBackgroundSchedulingHandoffReference(record.backgroundSchedulingHandoff);
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
    (record.backgroundSchedulingHandoff !== null && backgroundSchedulingHandoff === null) ||
    (RESET_PHASES.indexOf(record.phase) < RESET_PHASES.indexOf('quiesced') &&
      backgroundSchedulingHandoff !== null) ||
    (RESET_PHASES.indexOf(record.phase) >= RESET_PHASES.indexOf('quiesced') &&
      (backgroundSchedulingHandoff === null ||
        backgroundSchedulingHandoff.resetId !== record.resetId)) ||
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
    backgroundSchedulingHandoff,
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

export function parseLocalDataResetAdmissionOpenedProof(
  value: unknown,
  expected: { resetId: string; dataEpoch: DatasetEpoch }
): LocalDataResetAdmissionOpenedProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'kind',
    'resetId',
    'dataEpoch',
    'authorityRevision',
    'admission',
    'proofId',
  ]);
  if (
    record === null ||
    record.version !== LOCAL_DATA_RESET_WIRE_VERSION ||
    record.kind !== 'RESET_EPOCH_ADMISSION_OPENED' ||
    record.resetId !== expected.resetId ||
    record.dataEpoch !== expected.dataEpoch ||
    !isUuidV4(record.resetId) ||
    !isUuidV4(record.dataEpoch) ||
    !isUuidV4(record.proofId) ||
    new Set([record.resetId, record.dataEpoch, record.proofId]).size !== 3 ||
    !Number.isSafeInteger(record.authorityRevision) ||
    Number(record.authorityRevision) < 0 ||
    record.admission !== 'open'
  ) {
    return null;
  }

  return {
    version: LOCAL_DATA_RESET_WIRE_VERSION,
    kind: 'RESET_EPOCH_ADMISSION_OPENED',
    resetId: record.resetId,
    dataEpoch: record.dataEpoch,
    authorityRevision: Number(record.authorityRevision),
    admission: 'open',
    proofId: record.proofId,
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
    isUuidV4(input.workerEpoch) &&
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
    'backgroundSchedulingHandoffAbsent',
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
    record.backgroundSchedulingHandoffAbsent !== true ||
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
    backgroundSchedulingHandoffAbsent: true,
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
    'backgroundSchedulingHandoffAbsent',
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
    record.backgroundSchedulingHandoffAbsent !== true ||
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
    backgroundSchedulingHandoffAbsent: true,
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
    backgroundSchedulingHandoffCheckpointed: atLeast('quiesced'),
    databaseHandlesClosed: atLeast('handles_closed'),
    databaseDeleted: atLeast('database_deleted'),
    sessionCleared: atLeast('session_cleared'),
    localCleared: atLeast('local_cleared'),
    databaseReinitialized: atLeast('database_reinitialized'),
    settingsAligned: atLeast('settings_aligned'),
    receiptPersisted: atLeast('committed'),
    commitCheckpointed: atLeast('committed'),
    backgroundSchedulingHandoffAdopted: atLeast('handoff_adopted'),
    backgroundSchedulingHandoffCleared: atLeast('handoff_cleared'),
  };
}

export function recognizedPostClearCompletionPatch(): Partial<LocalDataResetContext> {
  return {
    ...durableFactsAfterPhase('committed'),
    phase: 'committed',
    backgroundSchedulingHandoff: null,
    backgroundSchedulingHandoffExpectation: null,
    backgroundSchedulingCleanupReplacementRequired: false,
    backgroundSchedulingCleanupReplacementReceipt: null,
    backgroundSchedulingHandoffAdopted: true,
    backgroundSchedulingHandoffCleared: true,
    journalPersisted: false,
    journalOutcome: 'none',
    fenceAcquired: false,
    admissionOpen: false,
    completionDisposition: 'recognized',
    expectedStep: null,
    expectedErrorOrigin: null,
    journalCheckpointExpected: false,
    error: null,
    pendingFailure: null,
  };
}

export function initialLocalDataResetContext(
  input: LocalDataResetMachineInput
): LocalDataResetContext {
  return {
    workerEpoch: input.workerEpoch,
    defaultSettings: cloneSettings(input.defaultSettings),
    includedConnectorIds: [...input.includedConnectorIds],
    resetId: null,
    previousDataEpoch: null,
    nextDataEpoch: null,
    settingsRecoveryRequestId: null,
    settingsBootstrapRequestId: null,
    requestedAt: null,
    phase: 'none',
    backgroundSchedulingHandoff: null,
    backgroundSchedulingHandoffExpectation: null,
    backgroundSchedulingCleanupReplacementRequired: false,
    backgroundSchedulingCleanupReplacementReceipt: null,
    expectedStep: null,
    expectedErrorOrigin: null,
    journalCheckpointExpected: false,
    journalPersisted: false,
    journalOutcome: 'none',
    fenceAcquired: false,
    admissionOpen: false,
    restartDisposition: null,
    ...{
      scanQuiescent: false,
      trackingQuiescent: false,
      migrationQuiescent: false,
      outboxQuiescent: false,
      backgroundSchedulingHandoffCheckpointed: false,
      databaseHandlesClosed: false,
      databaseDeleted: false,
      sessionCleared: false,
      localCleared: false,
      databaseReinitialized: false,
      settingsAligned: false,
      receiptPersisted: false,
      commitCheckpointed: false,
      backgroundSchedulingHandoffAdopted: false,
      backgroundSchedulingHandoffCleared: false,
    },
    readinessDelivery: null,
    postCommitDelivery: null,
    completionDisposition: null,
    retryCount: 0,
    error: null,
    pendingFailure: null,
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
    backgroundSchedulingHandoff: journal.backgroundSchedulingHandoff,
    backgroundSchedulingHandoffExpectation: null,
    backgroundSchedulingCleanupReplacementRequired: journal.phase === 'handoff_adopted',
    backgroundSchedulingCleanupReplacementReceipt: null,
    journalPersisted: true,
    journalOutcome: 'durable_proven',
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

export function matchesResetFenceAuthority(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): boolean {
  if (
    (event.type !== 'RESET_FENCE_AUTHORITY_ACQUIRED' && event.type !== 'BOOT_FENCE_ACQUIRED') ||
    !matchesReset(context, event) ||
    context.resetId === null ||
    context.nextDataEpoch === null
  ) {
    return false;
  }
  const proof = parseLocalDataResetFenceAuthorityProof(event.proof);
  return (
    proof !== null &&
    proof.resetId === context.resetId &&
    proof.workerEpoch === context.workerEpoch &&
    proof.previousDataEpoch === context.previousDataEpoch &&
    proof.nextDataEpoch === context.nextDataEpoch &&
    proof.journalPhase === context.phase
  );
}

export function resetFenceAuthorityPatch(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): Partial<LocalDataResetContext> {
  if (!matchesResetFenceAuthority(context, event)) {
    return {};
  }
  const proof = parseLocalDataResetFenceAuthorityProof(
    (
      event as Extract<
        LocalDataResetEvent,
        { type: 'RESET_FENCE_AUTHORITY_ACQUIRED' | 'BOOT_FENCE_ACQUIRED' }
      >
    ).proof
  );
  return proof === null
    ? {}
    : {
        fenceAcquired: true,
        backgroundSchedulingHandoffExpectation: proof.handoffExpectation,
        backgroundSchedulingCleanupReplacementRequired: proof.replacementLaneReceipt !== null,
        backgroundSchedulingCleanupReplacementReceipt: proof.replacementLaneReceipt,
      };
}

function journalMatchesContextIdentity(
  context: LocalDataResetContext,
  journal: LocalDataResetJournalV1
): boolean {
  return (
    context.resetId !== null &&
    context.nextDataEpoch !== null &&
    context.settingsRecoveryRequestId !== null &&
    context.settingsBootstrapRequestId !== null &&
    context.requestedAt !== null &&
    journal.resetId === context.resetId &&
    journal.previousDataEpoch === context.previousDataEpoch &&
    journal.nextDataEpoch === context.nextDataEpoch &&
    journal.settingsRecoveryRequestId === context.settingsRecoveryRequestId &&
    journal.settingsBootstrapRequestId === context.settingsBootstrapRequestId &&
    journal.requestedAt === context.requestedAt &&
    journal.phase === context.phase &&
    JSON.stringify(journal.backgroundSchedulingHandoff) ===
      JSON.stringify(context.backgroundSchedulingHandoff)
  );
}

function errorsEqual(left: LocalDataResetError, right: LocalDataResetError): boolean {
  return (
    left.code === right.code &&
    left.step === right.step &&
    left.origin === right.origin &&
    left.message === right.message &&
    left.retryable === right.retryable
  );
}

export function matchesFailureCheckpoint(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): boolean {
  if (event.type !== 'FAILURE_CHECKPOINTED' || !matchesReset(context, event)) {
    return false;
  }
  const journal = parseLocalDataResetJournal(event.journal);
  return (
    journal !== null &&
    context.pendingFailure !== null &&
    journalMatchesContextIdentity(context, journal) &&
    journal.retryCount === context.retryCount &&
    journal.lastError !== null &&
    errorsEqual(journal.lastError, context.pendingFailure)
  );
}

export function matchesRetryCheckpoint(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): boolean {
  if (event.type !== 'RETRY_CHECKPOINTED' || !matchesReset(context, event)) {
    return false;
  }
  const journal = parseLocalDataResetJournal(event.journal);
  return (
    journal !== null &&
    journalMatchesContextIdentity(context, journal) &&
    journal.retryCount === context.retryCount + 1 &&
    journal.lastError === null
  );
}

export function matchesAdmissionOpened(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): boolean {
  return (
    event.type === 'RESET_EPOCH_ADMISSION_OPENED' &&
    matchesReset(context, event) &&
    context.resetId !== null &&
    context.nextDataEpoch !== null &&
    !context.journalPersisted &&
    parseLocalDataResetAdmissionOpenedProof(event.proof, {
      resetId: context.resetId,
      dataEpoch: context.nextDataEpoch,
    }) !== null
  );
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
        workerEpoch: context.workerEpoch,
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

export function matchesBackgroundSchedulingHandoffCheckpoint(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): boolean {
  return (
    event.type === 'BACKGROUND_SCHEDULING_HANDOFF_CHECKPOINTED' &&
    matchesReset(context, event) &&
    context.resetId !== null &&
    context.backgroundSchedulingHandoffExpectation !== null &&
    parseBackgroundSchedulingHandoffCheckpointProof(
      event.proof,
      context.backgroundSchedulingHandoffExpectation
    ) !== null
  );
}

export function handoffReferenceFromCheckpointEvent(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): BackgroundSchedulingHandoffReferenceV1 | null {
  if (
    event.type !== 'BACKGROUND_SCHEDULING_HANDOFF_CHECKPOINTED' ||
    context.resetId === null ||
    context.backgroundSchedulingHandoffExpectation === null
  ) {
    return null;
  }
  return (
    parseBackgroundSchedulingHandoffCheckpointProof(
      event.proof,
      context.backgroundSchedulingHandoffExpectation
    )?.reference ?? null
  );
}

export function matchesSessionClear(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): boolean {
  return (
    event.type === 'SESSION_CLEARED' &&
    matchesReset(context, event) &&
    context.resetId !== null &&
    context.backgroundSchedulingHandoff !== null &&
    parseLocalDataResetSessionClearProof(event.proof, {
      resetId: context.resetId,
      reference: context.backgroundSchedulingHandoff,
    }) !== null
  );
}

export function matchesLocalClear(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): boolean {
  return (
    event.type === 'LOCAL_CLEARED' &&
    matchesReset(context, event) &&
    context.resetId !== null &&
    context.backgroundSchedulingHandoff !== null &&
    parseLocalDataResetLocalClearProof(event.proof, {
      resetId: context.resetId,
      reference: context.backgroundSchedulingHandoff,
    }) !== null
  );
}

export function matchesBackgroundSchedulingHandoffAdoption(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): boolean {
  return (
    event.type === 'BACKGROUND_SCHEDULING_HANDOFF_ADOPTED' &&
    matchesReset(context, event) &&
    context.resetId !== null &&
    context.backgroundSchedulingHandoff !== null &&
    parseBackgroundSchedulingHandoffAdoptionProof(event.proof, {
      resetId: context.resetId,
      reference: context.backgroundSchedulingHandoff,
    }) !== null
  );
}

export function matchesBackgroundSchedulingHandoffClear(
  context: LocalDataResetContext,
  event: LocalDataResetEvent
): boolean {
  return (
    event.type === 'BACKGROUND_SCHEDULING_HANDOFF_CLEARED' &&
    matchesReset(context, event) &&
    context.resetId !== null &&
    context.backgroundSchedulingHandoff !== null &&
    context.backgroundSchedulingHandoffAdopted &&
    parseBackgroundSchedulingHandoffClearProof(event.proof, {
      resetId: context.resetId,
      reference: context.backgroundSchedulingHandoff,
      replacementLaneRequired: context.backgroundSchedulingCleanupReplacementRequired,
      currentWorkerEpoch: context.workerEpoch,
      replacementLaneReceipt: context.backgroundSchedulingCleanupReplacementReceipt,
    }) !== null
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
    context.phase === 'handoff_cleared' &&
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
    context.backgroundSchedulingHandoffAdopted &&
    context.backgroundSchedulingHandoffCleared &&
    context.postCommitDelivery !== null
  );
}
