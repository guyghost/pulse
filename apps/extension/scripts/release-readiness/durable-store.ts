import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash, createPublicKey, randomBytes, verify as verifySignature } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';
import { join, resolve } from 'node:path';

import {
  compareCanonicalSemVer,
  computeCatalogSha256,
  createEmptyReleaseCatalog,
  parseAuditReceipt,
  parseCandidateIdentity,
  parseGlobalReleaseCatalog,
  parseReleaseExecutionPayloadVerification,
  parseSealedCandidateTransportObservation,
  type GlobalReleaseCatalogRecordV1,
  type GlobalReleaseCatalogV1,
} from './contracts';
import {
  isAuthorizedFactoryReservation,
  isExactPersistedContextTransition,
  consumeReleaseTransactionAuthorization,
  releaseNamespaceIsUnavailable,
  releaseContextSha256,
  parseReleaseCommandDeliveryReceipt,
  type CommitActorRequestV1,
  type CommitProtectedEventRequestV1,
  type AcknowledgeReleaseCommandRequestV1,
  type PublishArtifactRequestV1,
  type ReplaceCandidateRequestV1,
  type ReleaseReadinessOutboxCommandV1,
  type ReleaseReadinessCommandDeliveryReceiptV1,
  type ReleaseReadinessTransactionPort,
  type ReserveCandidateRequestV1,
} from './factory';
import { deriveCandidateReplacementClosureProof } from './replacement-closure';
import { jcsCanonicalize, sha256Jcs, withoutKey } from './canonical';
import type { ReleaseReadinessContextV1 } from './reducer';
import {
  appendGlobalReplayRecords,
  createEmptyGlobalReplayRegistry,
  parseGlobalReplayRegistry,
  type GlobalReplayRegistryV1,
} from './replay-registry';
import { assertCanonicalTreeReceipt, type CanonicalTreeReceiptV2 } from '../canonical-artifact';

const STATE_FILE = 'release-readiness-state.v1.json';
const LOCK_DIRECTORY = '.release-readiness-state.lock';
const LOCK_OWNER_FILE = 'owner.v1.json';
const LOCK_LEASE_MS = 300_000;
const MAX_STATE_BYTES = 67_108_864;
const MAX_ACTORS = 256;
const MAX_OUTBOX_COMMANDS = 1_024;
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;

interface DurableLockOwnerV1 {
  readonly schema: 'missionpulse.release-readiness-lock-owner';
  readonly version: 1;
  readonly ownerId: string;
  readonly pid: number;
  readonly bootId: string;
  readonly processStartIdentity: string;
  readonly acquiredAt: string;
  readonly leaseExpiresAt: string;
}

export interface ReleaseReadinessProcessIdentityV1 {
  readonly bootId: string;
  readonly processStartIdentity: string;
}

function readBootIdentity(): string {
  let authority: string;
  try {
    if (process.platform === 'linux') {
      authority = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    } else if (process.platform === 'darwin') {
      authority = execFileSync('/usr/sbin/sysctl', ['-n', 'kern.boottime'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 1_000,
      }).trim();
    } else {
      throw new Error('No native boot identity reader.');
    }
    if (authority.length === 0 || authority.length > 512) {
      throw new Error('Boot identity is outside its bound.');
    }
  } catch {
    const root = lstatSync('/');
    authority = `${process.platform}\0${hostname()}\0${root.dev}\0${root.birthtimeMs}`;
  }
  return sha256Jcs({ authority, kind: 'operating-system-boot' });
}

const CURRENT_BOOT_ID = readBootIdentity();
const CURRENT_PROCESS_FALLBACK_ID = sha256Jcs({
  kind: 'module-private-process-start',
  nonce: randomBytes(32).toString('hex'),
  pid: process.pid,
});

function readProcessStartIdentity(pid: number): string | null {
  try {
    let authority: string;
    if (process.platform === 'linux') {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const executableEnd = stat.lastIndexOf(')');
      const fields =
        executableEnd < 0
          ? []
          : stat
              .slice(executableEnd + 2)
              .trim()
              .split(/\s+/);
      const startTicks = fields[19];
      if (startTicks === undefined || !/^\d+$/.test(startTicks)) {
        return null;
      }
      authority = `linux-proc-start-ticks:${startTicks}`;
    } else if (process.platform === 'darwin') {
      const startedAt = execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 1_000,
      }).trim();
      if (startedAt.length === 0 || startedAt.length > 128) {
        return null;
      }
      authority = `darwin-ps-start:${startedAt}`;
    } else {
      return pid === process.pid ? CURRENT_PROCESS_FALLBACK_ID : null;
    }
    return sha256Jcs({ authority, bootId: CURRENT_BOOT_ID, kind: 'process-start', pid });
  } catch {
    return pid === process.pid ? CURRENT_PROCESS_FALLBACK_ID : null;
  }
}

const CURRENT_PROCESS_START_IDENTITY =
  readProcessStartIdentity(process.pid) ?? CURRENT_PROCESS_FALLBACK_ID;

export function readCurrentReleaseReadinessProcessIdentity(): ReleaseReadinessProcessIdentityV1 {
  return {
    bootId: CURRENT_BOOT_ID,
    processStartIdentity: CURRENT_PROCESS_START_IDENTITY,
  };
}

function parseLockOwner(value: unknown): DurableLockOwnerV1 {
  const owner = strictObject(value, 'durable lock owner');
  if (
    !hasExactKeys(owner, [
      'acquiredAt',
      'bootId',
      'leaseExpiresAt',
      'ownerId',
      'pid',
      'processStartIdentity',
      'schema',
      'version',
    ]) ||
    owner.schema !== 'missionpulse.release-readiness-lock-owner' ||
    owner.version !== 1 ||
    !isCanonicalId(owner.ownerId) ||
    typeof owner.pid !== 'number' ||
    !Number.isSafeInteger(owner.pid) ||
    owner.pid <= 0 ||
    !isSha256(owner.bootId) ||
    !isSha256(owner.processStartIdentity) ||
    !isCanonicalTimestamp(owner.acquiredAt) ||
    !isCanonicalTimestamp(owner.leaseExpiresAt) ||
    Date.parse(owner.leaseExpiresAt) <= Date.parse(owner.acquiredAt)
  ) {
    throw new ReleaseReadinessDurableStoreError('Durable lock owner is invalid.');
  }
  return clone(owner as unknown as DurableLockOwnerV1);
}

interface DurableActorV1 {
  readonly actorId: string;
  readonly contextSha256: string;
  readonly context: ReleaseReadinessContextV1;
}

interface DurableReleaseStateV1 {
  readonly schema: 'missionpulse.release-readiness-durable-state';
  readonly version: 1;
  readonly revision: number;
  readonly stateSha256: string;
  readonly catalog: GlobalReleaseCatalogV1;
  readonly replayRegistry: GlobalReplayRegistryV1;
  readonly outbox: readonly ReleaseReadinessOutboxCommandV1[];
  readonly commandDeliveries: readonly ReleaseReadinessCommandDeliveryReceiptV1[];
  readonly actors: readonly DurableActorV1[];
}

type TransactionResult = ReturnType<ReleaseReadinessTransactionPort['commitActor']>;

export class ReleaseReadinessDurableStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseReadinessDurableStoreError';
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function stateSha256(value: Record<string, unknown>): string {
  return sha256Jcs(withoutKey(value, 'stateSha256'));
}

function strictObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ReleaseReadinessDurableStoreError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

const CONTEXT_KEYS = [
  'acceptedLocalEvents',
  'actorId',
  'artifact',
  'audit',
  'authorizations',
  'canaryPass',
  'candidate',
  'candidateHistory',
  'lastError',
  'lastLocalObservation',
  'packageJournal',
  'packageJournalIdentity',
  'payloadVerification',
  'pendingRestart',
  'productionPromotion',
  'rollback',
  'seal',
  'sealIdentity',
  'state',
  'store',
  'submission',
  'transportObservation',
] as const;

const RELEASE_STATES = new Set([
  'audited',
  'blocked',
  'rc_built',
  'package_validated',
  'store_ready',
  'canary',
  'production',
  'rolled_back',
]);

const RELEASE_EVENT_TYPES = new Set([
  'BLOCKERS_INGESTED',
  'LOCAL_EVIDENCE_INVALIDATED',
  'RC_SEAL_INGESTED',
  'RELEASE_PAYLOAD_VERIFIED_INGESTED',
  'PACKAGE_JOURNAL_INGESTED',
  'PACKAGE_VALIDATED_INGESTED',
  'STORE_READINESS_INGESTED',
  'SUBMISSION_RECEIPT_INGESTED',
  'CANARY_PASS_RECEIPT_INGESTED',
  'PRODUCTION_PROMOTION_RECEIPT_INGESTED',
  'ROLLBACK_RECEIPT_INGESTED',
  'SERVICE_RESTARTED',
  'LOCAL_RELEASE_OBSERVATION_INGESTED',
  'NEW_CANDIDATE_INGESTED',
]);

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).sort().join('\0') === [...keys].sort().join('\0');
}

function isCanonicalId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function isCanonicalTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isSafeInteger(Date.parse(value)) &&
    new Date(Date.parse(value)).toISOString() === value
  );
}

function isBoundedCanonicalString(value: unknown, maxBytes = 1_024): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    Buffer.byteLength(value, 'utf8') <= maxBytes &&
    !value.includes('\0')
  );
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function decodeExactBase64(value: unknown, expectedBytes: number, label: string): Buffer {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096) {
    throw new ReleaseReadinessDurableStoreError(`${label} is invalid.`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.byteLength !== expectedBytes || decoded.toString('base64') !== value) {
    throw new ReleaseReadinessDurableStoreError(`${label} is not canonical base64.`);
  }
  return decoded;
}

function validateImmutableBlob(value: unknown, label: string): Record<string, unknown> {
  const blob = strictObject(value, label);
  if (
    !hasExactKeys(blob, ['bytes', 'immutableUri', 'kind', 'schema', 'sha256', 'version']) ||
    blob.schema !== 'missionpulse.immutable-blob' ||
    blob.version !== 1 ||
    !isBoundedCanonicalString(blob.kind, 128) ||
    !isBoundedCanonicalString(blob.immutableUri, 4_096) ||
    !isSha256(blob.sha256) ||
    !isSafeNonNegativeInteger(blob.bytes)
  ) {
    throw new ReleaseReadinessDurableStoreError(`${label} is invalid.`);
  }
  return blob;
}

type AuthorizationAction =
  | 'mark_store_ready'
  | 'ingest_submission'
  | 'ingest_canary_pass'
  | 'ingest_production_promotion'
  | 'ingest_rollback';
type ExternalReceiptAction = 'submission' | 'canary_pass' | 'production_promotion' | 'rollback';

const AUTHORIZATION_EVENT_TYPES: Readonly<Record<AuthorizationAction, string>> = {
  mark_store_ready: 'STORE_READINESS_INGESTED',
  ingest_submission: 'SUBMISSION_RECEIPT_INGESTED',
  ingest_canary_pass: 'CANARY_PASS_RECEIPT_INGESTED',
  ingest_production_promotion: 'PRODUCTION_PROMOTION_RECEIPT_INGESTED',
  ingest_rollback: 'ROLLBACK_RECEIPT_INGESTED',
};

const EXTERNAL_AUTHORIZATION_ACTIONS: Readonly<Record<ExternalReceiptAction, AuthorizationAction>> =
  {
    submission: 'ingest_submission',
    canary_pass: 'ingest_canary_pass',
    production_promotion: 'ingest_production_promotion',
    rollback: 'ingest_rollback',
  };

function authorizationTargetSha256(eventType: string, target: Record<string, unknown>): string {
  return sha256Jcs({
    eventType,
    releaseId: target.releaseId,
    artifactId: target.artifactId,
    payload: target,
  });
}

function verifySignedEnvelope(
  envelope: Record<string, unknown>,
  policyValue: unknown,
  purpose: 'authorization' | 'external_receipt'
): void {
  const policy = strictObject(policyValue, `${purpose} signature policy`);
  const expectedProvider =
    purpose === 'authorization' ? 'missionpulse_release_authority' : 'chrome_web_store_api';
  if (
    policy.purpose !== purpose ||
    policy.allowedProvider !== expectedProvider ||
    envelope.provider !== expectedProvider ||
    envelope.policySha256 !== policy.policySha256 ||
    envelope.signatureAlgorithm !== 'ed25519' ||
    !Array.isArray(policy.keys)
  ) {
    throw new ReleaseReadinessDurableStoreError(`${purpose} signature policy diverges.`);
  }
  const unsigned = Object.fromEntries(
    Object.entries(envelope).filter(
      ([key]) => key !== 'canonicalPayloadSha256' && key !== 'detachedSignatureBase64'
    )
  );
  const canonicalPayloadSha256 = sha256Jcs(unsigned);
  if (envelope.canonicalPayloadSha256 !== canonicalPayloadSha256) {
    throw new ReleaseReadinessDurableStoreError(`${purpose} canonical payload digest diverges.`);
  }
  const matchingKeys = policy.keys.filter((rawKey) => {
    if (typeof rawKey !== 'object' || rawKey === null || Array.isArray(rawKey)) {
      return false;
    }
    const key = rawKey as Record<string, unknown>;
    return (
      key.issuerId === envelope.issuerId &&
      key.issuerKeyId === envelope.issuerKeyId &&
      key.signatureAlgorithm === 'ed25519'
    );
  });
  if (matchingKeys.length !== 1) {
    throw new ReleaseReadinessDurableStoreError(`${purpose} signing key is not uniquely pinned.`);
  }
  const key = strictObject(matchingKeys[0], `${purpose} signing key`);
  if (!hasExactKeys(key, ['issuerId', 'issuerKeyId', 'publicKeyBase64', 'signatureAlgorithm'])) {
    throw new ReleaseReadinessDurableStoreError(`${purpose} signing key schema diverges.`);
  }
  const rawPublicKey = decodeExactBase64(key.publicKeyBase64, 32, `${purpose} public key`);
  const signature = decodeExactBase64(
    envelope.detachedSignatureBase64,
    64,
    `${purpose} detached signature`
  );
  const publicKey = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), rawPublicKey]),
    format: 'der',
    type: 'spki',
  });
  const domain =
    purpose === 'authorization'
      ? 'missionpulse.release-authorization.v1'
      : 'missionpulse.external-release-receipt.v1';
  const signedBytes = Buffer.concat([
    Buffer.from(domain, 'ascii'),
    Buffer.from([0]),
    Buffer.from(canonicalPayloadSha256, 'hex'),
  ]);
  if (!verifySignature(null, signedBytes, publicKey, signature)) {
    throw new ReleaseReadinessDurableStoreError(`${purpose} Ed25519 signature is invalid.`);
  }
}

function validateStoreReceipt(
  value: unknown,
  candidate: ReturnType<typeof parseCandidateIdentity>,
  artifact: Record<string, unknown>
): Record<string, unknown> {
  const store = strictObject(value, 'durable Store readiness receipt');
  const zip = strictObject(artifact.zip, 'durable artifact ZIP');
  const credentialPresence = strictObject(
    store.credentialPresence,
    'durable Store credential presence'
  );
  const rollbackTarget = strictObject(store.rollbackTarget, 'durable rollback target');
  if (
    !hasExactKeys(store, [
      'artifactId',
      'artifactSha256',
      'committedVersion',
      'completedAt',
      'credentialPresence',
      'listingComplete',
      'manifestSha256',
      'permissionJustificationComplete',
      'permissionSetSha256',
      'privacyDisclosureComplete',
      'receiptId',
      'record',
      'releaseId',
      'rollbackTarget',
      'schema',
      'sourceCommit',
      'version',
    ]) ||
    store.schema !== 'missionpulse.store-readiness' ||
    store.version !== 1 ||
    !isCanonicalId(store.receiptId) ||
    store.releaseId !== candidate.releaseId ||
    store.artifactId !== artifact.artifactId ||
    store.artifactSha256 !== zip.zipSha256 ||
    store.sourceCommit !== candidate.sourceCommit ||
    store.committedVersion !== candidate.committedVersion ||
    store.manifestSha256 !== candidate.manifest.manifestSha256 ||
    store.permissionSetSha256 !== candidate.manifest.permissionSetSha256 ||
    store.listingComplete !== true ||
    store.privacyDisclosureComplete !== true ||
    store.permissionJustificationComplete !== true ||
    !hasExactKeys(credentialPresence, [
      'chromeClientId',
      'chromeClientSecret',
      'chromeExtensionId',
      'chromeRefreshToken',
    ]) ||
    !Object.values(credentialPresence).every((present) => present === true) ||
    !hasExactKeys(rollbackTarget, [
      'artifactSha256',
      'extensionVersion',
      'lastKnownHealthyAt',
      'manifestSha256',
      'permissionSetSha256',
      'targetId',
      'validationReceipt',
    ]) ||
    !isCanonicalId(rollbackTarget.targetId) ||
    !isBoundedCanonicalString(rollbackTarget.extensionVersion, 64) ||
    !isSha256(rollbackTarget.artifactSha256) ||
    !isSha256(rollbackTarget.manifestSha256) ||
    !isSha256(rollbackTarget.permissionSetSha256) ||
    !isCanonicalTimestamp(rollbackTarget.lastKnownHealthyAt) ||
    !isCanonicalTimestamp(store.completedAt) ||
    !isCanonicalTimestamp(artifact.validatedAt) ||
    Date.parse(store.completedAt) < Date.parse(artifact.validatedAt) ||
    Date.parse(rollbackTarget.lastKnownHealthyAt) > Date.parse(store.completedAt)
  ) {
    throw new ReleaseReadinessDurableStoreError('Durable Store readiness receipt is invalid.');
  }
  validateImmutableBlob(rollbackTarget.validationReceipt, 'durable rollback validation receipt');
  validateImmutableBlob(store.record, 'durable Store readiness record');
  return store;
}

function framedPathInventorySha256(paths: readonly string[]): string {
  const hash = createHash('sha256');
  for (const path of paths) {
    const bytes = Buffer.from(path, 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.byteLength);
    hash.update(length);
    hash.update(bytes);
  }
  return hash.digest('hex');
}

function validateArtifactTree(value: unknown, label: string): Record<string, unknown> {
  const tree = strictObject(value, label);
  if (
    !hasExactKeys(tree, ['algorithm', 'entries', 'fileCount', 'manifestSha256', 'treeSha256']) ||
    !Array.isArray(tree.entries) ||
    tree.entries.length === 0 ||
    tree.entries.length > 20_000 ||
    tree.entries.some((rawEntry) => {
      if (typeof rawEntry !== 'object' || rawEntry === null || Array.isArray(rawEntry)) {
        return true;
      }
      return !hasExactKeys(rawEntry as Record<string, unknown>, [
        'bytes',
        'mode',
        'path',
        'sha256',
      ]);
    })
  ) {
    throw new ReleaseReadinessDurableStoreError(`${label} schema is invalid.`);
  }
  try {
    assertCanonicalTreeReceipt(tree as unknown as CanonicalTreeReceiptV2);
  } catch {
    throw new ReleaseReadinessDurableStoreError(`${label} digest is invalid.`);
  }
  return tree;
}

function validateCanonicalZipReceipt(value: unknown): Record<string, unknown> {
  const zip = strictObject(value, 'durable canonical ZIP receipt');
  if (
    !hasExactKeys(zip, [
      'archiveCommentBytes',
      'centralDirectoryOrderSha256',
      'centralDirectoryStartDisk',
      'compression',
      'dataDescriptor',
      'diskNumber',
      'entries',
      'entriesOnDisk',
      'entryCount',
      'entryInventorySha256',
      'localHeaderOrderSha256',
      'normalizedTimestamp',
      'schema',
      'twinBuildSha256',
      'twinReceiptSha256',
      'version',
      'zip64',
      'zipBytes',
      'zipSha256',
    ]) ||
    zip.schema !== 'missionpulse.canonical-zip' ||
    zip.version !== 1 ||
    !isSha256(zip.zipSha256) ||
    !isSafeNonNegativeInteger(zip.zipBytes) ||
    zip.zipBytes === 0 ||
    !isSafeNonNegativeInteger(zip.entryCount) ||
    !Array.isArray(zip.entries) ||
    zip.entries.length === 0 ||
    zip.entries.length > 20_000 ||
    zip.entryCount !== zip.entries.length ||
    zip.compression !== 'store' ||
    zip.normalizedTimestamp !== '1980-01-01T00:00:00.000Z' ||
    zip.zip64 !== false ||
    zip.dataDescriptor !== false ||
    zip.archiveCommentBytes !== 0 ||
    zip.diskNumber !== 0 ||
    zip.centralDirectoryStartDisk !== 0 ||
    zip.entriesOnDisk !== zip.entries.length ||
    !isSha256(zip.entryInventorySha256) ||
    !isSha256(zip.localHeaderOrderSha256) ||
    !isSha256(zip.centralDirectoryOrderSha256) ||
    zip.twinBuildSha256 !== zip.zipSha256 ||
    !isSha256(zip.twinReceiptSha256)
  ) {
    throw new ReleaseReadinessDurableStoreError('Durable canonical ZIP receipt is invalid.');
  }
  const paths: string[] = [];
  let previousPath: string | null = null;
  for (const rawEntry of zip.entries) {
    const entry = strictObject(rawEntry, 'durable canonical ZIP entry');
    if (
      !hasExactKeys(entry, [
        'centralExtraFieldBytes',
        'compressedBytes',
        'compressionMethod',
        'crc32Hex',
        'dosDate',
        'dosTime',
        'entryCommentBytes',
        'externalFileAttributes',
        'generalPurposeBitFlag',
        'internalFileAttributes',
        'localExtraFieldBytes',
        'localHeaderOffset',
        'path',
        'uncompressedBytes',
        'utf8NameSha256',
        'versionMadeBy',
        'versionNeeded',
      ]) ||
      !isBoundedCanonicalString(entry.path, 65_535) ||
      (previousPath !== null &&
        Buffer.compare(Buffer.from(previousPath), Buffer.from(entry.path)) >= 0) ||
      entry.utf8NameSha256 !== sha256String(entry.path) ||
      typeof entry.crc32Hex !== 'string' ||
      !/^[0-9a-f]{8}$/.test(entry.crc32Hex) ||
      !isSafeNonNegativeInteger(entry.uncompressedBytes) ||
      !isSafeNonNegativeInteger(entry.compressedBytes) ||
      entry.compressedBytes !== entry.uncompressedBytes ||
      entry.compressionMethod !== 0 ||
      entry.generalPurposeBitFlag !== 0x0800 ||
      entry.versionNeeded !== 20 ||
      entry.versionMadeBy !== 0x031e ||
      entry.dosTime !== 0 ||
      entry.dosDate !== 0x0021 ||
      entry.internalFileAttributes !== 0 ||
      entry.externalFileAttributes !== 0x81a40000 ||
      entry.localExtraFieldBytes !== 0 ||
      entry.centralExtraFieldBytes !== 0 ||
      entry.entryCommentBytes !== 0 ||
      !isSafeNonNegativeInteger(entry.localHeaderOffset)
    ) {
      throw new ReleaseReadinessDurableStoreError('Durable canonical ZIP entry is invalid.');
    }
    previousPath = entry.path;
    paths.push(entry.path);
  }
  const entryInventorySha256 = sha256Jcs(zip.entries);
  const orderSha256 = framedPathInventorySha256(paths);
  const twinReceiptSha256 = sha256Jcs({
    firstZipSha256: zip.zipSha256,
    secondZipSha256: zip.zipSha256,
    entryInventorySha256,
  });
  if (
    zip.entryInventorySha256 !== entryInventorySha256 ||
    zip.localHeaderOrderSha256 !== orderSha256 ||
    zip.centralDirectoryOrderSha256 !== orderSha256 ||
    zip.twinReceiptSha256 !== twinReceiptSha256
  ) {
    throw new ReleaseReadinessDurableStoreError(
      'Durable canonical ZIP receipt self-digest is invalid.'
    );
  }
  return zip;
}

function validateDurableArtifact(
  value: unknown,
  candidate: ReturnType<typeof parseCandidateIdentity>,
  sealIdentity: unknown,
  journalIdentity: unknown
): Record<string, unknown> {
  const artifact = strictObject(value, 'durable validated artifact');
  if (
    !hasExactKeys(artifact, [
      'artifactId',
      'bundleDirectoryPath',
      'bundleInventorySha256',
      'checksumSidecar',
      'committedVersion',
      'extractedTree',
      'journalId',
      'manifest',
      'publishedAt',
      'releaseId',
      'releaseNamespace',
      'schema',
      'sealId',
      'sealSha256',
      'sidecarPath',
      'snapshotTree',
      'sourceCommit',
      'sourceTree',
      'validatedAt',
      'validationJsonSha256',
      'validationPath',
      'validationRecord',
      'version',
      'zip',
      'zipPath',
    ]) ||
    artifact.schema !== 'missionpulse.validated-zip-artifact' ||
    artifact.version !== 1 ||
    !isCanonicalId(artifact.artifactId) ||
    artifact.releaseId !== candidate.releaseId ||
    artifact.sourceCommit !== candidate.sourceCommit ||
    artifact.committedVersion !== candidate.committedVersion ||
    artifact.releaseNamespace !== candidate.releaseNamespace ||
    jcsCanonicalize(artifact.manifest) !== jcsCanonicalize(candidate.manifest) ||
    !isSha256(artifact.bundleInventorySha256) ||
    !isCanonicalId(artifact.journalId) ||
    !isCanonicalTimestamp(artifact.publishedAt) ||
    !isCanonicalTimestamp(artifact.validatedAt) ||
    Date.parse(artifact.publishedAt) > Date.parse(artifact.validatedAt) ||
    !isBoundedCanonicalString(artifact.bundleDirectoryPath, 65_535) ||
    !isBoundedCanonicalString(artifact.zipPath, 65_535) ||
    !isBoundedCanonicalString(artifact.sidecarPath, 65_535) ||
    !isBoundedCanonicalString(artifact.validationPath, 65_535) ||
    artifact.zipPath !== `${artifact.bundleDirectoryPath}/missionpulse.zip` ||
    artifact.sidecarPath !== `${artifact.bundleDirectoryPath}/missionpulse.zip.sha256` ||
    artifact.validationPath !== `${artifact.bundleDirectoryPath}/validation.json`
  ) {
    throw new ReleaseReadinessDurableStoreError('Durable validated artifact is invalid.');
  }
  const seal = strictObject(sealIdentity, 'durable artifact seal identity');
  const journal = strictObject(journalIdentity, 'durable artifact journal identity');
  if (
    artifact.sealId !== seal.sealId ||
    artifact.sealSha256 !== seal.sealSha256 ||
    artifact.journalId !== journal.journalId
  ) {
    throw new ReleaseReadinessDurableStoreError(
      'Durable artifact seal or journal identity diverges.'
    );
  }
  const sourceTree = validateArtifactTree(artifact.sourceTree, 'durable source tree');
  const snapshotTree = validateArtifactTree(artifact.snapshotTree, 'durable snapshot tree');
  const extractedTree = validateArtifactTree(artifact.extractedTree, 'durable extracted tree');
  if (
    jcsCanonicalize(sourceTree) !== jcsCanonicalize(snapshotTree) ||
    jcsCanonicalize(sourceTree) !== jcsCanonicalize(extractedTree) ||
    sourceTree.manifestSha256 !== candidate.manifest.manifestSha256
  ) {
    throw new ReleaseReadinessDurableStoreError('Durable artifact tree authorities diverge.');
  }
  const zip = validateCanonicalZipReceipt(artifact.zip);
  const checksum = strictObject(artifact.checksumSidecar, 'durable checksum sidecar');
  const expectedSidecarSha256 = sha256String(`${zip.zipSha256}  missionpulse.zip\n`);
  if (
    !hasExactKeys(checksum, ['bytes', 'filename', 'sha256']) ||
    checksum.filename !== 'missionpulse.zip.sha256' ||
    checksum.bytes !== 83 ||
    checksum.sha256 !== expectedSidecarSha256
  ) {
    throw new ReleaseReadinessDurableStoreError('Durable checksum sidecar is invalid.');
  }
  const validation = strictObject(artifact.validationRecord, 'durable package validation record');
  if (
    !hasExactKeys(validation, [
      'artifactId',
      'canonicalZipReceiptSha256',
      'committedVersion',
      'entryInventorySha256',
      'extractedTreeSha256',
      'ownershipMarkerSha256',
      'releaseId',
      'releaseNamespace',
      'schema',
      'sealId',
      'sealSha256',
      'sidecarSha256',
      'sourceTreeSha256',
      'validatedAt',
      'version',
      'zipSha256',
    ]) ||
    validation.schema !== 'missionpulse.package-validation' ||
    validation.version !== 1 ||
    validation.artifactId !== artifact.artifactId ||
    validation.releaseId !== artifact.releaseId ||
    validation.sealId !== artifact.sealId ||
    validation.sealSha256 !== artifact.sealSha256 ||
    validation.committedVersion !== artifact.committedVersion ||
    validation.releaseNamespace !== artifact.releaseNamespace ||
    validation.sourceTreeSha256 !== sourceTree.treeSha256 ||
    validation.extractedTreeSha256 !== extractedTree.treeSha256 ||
    !isSha256(validation.ownershipMarkerSha256) ||
    validation.zipSha256 !== zip.zipSha256 ||
    validation.sidecarSha256 !== checksum.sha256 ||
    validation.entryInventorySha256 !== zip.entryInventorySha256 ||
    validation.canonicalZipReceiptSha256 !== sha256Jcs(zip) ||
    !isCanonicalTimestamp(validation.validatedAt) ||
    Date.parse(validation.validatedAt) > Date.parse(artifact.publishedAt) ||
    artifact.validationJsonSha256 !== sha256Jcs(validation)
  ) {
    throw new ReleaseReadinessDurableStoreError(
      'Durable package validation record or self-digest is invalid.'
    );
  }
  return artifact;
}

function validateAuthorizationReceipt(
  value: unknown,
  action: AuthorizationAction,
  target: Record<string, unknown>,
  candidate: ReturnType<typeof parseCandidateIdentity>,
  actorId: string,
  artifactId: string,
  proofAvailableAt: string
): Record<string, unknown> {
  const authorization = strictObject(value, `durable ${action} authorization`);
  if (
    !hasExactKeys(authorization, [
      'action',
      'actorId',
      'artifactId',
      'authorizedPayloadSha256',
      'canonicalPayloadSha256',
      'detachedSignatureBase64',
      'expiresAt',
      'issuedAt',
      'issuerId',
      'issuerKeyId',
      'issuerSequence',
      'nonce',
      'policySha256',
      'provider',
      'receiptId',
      'releaseId',
      'schema',
      'scope',
      'signatureAlgorithm',
      'version',
    ]) ||
    authorization.schema !== 'missionpulse.release-authorization' ||
    authorization.version !== 1 ||
    !isCanonicalId(authorization.receiptId) ||
    authorization.provider !== 'missionpulse_release_authority' ||
    authorization.releaseId !== candidate.releaseId ||
    authorization.artifactId !== artifactId ||
    authorization.actorId !== actorId ||
    authorization.scope !== 'release_readiness' ||
    authorization.action !== action ||
    !isBoundedCanonicalString(authorization.nonce, 1_024) ||
    !isCanonicalId(authorization.issuerId) ||
    !isCanonicalId(authorization.issuerKeyId) ||
    !isSafeNonNegativeInteger(authorization.issuerSequence) ||
    authorization.issuerSequence === 0 ||
    !isSha256(authorization.policySha256) ||
    authorization.authorizedPayloadSha256 !==
      authorizationTargetSha256(AUTHORIZATION_EVENT_TYPES[action], target) ||
    !isCanonicalTimestamp(authorization.issuedAt) ||
    !isCanonicalTimestamp(authorization.expiresAt) ||
    Date.parse(authorization.issuedAt) >= Date.parse(authorization.expiresAt) ||
    !isCanonicalTimestamp(proofAvailableAt) ||
    Date.parse(proofAvailableAt) >= Date.parse(authorization.expiresAt)
  ) {
    throw new ReleaseReadinessDurableStoreError(`Durable ${action} authorization is invalid.`);
  }
  verifySignedEnvelope(authorization, candidate.authorizationPolicy, 'authorization');
  return authorization;
}

function validateExternalReceipt(
  value: unknown,
  action: ExternalReceiptAction,
  candidate: ReturnType<typeof parseCandidateIdentity>,
  artifact: Record<string, unknown>,
  store: Record<string, unknown>,
  submission: Record<string, unknown> | null,
  canary: Record<string, unknown> | null,
  promotion: Record<string, unknown> | null
): Record<string, unknown> {
  const receipt = strictObject(value, `durable ${action} receipt`);
  const payload = strictObject(receipt.payload, `durable ${action} payload`);
  const zip = strictObject(artifact.zip, 'durable artifact ZIP');
  if (
    !hasExactKeys(receipt, [
      'action',
      'artifactId',
      'artifactSha256',
      'canonicalPayloadSha256',
      'detachedSignatureBase64',
      'extensionVersion',
      'issuedAt',
      'issuerId',
      'issuerKeyId',
      'issuerSequence',
      'manifestSha256',
      'occurredAt',
      'payload',
      'permissionSetSha256',
      'policySha256',
      'provider',
      'providerOperationId',
      'providerRecord',
      'receiptId',
      'releaseId',
      'requestNonce',
      'schema',
      'signatureAlgorithm',
      'sourceCommit',
      'verifiedAt',
      'version',
    ]) ||
    receipt.schema !== 'missionpulse.external-release-receipt' ||
    receipt.version !== 1 ||
    !isCanonicalId(receipt.receiptId) ||
    receipt.provider !== 'chrome_web_store_api' ||
    !isCanonicalId(receipt.providerOperationId) ||
    receipt.action !== action ||
    receipt.releaseId !== candidate.releaseId ||
    receipt.artifactId !== artifact.artifactId ||
    receipt.artifactSha256 !== zip.zipSha256 ||
    receipt.sourceCommit !== candidate.sourceCommit ||
    receipt.extensionVersion !== candidate.committedVersion ||
    receipt.manifestSha256 !== candidate.manifest.manifestSha256 ||
    receipt.permissionSetSha256 !== candidate.manifest.permissionSetSha256 ||
    !isBoundedCanonicalString(receipt.requestNonce, 1_024) ||
    !isCanonicalId(receipt.issuerId) ||
    !isCanonicalId(receipt.issuerKeyId) ||
    !isSafeNonNegativeInteger(receipt.issuerSequence) ||
    receipt.issuerSequence === 0 ||
    !isSha256(receipt.policySha256) ||
    !isCanonicalTimestamp(receipt.occurredAt) ||
    !isCanonicalTimestamp(receipt.issuedAt) ||
    !isCanonicalTimestamp(receipt.verifiedAt) ||
    !isCanonicalTimestamp(artifact.validatedAt) ||
    Date.parse(artifact.validatedAt) > Date.parse(receipt.occurredAt) ||
    Date.parse(receipt.occurredAt) > Date.parse(receipt.issuedAt) ||
    Date.parse(receipt.issuedAt) > Date.parse(receipt.verifiedAt)
  ) {
    throw new ReleaseReadinessDurableStoreError(`Durable ${action} receipt is invalid.`);
  }
  validateImmutableBlob(receipt.providerRecord, `durable ${action} provider record`);
  verifySignedEnvelope(receipt, candidate.externalReceiptPolicy, 'external_receipt');

  if (action === 'submission') {
    if (
      !hasExactKeys(payload, [
        'acceptedAt',
        'channel',
        'extensionId',
        'submittedAt',
        'uploadedZipSha256',
      ]) ||
      !isCanonicalId(payload.extensionId) ||
      payload.channel !== 'trusted_testers' ||
      payload.uploadedZipSha256 !== zip.zipSha256 ||
      !isCanonicalTimestamp(payload.submittedAt) ||
      !isCanonicalTimestamp(payload.acceptedAt) ||
      payload.acceptedAt !== receipt.occurredAt ||
      Date.parse(payload.submittedAt) > Date.parse(payload.acceptedAt)
    ) {
      throw new ReleaseReadinessDurableStoreError('Durable submission payload is invalid.');
    }
  } else if (action === 'canary_pass') {
    if (
      submission === null ||
      !hasExactKeys(payload, [
        'crashRate',
        'criticalFindingCount',
        'errorRate',
        'metricsSha256',
        'passed',
        'passedAt',
        'sampleSize',
        'submissionReceiptId',
        'thresholdPolicySha256',
        'windowEndedAt',
        'windowStartedAt',
      ]) ||
      payload.submissionReceiptId !== submission.receiptId ||
      !isCanonicalTimestamp(payload.windowStartedAt) ||
      !isCanonicalTimestamp(payload.windowEndedAt) ||
      !isSafeNonNegativeInteger(payload.sampleSize) ||
      payload.sampleSize === 0 ||
      typeof payload.crashRate !== 'number' ||
      !Number.isFinite(payload.crashRate) ||
      payload.crashRate < 0 ||
      payload.crashRate > 1 ||
      typeof payload.errorRate !== 'number' ||
      !Number.isFinite(payload.errorRate) ||
      payload.errorRate < 0 ||
      payload.errorRate > 1 ||
      payload.criticalFindingCount !== 0 ||
      !isSha256(payload.thresholdPolicySha256) ||
      !isSha256(payload.metricsSha256) ||
      payload.passed !== true ||
      !isCanonicalTimestamp(payload.passedAt) ||
      payload.passedAt !== receipt.occurredAt ||
      Date.parse(submission.occurredAt as string) > Date.parse(payload.windowStartedAt) ||
      Date.parse(payload.windowStartedAt) > Date.parse(payload.windowEndedAt) ||
      Date.parse(payload.windowEndedAt) > Date.parse(payload.passedAt)
    ) {
      throw new ReleaseReadinessDurableStoreError('Durable canary payload is invalid.');
    }
  } else if (action === 'production_promotion') {
    if (
      canary === null ||
      !hasExactKeys(payload, [
        'canaryReceiptId',
        'extensionId',
        'promotedArtifactSha256',
        'promotedAt',
      ]) ||
      payload.canaryReceiptId !== canary.receiptId ||
      !isCanonicalId(payload.extensionId) ||
      payload.promotedArtifactSha256 !== zip.zipSha256 ||
      !isCanonicalTimestamp(payload.promotedAt) ||
      payload.promotedAt !== receipt.occurredAt ||
      Date.parse(canary.occurredAt as string) > Date.parse(payload.promotedAt)
    ) {
      throw new ReleaseReadinessDurableStoreError('Durable promotion payload is invalid.');
    }
  } else {
    const rollbackTarget = strictObject(store.rollbackTarget, 'durable rollback target');
    const predecessor = promotion ?? canary;
    const restorationHealth = strictObject(payload.restorationHealth, 'durable rollback health');
    if (
      predecessor === null ||
      !hasExactKeys(payload, [
        'deploymentReceiptId',
        'restorationHealth',
        'rollbackTargetArtifactSha256',
        'rollbackTargetId',
        'rolledBackAt',
      ]) ||
      payload.deploymentReceiptId !== predecessor.receiptId ||
      payload.rollbackTargetId !== rollbackTarget.targetId ||
      payload.rollbackTargetArtifactSha256 !== rollbackTarget.artifactSha256 ||
      !isCanonicalTimestamp(payload.rolledBackAt) ||
      payload.rolledBackAt !== receipt.occurredAt ||
      !hasExactKeys(restorationHealth, [
        'checkedAt',
        'criticalFindingCount',
        'healthy',
        'metricsSha256',
      ]) ||
      !isCanonicalTimestamp(restorationHealth.checkedAt) ||
      restorationHealth.healthy !== true ||
      restorationHealth.criticalFindingCount !== 0 ||
      !isSha256(restorationHealth.metricsSha256) ||
      Date.parse(predecessor.occurredAt as string) > Date.parse(payload.rolledBackAt) ||
      Date.parse(payload.rolledBackAt) > Date.parse(restorationHealth.checkedAt)
    ) {
      throw new ReleaseReadinessDurableStoreError('Durable rollback payload is invalid.');
    }
  }
  return receipt;
}

function replayRecordMatchesAuthorizationEnvelope(
  replay: GlobalReplayRegistryV1['tuples'][number]['consumed'][number],
  value: unknown
): boolean {
  const authorization = strictObject(value, 'durable replay authorization');
  return (
    replay.kind === 'authorization' &&
    replay.provider === authorization.provider &&
    replay.issuerId === authorization.issuerId &&
    replay.issuerKeyId === authorization.issuerKeyId &&
    replay.providerOperationId === null &&
    replay.nonceSha256 === sha256String(authorization.nonce) &&
    replay.receiptId === authorization.receiptId &&
    replay.action === authorization.action &&
    replay.issuerSequence === authorization.issuerSequence &&
    replay.canonicalEnvelopeSha256 === sha256Jcs(authorization) &&
    replay.authorizedPayloadSha256 === authorization.authorizedPayloadSha256 &&
    replay.releaseId === authorization.releaseId &&
    replay.artifactId === authorization.artifactId
  );
}

function sha256String(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function replayRecordMatchesExternalEnvelope(
  replay: GlobalReplayRegistryV1['tuples'][number]['consumed'][number],
  value: unknown
): boolean {
  const receipt = strictObject(value, 'durable replay external receipt');
  const action = receipt.action as ExternalReceiptAction;
  if (!(action in EXTERNAL_AUTHORIZATION_ACTIONS)) {
    return false;
  }
  const eventType = AUTHORIZATION_EVENT_TYPES[EXTERNAL_AUTHORIZATION_ACTIONS[action]];
  return (
    replay.kind === 'external_receipt' &&
    replay.provider === receipt.provider &&
    replay.issuerId === receipt.issuerId &&
    replay.issuerKeyId === receipt.issuerKeyId &&
    replay.providerOperationId === receipt.providerOperationId &&
    replay.nonceSha256 === sha256String(receipt.requestNonce) &&
    replay.receiptId === receipt.receiptId &&
    replay.action === action &&
    replay.issuerSequence === receipt.issuerSequence &&
    replay.canonicalEnvelopeSha256 === sha256Jcs(receipt) &&
    replay.authorizedPayloadSha256 === authorizationTargetSha256(eventType, receipt) &&
    replay.releaseId === receipt.releaseId &&
    replay.artifactId === receipt.artifactId
  );
}

function nullableObject(value: unknown): boolean {
  return value === null || (typeof value === 'object' && !Array.isArray(value));
}

function localObservationSha256(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  try {
    return sha256Jcs(
      typeof record.observationSha256 === 'string'
        ? Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'observationSha256'))
        : record
    );
  } catch {
    return null;
  }
}

function validateAcceptedEvents(value: unknown): ReleaseReadinessContextV1['acceptedLocalEvents'] {
  if (!Array.isArray(value) || value.length > 1_024) {
    throw new ReleaseReadinessDurableStoreError('Durable actor event history is invalid.');
  }
  return value.map((rawEvent) => {
    const event = strictObject(rawEvent, 'durable actor event');
    if (
      !hasExactKeys(event, ['eventSha256', 'eventType', 'stableIds']) ||
      typeof event.eventType !== 'string' ||
      !RELEASE_EVENT_TYPES.has(event.eventType) ||
      !isSha256(event.eventSha256) ||
      !Array.isArray(event.stableIds) ||
      event.stableIds.length > 8 ||
      !event.stableIds.every(isCanonicalId) ||
      new Set(event.stableIds).size !== event.stableIds.length
    ) {
      throw new ReleaseReadinessDurableStoreError('Durable actor event proof is invalid.');
    }
    return clone(event as unknown as ReleaseReadinessContextV1['acceptedLocalEvents'][number]);
  });
}

function validateAcceptedEventSequence(
  events: ReleaseReadinessContextV1['acceptedLocalEvents'],
  hasCandidateHistory: boolean
): ReleaseReadinessContextV1['state'] {
  let state: ReleaseReadinessContextV1['state'] = 'audited';
  let hasSubmission = false;
  let restartPending = false;
  for (const [index, event] of events.entries()) {
    if (event.eventType === 'NEW_CANDIDATE_INGESTED') {
      if (!hasCandidateHistory || index !== 0 || state !== 'audited') {
        throw new ReleaseReadinessDurableStoreError(
          'Durable candidate replacement event sequence is invalid.'
        );
      }
      continue;
    }
    if (event.eventType === 'SERVICE_RESTARTED') {
      if (restartPending) {
        throw new ReleaseReadinessDurableStoreError('Durable restart event sequence is invalid.');
      }
      restartPending = true;
      continue;
    }
    if (event.eventType === 'LOCAL_RELEASE_OBSERVATION_INGESTED') {
      if (!restartPending) {
        throw new ReleaseReadinessDurableStoreError(
          'Durable restart observation sequence is invalid.'
        );
      }
      restartPending = false;
      continue;
    }
    if (restartPending) {
      throw new ReleaseReadinessDurableStoreError(
        'Durable business event occurred while restart observation was pending.'
      );
    }
    switch (event.eventType) {
      case 'BLOCKERS_INGESTED':
      case 'LOCAL_EVIDENCE_INVALIDATED':
        if (state === 'rolled_back') {
          throw new ReleaseReadinessDurableStoreError(
            'Durable terminal actor accepted a later diagnostic transition.'
          );
        }
        if (state !== 'canary' && state !== 'production') {
          state = 'blocked';
        }
        break;
      case 'RC_SEAL_INGESTED':
        if (state !== 'audited') {
          throw new ReleaseReadinessDurableStoreError('Durable seal transition is out of order.');
        }
        state = 'rc_built';
        break;
      case 'RELEASE_PAYLOAD_VERIFIED_INGESTED':
      case 'PACKAGE_JOURNAL_INGESTED':
        if (
          state !== 'rc_built' &&
          !(event.eventType === 'PACKAGE_JOURNAL_INGESTED' && state === 'blocked')
        ) {
          throw new ReleaseReadinessDurableStoreError(
            'Durable verification or journal transition is out of order.'
          );
        }
        break;
      case 'PACKAGE_VALIDATED_INGESTED':
        if (state === 'rc_built') {
          state = 'package_validated';
        } else if (state !== 'blocked') {
          throw new ReleaseReadinessDurableStoreError(
            'Durable artifact publication transition is out of order.'
          );
        }
        break;
      case 'STORE_READINESS_INGESTED':
        if (state !== 'package_validated') {
          throw new ReleaseReadinessDurableStoreError('Durable Store transition is out of order.');
        }
        state = 'store_ready';
        break;
      case 'SUBMISSION_RECEIPT_INGESTED':
        if (state !== 'store_ready' || hasSubmission) {
          throw new ReleaseReadinessDurableStoreError(
            'Durable submission transition is out of order.'
          );
        }
        hasSubmission = true;
        break;
      case 'CANARY_PASS_RECEIPT_INGESTED':
        if (state !== 'store_ready' || !hasSubmission) {
          throw new ReleaseReadinessDurableStoreError('Durable canary transition is out of order.');
        }
        state = 'canary';
        break;
      case 'PRODUCTION_PROMOTION_RECEIPT_INGESTED':
        if (state !== 'canary') {
          throw new ReleaseReadinessDurableStoreError(
            'Durable production promotion transition is out of order.'
          );
        }
        state = 'production';
        break;
      case 'ROLLBACK_RECEIPT_INGESTED':
        if (state !== 'canary' && state !== 'production') {
          throw new ReleaseReadinessDurableStoreError(
            'Durable rollback transition is out of order.'
          );
        }
        state = 'rolled_back';
        break;
      default:
        throw new ReleaseReadinessDurableStoreError(
          'Durable actor contains an unknown transition.'
        );
    }
  }
  return state;
}

function exactAcceptedEvent(
  events: ReleaseReadinessContextV1['acceptedLocalEvents'],
  eventType: ReleaseReadinessContextV1['acceptedLocalEvents'][number]['eventType']
): ReleaseReadinessContextV1['acceptedLocalEvents'][number] | null {
  const matches = events.filter((event) => event.eventType === eventType);
  if (matches.length > 1 && eventType !== 'PACKAGE_JOURNAL_INGESTED') {
    throw new ReleaseReadinessDurableStoreError(
      `Durable ${eventType} transition is not single-assignment.`
    );
  }
  return matches.at(-1) ?? null;
}

function persistedCanonicalId(value: unknown, key: string, label: string): string {
  const record = strictObject(value, label);
  if (!isCanonicalId(record[key])) {
    throw new ReleaseReadinessDurableStoreError(`${label} has no canonical ${key}.`);
  }
  return record[key];
}

function persistedReceiptId(value: unknown, label: string): string {
  return persistedCanonicalId(value, 'receiptId', label);
}

function validateContext(value: unknown, depth = 0): ReleaseReadinessContextV1 {
  if (depth > 1) {
    throw new ReleaseReadinessDurableStoreError('Durable candidate history nesting is invalid.');
  }
  const context = strictObject(value, 'durable actor context');
  if (
    !hasExactKeys(context, CONTEXT_KEYS) ||
    !isCanonicalId(context.actorId) ||
    typeof context.state !== 'string' ||
    !RELEASE_STATES.has(context.state) ||
    !Array.isArray(context.authorizations) ||
    context.authorizations.length > 8 ||
    !context.authorizations.every(nullableObject) ||
    !Array.isArray(context.candidateHistory) ||
    context.candidateHistory.length > 256 ||
    ![
      'artifact',
      'canaryPass',
      'lastError',
      'packageJournal',
      'payloadVerification',
      'productionPromotion',
      'rollback',
      'seal',
      'store',
      'submission',
      'transportObservation',
    ].every((key) => nullableObject(context[key]))
  ) {
    throw new ReleaseReadinessDurableStoreError(
      'Durable actor context envelope or identity is invalid.'
    );
  }
  const candidate = parseCandidateIdentity(context.candidate);
  const audit = parseAuditReceipt(context.audit);
  if (
    audit.releaseId !== candidate.releaseId ||
    audit.sourceCommit !== candidate.sourceCommit ||
    audit.committedVersion !== candidate.committedVersion ||
    audit.releaseNamespace !== candidate.releaseNamespace ||
    audit.mv3ScenarioInventoryBlobSha256 !== candidate.mv3ScenarioInventoryBlobSha256 ||
    audit.expectedMv3ScenarioInventorySha256 !== candidate.expectedMv3ScenarioInventorySha256
  ) {
    throw new ReleaseReadinessDurableStoreError(
      'Durable actor audit and candidate identity diverge.'
    );
  }
  const acceptedLocalEvents = validateAcceptedEvents(context.acceptedLocalEvents);
  const acceptedTypes = new Set(acceptedLocalEvents.map((event) => event.eventType));
  const derivedState = validateAcceptedEventSequence(
    acceptedLocalEvents,
    context.candidateHistory.length > 0
  );
  if (derivedState !== context.state) {
    throw new ReleaseReadinessDurableStoreError(
      'Durable actor state diverges from its accepted transition sequence.'
    );
  }
  let pendingRestartFromHistory: string | null = null;
  for (const acceptedEvent of acceptedLocalEvents) {
    if (acceptedEvent.eventType === 'SERVICE_RESTARTED') {
      if (pendingRestartFromHistory !== null || acceptedEvent.stableIds.length !== 1) {
        throw new ReleaseReadinessDurableStoreError('Durable restart event sequence is invalid.');
      }
      pendingRestartFromHistory = acceptedEvent.stableIds[0] ?? null;
      continue;
    }
    if (acceptedEvent.eventType === 'LOCAL_RELEASE_OBSERVATION_INGESTED') {
      if (pendingRestartFromHistory === null || acceptedEvent.stableIds.length !== 1) {
        throw new ReleaseReadinessDurableStoreError(
          'Durable restart observation sequence is invalid.'
        );
      }
      pendingRestartFromHistory = null;
      continue;
    }
    if (pendingRestartFromHistory !== null) {
      throw new ReleaseReadinessDurableStoreError(
        'Durable business event occurred while restart observation was pending.'
      );
    }
  }
  const persistedPendingRestartId =
    context.pendingRestart === null
      ? null
      : (strictObject(context.pendingRestart, 'durable pending restart').restartId as unknown);
  if (persistedPendingRestartId !== pendingRestartFromHistory) {
    throw new ReleaseReadinessDurableStoreError(
      'Durable pending restart diverges from accepted event history.'
    );
  }

  if (context.pendingRestart !== null) {
    const pending = strictObject(context.pendingRestart, 'durable pending restart');
    const lastEvent = acceptedLocalEvents.at(-1);
    if (
      !hasExactKeys(pending, ['restartId', 'restartedAt']) ||
      !isCanonicalId(pending.restartId) ||
      !isCanonicalTimestamp(pending.restartedAt) ||
      lastEvent?.eventType !== 'SERVICE_RESTARTED' ||
      lastEvent.stableIds.length !== 1 ||
      lastEvent.stableIds[0] !== pending.restartId
    ) {
      throw new ReleaseReadinessDurableStoreError(
        'Durable pending restart correlation is invalid.'
      );
    }
  }

  if (context.lastLocalObservation !== null) {
    const observation = strictObject(
      context.lastLocalObservation,
      'durable local observation proof'
    );
    if (
      !hasExactKeys(observation, [
        'error',
        'observation',
        'observationId',
        'observationSha256',
        'restartId',
        'valid',
      ]) ||
      !isCanonicalId(observation.observationId) ||
      !isCanonicalId(observation.restartId) ||
      observation.valid !== true ||
      observation.error !== null ||
      !isSha256(observation.observationSha256) ||
      typeof observation.observation !== 'object' ||
      observation.observation === null ||
      Array.isArray(observation.observation) ||
      localObservationSha256(observation.observation) !== observation.observationSha256 ||
      !acceptedLocalEvents.some(
        (event) =>
          event.eventType === 'SERVICE_RESTARTED' &&
          event.stableIds.includes(observation.restartId as string)
      ) ||
      !acceptedLocalEvents.some(
        (event) =>
          event.eventType === 'LOCAL_RELEASE_OBSERVATION_INGESTED' &&
          event.stableIds.includes(observation.observationId as string)
      )
    ) {
      throw new ReleaseReadinessDurableStoreError('Durable local observation proof is invalid.');
    }
  }

  if ((context.seal === null) !== (context.sealIdentity === null)) {
    throw new ReleaseReadinessDurableStoreError('Durable seal proof assignment is incomplete.');
  }
  if (context.sealIdentity !== null) {
    const seal = strictObject(context.sealIdentity, 'durable seal identity');
    const persistedSeal = strictObject(context.seal, 'durable tested dist seal');
    const sealEvent = exactAcceptedEvent(acceptedLocalEvents, 'RC_SEAL_INGESTED');
    const shaKeys = [
      'buildMetadataSha256',
      'buildProvenanceSha256',
      'controllerBundleSha256',
      'controllerBundleSourceInventorySha256',
      'effectiveLoadedObjectsSha256',
      'executionAuthoritySha256',
      'finalRootInventorySha256',
      'ociArchiveSha256',
      'ociConfigSha256',
      'ociIndexSha256',
      'ociManifestSha256',
      'payloadInventorySha256',
      'pythonExecutableSha256',
      'pythonRuntimeTreeSha256',
      'sealSha256',
    ];
    if (
      !hasExactKeys(seal, [
        ...shaKeys,
        'diffIdSha256',
        'layerSha256',
        'releaseId',
        'sealId',
        'sealedAt',
        'sourceCommit',
      ]) ||
      !shaKeys.every((key) => isSha256(seal[key])) ||
      !isCanonicalId(seal.sealId) ||
      seal.releaseId !== candidate.releaseId ||
      seal.sourceCommit !== candidate.sourceCommit ||
      !isCanonicalTimestamp(seal.sealedAt) ||
      !Array.isArray(seal.layerSha256) ||
      seal.layerSha256.length === 0 ||
      !seal.layerSha256.every(isSha256) ||
      !Array.isArray(seal.diffIdSha256) ||
      seal.diffIdSha256.length !== seal.layerSha256.length ||
      !seal.diffIdSha256.every(isSha256) ||
      !hasExactKeys(persistedSeal, [
        ...shaKeys,
        'diffIdSha256',
        'layerSha256',
        'releaseId',
        'schema',
        'sealId',
        'sealedAt',
        'sourceCommit',
        'transportSha256',
        'transportZipReceiptSha256',
        'version',
      ]) ||
      persistedSeal.schema !== 'missionpulse.tested-dist-seal' ||
      persistedSeal.version !== 1 ||
      persistedSeal.sealSha256 !== sha256Jcs(withoutKey(persistedSeal, 'sealSha256')) ||
      [
        ...shaKeys,
        'diffIdSha256',
        'layerSha256',
        'releaseId',
        'sealId',
        'sealedAt',
        'sourceCommit',
      ].some((key) => jcsCanonicalize(persistedSeal[key]) !== jcsCanonicalize(seal[key])) ||
      !isSha256(persistedSeal.transportSha256) ||
      !isSha256(persistedSeal.transportZipReceiptSha256) ||
      sealEvent === null ||
      sealEvent.stableIds.length !== 1 ||
      sealEvent.stableIds[0] !== seal.sealId ||
      persistedSeal.sealId !== seal.sealId ||
      persistedSeal.releaseId !== candidate.releaseId ||
      persistedSeal.sourceCommit !== candidate.sourceCommit ||
      persistedSeal.sealSha256 !== seal.sealSha256
    ) {
      throw new ReleaseReadinessDurableStoreError('Durable seal identity is invalid.');
    }
  }

  if ((context.transportObservation === null) !== (context.payloadVerification === null)) {
    throw new ReleaseReadinessDurableStoreError(
      'Durable transport/payload proof assignment is incomplete.'
    );
  }
  if (context.transportObservation !== null) {
    const transport = parseSealedCandidateTransportObservation(context.transportObservation);
    const verification = parseReleaseExecutionPayloadVerification(context.payloadVerification);
    const verificationEvent = exactAcceptedEvent(
      acceptedLocalEvents,
      'RELEASE_PAYLOAD_VERIFIED_INGESTED'
    );
    const sealIdentity = strictObject(context.sealIdentity, 'durable verified seal identity');
    const persistedSeal = strictObject(context.seal, 'durable verified tested dist seal');
    const sealVerificationProjectionKeys = [
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
      'sealSha256',
    ];
    if (
      verificationEvent === null ||
      jcsCanonicalize(verificationEvent.stableIds) !==
        jcsCanonicalize([
          transport.preUploadAttestation.attestationId,
          verification.verificationId,
        ]) ||
      verification.releaseId !== candidate.releaseId ||
      verification.sourceCommit !== candidate.sourceCommit ||
      transport.headSha !== candidate.sourceCommit ||
      transport.preUploadAttestation.headSha !== candidate.sourceCommit ||
      verification.sealId !== sealIdentity.sealId ||
      verification.transportSha256 !== transport.transportSha256 ||
      verification.transportSha256 !== persistedSeal.transportSha256 ||
      verification.transportZipReceiptSha256 !== persistedSeal.transportZipReceiptSha256 ||
      !isSha256(verification.controllerExecutionAuthoritySha256) ||
      sealVerificationProjectionKeys.some(
        (key) =>
          jcsCanonicalize((verification as unknown as Record<string, unknown>)[key]) !==
          jcsCanonicalize(sealIdentity[key])
      ) ||
      Date.parse(sealIdentity.sealedAt as string) > Date.parse(transport.capturedAt) ||
      Date.parse(transport.observedAt) > Date.parse(verification.verifiedAt) ||
      Date.parse(verification.verifiedAt) >= Date.parse(transport.artifactExpiresAt)
    ) {
      throw new ReleaseReadinessDurableStoreError('Durable transport proof has no accepted event.');
    }
  }

  if ((context.packageJournal === null) !== (context.packageJournalIdentity === null)) {
    throw new ReleaseReadinessDurableStoreError(
      'Durable package journal proof assignment is incomplete.'
    );
  }
  if (context.packageJournalIdentity !== null) {
    const identity = strictObject(
      context.packageJournalIdentity,
      'durable package journal identity'
    );
    const journal = strictObject(context.packageJournal, 'durable package journal');
    const journalEvents = acceptedLocalEvents.filter(
      (event) => event.eventType === 'PACKAGE_JOURNAL_INGESTED'
    );
    if (
      !hasExactKeys(identity, ['journalId', 'journalSha256', 'previousJournalSha256']) ||
      !hasExactKeys(journal, ['journalId', 'journalSha256', 'previousJournalSha256']) ||
      !isCanonicalId(identity.journalId) ||
      !isSha256(identity.journalSha256) ||
      !(identity.previousJournalSha256 === null || isSha256(identity.previousJournalSha256)) ||
      journal.journalSha256 !==
        sha256Jcs({
          journalId: journal.journalId,
          previousJournalSha256: journal.previousJournalSha256,
        }) ||
      journalEvents.length === 0 ||
      journalEvents.some(
        (event) => event.stableIds.length !== 1 || event.stableIds[0] !== identity.journalId
      ) ||
      journal.journalId !== identity.journalId ||
      journal.journalSha256 !== identity.journalSha256 ||
      journal.previousJournalSha256 !== identity.previousJournalSha256
    ) {
      throw new ReleaseReadinessDurableStoreError('Durable package journal identity is invalid.');
    }
  }

  const artifactEvent = exactAcceptedEvent(acceptedLocalEvents, 'PACKAGE_VALIDATED_INGESTED');
  if ((context.artifact === null) !== (artifactEvent === null)) {
    throw new ReleaseReadinessDurableStoreError(
      'Durable artifact assignment diverges from its accepted event.'
    );
  }
  if (context.artifact !== null) {
    const artifact = validateDurableArtifact(
      context.artifact,
      candidate,
      context.sealIdentity,
      context.packageJournalIdentity
    );
    const artifactId = persistedCanonicalId(artifact, 'artifactId', 'durable artifact');
    if (artifactEvent?.stableIds.length !== 1 || artifactEvent.stableIds[0] !== artifactId) {
      throw new ReleaseReadinessDurableStoreError(
        'Durable artifact identity diverges from its accepted event.'
      );
    }
  }

  if (context.store !== null) {
    if (context.artifact === null) {
      throw new ReleaseReadinessDurableStoreError(
        'Durable Store receipt has no validated artifact.'
      );
    }
    const artifact = strictObject(context.artifact, 'durable validated artifact');
    const store = validateStoreReceipt(context.store, candidate, artifact);
    const artifactId = store.artifactId as string;
    const proofs: Array<{
      readonly action: AuthorizationAction;
      readonly target: Record<string, unknown>;
      readonly availableAt: string;
    }> = [
      {
        action: 'mark_store_ready',
        target: store,
        availableAt: store.completedAt as string,
      },
    ];
    let submission: Record<string, unknown> | null = null;
    let canary: Record<string, unknown> | null = null;
    let promotion: Record<string, unknown> | null = null;
    if (context.submission !== null) {
      submission = validateExternalReceipt(
        context.submission,
        'submission',
        candidate,
        artifact,
        store,
        null,
        null,
        null
      );
      proofs.push({
        action: 'ingest_submission',
        target: submission,
        availableAt: submission.verifiedAt as string,
      });
    }
    if (context.canaryPass !== null) {
      canary = validateExternalReceipt(
        context.canaryPass,
        'canary_pass',
        candidate,
        artifact,
        store,
        submission,
        null,
        null
      );
      proofs.push({
        action: 'ingest_canary_pass',
        target: canary,
        availableAt: canary.verifiedAt as string,
      });
    }
    if (context.productionPromotion !== null) {
      promotion = validateExternalReceipt(
        context.productionPromotion,
        'production_promotion',
        candidate,
        artifact,
        store,
        submission,
        canary,
        null
      );
      proofs.push({
        action: 'ingest_production_promotion',
        target: promotion,
        availableAt: promotion.verifiedAt as string,
      });
    }
    if (context.rollback !== null) {
      const rollback = validateExternalReceipt(
        context.rollback,
        'rollback',
        candidate,
        artifact,
        store,
        submission,
        canary,
        promotion
      );
      proofs.push({
        action: 'ingest_rollback',
        target: rollback,
        availableAt: rollback.verifiedAt as string,
      });
    }
    if (proofs.length !== context.authorizations.length) {
      throw new ReleaseReadinessDurableStoreError(
        'Durable protected proof and authorization counts diverge.'
      );
    }
    for (const [index, proof] of proofs.entries()) {
      const authorization = context.authorizations[index];
      if (authorization === undefined) {
        throw new ReleaseReadinessDurableStoreError(
          'Durable protected proof has no authorization.'
        );
      }
      validateAuthorizationReceipt(
        authorization,
        proof.action,
        proof.target,
        candidate,
        context.actorId as string,
        artifactId,
        proof.availableAt
      );
    }
  } else if (context.authorizations.length !== 0) {
    throw new ReleaseReadinessDurableStoreError(
      'Durable actor has authorization records without Store authority.'
    );
  }

  const protectedBindings = [
    {
      eventType: 'STORE_READINESS_INGESTED' as const,
      proof: context.store,
    },
    {
      eventType: 'SUBMISSION_RECEIPT_INGESTED' as const,
      proof: context.submission,
    },
    {
      eventType: 'CANARY_PASS_RECEIPT_INGESTED' as const,
      proof: context.canaryPass,
    },
    {
      eventType: 'PRODUCTION_PROMOTION_RECEIPT_INGESTED' as const,
      proof: context.productionPromotion,
    },
    {
      eventType: 'ROLLBACK_RECEIPT_INGESTED' as const,
      proof: context.rollback,
    },
  ];
  const acceptedProtectedBindings = protectedBindings.filter(({ eventType }) =>
    acceptedTypes.has(eventType)
  );
  if (context.authorizations.length !== acceptedProtectedBindings.length) {
    throw new ReleaseReadinessDurableStoreError(
      'Durable authorization collection diverges from protected transitions.'
    );
  }
  for (const [authorizationOffset, binding] of acceptedProtectedBindings.entries()) {
    if (binding.proof === null) {
      throw new ReleaseReadinessDurableStoreError(`Durable ${binding.eventType} proof is missing.`);
    }
    const event = exactAcceptedEvent(acceptedLocalEvents, binding.eventType);
    const proofId = persistedReceiptId(binding.proof, `durable ${binding.eventType} proof`);
    const authorization = context.authorizations[authorizationOffset];
    const authorizationId = persistedReceiptId(
      authorization,
      `durable ${binding.eventType} authorization`
    );
    if (
      event === null ||
      event.stableIds.length !== 2 ||
      event.stableIds[0] !== proofId ||
      event.stableIds[1] !== authorizationId
    ) {
      throw new ReleaseReadinessDurableStoreError(
        `Durable ${binding.eventType} identities diverge from its accepted event.`
      );
    }
  }
  for (const binding of protectedBindings) {
    if (!acceptedTypes.has(binding.eventType) && binding.proof !== null) {
      throw new ReleaseReadinessDurableStoreError(
        `Durable ${binding.eventType} proof has no accepted event.`
      );
    }
  }

  const state = context.state;
  const requires = (condition: boolean, message: string): void => {
    if (!condition) {
      throw new ReleaseReadinessDurableStoreError(message);
    }
  };
  if (state === 'audited') {
    requires(
      context.seal === null &&
        context.artifact === null &&
        context.store === null &&
        context.submission === null &&
        context.canaryPass === null &&
        context.productionPromotion === null &&
        context.rollback === null,
      'Audited durable state contains later-state proofs.'
    );
  } else if (state !== 'blocked') {
    requires(context.seal !== null, 'Durable post-audit state is missing its seal proof.');
  }
  if (['package_validated', 'store_ready', 'canary', 'production', 'rolled_back'].includes(state)) {
    requires(
      context.artifact !== null && acceptedTypes.has('PACKAGE_VALIDATED_INGESTED'),
      'Durable package state is missing artifact authority.'
    );
  }
  if (['store_ready', 'canary', 'production', 'rolled_back'].includes(state)) {
    requires(
      context.store !== null && acceptedTypes.has('STORE_READINESS_INGESTED'),
      'Durable external state is missing Store authority.'
    );
  }
  if (['canary', 'production'].includes(state)) {
    requires(
      context.submission !== null &&
        context.canaryPass !== null &&
        acceptedTypes.has('SUBMISSION_RECEIPT_INGESTED') &&
        acceptedTypes.has('CANARY_PASS_RECEIPT_INGESTED'),
      'Durable canary/production state is missing predecessor proofs.'
    );
  }
  if (state === 'production') {
    requires(
      context.productionPromotion !== null &&
        acceptedTypes.has('PRODUCTION_PROMOTION_RECEIPT_INGESTED'),
      'Durable production state is missing promotion authority.'
    );
  }
  if (state === 'rolled_back') {
    requires(
      context.rollback !== null && acceptedTypes.has('ROLLBACK_RECEIPT_INGESTED'),
      'Durable rolled-back state is missing rollback authority.'
    );
  }

  const history = context.candidateHistory.map((rawHistory) => {
    const entry = strictObject(rawHistory, 'durable candidate history entry');
    if (
      !hasExactKeys(entry, ['archivedAt', 'audit', 'candidate', 'context', 'contextSha256']) ||
      !isCanonicalTimestamp(entry.archivedAt) ||
      !isSha256(entry.contextSha256)
    ) {
      throw new ReleaseReadinessDurableStoreError('Durable candidate history envelope is invalid.');
    }
    const archivedCandidate = parseCandidateIdentity(entry.candidate);
    const archivedAudit = parseAuditReceipt(entry.audit);
    const archivedContext = validateContext(entry.context, depth + 1);
    if (
      archivedCandidate.releaseId !== archivedContext.candidate.releaseId ||
      archivedAudit.receiptId !== archivedContext.audit.receiptId ||
      jcsCanonicalize(archivedCandidate) !== jcsCanonicalize(archivedContext.candidate) ||
      jcsCanonicalize(archivedAudit) !== jcsCanonicalize(archivedContext.audit) ||
      archivedContext.actorId !== context.actorId ||
      archivedContext.candidateHistory.length !== 0 ||
      releaseContextSha256(archivedContext) !== entry.contextSha256
    ) {
      throw new ReleaseReadinessDurableStoreError(
        'Durable candidate history proof or digest is invalid.'
      );
    }
    return {
      candidate: archivedCandidate,
      audit: archivedAudit,
      archivedAt: entry.archivedAt as string,
      contextSha256: entry.contextSha256 as string,
      context: archivedContext,
    };
  });
  if (depth > 0 && history.length !== 0) {
    throw new ReleaseReadinessDurableStoreError(
      'Archived durable context cannot contain nested candidate history.'
    );
  }
  if (
    depth === 0 &&
    history.length > 0 &&
    (acceptedLocalEvents[0]?.eventType !== 'NEW_CANDIDATE_INGESTED' ||
      !acceptedLocalEvents[0].stableIds.includes(candidate.releaseId) ||
      !acceptedLocalEvents[0].stableIds.includes(audit.receiptId) ||
      new Set([candidate.releaseId, ...history.map((entry) => entry.candidate.releaseId)]).size !==
        history.length + 1)
  ) {
    throw new ReleaseReadinessDurableStoreError(
      'Durable candidate history does not bind the current replacement event.'
    );
  }
  jcsCanonicalize(context);
  return clone({
    ...(context as unknown as ReleaseReadinessContextV1),
    candidate,
    audit,
    acceptedLocalEvents,
    candidateHistory: history,
  });
}

function parseState(value: unknown): DurableReleaseStateV1 {
  const record = strictObject(value, 'durable release state');
  if (
    Object.keys(record).sort().join('\0') !==
      [
        'actors',
        'catalog',
        'commandDeliveries',
        'outbox',
        'replayRegistry',
        'revision',
        'schema',
        'stateSha256',
        'version',
      ]
        .sort()
        .join('\0') ||
    record.schema !== 'missionpulse.release-readiness-durable-state' ||
    record.version !== 1 ||
    typeof record.revision !== 'number' ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 0 ||
    typeof record.stateSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(record.stateSha256) ||
    !Array.isArray(record.actors) ||
    record.actors.length > MAX_ACTORS ||
    !Array.isArray(record.outbox) ||
    record.outbox.length > MAX_OUTBOX_COMMANDS ||
    !Array.isArray(record.commandDeliveries) ||
    record.commandDeliveries.length > MAX_OUTBOX_COMMANDS
  ) {
    throw new ReleaseReadinessDurableStoreError('Durable release state envelope is invalid.');
  }
  const catalog = parseGlobalReleaseCatalog(record.catalog);
  const replayRegistry = parseGlobalReplayRegistry(record.replayRegistry);
  if (record.revision < catalog.revision || record.revision < replayRegistry.revision) {
    throw new ReleaseReadinessDurableStoreError(
      'Durable state revision precedes its catalog or replay registry.'
    );
  }
  const outbox: ReleaseReadinessOutboxCommandV1[] = [];
  const commandIds = new Set<string>();
  for (const rawCommand of record.outbox) {
    const command = strictObject(rawCommand, 'durable release command');
    if (
      Object.keys(command).sort().join('\0') !==
        'actorId\0commandId\0createdAt\0releaseId\0restartId\0type' ||
      command.type !== 'SCAN_LOCAL_RELEASE_FILES' ||
      !isCanonicalId(command.actorId) ||
      !isCanonicalId(command.releaseId) ||
      !isCanonicalId(command.restartId) ||
      !isCanonicalTimestamp(command.createdAt) ||
      command.commandId !== `scan:${command.actorId}:${command.restartId}` ||
      commandIds.has(command.commandId)
    ) {
      throw new ReleaseReadinessDurableStoreError('Durable release command is invalid.');
    }
    commandIds.add(command.commandId);
    outbox.push(command as unknown as ReleaseReadinessOutboxCommandV1);
  }
  const actors: DurableActorV1[] = [];
  const actorIds = new Set<string>();
  for (const rawActor of record.actors) {
    const actor = strictObject(rawActor, 'durable actor');
    if (
      Object.keys(actor).sort().join('\0') !== 'actorId\0context\0contextSha256' ||
      typeof actor.actorId !== 'string' ||
      typeof actor.contextSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(actor.contextSha256) ||
      actorIds.has(actor.actorId)
    ) {
      throw new ReleaseReadinessDurableStoreError('Durable actor envelope is invalid.');
    }
    const context = validateContext(actor.context);
    if (
      context.actorId !== actor.actorId ||
      releaseContextSha256(context) !== actor.contextSha256
    ) {
      throw new ReleaseReadinessDurableStoreError('Durable actor digest or identity mismatches.');
    }
    actorIds.add(actor.actorId);
    actors.push({ actorId: actor.actorId, contextSha256: actor.contextSha256, context });
  }
  for (let index = 1; index < actors.length; index += 1) {
    const previous = actors[index - 1];
    const current = actors[index];
    if (previous === undefined || current === undefined || previous.actorId >= current.actorId) {
      throw new ReleaseReadinessDurableStoreError('Durable actors must be canonically ordered.');
    }
  }
  const commandDeliveries: ReleaseReadinessCommandDeliveryReceiptV1[] = [];
  const deliveryIds = new Set<string>();
  const deliveredCommandIds = new Set<string>();
  for (const rawReceipt of record.commandDeliveries) {
    let receipt: ReleaseReadinessCommandDeliveryReceiptV1;
    try {
      receipt = parseReleaseCommandDeliveryReceipt(rawReceipt);
    } catch {
      throw new ReleaseReadinessDurableStoreError('Durable release command delivery is invalid.');
    }
    if (
      deliveryIds.has(receipt.deliveryId) ||
      deliveredCommandIds.has(receipt.commandId) ||
      commandIds.has(receipt.commandId)
    ) {
      throw new ReleaseReadinessDurableStoreError(
        'Durable release command delivery identities diverge.'
      );
    }
    deliveryIds.add(receipt.deliveryId);
    deliveredCommandIds.add(receipt.commandId);
    commandDeliveries.push(receipt);
  }
  const actorById = new Map(actors.map((actor) => [actor.actorId, actor.context] as const));
  for (const actor of actors) {
    const currentRecords = catalog.records.filter(
      (entry) => entry.releaseId === actor.context.candidate.releaseId
    );
    const reservation = currentRecords[0];
    const publications = currentRecords.filter((entry) => entry.kind === 'artifact_published');
    if (
      reservation?.kind !== 'candidate_reserved' ||
      reservation.actorId !== actor.actorId ||
      reservation.sourceCommit !== actor.context.candidate.sourceCommit ||
      reservation.releaseNamespace !== actor.context.candidate.releaseNamespace ||
      currentRecords.some((entry) => entry.kind === 'candidate_abandoned')
    ) {
      throw new ReleaseReadinessDurableStoreError(
        'Durable actor is not bound to its current catalog reservation.'
      );
    }
    if (actor.context.artifact === null) {
      if (publications.length !== 0) {
        throw new ReleaseReadinessDurableStoreError(
          'Durable actor without artifact owns a catalog publication.'
        );
      }
    } else {
      const artifact = strictObject(actor.context.artifact, 'durable published artifact');
      const zip = strictObject(artifact.zip, 'durable published artifact ZIP');
      const publication = publications[0];
      if (
        publications.length !== 1 ||
        publication === undefined ||
        currentRecords.length !== 2 ||
        publication.actorId !== actor.actorId ||
        publication.artifactId !== artifact.artifactId ||
        publication.artifactSha256 !== zip.zipSha256 ||
        publication.recordedAt !== artifact.validatedAt ||
        !isSha256(zip.zipSha256) ||
        !isCanonicalTimestamp(artifact.validatedAt)
      ) {
        throw new ReleaseReadinessDurableStoreError(
          'Durable artifact is not bound to its exact catalog publication.'
        );
      }
    }
    const replayRecords = replayRegistry.tuples.flatMap((tuple) => tuple.consumed);
    const protectedReplayBindings = [
      {
        eventType: 'STORE_READINESS_INGESTED' as const,
        proof: actor.context.store,
        authorizationAction: 'mark_store_ready',
        externalAction: null,
      },
      {
        eventType: 'SUBMISSION_RECEIPT_INGESTED' as const,
        proof: actor.context.submission,
        authorizationAction: 'ingest_submission',
        externalAction: 'submission',
      },
      {
        eventType: 'CANARY_PASS_RECEIPT_INGESTED' as const,
        proof: actor.context.canaryPass,
        authorizationAction: 'ingest_canary_pass',
        externalAction: 'canary_pass',
      },
      {
        eventType: 'PRODUCTION_PROMOTION_RECEIPT_INGESTED' as const,
        proof: actor.context.productionPromotion,
        authorizationAction: 'ingest_production_promotion',
        externalAction: 'production_promotion',
      },
      {
        eventType: 'ROLLBACK_RECEIPT_INGESTED' as const,
        proof: actor.context.rollback,
        authorizationAction: 'ingest_rollback',
        externalAction: 'rollback',
      },
    ].filter(({ eventType }) =>
      actor.context.acceptedLocalEvents.some((event) => event.eventType === eventType)
    );
    const expectedReplayReceiptIds = new Set<string>();
    for (const [index, binding] of protectedReplayBindings.entries()) {
      const authorization = actor.context.authorizations[index];
      if (authorization === undefined || binding.proof === null) {
        throw new ReleaseReadinessDurableStoreError(
          'Durable protected transition is missing replay-bound receipts.'
        );
      }
      const authorizationId = persistedReceiptId(
        authorization,
        `durable ${binding.eventType} authorization`
      );
      const proofId = persistedReceiptId(binding.proof, `durable ${binding.eventType} proof`);
      const authorizationRecords = replayRecords.filter(
        (record) =>
          record.kind === 'authorization' &&
          record.receiptId === authorizationId &&
          record.action === binding.authorizationAction &&
          record.releaseId === actor.context.candidate.releaseId &&
          record.artifactId === publications[0]?.artifactId
      );
      if (
        authorizationRecords.length !== 1 ||
        authorizationRecords[0] === undefined ||
        !replayRecordMatchesAuthorizationEnvelope(authorizationRecords[0], authorization)
      ) {
        throw new ReleaseReadinessDurableStoreError(
          'Durable authorization is absent or divergent in the replay registry.'
        );
      }
      expectedReplayReceiptIds.add(authorizationId);
      if (binding.externalAction === null) {
        continue;
      }
      const externalRecords = replayRecords.filter(
        (record) =>
          record.kind === 'external_receipt' &&
          record.receiptId === proofId &&
          record.action === binding.externalAction &&
          record.releaseId === actor.context.candidate.releaseId &&
          record.artifactId === publications[0]?.artifactId &&
          record.authorizedPayloadSha256 === authorizationRecords[0]?.authorizedPayloadSha256
      );
      if (
        externalRecords.length !== 1 ||
        externalRecords[0] === undefined ||
        !replayRecordMatchesExternalEnvelope(externalRecords[0], binding.proof)
      ) {
        throw new ReleaseReadinessDurableStoreError(
          'Durable external receipt is absent or divergent in the replay registry.'
        );
      }
      expectedReplayReceiptIds.add(proofId);
    }
    const currentReleaseReplayRecords = replayRecords.filter(
      (record) => record.releaseId === actor.context.candidate.releaseId
    );
    if (
      currentReleaseReplayRecords.length !== expectedReplayReceiptIds.size ||
      currentReleaseReplayRecords.some((record) => !expectedReplayReceiptIds.has(record.receiptId))
    ) {
      throw new ReleaseReadinessDurableStoreError(
        'Durable actor and replay registry contain crossed release authority.'
      );
    }
    for (const archived of actor.context.candidateHistory) {
      const archivedRecords = catalog.records.filter(
        (entry) => entry.releaseId === archived.candidate.releaseId
      );
      if (
        archivedRecords[0]?.kind !== 'candidate_reserved' ||
        !archivedRecords.some(
          (entry) => entry.kind === 'candidate_abandoned' || entry.kind === 'artifact_published'
        )
      ) {
        throw new ReleaseReadinessDurableStoreError(
          'Durable candidate history is not terminal in the catalog.'
        );
      }
    }
  }
  for (const command of outbox) {
    const actor = actorById.get(command.actorId);
    if (
      actor === undefined ||
      actor.candidate.releaseId !== command.releaseId ||
      actor.pendingRestart?.restartId !== command.restartId ||
      actor.pendingRestart.restartedAt !== command.createdAt ||
      !actor.acceptedLocalEvents.some(
        (event) =>
          event.eventType === 'SERVICE_RESTARTED' && event.stableIds.includes(command.restartId)
      )
    ) {
      throw new ReleaseReadinessDurableStoreError(
        'Durable scanner outbox command is not correlated to its actor restart.'
      );
    }
  }
  for (const receipt of commandDeliveries) {
    const actor = actorById.get(receipt.actorId);
    const lineage =
      actor === undefined
        ? []
        : [actor, ...actor.candidateHistory.map((history) => history.context)];
    if (
      !lineage.some(
        (context) =>
          context.candidate.releaseId === receipt.releaseId &&
          context.acceptedLocalEvents.some(
            (event) =>
              event.eventType === 'SERVICE_RESTARTED' && event.stableIds.includes(receipt.restartId)
          )
      )
    ) {
      throw new ReleaseReadinessDurableStoreError(
        'Durable scanner delivery is not correlated to actor history.'
      );
    }
  }
  for (const actor of actors) {
    const pending = actor.context.pendingRestart;
    if (pending === null) {
      continue;
    }
    const commandId = `scan:${actor.actorId}:${pending.restartId}`;
    const pendingCommandCount = outbox.filter((command) => command.commandId === commandId).length;
    const durableDeliveryCount = commandDeliveries.filter(
      (receipt) => receipt.commandId === commandId
    ).length;
    if (pendingCommandCount + durableDeliveryCount !== 1) {
      throw new ReleaseReadinessDurableStoreError(
        'Durable pending restart requires exactly one outbox command or delivery receipt.'
      );
    }
  }
  const parsed = {
    schema: 'missionpulse.release-readiness-durable-state' as const,
    version: 1 as const,
    revision: record.revision,
    stateSha256: record.stateSha256,
    catalog,
    replayRegistry,
    outbox,
    commandDeliveries,
    actors,
  };
  if (stateSha256(parsed) !== parsed.stateSha256) {
    throw new ReleaseReadinessDurableStoreError('Durable release state digest mismatches.');
  }
  return parsed;
}

function createState(catalog: GlobalReleaseCatalogV1): DurableReleaseStateV1 {
  const value = {
    schema: 'missionpulse.release-readiness-durable-state' as const,
    version: 1 as const,
    revision: 0,
    stateSha256: '',
    catalog,
    replayRegistry: createEmptyGlobalReplayRegistry(),
    outbox: [],
    commandDeliveries: [],
    actors: [] as DurableActorV1[],
  };
  value.stateSha256 = stateSha256(value);
  return parseState(value);
}

function actorsMap(state: DurableReleaseStateV1): Map<string, ReleaseReadinessContextV1> {
  return new Map(state.actors.map((actor) => [actor.actorId, clone(actor.context)]));
}

function nextState(
  current: DurableReleaseStateV1,
  catalog: GlobalReleaseCatalogV1,
  actors: ReadonlyMap<string, ReleaseReadinessContextV1>,
  replayRegistry: GlobalReplayRegistryV1 = current.replayRegistry,
  outbox: readonly ReleaseReadinessOutboxCommandV1[] = current.outbox,
  commandDeliveries: readonly ReleaseReadinessCommandDeliveryReceiptV1[] = current.commandDeliveries
): DurableReleaseStateV1 {
  const value = {
    schema: 'missionpulse.release-readiness-durable-state' as const,
    version: 1 as const,
    revision: current.revision + 1,
    stateSha256: '',
    catalog: clone(catalog),
    replayRegistry: clone(replayRegistry),
    outbox: clone(outbox),
    commandDeliveries: clone(commandDeliveries),
    actors: [...actors.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([actorId, context]) => ({
        actorId,
        contextSha256: releaseContextSha256(context),
        context: clone(context),
      })),
  };
  value.stateSha256 = stateSha256(value);
  return parseState(value);
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

function activeReservation(
  catalog: GlobalReleaseCatalogV1,
  context: ReleaseReadinessContextV1
): GlobalReleaseCatalogRecordV1 | null {
  const records = catalog.records.filter(
    (record) => record.releaseId === context.candidate.releaseId
  );
  const reservation = records[0];
  return records.length === 1 &&
    reservation?.kind === 'candidate_reserved' &&
    reservation.actorId === context.actorId &&
    reservation.sourceCommit === context.candidate.sourceCommit &&
    reservation.committedVersion === context.candidate.committedVersion &&
    reservation.releaseNamespace === context.candidate.releaseNamespace
    ? reservation
    : null;
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

export class FileReleaseReadinessTransactionPort implements ReleaseReadinessTransactionPort {
  readonly #directory: string;
  readonly #statePath: string;
  readonly #lockPath: string;
  #temporaryCounter = 0;
  #activeLockOwnerId: string | null = null;

  constructor(options: { readonly directory: string }) {
    this.#directory = resolve(options.directory);
    const directoryStat = lstatSync(this.#directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new ReleaseReadinessDurableStoreError(
        'Durable release directory must be a real directory.'
      );
    }
    this.#statePath = join(this.#directory, STATE_FILE);
    this.#lockPath = join(this.#directory, LOCK_DIRECTORY);
    this.#withLock(() => {
      if (!this.#stateExists()) {
        this.#writeState(createState(createEmptyReleaseCatalog()));
      } else {
        this.#readState();
      }
    });
  }

  readCatalog(): GlobalReleaseCatalogV1 {
    return this.#withLock(() => clone(this.#readState().catalog));
  }

  readReplayRegistry(): GlobalReplayRegistryV1 {
    return this.#withLock(() => clone(this.#readState().replayRegistry));
  }

  readPendingCommands(): readonly ReleaseReadinessOutboxCommandV1[] {
    return this.#withLock(() => clone(this.#readState().outbox));
  }

  readCommandDeliveries(): readonly ReleaseReadinessCommandDeliveryReceiptV1[] {
    return this.#withLock(() => clone(this.#readState().commandDeliveries));
  }

  readActor(actorId: string): ReleaseReadinessContextV1 | null {
    return this.#withLock(() => {
      const actor = this.#readState().actors.find((entry) => entry.actorId === actorId);
      return actor === undefined ? null : clone(actor.context);
    });
  }

  reserveCandidate(request: ReserveCandidateRequestV1): TransactionResult {
    return this.#withLock(() => {
      const state = this.#readState();
      const catalog = state.catalog;
      const actors = actorsMap(state);
      const context = request.context;
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
      const reservation: GlobalReleaseCatalogRecordV1 = {
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
        records: [...catalog.records, reservation],
      };
      nextCatalogValue.catalogSha256 = computeCatalogSha256(nextCatalogValue);
      const nextCatalog = parseGlobalReleaseCatalog(nextCatalogValue);
      actors.set(context.actorId, clone(context));
      this.#writeState(nextState(state, nextCatalog, actors));
      return { ok: true, context: clone(context) };
    });
  }

  commitActor(request: CommitActorRequestV1): TransactionResult {
    return this.#withLock(() => {
      if (!consumeReleaseTransactionAuthorization(this, 'commitActor', request)) {
        return { ok: false, code: 'ACTOR_AUTHORITY_REQUIRED' };
      }
      const state = this.#readState();
      const actors = actorsMap(state);
      const current = actors.get(request.actorId);
      if (
        current === undefined ||
        releaseContextSha256(current) !== request.expectedContextSha256
      ) {
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
        (state.outbox.length >= MAX_OUTBOX_COMMANDS ||
          state.outbox.some((entry) => entry.commandId === command.commandId))
      ) {
        return { ok: false, code: 'COMMAND_OUTBOX_CAPACITY_EXHAUSTED' };
      }
      actors.set(request.actorId, clone(request.nextContext));
      const retainedOutbox =
        completedRestartCommandId === null
          ? state.outbox
          : state.outbox.filter((entry) => entry.commandId !== completedRestartCommandId);
      this.#writeState(
        nextState(
          state,
          state.catalog,
          actors,
          state.replayRegistry,
          command === null ? retainedOutbox : [...retainedOutbox, command]
        )
      );
      return { ok: true, context: clone(request.nextContext) };
    });
  }

  publishArtifact(request: PublishArtifactRequestV1): TransactionResult {
    return this.#withLock(() => {
      if (!consumeReleaseTransactionAuthorization(this, 'publishArtifact', request)) {
        return { ok: false, code: 'ACTOR_AUTHORITY_REQUIRED' };
      }
      const state = this.#readState();
      const catalog = state.catalog;
      const actors = actorsMap(state);
      const current = actors.get(request.actorId);
      if (catalog.revision !== request.expectedCatalogRevision) {
        return { ok: false, code: 'RELEASE_CATALOG_CAS_CONFLICT' };
      }
      if (
        current === undefined ||
        releaseContextSha256(current) !== request.expectedContextSha256
      ) {
        return { ok: false, code: 'ACTOR_CAS_CONFLICT' };
      }
      if (!isExactPersistedContextTransition(current, request.nextContext, 'publication')) {
        return { ok: false, code: 'ACTOR_HISTORY_REWRITE' };
      }
      if (catalog.records.length >= 256) {
        return { ok: false, code: 'RELEASE_CATALOG_CAPACITY_EXHAUSTED' };
      }
      if (activeReservation(catalog, current) === null) {
        return { ok: false, code: 'ACTIVE_RESERVATION_MISSING' };
      }
      if (!versionCanPublish(catalog, current.candidate.committedVersion)) {
        return { ok: false, code: 'VERSION_PRECEDENCE_REJECTED' };
      }
      const publication: GlobalReleaseCatalogRecordV1 = {
        catalogSequence: catalog.records.length + 1,
        kind: 'artifact_published',
        actorId: current.actorId,
        releaseId: current.candidate.releaseId,
        sourceCommit: current.candidate.sourceCommit,
        committedVersion: current.candidate.committedVersion,
        releaseNamespace: current.candidate.releaseNamespace,
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
      actors.set(request.actorId, clone(request.nextContext));
      this.#writeState(nextState(state, nextCatalog, actors));
      return { ok: true, context: clone(request.nextContext) };
    });
  }

  commitProtectedEvent(request: CommitProtectedEventRequestV1): TransactionResult {
    return this.#withLock(() => {
      if (!consumeReleaseTransactionAuthorization(this, 'commitProtectedEvent', request)) {
        return { ok: false, code: 'ACTOR_AUTHORITY_REQUIRED' };
      }
      const state = this.#readState();
      const actors = actorsMap(state);
      const current = actors.get(request.actorId);
      if (
        current === undefined ||
        releaseContextSha256(current) !== request.expectedContextSha256
      ) {
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
        state.replayRegistry,
        request.expectedRegistryRevision,
        request.replayRecords
      );
      if (!registryResult.ok) {
        return { ok: false, code: registryResult.code };
      }
      actors.set(request.actorId, clone(request.nextContext));
      this.#writeState(nextState(state, state.catalog, actors, registryResult.registry));
      return { ok: true, context: clone(request.nextContext) };
    });
  }

  acknowledgeCommand(request: AcknowledgeReleaseCommandRequestV1): boolean {
    return this.#withLock(() => {
      if (!consumeReleaseTransactionAuthorization(this, 'acknowledgeCommand', request)) {
        return false;
      }
      const state = this.#readState();
      const index = state.outbox.findIndex((command) => command.commandId === request.commandId);
      if (index < 0) {
        return false;
      }
      let receipt: ReleaseReadinessCommandDeliveryReceiptV1;
      try {
        receipt = parseReleaseCommandDeliveryReceipt(request.deliveryReceipt);
      } catch {
        return false;
      }
      const command = state.outbox[index];
      const actors = actorsMap(state);
      const actor = command === undefined ? undefined : actors.get(command.actorId);
      if (
        command === undefined ||
        actor?.pendingRestart?.restartId !== command.restartId ||
        receipt.commandId !== command.commandId ||
        receipt.actorId !== command.actorId ||
        receipt.releaseId !== command.releaseId ||
        receipt.restartId !== command.restartId ||
        Date.parse(receipt.durablyAcceptedAt) < Date.parse(command.createdAt) ||
        state.commandDeliveries.some(
          (delivery) =>
            delivery.deliveryId === receipt.deliveryId || delivery.commandId === receipt.commandId
        )
      ) {
        return false;
      }
      const outbox = state.outbox.filter((_, candidateIndex) => candidateIndex !== index);
      this.#writeState(
        nextState(state, state.catalog, actors, state.replayRegistry, outbox, [
          ...state.commandDeliveries,
          receipt,
        ])
      );
      return true;
    });
  }

  replaceCandidate(request: ReplaceCandidateRequestV1): TransactionResult {
    return this.#withLock(() => {
      if (!consumeReleaseTransactionAuthorization(this, 'replaceCandidate', request)) {
        return { ok: false, code: 'ACTOR_AUTHORITY_REQUIRED' };
      }
      const state = this.#readState();
      const catalog = state.catalog;
      const actors = actorsMap(state);
      const current = actors.get(request.actorId);
      if (catalog.revision !== request.expectedCatalogRevision) {
        return { ok: false, code: 'RELEASE_CATALOG_CAS_CONFLICT' };
      }
      if (
        current === undefined ||
        releaseContextSha256(current) !== request.expectedContextSha256
      ) {
        return { ok: false, code: 'ACTOR_CAS_CONFLICT' };
      }
      if (!isExactPersistedContextTransition(current, request.nextContext, 'replacement')) {
        return { ok: false, code: 'ACTOR_HISTORY_REWRITE' };
      }
      const oldReservation = activeReservation(catalog, current);
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
      actors.set(request.actorId, clone(request.nextContext));
      this.#writeState(nextState(state, nextCatalog, actors));
      return { ok: true, context: clone(request.nextContext) };
    });
  }

  #stateExists(): boolean {
    try {
      const stat = lstatSync(this.#statePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new ReleaseReadinessDurableStoreError(
          'Durable release state must be one regular no-follow file.'
        );
      }
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  #readState(): DurableReleaseStateV1 {
    if (!this.#stateExists()) {
      throw new ReleaseReadinessDurableStoreError('Durable release state is missing.');
    }
    const descriptor = openSync(this.#statePath, constants.O_RDONLY | NO_FOLLOW);
    try {
      const bytes = readFileSync(descriptor);
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_STATE_BYTES) {
        throw new ReleaseReadinessDurableStoreError('Durable release state size is invalid.');
      }
      const text = bytes.toString('utf8');
      const parsed = JSON.parse(text) as unknown;
      if (!Buffer.from(jcsCanonicalize(parsed)).equals(bytes)) {
        throw new ReleaseReadinessDurableStoreError(
          'Durable release state is not exact canonical JCS.'
        );
      }
      return parseState(parsed);
    } catch (error) {
      if (error instanceof ReleaseReadinessDurableStoreError) {
        throw error;
      }
      throw new ReleaseReadinessDurableStoreError(
        error instanceof Error ? error.message : 'Durable release state read failed.'
      );
    } finally {
      closeSync(descriptor);
    }
  }

  #writeState(state: DurableReleaseStateV1): void {
    this.#assertOwnsLock();
    const validated = parseState(state);
    const bytes = Buffer.from(jcsCanonicalize(validated));
    if (bytes.byteLength > MAX_STATE_BYTES) {
      throw new ReleaseReadinessDurableStoreError('Durable release state exceeds its bound.');
    }
    const temporaryPath = join(
      this.#directory,
      `${STATE_FILE}.tmp-${process.pid}-${this.#temporaryCounter++}`
    );
    let descriptor: number | null = null;
    try {
      descriptor = openSync(
        temporaryPath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NO_FOLLOW,
        0o600
      );
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = null;
      if (this.#stateExists()) {
        const current = lstatSync(this.#statePath);
        if (!current.isFile() || current.isSymbolicLink()) {
          throw new ReleaseReadinessDurableStoreError(
            'Durable release state replacement target is unsafe.'
          );
        }
      }
      renameSync(temporaryPath, this.#statePath);
      const directoryDescriptor = openSync(this.#directory, constants.O_RDONLY | NO_FOLLOW);
      try {
        fsyncSync(directoryDescriptor);
      } finally {
        closeSync(directoryDescriptor);
      }
    } finally {
      if (descriptor !== null) {
        closeSync(descriptor);
      }
      try {
        unlinkSync(temporaryPath);
      } catch {
        // Best-effort cleanup must never mask the primary durable-write result.
      }
    }
  }

  #withLock<T>(operation: () => T): T {
    const owner = this.#acquireLock();
    this.#activeLockOwnerId = owner.ownerId;
    try {
      this.#assertOwnsLock();
      return operation();
    } finally {
      try {
        this.#releaseLock(owner);
      } finally {
        this.#activeLockOwnerId = null;
      }
    }
  }

  #acquireLock(): DurableLockOwnerV1 {
    const acquiredAt = new Date().toISOString();
    const owner: DurableLockOwnerV1 = {
      schema: 'missionpulse.release-readiness-lock-owner',
      version: 1,
      ownerId: `owner-${process.pid}-${randomBytes(16).toString('hex')}`,
      pid: process.pid,
      bootId: CURRENT_BOOT_ID,
      processStartIdentity: CURRENT_PROCESS_START_IDENTITY,
      acquiredAt,
      leaseExpiresAt: new Date(Date.parse(acquiredAt) + LOCK_LEASE_MS).toISOString(),
    };
    const attempt = (): void => {
      mkdirSync(this.#lockPath, { mode: 0o700 });
      const ownerPath = join(this.#lockPath, LOCK_OWNER_FILE);
      let descriptor: number | null = null;
      try {
        descriptor = openSync(
          ownerPath,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NO_FOLLOW,
          0o600
        );
        writeFileSync(descriptor, jcsCanonicalize(owner));
        fsyncSync(descriptor);
      } finally {
        if (descriptor !== null) {
          closeSync(descriptor);
        }
      }
      const lockDescriptor = openSync(this.#lockPath, constants.O_RDONLY | NO_FOLLOW);
      try {
        fsyncSync(lockDescriptor);
      } finally {
        closeSync(lockDescriptor);
      }
    };
    try {
      attempt();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
      this.#recoverExpiredLock();
      try {
        attempt();
      } catch (retryError) {
        if ((retryError as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new ReleaseReadinessDurableStoreError(
            'Durable release state is locked by another controller.'
          );
        }
        throw retryError;
      }
    }
    return owner;
  }

  #readLockOwner(lockPath = this.#lockPath): {
    readonly owner: DurableLockOwnerV1;
    readonly bytes: Buffer;
  } {
    const path = join(lockPath, LOCK_OWNER_FILE);
    const descriptor = openSync(path, constants.O_RDONLY | NO_FOLLOW);
    try {
      const bytes = readFileSync(descriptor);
      if (bytes.byteLength === 0 || bytes.byteLength > 4_096) {
        throw new ReleaseReadinessDurableStoreError('Durable lock owner size is invalid.');
      }
      const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
      if (!Buffer.from(jcsCanonicalize(parsed)).equals(bytes)) {
        throw new ReleaseReadinessDurableStoreError(
          'Durable lock owner is not exact canonical JCS.'
        );
      }
      return { owner: parseLockOwner(parsed), bytes };
    } finally {
      closeSync(descriptor);
    }
  }

  #processOwnsLockIdentity(owner: DurableLockOwnerV1): boolean {
    try {
      process.kill(owner.pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        return false;
      }
      return true;
    }
    if (owner.bootId !== CURRENT_BOOT_ID) {
      return false;
    }
    const observedStart = readProcessStartIdentity(owner.pid);
    return observedStart === null || observedStart === owner.processStartIdentity;
  }

  #recoverExpiredLock(): void {
    const lockStat = lstatSync(this.#lockPath);
    if (!lockStat.isDirectory() || lockStat.isSymbolicLink()) {
      throw new ReleaseReadinessDurableStoreError('Durable release lock path is unsafe.');
    }
    let ownerBytes: Buffer | null = null;
    try {
      const read = this.#readLockOwner();
      ownerBytes = read.bytes;
      if (
        Date.parse(read.owner.leaseExpiresAt) > Date.now() ||
        this.#processOwnsLockIdentity(read.owner)
      ) {
        throw new ReleaseReadinessDurableStoreError(
          'Durable release state is locked by a live controller.'
        );
      }
    } catch (error) {
      if (error instanceof ReleaseReadinessDurableStoreError) {
        if (/live controller/.test(error.message)) {
          throw error;
        }
      }
      const entries = readdirSync(this.#lockPath);
      const oldEnough = Date.now() - lockStat.mtimeMs >= LOCK_LEASE_MS;
      if (!oldEnough || entries.some((entry) => entry !== LOCK_OWNER_FILE) || entries.length > 1) {
        throw new ReleaseReadinessDurableStoreError('Durable release lock ownership is ambiguous.');
      }
      ownerBytes = null;
    }
    const quarantinePath = join(
      this.#directory,
      `${LOCK_DIRECTORY}.expired-${process.pid}-${randomBytes(8).toString('hex')}`
    );
    renameSync(this.#lockPath, quarantinePath);
    const quarantinedStat = lstatSync(quarantinePath);
    if (
      !quarantinedStat.isDirectory() ||
      quarantinedStat.isSymbolicLink() ||
      quarantinedStat.dev !== lockStat.dev ||
      quarantinedStat.ino !== lockStat.ino
    ) {
      throw new ReleaseReadinessDurableStoreError('Recovered lock directory identity diverged.');
    }
    const entries = readdirSync(quarantinePath);
    if (entries.some((entry) => entry !== LOCK_OWNER_FILE) || entries.length > 1) {
      throw new ReleaseReadinessDurableStoreError(
        'Recovered lock directory contains ambiguous objects.'
      );
    }
    if (ownerBytes !== null) {
      const reread = this.#readLockOwner(quarantinePath);
      if (!reread.bytes.equals(ownerBytes)) {
        throw new ReleaseReadinessDurableStoreError(
          'Recovered lock owner changed during takeover.'
        );
      }
    }
    if (entries.includes(LOCK_OWNER_FILE)) {
      unlinkSync(join(quarantinePath, LOCK_OWNER_FILE));
    }
    rmdirSync(quarantinePath);
  }

  #assertOwnsLock(): void {
    if (this.#activeLockOwnerId === null) {
      throw new ReleaseReadinessDurableStoreError(
        'Durable state mutation requires an owned lock lease.'
      );
    }
    let owner: DurableLockOwnerV1;
    try {
      owner = this.#readLockOwner().owner;
    } catch {
      throw new ReleaseReadinessDurableStoreError(
        'Durable state lock ownership could not be revalidated.'
      );
    }
    if (
      owner.ownerId !== this.#activeLockOwnerId ||
      owner.pid !== process.pid ||
      owner.bootId !== CURRENT_BOOT_ID ||
      owner.processStartIdentity !== CURRENT_PROCESS_START_IDENTITY
    ) {
      throw new ReleaseReadinessDurableStoreError(
        'Durable state lock ownership changed before commit.'
      );
    }
  }

  #releaseLock(owner: DurableLockOwnerV1): void {
    const current = this.#readLockOwner().owner;
    if (
      current.ownerId !== owner.ownerId ||
      current.pid !== owner.pid ||
      current.bootId !== owner.bootId ||
      current.processStartIdentity !== owner.processStartIdentity
    ) {
      throw new ReleaseReadinessDurableStoreError(
        'Durable release lock cannot be released by a different owner.'
      );
    }
    unlinkSync(join(this.#lockPath, LOCK_OWNER_FILE));
    rmdirSync(this.#lockPath);
  }
}
