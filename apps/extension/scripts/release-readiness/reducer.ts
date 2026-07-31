import {
  parseReleaseExecutionPayloadVerification,
  parseSealedCandidateTransportObservation,
  type AuditReceiptV1,
  type CandidateIdentityV1,
  type ReleaseExecutionPayloadVerificationV1,
  type SealedCandidateTransportObservationV1,
} from './contracts';
import { jcsCanonicalize, sha256Hex, sha256Jcs } from './canonical';
import type {
  ReleaseReadinessTransactionPort,
  ReleaseTransactionOperation,
  ValidatedArtifactPublicationV1,
} from './factory';
import { parseReleaseCommandDeliveryReceipt } from './command-delivery';
import { deriveCandidateReplacementClosureProof } from './replacement-closure';
import type { GlobalReplayRecordV1 } from './replay-registry';

export type LocalReleaseReadinessState =
  | 'audited'
  | 'blocked'
  | 'rc_built'
  | 'package_validated'
  | 'store_ready'
  | 'canary'
  | 'production'
  | 'rolled_back';

interface SealPayloadAuthorityV1 {
  readonly payloadInventorySha256: string;
  readonly controllerBundleSha256: string;
  readonly controllerBundleSourceInventorySha256: string;
  readonly buildMetadataSha256: string;
  readonly buildProvenanceSha256: string;
  readonly executionAuthoritySha256: string;
  readonly ociArchiveSha256: string;
  readonly ociIndexSha256: string;
  readonly ociManifestSha256: string;
  readonly ociConfigSha256: string;
  readonly layerSha256: readonly string[];
  readonly diffIdSha256: readonly string[];
  readonly finalRootInventorySha256: string;
  readonly pythonRuntimeTreeSha256: string;
  readonly pythonExecutableSha256: string;
  readonly effectiveLoadedObjectsSha256: string;
}

export interface ReleaseSealIdentityV1 extends SealPayloadAuthorityV1 {
  readonly sealId: string;
  readonly sealSha256: string;
  readonly releaseId: string;
  readonly sourceCommit: string;
  readonly sealedAt: string;
}

export interface VerifiedReleasePayloadProjectionV1 extends SealPayloadAuthorityV1 {
  readonly transportSha256: string;
  readonly transportZipReceiptSha256: string;
  readonly sealSha256: string;
  readonly controllerExecutionAuthoritySha256: string;
}

export interface ReleasePayloadByteSnapshotV1 {
  readonly schema: 'missionpulse.release-payload-byte-snapshot';
  readonly version: 1;
  readonly snapshotId: string;
  readonly transportBytesBase64: string;
  readonly testedDistSealJcsBase64: string;
  readonly buildMetadataJcsBase64: string;
  readonly buildProvenanceJcsBase64: string;
  readonly controllerBundleBase64: string;
  readonly executionAuthorityJcsBase64: string;
  readonly ociArchiveBase64: string;
  readonly transportZipReceiptJcsBase64: string;
  readonly distTreeReceiptJcsBase64: string;
  readonly controllerSourceInventoryJcsBase64: string;
  readonly ociDescriptorGraphJcsBase64: string;
  readonly pythonRuntimeInventoryJcsBase64: string;
  readonly effectiveLoadedObjectsJcsBase64: string;
}

export const RELEASE_PAYLOAD_SNAPSHOT_LIMITS = Object.freeze({
  maxTotalDecodedBytes: 1_744_830_464,
  fieldDecodedBytes: Object.freeze({
    transportBytesBase64: 1_073_741_824,
    testedDistSealJcsBase64: 4_194_304,
    buildMetadataJcsBase64: 4_194_304,
    buildProvenanceJcsBase64: 4_194_304,
    controllerBundleBase64: 16_777_216,
    executionAuthorityJcsBase64: 4_194_304,
    ociArchiveBase64: 536_870_912,
    transportZipReceiptJcsBase64: 4_194_304,
    distTreeReceiptJcsBase64: 4_194_304,
    controllerSourceInventoryJcsBase64: 4_194_304,
    ociDescriptorGraphJcsBase64: 16_777_216,
    pythonRuntimeInventoryJcsBase64: 16_777_216,
    effectiveLoadedObjectsJcsBase64: 16_777_216,
  }),
});

interface AcceptedLocalEventV1 {
  readonly eventType: ReleaseReadinessEvent['type'];
  readonly stableIds: readonly string[];
  readonly eventSha256: string;
}

export interface ValidatedJournalIdentityV1 {
  readonly journalId: string;
  readonly previousJournalSha256: string | null;
  readonly journalSha256: string;
}

export interface ValidatedAuthorizationIdentityV1 {
  readonly authorizationId: string;
  readonly replayRecord: GlobalReplayRecordV1;
}

export interface ValidatedExternalReceiptIdentityV1 {
  readonly receiptId: string;
  readonly replayRecord: GlobalReplayRecordV1;
}

export interface ValidatedStoreReadinessIdentityV1 {
  readonly receiptId: string;
}

export interface ValidatedLocalObservationIdentityV1 {
  readonly observationId: string;
  readonly restartId: string;
  readonly valid: boolean;
  readonly error: unknown | null;
  readonly observationSha256: string;
  readonly observation: unknown;
}

export interface ArchivedCandidateV1 {
  readonly candidate: CandidateIdentityV1;
  readonly audit: AuditReceiptV1;
  readonly archivedAt: string;
  readonly contextSha256: string;
  readonly context: ReleaseReadinessContextV1;
}

export interface ReleaseReadinessContextV1 {
  readonly state: LocalReleaseReadinessState;
  readonly actorId: string;
  readonly candidate: CandidateIdentityV1;
  readonly audit: AuditReceiptV1;
  readonly seal: unknown | null;
  readonly sealIdentity: ReleaseSealIdentityV1 | null;
  readonly transportObservation: SealedCandidateTransportObservationV1 | null;
  readonly payloadVerification: ReleaseExecutionPayloadVerificationV1 | null;
  readonly packageJournal: unknown | null;
  readonly packageJournalIdentity: ValidatedJournalIdentityV1 | null;
  readonly artifact: unknown | null;
  readonly store: unknown | null;
  readonly authorizations: readonly unknown[];
  readonly submission: unknown | null;
  readonly canaryPass: unknown | null;
  readonly productionPromotion: unknown | null;
  readonly rollback: unknown | null;
  readonly pendingRestart: {
    readonly restartId: string;
    readonly restartedAt: string;
  } | null;
  readonly lastLocalObservation: ValidatedLocalObservationIdentityV1 | null;
  readonly candidateHistory: readonly ArchivedCandidateV1[];
  readonly lastError: unknown | null;
  readonly acceptedLocalEvents: readonly AcceptedLocalEventV1[];
}

export type ReleaseReadinessEvent =
  | { readonly type: 'BLOCKERS_INGESTED'; readonly error: unknown }
  | { readonly type: 'LOCAL_EVIDENCE_INVALIDATED'; readonly error: unknown }
  | { readonly type: 'RC_SEAL_INGESTED'; readonly seal: unknown }
  | {
      readonly type: 'RELEASE_PAYLOAD_VERIFIED_INGESTED';
      readonly transportObservation: unknown;
      readonly payloadVerification: unknown;
      readonly payloadByteSnapshot: ReleasePayloadByteSnapshotV1;
    }
  | {
      readonly type: 'PACKAGE_JOURNAL_INGESTED';
      readonly journal: unknown;
      readonly recoveryObservationId?: string | null;
    }
  | {
      readonly type: 'PACKAGE_VALIDATED_INGESTED';
      readonly artifact: unknown;
      readonly expectedCatalogRevision: number;
      readonly recoveryObservationId?: string | null;
    }
  | {
      readonly type: 'STORE_READINESS_INGESTED';
      readonly store: unknown;
      readonly authorization: unknown;
      readonly ingestedAt: string;
      readonly expectedRegistryRevision: number;
    }
  | {
      readonly type: 'SUBMISSION_RECEIPT_INGESTED';
      readonly receipt: unknown;
      readonly authorization: unknown;
      readonly ingestedAt: string;
      readonly expectedRegistryRevision: number;
    }
  | {
      readonly type: 'CANARY_PASS_RECEIPT_INGESTED';
      readonly receipt: unknown;
      readonly authorization: unknown;
      readonly ingestedAt: string;
      readonly expectedRegistryRevision: number;
    }
  | {
      readonly type: 'PRODUCTION_PROMOTION_RECEIPT_INGESTED';
      readonly receipt: unknown;
      readonly authorization: unknown;
      readonly ingestedAt: string;
      readonly expectedRegistryRevision: number;
    }
  | {
      readonly type: 'ROLLBACK_RECEIPT_INGESTED';
      readonly receipt: unknown;
      readonly authorization: unknown;
      readonly ingestedAt: string;
      readonly expectedRegistryRevision: number;
    }
  | {
      readonly type: 'SERVICE_RESTARTED';
      readonly releaseId: string;
      readonly restartId: string;
      readonly restartedAt: string;
    }
  | { readonly type: 'LOCAL_RELEASE_OBSERVATION_INGESTED'; readonly observation: unknown }
  | {
      readonly type: 'NEW_CANDIDATE_INGESTED';
      readonly candidate: unknown;
      readonly audit: unknown;
      readonly catalogedAt: string;
      readonly expectedCatalogRevision: number;
    };

const PRIMARY_EVENT_PERMISSIONS: Readonly<
  Record<LocalReleaseReadinessState, ReadonlySet<ReleaseReadinessEvent['type']>>
> = {
  audited: new Set(['BLOCKERS_INGESTED', 'RC_SEAL_INGESTED', 'LOCAL_EVIDENCE_INVALIDATED']),
  blocked: new Set([
    'BLOCKERS_INGESTED',
    'PACKAGE_JOURNAL_INGESTED',
    'PACKAGE_VALIDATED_INGESTED',
    'LOCAL_EVIDENCE_INVALIDATED',
    'NEW_CANDIDATE_INGESTED',
  ]),
  rc_built: new Set([
    'BLOCKERS_INGESTED',
    'RELEASE_PAYLOAD_VERIFIED_INGESTED',
    'PACKAGE_JOURNAL_INGESTED',
    'PACKAGE_VALIDATED_INGESTED',
    'LOCAL_EVIDENCE_INVALIDATED',
  ]),
  package_validated: new Set([
    'BLOCKERS_INGESTED',
    'STORE_READINESS_INGESTED',
    'LOCAL_EVIDENCE_INVALIDATED',
  ]),
  store_ready: new Set([
    'BLOCKERS_INGESTED',
    'SUBMISSION_RECEIPT_INGESTED',
    'CANARY_PASS_RECEIPT_INGESTED',
    'LOCAL_EVIDENCE_INVALIDATED',
  ]),
  canary: new Set([
    'BLOCKERS_INGESTED',
    'PRODUCTION_PROMOTION_RECEIPT_INGESTED',
    'ROLLBACK_RECEIPT_INGESTED',
    'LOCAL_EVIDENCE_INVALIDATED',
  ]),
  production: new Set([
    'BLOCKERS_INGESTED',
    'ROLLBACK_RECEIPT_INGESTED',
    'LOCAL_EVIDENCE_INVALIDATED',
  ]),
  rolled_back: new Set(),
};

export function isReleaseEventPermitted(
  state: LocalReleaseReadinessState,
  eventType: ReleaseReadinessEvent['type']
): boolean {
  if (eventType === 'SERVICE_RESTARTED' || eventType === 'LOCAL_RELEASE_OBSERVATION_INGESTED') {
    return true;
  }
  return PRIMARY_EVENT_PERMISSIONS[state].has(eventType);
}

export interface ReleaseReadinessReducerPorts {
  readonly transactionPort: ReleaseReadinessTransactionPort;
  readonly authorizeTransactionRequest: <T extends object>(
    operation: ReleaseTransactionOperation,
    request: T
  ) => T;
  readonly validateFinalSeal: (
    value: unknown,
    candidate: CandidateIdentityV1
  ) => ReleaseSealIdentityV1;
  readonly verifyTransportAttestation: (
    observation: SealedCandidateTransportObservationV1,
    candidate: CandidateIdentityV1
  ) => boolean;
  readonly verifyPayloadByteSnapshot: (
    snapshot: ReleasePayloadByteSnapshotV1,
    input: {
      readonly candidate: CandidateIdentityV1;
      readonly seal: ReleaseSealIdentityV1;
      readonly observation: SealedCandidateTransportObservationV1;
      readonly verification: ReleaseExecutionPayloadVerificationV1;
    }
  ) => VerifiedReleasePayloadProjectionV1;
  readonly validateJournal: (
    value: unknown,
    context: ReleaseReadinessContextV1
  ) => ValidatedJournalIdentityV1;
  readonly validatePackage: (
    value: unknown,
    context: ReleaseReadinessContextV1
  ) => ValidatedArtifactPublicationV1;
  readonly verifyRecoveredJournalObservation: (
    journal: unknown,
    observation: unknown,
    context: ReleaseReadinessContextV1
  ) => boolean;
  readonly verifyRecoveredPackageObservation: (
    artifact: unknown,
    observation: unknown,
    context: ReleaseReadinessContextV1
  ) => boolean;
  readonly validateStoreReadiness: (
    value: unknown,
    context: ReleaseReadinessContextV1
  ) => ValidatedStoreReadinessIdentityV1;
  readonly validateAuthorization: (
    value: unknown,
    action:
      | 'mark_store_ready'
      | 'ingest_submission'
      | 'ingest_canary_pass'
      | 'ingest_production_promotion'
      | 'ingest_rollback',
    context: ReleaseReadinessContextV1,
    ingestedAt: string
  ) => ValidatedAuthorizationIdentityV1;
  readonly validateSubmissionReceipt: (
    value: unknown,
    context: ReleaseReadinessContextV1
  ) => ValidatedExternalReceiptIdentityV1;
  readonly validateCanaryPassReceipt: (
    value: unknown,
    context: ReleaseReadinessContextV1
  ) => ValidatedExternalReceiptIdentityV1;
  readonly validateProductionPromotionReceipt: (
    value: unknown,
    context: ReleaseReadinessContextV1
  ) => ValidatedExternalReceiptIdentityV1;
  readonly validateRollbackReceipt: (
    value: unknown,
    context: ReleaseReadinessContextV1
  ) => ValidatedExternalReceiptIdentityV1;
  readonly validateLocalObservation: (
    value: unknown,
    context: ReleaseReadinessContextV1
  ) => ValidatedLocalObservationIdentityV1;
  readonly validateRestart: (
    event: Extract<ReleaseReadinessEvent, { readonly type: 'SERVICE_RESTARTED' }>,
    context: ReleaseReadinessContextV1
  ) => boolean;
  readonly validateCandidateReplacement: (
    candidate: unknown,
    audit: unknown,
    context: ReleaseReadinessContextV1
  ) => {
    readonly candidate: CandidateIdentityV1;
    readonly audit: AuditReceiptV1;
  };
  readonly emitCommand: (command: {
    readonly commandId: string;
    readonly type: 'SCAN_LOCAL_RELEASE_FILES';
    readonly actorId: string;
    readonly releaseId: string;
    readonly restartId: string;
    readonly createdAt: string;
  }) => unknown;
}

export interface ReleaseReadinessOutboxDrainResultV1 {
  readonly attempted: number;
  readonly acknowledged: number;
  readonly pending: number;
}

const ACTIVE_RELEASE_COMMAND_DELIVERIES = new Set<string>();

function deliverPendingCommand(commandId: string, ports: ReleaseReadinessReducerPorts): boolean {
  if (ACTIVE_RELEASE_COMMAND_DELIVERIES.has(commandId)) {
    return false;
  }
  ACTIVE_RELEASE_COMMAND_DELIVERIES.add(commandId);
  try {
    const command = ports.transactionPort
      .readPendingCommands()
      .find((candidate) => candidate.commandId === commandId);
    if (command === undefined) {
      return false;
    }
    try {
      const receipt = parseReleaseCommandDeliveryReceipt(ports.emitCommand(snapshot(command)));
      return ports.transactionPort.acknowledgeCommand(
        ports.authorizeTransactionRequest('acknowledgeCommand', {
          commandId,
          deliveryReceipt: receipt,
        })
      );
    } catch {
      return false;
    }
  } finally {
    ACTIVE_RELEASE_COMMAND_DELIVERIES.delete(commandId);
  }
}

export function drainReleaseReadinessCommandOutbox(
  ports: ReleaseReadinessReducerPorts
): ReleaseReadinessOutboxDrainResultV1 {
  const commandIds = ports.transactionPort
    .readPendingCommands()
    .map((command) => command.commandId);
  let acknowledged = 0;
  for (const commandId of commandIds) {
    if (deliverPendingCommand(commandId, ports)) {
      acknowledged += 1;
    }
  }
  return {
    attempted: commandIds.length,
    acknowledged,
    pending: ports.transactionPort.readPendingCommands().length,
  };
}

export function createFailClosedReleaseReadinessPorts(
  transactionPort: ReleaseReadinessTransactionPort
): ReleaseReadinessReducerPorts {
  const reject = (): never => {
    throw new Error('A production release-readiness validator was not configured.');
  };
  return {
    transactionPort,
    authorizeTransactionRequest: (_operation, request) => request,
    validateFinalSeal: reject,
    verifyTransportAttestation: () => false,
    verifyPayloadByteSnapshot: reject,
    validateJournal: reject,
    validatePackage: reject,
    verifyRecoveredJournalObservation: () => false,
    verifyRecoveredPackageObservation: () => false,
    validateStoreReadiness: reject,
    validateAuthorization: reject,
    validateSubmissionReceipt: reject,
    validateCanaryPassReceipt: reject,
    validateProductionPromotionReceipt: reject,
    validateRollbackReceipt: reject,
    validateLocalObservation: reject,
    validateRestart: () => false,
    validateCandidateReplacement: reject,
    emitCommand: reject,
  };
}

export type ReleaseReadinessRejectionCode =
  | 'EVENT_NOT_PERMITTED_FROM_STATE'
  | 'IDENTITY_MISMATCH'
  | 'SEAL_INVALID'
  | 'TRANSPORT_OBSERVATION_INVALID'
  | 'PAYLOAD_VERIFICATION_INVALID'
  | 'PAYLOAD_VERIFICATION_REQUIRED'
  | 'JOURNAL_INVALID'
  | 'PACKAGE_INVALID'
  | 'LOCAL_RECEIPT_DIVERGENT'
  | 'ACTOR_CAS_CONFLICT'
  | 'RELEASE_CATALOG_CAS_CONFLICT'
  | 'RELEASE_CATALOG_CAPACITY_EXHAUSTED'
  | 'GLOBAL_REPLAY_CAS_CONFLICT'
  | 'GLOBAL_REPLAY_CAPACITY_EXHAUSTED'
  | 'GLOBAL_REPLAY_DIVERGENT'
  | 'COMMAND_OUTBOX_CAPACITY_EXHAUSTED'
  | 'AUTHORIZATION_INVALID'
  | 'EXTERNAL_RECEIPT_INVALID'
  | 'SUBMISSION_ALREADY_SET'
  | 'RESTART_OBSERVATION_INVALID'
  | 'CANDIDATE_REPLACEMENT_UNSAFE'
  | 'VERSION_PRECEDENCE_REJECTED';

export type ReleaseReadinessReduction =
  | {
      readonly accepted: true;
      readonly duplicate: boolean;
      readonly context: ReleaseReadinessContextV1;
    }
  | {
      readonly accepted: false;
      readonly code: ReleaseReadinessRejectionCode;
      readonly context: ReleaseReadinessContextV1;
    };

function snapshot<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (typeof candidate !== 'object' || candidate === null || Object.isFrozen(candidate)) {
      return;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        freeze(item);
      }
    } else {
      for (const item of Object.values(candidate as Record<string, unknown>)) {
        freeze(item);
      }
    }
    Object.freeze(candidate);
  };
  freeze(copy);
  return copy;
}

function snapshotValidatorResult<T extends object>(value: T, exactKeys: readonly string[]): T {
  const copy = snapshot(value);
  if (
    typeof copy !== 'object' ||
    copy === null ||
    Array.isArray(copy) ||
    Object.getPrototypeOf(copy) !== Object.prototype ||
    Object.keys(copy).sort().join('\0') !== [...exactKeys].sort().join('\0')
  ) {
    throw new Error('Release validator result is not one exact plain snapshot.');
  }
  jcsCanonicalize(copy);
  return copy;
}

const SEAL_IDENTITY_KEYS = [
  'buildMetadataSha256',
  'buildProvenanceSha256',
  'controllerBundleSha256',
  'controllerBundleSourceInventorySha256',
  'diffIdSha256',
  'effectiveLoadedObjectsSha256',
  'executionAuthoritySha256',
  'finalRootInventorySha256',
  'layerSha256',
  'ociArchiveSha256',
  'ociConfigSha256',
  'ociIndexSha256',
  'ociManifestSha256',
  'payloadInventorySha256',
  'pythonExecutableSha256',
  'pythonRuntimeTreeSha256',
  'releaseId',
  'sealId',
  'sealSha256',
  'sealedAt',
  'sourceCommit',
] as const;

const PAYLOAD_PROJECTION_KEYS = [
  'buildMetadataSha256',
  'buildProvenanceSha256',
  'controllerBundleSha256',
  'controllerBundleSourceInventorySha256',
  'diffIdSha256',
  'effectiveLoadedObjectsSha256',
  'executionAuthoritySha256',
  'controllerExecutionAuthoritySha256',
  'finalRootInventorySha256',
  'layerSha256',
  'ociArchiveSha256',
  'ociConfigSha256',
  'ociIndexSha256',
  'ociManifestSha256',
  'payloadInventorySha256',
  'pythonExecutableSha256',
  'pythonRuntimeTreeSha256',
  'sealSha256',
  'transportSha256',
  'transportZipReceiptSha256',
] as const;

function eventDigest(event: ReleaseReadinessEvent): string {
  const { type, ...payload } = event;
  return sha256Hex(jcsCanonicalize({ eventType: type, payload }));
}

const EVENT_KEYS: Readonly<
  Record<
    ReleaseReadinessEvent['type'],
    { readonly required: readonly string[]; readonly optional?: readonly string[] }
  >
> = {
  BLOCKERS_INGESTED: { required: ['type', 'error'] },
  LOCAL_EVIDENCE_INVALIDATED: { required: ['type', 'error'] },
  RC_SEAL_INGESTED: { required: ['type', 'seal'] },
  RELEASE_PAYLOAD_VERIFIED_INGESTED: {
    required: ['type', 'transportObservation', 'payloadVerification', 'payloadByteSnapshot'],
  },
  PACKAGE_JOURNAL_INGESTED: {
    required: ['type', 'journal'],
    optional: ['recoveryObservationId'],
  },
  PACKAGE_VALIDATED_INGESTED: {
    required: ['type', 'artifact', 'expectedCatalogRevision'],
    optional: ['recoveryObservationId'],
  },
  STORE_READINESS_INGESTED: {
    required: ['type', 'store', 'authorization', 'ingestedAt', 'expectedRegistryRevision'],
  },
  SUBMISSION_RECEIPT_INGESTED: {
    required: ['type', 'receipt', 'authorization', 'ingestedAt', 'expectedRegistryRevision'],
  },
  CANARY_PASS_RECEIPT_INGESTED: {
    required: ['type', 'receipt', 'authorization', 'ingestedAt', 'expectedRegistryRevision'],
  },
  PRODUCTION_PROMOTION_RECEIPT_INGESTED: {
    required: ['type', 'receipt', 'authorization', 'ingestedAt', 'expectedRegistryRevision'],
  },
  ROLLBACK_RECEIPT_INGESTED: {
    required: ['type', 'receipt', 'authorization', 'ingestedAt', 'expectedRegistryRevision'],
  },
  SERVICE_RESTARTED: {
    required: ['type', 'releaseId', 'restartId', 'restartedAt'],
  },
  LOCAL_RELEASE_OBSERVATION_INGESTED: {
    required: ['type', 'observation'],
  },
  NEW_CANDIDATE_INGESTED: {
    required: ['type', 'candidate', 'audit', 'catalogedAt', 'expectedCatalogRevision'],
  },
};

function snapshotReleaseEvent(value: ReleaseReadinessEvent): ReleaseReadinessEvent {
  const copy = snapshot(value);
  if (typeof copy !== 'object' || copy === null || Array.isArray(copy)) {
    throw new Error('Release event must be one detached object.');
  }
  const type = (copy as { readonly type?: unknown }).type;
  if (typeof type !== 'string' || !(type in EVENT_KEYS)) {
    throw new Error('Release event type is invalid.');
  }
  const contract = EVENT_KEYS[type as ReleaseReadinessEvent['type']];
  const keys = Object.keys(copy);
  const allowed = new Set([...(contract.required ?? []), ...(contract.optional ?? [])]);
  if (
    contract.required.some((key) => !Object.prototype.hasOwnProperty.call(copy, key)) ||
    keys.some((key) => !allowed.has(key))
  ) {
    throw new Error('Release event keys are not exact.');
  }
  return copy;
}

function reject(
  context: ReleaseReadinessContextV1,
  code: ReleaseReadinessRejectionCode
): ReleaseReadinessReduction {
  return { accepted: false, code, context };
}

function accepted(
  context: ReleaseReadinessContextV1,
  duplicate: boolean
): ReleaseReadinessReduction {
  return { accepted: true, duplicate, context };
}

function nextContextWithEvent(
  context: ReleaseReadinessContextV1,
  event: ReleaseReadinessEvent,
  stableIds: readonly string[],
  changes: Partial<ReleaseReadinessContextV1>
): ReleaseReadinessContextV1 {
  const record: AcceptedLocalEventV1 = {
    eventType: event.type,
    stableIds,
    eventSha256: eventDigest(event),
  };
  return snapshot({
    ...context,
    ...changes,
    acceptedLocalEvents: [...context.acceptedLocalEvents, record],
  });
}

function duplicateOrDivergent(
  context: ReleaseReadinessContextV1,
  event: ReleaseReadinessEvent,
  stableIds: readonly string[],
  allowStableProgress = false
): 'duplicate' | 'divergent' | null {
  const digest = eventDigest(event);
  if (
    context.acceptedLocalEvents.some(
      (acceptedEvent) =>
        acceptedEvent.eventType === event.type && acceptedEvent.eventSha256 === digest
    )
  ) {
    return 'duplicate';
  }
  if (
    !allowStableProgress &&
    stableIds.some((stableId) =>
      context.acceptedLocalEvents.some(
        (acceptedEvent) =>
          acceptedEvent.eventType === event.type && acceptedEvent.stableIds.includes(stableId)
      )
    )
  ) {
    return 'divergent';
  }
  return null;
}

function transactionFailureCode(code: string): ReleaseReadinessRejectionCode {
  if (code === 'RELEASE_CATALOG_CAS_CONFLICT') {
    return 'RELEASE_CATALOG_CAS_CONFLICT';
  }
  if (code === 'VERSION_PRECEDENCE_REJECTED') {
    return 'VERSION_PRECEDENCE_REJECTED';
  }
  if (code === 'RELEASE_CATALOG_CAPACITY_EXHAUSTED') {
    return 'RELEASE_CATALOG_CAPACITY_EXHAUSTED';
  }
  if (code === 'CANDIDATE_REPLACEMENT_UNSAFE') {
    return 'CANDIDATE_REPLACEMENT_UNSAFE';
  }
  if (code === 'GLOBAL_REPLAY_CAS_CONFLICT') {
    return 'GLOBAL_REPLAY_CAS_CONFLICT';
  }
  if (code === 'GLOBAL_REPLAY_CAPACITY_EXHAUSTED') {
    return 'GLOBAL_REPLAY_CAPACITY_EXHAUSTED';
  }
  if (code === 'GLOBAL_REPLAY_DIVERGENT') {
    return 'GLOBAL_REPLAY_DIVERGENT';
  }
  if (code === 'COMMAND_OUTBOX_CAPACITY_EXHAUSTED') {
    return 'COMMAND_OUTBOX_CAPACITY_EXHAUSTED';
  }
  return 'ACTOR_CAS_CONFLICT';
}

function releaseContextSha256(context: ReleaseReadinessContextV1): string {
  return sha256Jcs(context);
}

function persistActor(
  context: ReleaseReadinessContextV1,
  next: ReleaseReadinessContextV1,
  ports: ReleaseReadinessReducerPorts
): ReleaseReadinessReduction {
  const result = ports.transactionPort.commitActor(
    ports.authorizeTransactionRequest('commitActor', {
      actorId: context.actorId,
      expectedContextSha256: releaseContextSha256(context),
      nextContext: next,
    })
  );
  return result.ok
    ? accepted(result.context, false)
    : reject(context, transactionFailureCode(result.code));
}

function persistProtectedEvent(
  context: ReleaseReadinessContextV1,
  next: ReleaseReadinessContextV1,
  expectedRegistryRevision: number,
  replayRecords: readonly GlobalReplayRecordV1[],
  ports: ReleaseReadinessReducerPorts
): ReleaseReadinessReduction {
  const result = ports.transactionPort.commitProtectedEvent(
    ports.authorizeTransactionRequest('commitProtectedEvent', {
      actorId: context.actorId,
      expectedContextSha256: releaseContextSha256(context),
      nextContext: next,
      expectedRegistryRevision,
      replayRecords,
    })
  );
  return result.ok
    ? accepted(result.context, false)
    : reject(context, transactionFailureCode(result.code));
}

const SNAPSHOT_KEYS = [
  'schema',
  'version',
  'snapshotId',
  'transportBytesBase64',
  'testedDistSealJcsBase64',
  'buildMetadataJcsBase64',
  'buildProvenanceJcsBase64',
  'controllerBundleBase64',
  'executionAuthorityJcsBase64',
  'ociArchiveBase64',
  'transportZipReceiptJcsBase64',
  'distTreeReceiptJcsBase64',
  'controllerSourceInventoryJcsBase64',
  'ociDescriptorGraphJcsBase64',
  'pythonRuntimeInventoryJcsBase64',
  'effectiveLoadedObjectsJcsBase64',
] as const;

function parsePayloadByteSnapshot(value: unknown): ReleasePayloadByteSnapshotV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error();
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join('\0') !== [...SNAPSHOT_KEYS].sort().join('\0')) {
    throw new Error();
  }
  if (
    record.schema !== 'missionpulse.release-payload-byte-snapshot' ||
    record.version !== 1 ||
    typeof record.snapshotId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.snapshotId)
  ) {
    throw new Error();
  }
  let totalDecodedBytes = 0;
  for (const key of SNAPSHOT_KEYS.slice(3)) {
    const encoded = record[key];
    const maxDecodedBytes =
      RELEASE_PAYLOAD_SNAPSHOT_LIMITS.fieldDecodedBytes[
        key as keyof typeof RELEASE_PAYLOAD_SNAPSHOT_LIMITS.fieldDecodedBytes
      ];
    if (
      typeof encoded !== 'string' ||
      encoded.length === 0 ||
      encoded.length % 4 !== 0 ||
      encoded.length > Math.ceil(maxDecodedBytes / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded) ||
      Buffer.from(encoded, 'base64').toString('base64') !== encoded
    ) {
      throw new Error();
    }
    const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
    const decodedBytes = (encoded.length / 4) * 3 - padding;
    if (decodedBytes > maxDecodedBytes) {
      throw new Error();
    }
    totalDecodedBytes += decodedBytes;
    if (totalDecodedBytes > RELEASE_PAYLOAD_SNAPSHOT_LIMITS.maxTotalDecodedBytes) {
      throw new Error();
    }
  }
  return snapshot(value as ReleasePayloadByteSnapshotV1);
}

function verificationProjection(
  verification: ReleaseExecutionPayloadVerificationV1
): VerifiedReleasePayloadProjectionV1 {
  return {
    transportSha256: verification.transportSha256,
    transportZipReceiptSha256: verification.transportZipReceiptSha256,
    sealSha256: verification.sealSha256,
    payloadInventorySha256: verification.payloadInventorySha256,
    controllerBundleSha256: verification.controllerBundleSha256,
    controllerBundleSourceInventorySha256: verification.controllerBundleSourceInventorySha256,
    buildMetadataSha256: verification.buildMetadataSha256,
    buildProvenanceSha256: verification.buildProvenanceSha256,
    executionAuthoritySha256: verification.executionAuthoritySha256,
    controllerExecutionAuthoritySha256: verification.controllerExecutionAuthoritySha256,
    ociArchiveSha256: verification.ociArchiveSha256,
    ociIndexSha256: verification.ociIndexSha256,
    ociManifestSha256: verification.ociManifestSha256,
    ociConfigSha256: verification.ociConfigSha256,
    layerSha256: verification.layerSha256,
    diffIdSha256: verification.diffIdSha256,
    finalRootInventorySha256: verification.finalRootInventorySha256,
    pythonRuntimeTreeSha256: verification.pythonRuntimeTreeSha256,
    pythonExecutableSha256: verification.pythonExecutableSha256,
    effectiveLoadedObjectsSha256: verification.effectiveLoadedObjectsSha256,
  };
}

function sealPayloadProjection(seal: ReleaseSealIdentityV1): SealPayloadAuthorityV1 {
  return {
    payloadInventorySha256: seal.payloadInventorySha256,
    controllerBundleSha256: seal.controllerBundleSha256,
    controllerBundleSourceInventorySha256: seal.controllerBundleSourceInventorySha256,
    buildMetadataSha256: seal.buildMetadataSha256,
    buildProvenanceSha256: seal.buildProvenanceSha256,
    executionAuthoritySha256: seal.executionAuthoritySha256,
    ociArchiveSha256: seal.ociArchiveSha256,
    ociIndexSha256: seal.ociIndexSha256,
    ociManifestSha256: seal.ociManifestSha256,
    ociConfigSha256: seal.ociConfigSha256,
    layerSha256: seal.layerSha256,
    diffIdSha256: seal.diffIdSha256,
    finalRootInventorySha256: seal.finalRootInventorySha256,
    pythonRuntimeTreeSha256: seal.pythonRuntimeTreeSha256,
    pythonExecutableSha256: seal.pythonExecutableSha256,
    effectiveLoadedObjectsSha256: seal.effectiveLoadedObjectsSha256,
  };
}

function validateVBindings(
  context: ReleaseReadinessContextV1,
  observation: SealedCandidateTransportObservationV1,
  verification: ReleaseExecutionPayloadVerificationV1,
  byteSnapshot: ReleasePayloadByteSnapshotV1,
  ports: ReleaseReadinessReducerPorts
): ReleaseReadinessRejectionCode | null {
  const seal = context.sealIdentity;
  if (seal === null) {
    return 'SEAL_INVALID';
  }
  const candidate = context.candidate;
  const attestation = observation.preUploadAttestation;
  if (
    attestation.sourceRepository !== candidate.transportAttestationPolicy.sourceRepository ||
    attestation.sourceRef !== candidate.transportAttestationPolicy.sourceRef ||
    attestation.workflowPath !== candidate.transportAttestationPolicy.workflowPath ||
    attestation.predicateType !== candidate.transportAttestationPolicy.predicateType ||
    attestation.headSha !== candidate.sourceCommit ||
    attestation.signerWorkflowSha !== candidate.sourceCommit ||
    attestation.signerWorkflowRef !==
      `${candidate.transportAttestationPolicy.sourceRepository}/${candidate.transportAttestationPolicy.workflowPath}@${candidate.transportAttestationPolicy.sourceRef}` ||
    !ports.verifyTransportAttestation(observation, candidate)
  ) {
    return 'TRANSPORT_OBSERVATION_INVALID';
  }
  if (
    verification.releaseId !== candidate.releaseId ||
    verification.sourceCommit !== candidate.sourceCommit ||
    verification.sealId !== seal.sealId ||
    verification.sealSha256 !== seal.sealSha256 ||
    verification.transportSha256 !== observation.downloadedTransportSha256 ||
    verification.payloadInventorySha256 !== observation.payloadInventorySha256 ||
    Date.parse(seal.sealedAt) > Date.parse(observation.capturedAt) ||
    Date.parse(observation.observedAt) > Date.parse(verification.verifiedAt) ||
    Date.parse(verification.verifiedAt) >= Date.parse(observation.artifactExpiresAt)
  ) {
    return 'PAYLOAD_VERIFICATION_INVALID';
  }
  const proof = snapshotValidatorResult(
    ports.verifyPayloadByteSnapshot(byteSnapshot, {
      candidate,
      seal,
      observation,
      verification,
    }),
    PAYLOAD_PROJECTION_KEYS
  );
  if (
    jcsCanonicalize(proof) !== jcsCanonicalize(verificationProjection(verification)) ||
    jcsCanonicalize(sealPayloadProjection(seal)) !==
      jcsCanonicalize(
        (({
          transportSha256: _transport,
          transportZipReceiptSha256: _zip,
          sealSha256: _seal,
          controllerExecutionAuthoritySha256: _controllerAuthority,
          ...payload
        }) => payload)(proof)
      ) ||
    proof.transportSha256 !== observation.downloadedTransportSha256 ||
    proof.sealSha256 !== seal.sealSha256 ||
    proof.payloadInventorySha256 !== observation.payloadInventorySha256
  ) {
    return 'PAYLOAD_VERIFICATION_INVALID';
  }
  return null;
}

export function reduceReleaseReadiness(
  context: ReleaseReadinessContextV1,
  event: ReleaseReadinessEvent,
  ports: ReleaseReadinessReducerPorts
): ReleaseReadinessReduction {
  try {
    return reduceSnapshottedReleaseReadiness(context, snapshotReleaseEvent(event), ports);
  } catch {
    return reject(context, 'LOCAL_RECEIPT_DIVERGENT');
  }
}

function reduceSnapshottedReleaseReadiness(
  context: ReleaseReadinessContextV1,
  event: ReleaseReadinessEvent,
  ports: ReleaseReadinessReducerPorts
): ReleaseReadinessReduction {
  try {
    const digest = eventDigest(event);
    if (
      context.acceptedLocalEvents.some(
        (acceptedEvent) =>
          acceptedEvent.eventType === event.type && acceptedEvent.eventSha256 === digest
      )
    ) {
      return accepted(context, true);
    }
    if (
      event.type === 'SERVICE_RESTARTED' &&
      context.acceptedLocalEvents.some(
        (acceptedEvent) =>
          acceptedEvent.eventType === event.type &&
          acceptedEvent.stableIds.includes(event.restartId)
      )
    ) {
      return reject(context, 'LOCAL_RECEIPT_DIVERGENT');
    }
    if (context.pendingRestart !== null && event.type !== 'LOCAL_RELEASE_OBSERVATION_INGESTED') {
      return reject(context, 'RESTART_OBSERVATION_INVALID');
    }
    if (!isReleaseEventPermitted(context.state, event.type)) {
      return reject(context, 'EVENT_NOT_PERMITTED_FROM_STATE');
    }
    if (event.type === 'RC_SEAL_INGESTED') {
      const sealIdentity = snapshotValidatorResult(
        ports.validateFinalSeal(event.seal, context.candidate),
        SEAL_IDENTITY_KEYS
      );
      const stableIds = [sealIdentity.sealId];
      const delivery = duplicateOrDivergent(context, event, stableIds);
      if (delivery === 'duplicate') {
        return accepted(context, true);
      }
      if (delivery === 'divergent') {
        return reject(context, 'LOCAL_RECEIPT_DIVERGENT');
      }
      if (context.state !== 'audited') {
        return reject(context, 'EVENT_NOT_PERMITTED_FROM_STATE');
      }
      if (
        sealIdentity.releaseId !== context.candidate.releaseId ||
        sealIdentity.sourceCommit !== context.candidate.sourceCommit
      ) {
        return reject(context, 'IDENTITY_MISMATCH');
      }
      const next = nextContextWithEvent(context, event, stableIds, {
        state: 'rc_built',
        seal: event.seal,
        sealIdentity,
        lastError: null,
      });
      return persistActor(context, next, ports);
    }

    if (event.type === 'RELEASE_PAYLOAD_VERIFIED_INGESTED') {
      const observation = parseSealedCandidateTransportObservation(event.transportObservation);
      const verification = parseReleaseExecutionPayloadVerification(event.payloadVerification);
      const byteSnapshot = parsePayloadByteSnapshot(event.payloadByteSnapshot);
      const stableIds = [
        observation.preUploadAttestation.attestationId,
        verification.verificationId,
      ];
      const delivery = duplicateOrDivergent(context, event, stableIds);
      if (delivery === 'duplicate') {
        return accepted(context, true);
      }
      if (
        delivery === 'divergent' ||
        context.transportObservation !== null ||
        context.payloadVerification !== null
      ) {
        return reject(context, 'LOCAL_RECEIPT_DIVERGENT');
      }
      if (context.state !== 'rc_built') {
        return reject(context, 'EVENT_NOT_PERMITTED_FROM_STATE');
      }
      const bindingError = validateVBindings(
        context,
        observation,
        verification,
        byteSnapshot,
        ports
      );
      if (bindingError !== null) {
        return reject(context, bindingError);
      }
      const next = nextContextWithEvent(context, event, stableIds, {
        transportObservation: observation,
        payloadVerification: verification,
      });
      return persistActor(context, next, ports);
    }

    if (event.type === 'PACKAGE_JOURNAL_INGESTED') {
      const identity = snapshotValidatorResult(ports.validateJournal(event.journal, context), [
        'journalId',
        'journalSha256',
        'previousJournalSha256',
      ]);
      const delivery = duplicateOrDivergent(context, event, [identity.journalId], true);
      if (delivery === 'duplicate') {
        return accepted(context, true);
      }
      if (context.state !== 'rc_built' && context.state !== 'blocked') {
        return reject(context, 'EVENT_NOT_PERMITTED_FROM_STATE');
      }
      if (
        context.state === 'blocked' &&
        (event.recoveryObservationId === null ||
          event.recoveryObservationId === undefined ||
          context.lastLocalObservation?.valid !== true ||
          context.lastLocalObservation.observationId !== event.recoveryObservationId)
      ) {
        return reject(context, 'RESTART_OBSERVATION_INVALID');
      }
      if (context.state === 'blocked') {
        const recoveryObservation = context.lastLocalObservation;
        if (
          recoveryObservation === null ||
          recoveryObservation.valid !== true ||
          !ports.verifyRecoveredJournalObservation(
            event.journal,
            recoveryObservation.observation,
            context
          )
        ) {
          return reject(context, 'JOURNAL_INVALID');
        }
      }
      if (context.transportObservation === null || context.payloadVerification === null) {
        return reject(context, 'PAYLOAD_VERIFICATION_REQUIRED');
      }
      const previous = context.packageJournalIdentity;
      if (
        (previous === null && identity.previousJournalSha256 !== null) ||
        (previous !== null &&
          (identity.journalId !== previous.journalId ||
            identity.previousJournalSha256 !== previous.journalSha256 ||
            identity.journalSha256 === previous.journalSha256))
      ) {
        return reject(context, 'LOCAL_RECEIPT_DIVERGENT');
      }
      const next = nextContextWithEvent(context, event, [identity.journalId], {
        packageJournal: event.journal,
        packageJournalIdentity: identity,
      });
      return persistActor(context, next, ports);
    }

    if (event.type === 'PACKAGE_VALIDATED_INGESTED') {
      const identity = snapshotValidatorResult(ports.validatePackage(event.artifact, context), [
        'artifactId',
        'artifactSha256',
        'validatedAt',
      ]);
      const stableIds = [identity.artifactId];
      const delivery = duplicateOrDivergent(context, event, stableIds);
      if (delivery === 'duplicate') {
        return accepted(context, true);
      }
      if (delivery === 'divergent') {
        return reject(context, 'LOCAL_RECEIPT_DIVERGENT');
      }
      if (context.state !== 'rc_built' && context.state !== 'blocked') {
        return reject(context, 'EVENT_NOT_PERMITTED_FROM_STATE');
      }
      if (
        context.state === 'blocked' &&
        (event.recoveryObservationId === null ||
          event.recoveryObservationId === undefined ||
          context.lastLocalObservation?.valid !== true ||
          context.lastLocalObservation.observationId !== event.recoveryObservationId)
      ) {
        return reject(context, 'RESTART_OBSERVATION_INVALID');
      }
      if (context.state === 'blocked') {
        const recoveryObservation = context.lastLocalObservation;
        if (
          recoveryObservation === null ||
          recoveryObservation.valid !== true ||
          !ports.verifyRecoveredPackageObservation(
            event.artifact,
            recoveryObservation.observation,
            context
          )
        ) {
          return reject(context, 'PACKAGE_INVALID');
        }
      }
      if (context.transportObservation === null || context.payloadVerification === null) {
        return reject(context, 'PAYLOAD_VERIFICATION_REQUIRED');
      }
      if (context.packageJournal === null) {
        return reject(context, 'JOURNAL_INVALID');
      }
      const next = nextContextWithEvent(context, event, stableIds, {
        state: context.state === 'blocked' ? 'blocked' : 'package_validated',
        artifact: event.artifact,
      });
      const result = ports.transactionPort.publishArtifact(
        ports.authorizeTransactionRequest('publishArtifact', {
          actorId: context.actorId,
          expectedContextSha256: releaseContextSha256(context),
          expectedCatalogRevision: event.expectedCatalogRevision,
          nextContext: next,
          artifact: identity,
        })
      );
      return result.ok
        ? accepted(result.context, false)
        : reject(context, transactionFailureCode(result.code));
    }

    if (event.type === 'STORE_READINESS_INGESTED') {
      const store = snapshotValidatorResult(ports.validateStoreReadiness(event.store, context), [
        'receiptId',
      ]);
      const authorization = snapshotValidatorResult(
        ports.validateAuthorization(
          event.authorization,
          'mark_store_ready',
          context,
          event.ingestedAt
        ),
        ['authorizationId', 'replayRecord']
      );
      const stableIds = [store.receiptId, authorization.authorizationId];
      const delivery = duplicateOrDivergent(context, event, stableIds);
      if (delivery === 'duplicate') {
        return accepted(context, true);
      }
      if (delivery === 'divergent' || context.store !== null) {
        return reject(context, 'LOCAL_RECEIPT_DIVERGENT');
      }
      const next = nextContextWithEvent(context, event, stableIds, {
        state: 'store_ready',
        store: event.store,
        authorizations: [...context.authorizations, event.authorization],
      });
      return persistProtectedEvent(
        context,
        next,
        event.expectedRegistryRevision,
        [authorization.replayRecord],
        ports
      );
    }

    if (event.type === 'SUBMISSION_RECEIPT_INGESTED') {
      const receipt = snapshotValidatorResult(
        ports.validateSubmissionReceipt(event.receipt, context),
        ['receiptId', 'replayRecord']
      );
      const authorization = snapshotValidatorResult(
        ports.validateAuthorization(
          event.authorization,
          'ingest_submission',
          context,
          event.ingestedAt
        ),
        ['authorizationId', 'replayRecord']
      );
      const stableIds = [receipt.receiptId, authorization.authorizationId];
      const delivery = duplicateOrDivergent(context, event, stableIds);
      if (delivery === 'duplicate') {
        return accepted(context, true);
      }
      if (delivery === 'divergent') {
        return reject(context, 'LOCAL_RECEIPT_DIVERGENT');
      }
      if (context.submission !== null) {
        return reject(context, 'SUBMISSION_ALREADY_SET');
      }
      const next = nextContextWithEvent(context, event, stableIds, {
        submission: event.receipt,
        authorizations: [...context.authorizations, event.authorization],
      });
      return persistProtectedEvent(
        context,
        next,
        event.expectedRegistryRevision,
        [authorization.replayRecord, receipt.replayRecord],
        ports
      );
    }

    if (event.type === 'CANARY_PASS_RECEIPT_INGESTED') {
      const receipt = snapshotValidatorResult(
        ports.validateCanaryPassReceipt(event.receipt, context),
        ['receiptId', 'replayRecord']
      );
      const authorization = snapshotValidatorResult(
        ports.validateAuthorization(
          event.authorization,
          'ingest_canary_pass',
          context,
          event.ingestedAt
        ),
        ['authorizationId', 'replayRecord']
      );
      const stableIds = [receipt.receiptId, authorization.authorizationId];
      const delivery = duplicateOrDivergent(context, event, stableIds);
      if (delivery === 'duplicate') {
        return accepted(context, true);
      }
      if (delivery === 'divergent' || context.canaryPass !== null) {
        return reject(context, 'LOCAL_RECEIPT_DIVERGENT');
      }
      if (context.submission === null) {
        return reject(context, 'EXTERNAL_RECEIPT_INVALID');
      }
      const next = nextContextWithEvent(context, event, stableIds, {
        state: 'canary',
        canaryPass: event.receipt,
        authorizations: [...context.authorizations, event.authorization],
      });
      return persistProtectedEvent(
        context,
        next,
        event.expectedRegistryRevision,
        [authorization.replayRecord, receipt.replayRecord],
        ports
      );
    }

    if (event.type === 'PRODUCTION_PROMOTION_RECEIPT_INGESTED') {
      const receipt = snapshotValidatorResult(
        ports.validateProductionPromotionReceipt(event.receipt, context),
        ['receiptId', 'replayRecord']
      );
      const authorization = snapshotValidatorResult(
        ports.validateAuthorization(
          event.authorization,
          'ingest_production_promotion',
          context,
          event.ingestedAt
        ),
        ['authorizationId', 'replayRecord']
      );
      const stableIds = [receipt.receiptId, authorization.authorizationId];
      const delivery = duplicateOrDivergent(context, event, stableIds);
      if (delivery === 'duplicate') {
        return accepted(context, true);
      }
      if (delivery === 'divergent' || context.productionPromotion !== null) {
        return reject(context, 'LOCAL_RECEIPT_DIVERGENT');
      }
      const next = nextContextWithEvent(context, event, stableIds, {
        state: 'production',
        productionPromotion: event.receipt,
        authorizations: [...context.authorizations, event.authorization],
      });
      return persistProtectedEvent(
        context,
        next,
        event.expectedRegistryRevision,
        [authorization.replayRecord, receipt.replayRecord],
        ports
      );
    }

    if (event.type === 'ROLLBACK_RECEIPT_INGESTED') {
      const receipt = snapshotValidatorResult(
        ports.validateRollbackReceipt(event.receipt, context),
        ['receiptId', 'replayRecord']
      );
      const authorization = snapshotValidatorResult(
        ports.validateAuthorization(
          event.authorization,
          'ingest_rollback',
          context,
          event.ingestedAt
        ),
        ['authorizationId', 'replayRecord']
      );
      const stableIds = [receipt.receiptId, authorization.authorizationId];
      const delivery = duplicateOrDivergent(context, event, stableIds);
      if (delivery === 'duplicate') {
        return accepted(context, true);
      }
      if (delivery === 'divergent' || context.rollback !== null) {
        return reject(context, 'LOCAL_RECEIPT_DIVERGENT');
      }
      const next = nextContextWithEvent(context, event, stableIds, {
        state: 'rolled_back',
        rollback: event.receipt,
        authorizations: [...context.authorizations, event.authorization],
      });
      return persistProtectedEvent(
        context,
        next,
        event.expectedRegistryRevision,
        [authorization.replayRecord, receipt.replayRecord],
        ports
      );
    }

    if (event.type === 'SERVICE_RESTARTED') {
      if (
        event.releaseId !== context.candidate.releaseId ||
        !ports.validateRestart(event, context)
      ) {
        return reject(context, 'RESTART_OBSERVATION_INVALID');
      }
      const delivery = duplicateOrDivergent(context, event, [event.restartId]);
      if (delivery === 'duplicate') {
        return accepted(context, true);
      }
      if (delivery === 'divergent' || context.pendingRestart !== null) {
        return reject(context, 'LOCAL_RECEIPT_DIVERGENT');
      }
      const next = nextContextWithEvent(context, event, [event.restartId], {
        pendingRestart: {
          restartId: event.restartId,
          restartedAt: event.restartedAt,
        },
      });
      const persisted = persistActor(context, next, ports);
      if (persisted.accepted) {
        const commandId = `scan:${context.actorId}:${event.restartId}`;
        deliverPendingCommand(commandId, ports);
      }
      return persisted;
    }

    if (event.type === 'LOCAL_RELEASE_OBSERVATION_INGESTED') {
      const observation = snapshotValidatorResult(
        ports.validateLocalObservation(event.observation, context),
        ['error', 'observation', 'observationId', 'observationSha256', 'restartId', 'valid']
      );
      const delivery = duplicateOrDivergent(context, event, [observation.observationId]);
      if (delivery === 'duplicate') {
        return accepted(context, true);
      }
      if (
        delivery === 'divergent' ||
        context.pendingRestart === null ||
        observation.restartId !== context.pendingRestart.restartId
      ) {
        return reject(context, 'RESTART_OBSERVATION_INVALID');
      }
      const blocksLocalState = ['audited', 'rc_built', 'package_validated', 'store_ready'].includes(
        context.state
      );
      const next = nextContextWithEvent(context, event, [observation.observationId], {
        state: !observation.valid && blocksLocalState ? 'blocked' : context.state,
        pendingRestart: null,
        lastLocalObservation: observation.valid ? observation : null,
        lastError: observation.valid ? context.lastError : observation.error,
      });
      return persistActor(context, next, ports);
    }

    if (event.type === 'NEW_CANDIDATE_INGESTED') {
      const replacement = snapshotValidatorResult(
        ports.validateCandidateReplacement(event.candidate, event.audit, context),
        ['audit', 'candidate']
      );
      const closureProof = deriveCandidateReplacementClosureProof(
        context,
        ports.transactionPort.readCatalog(),
        replacement.candidate.releaseNamespace
      );
      if (closureProof === null) {
        return reject(context, 'CANDIDATE_REPLACEMENT_UNSAFE');
      }
      const candidate = replacement.candidate;
      const audit = replacement.audit;
      if (
        candidate.releaseId === context.candidate.releaseId ||
        audit.releaseId !== candidate.releaseId ||
        audit.sourceCommit !== candidate.sourceCommit ||
        audit.committedVersion !== candidate.committedVersion ||
        audit.releaseNamespace !== candidate.releaseNamespace ||
        audit.mv3ScenarioInventoryBlobSha256 !== candidate.mv3ScenarioInventoryBlobSha256 ||
        audit.expectedMv3ScenarioInventorySha256 !== candidate.expectedMv3ScenarioInventorySha256 ||
        Date.parse(audit.recordedAt) > Date.parse(event.catalogedAt)
      ) {
        return reject(context, 'IDENTITY_MISMATCH');
      }
      const replacementRecord: AcceptedLocalEventV1 = {
        eventType: event.type,
        stableIds: [candidate.releaseId, audit.receiptId],
        eventSha256: eventDigest(event),
      };
      const archivedContext = snapshot({
        ...context,
        candidateHistory: [] as readonly ArchivedCandidateV1[],
      });
      const next = snapshot({
        state: 'audited' as const,
        actorId: context.actorId,
        candidate,
        audit,
        seal: null,
        sealIdentity: null,
        transportObservation: null,
        payloadVerification: null,
        packageJournal: null,
        packageJournalIdentity: null,
        artifact: null,
        store: null,
        authorizations: [],
        submission: null,
        canaryPass: null,
        productionPromotion: null,
        rollback: null,
        pendingRestart: null,
        lastLocalObservation: null,
        candidateHistory: [
          ...context.candidateHistory,
          {
            candidate: context.candidate,
            audit: context.audit,
            archivedAt: event.catalogedAt,
            contextSha256: releaseContextSha256(context),
            context: archivedContext,
          },
        ],
        lastError: null,
        acceptedLocalEvents: [replacementRecord],
      });
      const result = ports.transactionPort.replaceCandidate(
        ports.authorizeTransactionRequest('replaceCandidate', {
          actorId: context.actorId,
          expectedContextSha256: releaseContextSha256(context),
          expectedCatalogRevision: event.expectedCatalogRevision,
          catalogedAt: event.catalogedAt,
          closureProof,
          nextContext: next,
        })
      );
      return result.ok
        ? accepted(result.context, false)
        : reject(context, transactionFailureCode(result.code));
    }

    if (event.type === 'BLOCKERS_INGESTED' || event.type === 'LOCAL_EVIDENCE_INVALIDATED') {
      const delivery = duplicateOrDivergent(context, event, []);
      if (delivery === 'duplicate') {
        return accepted(context, true);
      }
      const next = nextContextWithEvent(context, event, [], {
        state:
          context.state === 'canary' || context.state === 'production' ? context.state : 'blocked',
        lastError: event.error,
      });
      return persistActor(context, next, ports);
    }

    return reject(context, 'EVENT_NOT_PERMITTED_FROM_STATE');
  } catch {
    switch (event.type) {
      case 'RC_SEAL_INGESTED':
        return reject(context, 'SEAL_INVALID');
      case 'RELEASE_PAYLOAD_VERIFIED_INGESTED':
        return reject(context, 'PAYLOAD_VERIFICATION_INVALID');
      case 'PACKAGE_JOURNAL_INGESTED':
        return reject(context, 'JOURNAL_INVALID');
      case 'PACKAGE_VALIDATED_INGESTED':
        return reject(context, 'PACKAGE_INVALID');
      case 'STORE_READINESS_INGESTED':
      case 'SUBMISSION_RECEIPT_INGESTED':
      case 'CANARY_PASS_RECEIPT_INGESTED':
      case 'PRODUCTION_PROMOTION_RECEIPT_INGESTED':
      case 'ROLLBACK_RECEIPT_INGESTED':
        return reject(context, 'EXTERNAL_RECEIPT_INVALID');
      case 'SERVICE_RESTARTED':
      case 'LOCAL_RELEASE_OBSERVATION_INGESTED':
        return reject(context, 'RESTART_OBSERVATION_INVALID');
      case 'NEW_CANDIDATE_INGESTED':
        return reject(context, 'IDENTITY_MISMATCH');
      default:
        return reject(context, 'EVENT_NOT_PERMITTED_FROM_STATE');
    }
  }
}
