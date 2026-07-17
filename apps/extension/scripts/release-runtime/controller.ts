import { createHash } from 'node:crypto';

import {
  ReleaseRuntimeContractError,
  assertAuthorizedMountFile,
  assertCandidateArtifactTreeAuthority,
  assertSha256,
  type AuthorizedMountFile,
  type CandidateArtifactTreeAuthority,
} from './contract';
import {
  type ReleaseRuntimeCapability,
  type VerifiedExecutionImageAuthorityV1,
  assertVerifiedExecutionImageAuthority,
  authorizeReleaseRuntimeObservation,
} from './proof';

const REQUIRED_EVIDENCE_PATHS = Object.freeze([
  'build-metadata.json',
  'build-provenance.json',
  'release-execution-authority.json',
  'tested-dist-seal.json',
  'transport-zip-receipt.json',
]);
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export interface ReleasePayloadVerificationAuthorityV1 {
  readonly verificationId: string;
  readonly releaseId: string;
  readonly sealId: string;
  readonly sealSha256: string;
  readonly sourceCommit: string;
  readonly transportSha256: string;
  readonly transportZipReceiptSha256: string;
  readonly payloadInventorySha256: string;
  readonly ociArchiveSha256: string;
  readonly verifiedAt: string;
}

export interface ReleaseControllerExecutionAuthorityV1 {
  readonly schema: 'missionpulse.release-controller-execution-authority';
  readonly version: 1;
  readonly authoritySha256: string;
  readonly executionImage: VerifiedExecutionImageAuthorityV1;
  readonly controllerBundleSha256: string;
  readonly controllerSourceInventorySha256: string;
  readonly candidateArtifactTree: CandidateArtifactTreeAuthority;
  readonly evidenceInventory: readonly AuthorizedMountFile[];
  readonly payload: ReleasePayloadVerificationAuthorityV1;
  readonly invocationPolicySha256: string;
  readonly effectiveLoadedObjectsSha256: string;
}

export interface ReleaseExecutionPayloadVerificationV1 {
  readonly schema: 'missionpulse.release-execution-payload-verification';
  readonly version: 1;
  readonly verificationId: string;
  readonly verificationSha256: string;
  readonly releaseId: string;
  readonly sealId: string;
  readonly sealSha256: string;
  readonly sourceCommit: string;
  readonly transportSha256: string;
  readonly transportZipReceiptSha256: string;
  readonly payloadInventorySha256: string;
  readonly controllerBundleSha256: string;
  readonly controllerBundleSourceInventorySha256: string;
  readonly buildMetadataSha256: string;
  readonly buildProvenanceSha256: string;
  readonly executionAuthoritySha256: string;
  readonly controllerExecutionAuthoritySha256: string;
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
  readonly verifiedAt: string;
}

/** Compatibility name retained for existing runtime call sites. */
export type ReleaseRuntimeEvidenceV1 = ReleaseExecutionPayloadVerificationV1;

export interface ReleasePayloadObservationV1 {
  readonly candidateArtifactTree: CandidateArtifactTreeAuthority;
  readonly evidenceInventory: readonly AuthorizedMountFile[];
  readonly controllerBundleSha256: string;
}

export interface ReleaseRuntimeControllerPorts {
  readonly readExecutionAuthority: () => Promise<unknown>;
  readonly observeRuntime: (authority: VerifiedExecutionImageAuthorityV1) => Promise<unknown>;
  readonly observePayload: (
    authority: ReleaseControllerExecutionAuthorityV1
  ) => Promise<ReleasePayloadObservationV1>;
  readonly publishRuntimeEvidence: (
    evidence: ReleaseExecutionPayloadVerificationV1
  ) => Promise<void>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new ReleaseRuntimeContractError(`${label} has an unexpected shape.`);
  }
}

function digest(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new ReleaseRuntimeContractError(`${label} is missing.`);
  }
  assertSha256(value, label);
  return value;
}

function boundedId(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 256 ||
    !/^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    throw new ReleaseRuntimeContractError(`${label} is not one bounded canonical identifier.`);
  }
  return value;
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function assertEvidenceInventory(raw: unknown): readonly AuthorizedMountFile[] {
  if (!Array.isArray(raw) || raw.length !== REQUIRED_EVIDENCE_PATHS.length) {
    throw new ReleaseRuntimeContractError('Execution evidence inventory is not exact.');
  }
  const entries = raw.map((entry, index) =>
    assertAuthorizedMountFile(entry, `evidenceInventory[${index}]`)
  );
  if (
    entries.some(
      (entry, index) =>
        entry.path !== REQUIRED_EVIDENCE_PATHS[index] ||
        (index > 0 && compareUtf8(entries[index - 1].path, entry.path) >= 0)
    )
  ) {
    throw new ReleaseRuntimeContractError(
      'Execution evidence paths are missing, extra or reordered.'
    );
  }
  return Object.freeze(entries);
}

function evidenceDigest(entries: readonly AuthorizedMountFile[], path: string): string {
  const entry = entries.find((candidate) => candidate.path === path);
  if (entry === undefined) {
    throw new ReleaseRuntimeContractError(`Execution evidence is missing ${path}.`);
  }
  return entry.sha256;
}

function assertPayloadAuthority(
  raw: unknown,
  evidenceInventory: readonly AuthorizedMountFile[]
): ReleasePayloadVerificationAuthorityV1 {
  if (!isPlainRecord(raw)) {
    throw new ReleaseRuntimeContractError('Payload verification authority is not detached.');
  }
  assertExactKeys(
    raw,
    [
      'verificationId',
      'releaseId',
      'sealId',
      'sealSha256',
      'sourceCommit',
      'transportSha256',
      'transportZipReceiptSha256',
      'payloadInventorySha256',
      'ociArchiveSha256',
      'verifiedAt',
    ],
    'Payload verification authority'
  );
  const payload = Object.freeze({
    verificationId: boundedId(raw.verificationId, 'verificationId'),
    releaseId: boundedId(raw.releaseId, 'releaseId'),
    sealId: boundedId(raw.sealId, 'sealId'),
    sealSha256: digest(raw.sealSha256, 'sealSha256'),
    sourceCommit: digest(raw.sourceCommit, 'sourceCommit'),
    transportSha256: digest(raw.transportSha256, 'transportSha256'),
    transportZipReceiptSha256: digest(raw.transportZipReceiptSha256, 'transportZipReceiptSha256'),
    payloadInventorySha256: digest(raw.payloadInventorySha256, 'payloadInventorySha256'),
    ociArchiveSha256: digest(raw.ociArchiveSha256, 'ociArchiveSha256'),
    verifiedAt:
      typeof raw.verifiedAt === 'string' && UTC_TIMESTAMP.test(raw.verifiedAt)
        ? raw.verifiedAt
        : (() => {
            throw new ReleaseRuntimeContractError('verifiedAt is not one canonical UTC timestamp.');
          })(),
  });
  if (
    payload.sealSha256 !== evidenceDigest(evidenceInventory, 'tested-dist-seal.json') ||
    payload.transportZipReceiptSha256 !==
      evidenceDigest(evidenceInventory, 'transport-zip-receipt.json')
  ) {
    throw new ReleaseRuntimeContractError('Payload authority does not bind its observed evidence.');
  }
  const expectedVerificationId = `payload:${sha256Jcs([
    'missionpulse.release-payload-verification-id',
    1,
    payload.releaseId,
    payload.sealSha256,
    payload.transportSha256,
    payload.payloadInventorySha256,
    evidenceDigest(evidenceInventory, 'release-execution-authority.json'),
  ])}`;
  if (payload.verificationId !== expectedVerificationId) {
    throw new ReleaseRuntimeContractError(
      'Payload verification ID does not match its independent authenticated preimage.'
    );
  }
  return payload;
}

export function assertReleaseControllerExecutionAuthority(
  raw: unknown
): ReleaseControllerExecutionAuthorityV1 {
  if (!isPlainRecord(raw)) {
    throw new ReleaseRuntimeContractError(
      'Release controller execution authority is not detached.'
    );
  }
  assertExactKeys(
    raw,
    [
      'schema',
      'version',
      'authoritySha256',
      'executionImage',
      'controllerBundleSha256',
      'controllerSourceInventorySha256',
      'candidateArtifactTree',
      'evidenceInventory',
      'payload',
      'invocationPolicySha256',
      'effectiveLoadedObjectsSha256',
    ],
    'Release controller execution authority'
  );
  if (raw.schema !== 'missionpulse.release-controller-execution-authority' || raw.version !== 1) {
    throw new ReleaseRuntimeContractError(
      'Release controller execution authority header is invalid.'
    );
  }
  const evidenceInventory = assertEvidenceInventory(raw.evidenceInventory);
  const unsigned = Object.freeze({
    schema: 'missionpulse.release-controller-execution-authority',
    version: 1,
    executionImage: assertVerifiedExecutionImageAuthority(raw.executionImage),
    controllerBundleSha256: digest(raw.controllerBundleSha256, 'controllerBundleSha256'),
    controllerSourceInventorySha256: digest(
      raw.controllerSourceInventorySha256,
      'controllerSourceInventorySha256'
    ),
    candidateArtifactTree: assertCandidateArtifactTreeAuthority(raw.candidateArtifactTree),
    evidenceInventory,
    payload: assertPayloadAuthority(raw.payload, evidenceInventory),
    invocationPolicySha256: digest(raw.invocationPolicySha256, 'invocationPolicySha256'),
    effectiveLoadedObjectsSha256: digest(
      raw.effectiveLoadedObjectsSha256,
      'effectiveLoadedObjectsSha256'
    ),
  });
  const authoritySha256 = digest(raw.authoritySha256, 'authoritySha256');
  if (sha256Jcs(unsigned) !== authoritySha256) {
    throw new ReleaseRuntimeContractError(
      'Release controller execution authority self-digest is invalid.'
    );
  }
  return Object.freeze({ ...unsigned, authoritySha256 });
}

function jcs(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ReleaseRuntimeContractError('JCS number is invalid.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(jcs).join(',')}]`;
  }
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`)
      .join(',')}}`;
  }
  throw new ReleaseRuntimeContractError('JCS value is not JSON.');
}

function sha256Jcs(value: unknown): string {
  return createHash('sha256').update(jcs(value)).digest('hex');
}

function sameJson(left: unknown, right: unknown): boolean {
  return jcs(left) === jcs(right);
}

function createPayloadReceipt(
  authority: ReleaseControllerExecutionAuthorityV1,
  capability: ReleaseRuntimeCapability
): ReleaseExecutionPayloadVerificationV1 {
  const unsigned = Object.freeze({
    schema: 'missionpulse.release-execution-payload-verification' as const,
    version: 1 as const,
    verificationId: authority.payload.verificationId,
    releaseId: authority.payload.releaseId,
    sealId: authority.payload.sealId,
    sealSha256: authority.payload.sealSha256,
    sourceCommit: authority.payload.sourceCommit,
    transportSha256: authority.payload.transportSha256,
    transportZipReceiptSha256: authority.payload.transportZipReceiptSha256,
    payloadInventorySha256: authority.payload.payloadInventorySha256,
    controllerBundleSha256: authority.controllerBundleSha256,
    controllerBundleSourceInventorySha256: authority.controllerSourceInventorySha256,
    buildMetadataSha256: evidenceDigest(authority.evidenceInventory, 'build-metadata.json'),
    buildProvenanceSha256: evidenceDigest(authority.evidenceInventory, 'build-provenance.json'),
    executionAuthoritySha256: evidenceDigest(
      authority.evidenceInventory,
      'release-execution-authority.json'
    ),
    controllerExecutionAuthoritySha256: authority.authoritySha256,
    ociArchiveSha256: authority.payload.ociArchiveSha256,
    ociIndexSha256: capability.executionImageIndexSha256,
    ociManifestSha256: capability.executionImageManifestSha256,
    ociConfigSha256: capability.executionImageConfigSha256,
    layerSha256: capability.executionImageLayerSha256,
    diffIdSha256: capability.executionImageDiffIdSha256,
    finalRootInventorySha256: capability.finalRootInventorySha256,
    pythonRuntimeTreeSha256: capability.pythonRuntimeTreeSha256,
    pythonExecutableSha256: capability.pythonExecutableSha256,
    effectiveLoadedObjectsSha256: capability.effectiveLoadedObjectsSha256,
    verifiedAt: authority.payload.verifiedAt,
  });
  return Object.freeze({
    ...unsigned,
    verificationSha256: sha256Jcs(unsigned),
  });
}

const RECEIPT_DIGEST_KEYS = Object.freeze([
  'verificationSha256',
  'sealSha256',
  'sourceCommit',
  'transportSha256',
  'transportZipReceiptSha256',
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
]);

function digestArray(raw: unknown, label: string): readonly string[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 128) {
    throw new ReleaseRuntimeContractError(`${label} is not one bounded digest array.`);
  }
  return Object.freeze(raw.map((entry, index) => digest(entry, `${label}[${index}]`)));
}

export function assertReleaseRuntimeEvidence(raw: unknown): ReleaseExecutionPayloadVerificationV1 {
  if (!isPlainRecord(raw)) {
    throw new ReleaseRuntimeContractError('Payload verification receipt is not detached.');
  }
  assertExactKeys(
    raw,
    [
      'schema',
      'version',
      'verificationId',
      'releaseId',
      'sealId',
      'verifiedAt',
      'layerSha256',
      'diffIdSha256',
      ...RECEIPT_DIGEST_KEYS,
    ],
    'Payload verification receipt'
  );
  if (
    raw.schema !== 'missionpulse.release-execution-payload-verification' ||
    raw.version !== 1 ||
    typeof raw.verificationId !== 'string' ||
    typeof raw.releaseId !== 'string' ||
    typeof raw.sealId !== 'string' ||
    typeof raw.verifiedAt !== 'string' ||
    !UTC_TIMESTAMP.test(raw.verifiedAt)
  ) {
    throw new ReleaseRuntimeContractError('Payload verification receipt header is invalid.');
  }
  for (const key of RECEIPT_DIGEST_KEYS) {
    digest(raw[key], key);
  }
  const layerSha256 = digestArray(raw.layerSha256, 'layerSha256');
  const diffIdSha256 = digestArray(raw.diffIdSha256, 'diffIdSha256');
  if (layerSha256.length !== diffIdSha256.length) {
    throw new ReleaseRuntimeContractError('Payload layer and diff-ID graphs differ in length.');
  }
  const { verificationSha256, ...unsigned } = raw;
  if (verificationSha256 !== sha256Jcs(unsigned)) {
    throw new ReleaseRuntimeContractError('Payload verification JCS digest is invalid.');
  }
  return Object.freeze({
    ...(raw as unknown as ReleaseExecutionPayloadVerificationV1),
    layerSha256,
    diffIdSha256,
  });
}

export async function authorizeRuntimeForRelease(
  ports: ReleaseRuntimeControllerPorts
): Promise<ReleaseExecutionPayloadVerificationV1> {
  const authority = assertReleaseControllerExecutionAuthority(await ports.readExecutionAuthority());
  const observation = await ports.observeRuntime(authority.executionImage);
  const capability = authorizeReleaseRuntimeObservation(observation, authority.executionImage);
  if (capability.effectiveLoadedObjectsSha256 !== authority.effectiveLoadedObjectsSha256) {
    throw new ReleaseRuntimeContractError(
      'Observed effective loaded objects differ from execution authority.'
    );
  }
  const payload = await ports.observePayload(authority);
  if (
    payload.controllerBundleSha256 !== authority.controllerBundleSha256 ||
    !sameJson(payload.candidateArtifactTree, authority.candidateArtifactTree) ||
    !sameJson(payload.evidenceInventory, authority.evidenceInventory)
  ) {
    throw new ReleaseRuntimeContractError(
      'Observed candidate payload differs from its exact authorized inventory.'
    );
  }
  const receipt = createPayloadReceipt(authority, capability);
  await ports.publishRuntimeEvidence(receipt);
  return receipt;
}
