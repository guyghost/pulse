import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  computeCatalogSha256,
  computePayloadVerificationSha256,
  computePolicySha256,
  createEmptyReleaseCatalog,
  jcsCanonicalize,
  sha256Hex,
  type AuditReceiptV1,
  type CandidateIdentityV1,
  type GlobalReleaseCatalogRecordV1,
} from '../../../scripts/release-readiness/contracts';
import {
  InMemoryReleaseReadinessTransactionPort,
  ReleaseCandidateFactoryError,
  computeReleaseCommandDeliveryReceiptSha256,
  createReleaseCandidate,
  createReleaseReadinessController,
  deriveCandidateIdentity,
  isExactPersistedContextTransition,
  releaseContextSha256,
  type ReleaseCandidateSourcePort,
  type ReleaseReadinessTransactionPort,
  type ReleaseReadinessValidationPorts,
} from '../../../scripts/release-readiness/factory';
import * as factoryModule from '../../../scripts/release-readiness/factory';
import {
  RELEASE_PAYLOAD_SNAPSHOT_LIMITS,
  type LocalReleaseReadinessState,
  type ReleasePayloadByteSnapshotV1,
  type ReleaseReadinessContextV1,
  type ReleaseReadinessEvent,
  type VerifiedReleasePayloadProjectionV1,
} from '../../../scripts/release-readiness/reducer';
import * as reducerModule from '../../../scripts/release-readiness/reducer';
import { FileReleaseReadinessTransactionPort } from '../../../scripts/release-readiness/durable-store';
import * as durableStoreModule from '../../../scripts/release-readiness/durable-store';
import {
  computeReplayRegistrySha256,
  createEmptyGlobalReplayRegistry,
  type GlobalReplayRecordV1,
} from '../../../scripts/release-readiness/replay-registry';
import { getAllConnectorsMeta } from '../../../src/lib/shell/connectors/meta';

const SOURCE_COMMIT = 'ab'.repeat(20);
const TREE_ID = 'cd'.repeat(20);
const HASH = 'ef'.repeat(32);
const ALT_HASH = '01'.repeat(32);
const CONTROLLER_AUTHORITY_HASH = 'ac'.repeat(32);
const ATTEST_SHA = 'f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6';
const UPLOAD_SHA = '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a';
const ADMITTED_AT = '2026-07-16T10:00:00.000Z';
const SEALED_AT = '2026-07-16T10:05:00.000Z';
const CAPTURED_AT = '2026-07-16T10:06:00.000Z';
const CREATED_AT = '2026-07-16T10:07:00.000Z';
const OBSERVED_AT = '2026-07-16T10:08:00.000Z';
const VERIFIED_AT = '2026-07-16T10:09:00.000Z';
const EXPIRES_AT = '2026-08-15T10:07:00.000Z';

const AUTHORIZATION_KEY_PAIR = generateKeyPairSync('ed25519');
const EXTERNAL_RECEIPT_KEY_PAIR = generateKeyPairSync('ed25519');

function rawEd25519PublicKey(key: KeyObject): string {
  const der = key.export({ format: 'der', type: 'spki' });
  return Buffer.from(der).subarray(-32).toString('base64');
}

function createInMemoryPort(initialCatalog: unknown) {
  return new InMemoryReleaseReadinessTransactionPort(initialCatalog);
}

const WORKFLOW = `name: release
on: push
jobs:
  seal-candidate:
    runs-on: ubuntu-24.04
    permissions:
      contents: read
      id-token: write
      attestations: write
    steps:
      - id: build
        run: node release-controller.mjs
      - id: attest
        uses: actions/attest@${ATTEST_SHA}
        with:
          subject-name: missionpulse-sealed-candidate
          subject-digest: sha256:\${{ steps.build.outputs.transport-sha256 }}
      - id: upload
        uses: actions/upload-artifact@${UPLOAD_SHA}
        with:
          name: missionpulse-sealed-candidate
          path: \${{ steps.build.outputs.transport-path }}
          archive: false
          overwrite: false
          retention-days: 30
      - id: verify-upload-digest
        name: Verify the uploaded transport digest
        shell: bash
        env:
          CAPTURED_TRANSPORT_SHA256: \${{ steps.build.outputs.transport-sha256 }}
          UPLOADED_ARTIFACT_SHA256: \${{ steps.upload.outputs.artifact-digest }}
        run: |
          [[ "$CAPTURED_TRANSPORT_SHA256" =~ ^[0-9a-f]{64}$ ]]
          [[ "$UPLOADED_ARTIFACT_SHA256" =~ ^[0-9a-f]{64}$ ]]
          [[ "$UPLOADED_ARTIFACT_SHA256" == "$CAPTURED_TRANSPORT_SHA256" ]]
`;

const SCENARIO_IDS = ['navigation.all-tabs'];
const SCENARIO_BYTES = Buffer.from(
  '{"scenarioIds":["navigation.all-tabs"],"schema":"missionpulse.packaged-mv3-scenario-inventory","version":1}'
);
const CONNECTOR_CONFIG_BYTES = Buffer.from('{}');
const CONNECTOR_AUTHORITY_BYTES = Buffer.from(
  '{"connectors":[{"hostPermissions":["https://www.free-work.com/*"],"id":"free-work"}],"schema":"missionpulse.connector-authorities","version":1}'
);
const SOURCE_MANIFEST_BYTES = Buffer.from(
  '{"host_permissions":["https://www.free-work.com/*"],"manifest_version":3,"minimum_chrome_version":"138","optional_host_permissions":[],"permissions":["alarms"],"version":"0.2.2"}'
);
const BUILT_MANIFEST_BYTES = Buffer.from(
  '{"host_permissions":["https://www.free-work.com/*"],"manifest_version":3,"minimum_chrome_version":"138","optional_host_permissions":[],"permissions":["alarms"],"version":"0.2.2"}'
);

function signaturePolicy(purpose: 'authorization' | 'external_receipt') {
  const policy = {
    schema: 'missionpulse.signature-policy',
    version: 1,
    purpose,
    policySha256: HASH,
    allowedProvider:
      purpose === 'authorization' ? 'missionpulse_release_authority' : 'chrome_web_store_api',
    keys: [
      {
        issuerId: purpose === 'authorization' ? 'release-authority' : 'chrome-store',
        issuerKeyId: 'key-1',
        signatureAlgorithm: 'ed25519',
        publicKeyBase64: rawEd25519PublicKey(
          purpose === 'authorization'
            ? AUTHORIZATION_KEY_PAIR.publicKey
            : EXTERNAL_RECEIPT_KEY_PAIR.publicKey
        ),
      },
    ],
  };
  policy.policySha256 = computePolicySha256(policy);
  return policy;
}

function candidateSeed(
  releaseId = 'release-0.2.2',
  sourceCommit = SOURCE_COMMIT,
  gitTreeObjectId = TREE_ID
) {
  return {
    releaseId,
    sourceCommit,
    gitObjectFormat: 'sha1' as const,
    gitTreeObjectId,
    mv3ScenarioInventoryPath: 'apps/extension/tests/mv3/scenarios.v1.json' as const,
  };
}

function sourcePort(
  overrides: Partial<Record<string, Uint8Array>> = {},
  expectedSourceCommit = SOURCE_COMMIT,
  expectedTreeId = TREE_ID
): ReleaseCandidateSourcePort {
  const gitBlobs: Record<string, Uint8Array> = {
    'apps/extension/package.json': Buffer.from('{"version":"0.2.2"}'),
    'apps/extension/src/manifest.json': SOURCE_MANIFEST_BYTES,
    'apps/extension/connectors.config.json': CONNECTOR_CONFIG_BYTES,
    'apps/extension/scripts/release-readiness/policies/connector-authorities.v1.json':
      CONNECTOR_AUTHORITY_BYTES,
    'apps/extension/tests/mv3/scenarios.v1.json': SCENARIO_BYTES,
    '.github/workflows/ci.yml': Buffer.from(WORKFLOW),
    'pnpm-lock.yaml': Buffer.from('lockfileVersion: 9.0\n'),
    'apps/extension/scripts/release-readiness/policies/transport-attestation-policy.v1.json':
      Buffer.from(
        jcsCanonicalize({
          schema: 'missionpulse.github-transport-attestation-policy-source',
          version: 1,
          provider: 'github-artifact-attestations',
          oidcIssuer: 'https://token.actions.githubusercontent.com',
          sourceRepository: 'missionpulse/pulse',
          sourceRef: 'refs/heads/main',
          workflowPath: '.github/workflows/ci.yml',
          predicateType: 'https://slsa.dev/provenance/v1',
        })
      ),
    'apps/extension/scripts/release-readiness/policies/github-trusted-root.v1.json':
      Buffer.from('{"root":"offline"}'),
    'apps/extension/scripts/release-readiness/policies/authorization-policy.v1.json': Buffer.from(
      jcsCanonicalize(signaturePolicy('authorization'))
    ),
    'apps/extension/scripts/release-readiness/policies/external-receipt-policy.v1.json':
      Buffer.from(jcsCanonicalize(signaturePolicy('external_receipt'))),
    ...overrides,
  };
  return {
    readGitBlob(request) {
      expect(request.sourceCommit).toBe(expectedSourceCommit);
      expect(request.gitTreeObjectId).toBe(expectedTreeId);
      return gitBlobs[request.path] ?? null;
    },
    readBuiltManifest() {
      return overrides['dist/manifest.json'] ?? BUILT_MANIFEST_BYTES;
    },
  };
}

function auditFor(candidate: CandidateIdentityV1): AuditReceiptV1 {
  return {
    schema: 'missionpulse.release-audit',
    version: 1,
    receiptId: 'audit-1',
    releaseId: candidate.releaseId,
    sourceCommit: candidate.sourceCommit,
    committedVersion: candidate.committedVersion,
    releaseNamespace: candidate.releaseNamespace,
    mv3ScenarioInventoryBlobSha256: candidate.mv3ScenarioInventoryBlobSha256,
    expectedMv3ScenarioInventorySha256: candidate.expectedMv3ScenarioInventorySha256,
    coveredDomains: [
      'artifact',
      'canary',
      'ci',
      'metadata',
      'permissions',
      'rollback',
      'runtime',
      'security',
      'store',
      'workflows',
    ],
    openP0Count: 0,
    openP1Count: 0,
    recordedAt: '2026-07-16T09:59:00.000Z',
    report: {
      schema: 'missionpulse.immutable-blob',
      version: 1,
      kind: 'release-audit-report',
      immutableUri: 'release-audit.json',
      sha256: HASH,
      bytes: 1,
    },
  };
}

function createActor(
  options: {
    readonly actorId?: string;
    readonly expectedCatalogRevision?: number;
    readonly version?: string;
    readonly releaseId?: string;
    readonly sourceCommit?: string;
    readonly gitTreeObjectId?: string;
    readonly admittedAt?: string;
    readonly transactionPort?: ReleaseReadinessTransactionPort;
  } = {}
) {
  const version = options.version ?? '0.2.2';
  const sourceCommit = options.sourceCommit ?? SOURCE_COMMIT;
  const gitTreeObjectId = options.gitTreeObjectId ?? TREE_ID;
  const manifestBytes = Buffer.from(SOURCE_MANIFEST_BYTES.toString().replace('0.2.2', version));
  const sources = sourcePort(
    {
      'apps/extension/package.json': Buffer.from(`{"version":"${version}"}`),
      'apps/extension/src/manifest.json': manifestBytes,
      'dist/manifest.json': manifestBytes,
    },
    sourceCommit,
    gitTreeObjectId
  );
  const seed = candidateSeed(
    options.releaseId ?? `release-${version}`,
    sourceCommit,
    gitTreeObjectId
  );
  const derived = deriveCandidateIdentity({ seed, sourcePort: sources });
  const transactionPort =
    options.transactionPort ?? createInMemoryPort(createEmptyReleaseCatalog());
  const context = createReleaseCandidate({
    actorId: options.actorId ?? 'actor-1',
    expectedCatalogRevision: options.expectedCatalogRevision ?? 0,
    seed,
    audit: auditFor(derived),
    admittedAt: options.admittedAt ?? ADMITTED_AT,
    transactionPort,
    sourcePort: sources,
  });
  return { context, transactionPort };
}

function payloadProjection(): VerifiedReleasePayloadProjectionV1 {
  return {
    transportSha256: HASH,
    transportZipReceiptSha256: HASH,
    sealSha256: HASH,
    payloadInventorySha256: HASH,
    controllerBundleSha256: HASH,
    controllerBundleSourceInventorySha256: HASH,
    buildMetadataSha256: HASH,
    buildProvenanceSha256: HASH,
    executionAuthoritySha256: HASH,
    ociArchiveSha256: HASH,
    ociIndexSha256: HASH,
    ociManifestSha256: HASH,
    ociConfigSha256: HASH,
    layerSha256: [HASH],
    diffIdSha256: [HASH],
    finalRootInventorySha256: HASH,
    pythonRuntimeTreeSha256: HASH,
    pythonExecutableSha256: HASH,
    effectiveLoadedObjectsSha256: HASH,
  };
}

function byteSnapshot(): ReleasePayloadByteSnapshotV1 {
  const encoded = Buffer.from('exact-bytes').toString('base64');
  return {
    schema: 'missionpulse.release-payload-byte-snapshot',
    version: 1,
    snapshotId: 'snapshot-1',
    transportBytesBase64: encoded,
    testedDistSealJcsBase64: encoded,
    buildMetadataJcsBase64: encoded,
    buildProvenanceJcsBase64: encoded,
    controllerBundleBase64: encoded,
    executionAuthorityJcsBase64: encoded,
    ociArchiveBase64: encoded,
    transportZipReceiptJcsBase64: encoded,
    distTreeReceiptJcsBase64: encoded,
    controllerSourceInventoryJcsBase64: encoded,
    ociDescriptorGraphJcsBase64: encoded,
    pythonRuntimeInventoryJcsBase64: encoded,
    effectiveLoadedObjectsJcsBase64: encoded,
  };
}

function transportObservation(sourceCommit = SOURCE_COMMIT) {
  return {
    schema: 'missionpulse.sealed-candidate-transport-observation',
    version: 1,
    artifactName: 'missionpulse-sealed-candidate',
    transportFormat: 'missionpulse-canonical-zip-v1',
    transportBytes: 100,
    transportSha256: HASH,
    payloadInventorySha256: HASH,
    capturedAt: CAPTURED_AT,
    preUploadAttestation: {
      schema: 'missionpulse.github-transport-attestation',
      version: 1,
      provider: 'github-artifact-attestations',
      attestationId: 'attestation-1',
      subjectName: 'missionpulse-sealed-candidate',
      subjectDigest: HASH,
      predicateType: 'https://slsa.dev/provenance/v1',
      sigstoreBundleJcsBase64: Buffer.from('{"bundle":1}').toString('base64'),
      sigstoreBundleJcsSha256: sha256Hex('{"bundle":1}'),
      sourceRepository: 'missionpulse/pulse',
      sourceRef: 'refs/heads/main',
      workflowPath: '.github/workflows/ci.yml',
      signerWorkflowRef: 'missionpulse/pulse/.github/workflows/ci.yml@refs/heads/main',
      signerWorkflowSha: sourceCommit,
      runId: 123,
      runAttempt: 1,
      headSha: sourceCommit,
    },
    uploaderOutputDigest: HASH,
    artifactId: 'artifact-1',
    artifactDigest: HASH,
    downloadedTransportSha256: HASH,
    requestedRetentionDays: 30,
    workflowPath: '.github/workflows/ci.yml',
    runId: 123,
    runAttempt: 1,
    headSha: sourceCommit,
    conclusion: 'success',
    artifactCreatedAt: CREATED_AT,
    artifactExpiresAt: EXPIRES_AT,
    observedAt: OBSERVED_AT,
  };
}

function payloadVerification(
  overrides: Record<string, unknown> = {},
  identity: { readonly releaseId: string; readonly sourceCommit: string } = {
    releaseId: 'release-0.2.2',
    sourceCommit: SOURCE_COMMIT,
  }
) {
  const value = {
    schema: 'missionpulse.release-execution-payload-verification',
    version: 1,
    verificationId: 'verification-1',
    verificationSha256: HASH,
    releaseId: identity.releaseId,
    sealId: 'seal-1',
    sourceCommit: identity.sourceCommit,
    verifiedAt: VERIFIED_AT,
    ...payloadProjection(),
    controllerExecutionAuthoritySha256: CONTROLLER_AUTHORITY_HASH,
    ...overrides,
  };
  value.verificationSha256 = computePayloadVerificationSha256(value);
  return value;
}

function seal(
  identity: { readonly releaseId: string; readonly sourceCommit: string } = {
    releaseId: 'release-0.2.2',
    sourceCommit: SOURCE_COMMIT,
  }
) {
  const value = {
    schema: 'missionpulse.tested-dist-seal',
    version: 1,
    sealId: 'seal-1',
    releaseId: identity.releaseId,
    sourceCommit: identity.sourceCommit,
    sealedAt: SEALED_AT,
    ...payloadProjection(),
  };
  value.sealSha256 = sha256Hex(
    jcsCanonicalize(
      Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'sealSha256'))
    )
  );
  return value;
}

function replayRecord(input: {
  readonly kind: 'authorization' | 'external_receipt';
  readonly receiptId: string;
  readonly action: string;
  readonly issuerSequence: number;
  readonly authorizedPayloadSha256: string;
}): GlobalReplayRecordV1 {
  const discriminator = `${input.kind}:${input.receiptId}:${input.action}`;
  return {
    kind: input.kind,
    provider:
      input.kind === 'authorization' ? 'missionpulse_release_authority' : 'chrome_web_store_api',
    issuerId: input.kind === 'authorization' ? 'release-authority' : 'chrome-store',
    issuerKeyId: 'key-1',
    providerOperationId: input.kind === 'authorization' ? null : `operation-${input.receiptId}`,
    nonceSha256: sha256Hex(`nonce:${discriminator}`),
    receiptId: input.receiptId,
    action: input.action,
    issuerSequence: input.issuerSequence,
    canonicalEnvelopeSha256: sha256Hex(`envelope:${discriminator}`),
    authorizedPayloadSha256: input.authorizedPayloadSha256,
    releaseId: 'release-0.2.2',
    artifactId: 'artifact-1',
  };
}

function immutableBlob(kind: string, immutableUri: string) {
  return {
    schema: 'missionpulse.immutable-blob' as const,
    version: 1 as const,
    kind,
    immutableUri,
    sha256: HASH,
    bytes: 1,
  };
}

function rollbackTarget() {
  return {
    targetId: 'rollback-target-1',
    extensionVersion: '0.2.1',
    artifactSha256: ALT_HASH,
    manifestSha256: ALT_HASH,
    permissionSetSha256: ALT_HASH,
    validationReceipt: immutableBlob('rollback-validation', 'rollback-validation.json'),
    lastKnownHealthyAt: '2026-07-16T09:00:00.000Z',
  };
}

function storeReadinessReceipt(context: ReleaseReadinessContextV1) {
  return {
    schema: 'missionpulse.store-readiness' as const,
    version: 1 as const,
    receiptId: 'store-1',
    releaseId: context.candidate.releaseId,
    artifactId: 'artifact-1',
    artifactSha256: HASH,
    sourceCommit: context.candidate.sourceCommit,
    committedVersion: context.candidate.committedVersion,
    manifestSha256: context.candidate.manifest.manifestSha256,
    permissionSetSha256: context.candidate.manifest.permissionSetSha256,
    listingComplete: true as const,
    privacyDisclosureComplete: true as const,
    permissionJustificationComplete: true as const,
    credentialPresence: {
      chromeExtensionId: true as const,
      chromeClientId: true as const,
      chromeClientSecret: true as const,
      chromeRefreshToken: true as const,
    },
    rollbackTarget: rollbackTarget(),
    completedAt: '2026-07-16T10:10:30.000Z',
    record: immutableBlob('store-readiness', 'store-readiness.json'),
  };
}

function authorizationTargetSha256(eventType: string, payload: Record<string, unknown>): string {
  return sha256Hex(
    jcsCanonicalize({
      eventType,
      releaseId: payload.releaseId,
      artifactId: payload.artifactId,
      payload,
    })
  );
}

function signCanonicalEnvelope(
  value: Record<string, unknown>,
  domain: 'missionpulse.release-authorization.v1' | 'missionpulse.external-release-receipt.v1',
  privateKey: KeyObject
): Record<string, unknown> {
  const unsigned = Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => key !== 'canonicalPayloadSha256' && key !== 'detachedSignatureBase64'
    )
  );
  const canonicalPayloadSha256 = sha256Hex(jcsCanonicalize(unsigned));
  const signedBytes = Buffer.concat([
    Buffer.from(domain, 'ascii'),
    Buffer.from([0]),
    Buffer.from(canonicalPayloadSha256, 'hex'),
  ]);
  return {
    ...value,
    canonicalPayloadSha256,
    detachedSignatureBase64: sign(null, signedBytes, privateKey).toString('base64'),
  };
}

const AUTHORIZATION_EVENT_TYPE = {
  mark_store_ready: 'STORE_READINESS_INGESTED',
  ingest_submission: 'SUBMISSION_RECEIPT_INGESTED',
  ingest_canary_pass: 'CANARY_PASS_RECEIPT_INGESTED',
  ingest_production_promotion: 'PRODUCTION_PROMOTION_RECEIPT_INGESTED',
  ingest_rollback: 'ROLLBACK_RECEIPT_INGESTED',
} as const;

function authorizationReceipt(
  context: ReleaseReadinessContextV1,
  action: keyof typeof AUTHORIZATION_EVENT_TYPE,
  target: Record<string, unknown>,
  sequence: number,
  issuedAt: string,
  expiresAt = '2026-07-16T11:00:00.000Z'
) {
  return signCanonicalEnvelope(
    {
      schema: 'missionpulse.release-authorization',
      version: 1,
      receiptId: `authorization-${action}`,
      provider: 'missionpulse_release_authority',
      releaseId: context.candidate.releaseId,
      artifactId: 'artifact-1',
      actorId: context.actorId,
      scope: 'release_readiness',
      action,
      nonce: `nonce-${action}`,
      issuerId: 'release-authority',
      issuerKeyId: 'key-1',
      issuerSequence: sequence,
      signatureAlgorithm: 'ed25519',
      policySha256: context.candidate.authorizationPolicy.policySha256,
      authorizedPayloadSha256: authorizationTargetSha256(AUTHORIZATION_EVENT_TYPE[action], target),
      issuedAt,
      expiresAt,
      canonicalPayloadSha256: '',
      detachedSignatureBase64: '',
    },
    'missionpulse.release-authorization.v1',
    AUTHORIZATION_KEY_PAIR.privateKey
  );
}

const EXTERNAL_EVENT_TYPE = {
  submission: 'SUBMISSION_RECEIPT_INGESTED',
  canary_pass: 'CANARY_PASS_RECEIPT_INGESTED',
  production_promotion: 'PRODUCTION_PROMOTION_RECEIPT_INGESTED',
  rollback: 'ROLLBACK_RECEIPT_INGESTED',
} as const;

function externalReceipt(
  context: ReleaseReadinessContextV1,
  action: keyof typeof EXTERNAL_EVENT_TYPE,
  sequence: number
) {
  const occurredAt = {
    submission: '2026-07-16T10:12:00.000Z',
    canary_pass: '2026-07-16T10:13:00.000Z',
    production_promotion: '2026-07-16T10:14:00.000Z',
    rollback: '2026-07-16T10:15:00.000Z',
  }[action];
  const payload = {
    submission: {
      extensionId: 'extension-1',
      channel: 'trusted_testers',
      uploadedZipSha256: HASH,
      submittedAt: '2026-07-16T10:11:30.000Z',
      acceptedAt: occurredAt,
    },
    canary_pass: {
      submissionReceiptId: 'submission-1',
      windowStartedAt: '2026-07-16T10:12:00.000Z',
      windowEndedAt: '2026-07-16T10:13:00.000Z',
      sampleSize: 100,
      crashRate: 0,
      errorRate: 0,
      criticalFindingCount: 0,
      thresholdPolicySha256: HASH,
      metricsSha256: HASH,
      passed: true,
      passedAt: occurredAt,
    },
    production_promotion: {
      canaryReceiptId: 'canary-1',
      extensionId: 'extension-1',
      promotedArtifactSha256: HASH,
      promotedAt: occurredAt,
    },
    rollback: {
      deploymentReceiptId: 'promotion-1',
      rollbackTargetId: 'rollback-target-1',
      rollbackTargetArtifactSha256: ALT_HASH,
      rolledBackAt: occurredAt,
      restorationHealth: {
        checkedAt: '2026-07-16T10:15:30.000Z',
        healthy: true,
        criticalFindingCount: 0,
        metricsSha256: HASH,
      },
    },
  }[action];
  const receiptId = {
    submission: 'submission-1',
    canary_pass: 'canary-1',
    production_promotion: 'promotion-1',
    rollback: 'rollback-1',
  }[action];
  return signCanonicalEnvelope(
    {
      schema: 'missionpulse.external-release-receipt',
      version: 1,
      receiptId,
      provider: 'chrome_web_store_api',
      providerOperationId: `operation-${receiptId}`,
      action,
      releaseId: context.candidate.releaseId,
      artifactId: 'artifact-1',
      artifactSha256: HASH,
      sourceCommit: context.candidate.sourceCommit,
      extensionVersion: context.candidate.committedVersion,
      manifestSha256: context.candidate.manifest.manifestSha256,
      permissionSetSha256: context.candidate.manifest.permissionSetSha256,
      requestNonce: `request-nonce-${action}`,
      issuerId: 'chrome-store',
      issuerKeyId: 'key-1',
      issuerSequence: sequence,
      signatureAlgorithm: 'ed25519',
      policySha256: context.candidate.externalReceiptPolicy.policySha256,
      occurredAt,
      issuedAt: occurredAt,
      verifiedAt: occurredAt,
      canonicalPayloadSha256: '',
      detachedSignatureBase64: '',
      providerRecord: immutableBlob(`${action}-receipt`, `${action}-receipt.json`),
      payload,
    },
    'missionpulse.external-release-receipt.v1',
    EXTERNAL_RECEIPT_KEY_PAIR.privateKey
  );
}

function protectedEventFixtures(context: ReleaseReadinessContextV1) {
  const store = storeReadinessReceipt(context);
  const submission = externalReceipt(context, 'submission', 1);
  const canary = externalReceipt(context, 'canary_pass', 2);
  const promotion = externalReceipt(context, 'production_promotion', 3);
  const rollback = externalReceipt(context, 'rollback', 4);
  return {
    store,
    storeAuthorization: authorizationReceipt(
      context,
      'mark_store_ready',
      store,
      1,
      '2026-07-16T10:11:00.000Z'
    ),
    submission,
    submissionAuthorization: authorizationReceipt(
      context,
      'ingest_submission',
      submission,
      2,
      '2026-07-16T10:12:00.000Z'
    ),
    canary,
    canaryAuthorization: authorizationReceipt(
      context,
      'ingest_canary_pass',
      canary,
      3,
      '2026-07-16T10:13:00.000Z'
    ),
    promotion,
    promotionAuthorization: authorizationReceipt(
      context,
      'ingest_production_promotion',
      promotion,
      4,
      '2026-07-16T10:14:00.000Z'
    ),
    rollback,
    rollbackAuthorization: authorizationReceipt(
      context,
      'ingest_rollback',
      rollback,
      5,
      '2026-07-16T10:15:00.000Z'
    ),
  };
}

function validatedArtifact(context: ReleaseReadinessContextV1) {
  const manifestEntry = {
    path: 'manifest.json',
    bytes: 1,
    sha256: context.candidate.manifest.manifestSha256,
    mode: '0644' as const,
  };
  const tree = {
    algorithm: 'missionpulse-tree-sha256-v2' as const,
    fileCount: 1,
    treeSha256: sha256Hex(
      ['manifest.json', '1', context.candidate.manifest.manifestSha256].join('\0') + '\n'
    ),
    manifestSha256: context.candidate.manifest.manifestSha256,
    entries: [manifestEntry],
  };
  const zipEntry = {
    path: 'manifest.json',
    utf8NameSha256: sha256Hex('manifest.json'),
    crc32Hex: '00000000',
    uncompressedBytes: 1,
    compressedBytes: 1,
    compressionMethod: 0 as const,
    generalPurposeBitFlag: 0x0800 as const,
    versionNeeded: 20 as const,
    versionMadeBy: 0x031e as const,
    dosTime: 0 as const,
    dosDate: 0x0021 as const,
    internalFileAttributes: 0 as const,
    externalFileAttributes: 0x81a40000 as const,
    localExtraFieldBytes: 0 as const,
    centralExtraFieldBytes: 0 as const,
    entryCommentBytes: 0 as const,
    localHeaderOffset: 0,
  };
  const pathBytes = Buffer.from(zipEntry.path, 'utf8');
  const pathFrame = Buffer.alloc(4);
  pathFrame.writeUInt32BE(pathBytes.byteLength);
  const orderSha256 = sha256Hex(Buffer.concat([pathFrame, pathBytes]));
  const entryInventorySha256 = sha256Hex(jcsCanonicalize([zipEntry]));
  const zip = {
    schema: 'missionpulse.canonical-zip' as const,
    version: 1 as const,
    zipSha256: HASH,
    zipBytes: 1,
    entryCount: 1,
    compression: 'store' as const,
    normalizedTimestamp: '1980-01-01T00:00:00.000Z' as const,
    zip64: false as const,
    dataDescriptor: false as const,
    archiveCommentBytes: 0 as const,
    diskNumber: 0 as const,
    centralDirectoryStartDisk: 0 as const,
    entriesOnDisk: 1,
    entries: [zipEntry],
    entryInventorySha256,
    localHeaderOrderSha256: orderSha256,
    centralDirectoryOrderSha256: orderSha256,
    twinBuildSha256: HASH,
    twinReceiptSha256: sha256Hex(
      jcsCanonicalize({
        firstZipSha256: HASH,
        secondZipSha256: HASH,
        entryInventorySha256,
      })
    ),
  };
  const validationRecord = {
    schema: 'missionpulse.package-validation' as const,
    version: 1 as const,
    artifactId: 'artifact-1',
    releaseId: context.candidate.releaseId,
    sealId: 'seal-1',
    sealSha256: (context.sealIdentity as { readonly sealSha256: string }).sealSha256,
    committedVersion: context.candidate.committedVersion,
    releaseNamespace: context.candidate.releaseNamespace,
    sourceTreeSha256: tree.treeSha256,
    extractedTreeSha256: tree.treeSha256,
    ownershipMarkerSha256: HASH,
    zipSha256: HASH,
    sidecarSha256: sha256Hex(`${HASH}  missionpulse.zip\n`),
    entryInventorySha256,
    canonicalZipReceiptSha256: sha256Hex(jcsCanonicalize(zip)),
    validatedAt: '2026-07-16T10:09:58.000Z',
  };
  return {
    schema: 'missionpulse.validated-zip-artifact' as const,
    version: 1 as const,
    artifactId: 'artifact-1',
    releaseId: context.candidate.releaseId,
    sealId: 'seal-1',
    sealSha256: (context.sealIdentity as { readonly sealSha256: string }).sealSha256,
    sourceCommit: context.candidate.sourceCommit,
    committedVersion: context.candidate.committedVersion,
    releaseNamespace: context.candidate.releaseNamespace,
    manifest: context.candidate.manifest,
    sourceTree: tree,
    snapshotTree: tree,
    extractedTree: tree,
    zip,
    checksumSidecar: {
      filename: 'missionpulse.zip.sha256' as const,
      bytes: 83 as const,
      sha256: sha256Hex(`${HASH}  missionpulse.zip\n`),
    },
    bundleDirectoryPath: '/release/v0.2.2',
    zipPath: '/release/v0.2.2/missionpulse.zip',
    sidecarPath: '/release/v0.2.2/missionpulse.zip.sha256',
    validationPath: '/release/v0.2.2/validation.json',
    validationRecord,
    validationJsonSha256: sha256Hex(jcsCanonicalize(validationRecord)),
    bundleInventorySha256: HASH,
    journalId: 'journal-1',
    publishedAt: '2026-07-16T10:09:59.000Z',
    validatedAt: '2026-07-16T10:10:00.000Z',
  };
}

function packageJournal(journalId = 'journal-1', previousJournalSha256: string | null = null) {
  const journal = {
    journalId,
    previousJournalSha256,
    journalSha256: '',
  };
  journal.journalSha256 = sha256Hex(jcsCanonicalize({ journalId, previousJournalSha256 }));
  return journal;
}

function replayRecordFromAuthorization(
  value: unknown,
  action: keyof typeof AUTHORIZATION_EVENT_TYPE,
  sequence: number
): GlobalReplayRecordV1 {
  const receipt = value as Record<string, unknown>;
  if (receipt.schema !== 'missionpulse.release-authorization') {
    const receiptId = receipt.receiptId as string;
    return replayRecord({
      kind: 'authorization',
      receiptId,
      action,
      issuerSequence: sequence,
      authorizedPayloadSha256: sha256Hex(`target:${action}`),
    });
  }
  return {
    kind: 'authorization',
    provider: receipt.provider as GlobalReplayRecordV1['provider'],
    issuerId: receipt.issuerId as string,
    issuerKeyId: receipt.issuerKeyId as string,
    providerOperationId: null,
    nonceSha256: sha256Hex(receipt.nonce as string),
    receiptId: receipt.receiptId as string,
    action,
    issuerSequence: receipt.issuerSequence as number,
    canonicalEnvelopeSha256: sha256Hex(jcsCanonicalize(receipt)),
    authorizedPayloadSha256: receipt.authorizedPayloadSha256 as string,
    releaseId: receipt.releaseId as string,
    artifactId: receipt.artifactId as string,
  };
}

function replayRecordFromExternal(
  value: unknown,
  action: keyof typeof EXTERNAL_EVENT_TYPE,
  sequence: number
): GlobalReplayRecordV1 {
  const receipt = value as Record<string, unknown>;
  if (receipt.schema !== 'missionpulse.external-release-receipt') {
    const receiptId = receipt.receiptId as string;
    return replayRecord({
      kind: 'external_receipt',
      receiptId,
      action,
      issuerSequence: sequence,
      authorizedPayloadSha256: sha256Hex(
        `target:${
          {
            submission: 'ingest_submission',
            canary_pass: 'ingest_canary_pass',
            production_promotion: 'ingest_production_promotion',
            rollback: 'ingest_rollback',
          }[action]
        }`
      ),
    });
  }
  return {
    kind: 'external_receipt',
    provider: receipt.provider as GlobalReplayRecordV1['provider'],
    issuerId: receipt.issuerId as string,
    issuerKeyId: receipt.issuerKeyId as string,
    providerOperationId: receipt.providerOperationId as string,
    nonceSha256: sha256Hex(receipt.requestNonce as string),
    receiptId: receipt.receiptId as string,
    action,
    issuerSequence: receipt.issuerSequence as number,
    canonicalEnvelopeSha256: sha256Hex(jcsCanonicalize(receipt)),
    authorizedPayloadSha256: authorizationTargetSha256(EXTERNAL_EVENT_TYPE[action], receipt),
    releaseId: receipt.releaseId as string,
    artifactId: receipt.artifactId as string,
  };
}

type TestReducerPorts = ReleaseReadinessValidationPorts & {
  readonly transactionPort: ReleaseReadinessTransactionPort;
};

function reducerPorts(
  transactionPort: ReleaseReadinessTransactionPort,
  proof?: VerifiedReleasePayloadProjectionV1
): TestReducerPorts {
  return {
    transactionPort,
    validateFinalSeal(value) {
      const {
        schema: _schema,
        version: _version,
        transportSha256: _transportSha256,
        transportZipReceiptSha256: _transportZipReceiptSha256,
        ...identity
      } = value as ReturnType<typeof seal>;
      return identity;
    },
    verifyTransportAttestation: () => true,
    verifyPayloadByteSnapshot(_snapshot, input) {
      return (
        proof ?? {
          ...payloadProjection(),
          controllerExecutionAuthoritySha256: CONTROLLER_AUTHORITY_HASH,
          sealSha256: input.seal.sealSha256,
        }
      );
    },
    validateJournal(value) {
      const journal = value as {
        journalId: string;
        previousJournalSha256: string | null;
        journalSha256: string;
      };
      return {
        journalId: journal.journalId,
        previousJournalSha256: journal.previousJournalSha256,
        journalSha256: journal.journalSha256,
      };
    },
    validatePackage: () => ({
      artifactId: 'artifact-1',
      artifactSha256: HASH,
      validatedAt: '2026-07-16T10:10:00.000Z',
    }),
    verifyRecoveredJournalObservation: () => true,
    verifyRecoveredPackageObservation: () => true,
    validateStoreReadiness: () => ({ receiptId: 'store-1' }),
    validateAuthorization(value, action) {
      const sequence = {
        mark_store_ready: 1,
        ingest_submission: 2,
        ingest_canary_pass: 3,
        ingest_production_promotion: 4,
        ingest_rollback: 5,
      }[action];
      const authorizationId = (value as { readonly receiptId: string }).receiptId;
      return {
        authorizationId,
        replayRecord: replayRecordFromAuthorization(value, action, sequence),
      };
    },
    validateSubmissionReceipt(value) {
      return {
        receiptId: (value as { readonly receiptId: string }).receiptId,
        replayRecord: replayRecordFromExternal(value, 'submission', 1),
      };
    },
    validateCanaryPassReceipt(value) {
      return {
        receiptId: (value as { readonly receiptId: string }).receiptId,
        replayRecord: replayRecordFromExternal(value, 'canary_pass', 2),
      };
    },
    validateProductionPromotionReceipt(value) {
      return {
        receiptId: (value as { readonly receiptId: string }).receiptId,
        replayRecord: replayRecordFromExternal(value, 'production_promotion', 3),
      };
    },
    validateRollbackReceipt(value) {
      return {
        receiptId: (value as { readonly receiptId: string }).receiptId,
        replayRecord: replayRecordFromExternal(value, 'rollback', 4),
      };
    },
    validateLocalObservation(value) {
      const observation = value as {
        observationId: string;
        restartId: string;
        valid: boolean;
        error: unknown | null;
      };
      return {
        observationId: observation.observationId,
        restartId: observation.restartId,
        valid: observation.valid,
        error: observation.error,
        observation,
        observationSha256: sha256Hex(jcsCanonicalize(observation)),
      };
    },
    validateRestart: () => true,
    validateCandidateReplacement(candidate, audit) {
      return {
        candidate: candidate as CandidateIdentityV1,
        audit: audit as AuditReceiptV1,
      };
    },
    emitCommand: () => undefined,
  };
}

function reduceWithPorts(
  context: ReleaseReadinessContextV1,
  event: ReleaseReadinessEvent,
  ports: TestReducerPorts
) {
  return createReleaseReadinessController(ports.transactionPort, ports).reduce(context, event);
}

function advanceThroughVerification(context: ReleaseReadinessContextV1, ports: TestReducerPorts) {
  const identity = {
    releaseId: context.candidate.releaseId,
    sourceCommit: context.candidate.sourceCommit,
  };
  const built = reduceWithPorts(context, { type: 'RC_SEAL_INGESTED', seal: seal(identity) }, ports);
  expect(built.accepted).toBe(true);
  const sealSha256 = (built.context.sealIdentity as { readonly sealSha256: string }).sealSha256;
  const verified = reduceWithPorts(
    built.context,
    {
      type: 'RELEASE_PAYLOAD_VERIFIED_INGESTED',
      transportObservation: transportObservation(identity.sourceCommit),
      payloadVerification: payloadVerification({ sealSha256 }, identity),
      payloadByteSnapshot: byteSnapshot(),
    },
    ports
  );
  expect(verified.accepted).toBe(true);
  return verified.context;
}

function advanceThroughPackageValidation(
  context: ReleaseReadinessContextV1,
  ports: TestReducerPorts,
  expectedCatalogRevision = 1
): ReleaseReadinessContextV1 {
  const verified = advanceThroughVerification(context, ports);
  const journaled = reduceWithPorts(
    verified,
    {
      type: 'PACKAGE_JOURNAL_INGESTED',
      journal: packageJournal(),
    },
    ports
  );
  expect(journaled.accepted).toBe(true);
  const published = reduceWithPorts(
    journaled.context,
    {
      type: 'PACKAGE_VALIDATED_INGESTED',
      artifact: validatedArtifact(journaled.context),
      expectedCatalogRevision,
    },
    ports
  );
  expect(published.accepted).toBe(true);
  return published.context;
}

function contextAtState(
  state: LocalReleaseReadinessState,
  transactionPort?: ReleaseReadinessTransactionPort
): {
  readonly context: ReleaseReadinessContextV1;
  readonly ports: TestReducerPorts;
  readonly transactionPort: ReleaseReadinessTransactionPort;
} {
  const created = createActor({ transactionPort });
  const ports = reducerPorts(created.transactionPort);
  if (state === 'audited') {
    return { ...created, ports };
  }
  if (state === 'blocked') {
    const blocked = reduceWithPorts(
      created.context,
      { type: 'BLOCKERS_INGESTED', error: { code: 'blocked' } },
      ports
    );
    return { context: blocked.context, transactionPort: created.transactionPort, ports };
  }
  if (state === 'rc_built') {
    const built = reduceWithPorts(
      created.context,
      { type: 'RC_SEAL_INGESTED', seal: seal() },
      ports
    );
    return { context: built.context, transactionPort: created.transactionPort, ports };
  }
  let context = advanceThroughPackageValidation(created.context, ports);
  if (state === 'package_validated') {
    return { context, transactionPort: created.transactionPort, ports };
  }
  const protectedEvents = protectedEventFixtures(context);
  context = reduceWithPorts(
    context,
    {
      type: 'STORE_READINESS_INGESTED',
      store: protectedEvents.store,
      authorization: protectedEvents.storeAuthorization,
      ingestedAt: '2026-07-16T10:11:00.000Z',
      expectedRegistryRevision: 0,
    },
    ports
  ).context;
  if (state === 'store_ready') {
    return { context, transactionPort: created.transactionPort, ports };
  }
  context = reduceWithPorts(
    context,
    {
      type: 'SUBMISSION_RECEIPT_INGESTED',
      receipt: protectedEvents.submission,
      authorization: protectedEvents.submissionAuthorization,
      ingestedAt: '2026-07-16T10:12:00.000Z',
      expectedRegistryRevision: 1,
    },
    ports
  ).context;
  context = reduceWithPorts(
    context,
    {
      type: 'CANARY_PASS_RECEIPT_INGESTED',
      receipt: protectedEvents.canary,
      authorization: protectedEvents.canaryAuthorization,
      ingestedAt: '2026-07-16T10:13:00.000Z',
      expectedRegistryRevision: 2,
    },
    ports
  ).context;
  if (state === 'canary') {
    return { context, transactionPort: created.transactionPort, ports };
  }
  context = reduceWithPorts(
    context,
    {
      type: 'PRODUCTION_PROMOTION_RECEIPT_INGESTED',
      receipt: protectedEvents.promotion,
      authorization: protectedEvents.promotionAuthorization,
      ingestedAt: '2026-07-16T10:14:00.000Z',
      expectedRegistryRevision: 3,
    },
    ports
  ).context;
  if (state === 'production') {
    return { context, transactionPort: created.transactionPort, ports };
  }
  context = reduceWithPorts(
    context,
    {
      type: 'ROLLBACK_RECEIPT_INGESTED',
      receipt: protectedEvents.rollback,
      authorization: protectedEvents.rollbackAuthorization,
      ingestedAt: '2026-07-16T10:15:00.000Z',
      expectedRegistryRevision: 4,
    },
    ports
  ).context;
  return { context, transactionPort: created.transactionPort, ports };
}

function rewriteDurableReleaseState(
  directory: string,
  mutate: (state: Record<string, unknown>) => void
): void {
  const statePath = join(directory, 'release-readiness-state.v1.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown>;
  mutate(state);
  for (const actor of state.actors as Array<Record<string, unknown>>) {
    actor.contextSha256 = sha256Hex(jcsCanonicalize(actor.context));
  }
  const { stateSha256: _oldDigest, ...withoutDigest } = state;
  state.stateSha256 = sha256Hex(jcsCanonicalize(withoutDigest));
  writeFileSync(statePath, jcsCanonicalize(state));
}

describe('release candidate transaction and exact-source derivation', () => {
  it('does not export a transaction-authority factory to untrusted importers', () => {
    expect('createReleaseTransactionCapability' in factoryModule).toBe(false);
  });

  it('never exposes reusable transaction authority to an injected transaction port', () => {
    const created = createActor();
    let captured: Parameters<ReleaseReadinessTransactionPort['commitActor']>[0] | null = null;
    const interceptingPort = new Proxy(created.transactionPort, {
      get(target, property) {
        if (property === 'commitActor') {
          return (request: Parameters<ReleaseReadinessTransactionPort['commitActor']>[0]) => {
            captured = request;
            return { ok: true as const, context: structuredClone(request.nextContext) };
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as ReleaseReadinessTransactionPort;

    const simulated = createReleaseReadinessController(
      interceptingPort,
      reducerPorts(interceptingPort)
    ).reduce(created.context, {
      type: 'BLOCKERS_INGESTED',
      error: { code: 'captured-authority' },
    });

    expect(simulated.accepted).toBe(true);
    expect(created.transactionPort.readActor(created.context.actorId)?.state).toBe('audited');
    expect(captured).not.toBeNull();
    expect(Object.isFrozen(captured)).toBe(true);
    expect('transitionCapability' in (captured as unknown as Record<string, unknown>)).toBe(false);
    expect(created.transactionPort.commitActor(captured!)).toEqual({
      ok: false,
      code: 'ACTOR_AUTHORITY_REQUIRED',
    });
  });

  it('binds one-shot authority to the exact transaction port and protected operation', () => {
    const created = createActor();
    const packaged = advanceThroughPackageValidation(
      created.context,
      reducerPorts(created.transactionPort)
    );
    const confusedDeputyPort = new Proxy(created.transactionPort, {
      get(target, property) {
        if (property === 'commitProtectedEvent') {
          return (
            request: Parameters<ReleaseReadinessTransactionPort['commitProtectedEvent']>[0]
          ) => target.commitActor(request);
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as ReleaseReadinessTransactionPort;

    const result = createReleaseReadinessController(
      confusedDeputyPort,
      reducerPorts(confusedDeputyPort)
    ).reduce(packaged, {
      type: 'STORE_READINESS_INGESTED',
      store: { receiptId: 'store-1' },
      authorization: { receiptId: 'authorization-store' },
      ingestedAt: '2026-07-16T10:11:00.000Z',
      expectedRegistryRevision: 0,
    });

    expect(result).toMatchObject({ accepted: false });
    expect(created.transactionPort.readActor(packaged.actorId)).toEqual(packaged);
    expect(created.transactionPort.readReplayRegistry().revision).toBe(0);
  });

  it('never admits replay-protected R/U/C/D/K events through ordinary actor mode', () => {
    const prepared = contextAtState('store_ready');
    const fresh = createActor();
    const packaged = advanceThroughPackageValidation(
      fresh.context,
      reducerPorts(fresh.transactionPort)
    );

    expect(isExactPersistedContextTransition(packaged, prepared.context, 'actor')).toBe(false);
  });

  it('never exposes reusable factory reservation authority to an injected transaction port', () => {
    const durablePort = createInMemoryPort(createEmptyReleaseCatalog());
    let captured: Parameters<ReleaseReadinessTransactionPort['reserveCandidate']>[0] | null = null;
    const interceptingPort = new Proxy(durablePort, {
      get(target, property) {
        if (property === 'reserveCandidate') {
          return (request: Parameters<ReleaseReadinessTransactionPort['reserveCandidate']>[0]) => {
            captured = request;
            return { ok: true as const, context: structuredClone(request.context) };
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as ReleaseReadinessTransactionPort;

    createActor({ transactionPort: interceptingPort });

    expect(captured).not.toBeNull();
    expect(Object.isFrozen(captured)).toBe(true);
    expect('factoryAuthority' in (captured as unknown as Record<string, unknown>)).toBe(false);
    expect(durablePort.reserveCandidate(captured!)).toEqual({
      ok: false,
      code: 'ACTOR_INITIALIZATION_INVALID',
    });
  });

  it('keeps committed production authorities exact, official, and aligned with the connector catalog', () => {
    const readPolicy = <T extends Record<string, unknown>>(
      name: string
    ): { readonly bytes: Buffer; readonly value: T } => {
      const bytes = readFileSync(join(process.cwd(), 'scripts/release-readiness/policies', name));
      const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
      expect(typeof parsed).toBe('object');
      expect(parsed).not.toBeNull();
      expect(Array.isArray(parsed)).toBe(false);
      const value = parsed as T;
      expect(bytes.equals(Buffer.from(jcsCanonicalize(value)))).toBe(true);
      return { bytes, value };
    };

    const connectorAuthorities = readPolicy<{
      connectors: { id: string; hostPermissions: string[] }[];
    }>('connector-authorities.v1.json').value;
    expect(connectorAuthorities.connectors).toEqual(
      getAllConnectorsMeta()
        .map(({ id, hostPermissions }) => ({ id, hostPermissions: [...hostPermissions].sort() }))
        .sort((left, right) => left.id.localeCompare(right.id))
    );

    const transport = readPolicy<{
      sourceRepository: string;
    }>('transport-attestation-policy.v1.json').value;
    expect(transport.sourceRepository).toBe('guyghost/pulse');

    const trustedRoot = readPolicy<{
      mediaType: string;
      tlogs: unknown[];
      certificateAuthorities: unknown[];
      timestampAuthorities: unknown[];
    }>('github-trusted-root.v1.json').value;
    expect(trustedRoot.mediaType).toBe('application/vnd.dev.sigstore.trustedroot+json;version=0.1');
    expect(trustedRoot.tlogs.length).toBeGreaterThan(0);
    expect(trustedRoot.certificateAuthorities.length).toBeGreaterThan(0);
    expect(trustedRoot.timestampAuthorities.length).toBeGreaterThan(0);
  });

  it.each([
    'apps/extension/scripts/release-readiness/policies/authorization-policy.v1.json',
    'apps/extension/scripts/release-readiness/policies/external-receipt-policy.v1.json',
  ] as const)('fails closed when the committed public-key policy is absent: %s', (missingPath) => {
    const complete = sourcePort();
    const missingPolicySource: ReleaseCandidateSourcePort = {
      readGitBlob(request) {
        return request.path === missingPath ? null : complete.readGitBlob(request);
      },
      readBuiltManifest(request) {
        return complete.readBuiltManifest(request);
      },
    };

    expect(() =>
      deriveCandidateIdentity({
        seed: candidateSeed(),
        sourcePort: missingPolicySource,
      })
    ).toThrow(/Git blob|policy|missing/i);
  });

  it('derives every candidate authority from exact commit/tree and persists actor+reservation once', () => {
    const { context, transactionPort } = createActor();

    expect(context.candidate).toMatchObject({
      committedVersion: '0.2.2',
      releaseNamespace: 'v0.2.2',
      lockfileSha256: sha256Hex('lockfileVersion: 9.0\n'),
      connectorConfigSha256: sha256Hex(CONNECTOR_CONFIG_BYTES),
      includedConnectorIds: ['free-work'],
      expectedMv3ScenarioIds: SCENARIO_IDS,
      mv3ScenarioInventoryBlobSha256: sha256Hex(SCENARIO_BYTES),
      manifest: {
        manifestSha256: sha256Hex(BUILT_MANIFEST_BYTES),
        extensionVersion: '0.2.2',
      },
    });
    expect(context.candidate.transportAttestationPolicy).toMatchObject({
      workflowBlobSha256: sha256Hex(WORKFLOW),
      workflowBlobUtf8Base64: Buffer.from(WORKFLOW).toString('base64'),
    });
    expect(transactionPort.readActor('actor-1')).toEqual(context);
    expect(transactionPort.readCatalog()).toMatchObject({ revision: 1 });
    expect('compareAndSwap' in transactionPort).toBe(false);
    expect('initialReleaseReadinessContext' in reducerModule).toBe(false);
  });

  it.each([
    [
      'non-JCS scenario inventory',
      {
        'apps/extension/tests/mv3/scenarios.v1.json': Buffer.from(`${SCENARIO_BYTES.toString()}\n`),
      },
    ],
    [
      'source/built manifest divergence',
      {
        'dist/manifest.json': Buffer.from(
          BUILT_MANIFEST_BYTES.toString().replace('0.2.2', '0.2.3')
        ),
      },
    ],
    [
      'built manifest connector host omission',
      {
        'dist/manifest.json': Buffer.from(
          BUILT_MANIFEST_BYTES.toString().replace(
            '"host_permissions":["https://www.free-work.com/*"]',
            '"host_permissions":[]'
          )
        ),
      },
    ],
    [
      'package/manifest version divergence',
      { 'apps/extension/package.json': Buffer.from('{"version":"0.2.3"}') },
    ],
    [
      'injected all-urls content script capability',
      {
        'dist/manifest.json': Buffer.from(
          JSON.stringify({
            ...JSON.parse(BUILT_MANIFEST_BYTES.toString()),
            content_scripts: [{ js: ['capture.js'], matches: ['<all_urls>'] }],
          })
        ),
      },
    ],
    [
      'injected update URL capability',
      {
        'dist/manifest.json': Buffer.from(
          JSON.stringify({
            ...JSON.parse(BUILT_MANIFEST_BYTES.toString()),
            update_url: 'https://attacker.invalid/update.xml',
          })
        ),
      },
    ],
    [
      'injected extension CSP capability',
      {
        'dist/manifest.json': Buffer.from(
          JSON.stringify({
            ...JSON.parse(BUILT_MANIFEST_BYTES.toString()),
            content_security_policy: {
              extension_pages: "script-src 'self' https://attacker.invalid",
            },
          })
        ),
      },
    ],
    [
      'injected externally-connectable capability',
      {
        'dist/manifest.json': Buffer.from(
          JSON.stringify({
            ...JSON.parse(BUILT_MANIFEST_BYTES.toString()),
            externally_connectable: { matches: ['<all_urls>'] },
          })
        ),
      },
    ],
    [
      'injected background capability',
      {
        'dist/manifest.json': Buffer.from(
          JSON.stringify({
            ...JSON.parse(BUILT_MANIFEST_BYTES.toString()),
            background: { service_worker: 'attacker.js', type: 'module' },
          })
        ),
      },
    ],
    [
      'unmodelled extra manifest key',
      {
        'dist/manifest.json': Buffer.from(
          JSON.stringify({
            ...JSON.parse(BUILT_MANIFEST_BYTES.toString()),
            attacker_extension_key: true,
          })
        ),
      },
    ],
    [
      'non-canonical committed trusted root',
      {
        'apps/extension/scripts/release-readiness/policies/github-trusted-root.v1.json':
          Buffer.from('{"root":"offline"}\n'),
      },
    ],
  ])('rejects %s before catalog or actor persistence', (_label, overrides) => {
    const sources = sourcePort(overrides);
    const seed = candidateSeed();
    const transactionPort = createInMemoryPort(createEmptyReleaseCatalog());
    expect(() => {
      const derived = deriveCandidateIdentity({ seed, sourcePort: sources });
      createReleaseCandidate({
        actorId: 'actor-1',
        expectedCatalogRevision: 0,
        seed,
        audit: auditFor(derived),
        admittedAt: ADMITTED_AT,
        transactionPort,
        sourcePort: sources,
      });
    }).toThrow(ReleaseCandidateFactoryError);
    expect(transactionPort.readCatalog().revision).toBe(0);
    expect(transactionPort.readActor('actor-1')).toBeNull();
  });

  it('fails a stale reservation CAS atomically without publishing an actor', () => {
    const sources = sourcePort();
    const seed = candidateSeed();
    const derived = deriveCandidateIdentity({ seed, sourcePort: sources });
    const transactionPort = createInMemoryPort(createEmptyReleaseCatalog());
    expect(() =>
      createReleaseCandidate({
        actorId: 'actor-1',
        expectedCatalogRevision: 1,
        seed,
        audit: auditFor(derived),
        admittedAt: ADMITTED_AT,
        transactionPort,
        sourcePort: sources,
      })
    ).toThrow(/CAS/i);
    expect(transactionPort.readCatalog().revision).toBe(0);
    expect(transactionPort.readActor('actor-1')).toBeNull();
  });

  it('rejects direct transaction-port initialization that bypasses the audited factory state', () => {
    const valid = createActor().context;
    const transactionPort = createInMemoryPort(createEmptyReleaseCatalog());
    const result = transactionPort.reserveCandidate({
      expectedCatalogRevision: 0,
      admittedAt: ADMITTED_AT,
      context: {
        ...valid,
        actorId: 'actor-forged',
        state: 'rc_built',
        seal: { forged: true },
      },
    });

    expect(result).toEqual({ ok: false, code: 'ACTOR_INITIALIZATION_INVALID' });
    expect(transactionPort.readCatalog().revision).toBe(0);
    expect(transactionPort.readActor('actor-forged')).toBeNull();

    expect(() =>
      Reflect.construct(InMemoryReleaseReadinessTransactionPort, [
        createActor().transactionPort.readCatalog(),
        [valid],
      ])
    ).toThrow(/replay registry/i);
  });

  it('rejects direct actor and publication transitions that bypass the reducer', () => {
    const { context, transactionPort } = createActor();
    const forged = {
      ...context,
      state: 'package_validated' as const,
      artifact: { artifactId: 'artifact-forged' },
      acceptedLocalEvents: [
        {
          eventType: 'PACKAGE_VALIDATED_INGESTED' as const,
          stableIds: ['artifact-forged'],
          eventSha256: HASH,
        },
      ],
    };

    expect(
      transactionPort.commitActor({
        actorId: context.actorId,
        expectedContextSha256: releaseContextSha256(context),
        nextContext: forged,
      })
    ).toEqual({ ok: false, code: 'ACTOR_AUTHORITY_REQUIRED' });
    expect(
      transactionPort.publishArtifact({
        actorId: context.actorId,
        expectedContextSha256: releaseContextSha256(context),
        expectedCatalogRevision: 1,
        nextContext: forged,
        artifact: {
          artifactId: 'artifact-forged',
          artifactSha256: HASH,
          validatedAt: '2026-07-16T10:10:00.000Z',
        },
      })
    ).toEqual({ ok: false, code: 'ACTOR_AUTHORITY_REQUIRED' });
    expect(transactionPort.readActor(context.actorId)).toEqual(context);
    expect(transactionPort.readCatalog().revision).toBe(1);
  });

  it('serializes two durable controllers through one global filesystem CAS', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-release-readiness-'));
    try {
      const first = new FileReleaseReadinessTransactionPort({ directory });
      const second = new FileReleaseReadinessTransactionPort({ directory });
      const sources = sourcePort();
      const seed = candidateSeed();
      const derived = deriveCandidateIdentity({ seed, sourcePort: sources });
      const created = createReleaseCandidate({
        actorId: 'actor-durable',
        expectedCatalogRevision: 0,
        seed,
        audit: auditFor(derived),
        admittedAt: ADMITTED_AT,
        transactionPort: first,
        sourcePort: sources,
      });

      expect(() =>
        createReleaseCandidate({
          actorId: 'actor-stale-controller',
          expectedCatalogRevision: 0,
          seed,
          audit: auditFor(derived),
          admittedAt: ADMITTED_AT,
          transactionPort: second,
          sourcePort: sources,
        })
      ).toThrow(/CAS/i);
      expect(second.readCatalog()).toMatchObject({ revision: 1 });
      expect(second.readActor(created.actorId)).toEqual(created);
      expect(second.readActor('actor-stale-controller')).toBeNull();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    [
      'an extra context key',
      (context: Record<string, unknown>) => {
        context.unmodelledAuthority = true;
      },
    ],
    [
      'a pending restart without its accepted event',
      (context: Record<string, unknown>) => {
        context.pendingRestart = {
          restartId: 'forged-restart',
          restartedAt: '2026-07-16T10:01:00.000Z',
        };
      },
    ],
    [
      'an invalid state/proof combination',
      (context: Record<string, unknown>) => {
        context.state = 'production';
      },
    ],
    [
      'a forged candidate-history record',
      (context: Record<string, unknown>) => {
        context.candidateHistory = [{ contextSha256: HASH }];
      },
    ],
  ])(
    'rejects durable reload with %s even after attacker recomputes envelope digests',
    (_label, mutate) => {
      const directory = mkdtempSync(join(tmpdir(), 'pulse-release-durable-tamper-'));
      try {
        const port = new FileReleaseReadinessTransactionPort({ directory });
        createActor({ transactionPort: port });
        const statePath = join(directory, 'release-readiness-state.v1.json');
        const state = JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown>;
        const actors = state.actors as Array<Record<string, unknown>>;
        const actor = actors[0];
        if (actor === undefined) {
          throw new Error('Missing durable actor fixture.');
        }
        const context = actor.context as Record<string, unknown>;
        mutate(context);
        actor.contextSha256 = sha256Hex(jcsCanonicalize(context));
        const { stateSha256: _oldDigest, ...withoutDigest } = state;
        state.stateSha256 = sha256Hex(jcsCanonicalize(withoutDigest));
        writeFileSync(statePath, jcsCanonicalize(state));

        expect(() => new FileReleaseReadinessTransactionPort({ directory })).toThrow(
          /durable|context|state|history|restart|proof/i
        );
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  );

  it('rejects package_validated reload when its exact artifact publication was removed', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-release-artifact-catalog-bind-'));
    try {
      const port = new FileReleaseReadinessTransactionPort({ directory });
      contextAtState('package_validated', port);
      rewriteDurableReleaseState(directory, (state) => {
        const catalog = state.catalog as Record<string, unknown>;
        catalog.records = (catalog.records as Array<Record<string, unknown>>).filter(
          (record) => record.kind !== 'artifact_published'
        );
        catalog.revision = 1;
        catalog.catalogSha256 = computeCatalogSha256(catalog);
      });

      expect(() => new FileReleaseReadinessTransactionPort({ directory })).toThrow(
        /artifact|catalog|publication|durable/i
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects durable reload without the controller execution authority digest after envelope recomputation', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-release-controller-authority-tamper-'));
    try {
      const port = new FileReleaseReadinessTransactionPort({ directory });
      contextAtState('package_validated', port);
      rewriteDurableReleaseState(directory, (state) => {
        const actor = (state.actors as Array<Record<string, unknown>>)[0];
        if (actor === undefined) {
          throw new Error('Missing durable actor fixture.');
        }
        const context = actor.context as Record<string, unknown>;
        const verification = context.payloadVerification as Record<string, unknown>;
        delete verification.controllerExecutionAuthoritySha256;
        verification.verificationSha256 = computePayloadVerificationSha256(verification);
      });

      expect(() => new FileReleaseReadinessTransactionPort({ directory })).toThrow(
        /controller|payload|verification|digest|durable/i
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects package_validated reload when the exact artifact schema is truncated', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-release-artifact-schema-'));
    try {
      const port = new FileReleaseReadinessTransactionPort({ directory });
      contextAtState('package_validated', port);
      rewriteDurableReleaseState(directory, (state) => {
        const actor = (state.actors as Array<Record<string, unknown>>)[0];
        const context = actor?.context as Record<string, unknown> | undefined;
        const artifact = context?.artifact as Record<string, unknown> | undefined;
        if (artifact === undefined) {
          throw new Error('Missing durable artifact fixture.');
        }
        delete artifact.validationPath;
      });

      expect(() => new FileReleaseReadinessTransactionPort({ directory })).toThrow(
        /artifact|schema|validation|durable/i
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects store_ready reload when actor replay authority was removed', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-release-replay-bind-'));
    try {
      const port = new FileReleaseReadinessTransactionPort({ directory });
      contextAtState('store_ready', port);
      rewriteDurableReleaseState(directory, (state) => {
        state.replayRegistry = createEmptyGlobalReplayRegistry();
      });

      expect(() => new FileReleaseReadinessTransactionPort({ directory })).toThrow(
        /replay|authorization|registry|durable/i
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects production reload when persisted promotion identity diverges from replay', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-release-promotion-bind-'));
    try {
      const port = new FileReleaseReadinessTransactionPort({ directory });
      contextAtState('production', port);
      rewriteDurableReleaseState(directory, (state) => {
        const actor = (state.actors as Array<Record<string, unknown>>)[0];
        const context = actor?.context as Record<string, unknown> | undefined;
        if (context === undefined) {
          throw new Error('Missing durable production fixture.');
        }
        context.productionPromotion = { receiptId: 'promotion-attacker' };
      });

      expect(() => new FileReleaseReadinessTransactionPort({ directory })).toThrow(
        /promotion|receipt|replay|durable/i
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects rolled_back reload without submission/canary predecessor proofs', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-release-rollback-predecessors-'));
    try {
      const port = new FileReleaseReadinessTransactionPort({ directory });
      contextAtState('rolled_back', port);
      rewriteDurableReleaseState(directory, (state) => {
        const actor = (state.actors as Array<Record<string, unknown>>)[0];
        const context = actor?.context as Record<string, unknown> | undefined;
        if (context === undefined) {
          throw new Error('Missing durable rollback fixture.');
        }
        context.submission = null;
        context.canaryPass = null;
      });

      expect(() => new FileReleaseReadinessTransactionPort({ directory })).toThrow(
        /rollback|predecessor|submission|canary|durable/i
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects production reload whose accepted events were reordered', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-release-event-order-'));
    try {
      const port = new FileReleaseReadinessTransactionPort({ directory });
      contextAtState('production', port);
      rewriteDurableReleaseState(directory, (state) => {
        const actor = (state.actors as Array<Record<string, unknown>>)[0];
        const context = actor?.context as Record<string, unknown> | undefined;
        const events = context?.acceptedLocalEvents as Array<Record<string, unknown>> | undefined;
        if (events === undefined || events.length < 2) {
          throw new Error('Missing durable event-order fixture.');
        }
        [events[events.length - 2], events[events.length - 1]] = [
          events[events.length - 1]!,
          events[events.length - 2]!,
        ];
      });

      expect(() => new FileReleaseReadinessTransactionPort({ directory })).toThrow(
        /event|transition|sequence|state|durable/i
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a recomputed production history whose external Ed25519 signature is forged', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-release-signature-forgery-'));
    try {
      const port = new FileReleaseReadinessTransactionPort({ directory });
      contextAtState('production', port);
      rewriteDurableReleaseState(directory, (state) => {
        const actor = (state.actors as Array<Record<string, unknown>>)[0];
        const context = actor?.context as Record<string, unknown> | undefined;
        const promotion = context?.productionPromotion as Record<string, unknown> | undefined;
        if (promotion === undefined) {
          throw new Error('Missing durable production receipt fixture.');
        }
        promotion.detachedSignatureBase64 = Buffer.alloc(64, 7).toString('base64');
        const replayRegistry = state.replayRegistry as Record<string, unknown>;
        const tuples = replayRegistry.tuples as Array<Record<string, unknown>>;
        const externalRecords = tuples.flatMap(
          (tuple) => tuple.consumed as Array<Record<string, unknown>>
        );
        const replay = externalRecords.find((record) => record.receiptId === promotion.receiptId);
        if (replay === undefined) {
          throw new Error('Missing promotion replay fixture.');
        }
        replay.canonicalEnvelopeSha256 = sha256Hex(jcsCanonicalize(promotion));
        replayRegistry.registrySha256 = computeReplayRegistrySha256(replayRegistry);
      });

      expect(() => new FileReleaseReadinessTransactionPort({ directory })).toThrow(
        /signature|ed25519|external|durable/i
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a recomputed Store history whose authorization Ed25519 signature is forged', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-release-authorization-forgery-'));
    try {
      const port = new FileReleaseReadinessTransactionPort({ directory });
      contextAtState('store_ready', port);
      rewriteDurableReleaseState(directory, (state) => {
        const actor = (state.actors as Array<Record<string, unknown>>)[0];
        const context = actor?.context as Record<string, unknown> | undefined;
        const authorizations = context?.authorizations as
          Array<Record<string, unknown>> | undefined;
        const authorization = authorizations?.[0];
        if (authorization === undefined) {
          throw new Error('Missing durable Store authorization fixture.');
        }
        authorization.detachedSignatureBase64 = Buffer.alloc(64, 11).toString('base64');
        const replayRegistry = state.replayRegistry as Record<string, unknown>;
        const tuples = replayRegistry.tuples as Array<Record<string, unknown>>;
        const replay = tuples
          .flatMap((tuple) => tuple.consumed as Array<Record<string, unknown>>)
          .find((record) => record.receiptId === authorization.receiptId);
        if (replay === undefined) {
          throw new Error('Missing Store authorization replay fixture.');
        }
        replay.canonicalEnvelopeSha256 = sha256Hex(jcsCanonicalize(authorization));
        replayRegistry.registrySha256 = computeReplayRegistrySha256(replayRegistry);
      });

      expect(() => new FileReleaseReadinessTransactionPort({ directory })).toThrow(
        /authorization|signature|ed25519|durable/i
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects an orphaned durable scanner command even with recomputed state digest', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-release-outbox-tamper-'));
    try {
      const transactionPort = new FileReleaseReadinessTransactionPort({ directory });
      const { context } = createActor({ transactionPort });
      const ports: TestReducerPorts = {
        ...reducerPorts(transactionPort),
        emitCommand() {
          throw new Error('leave durable outbox pending');
        },
      };
      reduceWithPorts(
        context,
        {
          type: 'SERVICE_RESTARTED',
          releaseId: context.candidate.releaseId,
          restartId: 'restart-orphan',
          restartedAt: '2026-07-16T10:01:00.000Z',
        },
        ports
      );
      const statePath = join(directory, 'release-readiness-state.v1.json');
      const state = JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown>;
      const outbox = state.outbox as Array<Record<string, unknown>>;
      const command = outbox[0];
      if (command === undefined) {
        throw new Error('Missing durable command fixture.');
      }
      command.releaseId = 'release-attacker';
      const { stateSha256: _oldDigest, ...withoutDigest } = state;
      state.stateSha256 = sha256Hex(jcsCanonicalize(withoutDigest));
      writeFileSync(statePath, jcsCanonicalize(state));

      expect(() => new FileReleaseReadinessTransactionPort({ directory })).toThrow(
        /command|outbox|release|correlation/i
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    [
      'pending restart without its command or durable delivery',
      (state: Record<string, unknown>, _context: Record<string, unknown>) => {
        state.outbox = [];
      },
    ],
    [
      'restart history whose pending state and command were both erased',
      (state: Record<string, unknown>, context: Record<string, unknown>) => {
        state.outbox = [];
        context.pendingRestart = null;
      },
    ],
  ])('rejects durable reload with %s', (_label, mutate) => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-release-restart-invariant-'));
    try {
      const transactionPort = new FileReleaseReadinessTransactionPort({ directory });
      const { context } = createActor({ transactionPort });
      const ports: TestReducerPorts = {
        ...reducerPorts(transactionPort),
        emitCommand() {
          throw new Error('leave command pending');
        },
      };
      reduceWithPorts(
        context,
        {
          type: 'SERVICE_RESTARTED',
          releaseId: context.candidate.releaseId,
          restartId: 'restart-invariant',
          restartedAt: '2026-07-16T10:01:00.000Z',
        },
        ports
      );
      const statePath = join(directory, 'release-readiness-state.v1.json');
      const state = JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown>;
      const actor = (state.actors as Array<Record<string, unknown>>)[0];
      if (actor === undefined) {
        throw new Error('Missing durable actor fixture.');
      }
      const persistedContext = actor.context as Record<string, unknown>;
      mutate(state, persistedContext);
      actor.contextSha256 = sha256Hex(jcsCanonicalize(persistedContext));
      const { stateSha256: _oldDigest, ...withoutDigest } = state;
      state.stateSha256 = sha256Hex(jcsCanonicalize(withoutDigest));
      writeFileSync(statePath, jcsCanonicalize(state));

      expect(() => new FileReleaseReadinessTransactionPort({ directory })).toThrow(
        /restart|outbox|delivery|durable|correlation/i
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('recovers an expired lock only when its exact owner is provably dead', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-release-stale-lock-'));
    try {
      const lockPath = join(directory, '.release-readiness-state.lock');
      mkdirSync(lockPath, { mode: 0o700 });
      writeFileSync(
        join(lockPath, 'owner.v1.json'),
        jcsCanonicalize({
          schema: 'missionpulse.release-readiness-lock-owner',
          version: 1,
          ownerId: 'stale-owner',
          pid: 2_147_483_647,
          bootId: HASH,
          processStartIdentity: ALT_HASH,
          acquiredAt: '2020-01-01T00:00:00.000Z',
          leaseExpiresAt: '2020-01-01T00:05:00.000Z',
        })
      );
      utimesSync(
        lockPath,
        new Date('2020-01-01T00:00:00.000Z'),
        new Date('2020-01-01T00:00:00.000Z')
      );

      const port = new FileReleaseReadinessTransactionPort({ directory });
      expect(port.readCatalog().revision).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('never steals an expired-looking lock from a live owner', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-release-live-lock-'));
    try {
      const lockPath = join(directory, '.release-readiness-state.lock');
      const identity = durableStoreModule.readCurrentReleaseReadinessProcessIdentity();
      mkdirSync(lockPath, { mode: 0o700 });
      writeFileSync(
        join(lockPath, 'owner.v1.json'),
        jcsCanonicalize({
          schema: 'missionpulse.release-readiness-lock-owner',
          version: 1,
          ownerId: 'live-owner',
          pid: process.pid,
          bootId: identity.bootId,
          processStartIdentity: identity.processStartIdentity,
          acquiredAt: '2020-01-01T00:00:00.000Z',
          leaseExpiresAt: '2020-01-01T00:05:00.000Z',
        })
      );

      expect(() => new FileReleaseReadinessTransactionPort({ directory })).toThrow(
        /locked|owner|live/i
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('recovers an expired lock whose live PID belongs to a different boot/process start', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-release-pid-reuse-lock-'));
    try {
      const identityReader = (
        durableStoreModule as typeof durableStoreModule & {
          readCurrentReleaseReadinessProcessIdentity?: () => {
            readonly bootId: string;
            readonly processStartIdentity: string;
          };
        }
      ).readCurrentReleaseReadinessProcessIdentity;
      expect(identityReader).toBeTypeOf('function');
      const identity = identityReader!();
      const lockPath = join(directory, '.release-readiness-state.lock');
      mkdirSync(lockPath, { mode: 0o700 });
      writeFileSync(
        join(lockPath, 'owner.v1.json'),
        jcsCanonicalize({
          schema: 'missionpulse.release-readiness-lock-owner',
          version: 1,
          ownerId: 'reused-pid-owner',
          pid: process.pid,
          bootId: identity.bootId,
          processStartIdentity: ALT_HASH,
          acquiredAt: '2020-01-01T00:00:00.000Z',
          leaseExpiresAt: '2020-01-01T00:05:00.000Z',
        })
      );
      utimesSync(
        lockPath,
        new Date('2020-01-01T00:00:00.000Z'),
        new Date('2020-01-01T00:00:00.000Z')
      );

      const port = new FileReleaseReadinessTransactionPort({ directory });
      expect(port.readCatalog().revision).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('recovers only an expired empty pre-owner crash window and fails closed while recent', () => {
    const expiredDirectory = mkdtempSync(join(tmpdir(), 'pulse-release-empty-stale-lock-'));
    const recentDirectory = mkdtempSync(join(tmpdir(), 'pulse-release-empty-live-lock-'));
    try {
      const expiredLock = join(expiredDirectory, '.release-readiness-state.lock');
      mkdirSync(expiredLock, { mode: 0o700 });
      utimesSync(
        expiredLock,
        new Date('2020-01-01T00:00:00.000Z'),
        new Date('2020-01-01T00:00:00.000Z')
      );
      expect(
        new FileReleaseReadinessTransactionPort({ directory: expiredDirectory }).readCatalog()
          .revision
      ).toBe(0);

      mkdirSync(join(recentDirectory, '.release-readiness-state.lock'), { mode: 0o700 });
      expect(() => new FileReleaseReadinessTransactionPort({ directory: recentDirectory })).toThrow(
        /ambiguous|locked|owner/i
      );
    } finally {
      rmSync(expiredDirectory, { recursive: true, force: true });
      rmSync(recentDirectory, { recursive: true, force: true });
    }
  });

  it.each([
    ['a lower version than the greatest published release', '0.3.0', 'release-published'],
    ['a previously abandoned release ID', '0.2.1', 'release-0.2.2'],
  ])('rejects %s', (_label, priorVersion, priorReleaseId) => {
    const reserved = {
      catalogSequence: 1,
      kind: 'candidate_reserved' as const,
      actorId: 'actor-prior',
      releaseId: priorReleaseId,
      sourceCommit: SOURCE_COMMIT,
      committedVersion: priorVersion,
      releaseNamespace: `v${priorVersion}`,
      artifactId: null,
      artifactSha256: null,
      recordedAt: '2026-07-16T08:00:00.000Z',
    };
    const terminal = {
      ...reserved,
      catalogSequence: 2,
      kind:
        priorReleaseId === 'release-0.2.2'
          ? ('candidate_abandoned' as const)
          : ('artifact_published' as const),
      artifactId: priorReleaseId === 'release-0.2.2' ? null : 'artifact-prior',
      artifactSha256: priorReleaseId === 'release-0.2.2' ? null : HASH,
      recordedAt: '2026-07-16T08:01:00.000Z',
    };
    const catalog = {
      schema: 'missionpulse.global-release-catalog' as const,
      version: 1 as const,
      revision: 2,
      catalogSha256: '',
      records: [reserved, terminal],
    };
    catalog.catalogSha256 = computeCatalogSha256(catalog);
    const sources = sourcePort();
    const seed = candidateSeed();
    const derived = deriveCandidateIdentity({ seed, sourcePort: sources });
    const transactionPort = createInMemoryPort(catalog);

    expect(() =>
      createReleaseCandidate({
        actorId: 'actor-1',
        expectedCatalogRevision: 2,
        seed,
        audit: auditFor(derived),
        admittedAt: ADMITTED_AT,
        transactionPort,
        sourcePort: sources,
      })
    ).toThrow(/RELEASE_ID_REUSED|VERSION_PRECEDENCE_REJECTED/);
    expect(transactionPort.readCatalog().revision).toBe(2);
    expect(transactionPort.readActor('actor-1')).toBeNull();
  });

  it('allows a fresh release ID to reuse a namespace after explicit abandonment', () => {
    const reserved = {
      catalogSequence: 1,
      kind: 'candidate_reserved' as const,
      actorId: 'actor-old',
      releaseId: 'release-old',
      sourceCommit: SOURCE_COMMIT,
      committedVersion: '0.2.1',
      releaseNamespace: 'v0.2.1',
      artifactId: null,
      artifactSha256: null,
      recordedAt: '2026-07-16T08:00:00.000Z',
    };
    const abandoned = {
      ...reserved,
      catalogSequence: 2,
      kind: 'candidate_abandoned' as const,
      recordedAt: '2026-07-16T08:01:00.000Z',
    };
    const catalog = {
      schema: 'missionpulse.global-release-catalog' as const,
      version: 1 as const,
      revision: 2,
      catalogSha256: '',
      records: [reserved, abandoned],
    };
    catalog.catalogSha256 = computeCatalogSha256(catalog);
    const transactionPort = createInMemoryPort(catalog);

    const replacement = createActor({
      actorId: 'actor-replacement',
      expectedCatalogRevision: 2,
      version: '0.2.1',
      releaseId: 'release-new',
      transactionPort,
    });

    expect(replacement.context.candidate.releaseNamespace).toBe('v0.2.1');
    expect(transactionPort.readCatalog()).toMatchObject({
      revision: 3,
      records: [
        expect.objectContaining({ kind: 'candidate_reserved', releaseId: 'release-old' }),
        expect.objectContaining({ kind: 'candidate_abandoned', releaseId: 'release-old' }),
        expect.objectContaining({ kind: 'candidate_reserved', releaseId: 'release-new' }),
      ],
    });
  });
});

describe('release V/J/P authority', () => {
  it('fails publication atomically when the durable catalog is already at capacity', () => {
    const records: GlobalReleaseCatalogRecordV1[] = [];
    const actorId = 'actor-capacity-history';
    const sourceCommit = '10'.repeat(20);
    const timestamp = (index: number) =>
      new Date(Date.parse('2026-07-16T08:00:00.000Z') + index * 1_000).toISOString();
    const reservation = (index: number, recordedAt: string): GlobalReleaseCatalogRecordV1 => ({
      catalogSequence: records.length + 1,
      kind: 'candidate_reserved',
      actorId,
      releaseId: `release-capacity-${index}`,
      sourceCommit,
      committedVersion: `1.0.${index}`,
      releaseNamespace: `v1.0.${index}`,
      artifactId: null,
      artifactSha256: null,
      recordedAt,
    });
    records.push(reservation(0, timestamp(0)));
    for (let index = 1; index <= 127; index += 1) {
      const previous = records.at(-1)!;
      const recordedAt = timestamp(index);
      records.push({
        ...previous,
        catalogSequence: records.length + 1,
        kind: 'candidate_abandoned',
        recordedAt,
      });
      records.push(reservation(index, recordedAt));
    }
    const catalog = {
      schema: 'missionpulse.global-release-catalog' as const,
      version: 1 as const,
      revision: 128,
      catalogSha256: '',
      records,
    };
    catalog.catalogSha256 = computeCatalogSha256(catalog);
    const transactionPort = createInMemoryPort(catalog);
    const { context } = createActor({
      actorId: 'actor-capacity-publication',
      expectedCatalogRevision: 128,
      transactionPort,
    });
    expect(transactionPort.readCatalog().records).toHaveLength(256);
    const ports = reducerPorts(transactionPort);
    const verified = advanceThroughVerification(context, ports);
    const journaled = reduceWithPorts(
      verified,
      {
        type: 'PACKAGE_JOURNAL_INGESTED',
        journal: {
          journalId: 'journal-capacity',
          previousJournalSha256: null,
          journalSha256: HASH,
        },
      },
      ports
    );
    const published = reduceWithPorts(
      journaled.context,
      {
        type: 'PACKAGE_VALIDATED_INGESTED',
        artifact: { artifactId: 'artifact-capacity' },
        expectedCatalogRevision: 129,
      },
      ports
    );

    expect(published).toMatchObject({
      accepted: false,
      code: 'RELEASE_CATALOG_CAPACITY_EXHAUSTED',
    });
    expect(transactionPort.readCatalog()).toMatchObject({
      revision: 129,
      records: expect.any(Array),
    });
    expect(transactionPort.readCatalog().records).toHaveLength(256);
    expect(transactionPort.readActor(context.actorId)).toEqual(journaled.context);
  });

  it.each([
    'transportSha256',
    'transportZipReceiptSha256',
    'sealSha256',
    'payloadInventorySha256',
    'controllerBundleSha256',
    'controllerBundleSourceInventorySha256',
    'buildMetadataSha256',
    'buildProvenanceSha256',
    'executionAuthoritySha256',
    'controllerExecutionAuthoritySha256',
    'ociArchiveSha256',
    'ociIndexSha256',
    'ociManifestSha256',
    'ociConfigSha256',
    'finalRootInventorySha256',
    'pythonRuntimeTreeSha256',
    'pythonExecutableSha256',
    'effectiveLoadedObjectsSha256',
  ])('rejects a self-consistent forged V when byte proof differs on %s', (field) => {
    const { context, transactionPort } = createActor();
    const forgedReceipt = payloadVerification({ [field]: ALT_HASH });
    const ports = reducerPorts(transactionPort);
    const built = reduceWithPorts(
      context,
      { type: 'RC_SEAL_INGESTED', seal: seal() },
      ports
    ).context;
    const result = reduceWithPorts(
      built,
      {
        type: 'RELEASE_PAYLOAD_VERIFIED_INGESTED',
        transportObservation: transportObservation(),
        payloadVerification: forgedReceipt,
        payloadByteSnapshot: byteSnapshot(),
      },
      ports
    );

    expect(result).toMatchObject({ accepted: false, code: 'PAYLOAD_VERIFICATION_INVALID' });
    expect(transactionPort.readActor('actor-1')).toEqual(built);
  });

  it('rejects a forged byte proof and matching V receipt when they diverge from the seal', () => {
    const { context, transactionPort } = createActor();
    const forgedProof = {
      ...payloadProjection(),
      controllerBundleSha256: ALT_HASH,
    };
    const ports = reducerPorts(transactionPort, forgedProof);
    const built = reduceWithPorts(
      context,
      { type: 'RC_SEAL_INGESTED', seal: seal() },
      ports
    ).context;
    const result = reduceWithPorts(
      built,
      {
        type: 'RELEASE_PAYLOAD_VERIFIED_INGESTED',
        transportObservation: transportObservation(),
        payloadVerification: payloadVerification({ controllerBundleSha256: ALT_HASH }),
        payloadByteSnapshot: byteSnapshot(),
      },
      ports
    );

    expect(result).toMatchObject({ accepted: false, code: 'PAYLOAD_VERIFICATION_INVALID' });
    expect(transactionPort.readActor('actor-1')).toEqual(built);
  });

  it('rejects a payload byte snapshot above its per-field bound before verification', () => {
    const { context, transactionPort } = createActor();
    const ports = reducerPorts(transactionPort);
    const built = reduceWithPorts(
      context,
      { type: 'RC_SEAL_INGESTED', seal: seal() },
      ports
    ).context;
    const oversized = {
      ...byteSnapshot(),
      buildMetadataJcsBase64: Buffer.alloc(
        RELEASE_PAYLOAD_SNAPSHOT_LIMITS.fieldDecodedBytes.buildMetadataJcsBase64 + 1
      ).toString('base64'),
    };
    const result = reduceWithPorts(
      built,
      {
        type: 'RELEASE_PAYLOAD_VERIFIED_INGESTED',
        transportObservation: transportObservation(),
        payloadVerification: payloadVerification(),
        payloadByteSnapshot: oversized,
      },
      ports
    );

    expect(result).toMatchObject({ accepted: false, code: 'PAYLOAD_VERIFICATION_INVALID' });
    expect(transactionPort.readActor('actor-1')).toEqual(built);
  });

  it.each([
    ['layerSha256', [ALT_HASH]],
    ['diffIdSha256', [ALT_HASH]],
  ])('rejects forged ordered %s arrays', (field, value) => {
    const { context, transactionPort } = createActor();
    const ports = reducerPorts(transactionPort);
    const built = reduceWithPorts(
      context,
      { type: 'RC_SEAL_INGESTED', seal: seal() },
      ports
    ).context;
    const result = reduceWithPorts(
      built,
      {
        type: 'RELEASE_PAYLOAD_VERIFIED_INGESTED',
        transportObservation: transportObservation(),
        payloadVerification: payloadVerification({ [field]: value }),
        payloadByteSnapshot: byteSnapshot(),
      },
      ports
    );
    expect(result).toMatchObject({ accepted: false, code: 'PAYLOAD_VERIFICATION_INVALID' });
  });

  it('makes journal history single-assignment and rejects a fork from a stale digest', () => {
    const { context, transactionPort } = createActor();
    const ports = reducerPorts(transactionPort);
    const verified = advanceThroughVerification(context, ports);
    const first = reduceWithPorts(
      verified,
      {
        type: 'PACKAGE_JOURNAL_INGESTED',
        journal: {
          journalId: 'journal-1',
          previousJournalSha256: null,
          journalSha256: HASH,
        },
      },
      ports
    );
    const fork = reduceWithPorts(
      first.context,
      {
        type: 'PACKAGE_JOURNAL_INGESTED',
        journal: {
          journalId: 'journal-1',
          previousJournalSha256: null,
          journalSha256: ALT_HASH,
        },
      },
      ports
    );

    expect(fork).toMatchObject({ accepted: false, code: 'LOCAL_RECEIPT_DIVERGENT' });
    expect(transactionPort.readActor('actor-1')).toEqual(first.context);
  });

  it('publishes actor+catalog atomically, deduplicates P before state/CAS and rejects stale CAS', () => {
    const { context, transactionPort } = createActor();
    const ports = reducerPorts(transactionPort);
    const verified = advanceThroughVerification(context, ports);
    const journaled = reduceWithPorts(
      verified,
      {
        type: 'PACKAGE_JOURNAL_INGESTED',
        journal: {
          journalId: 'journal-1',
          previousJournalSha256: null,
          journalSha256: HASH,
        },
      },
      ports
    ).context;
    const event = {
      type: 'PACKAGE_VALIDATED_INGESTED' as const,
      artifact: { artifactId: 'artifact-1' },
      expectedCatalogRevision: 1,
    };
    const published = reduceWithPorts(journaled, event, ports);
    const duplicate = reduceWithPorts(published.context, event, ports);

    expect(published.context.state).toBe('package_validated');
    expect(transactionPort.readActor('actor-1')).toEqual(published.context);
    expect(transactionPort.readCatalog()).toMatchObject({
      revision: 2,
      records: [
        expect.objectContaining({ kind: 'candidate_reserved' }),
        expect.objectContaining({ kind: 'artifact_published', artifactId: 'artifact-1' }),
      ],
    });
    expect(duplicate).toMatchObject({ accepted: true, duplicate: true });
    expect(transactionPort.readCatalog().revision).toBe(2);

    const second = createActor();
    const secondPorts = reducerPorts(second.transactionPort);
    const secondVerified = advanceThroughVerification(second.context, secondPorts);
    const secondJournaled = reduceWithPorts(
      secondVerified,
      {
        type: 'PACKAGE_JOURNAL_INGESTED',
        journal: {
          journalId: 'journal-1',
          previousJournalSha256: null,
          journalSha256: HASH,
        },
      },
      secondPorts
    ).context;
    const stale = reduceWithPorts(
      secondJournaled,
      { ...event, expectedCatalogRevision: 0 },
      secondPorts
    );
    expect(stale).toMatchObject({ accepted: false, code: 'RELEASE_CATALOG_CAS_CONFLICT' });
    expect(second.transactionPort.readCatalog().revision).toBe(1);
    expect(second.transactionPort.readActor('actor-1')).toEqual(secondJournaled);
  });

  it('rechecks version precedence at publication after a higher release won the race', () => {
    const original = createActor();
    const higher = createActor({
      actorId: 'actor-higher',
      releaseId: 'release-0.3.0',
      sourceCommit: '34'.repeat(20),
      gitTreeObjectId: '56'.repeat(20),
      version: '0.3.0',
      expectedCatalogRevision: 1,
      admittedAt: '2026-07-16T10:01:00.000Z',
      transactionPort: original.transactionPort,
    });
    const higherPorts = reducerPorts(original.transactionPort);
    const higherVerified = advanceThroughVerification(higher.context, higherPorts);
    const higherJournaled = reduceWithPorts(
      higherVerified,
      {
        type: 'PACKAGE_JOURNAL_INGESTED',
        journal: {
          journalId: 'journal-higher',
          previousJournalSha256: null,
          journalSha256: ALT_HASH,
        },
      },
      higherPorts
    ).context;
    const higherPublished = reduceWithPorts(
      higherJournaled,
      {
        type: 'PACKAGE_VALIDATED_INGESTED',
        artifact: { artifactId: 'artifact-higher' },
        expectedCatalogRevision: 2,
      },
      higherPorts
    );
    expect(higherPublished).toMatchObject({ accepted: true });

    const ports = reducerPorts(original.transactionPort);
    const verified = advanceThroughVerification(original.context, ports);
    const journaled = reduceWithPorts(
      verified,
      {
        type: 'PACKAGE_JOURNAL_INGESTED',
        journal: {
          journalId: 'journal-1',
          previousJournalSha256: null,
          journalSha256: HASH,
        },
      },
      ports
    ).context;
    const result = reduceWithPorts(
      journaled,
      {
        type: 'PACKAGE_VALIDATED_INGESTED',
        artifact: { artifactId: 'artifact-1' },
        expectedCatalogRevision: 3,
      },
      ports
    );

    expect(result).toMatchObject({ accepted: false, code: 'VERSION_PRECEDENCE_REJECTED' });
    expect(original.transactionPort.readCatalog().revision).toBe(3);
    expect(original.transactionPort.readActor('actor-1')).toEqual(journaled);
  });
});

describe('complete release readiness workflows', () => {
  it.each([
    'audited',
    'blocked',
    'rc_built',
    'package_validated',
    'store_ready',
    'canary',
    'production',
    'rolled_back',
  ] as const)('keeps %s unchanged across X then a valid correlated O', (state) => {
    const prepared = contextAtState(state);
    expect(prepared.context.state).toBe(state);
    const emitted: string[] = [];
    const ports: TestReducerPorts = {
      ...prepared.ports,
      emitCommand(command) {
        emitted.push(command.commandId);
      },
    };
    const restarted = reduceWithPorts(
      prepared.context,
      {
        type: 'SERVICE_RESTARTED',
        releaseId: prepared.context.candidate.releaseId,
        restartId: `restart-${state}`,
        restartedAt: '2026-07-16T10:20:00.000Z',
      },
      ports
    );
    expect(prepared.transactionPort.readPendingCommands()).toEqual([
      expect.objectContaining({
        commandId: `scan:actor-1:restart-${state}`,
        releaseId: prepared.context.candidate.releaseId,
        restartId: `restart-${state}`,
      }),
    ]);
    const observed = reduceWithPorts(
      restarted.context,
      {
        type: 'LOCAL_RELEASE_OBSERVATION_INGESTED',
        observation: {
          observationId: `observation-${state}`,
          restartId: `restart-${state}`,
          valid: true,
          error: null,
          stateProjection: state,
        },
      },
      ports
    );

    expect(restarted).toMatchObject({ accepted: true, context: { state } });
    expect(observed).toMatchObject({
      accepted: true,
      context: {
        state,
        pendingRestart: null,
        lastLocalObservation: { observationId: `observation-${state}`, valid: true },
      },
    });
    expect(emitted).toEqual([`scan:actor-1:restart-${state}`]);
    expect(prepared.transactionPort.readPendingCommands()).toEqual([]);
  });

  it.each([
    ['audited', 'blocked'],
    ['blocked', 'blocked'],
    ['rc_built', 'blocked'],
    ['package_validated', 'blocked'],
    ['store_ready', 'blocked'],
    ['canary', 'canary'],
    ['production', 'production'],
    ['rolled_back', 'rolled_back'],
  ] as const)(
    'maps an invalid correlated O from %s to %s without retaining recovery authority',
    (state, expectedState) => {
      const prepared = contextAtState(state);
      const restarted = reduceWithPorts(
        prepared.context,
        {
          type: 'SERVICE_RESTARTED',
          releaseId: prepared.context.candidate.releaseId,
          restartId: `restart-invalid-${state}`,
          restartedAt: '2026-07-16T10:20:00.000Z',
        },
        prepared.ports
      );
      const observed = reduceWithPorts(
        restarted.context,
        {
          type: 'LOCAL_RELEASE_OBSERVATION_INGESTED',
          observation: {
            observationId: `observation-invalid-${state}`,
            restartId: `restart-invalid-${state}`,
            valid: false,
            error: { code: 'LOCAL_OBSERVATION_INVALID' },
          },
        },
        prepared.ports
      );

      expect(observed).toMatchObject({
        accepted: true,
        context: {
          state: expectedState,
          pendingRestart: null,
          lastLocalObservation: null,
          lastError: { code: 'LOCAL_OBSERVATION_INVALID' },
        },
      });
    }
  );

  it('reopens durable actor, catalog, replay registry, and scanner outbox as one state', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-release-durable-workflow-'));
    try {
      const transactionPort = new FileReleaseReadinessTransactionPort({ directory });
      const { context } = createActor({ transactionPort });
      const basePorts = reducerPorts(transactionPort);
      const packaged = advanceThroughPackageValidation(context, basePorts);
      const protectedEvents = protectedEventFixtures(packaged);
      const storeReady = reduceWithPorts(
        packaged,
        {
          type: 'STORE_READINESS_INGESTED',
          store: protectedEvents.store,
          authorization: protectedEvents.storeAuthorization,
          ingestedAt: '2026-07-16T10:11:00.000Z',
          expectedRegistryRevision: 0,
        },
        basePorts
      );
      const crashPorts: TestReducerPorts = {
        ...basePorts,
        emitCommand() {
          throw new Error('simulated controller crash');
        },
      };
      const restarted = reduceWithPorts(
        storeReady.context,
        {
          type: 'SERVICE_RESTARTED',
          releaseId: context.candidate.releaseId,
          restartId: 'durable-restart',
          restartedAt: '2026-07-16T10:12:00.000Z',
        },
        crashPorts
      );
      expect(restarted.accepted).toBe(true);

      const reopened = new FileReleaseReadinessTransactionPort({ directory });
      expect(reopened.readActor(context.actorId)).toEqual(restarted.context);
      expect(reopened.readCatalog().revision).toBe(2);
      expect(reopened.readReplayRegistry().revision).toBe(1);
      expect(reopened.readPendingCommands()).toEqual([
        expect.objectContaining({
          commandId: 'scan:actor-1:durable-restart',
          restartId: 'durable-restart',
        }),
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('advances R/U/C/D/K atomically with the durable global replay registry', () => {
    const { context, transactionPort } = createActor();
    const ports = reducerPorts(transactionPort);
    const packaged = advanceThroughPackageValidation(context, ports);
    const storeEvent = {
      type: 'STORE_READINESS_INGESTED' as const,
      store: { receiptId: 'store-1' },
      authorization: { receiptId: 'authorization-mark-store-ready' },
      ingestedAt: '2026-07-16T10:11:00.000Z',
      expectedRegistryRevision: 0,
    };
    const storeReady = reduceWithPorts(packaged, storeEvent, ports);
    const submissionEvent = {
      type: 'SUBMISSION_RECEIPT_INGESTED' as const,
      receipt: { receiptId: 'submission-1' },
      authorization: { receiptId: 'authorization-submission' },
      ingestedAt: '2026-07-16T10:12:00.000Z',
      expectedRegistryRevision: 1,
    };
    const submitted = reduceWithPorts(storeReady.context, submissionEvent, ports);
    const canary = reduceWithPorts(
      submitted.context,
      {
        type: 'CANARY_PASS_RECEIPT_INGESTED',
        receipt: { receiptId: 'canary-1' },
        authorization: { receiptId: 'authorization-canary' },
        ingestedAt: '2026-07-16T10:13:00.000Z',
        expectedRegistryRevision: 2,
      },
      ports
    );
    const production = reduceWithPorts(
      canary.context,
      {
        type: 'PRODUCTION_PROMOTION_RECEIPT_INGESTED',
        receipt: { receiptId: 'promotion-1' },
        authorization: { receiptId: 'authorization-production' },
        ingestedAt: '2026-07-16T10:14:00.000Z',
        expectedRegistryRevision: 3,
      },
      ports
    );
    const rolledBack = reduceWithPorts(
      production.context,
      {
        type: 'ROLLBACK_RECEIPT_INGESTED',
        receipt: { receiptId: 'rollback-1' },
        authorization: { receiptId: 'authorization-rollback' },
        ingestedAt: '2026-07-16T10:15:00.000Z',
        expectedRegistryRevision: 4,
      },
      ports
    );

    expect(storeReady).toMatchObject({ accepted: true, context: { state: 'store_ready' } });
    expect(submitted).toMatchObject({ accepted: true, context: { state: 'store_ready' } });
    expect(canary).toMatchObject({ accepted: true, context: { state: 'canary' } });
    expect(production).toMatchObject({ accepted: true, context: { state: 'production' } });
    expect(rolledBack).toMatchObject({ accepted: true, context: { state: 'rolled_back' } });
    expect(rolledBack.context.authorizations).toHaveLength(5);
    expect(transactionPort.readReplayRegistry()).toMatchObject({ revision: 5 });
    expect(
      transactionPort.readReplayRegistry().tuples.flatMap((tuple) => tuple.consumed)
    ).toHaveLength(9);
    expect(transactionPort.readActor(context.actorId)).toEqual(rolledBack.context);

    const duplicateSubmission = reduceWithPorts(rolledBack.context, submissionEvent, ports);
    expect(duplicateSubmission).toMatchObject({ accepted: true, duplicate: true });
    expect(transactionPort.readReplayRegistry().revision).toBe(5);
  });

  it('returns SUBMISSION_ALREADY_SET for a different fresh submission without consuming replay state', () => {
    const { context, transactionPort } = createActor();
    const ports = reducerPorts(transactionPort);
    const packaged = advanceThroughPackageValidation(context, ports);
    const storeReady = reduceWithPorts(
      packaged,
      {
        type: 'STORE_READINESS_INGESTED',
        store: { receiptId: 'store-1' },
        authorization: { receiptId: 'authorization-store' },
        ingestedAt: '2026-07-16T10:11:00.000Z',
        expectedRegistryRevision: 0,
      },
      ports
    );
    const submitted = reduceWithPorts(
      storeReady.context,
      {
        type: 'SUBMISSION_RECEIPT_INGESTED',
        receipt: { receiptId: 'submission-1' },
        authorization: { receiptId: 'authorization-submission' },
        ingestedAt: '2026-07-16T10:12:00.000Z',
        expectedRegistryRevision: 1,
      },
      ports
    );
    const freshTarget = sha256Hex('target:fresh-submission');
    const freshPorts: TestReducerPorts = {
      ...ports,
      validateAuthorization: (_value, action) => ({
        authorizationId: 'authorization-submission-2',
        replayRecord: replayRecord({
          kind: 'authorization',
          receiptId: 'authorization-submission-2',
          action,
          issuerSequence: 3,
          authorizedPayloadSha256: freshTarget,
        }),
      }),
      validateSubmissionReceipt: () => ({
        receiptId: 'submission-2',
        replayRecord: replayRecord({
          kind: 'external_receipt',
          receiptId: 'submission-2',
          action: 'submission',
          issuerSequence: 2,
          authorizedPayloadSha256: freshTarget,
        }),
      }),
    };
    const second = reduceWithPorts(
      submitted.context,
      {
        type: 'SUBMISSION_RECEIPT_INGESTED',
        receipt: { receiptId: 'submission-2' },
        authorization: { receiptId: 'authorization-submission-2' },
        ingestedAt: '2026-07-16T10:13:00.000Z',
        expectedRegistryRevision: 2,
      },
      freshPorts
    );

    expect(second).toMatchObject({ accepted: false, code: 'SUBMISSION_ALREADY_SET' });
    expect(transactionPort.readActor(context.actorId)).toEqual(submitted.context);
    expect(transactionPort.readReplayRegistry().revision).toBe(2);
  });

  it('persists restart correlation and a durable idempotent scanner outbox before emission', () => {
    const { context, transactionPort } = createActor();
    const emitted: string[] = [];
    const ports: TestReducerPorts = {
      ...reducerPorts(transactionPort),
      emitCommand(command) {
        emitted.push(command.commandId);
        throw new Error('simulated crash before acknowledgement');
      },
    };
    const restartEvent = {
      type: 'SERVICE_RESTARTED' as const,
      releaseId: context.candidate.releaseId,
      restartId: 'restart-1',
      restartedAt: '2026-07-16T10:01:00.000Z',
    };
    const restarted = reduceWithPorts(context, restartEvent, ports);

    expect(restarted).toMatchObject({
      accepted: true,
      context: { state: 'audited', pendingRestart: { restartId: 'restart-1' } },
    });
    expect(emitted).toEqual(['scan:actor-1:restart-1']);
    expect(transactionPort.readPendingCommands()).toEqual([
      expect.objectContaining({
        commandId: 'scan:actor-1:restart-1',
        restartId: 'restart-1',
      }),
    ]);

    const blockedWhilePending = reduceWithPorts(
      restarted.context,
      { type: 'BLOCKERS_INGESTED', error: { code: 'must-wait' } },
      ports
    );
    expect(blockedWhilePending).toMatchObject({
      accepted: false,
      code: 'RESTART_OBSERVATION_INVALID',
    });
    expect(transactionPort.readActor(context.actorId)).toEqual(restarted.context);

    const duplicate = reduceWithPorts(restarted.context, restartEvent, ports);
    expect(duplicate).toMatchObject({ accepted: true, duplicate: true });
    expect(emitted).toHaveLength(1);

    const observed = reduceWithPorts(
      restarted.context,
      {
        type: 'LOCAL_RELEASE_OBSERVATION_INGESTED',
        observation: {
          observationId: 'observation-1',
          restartId: 'restart-1',
          valid: true,
          error: null,
          completeInventory: [{ path: 'bundle.zip', sha256: HASH }],
        },
      },
      ports
    );
    expect(observed).toMatchObject({
      accepted: true,
      context: {
        state: 'audited',
        pendingRestart: null,
        lastLocalObservation: {
          observationId: 'observation-1',
          observation: expect.objectContaining({ completeInventory: expect.any(Array) }),
        },
      },
    });
  });

  it('single-flights reentrant drains so one command ID reaches the receiver once', () => {
    const { context, transactionPort } = createActor();
    const emitted: string[] = [];
    const delivery = {
      schema: 'missionpulse.release-command-delivery' as const,
      version: 1 as const,
      deliveryId: 'delivery-single-flight',
      commandId: 'scan:actor-1:restart-single-flight',
      actorId: 'actor-1',
      releaseId: context.candidate.releaseId,
      restartId: 'restart-single-flight',
      durablyAcceptedAt: '2026-07-16T10:01:01.000Z',
      receiptSha256: '',
    };
    delivery.receiptSha256 = computeReleaseCommandDeliveryReceiptSha256(delivery);
    const reentrantPorts: TestReducerPorts = {
      ...reducerPorts(transactionPort),
      emitCommand(command) {
        emitted.push(command.commandId);
        return delivery;
      },
    };
    const reentrantController = createReleaseReadinessController(transactionPort, reentrantPorts);
    const outerPorts: TestReducerPorts = {
      ...reducerPorts(transactionPort),
      emitCommand(command) {
        emitted.push(command.commandId);
        reentrantController.drainOutbox();
        return delivery;
      },
    };

    const restarted = createReleaseReadinessController(transactionPort, outerPorts).reduce(
      context,
      {
        type: 'SERVICE_RESTARTED',
        releaseId: context.candidate.releaseId,
        restartId: 'restart-single-flight',
        restartedAt: '2026-07-16T10:01:00.000Z',
      }
    );

    expect(restarted.accepted).toBe(true);
    expect(emitted).toEqual(['scan:actor-1:restart-single-flight']);
    expect(transactionPort.readPendingCommands()).toEqual([]);
    expect(transactionPort.readCommandDeliveries()).toEqual([delivery]);
  });

  it('acks X only from a correlated durable delivery proof and replays after emit-then-throw', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-release-command-replay-'));
    try {
      const transactionPort = new FileReleaseReadinessTransactionPort({ directory });
      const { context } = createActor({ transactionPort });
      const emitted: string[] = [];
      const delivery = (releaseId: string) => {
        const value = {
          schema: 'missionpulse.release-command-delivery' as const,
          version: 1 as const,
          deliveryId: `delivery-${releaseId === context.candidate.releaseId ? 'valid' : 'hostile'}`,
          commandId: 'scan:actor-1:restart-proof',
          actorId: 'actor-1',
          releaseId,
          restartId: 'restart-proof',
          durablyAcceptedAt: '2026-07-16T10:01:01.000Z',
          receiptSha256: '',
        };
        value.receiptSha256 = computeReleaseCommandDeliveryReceiptSha256(value);
        return value;
      };
      const durableReceiverReceipts = new Map<string, ReturnType<typeof delivery>>();
      let receiverSideEffects = 0;
      const idempotentDurableReceiver = (commandId: string) => {
        const existing = durableReceiverReceipts.get(commandId);
        if (existing !== undefined) {
          return existing;
        }
        receiverSideEffects += 1;
        const receipt = delivery(context.candidate.releaseId);
        durableReceiverReceipts.set(commandId, receipt);
        return receipt;
      };
      const crashPorts: TestReducerPorts = {
        ...reducerPorts(transactionPort),
        emitCommand(command) {
          emitted.push(command.commandId);
          idempotentDurableReceiver(command.commandId);
          throw new Error('transport accepted bytes, then controller crashed');
        },
      };
      const restarted = reduceWithPorts(
        context,
        {
          type: 'SERVICE_RESTARTED',
          releaseId: context.candidate.releaseId,
          restartId: 'restart-proof',
          restartedAt: '2026-07-16T10:01:00.000Z',
        },
        crashPorts
      );
      expect(restarted.accepted).toBe(true);
      expect(transactionPort.readPendingCommands()).toHaveLength(1);
      const hostilePorts: TestReducerPorts = {
        ...reducerPorts(transactionPort),
        emitCommand(command) {
          emitted.push(command.commandId);
          return delivery('release-attacker');
        },
      };
      expect(createReleaseReadinessController(transactionPort, hostilePorts).drainOutbox()).toEqual(
        { attempted: 1, acknowledged: 0, pending: 1 }
      );

      const replayPorts: TestReducerPorts = {
        ...reducerPorts(transactionPort),
        emitCommand(command) {
          emitted.push(command.commandId);
          return idempotentDurableReceiver(command.commandId);
        },
      };
      expect(createReleaseReadinessController(transactionPort, replayPorts).drainOutbox()).toEqual({
        attempted: 1,
        acknowledged: 1,
        pending: 0,
      });
      expect(emitted).toEqual([
        'scan:actor-1:restart-proof',
        'scan:actor-1:restart-proof',
        'scan:actor-1:restart-proof',
      ]);
      expect(receiverSideEffects).toBe(1);
      expect(transactionPort.readCommandDeliveries()).toEqual([
        expect.objectContaining({
          deliveryId: 'delivery-valid',
          releaseId: context.candidate.releaseId,
          restartId: 'restart-proof',
        }),
      ]);

      const reopened = new FileReleaseReadinessTransactionPort({ directory });
      expect(reopened.readPendingCommands()).toEqual([]);
      expect(reopened.readCommandDeliveries()).toEqual(transactionPort.readCommandDeliveries());
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('snapshots a getter-backed event exactly once before validation and persistence', () => {
    const { context, transactionPort } = createActor();
    const ports = reducerPorts(transactionPort);
    let reads = 0;
    const event = {
      type: 'BLOCKERS_INGESTED' as const,
      get error() {
        reads += 1;
        return { code: 'getter-event', read: reads };
      },
    };

    const result = reduceWithPorts(context, event, ports);

    expect(result).toMatchObject({
      accepted: true,
      context: { lastError: { code: 'getter-event', read: 1 } },
    });
    expect(reads).toBe(1);
    expect(transactionPort.readActor(context.actorId)).toEqual(result.context);
  });

  it('snapshots a getter-backed seal validator result once before IDs and persistence', () => {
    const { context, transactionPort } = createActor();
    const basePorts = reducerPorts(transactionPort);
    let sealIdReads = 0;
    const ports: TestReducerPorts = {
      ...basePorts,
      validateFinalSeal(value, candidate) {
        const identity = basePorts.validateFinalSeal(value, candidate);
        const { sealId: _sealId, ...rest } = identity;
        return {
          ...rest,
          get sealId() {
            sealIdReads += 1;
            return `seal-snapshot-${sealIdReads}`;
          },
        };
      },
    };

    const result = reduceWithPorts(context, { type: 'RC_SEAL_INGESTED', seal: seal() }, ports);

    expect(result).toMatchObject({
      accepted: true,
      context: {
        sealIdentity: { sealId: 'seal-snapshot-1' },
        acceptedLocalEvents: [expect.objectContaining({ stableIds: ['seal-snapshot-1'] })],
      },
    });
    expect(sealIdReads).toBe(1);
  });

  it('snapshots authorization and observation validator results once before replay/persistence', () => {
    const prepared = contextAtState('package_validated');
    const basePorts = prepared.ports;
    let replayRecordReads = 0;
    const storePorts: TestReducerPorts = {
      ...basePorts,
      validateAuthorization(value, action, context, ingestedAt) {
        const identity = basePorts.validateAuthorization(value, action, context, ingestedAt);
        return {
          authorizationId: identity.authorizationId,
          get replayRecord() {
            replayRecordReads += 1;
            return identity.replayRecord;
          },
        };
      },
    };
    const storeReady = reduceWithPorts(
      prepared.context,
      {
        type: 'STORE_READINESS_INGESTED',
        store: { receiptId: 'store-1' },
        authorization: { receiptId: 'authorization-store' },
        ingestedAt: '2026-07-16T10:11:00.000Z',
        expectedRegistryRevision: 0,
      },
      storePorts
    );

    expect(storeReady.accepted).toBe(true);
    expect(replayRecordReads).toBe(1);

    let observationIdReads = 0;
    const restartPorts: TestReducerPorts = {
      ...basePorts,
      validateLocalObservation(value, context) {
        const identity = basePorts.validateLocalObservation(value, context);
        const { observationId: _observationId, ...rest } = identity;
        return {
          ...rest,
          get observationId() {
            observationIdReads += 1;
            return `observation-snapshot-${observationIdReads}`;
          },
        };
      },
    };
    const restarted = reduceWithPorts(
      storeReady.context,
      {
        type: 'SERVICE_RESTARTED',
        releaseId: storeReady.context.candidate.releaseId,
        restartId: 'restart-snapshot',
        restartedAt: '2026-07-16T10:20:00.000Z',
      },
      restartPorts
    );
    const observed = reduceWithPorts(
      restarted.context,
      {
        type: 'LOCAL_RELEASE_OBSERVATION_INGESTED',
        observation: {
          observationId: 'observation-input',
          restartId: 'restart-snapshot',
          valid: true,
          error: null,
        },
      },
      restartPorts
    );

    expect(observed).toMatchObject({
      accepted: true,
      context: {
        lastLocalObservation: { observationId: 'observation-snapshot-1' },
      },
    });
    expect(observationIdReads).toBe(1);
  });

  it('rejects a Proxy event before any actor or catalog mutation', () => {
    const { context, transactionPort } = createActor();
    const ports = reducerPorts(transactionPort);
    const event = new Proxy(
      { type: 'BLOCKERS_INGESTED' as const, error: { code: 'proxy-event' } },
      {}
    );

    const result = reduceWithPorts(context, event, ports);

    expect(result.accepted).toBe(false);
    expect(transactionPort.readActor(context.actorId)).toEqual(context);
    expect(transactionPort.readCatalog().revision).toBe(1);
  });

  it('accepts only observation-bound J/P recovery and deliberately remains blocked', () => {
    const { context, transactionPort } = createActor();
    const ports = reducerPorts(transactionPort);
    const verified = advanceThroughVerification(context, ports);
    const blocked = reduceWithPorts(
      verified,
      { type: 'BLOCKERS_INGESTED', error: { code: 'crash' } },
      ports
    );
    const unobserved = reduceWithPorts(
      blocked.context,
      {
        type: 'PACKAGE_JOURNAL_INGESTED',
        journal: {
          journalId: 'journal-1',
          previousJournalSha256: null,
          journalSha256: HASH,
        },
        recoveryObservationId: null,
      },
      ports
    );
    expect(unobserved).toMatchObject({
      accepted: false,
      code: 'RESTART_OBSERVATION_INVALID',
    });

    const restarted = reduceWithPorts(
      blocked.context,
      {
        type: 'SERVICE_RESTARTED',
        releaseId: context.candidate.releaseId,
        restartId: 'restart-recovery',
        restartedAt: '2026-07-16T10:10:00.000Z',
      },
      ports
    );
    const observed = reduceWithPorts(
      restarted.context,
      {
        type: 'LOCAL_RELEASE_OBSERVATION_INGESTED',
        observation: {
          observationId: 'observation-recovery',
          restartId: 'restart-recovery',
          valid: true,
          error: null,
          recoveredJournalSha256: HASH,
          recoveredArtifactSha256: HASH,
        },
      },
      ports
    );
    const journaled = reduceWithPorts(
      observed.context,
      {
        type: 'PACKAGE_JOURNAL_INGESTED',
        journal: {
          journalId: 'journal-1',
          previousJournalSha256: null,
          journalSha256: HASH,
        },
        recoveryObservationId: 'observation-recovery',
      },
      ports
    );
    const published = reduceWithPorts(
      journaled.context,
      {
        type: 'PACKAGE_VALIDATED_INGESTED',
        artifact: { artifactId: 'artifact-1' },
        expectedCatalogRevision: 1,
        recoveryObservationId: 'observation-recovery',
      },
      ports
    );

    expect(journaled).toMatchObject({ accepted: true, context: { state: 'blocked' } });
    expect(published).toMatchObject({ accepted: true, context: { state: 'blocked' } });
    expect(transactionPort.readCatalog()).toMatchObject({
      revision: 2,
      records: [
        expect.objectContaining({ kind: 'candidate_reserved' }),
        expect.objectContaining({ kind: 'artifact_published', artifactId: 'artifact-1' }),
      ],
    });
  });

  it('replaces a blocked candidate with one grouped abandon+reserve catalog CAS', () => {
    const { context, transactionPort } = createActor();
    const ports = reducerPorts(transactionPort);
    const blocked = reduceWithPorts(
      context,
      { type: 'BLOCKERS_INGESTED', error: { code: 'replace-me' } },
      ports
    );
    const replacementCommit = '34'.repeat(20);
    const replacementTree = '56'.repeat(20);
    const replacementManifest = Buffer.from(
      SOURCE_MANIFEST_BYTES.toString().replace('0.2.2', '0.2.3')
    );
    const replacementSource = sourcePort(
      {
        'apps/extension/package.json': Buffer.from('{"version":"0.2.3"}'),
        'apps/extension/src/manifest.json': replacementManifest,
        'dist/manifest.json': replacementManifest,
      },
      replacementCommit,
      replacementTree
    );
    const candidate = deriveCandidateIdentity({
      seed: candidateSeed('release-0.2.3', replacementCommit, replacementTree),
      sourcePort: replacementSource,
    });
    const audit = {
      ...auditFor(candidate),
      receiptId: 'audit-2',
      recordedAt: '2026-07-16T10:01:00.000Z',
    };
    const restarted = reduceWithPorts(
      blocked.context,
      {
        type: 'SERVICE_RESTARTED',
        releaseId: context.candidate.releaseId,
        restartId: 'restart-before-replacement',
        restartedAt: '2026-07-16T10:01:30.000Z',
      },
      ports
    );
    const observed = reduceWithPorts(
      restarted.context,
      {
        type: 'LOCAL_RELEASE_OBSERVATION_INGESTED',
        observation: {
          observationId: 'observation-before-replacement',
          restartId: 'restart-before-replacement',
          releaseId: context.candidate.releaseId,
          journalId: null,
          valid: true,
          error: null,
          staging: { kind: 'absent' },
          final: { kind: 'absent' },
        },
      },
      ports
    );
    const replaced = reduceWithPorts(
      observed.context,
      {
        type: 'NEW_CANDIDATE_INGESTED',
        candidate,
        audit,
        catalogedAt: '2026-07-16T10:02:00.000Z',
        expectedCatalogRevision: 1,
      },
      ports
    );

    expect(replaced).toMatchObject({
      accepted: true,
      context: {
        state: 'audited',
        candidate: { releaseId: 'release-0.2.3' },
        seal: null,
        artifact: null,
        lastError: null,
        candidateHistory: [
          expect.objectContaining({
            candidate: expect.objectContaining({ releaseId: 'release-0.2.2' }),
            contextSha256: releaseContextSha256(observed.context),
          }),
        ],
      },
    });
    expect(transactionPort.readCatalog()).toMatchObject({
      revision: 2,
      records: [
        expect.objectContaining({ kind: 'candidate_reserved', releaseId: 'release-0.2.2' }),
        expect.objectContaining({ kind: 'candidate_abandoned', releaseId: 'release-0.2.2' }),
        expect.objectContaining({ kind: 'candidate_reserved', releaseId: 'release-0.2.3' }),
      ],
    });
  });

  it('rejects same-namespace abandonment without an exact persisted absence observation', () => {
    const { context, transactionPort } = createActor();
    const ports = reducerPorts(transactionPort);
    const blocked = reduceWithPorts(
      context,
      { type: 'BLOCKERS_INGESTED', error: { code: 'replace-me' } },
      ports
    );
    const replacementCommit = '34'.repeat(20);
    const replacementTree = '56'.repeat(20);
    const replacementSource = sourcePort({}, replacementCommit, replacementTree);
    const candidate = deriveCandidateIdentity({
      seed: candidateSeed('release-unobserved', replacementCommit, replacementTree),
      sourcePort: replacementSource,
    });

    const result = reduceWithPorts(
      blocked.context,
      {
        type: 'NEW_CANDIDATE_INGESTED',
        candidate,
        audit: { ...auditFor(candidate), receiptId: 'audit-unobserved' },
        catalogedAt: '2026-07-16T10:02:00.000Z',
        expectedCatalogRevision: 1,
      },
      ports
    );

    expect(result).toMatchObject({ accepted: false, code: 'CANDIDATE_REPLACEMENT_UNSAFE' });
    expect(transactionPort.readActor(context.actorId)).toEqual(blocked.context);
    expect(transactionPort.readCatalog().revision).toBe(1);
  });

  it('requires an exact absence observation before rebinding an abandoned namespace', () => {
    const { context, transactionPort } = createActor();
    const ports = reducerPorts(transactionPort);
    const blocked = reduceWithPorts(
      context,
      { type: 'BLOCKERS_INGESTED', error: { code: 'replace-me' } },
      ports
    );
    const replacementCommit = '34'.repeat(20);
    const replacementTree = '56'.repeat(20);
    const replacementSource = sourcePort({}, replacementCommit, replacementTree);
    const candidate = deriveCandidateIdentity({
      seed: candidateSeed('release-same-namespace', replacementCommit, replacementTree),
      sourcePort: replacementSource,
    });
    const audit = { ...auditFor(candidate), receiptId: 'audit-same-namespace' };
    const rejected = reduceWithPorts(
      blocked.context,
      {
        type: 'NEW_CANDIDATE_INGESTED',
        candidate,
        audit,
        catalogedAt: '2026-07-16T10:02:00.000Z',
        expectedCatalogRevision: 1,
      },
      ports
    );

    expect(rejected).toMatchObject({
      accepted: false,
      code: 'CANDIDATE_REPLACEMENT_UNSAFE',
    });
    expect(transactionPort.readActor(context.actorId)).toEqual(blocked.context);
    expect(transactionPort.readCatalog()).toMatchObject({ revision: 1 });
  });

  it('rejects a live journal until a correlated observation proves terminal cleanup', () => {
    const { context, transactionPort } = createActor();
    const ports = reducerPorts(transactionPort);
    const verified = advanceThroughVerification(context, ports);
    const journaled = reduceWithPorts(
      verified,
      {
        type: 'PACKAGE_JOURNAL_INGESTED',
        journal: {
          journalId: 'journal-1',
          previousJournalSha256: null,
          journalSha256: HASH,
        },
      },
      ports
    );
    const blocked = reduceWithPorts(
      journaled.context,
      { type: 'BLOCKERS_INGESTED', error: { code: 'cleanup-required' } },
      ports
    );
    const replacementCommit = '34'.repeat(20);
    const replacementTree = '56'.repeat(20);
    const replacementManifest = Buffer.from(
      SOURCE_MANIFEST_BYTES.toString().replace('0.2.2', '0.2.3')
    );
    const candidate = deriveCandidateIdentity({
      seed: candidateSeed('release-after-cleanup', replacementCommit, replacementTree),
      sourcePort: sourcePort(
        {
          'apps/extension/package.json': Buffer.from('{"version":"0.2.3"}'),
          'apps/extension/src/manifest.json': replacementManifest,
          'dist/manifest.json': replacementManifest,
        },
        replacementCommit,
        replacementTree
      ),
    });
    const event = {
      type: 'NEW_CANDIDATE_INGESTED' as const,
      candidate,
      audit: { ...auditFor(candidate), receiptId: 'audit-after-cleanup' },
      catalogedAt: '2026-07-16T10:20:00.000Z',
      expectedCatalogRevision: 1,
    };
    const premature = reduceWithPorts(blocked.context, event, ports);
    expect(premature).toMatchObject({
      accepted: false,
      code: 'CANDIDATE_REPLACEMENT_UNSAFE',
    });

    const restarted = reduceWithPorts(
      blocked.context,
      {
        type: 'SERVICE_RESTARTED',
        releaseId: context.candidate.releaseId,
        restartId: 'restart-cleanup',
        restartedAt: '2026-07-16T10:18:00.000Z',
      },
      ports
    );
    const observed = reduceWithPorts(
      restarted.context,
      {
        type: 'LOCAL_RELEASE_OBSERVATION_INGESTED',
        observation: {
          observationId: 'observation-cleanup',
          restartId: 'restart-cleanup',
          releaseId: context.candidate.releaseId,
          journalId: 'journal-1',
          valid: true,
          error: null,
          staging: { kind: 'absent' },
          final: { kind: 'absent' },
        },
      },
      ports
    );
    const cleaned = reduceWithPorts(
      observed.context,
      {
        type: 'PACKAGE_JOURNAL_INGESTED',
        journal: {
          journalId: 'journal-1',
          previousJournalSha256: HASH,
          journalSha256: ALT_HASH,
          history: [{ phase: 'cleaned' }],
        },
        recoveryObservationId: 'observation-cleanup',
      },
      ports
    );
    const replaced = reduceWithPorts(cleaned.context, event, ports);

    expect(replaced).toMatchObject({
      accepted: true,
      context: { state: 'audited', candidate: { releaseId: 'release-after-cleanup' } },
    });
    expect(transactionPort.readCatalog()).toMatchObject({ revision: 2 });
  });
});
