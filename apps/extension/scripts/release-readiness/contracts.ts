import { TextDecoder } from 'node:util';

import { z } from 'zod';

import { jcsCanonicalize, sha256Hex, sha256Jcs, withoutKey } from './canonical';
import { inspectPrivilegedWorkflow } from './workflow-policy';

export { jcsCanonicalize, sha256Hex } from './canonical';

const SHA256 = /^[0-9a-f]{64}$/;
const SHA1 = /^[0-9a-f]{40}$/;
const ASCII_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const UTC =
  /^(?:[2-9]\d{3})-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/;
const MIN_RELEASE_INSTANT_MS = 946_684_800_000;
const MAX_RELEASE_INSTANT_MS = 253_402_300_799_999;
const MAX_ATTESTATION_BYTES = 16_777_216;

const sha256Schema = z.string().regex(SHA256);
const sha1Schema = z.string().regex(SHA1);
const gitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
const safeNonnegativeInteger = z.number().int().safe().nonnegative();
const positiveSafeInteger = z.number().int().safe().positive();
const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(ASCII_ID)
  .refine((value) => Buffer.byteLength(value, 'ascii') <= 128);
const semverSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(SEMVER)
  .superRefine((value, ctx) => {
    try {
      parseCanonicalSemVer(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : 'SemVer is invalid.',
      });
    }
  });
const timestampSchema = z
  .string()
  .regex(UTC)
  .refine((value) => {
    const epoch = Date.parse(value);
    return (
      Number.isSafeInteger(epoch) &&
      epoch >= MIN_RELEASE_INSTANT_MS &&
      epoch <= MAX_RELEASE_INSTANT_MS &&
      new Date(epoch).toISOString() === value
    );
  });

export interface CanonicalSemVerParts {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly (number | string)[];
  readonly build: readonly string[];
}

export function parseCanonicalSemVer(value: string): CanonicalSemVerParts {
  const match = SEMVER.exec(value);
  if (match === null || value.length > 64 || Buffer.byteLength(value, 'ascii') !== value.length) {
    throw new Error('SemVer is not canonical ASCII.');
  }
  const parseSafeInteger = (raw: string, label: string): number => {
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`SemVer ${label} must fit a safe integer.`);
    }
    return parsed;
  };
  const prerelease =
    match[4]
      ?.split('.')
      .map((identifier) =>
        /^\d+$/.test(identifier)
          ? parseSafeInteger(identifier, 'prerelease identifier')
          : identifier
      ) ?? [];
  const build = match[5]?.split('.') ?? [];
  for (const identifier of build) {
    if (/^\d+$/.test(identifier)) {
      if (identifier.length > 1 && identifier.startsWith('0')) {
        throw new Error('Numeric SemVer identifiers cannot contain a leading zero.');
      }
      parseSafeInteger(identifier, 'build identifier');
    }
  }
  return {
    major: parseSafeInteger(match[1] ?? '', 'major'),
    minor: parseSafeInteger(match[2] ?? '', 'minor'),
    patch: parseSafeInteger(match[3] ?? '', 'patch'),
    prerelease,
    build,
  };
}

export function compareCanonicalSemVer(leftValue: string, rightValue: string): number {
  const left = parseCanonicalSemVer(leftValue);
  const right = parseCanonicalSemVer(rightValue);
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) {
      return left[key] < right[key] ? -1 : 1;
    }
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) {
      return 0;
    }
    return left.prerelease.length === 0 ? 1 : -1;
  }
  const count = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < count; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined) {
      return -1;
    }
    if (rightIdentifier === undefined) {
      return 1;
    }
    if (leftIdentifier === rightIdentifier) {
      continue;
    }
    if (typeof leftIdentifier === 'number' && typeof rightIdentifier === 'number') {
      return leftIdentifier < rightIdentifier ? -1 : 1;
    }
    if (typeof leftIdentifier === 'number') {
      return -1;
    }
    if (typeof rightIdentifier === 'number') {
      return 1;
    }
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }
  return 0;
}

function sortedUnique(values: readonly string[]): boolean {
  return (
    new Set(values).size === values.length &&
    values.every((value, index) => {
      const previous = values[index - 1];
      return index === 0 || (previous !== undefined && previous < value);
    })
  );
}

const boundedAsciiSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[\x21-\x7e]+$/)
  .refine((value) => Buffer.byteLength(value, 'ascii') <= 512);

const sortedAsciiArraySchema = z
  .array(boundedAsciiSchema)
  .max(128)
  .refine(sortedUnique, 'Array must be duplicate-free and sorted by unsigned ASCII bytes.');

function decodeCanonicalBase64(value: string, maxBytes: number, label: string): Buffer {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) ||
    Math.floor((value.length / 4) * 3) > maxBytes + 2
  ) {
    throw new Error(`${label} is not bounded canonical padded base64.`);
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.byteLength > maxBytes || bytes.toString('base64') !== value) {
    throw new Error(`${label} is not bounded canonical padded base64.`);
  }
  return bytes;
}

function parseExactJcsBase64(value: string, maxBytes: number, label: string): Buffer {
  const bytes = decodeCanonicalBase64(value, maxBytes, label);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new Error(`${label} does not decode to strict JSON.`);
  }
  if (!Buffer.from(jcsCanonicalize(parsed)).equals(bytes)) {
    throw new Error(`${label} does not decode to exact JCS bytes.`);
  }
  return bytes;
}

function issue(ctx: z.RefinementCtx, message: string, path: (string | number)[] = []): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
}

const immutableBlobRefSchema = z
  .object({
    schema: z.literal('missionpulse.immutable-blob'),
    version: z.literal(1),
    kind: boundedAsciiSchema,
    immutableUri: z.string().min(1).max(2048),
    sha256: sha256Schema,
    bytes: safeNonnegativeInteger.max(536_870_912),
  })
  .strict();

const pinnedWorkflowUseSchema = z
  .object({
    stepId: idSchema,
    usesLiteral: boundedAsciiSchema,
    repository: boundedAsciiSchema,
    actionPath: z.string().min(1).max(512).nullable(),
    commitSha: sha1Schema,
  })
  .strict();

const transportAttestationPolicySchema = z
  .object({
    schema: z.literal('missionpulse.github-transport-attestation-policy'),
    version: z.literal(1),
    policySha256: sha256Schema,
    provider: z.literal('github-artifact-attestations'),
    oidcIssuer: z.literal('https://token.actions.githubusercontent.com'),
    sourceRepository: z
      .string()
      .regex(/^[a-z0-9._-]+\/[a-z0-9._-]+$/)
      .max(512),
    sourceRef: z.literal('refs/heads/main'),
    workflowPath: z.literal('.github/workflows/ci.yml'),
    workflowBlobUtf8Base64: z.string().min(4).max(349_528),
    workflowBlobSha256: sha256Schema,
    privilegedJobId: z.literal('seal-candidate'),
    privilegedJobProjectionSha256: sha256Schema,
    privilegedJobUses: z.array(pinnedWorkflowUseSchema).min(1).max(32),
    predicateType: z.literal('https://slsa.dev/provenance/v1'),
    trustedRootJcsBase64: z.string().min(4).max(22_369_624),
    trustedRootJcsSha256: sha256Schema,
  })
  .strict()
  .superRefine((policy, ctx) => {
    try {
      const workflowBytes = decodeCanonicalBase64(
        policy.workflowBlobUtf8Base64,
        262_144,
        'workflowBlobUtf8Base64'
      );
      if (sha256Hex(workflowBytes) !== policy.workflowBlobSha256) {
        issue(ctx, 'Workflow blob SHA-256 mismatch.', ['workflowBlobSha256']);
      }
      const inspected = inspectPrivilegedWorkflow(workflowBytes);
      if (inspected.projectionSha256 !== policy.privilegedJobProjectionSha256) {
        issue(ctx, 'Privileged job projection SHA-256 mismatch.', [
          'privilegedJobProjectionSha256',
        ]);
      }
      if (jcsCanonicalize(inspected.uses) !== jcsCanonicalize(policy.privilegedJobUses)) {
        issue(ctx, 'Privileged workflow uses inventory mismatch.', ['privilegedJobUses']);
      }
      const roots = parseExactJcsBase64(
        policy.trustedRootJcsBase64,
        MAX_ATTESTATION_BYTES,
        'trustedRootJcsBase64'
      );
      if (sha256Hex(roots) !== policy.trustedRootJcsSha256) {
        issue(ctx, 'Trusted-root JCS SHA-256 mismatch.', ['trustedRootJcsSha256']);
      }
      if (computePolicySha256(policy) !== policy.policySha256) {
        issue(ctx, 'Transport attestation policy SHA-256 mismatch.', ['policySha256']);
      }
    } catch (error) {
      issue(ctx, error instanceof Error ? error.message : 'Transport policy validation failed.');
    }
  });

const manifestAuthoritySchema = z
  .object({
    schema: z.literal('missionpulse.manifest-authority'),
    version: z.literal(1),
    manifestVersion: z.literal(3),
    extensionVersion: semverSchema,
    minimumChromeVersion: boundedAsciiSchema,
    manifestSha256: sha256Schema,
    permissions: sortedAsciiArraySchema,
    hostPermissions: sortedAsciiArraySchema,
    optionalHostPermissions: sortedAsciiArraySchema,
    permissionSetSha256: sha256Schema,
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const expected = sha256Jcs({
      permissions: manifest.permissions,
      hostPermissions: manifest.hostPermissions,
      optionalHostPermissions: manifest.optionalHostPermissions,
    });
    if (manifest.permissionSetSha256 !== expected) {
      issue(ctx, 'Manifest permission-set SHA-256 mismatch.', ['permissionSetSha256']);
    }
  });

const signaturePolicySchema = z
  .object({
    schema: z.literal('missionpulse.signature-policy'),
    version: z.literal(1),
    purpose: z.enum(['authorization', 'external_receipt']),
    policySha256: sha256Schema,
    allowedProvider: z.enum(['missionpulse_release_authority', 'chrome_web_store_api']),
    keys: z
      .array(
        z
          .object({
            issuerId: idSchema,
            issuerKeyId: idSchema,
            signatureAlgorithm: z.literal('ed25519'),
            publicKeyBase64: z.string(),
          })
          .strict()
          .superRefine((key, ctx) => {
            try {
              const bytes = decodeCanonicalBase64(key.publicKeyBase64, 32, 'publicKeyBase64');
              if (bytes.byteLength !== 32) {
                issue(ctx, 'Ed25519 public keys must contain exactly 32 bytes.');
              }
            } catch (error) {
              issue(ctx, error instanceof Error ? error.message : 'Invalid public key.');
            }
          })
      )
      .min(1)
      .max(16),
  })
  .strict()
  .superRefine((policy, ctx) => {
    const expectedProvider =
      policy.purpose === 'authorization'
        ? 'missionpulse_release_authority'
        : 'chrome_web_store_api';
    if (policy.allowedProvider !== expectedProvider) {
      issue(ctx, 'Signature policy purpose/provider mismatch.', ['allowedProvider']);
    }
    const identities = policy.keys.map((key) => `${key.issuerId}\0${key.issuerKeyId}`);
    if (new Set(identities).size !== identities.length) {
      issue(ctx, 'Signature policy contains duplicate issuer/key identities.', ['keys']);
    }
    if (computePolicySha256(policy) !== policy.policySha256) {
      issue(ctx, 'Signature policy SHA-256 mismatch.', ['policySha256']);
    }
  });

export const candidateIdentitySchema = z
  .object({
    schema: z.literal('missionpulse.candidate-identity'),
    version: z.literal(1),
    releaseId: idSchema,
    sourceCommit: z
      .string()
      .regex(/^\p{ASCII}+$/u)
      .min(40)
      .max(64),
    gitObjectFormat: z.enum(['sha1', 'sha256']),
    gitTreeObjectId: z
      .string()
      .regex(/^\p{ASCII}+$/u)
      .min(40)
      .max(64),
    committedVersion: semverSchema,
    releaseNamespace: z.string().min(2).max(65),
    lockfileSha256: sha256Schema,
    connectorConfigSha256: sha256Schema,
    includedConnectorIds: z.array(idSchema).max(128).refine(sortedUnique),
    manifest: manifestAuthoritySchema,
    mv3ScenarioInventoryPath: z.literal('apps/extension/tests/mv3/scenarios.v1.json'),
    mv3ScenarioInventoryBlobSha256: sha256Schema,
    expectedMv3ScenarioIds: z.array(idSchema).min(1).max(512).refine(sortedUnique),
    expectedMv3ScenarioInventorySha256: sha256Schema,
    transportAttestationPolicy: transportAttestationPolicySchema,
    authorizationPolicy: signaturePolicySchema,
    externalReceiptPolicy: signaturePolicySchema,
  })
  .strict()
  .superRefine((candidate, ctx) => {
    const objectPattern = candidate.gitObjectFormat === 'sha1' ? SHA1 : SHA256;
    if (!objectPattern.test(candidate.sourceCommit)) {
      issue(ctx, 'Source commit does not match the declared Git object format.', ['sourceCommit']);
    }
    if (!objectPattern.test(candidate.gitTreeObjectId)) {
      issue(ctx, 'Tree object ID does not match the declared Git object format.', [
        'gitTreeObjectId',
      ]);
    }
    if (candidate.releaseNamespace !== `v${candidate.committedVersion}`) {
      issue(ctx, 'Release namespace must be derived from committedVersion.', ['releaseNamespace']);
    }
    if (candidate.manifest.extensionVersion !== candidate.committedVersion) {
      issue(ctx, 'Manifest version differs from committedVersion.', [
        'manifest',
        'extensionVersion',
      ]);
    }
    if (
      candidate.expectedMv3ScenarioInventorySha256 !== sha256Jcs(candidate.expectedMv3ScenarioIds)
    ) {
      issue(ctx, 'Expected MV3 scenario inventory SHA-256 mismatch.', [
        'expectedMv3ScenarioInventorySha256',
      ]);
    }
    if (
      candidate.authorizationPolicy.purpose !== 'authorization' ||
      candidate.externalReceiptPolicy.purpose !== 'external_receipt'
    ) {
      issue(ctx, 'Candidate signature policies have crossed purposes.');
    }
  });

const auditDomainSchema = z.enum([
  'workflows',
  'security',
  'permissions',
  'metadata',
  'ci',
  'runtime',
  'artifact',
  'store',
  'canary',
  'rollback',
]);

export const auditReceiptSchema = z
  .object({
    schema: z.literal('missionpulse.release-audit'),
    version: z.literal(1),
    receiptId: idSchema,
    releaseId: idSchema,
    sourceCommit: gitObjectIdSchema,
    committedVersion: semverSchema,
    releaseNamespace: z.string().min(2).max(65),
    mv3ScenarioInventoryBlobSha256: sha256Schema,
    expectedMv3ScenarioInventorySha256: sha256Schema,
    coveredDomains: z.array(auditDomainSchema).length(10).refine(sortedUnique),
    openP0Count: z.literal(0),
    openP1Count: z.literal(0),
    recordedAt: timestampSchema,
    report: immutableBlobRefSchema,
  })
  .strict();

const catalogRecordSchema = z
  .object({
    catalogSequence: positiveSafeInteger,
    kind: z.enum(['candidate_reserved', 'candidate_abandoned', 'artifact_published']),
    actorId: idSchema,
    releaseId: idSchema,
    sourceCommit: gitObjectIdSchema,
    committedVersion: semverSchema,
    releaseNamespace: z.string().min(2).max(65),
    artifactId: idSchema.nullable(),
    artifactSha256: sha256Schema.nullable(),
    recordedAt: timestampSchema,
  })
  .strict()
  .superRefine((record, ctx) => {
    const published = record.kind === 'artifact_published';
    if (published !== (record.artifactId !== null && record.artifactSha256 !== null)) {
      issue(ctx, 'Catalog artifact fields do not match the record kind.');
    }
    if (record.releaseNamespace !== `v${record.committedVersion}`) {
      issue(ctx, 'Catalog release namespace must derive from committedVersion.');
    }
  });

function expectedCatalogRevision(records: readonly z.infer<typeof catalogRecordSchema>[]): number {
  let revision = 0;
  for (let index = 0; index < records.length; index += 1) {
    revision += 1;
    const record = records[index];
    const next = records[index + 1];
    if (
      record?.kind === 'candidate_abandoned' &&
      next?.kind === 'candidate_reserved' &&
      record.actorId === next.actorId &&
      record.recordedAt === next.recordedAt
    ) {
      index += 1;
    }
  }
  return revision;
}

function validateCatalogLifecycle(
  records: readonly z.infer<typeof catalogRecordSchema>[],
  ctx: z.RefinementCtx
): void {
  const byRelease = new Map<string, z.infer<typeof catalogRecordSchema>[]>();
  const activeNamespaces = new Map<string, string>();
  const publishedNamespaces = new Set<string>();
  let previousRecordedAt = Number.NEGATIVE_INFINITY;

  for (const record of records) {
    const recordedAt = Date.parse(record.recordedAt);
    if (recordedAt < previousRecordedAt) {
      issue(ctx, 'Catalog chronology must follow catalogSequence.', ['records']);
    }
    previousRecordedAt = recordedAt;

    const releaseRecords = byRelease.get(record.releaseId) ?? [];
    if (releaseRecords.length === 0) {
      if (record.kind !== 'candidate_reserved') {
        issue(ctx, 'Every catalog lifecycle must begin with candidate_reserved.', ['records']);
      }
      if (
        activeNamespaces.has(record.releaseNamespace) ||
        publishedNamespaces.has(record.releaseNamespace)
      ) {
        issue(ctx, 'Catalog namespace is already active or permanently published.', ['records']);
      }
      activeNamespaces.set(record.releaseNamespace, record.releaseId);
    } else {
      const reservation = releaseRecords[0];
      if (
        releaseRecords.length !== 1 ||
        reservation === undefined ||
        record.kind === 'candidate_reserved'
      ) {
        issue(ctx, 'Catalog release has more than one reservation/terminal transition.', [
          'records',
        ]);
      } else if (
        record.actorId !== reservation.actorId ||
        record.sourceCommit !== reservation.sourceCommit ||
        record.committedVersion !== reservation.committedVersion ||
        record.releaseNamespace !== reservation.releaseNamespace
      ) {
        issue(ctx, 'Catalog terminal record rewrites its reservation identity.', ['records']);
      }
      if (activeNamespaces.get(record.releaseNamespace) !== record.releaseId) {
        issue(ctx, 'Catalog terminal record has no matching active reservation.', ['records']);
      } else {
        activeNamespaces.delete(record.releaseNamespace);
      }
      if (record.kind === 'artifact_published') {
        if (publishedNamespaces.has(record.releaseNamespace)) {
          issue(ctx, 'Published catalog namespace cannot be reused.', ['records']);
        }
        publishedNamespaces.add(record.releaseNamespace);
      }
    }
    releaseRecords.push(record);
    byRelease.set(record.releaseId, releaseRecords);
  }
}

export const globalReleaseCatalogSchema = z
  .object({
    schema: z.literal('missionpulse.global-release-catalog'),
    version: z.literal(1),
    revision: safeNonnegativeInteger,
    catalogSha256: sha256Schema,
    records: z.array(catalogRecordSchema).max(256),
  })
  .strict()
  .superRefine((catalog, ctx) => {
    if (catalog.records.some((record, index) => record.catalogSequence !== index + 1)) {
      issue(ctx, 'Catalog record sequences must be consecutive from one.', ['records']);
    }
    if (catalog.revision !== expectedCatalogRevision(catalog.records)) {
      issue(ctx, 'Catalog revision is inconsistent with grouped append CAS operations.', [
        'revision',
      ]);
    }
    validateCatalogLifecycle(catalog.records, ctx);
    if (computeCatalogSha256(catalog) !== catalog.catalogSha256) {
      issue(ctx, 'Catalog SHA-256 mismatch.', ['catalogSha256']);
    }
  });

const githubTransportAttestationSchema = z
  .object({
    schema: z.literal('missionpulse.github-transport-attestation'),
    version: z.literal(1),
    provider: z.literal('github-artifact-attestations'),
    attestationId: idSchema,
    subjectName: z.literal('missionpulse-sealed-candidate'),
    subjectDigest: sha256Schema,
    predicateType: z.literal('https://slsa.dev/provenance/v1'),
    sigstoreBundleJcsBase64: z.string().min(4).max(22_369_624),
    sigstoreBundleJcsSha256: sha256Schema,
    sourceRepository: z
      .string()
      .regex(/^[a-z0-9._-]+\/[a-z0-9._-]+$/)
      .max(512),
    sourceRef: z.literal('refs/heads/main'),
    workflowPath: z.literal('.github/workflows/ci.yml'),
    signerWorkflowRef: z.string().min(1).max(2048),
    signerWorkflowSha: sha1Schema,
    runId: positiveSafeInteger,
    runAttempt: positiveSafeInteger,
    headSha: sha1Schema,
  })
  .strict()
  .superRefine((attestation, ctx) => {
    try {
      const bundle = parseExactJcsBase64(
        attestation.sigstoreBundleJcsBase64,
        MAX_ATTESTATION_BYTES,
        'sigstoreBundleJcsBase64'
      );
      if (sha256Hex(bundle) !== attestation.sigstoreBundleJcsSha256) {
        issue(ctx, 'Sigstore bundle JCS SHA-256 mismatch.', ['sigstoreBundleJcsSha256']);
      }
    } catch (error) {
      issue(ctx, error instanceof Error ? error.message : 'Sigstore bundle validation failed.');
    }
  });

export const sealedCandidateTransportObservationSchema = z
  .object({
    schema: z.literal('missionpulse.sealed-candidate-transport-observation'),
    version: z.literal(1),
    artifactName: z.literal('missionpulse-sealed-candidate'),
    transportFormat: z.literal('missionpulse-canonical-zip-v1'),
    transportBytes: positiveSafeInteger.max(1_073_741_824),
    transportSha256: sha256Schema,
    payloadInventorySha256: sha256Schema,
    capturedAt: timestampSchema,
    preUploadAttestation: githubTransportAttestationSchema,
    uploaderOutputDigest: sha256Schema,
    artifactId: idSchema,
    artifactDigest: sha256Schema,
    downloadedTransportSha256: sha256Schema,
    requestedRetentionDays: z.literal(30),
    workflowPath: z.literal('.github/workflows/ci.yml'),
    runId: positiveSafeInteger,
    runAttempt: positiveSafeInteger,
    headSha: sha1Schema,
    conclusion: z.literal('success'),
    artifactCreatedAt: timestampSchema,
    artifactExpiresAt: timestampSchema,
    observedAt: timestampSchema,
  })
  .strict()
  .superRefine((observation, ctx) => {
    const attestation = observation.preUploadAttestation;
    const digests = [
      attestation.subjectDigest,
      observation.uploaderOutputDigest,
      observation.artifactDigest,
      observation.downloadedTransportSha256,
    ];
    if (digests.some((digest) => digest !== observation.transportSha256)) {
      issue(ctx, 'Transport capture/attestation/upload/API/download digest chain mismatch.');
    }
    if (
      observation.workflowPath !== attestation.workflowPath ||
      observation.runId !== attestation.runId ||
      observation.runAttempt !== attestation.runAttempt ||
      observation.headSha !== attestation.headSha
    ) {
      issue(ctx, 'Transport API identity differs from its attestation.');
    }
    const captured = Date.parse(observation.capturedAt);
    const created = Date.parse(observation.artifactCreatedAt);
    const observed = Date.parse(observation.observedAt);
    const expires = Date.parse(observation.artifactExpiresAt);
    if (!(captured <= created && created <= observed && observed < expires)) {
      issue(ctx, 'Transport chronology is invalid.');
    }
  });

export const releaseExecutionPayloadVerificationSchema = z
  .object({
    schema: z.literal('missionpulse.release-execution-payload-verification'),
    version: z.literal(1),
    verificationId: idSchema,
    verificationSha256: sha256Schema,
    releaseId: idSchema,
    sealId: idSchema,
    sealSha256: sha256Schema,
    sourceCommit: gitObjectIdSchema,
    transportSha256: sha256Schema,
    transportZipReceiptSha256: sha256Schema,
    payloadInventorySha256: sha256Schema,
    controllerBundleSha256: sha256Schema,
    controllerBundleSourceInventorySha256: sha256Schema,
    buildMetadataSha256: sha256Schema,
    buildProvenanceSha256: sha256Schema,
    executionAuthoritySha256: sha256Schema,
    controllerExecutionAuthoritySha256: sha256Schema,
    ociArchiveSha256: sha256Schema,
    ociIndexSha256: sha256Schema,
    ociManifestSha256: sha256Schema,
    ociConfigSha256: sha256Schema,
    layerSha256: z.array(sha256Schema).min(1).max(128),
    diffIdSha256: z.array(sha256Schema).min(1).max(128),
    finalRootInventorySha256: sha256Schema,
    pythonRuntimeTreeSha256: sha256Schema,
    pythonExecutableSha256: sha256Schema,
    effectiveLoadedObjectsSha256: sha256Schema,
    verifiedAt: timestampSchema,
  })
  .strict()
  .superRefine((verification, ctx) => {
    if (verification.layerSha256.length !== verification.diffIdSha256.length) {
      issue(ctx, 'OCI layer and diff-ID arrays must have equal lengths.');
    }
    if (computePayloadVerificationSha256(verification) !== verification.verificationSha256) {
      issue(ctx, 'Payload verification SHA-256 mismatch.', ['verificationSha256']);
    }
  });

export type CandidateIdentityV1 = z.infer<typeof candidateIdentitySchema>;
export type AuditReceiptV1 = z.infer<typeof auditReceiptSchema>;
export type GlobalReleaseCatalogV1 = z.infer<typeof globalReleaseCatalogSchema>;
export type GlobalReleaseCatalogRecordV1 = z.infer<typeof catalogRecordSchema>;
export type SealedCandidateTransportObservationV1 = z.infer<
  typeof sealedCandidateTransportObservationSchema
>;
export type ReleaseExecutionPayloadVerificationV1 = z.infer<
  typeof releaseExecutionPayloadVerificationSchema
>;

export function computePolicySha256(value: Record<string, unknown>): string {
  return sha256Jcs(withoutKey(value, 'policySha256'));
}

export function computeCatalogSha256(value: Record<string, unknown>): string {
  return sha256Jcs(withoutKey(value, 'catalogSha256'));
}

export function computePayloadVerificationSha256(value: Record<string, unknown>): string {
  return sha256Jcs(withoutKey(value, 'verificationSha256'));
}

export function createEmptyReleaseCatalog(): GlobalReleaseCatalogV1 {
  const catalog = {
    schema: 'missionpulse.global-release-catalog' as const,
    version: 1 as const,
    revision: 0,
    catalogSha256: '',
    records: [] as GlobalReleaseCatalogRecordV1[],
  };
  catalog.catalogSha256 = computeCatalogSha256(catalog);
  return globalReleaseCatalogSchema.parse(catalog);
}

export function parseCandidateIdentity(value: unknown): CandidateIdentityV1 {
  return candidateIdentitySchema.parse(value);
}

export function parseAuditReceipt(value: unknown): AuditReceiptV1 {
  return auditReceiptSchema.parse(value);
}

export function parseGlobalReleaseCatalog(value: unknown): GlobalReleaseCatalogV1 {
  return globalReleaseCatalogSchema.parse(value);
}

export function parseSealedCandidateTransportObservation(
  value: unknown
): SealedCandidateTransportObservationV1 {
  return sealedCandidateTransportObservationSchema.parse(value);
}

export function parseReleaseExecutionPayloadVerification(
  value: unknown
): ReleaseExecutionPayloadVerificationV1 {
  return releaseExecutionPayloadVerificationSchema.parse(value);
}
