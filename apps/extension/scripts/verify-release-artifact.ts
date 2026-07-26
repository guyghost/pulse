#!/usr/bin/env node

import { constants as fsConstants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertCanonicalTreeReceipt,
  inspectCanonicalTree,
  jcsCanonicalize,
  sha256Hex,
  type CanonicalTreeReceiptV2,
} from './canonical-artifact';
import {
  CanonicalZipError,
  extractCanonicalStoreZip,
  inspectCanonicalStoreZip,
  type CanonicalZipInputEntry,
  type CanonicalZipReceiptV1,
  type PackageValidationRecordV1,
} from './package-sealed-dist';

export type ReleaseArtifactVerificationErrorCode =
  | 'CONSUMER_INPUT_UNSAFE'
  | 'CONSUMER_LIMIT_EXCEEDED'
  | 'VALIDATION_RECORD_INVALID'
  | 'ZIP_NON_CANONICAL'
  | 'ZIP_DIGEST_MISMATCH'
  | 'SIDECAR_INVALID'
  | 'TREE_DIGEST_MISMATCH'
  | 'MANIFEST_IDENTITY_MISMATCH'
  | 'EXTRACTION_FAILED';

export class ReleaseArtifactVerificationError extends Error {
  readonly code: ReleaseArtifactVerificationErrorCode;
  readonly detail?: Readonly<Record<string, unknown>>;

  constructor(
    code: ReleaseArtifactVerificationErrorCode,
    message: string,
    detail?: Readonly<Record<string, unknown>>
  ) {
    super(`${code}: ${message}`);
    this.name = 'ReleaseArtifactVerificationError';
    this.code = code;
    this.detail = detail;
  }
}

export interface VerifyReleaseArtifactOptions {
  readonly zipPath: string;
  readonly checksumPath: string;
  readonly validationPath: string;
  readonly bundlePath?: string;
  readonly extractDirectory?: string;
  readonly expectedZipSha256?: string;
}

export interface VerifiedReleaseArtifact {
  readonly validationRecord: PackageValidationRecordV1;
  readonly zip: CanonicalZipReceiptV1;
  readonly archiveTree: CanonicalTreeReceiptV2;
  readonly extractedTree: CanonicalTreeReceiptV2 | null;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
export const RELEASE_CONSUMER_LIMITS = Object.freeze({
  maxJsonBytes: 16 * 1024 * 1024,
  maxZipBytes: 2 * 1024 * 1024 * 1024,
  maxSidecarBytes: 83,
});
const VALIDATION_KEYS = [
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
] as const;

async function readRegularNoFollow(
  path: string,
  maxBytes = RELEASE_CONSUMER_LIMITS.maxJsonBytes
): Promise<Buffer> {
  let handle;
  try {
    handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  } catch (error) {
    throw new ReleaseArtifactVerificationError(
      'CONSUMER_INPUT_UNSAFE',
      `Consumer input cannot be opened without following links: ${path}`,
      { cause: error instanceof Error ? error.message : String(error) }
    );
  }
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.nlink !== 1n) {
      throw new ReleaseArtifactVerificationError(
        'CONSUMER_INPUT_UNSAFE',
        `Consumer input is not one regular file: ${path}`
      );
    }
    if (before.size < 0n || before.size > BigInt(maxBytes)) {
      throw new ReleaseArtifactVerificationError(
        'CONSUMER_LIMIT_EXCEEDED',
        `Consumer input exceeds its byte bound before read: ${path}`
      );
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      bytes.byteLength !== Number(before.size)
    ) {
      throw new ReleaseArtifactVerificationError(
        'CONSUMER_INPUT_UNSAFE',
        `Consumer input changed during verification: ${path}`
      );
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function parseCanonicalValidationRecord(bytes: Buffer): PackageValidationRecordV1 {
  const raw = bytes.toString('utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ReleaseArtifactVerificationError(
      'VALIDATION_RECORD_INVALID',
      'validation.json is not JSON.'
    );
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    jcsCanonicalize(parsed) !== raw ||
    Object.keys(parsed).sort().join(',') !== [...VALIDATION_KEYS].sort().join(',')
  ) {
    throw new ReleaseArtifactVerificationError(
      'VALIDATION_RECORD_INVALID',
      'validation.json must be exact newline-free JCS with the exact schema.'
    );
  }
  const record = parsed as PackageValidationRecordV1;
  const timestamp = Date.parse(record.validatedAt);
  const digestFields = [
    record.sealSha256,
    record.sourceTreeSha256,
    record.extractedTreeSha256,
    record.ownershipMarkerSha256,
    record.zipSha256,
    record.sidecarSha256,
    record.entryInventorySha256,
    record.canonicalZipReceiptSha256,
  ];
  if (
    record.schema !== 'missionpulse.package-validation' ||
    record.version !== 1 ||
    !IDENTIFIER_PATTERN.test(record.artifactId) ||
    !IDENTIFIER_PATTERN.test(record.releaseId) ||
    !IDENTIFIER_PATTERN.test(record.sealId) ||
    !SEMVER_PATTERN.test(record.committedVersion) ||
    record.releaseNamespace !== `v${record.committedVersion}` ||
    digestFields.some((digest) => !SHA256_PATTERN.test(digest)) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.validatedAt) ||
    !Number.isSafeInteger(timestamp) ||
    timestamp < 946_684_800_000 ||
    timestamp > 253_402_300_799_999 ||
    new Date(timestamp).toISOString() !== record.validatedAt
  ) {
    throw new ReleaseArtifactVerificationError(
      'VALIDATION_RECORD_INVALID',
      'Validation record fields are not canonical.'
    );
  }
  return record;
}

function canonicalTreeFromFiles(files: readonly CanonicalZipInputEntry[]): CanonicalTreeReceiptV2 {
  const entries = files.map(({ path, bytes }) => ({
    path,
    bytes: bytes.byteLength,
    sha256: sha256Hex(bytes),
    mode: '0644' as const,
  }));
  const manifest = entries.find(({ path }) => path === 'manifest.json');
  if (manifest === undefined) {
    throw new ReleaseArtifactVerificationError(
      'MANIFEST_IDENTITY_MISMATCH',
      'Archive does not contain manifest.json.'
    );
  }
  const receipt: CanonicalTreeReceiptV2 = {
    algorithm: 'missionpulse-tree-sha256-v2',
    fileCount: entries.length,
    treeSha256: sha256Hex(
      entries.map(({ path, bytes, sha256 }) => `${path}\0${bytes}\0${sha256}\n`).join('')
    ),
    manifestSha256: manifest.sha256,
    entries,
  };
  assertCanonicalTreeReceipt(receipt);
  return receipt;
}

function assertManifest(files: readonly CanonicalZipInputEntry[], version: string): void {
  const manifestEntry = files.find(({ path }) => path === 'manifest.json');
  if (manifestEntry === undefined) {
    throw new ReleaseArtifactVerificationError(
      'MANIFEST_IDENTITY_MISMATCH',
      'Archive does not contain manifest.json.'
    );
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(Buffer.from(manifestEntry.bytes).toString('utf8'));
  } catch {
    throw new ReleaseArtifactVerificationError(
      'MANIFEST_IDENTITY_MISMATCH',
      'Extracted manifest is not JSON.'
    );
  }
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    (manifest as Record<string, unknown>).manifest_version !== 3 ||
    (manifest as Record<string, unknown>).version !== version
  ) {
    throw new ReleaseArtifactVerificationError(
      'MANIFEST_IDENTITY_MISMATCH',
      'Manifest MV3/version identity differs from validation record.'
    );
  }
}

async function assertExactBundle(
  bundlePath: string,
  options: VerifyReleaseArtifactOptions,
  record: PackageValidationRecordV1,
  expectedValidationSha256: string,
  assertContentDigests: boolean
): Promise<void> {
  const bundle = resolve(bundlePath);
  const stats = await lstat(bundle).catch(() => null);
  if (stats === null || !stats.isDirectory() || stats.isSymbolicLink()) {
    throw new ReleaseArtifactVerificationError(
      'CONSUMER_INPUT_UNSAFE',
      'Release bundle must be one real directory.'
    );
  }
  const expectedNames = [
    '.missionpulse-owner.json',
    'missionpulse.zip',
    'missionpulse.zip.sha256',
    'validation.json',
  ];
  const names = (await readdir(bundle)).sort();
  if (jcsCanonicalize(names) !== jcsCanonicalize(expectedNames)) {
    throw new ReleaseArtifactVerificationError(
      'CONSUMER_INPUT_UNSAFE',
      'Release bundle contains missing or unexplained objects.'
    );
  }
  if (
    resolve(options.zipPath) !== join(bundle, 'missionpulse.zip') ||
    resolve(options.checksumPath) !== join(bundle, 'missionpulse.zip.sha256') ||
    resolve(options.validationPath) !== join(bundle, 'validation.json')
  ) {
    throw new ReleaseArtifactVerificationError(
      'CONSUMER_INPUT_UNSAFE',
      'Consumer paths are not the exact files inside the declared bundle.'
    );
  }
  const [markerBytes, zipBytes, sidecarBytes, validationBytes] = await Promise.all([
    readRegularNoFollow(join(bundle, '.missionpulse-owner.json')),
    readRegularNoFollow(join(bundle, 'missionpulse.zip'), RELEASE_CONSUMER_LIMITS.maxZipBytes),
    readRegularNoFollow(
      join(bundle, 'missionpulse.zip.sha256'),
      RELEASE_CONSUMER_LIMITS.maxSidecarBytes
    ),
    readRegularNoFollow(join(bundle, 'validation.json'), RELEASE_CONSUMER_LIMITS.maxJsonBytes),
  ]);
  if (sha256Hex(validationBytes) !== expectedValidationSha256) {
    throw new ReleaseArtifactVerificationError(
      'CONSUMER_INPUT_UNSAFE',
      'Release validation bytes changed across consumer verification.'
    );
  }
  if (
    assertContentDigests &&
    (sha256Hex(zipBytes) !== record.zipSha256 || sha256Hex(sidecarBytes) !== record.sidecarSha256)
  ) {
    throw new ReleaseArtifactVerificationError(
      'CONSUMER_INPUT_UNSAFE',
      'Release bundle bytes changed across consumer verification.'
    );
  }
  let marker: unknown;
  try {
    marker = JSON.parse(markerBytes.toString('utf8'));
  } catch {
    throw new ReleaseArtifactVerificationError(
      'VALIDATION_RECORD_INVALID',
      'Ownership marker is not JSON.'
    );
  }
  if (
    jcsCanonicalize(marker) !== markerBytes.toString('utf8') ||
    sha256Hex(markerBytes) !== record.ownershipMarkerSha256 ||
    typeof marker !== 'object' ||
    marker === null ||
    Object.keys(marker).sort().join(',') !==
      [
        'artifactId',
        'journalId',
        'ownershipTokenSha256',
        'releaseId',
        'releaseNamespace',
        'schema',
        'sealId',
        'version',
      ]
        .sort()
        .join(',') ||
    (marker as Record<string, unknown>).schema !== 'missionpulse.package-owner' ||
    (marker as Record<string, unknown>).version !== 1 ||
    (marker as Record<string, unknown>).artifactId !== record.artifactId ||
    (marker as Record<string, unknown>).releaseId !== record.releaseId ||
    (marker as Record<string, unknown>).sealId !== record.sealId ||
    (marker as Record<string, unknown>).releaseNamespace !== record.releaseNamespace ||
    typeof (marker as Record<string, unknown>).journalId !== 'string' ||
    !IDENTIFIER_PATTERN.test((marker as Record<string, string>).journalId) ||
    typeof (marker as Record<string, unknown>).ownershipTokenSha256 !== 'string' ||
    !SHA256_PATTERN.test((marker as Record<string, string>).ownershipTokenSha256)
  ) {
    throw new ReleaseArtifactVerificationError(
      'VALIDATION_RECORD_INVALID',
      'Ownership marker does not bind the validation record.'
    );
  }
}

export async function verifyReleaseArtifact(
  options: VerifyReleaseArtifactOptions
): Promise<VerifiedReleaseArtifact> {
  const [zipBytes, sidecarBytes, validationBytes] = await Promise.all([
    readRegularNoFollow(resolve(options.zipPath), RELEASE_CONSUMER_LIMITS.maxZipBytes),
    readRegularNoFollow(resolve(options.checksumPath), RELEASE_CONSUMER_LIMITS.maxSidecarBytes),
    readRegularNoFollow(resolve(options.validationPath), RELEASE_CONSUMER_LIMITS.maxJsonBytes),
  ]);
  const record = parseCanonicalValidationRecord(validationBytes);
  if (options.bundlePath !== undefined) {
    await assertExactBundle(options.bundlePath, options, record, sha256Hex(validationBytes), false);
  }
  let parsedZip;
  try {
    parsedZip = inspectCanonicalStoreZip(zipBytes);
  } catch (error) {
    if (error instanceof CanonicalZipError) {
      throw new ReleaseArtifactVerificationError('ZIP_NON_CANONICAL', error.message);
    }
    throw error;
  }
  if (
    parsedZip.receipt.zipSha256 !== record.zipSha256 ||
    (options.expectedZipSha256 !== undefined &&
      parsedZip.receipt.zipSha256 !== options.expectedZipSha256)
  ) {
    throw new ReleaseArtifactVerificationError(
      'ZIP_DIGEST_MISMATCH',
      'ZIP bytes do not match the expected consumer digest.'
    );
  }
  const expectedSidecar = Buffer.from(`${record.zipSha256}  missionpulse.zip\n`, 'ascii');
  if (
    sidecarBytes.byteLength !== 83 ||
    !sidecarBytes.equals(expectedSidecar) ||
    sha256Hex(sidecarBytes) !== record.sidecarSha256
  ) {
    throw new ReleaseArtifactVerificationError(
      'SIDECAR_INVALID',
      'Checksum sidecar bytes or digest diverge.'
    );
  }
  if (
    parsedZip.receipt.entryInventorySha256 !== record.entryInventorySha256 ||
    sha256Hex(jcsCanonicalize(parsedZip.receipt)) !== record.canonicalZipReceiptSha256
  ) {
    throw new ReleaseArtifactVerificationError(
      'ZIP_NON_CANONICAL',
      'Canonical ZIP receipt does not match validation record.'
    );
  }
  const archiveTree = canonicalTreeFromFiles(parsedZip.files);
  if (
    archiveTree.treeSha256 !== record.sourceTreeSha256 ||
    archiveTree.treeSha256 !== record.extractedTreeSha256
  ) {
    throw new ReleaseArtifactVerificationError(
      'TREE_DIGEST_MISMATCH',
      'Archive tree does not match source/extraction receipt.'
    );
  }
  assertManifest(parsedZip.files, record.committedVersion);

  let extractedTree: CanonicalTreeReceiptV2 | null = null;
  if (options.extractDirectory !== undefined) {
    try {
      extractedTree = await extractCanonicalStoreZip(zipBytes, resolve(options.extractDirectory));
    } catch (error) {
      throw new ReleaseArtifactVerificationError(
        'EXTRACTION_FAILED',
        'Fresh safe extraction failed.',
        { cause: error instanceof Error ? error.message : String(error) }
      );
    }
    const independentlyInspected = await inspectCanonicalTree(resolve(options.extractDirectory));
    if (
      extractedTree.treeSha256 !== record.extractedTreeSha256 ||
      independentlyInspected.treeSha256 !== record.extractedTreeSha256 ||
      jcsCanonicalize(extractedTree) !== jcsCanonicalize(independentlyInspected)
    ) {
      throw new ReleaseArtifactVerificationError(
        'TREE_DIGEST_MISMATCH',
        'Fresh extraction tree does not match validation record.'
      );
    }
  }
  if (options.bundlePath !== undefined) {
    await assertExactBundle(options.bundlePath, options, record, sha256Hex(validationBytes), true);
  }
  return { validationRecord: record, zip: parsedZip.receipt, archiveTree, extractedTree };
}

function parseVerifyCliArgs(args: readonly string[]): VerifyReleaseArtifactOptions {
  const values = new Map<string, string>();
  const allowed = new Set([
    '--zip',
    '--checksum',
    '--validation',
    '--bundle',
    '--extract-fresh',
    '--expected-sha256',
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!allowed.has(flag)) {
      throw new ReleaseArtifactVerificationError(
        'VALIDATION_RECORD_INVALID',
        `Unknown verifier argument: ${flag}`
      );
    }
    const value = args[++index];
    if (value === undefined) {
      throw new ReleaseArtifactVerificationError(
        'VALIDATION_RECORD_INVALID',
        `Missing value for ${flag}`
      );
    }
    values.set(flag, value);
  }
  const zipPath = values.get('--zip');
  const checksumPath = values.get('--checksum');
  const validationPath = values.get('--validation');
  if (zipPath === undefined || checksumPath === undefined || validationPath === undefined) {
    throw new ReleaseArtifactVerificationError(
      'VALIDATION_RECORD_INVALID',
      'Required: --zip --checksum --validation; optional: --bundle --extract-fresh --expected-sha256.'
    );
  }
  return {
    zipPath,
    checksumPath,
    validationPath,
    bundlePath: values.get('--bundle'),
    extractDirectory: values.get('--extract-fresh'),
    expectedZipSha256: values.get('--expected-sha256'),
  };
}

export async function verifyReleaseArtifactCli(
  args: readonly string[] = process.argv.slice(2)
): Promise<void> {
  const verified = await verifyReleaseArtifact(parseVerifyCliArgs(args));
  process.stdout.write(
    `${jcsCanonicalize({
      status: 'PACKAGE_VALIDATION_SUCCEEDED',
      artifactId: verified.validationRecord.artifactId,
      zipSha256: verified.zip.zipSha256,
      treeSha256: verified.archiveTree.treeSha256,
    })}\n`
  );
}

const invokedPath = process.argv[1] === undefined ? null : resolve(process.argv[1]);
if (invokedPath !== null && fileURLToPath(import.meta.url) === invokedPath) {
  verifyReleaseArtifactCli().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
