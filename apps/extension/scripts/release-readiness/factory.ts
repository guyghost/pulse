import { TextDecoder } from 'node:util';

import {
  compareCanonicalSemVer,
  computeCatalogSha256,
  computePolicySha256,
  parseAuditReceipt,
  parseCandidateIdentity,
  parseCanonicalSemVer,
  parseGlobalReleaseCatalog,
  type AuditReceiptV1,
  type CandidateIdentityV1,
  type GlobalReleaseCatalogRecordV1,
  type GlobalReleaseCatalogV1,
} from './contracts';
import { jcsCanonicalize, sha256Hex, sha256Jcs } from './canonical';
import {
  drainReleaseReadinessCommandOutbox,
  reduceReleaseReadiness,
  type ReleaseReadinessContextV1,
  type ReleaseReadinessEvent,
  type ReleaseReadinessOutboxDrainResultV1,
  type ReleaseReadinessReducerPorts,
  type ReleaseReadinessReduction,
} from './reducer';
import { inspectPrivilegedWorkflow } from './workflow-policy';
import {
  deriveCandidateReplacementClosureProof,
  type CandidateReplacementClosureProofV1,
} from './replacement-closure';
import {
  parseReleaseCommandDeliveryReceipt,
  type ReleaseReadinessCommandDeliveryReceiptV1,
} from './command-delivery';
export {
  computeReleaseCommandDeliveryReceiptSha256,
  parseReleaseCommandDeliveryReceipt,
  type ReleaseReadinessCommandDeliveryReceiptV1,
} from './command-delivery';
import { resolveIncludedConnectors, type ConnectorConfig } from '../resolve-connectors';
import {
  appendGlobalReplayRecords,
  createEmptyGlobalReplayRegistry,
  parseGlobalReplayRegistry,
  type GlobalReplayRecordV1,
  type GlobalReplayRegistryV1,
} from './replay-registry';

const GIT_PATHS = {
  package: 'apps/extension/package.json',
  sourceManifest: 'apps/extension/src/manifest.json',
  connectorConfig: 'apps/extension/connectors.config.json',
  connectorAuthorities:
    'apps/extension/scripts/release-readiness/policies/connector-authorities.v1.json',
  scenarioInventory: 'apps/extension/tests/mv3/scenarios.v1.json',
  workflow: '.github/workflows/ci.yml',
  lockfile: 'pnpm-lock.yaml',
  transportPolicy:
    'apps/extension/scripts/release-readiness/policies/transport-attestation-policy.v1.json',
  trustedRoot: 'apps/extension/scripts/release-readiness/policies/github-trusted-root.v1.json',
  authorizationPolicy:
    'apps/extension/scripts/release-readiness/policies/authorization-policy.v1.json',
  externalReceiptPolicy:
    'apps/extension/scripts/release-readiness/policies/external-receipt-policy.v1.json',
} as const;

type CandidateGitPath = (typeof GIT_PATHS)[keyof typeof GIT_PATHS];

export interface IncludedConnectorAuthorityV1 {
  readonly id: string;
  readonly hostPermissions: readonly string[];
}

export interface ReleaseCandidateSourcePort {
  readGitBlob(request: {
    readonly sourceCommit: string;
    readonly gitTreeObjectId: string;
    readonly path: CandidateGitPath;
  }): Uint8Array | null;
  readBuiltManifest(request: {
    readonly sourceCommit: string;
    readonly gitTreeObjectId: string;
  }): Uint8Array | null;
}

export interface ReleaseCandidateSeedV1 {
  readonly releaseId: string;
  readonly sourceCommit: string;
  readonly gitObjectFormat: 'sha1' | 'sha256';
  readonly gitTreeObjectId: string;
  readonly mv3ScenarioInventoryPath: 'apps/extension/tests/mv3/scenarios.v1.json';
}

export interface ValidatedArtifactPublicationV1 {
  readonly artifactId: string;
  readonly artifactSha256: string;
  readonly validatedAt: string;
}

export type ReleaseTransactionFailureCode =
  | 'ACTOR_INITIALIZATION_INVALID'
  | 'ACTOR_ALREADY_EXISTS'
  | 'ACTOR_CAS_CONFLICT'
  | 'ACTOR_AUTHORITY_REQUIRED'
  | 'ACTOR_HISTORY_REWRITE'
  | 'RELEASE_CATALOG_CAS_CONFLICT'
  | 'RELEASE_CATALOG_CAPACITY_EXHAUSTED'
  | 'RELEASE_ID_REUSED'
  | 'VERSION_NAMESPACE_REUSED'
  | 'VERSION_PRECEDENCE_REJECTED'
  | 'ACTIVE_RESERVATION_MISSING'
  | 'CANDIDATE_REPLACEMENT_UNSAFE'
  | 'GLOBAL_REPLAY_CAS_CONFLICT'
  | 'GLOBAL_REPLAY_CAPACITY_EXHAUSTED'
  | 'GLOBAL_REPLAY_DIVERGENT'
  | 'COMMAND_OUTBOX_CAPACITY_EXHAUSTED';

type ReleaseTransactionResult =
  | { readonly ok: true; readonly context: ReleaseReadinessContextV1 }
  | { readonly ok: false; readonly code: ReleaseTransactionFailureCode };

export type ReleaseTransactionOperation =
  | 'reserveCandidate'
  | 'commitActor'
  | 'publishArtifact'
  | 'replaceCandidate'
  | 'commitProtectedEvent'
  | 'acknowledgeCommand';

interface ReleaseTransactionAuthorizationV1 {
  readonly transactionPort: ReleaseReadinessTransactionPort;
  readonly operation: ReleaseTransactionOperation;
}

const AUTHORIZED_RELEASE_TRANSACTION_REQUESTS = new WeakMap<
  object,
  ReleaseTransactionAuthorizationV1
>();

/**
 * Transaction ports consume an exact one-shot request identity. Importers can
 * observe or forward that frozen request, but cannot derive reusable authority
 * for another request from it.
 */
export function consumeReleaseTransactionAuthorization(
  transactionPort: ReleaseReadinessTransactionPort,
  operation: ReleaseTransactionOperation,
  request: object
): boolean {
  const authorization = AUTHORIZED_RELEASE_TRANSACTION_REQUESTS.get(request);
  if (
    authorization === undefined ||
    authorization.transactionPort !== transactionPort ||
    authorization.operation !== operation
  ) {
    return false;
  }
  AUTHORIZED_RELEASE_TRANSACTION_REQUESTS.delete(request);
  return true;
}

function freezeTransactionValue(value: unknown, seen = new WeakSet<object>()): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return;
  }
  if (seen.has(value)) {
    throw new ReleaseCandidateFactoryError('Transaction request contains a cycle.');
  }
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ReleaseCandidateFactoryError('Transaction request must contain plain JCS data.');
  }
  seen.add(value);
  for (const child of Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>)) {
    freezeTransactionValue(child, seen);
  }
  seen.delete(value);
  Object.freeze(value);
}

function createTransactionAuthorizationScope(transactionPort: ReleaseReadinessTransactionPort): {
  readonly authorize: <T extends object>(operation: ReleaseTransactionOperation, request: T) => T;
  readonly revoke: () => void;
} {
  const requests = new Set<object>();
  return {
    authorize<T extends object>(operation: ReleaseTransactionOperation, request: T): T {
      const frozen = structuredClone(request);
      freezeTransactionValue(frozen);
      AUTHORIZED_RELEASE_TRANSACTION_REQUESTS.set(frozen, { transactionPort, operation });
      requests.add(frozen);
      return frozen;
    },
    revoke(): void {
      for (const request of requests) {
        AUTHORIZED_RELEASE_TRANSACTION_REQUESTS.delete(request);
      }
      requests.clear();
    },
  };
}

export type ReleaseReadinessValidationPorts = Omit<
  ReleaseReadinessReducerPorts,
  'authorizeTransactionRequest' | 'transactionPort'
>;

export interface ReleaseReadinessControllerV1 {
  reduce(
    context: ReleaseReadinessContextV1,
    event: ReleaseReadinessEvent
  ): ReleaseReadinessReduction;
  drainOutbox(): ReleaseReadinessOutboxDrainResultV1;
}

export function createReleaseReadinessController(
  transactionPort: ReleaseReadinessTransactionPort,
  validationPorts: ReleaseReadinessValidationPorts
): ReleaseReadinessControllerV1 {
  const basePorts = Object.freeze({
    ...validationPorts,
    transactionPort,
  });
  const withAuthorizationScope = <T>(operation: (ports: ReleaseReadinessReducerPorts) => T): T => {
    const scope = createTransactionAuthorizationScope(transactionPort);
    const ports: ReleaseReadinessReducerPorts = Object.freeze({
      ...basePorts,
      authorizeTransactionRequest: scope.authorize,
    });
    try {
      return operation(ports);
    } finally {
      scope.revoke();
    }
  };
  return Object.freeze({
    reduce(context: ReleaseReadinessContextV1, event: ReleaseReadinessEvent) {
      return withAuthorizationScope((ports) => reduceReleaseReadiness(context, event, ports));
    },
    drainOutbox() {
      return withAuthorizationScope((ports) => drainReleaseReadinessCommandOutbox(ports));
    },
  });
}

export interface ReserveCandidateRequestV1 {
  readonly expectedCatalogRevision: number;
  readonly admittedAt: string;
  readonly context: ReleaseReadinessContextV1;
}

export interface CommitActorRequestV1 {
  readonly actorId: string;
  readonly expectedContextSha256: string;
  readonly nextContext: ReleaseReadinessContextV1;
}

export interface PublishArtifactRequestV1 extends CommitActorRequestV1 {
  readonly expectedCatalogRevision: number;
  readonly artifact: ValidatedArtifactPublicationV1;
}

export interface ReplaceCandidateRequestV1 extends CommitActorRequestV1 {
  readonly expectedCatalogRevision: number;
  readonly catalogedAt: string;
  readonly closureProof: CandidateReplacementClosureProofV1;
}

export interface CommitProtectedEventRequestV1 extends CommitActorRequestV1 {
  readonly expectedRegistryRevision: number;
  readonly replayRecords: readonly GlobalReplayRecordV1[];
}

export interface ReleaseReadinessOutboxCommandV1 {
  readonly commandId: string;
  readonly type: 'SCAN_LOCAL_RELEASE_FILES';
  readonly actorId: string;
  readonly releaseId: string;
  readonly restartId: string;
  readonly createdAt: string;
}

export interface AcknowledgeReleaseCommandRequestV1 {
  readonly commandId: string;
  readonly deliveryReceipt: ReleaseReadinessCommandDeliveryReceiptV1;
}

export interface ReleaseReadinessTransactionPort {
  readCatalog(): GlobalReleaseCatalogV1;
  readReplayRegistry(): GlobalReplayRegistryV1;
  readPendingCommands(): readonly ReleaseReadinessOutboxCommandV1[];
  readCommandDeliveries(): readonly ReleaseReadinessCommandDeliveryReceiptV1[];
  readActor(actorId: string): ReleaseReadinessContextV1 | null;
  reserveCandidate(request: ReserveCandidateRequestV1): ReleaseTransactionResult;
  commitActor(request: CommitActorRequestV1): ReleaseTransactionResult;
  publishArtifact(request: PublishArtifactRequestV1): ReleaseTransactionResult;
  replaceCandidate(request: ReplaceCandidateRequestV1): ReleaseTransactionResult;
  commitProtectedEvent(request: CommitProtectedEventRequestV1): ReleaseTransactionResult;
  acknowledgeCommand(request: AcknowledgeReleaseCommandRequestV1): boolean;
}

interface InMemoryState {
  readonly catalog: GlobalReleaseCatalogV1;
  readonly replayRegistry: GlobalReplayRegistryV1;
  readonly outbox: readonly ReleaseReadinessOutboxCommandV1[];
  readonly commandDeliveries: readonly ReleaseReadinessCommandDeliveryReceiptV1[];
  readonly actors: ReadonlyMap<string, ReleaseReadinessContextV1>;
}

const MAX_RELEASE_COMMAND_OUTBOX = 1_024;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function outboxCommandForTransition(
  current: ReleaseReadinessContextV1,
  next: ReleaseReadinessContextV1
): ReleaseReadinessOutboxCommandV1 | null {
  const acceptedEvent = next.acceptedLocalEvents.at(-1);
  if (
    acceptedEvent?.eventType !== 'SERVICE_RESTARTED' ||
    next.pendingRestart === null ||
    current.pendingRestart !== null
  ) {
    return null;
  }
  return {
    commandId: `scan:${current.actorId}:${next.pendingRestart.restartId}`,
    type: 'SCAN_LOCAL_RELEASE_FILES',
    actorId: current.actorId,
    releaseId: current.candidate.releaseId,
    restartId: next.pendingRestart.restartId,
    createdAt: next.pendingRestart.restartedAt,
  };
}

export function releaseContextSha256(context: ReleaseReadinessContextV1): string {
  return sha256Jcs(context);
}

export function isExactPersistedContextTransition(
  current: ReleaseReadinessContextV1,
  next: ReleaseReadinessContextV1,
  mode: 'actor' | 'publication' | 'protected' | 'replacement'
): boolean {
  if (mode === 'replacement') {
    const acceptedEvent = next.acceptedLocalEvents.at(-1);
    const archived = next.candidateHistory.at(-1);
    if (
      current.state !== 'blocked' ||
      current.pendingRestart !== null ||
      next.actorId !== current.actorId ||
      next.state !== 'audited' ||
      next.candidate.releaseId === current.candidate.releaseId ||
      next.candidateHistory.length !== current.candidateHistory.length + 1 ||
      jcsCanonicalize(next.candidateHistory.slice(0, -1)) !==
        jcsCanonicalize(current.candidateHistory) ||
      acceptedEvent?.eventType !== 'NEW_CANDIDATE_INGESTED' ||
      next.acceptedLocalEvents.length !== 1 ||
      archived === undefined ||
      archived.contextSha256 !== releaseContextSha256(current) ||
      jcsCanonicalize(archived.candidate) !== jcsCanonicalize(current.candidate) ||
      jcsCanonicalize(archived.audit) !== jcsCanonicalize(current.audit) ||
      jcsCanonicalize(archived.context) !== jcsCanonicalize({ ...current, candidateHistory: [] }) ||
      next.audit.releaseId !== next.candidate.releaseId ||
      next.audit.sourceCommit !== next.candidate.sourceCommit ||
      next.audit.committedVersion !== next.candidate.committedVersion ||
      next.audit.releaseNamespace !== next.candidate.releaseNamespace
    ) {
      return false;
    }
    const expected: ReleaseReadinessContextV1 = {
      state: 'audited',
      actorId: current.actorId,
      candidate: next.candidate,
      audit: next.audit,
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
      candidateHistory: next.candidateHistory,
      lastError: null,
      acceptedLocalEvents: next.acceptedLocalEvents,
    };
    return jcsCanonicalize(next) === jcsCanonicalize(expected);
  }
  const historyExtends =
    next.actorId === current.actorId &&
    jcsCanonicalize(next.candidate) === jcsCanonicalize(current.candidate) &&
    jcsCanonicalize(next.audit) === jcsCanonicalize(current.audit) &&
    next.acceptedLocalEvents.length === current.acceptedLocalEvents.length + 1 &&
    jcsCanonicalize(next.acceptedLocalEvents.slice(0, -1)) ===
      jcsCanonicalize(current.acceptedLocalEvents);
  if (!historyExtends) {
    return false;
  }
  const acceptedEvent = next.acceptedLocalEvents.at(-1);
  if (acceptedEvent === undefined) {
    return false;
  }
  if (
    !/^[0-9a-f]{64}$/.test(acceptedEvent.eventSha256) ||
    new Set(acceptedEvent.stableIds).size !== acceptedEvent.stableIds.length ||
    acceptedEvent.stableIds.some(
      (stableId) => !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(stableId)
    ) ||
    (current.pendingRestart !== null &&
      acceptedEvent.eventType !== 'LOCAL_RELEASE_OBSERVATION_INGESTED')
  ) {
    return false;
  }
  const base = {
    ...current,
    acceptedLocalEvents: next.acceptedLocalEvents,
  };
  let expected: ReleaseReadinessContextV1;
  switch (acceptedEvent.eventType) {
    case 'RC_SEAL_INGESTED':
      if (
        mode !== 'actor' ||
        current.state !== 'audited' ||
        current.seal !== null ||
        current.sealIdentity !== null ||
        next.seal === null ||
        next.sealIdentity === null
      ) {
        return false;
      }
      expected = {
        ...base,
        state: 'rc_built',
        seal: next.seal,
        sealIdentity: next.sealIdentity,
        lastError: null,
      };
      break;
    case 'RELEASE_PAYLOAD_VERIFIED_INGESTED':
      if (
        mode !== 'actor' ||
        current.state !== 'rc_built' ||
        current.transportObservation !== null ||
        current.payloadVerification !== null ||
        next.transportObservation === null ||
        next.payloadVerification === null
      ) {
        return false;
      }
      expected = {
        ...base,
        transportObservation: next.transportObservation,
        payloadVerification: next.payloadVerification,
      };
      break;
    case 'PACKAGE_JOURNAL_INGESTED':
      if (
        mode !== 'actor' ||
        (current.state !== 'rc_built' && current.state !== 'blocked') ||
        next.packageJournal === null ||
        next.packageJournalIdentity === null
      ) {
        return false;
      }
      expected = {
        ...base,
        state: current.state,
        packageJournal: next.packageJournal,
        packageJournalIdentity: next.packageJournalIdentity,
      };
      break;
    case 'PACKAGE_VALIDATED_INGESTED':
      if (
        mode !== 'publication' ||
        (current.state !== 'rc_built' && current.state !== 'blocked') ||
        current.packageJournal === null ||
        next.artifact === null
      ) {
        return false;
      }
      expected = {
        ...base,
        state: current.state === 'blocked' ? 'blocked' : 'package_validated',
        artifact: next.artifact,
      };
      break;
    case 'STORE_READINESS_INGESTED':
      if (
        mode !== 'protected' ||
        current.state !== 'package_validated' ||
        current.store !== null ||
        next.store === null ||
        next.authorizations.length !== current.authorizations.length + 1 ||
        jcsCanonicalize(next.authorizations.slice(0, -1)) !==
          jcsCanonicalize(current.authorizations)
      ) {
        return false;
      }
      expected = {
        ...base,
        state: 'store_ready',
        store: next.store,
        authorizations: next.authorizations,
      };
      break;
    case 'SUBMISSION_RECEIPT_INGESTED':
      if (
        mode !== 'protected' ||
        current.state !== 'store_ready' ||
        current.submission !== null ||
        next.submission === null ||
        next.authorizations.length !== current.authorizations.length + 1 ||
        jcsCanonicalize(next.authorizations.slice(0, -1)) !==
          jcsCanonicalize(current.authorizations)
      ) {
        return false;
      }
      expected = {
        ...base,
        submission: next.submission,
        authorizations: next.authorizations,
      };
      break;
    case 'CANARY_PASS_RECEIPT_INGESTED':
      if (
        mode !== 'protected' ||
        current.state !== 'store_ready' ||
        current.submission === null ||
        current.canaryPass !== null ||
        next.canaryPass === null ||
        next.authorizations.length !== current.authorizations.length + 1 ||
        jcsCanonicalize(next.authorizations.slice(0, -1)) !==
          jcsCanonicalize(current.authorizations)
      ) {
        return false;
      }
      expected = {
        ...base,
        state: 'canary',
        canaryPass: next.canaryPass,
        authorizations: next.authorizations,
      };
      break;
    case 'PRODUCTION_PROMOTION_RECEIPT_INGESTED':
      if (
        mode !== 'protected' ||
        current.state !== 'canary' ||
        current.productionPromotion !== null ||
        next.productionPromotion === null ||
        next.authorizations.length !== current.authorizations.length + 1 ||
        jcsCanonicalize(next.authorizations.slice(0, -1)) !==
          jcsCanonicalize(current.authorizations)
      ) {
        return false;
      }
      expected = {
        ...base,
        state: 'production',
        productionPromotion: next.productionPromotion,
        authorizations: next.authorizations,
      };
      break;
    case 'ROLLBACK_RECEIPT_INGESTED':
      if (
        mode !== 'protected' ||
        (current.state !== 'canary' && current.state !== 'production') ||
        current.rollback !== null ||
        next.rollback === null ||
        next.authorizations.length !== current.authorizations.length + 1 ||
        jcsCanonicalize(next.authorizations.slice(0, -1)) !==
          jcsCanonicalize(current.authorizations)
      ) {
        return false;
      }
      expected = {
        ...base,
        state: 'rolled_back',
        rollback: next.rollback,
        authorizations: next.authorizations,
      };
      break;
    case 'SERVICE_RESTARTED':
      if (
        mode !== 'actor' ||
        current.pendingRestart !== null ||
        next.pendingRestart === null ||
        acceptedEvent.stableIds.length !== 1 ||
        acceptedEvent.stableIds[0] !== next.pendingRestart.restartId
      ) {
        return false;
      }
      expected = { ...base, pendingRestart: next.pendingRestart };
      break;
    case 'LOCAL_RELEASE_OBSERVATION_INGESTED': {
      if (
        mode !== 'actor' ||
        current.pendingRestart === null ||
        next.pendingRestart !== null ||
        acceptedEvent.stableIds.length !== 1
      ) {
        return false;
      }
      if (next.lastLocalObservation?.valid === true) {
        if (
          next.lastLocalObservation.restartId !== current.pendingRestart.restartId ||
          next.state !== current.state
        ) {
          return false;
        }
        expected = {
          ...base,
          pendingRestart: null,
          lastLocalObservation: next.lastLocalObservation,
        };
      } else {
        const diagnosticState =
          current.state === 'blocked' ||
          current.state === 'canary' ||
          current.state === 'production' ||
          current.state === 'rolled_back';
        if (next.lastLocalObservation !== null || next.lastError === null) {
          return false;
        }
        expected = {
          ...base,
          state: diagnosticState ? current.state : 'blocked',
          pendingRestart: null,
          lastLocalObservation: null,
          lastError: next.lastError,
        };
      }
      break;
    }
    case 'BLOCKERS_INGESTED':
    case 'LOCAL_EVIDENCE_INVALIDATED':
      if (mode !== 'actor' || current.state === 'rolled_back' || next.lastError === null) {
        return false;
      }
      expected = {
        ...base,
        state:
          current.state === 'canary' || current.state === 'production' ? current.state : 'blocked',
        lastError: next.lastError,
      };
      break;
    default:
      return false;
  }
  return jcsCanonicalize(next) === jcsCanonicalize(expected);
}

function activeReservation(
  catalog: GlobalReleaseCatalogV1,
  candidate: CandidateIdentityV1
): GlobalReleaseCatalogRecordV1 | null {
  const records = catalog.records.filter((record) => record.releaseId === candidate.releaseId);
  if (records.length !== 1 || records[0]?.kind !== 'candidate_reserved') {
    return null;
  }
  const reservation = records[0];
  return reservation.releaseNamespace === candidate.releaseNamespace &&
    reservation.sourceCommit === candidate.sourceCommit &&
    reservation.committedVersion === candidate.committedVersion
    ? reservation
    : null;
}

function greatestPublishedVersion(catalog: GlobalReleaseCatalogV1): string | null {
  let greatest: string | null = null;
  for (const record of catalog.records) {
    if (
      record.kind === 'artifact_published' &&
      (greatest === null || compareCanonicalSemVer(record.committedVersion, greatest) > 0)
    ) {
      greatest = record.committedVersion;
    }
  }
  return greatest;
}

function versionCanPublish(catalog: GlobalReleaseCatalogV1, version: string): boolean {
  const greatest = greatestPublishedVersion(catalog);
  return greatest === null || compareCanonicalSemVer(version, greatest) > 0;
}

export function releaseNamespaceIsUnavailable(
  catalog: GlobalReleaseCatalogV1,
  releaseNamespace: string
): boolean {
  if (
    catalog.records.some(
      (record) =>
        record.releaseNamespace === releaseNamespace && record.kind === 'artifact_published'
    )
  ) {
    return true;
  }
  return catalog.records.some(
    (record) =>
      record.releaseNamespace === releaseNamespace &&
      record.kind === 'candidate_reserved' &&
      catalog.records.filter((candidate) => candidate.releaseId === record.releaseId).length === 1
  );
}

function isExactFactoryInitialContext(
  context: ReleaseReadinessContextV1,
  admittedAt: string
): boolean {
  try {
    const candidate = parseCandidateIdentity(context.candidate);
    const audit = parseAuditReceipt(context.audit);
    return (
      context.state === 'audited' &&
      context.actorId.length > 0 &&
      context.seal === null &&
      context.sealIdentity === null &&
      context.transportObservation === null &&
      context.payloadVerification === null &&
      context.packageJournal === null &&
      context.packageJournalIdentity === null &&
      context.artifact === null &&
      context.store === null &&
      context.authorizations.length === 0 &&
      context.submission === null &&
      context.canaryPass === null &&
      context.productionPromotion === null &&
      context.rollback === null &&
      context.pendingRestart === null &&
      context.lastLocalObservation === null &&
      context.candidateHistory.length === 0 &&
      context.lastError === null &&
      context.acceptedLocalEvents.length === 0 &&
      audit.releaseId === candidate.releaseId &&
      audit.sourceCommit === candidate.sourceCommit &&
      audit.committedVersion === candidate.committedVersion &&
      audit.releaseNamespace === candidate.releaseNamespace &&
      audit.mv3ScenarioInventoryBlobSha256 === candidate.mv3ScenarioInventoryBlobSha256 &&
      audit.expectedMv3ScenarioInventorySha256 === candidate.expectedMv3ScenarioInventorySha256 &&
      Number.isFinite(Date.parse(admittedAt)) &&
      Date.parse(audit.recordedAt) <= Date.parse(admittedAt)
    );
  } catch {
    return false;
  }
}

export function isAuthorizedFactoryReservation(request: ReserveCandidateRequestV1): boolean {
  return isExactFactoryInitialContext(request.context, request.admittedAt);
}

/** Test-only adapter. Production controllers must use the durable filesystem port. */
export class InMemoryReleaseReadinessTransactionPort implements ReleaseReadinessTransactionPort {
  #state: InMemoryState;

  constructor(
    initialCatalog: unknown,
    initialReplayRegistry: unknown = createEmptyGlobalReplayRegistry()
  ) {
    const catalog = clone(parseGlobalReleaseCatalog(initialCatalog));
    this.#state = {
      catalog,
      replayRegistry: clone(parseGlobalReplayRegistry(initialReplayRegistry)),
      outbox: [],
      commandDeliveries: [],
      actors: new Map(),
    };
  }

  readCatalog(): GlobalReleaseCatalogV1 {
    return clone(this.#state.catalog);
  }

  readReplayRegistry(): GlobalReplayRegistryV1 {
    return clone(this.#state.replayRegistry);
  }

  readPendingCommands(): readonly ReleaseReadinessOutboxCommandV1[] {
    return clone(this.#state.outbox);
  }

  readCommandDeliveries(): readonly ReleaseReadinessCommandDeliveryReceiptV1[] {
    return clone(this.#state.commandDeliveries);
  }

  readActor(actorId: string): ReleaseReadinessContextV1 | null {
    const actor = this.#state.actors.get(actorId);
    return actor === undefined ? null : clone(actor);
  }

  reserveCandidate(request: ReserveCandidateRequestV1): ReleaseTransactionResult {
    const { catalog, actors } = this.#state;
    const { context } = request;
    if (catalog.revision !== request.expectedCatalogRevision) {
      return { ok: false, code: 'RELEASE_CATALOG_CAS_CONFLICT' };
    }
    if (
      !consumeReleaseTransactionAuthorization(this, 'reserveCandidate', request) ||
      !isAuthorizedFactoryReservation(request)
    ) {
      return { ok: false, code: 'ACTOR_INITIALIZATION_INVALID' };
    }
    if (actors.has(context.actorId)) {
      return { ok: false, code: 'ACTOR_ALREADY_EXISTS' };
    }
    if (catalog.records.length >= 256) {
      return { ok: false, code: 'RELEASE_CATALOG_CAPACITY_EXHAUSTED' };
    }
    if (catalog.records.some((record) => record.releaseId === context.candidate.releaseId)) {
      return { ok: false, code: 'RELEASE_ID_REUSED' };
    }
    if (releaseNamespaceIsUnavailable(catalog, context.candidate.releaseNamespace)) {
      return { ok: false, code: 'VERSION_NAMESPACE_REUSED' };
    }
    if (!versionCanPublish(catalog, context.candidate.committedVersion)) {
      return { ok: false, code: 'VERSION_PRECEDENCE_REJECTED' };
    }

    const record: GlobalReleaseCatalogRecordV1 = {
      catalogSequence: catalog.records.length + 1,
      kind: 'candidate_reserved',
      actorId: context.actorId,
      releaseId: context.candidate.releaseId,
      sourceCommit: context.candidate.sourceCommit,
      committedVersion: context.candidate.committedVersion,
      releaseNamespace: context.candidate.releaseNamespace,
      artifactId: null,
      artifactSha256: null,
      recordedAt: request.admittedAt,
    };
    const nextCatalogValue = {
      ...catalog,
      revision: catalog.revision + 1,
      catalogSha256: '',
      records: [...catalog.records, record],
    };
    nextCatalogValue.catalogSha256 = computeCatalogSha256(nextCatalogValue);
    const nextCatalog = parseGlobalReleaseCatalog(nextCatalogValue);
    const nextActors = new Map(actors);
    nextActors.set(context.actorId, clone(context));
    this.#state = { ...this.#state, catalog: clone(nextCatalog), actors: nextActors };
    return { ok: true, context: clone(context) };
  }

  commitActor(request: CommitActorRequestV1): ReleaseTransactionResult {
    if (!consumeReleaseTransactionAuthorization(this, 'commitActor', request)) {
      return { ok: false, code: 'ACTOR_AUTHORITY_REQUIRED' };
    }
    const current = this.#state.actors.get(request.actorId);
    if (current === undefined || releaseContextSha256(current) !== request.expectedContextSha256) {
      return { ok: false, code: 'ACTOR_CAS_CONFLICT' };
    }
    if (!isExactPersistedContextTransition(current, request.nextContext, 'actor')) {
      return { ok: false, code: 'ACTOR_HISTORY_REWRITE' };
    }
    const command = outboxCommandForTransition(current, request.nextContext);
    const completedRestartCommandId =
      request.nextContext.acceptedLocalEvents.at(-1)?.eventType ===
        'LOCAL_RELEASE_OBSERVATION_INGESTED' &&
      current.pendingRestart !== null &&
      request.nextContext.pendingRestart === null
        ? `scan:${current.actorId}:${current.pendingRestart.restartId}`
        : null;
    if (
      command !== null &&
      (this.#state.outbox.length >= MAX_RELEASE_COMMAND_OUTBOX ||
        this.#state.outbox.some((entry) => entry.commandId === command.commandId))
    ) {
      return { ok: false, code: 'COMMAND_OUTBOX_CAPACITY_EXHAUSTED' };
    }
    const actors = new Map(this.#state.actors);
    actors.set(request.actorId, clone(request.nextContext));
    const retainedOutbox =
      completedRestartCommandId === null
        ? this.#state.outbox
        : this.#state.outbox.filter((entry) => entry.commandId !== completedRestartCommandId);
    this.#state = {
      ...this.#state,
      outbox: command === null ? retainedOutbox : [...retainedOutbox, command],
      actors,
    };
    return { ok: true, context: clone(request.nextContext) };
  }

  publishArtifact(request: PublishArtifactRequestV1): ReleaseTransactionResult {
    const { catalog, actors } = this.#state;
    if (!consumeReleaseTransactionAuthorization(this, 'publishArtifact', request)) {
      return { ok: false, code: 'ACTOR_AUTHORITY_REQUIRED' };
    }
    const current = actors.get(request.actorId);
    if (catalog.revision !== request.expectedCatalogRevision) {
      return { ok: false, code: 'RELEASE_CATALOG_CAS_CONFLICT' };
    }
    if (current === undefined || releaseContextSha256(current) !== request.expectedContextSha256) {
      return { ok: false, code: 'ACTOR_CAS_CONFLICT' };
    }
    if (!isExactPersistedContextTransition(current, request.nextContext, 'publication')) {
      return { ok: false, code: 'ACTOR_HISTORY_REWRITE' };
    }
    if (catalog.records.length >= 256) {
      return { ok: false, code: 'RELEASE_CATALOG_CAPACITY_EXHAUSTED' };
    }
    const candidate = current.candidate;
    const reservation = activeReservation(catalog, candidate);
    if (reservation === null || reservation.actorId !== request.actorId) {
      return { ok: false, code: 'ACTIVE_RESERVATION_MISSING' };
    }
    if (!versionCanPublish(catalog, candidate.committedVersion)) {
      return { ok: false, code: 'VERSION_PRECEDENCE_REJECTED' };
    }
    if (
      catalog.records.some(
        (record) =>
          record.releaseNamespace === candidate.releaseNamespace &&
          record.kind === 'artifact_published'
      )
    ) {
      return { ok: false, code: 'VERSION_NAMESPACE_REUSED' };
    }

    const publication: GlobalReleaseCatalogRecordV1 = {
      catalogSequence: catalog.records.length + 1,
      kind: 'artifact_published',
      actorId: request.actorId,
      releaseId: candidate.releaseId,
      sourceCommit: candidate.sourceCommit,
      committedVersion: candidate.committedVersion,
      releaseNamespace: candidate.releaseNamespace,
      artifactId: request.artifact.artifactId,
      artifactSha256: request.artifact.artifactSha256,
      recordedAt: request.artifact.validatedAt,
    };
    const nextCatalogValue = {
      ...catalog,
      revision: catalog.revision + 1,
      catalogSha256: '',
      records: [...catalog.records, publication],
    };
    nextCatalogValue.catalogSha256 = computeCatalogSha256(nextCatalogValue);
    const nextCatalog = parseGlobalReleaseCatalog(nextCatalogValue);
    const nextActors = new Map(actors);
    nextActors.set(request.actorId, clone(request.nextContext));
    this.#state = { ...this.#state, catalog: clone(nextCatalog), actors: nextActors };
    return { ok: true, context: clone(request.nextContext) };
  }

  commitProtectedEvent(request: CommitProtectedEventRequestV1): ReleaseTransactionResult {
    if (!consumeReleaseTransactionAuthorization(this, 'commitProtectedEvent', request)) {
      return { ok: false, code: 'ACTOR_AUTHORITY_REQUIRED' };
    }
    const current = this.#state.actors.get(request.actorId);
    if (current === undefined || releaseContextSha256(current) !== request.expectedContextSha256) {
      return { ok: false, code: 'ACTOR_CAS_CONFLICT' };
    }
    if (!isExactPersistedContextTransition(current, request.nextContext, 'protected')) {
      return { ok: false, code: 'ACTOR_HISTORY_REWRITE' };
    }
    const acceptedEvent = request.nextContext.acceptedLocalEvents.at(-1);
    const expectedActions: Partial<
      Record<
        ReleaseReadinessContextV1['acceptedLocalEvents'][number]['eventType'],
        readonly [authorization: string, external: string | null]
      >
    > = {
      STORE_READINESS_INGESTED: ['mark_store_ready', null],
      SUBMISSION_RECEIPT_INGESTED: ['ingest_submission', 'submission'],
      CANARY_PASS_RECEIPT_INGESTED: ['ingest_canary_pass', 'canary_pass'],
      PRODUCTION_PROMOTION_RECEIPT_INGESTED: [
        'ingest_production_promotion',
        'production_promotion',
      ],
      ROLLBACK_RECEIPT_INGESTED: ['ingest_rollback', 'rollback'],
    };
    const actions =
      acceptedEvent === undefined ? undefined : expectedActions[acceptedEvent.eventType];
    const authorization = request.replayRecords.find((record) => record.kind === 'authorization');
    const external = request.replayRecords.find((record) => record.kind === 'external_receipt');
    if (
      actions === undefined ||
      authorization === undefined ||
      authorization.action !== actions[0] ||
      authorization.releaseId !== current.candidate.releaseId ||
      (actions[1] === null
        ? request.replayRecords.length !== 1 || external !== undefined
        : request.replayRecords.length !== 2 ||
          external === undefined ||
          external.action !== actions[1] ||
          external.releaseId !== current.candidate.releaseId ||
          external.authorizedPayloadSha256 !== authorization.authorizedPayloadSha256) ||
      !request.replayRecords.every(
        (record) => acceptedEvent?.stableIds.includes(record.receiptId) === true
      )
    ) {
      return { ok: false, code: 'GLOBAL_REPLAY_DIVERGENT' };
    }
    const registryResult = appendGlobalReplayRecords(
      this.#state.replayRegistry,
      request.expectedRegistryRevision,
      request.replayRecords
    );
    if (!registryResult.ok) {
      return { ok: false, code: registryResult.code };
    }
    const actors = new Map(this.#state.actors);
    actors.set(request.actorId, clone(request.nextContext));
    this.#state = {
      ...this.#state,
      replayRegistry: clone(registryResult.registry),
      actors,
    };
    return { ok: true, context: clone(request.nextContext) };
  }

  acknowledgeCommand(request: AcknowledgeReleaseCommandRequestV1): boolean {
    if (!consumeReleaseTransactionAuthorization(this, 'acknowledgeCommand', request)) {
      return false;
    }
    const index = this.#state.outbox.findIndex(
      (command) => command.commandId === request.commandId
    );
    if (index < 0) {
      return false;
    }
    let receipt: ReleaseReadinessCommandDeliveryReceiptV1;
    try {
      receipt = parseReleaseCommandDeliveryReceipt(request.deliveryReceipt);
    } catch {
      return false;
    }
    const command = this.#state.outbox[index];
    const actor = command === undefined ? undefined : this.#state.actors.get(command.actorId);
    if (
      command === undefined ||
      actor?.pendingRestart?.restartId !== command.restartId ||
      receipt.commandId !== command.commandId ||
      receipt.actorId !== command.actorId ||
      receipt.releaseId !== command.releaseId ||
      receipt.restartId !== command.restartId ||
      Date.parse(receipt.durablyAcceptedAt) < Date.parse(command.createdAt) ||
      this.#state.commandDeliveries.some(
        (delivery) =>
          delivery.deliveryId === receipt.deliveryId || delivery.commandId === receipt.commandId
      )
    ) {
      return false;
    }
    this.#state = {
      ...this.#state,
      outbox: this.#state.outbox.filter((_, candidateIndex) => candidateIndex !== index),
      commandDeliveries: [...this.#state.commandDeliveries, receipt],
    };
    return true;
  }

  replaceCandidate(request: ReplaceCandidateRequestV1): ReleaseTransactionResult {
    const { catalog, actors } = this.#state;
    if (!consumeReleaseTransactionAuthorization(this, 'replaceCandidate', request)) {
      return { ok: false, code: 'ACTOR_AUTHORITY_REQUIRED' };
    }
    const current = actors.get(request.actorId);
    if (catalog.revision !== request.expectedCatalogRevision) {
      return { ok: false, code: 'RELEASE_CATALOG_CAS_CONFLICT' };
    }
    if (current === undefined || releaseContextSha256(current) !== request.expectedContextSha256) {
      return { ok: false, code: 'ACTOR_CAS_CONFLICT' };
    }
    if (!isExactPersistedContextTransition(current, request.nextContext, 'replacement')) {
      return { ok: false, code: 'ACTOR_HISTORY_REWRITE' };
    }
    const oldReservation = activeReservation(catalog, current.candidate);
    const closureProof = deriveCandidateReplacementClosureProof(
      current,
      catalog,
      request.nextContext.candidate.releaseNamespace
    );
    if (
      closureProof === null ||
      jcsCanonicalize(closureProof) !== jcsCanonicalize(request.closureProof)
    ) {
      return { ok: false, code: 'CANDIDATE_REPLACEMENT_UNSAFE' };
    }
    const oldPublished = closureProof.disposition === 'published';
    if (oldReservation === null && !oldPublished) {
      return { ok: false, code: 'ACTIVE_RESERVATION_MISSING' };
    }
    const candidate = request.nextContext.candidate;
    const appendedCount = oldReservation === null ? 1 : 2;
    if (catalog.records.length + appendedCount > 256) {
      return { ok: false, code: 'RELEASE_CATALOG_CAPACITY_EXHAUSTED' };
    }
    if (catalog.records.some((record) => record.releaseId === candidate.releaseId)) {
      return { ok: false, code: 'RELEASE_ID_REUSED' };
    }
    const namespaceOccupiedBeyondOld = catalog.records.some(
      (record) =>
        record.releaseNamespace === candidate.releaseNamespace &&
        (record.kind === 'artifact_published' ||
          (record.kind === 'candidate_reserved' &&
            record.releaseId !== current.candidate.releaseId &&
            catalog.records.filter((entry) => entry.releaseId === record.releaseId).length === 1))
    );
    if (namespaceOccupiedBeyondOld) {
      return { ok: false, code: 'VERSION_NAMESPACE_REUSED' };
    }
    if (!versionCanPublish(catalog, candidate.committedVersion)) {
      return { ok: false, code: 'VERSION_PRECEDENCE_REJECTED' };
    }
    const appended: GlobalReleaseCatalogRecordV1[] = [];
    if (oldReservation !== null) {
      appended.push({
        ...oldReservation,
        catalogSequence: catalog.records.length + 1,
        kind: 'candidate_abandoned',
        recordedAt: request.catalogedAt,
      });
    }
    appended.push({
      catalogSequence: catalog.records.length + appended.length + 1,
      kind: 'candidate_reserved',
      actorId: request.actorId,
      releaseId: candidate.releaseId,
      sourceCommit: candidate.sourceCommit,
      committedVersion: candidate.committedVersion,
      releaseNamespace: candidate.releaseNamespace,
      artifactId: null,
      artifactSha256: null,
      recordedAt: request.catalogedAt,
    });
    const nextCatalogValue = {
      ...catalog,
      revision: catalog.revision + 1,
      catalogSha256: '',
      records: [...catalog.records, ...appended],
    };
    nextCatalogValue.catalogSha256 = computeCatalogSha256(nextCatalogValue);
    const nextCatalog = parseGlobalReleaseCatalog(nextCatalogValue);
    const nextActors = new Map(actors);
    nextActors.set(request.actorId, clone(request.nextContext));
    this.#state = { ...this.#state, catalog: clone(nextCatalog), actors: nextActors };
    return { ok: true, context: clone(request.nextContext) };
  }
}

export class ReleaseCandidateFactoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseCandidateFactoryError';
  }
}

function strictUtf8(bytes: Uint8Array, label: string): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!Buffer.from(text).equals(Buffer.from(bytes)) || text.startsWith('\ufeff')) {
      throw new Error();
    }
    return text;
  } catch {
    throw new ReleaseCandidateFactoryError(`${label} is not exact BOM-free UTF-8.`);
  }
}

function parseJsonObject(bytes: Uint8Array, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(strictUtf8(bytes, label)) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ReleaseCandidateFactoryError) {
      throw error;
    }
    throw new ReleaseCandidateFactoryError(`${label} is not one JSON object.`);
  }
}

function parseExactJcsObject(bytes: Uint8Array, label: string): Record<string, unknown> {
  const parsed = parseJsonObject(bytes, label);
  if (!Buffer.from(jcsCanonicalize(parsed)).equals(Buffer.from(bytes))) {
    throw new ReleaseCandidateFactoryError(`${label} must be exact committed JCS.`);
  }
  return parsed;
}

function exactObjectKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function requiredGitBlob(
  seed: ReleaseCandidateSeedV1,
  sourcePort: ReleaseCandidateSourcePort,
  path: CandidateGitPath
): Uint8Array {
  const bytes = sourcePort.readGitBlob({
    sourceCommit: seed.sourceCommit,
    gitTreeObjectId: seed.gitTreeObjectId,
    path,
  });
  if (bytes === null) {
    throw new ReleaseCandidateFactoryError(`Missing exact Git blob ${path}.`);
  }
  return Buffer.from(bytes);
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new ReleaseCandidateFactoryError(`${label} must be a string array.`);
  }
  const result = [...value].sort();
  if (new Set(result).size !== result.length) {
    throw new ReleaseCandidateFactoryError(`${label} contains duplicates.`);
  }
  return result;
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

const FORBIDDEN_UNMODELLED_MANIFEST_CAPABILITIES = new Set([
  'content_scripts',
  'content_security_policy',
  'externally_connectable',
  'update_url',
]);

function deriveExpectedBuiltManifest(
  sourceManifest: Record<string, unknown>,
  hostPermissions: readonly string[]
): Record<string, unknown> {
  for (const key of FORBIDDEN_UNMODELLED_MANIFEST_CAPABILITIES) {
    if (key in sourceManifest) {
      throw new ReleaseCandidateFactoryError(
        `Source manifest contains unmodelled capability ${key}.`
      );
    }
  }
  const expected = structuredClone(sourceManifest);
  const allowedHosts = new Set(hostPermissions);
  if (
    !Array.isArray(sourceManifest.host_permissions) ||
    !sourceManifest.host_permissions.every((value) => typeof value === 'string')
  ) {
    throw new ReleaseCandidateFactoryError(
      'Source manifest host permissions are not a string array.'
    );
  }
  expected.host_permissions = sourceManifest.host_permissions.filter((value) =>
    allowedHosts.has(value as string)
  );
  if ('background' in sourceManifest) {
    const background = sourceManifest.background;
    if (
      typeof background !== 'object' ||
      background === null ||
      Array.isArray(background) ||
      !exactObjectKeys(background as Record<string, unknown>, ['service_worker', 'type']) ||
      (background as Record<string, unknown>).service_worker !== 'src/background/index.ts' ||
      (background as Record<string, unknown>).type !== 'module'
    ) {
      throw new ReleaseCandidateFactoryError(
        'Source manifest background authority is not the reviewed MV3 worker entry.'
      );
    }
    expected.background = {
      service_worker: 'service-worker-loader.js',
      type: 'module',
    };
  }
  return expected;
}

export function deriveCandidateIdentity(input: {
  readonly seed: ReleaseCandidateSeedV1;
  readonly sourcePort: ReleaseCandidateSourcePort;
}): CandidateIdentityV1 {
  try {
    const { seed, sourcePort } = input;
    const packageBytes = requiredGitBlob(seed, sourcePort, GIT_PATHS.package);
    const packageJson = parseJsonObject(packageBytes, 'extension package');
    if (typeof packageJson.version !== 'string') {
      throw new ReleaseCandidateFactoryError('Extension package has no committed version.');
    }
    parseCanonicalSemVer(packageJson.version);

    const sourceManifestBytes = requiredGitBlob(seed, sourcePort, GIT_PATHS.sourceManifest);
    const sourceManifest = parseJsonObject(sourceManifestBytes, 'source manifest');
    const builtManifestBytes = sourcePort.readBuiltManifest({
      sourceCommit: seed.sourceCommit,
      gitTreeObjectId: seed.gitTreeObjectId,
    });
    if (builtManifestBytes === null) {
      throw new ReleaseCandidateFactoryError('Missing exact built manifest.');
    }
    const builtManifest = parseJsonObject(builtManifestBytes, 'built manifest');
    if (
      sourceManifest.manifest_version !== 3 ||
      builtManifest.manifest_version !== 3 ||
      sourceManifest.version !== packageJson.version ||
      builtManifest.version !== packageJson.version ||
      sourceManifest.minimum_chrome_version !== builtManifest.minimum_chrome_version ||
      typeof builtManifest.minimum_chrome_version !== 'string'
    ) {
      throw new ReleaseCandidateFactoryError('Source/built/package manifest authority diverges.');
    }
    const sourcePermissions = stringArray(sourceManifest.permissions ?? [], 'source permissions');
    const permissions = stringArray(builtManifest.permissions ?? [], 'built permissions');
    const sourceOptional = stringArray(
      sourceManifest.optional_host_permissions ?? [],
      'source optional host permissions'
    );
    const optionalHostPermissions = stringArray(
      builtManifest.optional_host_permissions ?? [],
      'built optional host permissions'
    );
    const sourceHosts = stringArray(
      sourceManifest.host_permissions ?? [],
      'source host permissions'
    );
    const hostPermissions = stringArray(
      builtManifest.host_permissions ?? [],
      'built host permissions'
    );
    if (
      !sameArray(sourcePermissions, permissions) ||
      !sameArray(sourceOptional, optionalHostPermissions) ||
      hostPermissions.some((permission) => !sourceHosts.includes(permission))
    ) {
      throw new ReleaseCandidateFactoryError('Built manifest permissions exceed source authority.');
    }

    const connectorConfigBytes = requiredGitBlob(seed, sourcePort, GIT_PATHS.connectorConfig);
    const connectorConfig = parseJsonObject(
      connectorConfigBytes,
      'connector config'
    ) as ConnectorConfig;
    const connectorAuthorityInventory = parseExactJcsObject(
      requiredGitBlob(seed, sourcePort, GIT_PATHS.connectorAuthorities),
      'connector authority inventory'
    );
    if (
      !exactObjectKeys(connectorAuthorityInventory, ['connectors', 'schema', 'version']) ||
      connectorAuthorityInventory.schema !== 'missionpulse.connector-authorities' ||
      connectorAuthorityInventory.version !== 1 ||
      !Array.isArray(connectorAuthorityInventory.connectors) ||
      connectorAuthorityInventory.connectors.length === 0 ||
      connectorAuthorityInventory.connectors.length > 128
    ) {
      throw new ReleaseCandidateFactoryError('Committed connector authority inventory is invalid.');
    }
    const connectorAuthorities: IncludedConnectorAuthorityV1[] =
      connectorAuthorityInventory.connectors.map((value) => {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          throw new ReleaseCandidateFactoryError('Committed connector authority entry is invalid.');
        }
        const authority = value as Record<string, unknown>;
        if (
          !exactObjectKeys(authority, ['hostPermissions', 'id']) ||
          typeof authority.id !== 'string'
        ) {
          throw new ReleaseCandidateFactoryError('Committed connector authority entry is invalid.');
        }
        const authorityHosts = stringArray(
          authority.hostPermissions,
          `connector ${authority.id} host permissions`
        );
        if (
          authorityHosts.length === 0 ||
          !sameArray(authorityHosts, authority.hostPermissions as string[])
        ) {
          throw new ReleaseCandidateFactoryError(
            'Committed connector host permissions are not canonical.'
          );
        }
        return { id: authority.id, hostPermissions: authorityHosts };
      });
    const authorityIds = connectorAuthorities.map((authority) => authority.id);
    if (
      !sameArray([...authorityIds].sort(), authorityIds) ||
      new Set(authorityIds).size !== authorityIds.length
    ) {
      throw new ReleaseCandidateFactoryError(
        'Committed connector authorities are not uniquely ordered.'
      );
    }
    const resolution = resolveIncludedConnectors({
      allIds: authorityIds,
      config: connectorConfig,
      env: {},
    });
    if (resolution.warnings.length > 0) {
      throw new ReleaseCandidateFactoryError(resolution.warnings.join('; '));
    }
    const authorityById = new Map(
      connectorAuthorities.map((authority) => [authority.id, authority] as const)
    );
    const includedConnectors = resolution.included
      .map((id) => {
        const authority = authorityById.get(id);
        if (authority === undefined) {
          throw new ReleaseCandidateFactoryError(`Missing connector authority for ${id}.`);
        }
        return authority;
      })
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    const includedConnectorIds = includedConnectors.map((connector) => connector.id);
    if (
      new Set(includedConnectorIds).size !== includedConnectorIds.length ||
      !includedConnectorIds.every((id) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) ||
      includedConnectors.some(
        (connector) =>
          !Array.isArray(connector.hostPermissions) ||
          connector.hostPermissions.length === 0 ||
          !connector.hostPermissions.every(
            (permission) =>
              typeof permission === 'string' &&
              permission.length <= 512 &&
              /^[\x21-\x7e]+$/.test(permission)
          )
      )
    ) {
      throw new ReleaseCandidateFactoryError('Included connector authority is not canonical.');
    }
    const connectorHostPermissions = [
      ...new Set(includedConnectors.flatMap((connector) => [...connector.hostPermissions])),
    ].sort();
    if (!sameArray(hostPermissions, connectorHostPermissions)) {
      throw new ReleaseCandidateFactoryError(
        'Built manifest host permissions differ from included connector authority.'
      );
    }
    const expectedBuiltManifest = deriveExpectedBuiltManifest(
      sourceManifest,
      connectorHostPermissions
    );
    if (jcsCanonicalize(builtManifest) !== jcsCanonicalize(expectedBuiltManifest)) {
      throw new ReleaseCandidateFactoryError(
        'Built manifest is not the exact deterministic projection of committed authority.'
      );
    }

    const scenarioBytes = requiredGitBlob(seed, sourcePort, GIT_PATHS.scenarioInventory);
    const scenarioInventory = parseJsonObject(scenarioBytes, 'MV3 scenario inventory');
    if (
      !Buffer.from(jcsCanonicalize(scenarioInventory)).equals(Buffer.from(scenarioBytes)) ||
      Object.keys(scenarioInventory).sort().join('\0') !== 'scenarioIds\0schema\0version' ||
      scenarioInventory.schema !== 'missionpulse.packaged-mv3-scenario-inventory' ||
      scenarioInventory.version !== 1
    ) {
      throw new ReleaseCandidateFactoryError('MV3 scenario inventory is not exact JCS v1.');
    }
    const expectedMv3ScenarioIds = stringArray(scenarioInventory.scenarioIds, 'MV3 scenario IDs');
    if (!sameArray(expectedMv3ScenarioIds, scenarioInventory.scenarioIds as string[])) {
      throw new ReleaseCandidateFactoryError('MV3 scenario IDs are not in canonical order.');
    }

    const transportPolicySourceBytes = requiredGitBlob(seed, sourcePort, GIT_PATHS.transportPolicy);
    const transportPolicySource = parseExactJcsObject(
      transportPolicySourceBytes,
      'transport attestation policy source'
    );
    if (
      !exactObjectKeys(transportPolicySource, [
        'oidcIssuer',
        'predicateType',
        'provider',
        'schema',
        'sourceRef',
        'sourceRepository',
        'version',
        'workflowPath',
      ]) ||
      transportPolicySource.schema !== 'missionpulse.github-transport-attestation-policy-source' ||
      transportPolicySource.version !== 1 ||
      transportPolicySource.provider !== 'github-artifact-attestations' ||
      transportPolicySource.oidcIssuer !== 'https://token.actions.githubusercontent.com' ||
      typeof transportPolicySource.sourceRepository !== 'string' ||
      !/^[a-z0-9._-]+\/[a-z0-9._-]+$/.test(transportPolicySource.sourceRepository) ||
      transportPolicySource.sourceRef !== 'refs/heads/main' ||
      transportPolicySource.workflowPath !== '.github/workflows/ci.yml' ||
      transportPolicySource.predicateType !== 'https://slsa.dev/provenance/v1'
    ) {
      throw new ReleaseCandidateFactoryError(
        'Committed transport attestation policy source is invalid.'
      );
    }
    const trustedRootBytes = requiredGitBlob(seed, sourcePort, GIT_PATHS.trustedRoot);
    parseExactJcsObject(trustedRootBytes, 'GitHub trusted root');
    const authorizationPolicy = parseExactJcsObject(
      requiredGitBlob(seed, sourcePort, GIT_PATHS.authorizationPolicy),
      'authorization policy'
    );
    const externalReceiptPolicy = parseExactJcsObject(
      requiredGitBlob(seed, sourcePort, GIT_PATHS.externalReceiptPolicy),
      'external receipt policy'
    );

    const workflowBytes = requiredGitBlob(seed, sourcePort, GIT_PATHS.workflow);
    const workflow = inspectPrivilegedWorkflow(workflowBytes);
    const transportPolicyValue = {
      schema: 'missionpulse.github-transport-attestation-policy' as const,
      version: 1 as const,
      provider: transportPolicySource.provider,
      oidcIssuer: transportPolicySource.oidcIssuer,
      sourceRepository: transportPolicySource.sourceRepository,
      sourceRef: transportPolicySource.sourceRef,
      workflowPath: transportPolicySource.workflowPath,
      predicateType: transportPolicySource.predicateType,
      trustedRootJcsBase64: Buffer.from(trustedRootBytes).toString('base64'),
      trustedRootJcsSha256: sha256Hex(trustedRootBytes),
      policySha256: '',
      workflowBlobUtf8Base64: Buffer.from(workflowBytes).toString('base64'),
      workflowBlobSha256: sha256Hex(workflowBytes),
      privilegedJobId: 'seal-candidate' as const,
      privilegedJobProjectionSha256: workflow.projectionSha256,
      privilegedJobUses: workflow.uses,
    };
    transportPolicyValue.policySha256 = computePolicySha256(transportPolicyValue);

    const lockfileBytes = requiredGitBlob(seed, sourcePort, GIT_PATHS.lockfile);
    const permissionSetSha256 = sha256Jcs({
      permissions,
      hostPermissions,
      optionalHostPermissions,
    });
    return parseCandidateIdentity({
      schema: 'missionpulse.candidate-identity',
      version: 1,
      releaseId: seed.releaseId,
      sourceCommit: seed.sourceCommit,
      gitObjectFormat: seed.gitObjectFormat,
      gitTreeObjectId: seed.gitTreeObjectId,
      committedVersion: packageJson.version,
      releaseNamespace: `v${packageJson.version}`,
      lockfileSha256: sha256Hex(lockfileBytes),
      connectorConfigSha256: sha256Hex(connectorConfigBytes),
      includedConnectorIds,
      manifest: {
        schema: 'missionpulse.manifest-authority',
        version: 1,
        manifestVersion: 3,
        extensionVersion: packageJson.version,
        minimumChromeVersion: builtManifest.minimum_chrome_version,
        manifestSha256: sha256Hex(builtManifestBytes),
        permissions,
        hostPermissions,
        optionalHostPermissions,
        permissionSetSha256,
      },
      mv3ScenarioInventoryPath: seed.mv3ScenarioInventoryPath,
      mv3ScenarioInventoryBlobSha256: sha256Hex(scenarioBytes),
      expectedMv3ScenarioIds,
      expectedMv3ScenarioInventorySha256: sha256Jcs(expectedMv3ScenarioIds),
      transportAttestationPolicy: transportPolicyValue,
      authorizationPolicy,
      externalReceiptPolicy,
    });
  } catch (error) {
    if (error instanceof ReleaseCandidateFactoryError) {
      throw error;
    }
    throw new ReleaseCandidateFactoryError(
      error instanceof Error ? error.message : 'Candidate derivation failed.'
    );
  }
}

function createAuditedContext(
  actorId: string,
  candidate: CandidateIdentityV1,
  audit: AuditReceiptV1
): ReleaseReadinessContextV1 {
  return {
    state: 'audited',
    actorId,
    candidate: clone(candidate),
    audit: clone(audit),
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
    candidateHistory: [],
    lastError: null,
    acceptedLocalEvents: [],
  };
}

export function createReleaseCandidate(input: {
  readonly actorId: string;
  readonly expectedCatalogRevision: number;
  readonly seed: ReleaseCandidateSeedV1;
  readonly audit: unknown;
  readonly admittedAt: string;
  readonly transactionPort: ReleaseReadinessTransactionPort;
  readonly sourcePort: ReleaseCandidateSourcePort;
}): ReleaseReadinessContextV1 {
  try {
    const candidate = deriveCandidateIdentity({ seed: input.seed, sourcePort: input.sourcePort });
    const audit = parseAuditReceipt(input.audit);
    if (
      audit.releaseId !== candidate.releaseId ||
      audit.sourceCommit !== candidate.sourceCommit ||
      audit.committedVersion !== candidate.committedVersion ||
      audit.releaseNamespace !== candidate.releaseNamespace ||
      audit.mv3ScenarioInventoryBlobSha256 !== candidate.mv3ScenarioInventoryBlobSha256 ||
      audit.expectedMv3ScenarioInventorySha256 !== candidate.expectedMv3ScenarioInventorySha256 ||
      Date.parse(audit.recordedAt) > Date.parse(input.admittedAt)
    ) {
      throw new ReleaseCandidateFactoryError(
        'Audit identity or chronology differs from candidate.'
      );
    }
    const context = createAuditedContext(input.actorId, candidate, audit);
    const scope = createTransactionAuthorizationScope(input.transactionPort);
    try {
      const request = scope.authorize('reserveCandidate', {
        expectedCatalogRevision: input.expectedCatalogRevision,
        admittedAt: input.admittedAt,
        context,
      });
      const result = input.transactionPort.reserveCandidate(request);
      if (!result.ok) {
        throw new ReleaseCandidateFactoryError(`Candidate reservation failed: ${result.code}.`);
      }
      return result.context;
    } finally {
      scope.revoke();
    }
  } catch (error) {
    if (error instanceof ReleaseCandidateFactoryError) {
      throw error;
    }
    throw new ReleaseCandidateFactoryError(
      error instanceof Error ? error.message : 'Release candidate construction failed.'
    );
  }
}
