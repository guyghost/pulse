#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
  type FileHandle,
} from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  assertPinnedPythonIdentity,
  attestPinnedPythonRuntime,
  runPinnedPython,
  spawnPinnedPython,
} from './pinned-python-runtime';

import {
  canonicalReceiptsEqual,
  compareUnsignedUtf8,
  inspectCanonicalTree,
  jcsCanonicalize,
  RELEASE_DESCRIPTOR_SCANNER,
  sha256Hex,
  validateCanonicalRelativePaths,
  type CanonicalTreeReceiptV2,
  type Sha256,
} from './canonical-artifact';
import {
  assertValidTestedDistSeal,
  parseCommittedScenarioInventory,
  type ManifestAuthorityV1,
  type TestedDistSealV1,
} from './seal-tested-dist';

const execFile = promisify(execFileCallback);

const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_STORE = 0;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_VERSION_NEEDED = 20;
const ZIP_VERSION_MADE_BY = 0x031e;
const ZIP_DOS_TIME = 0x0000;
const ZIP_DOS_DATE = 0x0021;
const ZIP_EXTERNAL_ATTRIBUTES = 0x81a40000;
const ZIP_MAX_ENTRIES = 20_000;
const ZIP_MAX_BYTES = 2 * 1024 * 1024 * 1024 - 1;
const NORMALIZED_DATE = new Date('1980-01-01T00:00:00.000Z');
const SAFE_EXTRACTION_PROTOCOL = 'missionpulse.safe-extraction.v1';
const ATOMIC_RENAME_PROTOCOL = 'missionpulse.atomic-rename-no-replace.v1';

export interface CanonicalZipInputEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface CanonicalZipEntryReceiptV1 {
  readonly path: string;
  readonly utf8NameSha256: Sha256;
  readonly crc32Hex: string;
  readonly uncompressedBytes: number;
  readonly compressedBytes: number;
  readonly compressionMethod: 0;
  readonly generalPurposeBitFlag: 0x0800;
  readonly versionNeeded: 20;
  readonly versionMadeBy: 0x031e;
  readonly dosTime: 0x0000;
  readonly dosDate: 0x0021;
  readonly internalFileAttributes: 0;
  readonly externalFileAttributes: 0x81a40000;
  readonly localExtraFieldBytes: 0;
  readonly centralExtraFieldBytes: 0;
  readonly entryCommentBytes: 0;
  readonly localHeaderOffset: number;
}

export interface CanonicalZipReceiptV1 {
  readonly schema: 'missionpulse.canonical-zip';
  readonly version: 1;
  readonly zipSha256: Sha256;
  readonly zipBytes: number;
  readonly entryCount: number;
  readonly compression: 'store';
  readonly normalizedTimestamp: '1980-01-01T00:00:00.000Z';
  readonly zip64: false;
  readonly dataDescriptor: false;
  readonly archiveCommentBytes: 0;
  readonly diskNumber: 0;
  readonly centralDirectoryStartDisk: 0;
  readonly entriesOnDisk: number;
  readonly entries: readonly CanonicalZipEntryReceiptV1[];
  readonly entryInventorySha256: Sha256;
  readonly localHeaderOrderSha256: Sha256;
  readonly centralDirectoryOrderSha256: Sha256;
  readonly twinBuildSha256: Sha256;
  readonly twinReceiptSha256: Sha256;
}

export interface ChecksumSidecarReceiptV1 {
  readonly filename: 'missionpulse.zip.sha256';
  readonly bytes: 83;
  readonly sha256: Sha256;
}

export interface PackageValidationRecordV1 {
  readonly schema: 'missionpulse.package-validation';
  readonly version: 1;
  readonly artifactId: string;
  readonly releaseId: string;
  readonly sealId: string;
  readonly sealSha256: Sha256;
  readonly committedVersion: string;
  readonly releaseNamespace: string;
  readonly sourceTreeSha256: Sha256;
  readonly extractedTreeSha256: Sha256;
  readonly ownershipMarkerSha256: Sha256;
  readonly zipSha256: Sha256;
  readonly sidecarSha256: Sha256;
  readonly entryInventorySha256: Sha256;
  readonly canonicalZipReceiptSha256: Sha256;
  readonly validatedAt: string;
}

export interface ValidatedZipArtifactV1 {
  readonly schema: 'missionpulse.validated-zip-artifact';
  readonly version: 1;
  readonly artifactId: string;
  readonly releaseId: string;
  readonly sealId: string;
  readonly sealSha256: Sha256;
  readonly sourceCommit: string;
  readonly committedVersion: string;
  readonly releaseNamespace: string;
  readonly manifest: ManifestAuthorityV1;
  readonly sourceTree: CanonicalTreeReceiptV2;
  readonly snapshotTree: CanonicalTreeReceiptV2;
  readonly extractedTree: CanonicalTreeReceiptV2;
  readonly zip: CanonicalZipReceiptV1;
  readonly checksumSidecar: ChecksumSidecarReceiptV1;
  readonly bundleDirectoryPath: string;
  readonly zipPath: string;
  readonly sidecarPath: string;
  readonly validationPath: string;
  readonly validationRecord: PackageValidationRecordV1;
  readonly validationJsonSha256: Sha256;
  readonly bundleInventorySha256: Sha256;
  readonly journalId: string;
  readonly publishedAt: string;
  readonly validatedAt: string;
}

export type CanonicalZipErrorCode =
  | 'ZIP_INPUT_INVALID'
  | 'ZIP_LIMIT_EXCEEDED'
  | 'ZIP_NON_CANONICAL'
  | 'ZIP_CRC_MISMATCH'
  | 'ZIP_UNSAFE_PATH';

export class CanonicalZipError extends Error {
  readonly code: CanonicalZipErrorCode;
  readonly detail?: Readonly<Record<string, unknown>>;

  constructor(
    code: CanonicalZipErrorCode,
    message: string,
    detail?: Readonly<Record<string, unknown>>
  ) {
    super(`${code}: ${message}`);
    this.name = 'CanonicalZipError';
    this.code = code;
    this.detail = detail;
  }
}

export type PackageOnlyErrorCode =
  | 'PACKAGE_INPUT_INVALID'
  | 'PACKAGE_LOCK_HELD'
  | 'PACKAGE_LOCK_LOST'
  | 'PACKAGE_RECOVERY_REQUIRED'
  | 'PACKAGE_FOREIGN_PATH'
  | 'PACKAGE_DESTINATION_EXISTS'
  | 'SOURCE_TREE_DRIFT'
  | 'SNAPSHOT_TREE_DRIFT'
  | 'TWIN_ARCHIVE_MISMATCH'
  | 'ATOMIC_NO_REPLACE_UNAVAILABLE'
  | 'PACKAGE_BUNDLE_DRIFT'
  | 'PACKAGE_CHRONOLOGY_INVALID'
  | 'PACKAGE_VALIDATION_FAILED';

export class PackageOnlyError extends Error {
  readonly code: PackageOnlyErrorCode;
  readonly detail?: Readonly<Record<string, unknown>>;

  constructor(
    code: PackageOnlyErrorCode,
    message: string,
    detail?: Readonly<Record<string, unknown>>
  ) {
    super(`${code}: ${message}`);
    this.name = 'PackageOnlyError';
    this.code = code;
    this.detail = detail;
  }
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[value] = crc >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32be(value: number): Buffer {
  const bytes = Buffer.allocUnsafe(4);
  bytes.writeUInt32BE(value >>> 0, 0);
  return bytes;
}

function framedNameDigest(paths: readonly string[]): string {
  const framed = paths.flatMap((path) => {
    const name = Buffer.from(path, 'utf8');
    return [uint32be(name.byteLength), name];
  });
  return sha256Hex(Buffer.concat(framed));
}

function assertZipInput(entries: readonly CanonicalZipInputEntry[]): void {
  if (entries.length === 0 || entries.length > ZIP_MAX_ENTRIES || entries.length > 0xffff) {
    throw new CanonicalZipError('ZIP_LIMIT_EXCEEDED', 'ZIP requires 1..20,000 files.');
  }
  let sorted: readonly string[];
  try {
    sorted = validateCanonicalRelativePaths(entries.map(({ path }) => path));
  } catch (error) {
    throw new CanonicalZipError('ZIP_UNSAFE_PATH', 'ZIP contains an unsafe or colliding path.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (sorted.some((path, index) => path !== entries[index]?.path)) {
    throw new CanonicalZipError('ZIP_INPUT_INVALID', 'ZIP inputs must already be byte-sorted.');
  }
  let totalBytes = 0;
  for (const entry of entries) {
    const nameBytes = Buffer.byteLength(entry.path, 'utf8');
    const size = entry.bytes.byteLength;
    if (nameBytes === 0 || nameBytes > 0xffff || size > 0xffffffff) {
      throw new CanonicalZipError(
        'ZIP_LIMIT_EXCEEDED',
        `ZIP entry exceeds classic limits: ${entry.path}`
      );
    }
    totalBytes += size;
  }
  if (!Number.isSafeInteger(totalBytes) || totalBytes > ZIP_MAX_BYTES) {
    throw new CanonicalZipError('ZIP_LIMIT_EXCEEDED', 'ZIP payload exceeds package limits.');
  }
}

function makeZipReceipt(
  zipBytes: Buffer,
  entries: readonly CanonicalZipEntryReceiptV1[]
): CanonicalZipReceiptV1 {
  const zipSha256 = sha256Hex(zipBytes);
  const entryInventorySha256 = sha256Hex(jcsCanonicalize(entries));
  const orderSha256 = framedNameDigest(entries.map(({ path }) => path));
  const twinReceiptSha256 = sha256Hex(
    jcsCanonicalize({
      firstZipSha256: zipSha256,
      secondZipSha256: zipSha256,
      entryInventorySha256,
    })
  );
  return {
    schema: 'missionpulse.canonical-zip',
    version: 1,
    zipSha256,
    zipBytes: zipBytes.byteLength,
    entryCount: entries.length,
    compression: 'store',
    normalizedTimestamp: '1980-01-01T00:00:00.000Z',
    zip64: false,
    dataDescriptor: false,
    archiveCommentBytes: 0,
    diskNumber: 0,
    centralDirectoryStartDisk: 0,
    entriesOnDisk: entries.length,
    entries,
    entryInventorySha256,
    localHeaderOrderSha256: orderSha256,
    centralDirectoryOrderSha256: orderSha256,
    twinBuildSha256: zipSha256,
    twinReceiptSha256,
  };
}

export function buildCanonicalStoreZip(entriesValue: readonly CanonicalZipInputEntry[]): {
  readonly bytes: Buffer;
  readonly receipt: CanonicalZipReceiptV1;
} {
  const entries = entriesValue.map(({ path, bytes }) => ({ path, bytes: Buffer.from(bytes) }));
  assertZipInput(entries);

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  const receipts: CanonicalZipEntryReceiptV1[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf8');
    const checksum = crc32(entry.bytes);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(ZIP_LOCAL_SIGNATURE, 0);
    localHeader.writeUInt16LE(ZIP_VERSION_NEEDED, 4);
    localHeader.writeUInt16LE(ZIP_UTF8_FLAG, 6);
    localHeader.writeUInt16LE(ZIP_STORE, 8);
    localHeader.writeUInt16LE(ZIP_DOS_TIME, 10);
    localHeader.writeUInt16LE(ZIP_DOS_DATE, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(entry.bytes.byteLength, 18);
    localHeader.writeUInt32LE(entry.bytes.byteLength, 22);
    localHeader.writeUInt16LE(name.byteLength, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, entry.bytes);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(ZIP_CENTRAL_SIGNATURE, 0);
    centralHeader.writeUInt16LE(ZIP_VERSION_MADE_BY, 4);
    centralHeader.writeUInt16LE(ZIP_VERSION_NEEDED, 6);
    centralHeader.writeUInt16LE(ZIP_UTF8_FLAG, 8);
    centralHeader.writeUInt16LE(ZIP_STORE, 10);
    centralHeader.writeUInt16LE(ZIP_DOS_TIME, 12);
    centralHeader.writeUInt16LE(ZIP_DOS_DATE, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(entry.bytes.byteLength, 20);
    centralHeader.writeUInt32LE(entry.bytes.byteLength, 24);
    centralHeader.writeUInt16LE(name.byteLength, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(ZIP_EXTERNAL_ATTRIBUTES, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);

    receipts.push({
      path: entry.path,
      utf8NameSha256: sha256Hex(name),
      crc32Hex: checksum.toString(16).padStart(8, '0'),
      uncompressedBytes: entry.bytes.byteLength,
      compressedBytes: entry.bytes.byteLength,
      compressionMethod: 0,
      generalPurposeBitFlag: 0x0800,
      versionNeeded: 20,
      versionMadeBy: 0x031e,
      dosTime: 0x0000,
      dosDate: 0x0021,
      internalFileAttributes: 0,
      externalFileAttributes: 0x81a40000,
      localExtraFieldBytes: 0,
      centralExtraFieldBytes: 0,
      entryCommentBytes: 0,
      localHeaderOffset: localOffset,
    });
    localOffset += localHeader.byteLength + name.byteLength + entry.bytes.byteLength;
    if (localOffset > 0xffffffff) {
      throw new CanonicalZipError('ZIP_LIMIT_EXCEEDED', 'ZIP local offsets require ZIP64.');
    }
  }

  const localBytes = Buffer.concat(localParts);
  const centralBytes = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(ZIP_EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBytes.byteLength, 12);
  eocd.writeUInt32LE(localBytes.byteLength, 16);
  eocd.writeUInt16LE(0, 20);
  const bytes = Buffer.concat([localBytes, centralBytes, eocd]);
  if (bytes.byteLength > ZIP_MAX_BYTES || centralBytes.byteLength > 0xffffffff) {
    throw new CanonicalZipError('ZIP_LIMIT_EXCEEDED', 'ZIP requires ZIP64.');
  }
  return { bytes, receipt: makeZipReceipt(bytes, receipts) };
}

interface ParsedLocalEntry {
  readonly path: string;
  readonly bytes: Buffer;
  readonly crc32: number;
  readonly localHeaderOffset: number;
  readonly nameBytes: Buffer;
}

function readUint16(bytes: Buffer, offset: number, label: string): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) {
    throw new CanonicalZipError('ZIP_NON_CANONICAL', `Truncated ${label}.`);
  }
  return bytes.readUInt16LE(offset);
}

function readUint32(bytes: Buffer, offset: number, label: string): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    throw new CanonicalZipError('ZIP_NON_CANONICAL', `Truncated ${label}.`);
  }
  return bytes.readUInt32LE(offset);
}

function decodeUtf8Name(name: Buffer): string {
  let path: string;
  try {
    path = new TextDecoder('utf-8', { fatal: true }).decode(name);
  } catch {
    throw new CanonicalZipError('ZIP_UNSAFE_PATH', 'ZIP filename is not valid UTF-8.');
  }
  if (!Buffer.from(path, 'utf8').equals(name)) {
    throw new CanonicalZipError('ZIP_UNSAFE_PATH', 'ZIP filename does not round-trip.');
  }
  return path;
}

export function inspectCanonicalStoreZip(bytesValue: Uint8Array): {
  readonly receipt: CanonicalZipReceiptV1;
  readonly files: readonly CanonicalZipInputEntry[];
} {
  const bytes = Buffer.from(bytesValue);
  if (bytes.byteLength < 22 || bytes.byteLength > ZIP_MAX_BYTES) {
    throw new CanonicalZipError('ZIP_NON_CANONICAL', 'ZIP byte length is invalid.');
  }
  const eocdOffset = bytes.byteLength - 22;
  if (readUint32(bytes, eocdOffset, 'EOCD signature') !== ZIP_EOCD_SIGNATURE) {
    throw new CanonicalZipError('ZIP_NON_CANONICAL', 'EOCD is not at the exact end of archive.');
  }
  const diskNumber = readUint16(bytes, eocdOffset + 4, 'disk number');
  const centralStartDisk = readUint16(bytes, eocdOffset + 6, 'central start disk');
  const entriesOnDisk = readUint16(bytes, eocdOffset + 8, 'entries on disk');
  const entryCount = readUint16(bytes, eocdOffset + 10, 'entry count');
  const centralSize = readUint32(bytes, eocdOffset + 12, 'central size');
  const centralOffset = readUint32(bytes, eocdOffset + 16, 'central offset');
  const commentLength = readUint16(bytes, eocdOffset + 20, 'comment length');
  if (
    diskNumber !== 0 ||
    centralStartDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount === 0 ||
    entryCount > ZIP_MAX_ENTRIES ||
    commentLength !== 0 ||
    centralOffset + centralSize !== eocdOffset
  ) {
    throw new CanonicalZipError('ZIP_NON_CANONICAL', 'EOCD fields are noncanonical.');
  }

  const localEntries: ParsedLocalEntry[] = [];
  let cursor = 0;
  while (cursor < centralOffset) {
    const localHeaderOffset = cursor;
    if (readUint32(bytes, cursor, 'local signature') !== ZIP_LOCAL_SIGNATURE) {
      throw new CanonicalZipError(
        'ZIP_NON_CANONICAL',
        'Unexpected bytes before central directory.'
      );
    }
    const versionNeeded = readUint16(bytes, cursor + 4, 'local version');
    const flag = readUint16(bytes, cursor + 6, 'local flag');
    const method = readUint16(bytes, cursor + 8, 'local method');
    const dosTime = readUint16(bytes, cursor + 10, 'local time');
    const dosDate = readUint16(bytes, cursor + 12, 'local date');
    const expectedCrc = readUint32(bytes, cursor + 14, 'local crc');
    const compressedSize = readUint32(bytes, cursor + 18, 'local compressed size');
    const uncompressedSize = readUint32(bytes, cursor + 22, 'local uncompressed size');
    const nameLength = readUint16(bytes, cursor + 26, 'local name length');
    const extraLength = readUint16(bytes, cursor + 28, 'local extra length');
    if (
      versionNeeded !== ZIP_VERSION_NEEDED ||
      flag !== ZIP_UTF8_FLAG ||
      method !== ZIP_STORE ||
      dosTime !== ZIP_DOS_TIME ||
      dosDate !== ZIP_DOS_DATE ||
      compressedSize !== uncompressedSize ||
      nameLength === 0 ||
      extraLength !== 0
    ) {
      throw new CanonicalZipError('ZIP_NON_CANONICAL', 'Local ZIP header is noncanonical.');
    }
    const nameStart = cursor + 30;
    const dataStart = nameStart + nameLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > centralOffset) {
      throw new CanonicalZipError(
        'ZIP_NON_CANONICAL',
        'Local ZIP entry crosses central directory.'
      );
    }
    const nameBytes = bytes.subarray(nameStart, dataStart);
    const path = decodeUtf8Name(nameBytes);
    const fileBytes = Buffer.from(bytes.subarray(dataStart, dataEnd));
    if (crc32(fileBytes) !== expectedCrc) {
      throw new CanonicalZipError('ZIP_CRC_MISMATCH', `CRC mismatch for ${path}.`);
    }
    localEntries.push({ path, bytes: fileBytes, crc32: expectedCrc, localHeaderOffset, nameBytes });
    cursor = dataEnd;
  }
  if (cursor !== centralOffset || localEntries.length !== entryCount) {
    throw new CanonicalZipError('ZIP_NON_CANONICAL', 'Local entry count or offset is invalid.');
  }

  const receipts: CanonicalZipEntryReceiptV1[] = [];
  let centralCursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    const local = localEntries[index];
    if (readUint32(bytes, centralCursor, 'central signature') !== ZIP_CENTRAL_SIGNATURE) {
      throw new CanonicalZipError('ZIP_NON_CANONICAL', 'Central record signature is invalid.');
    }
    const versionMadeBy = readUint16(bytes, centralCursor + 4, 'made-by version');
    const versionNeeded = readUint16(bytes, centralCursor + 6, 'central version');
    const flag = readUint16(bytes, centralCursor + 8, 'central flag');
    const method = readUint16(bytes, centralCursor + 10, 'central method');
    const dosTime = readUint16(bytes, centralCursor + 12, 'central time');
    const dosDate = readUint16(bytes, centralCursor + 14, 'central date');
    const centralCrc = readUint32(bytes, centralCursor + 16, 'central crc');
    const compressedSize = readUint32(bytes, centralCursor + 20, 'central compressed size');
    const uncompressedSize = readUint32(bytes, centralCursor + 24, 'central uncompressed size');
    const nameLength = readUint16(bytes, centralCursor + 28, 'central name length');
    const extraLength = readUint16(bytes, centralCursor + 30, 'central extra length');
    const entryCommentLength = readUint16(bytes, centralCursor + 32, 'entry comment length');
    const startDisk = readUint16(bytes, centralCursor + 34, 'entry disk');
    const internalAttributes = readUint16(bytes, centralCursor + 36, 'internal attrs');
    const externalAttributes = readUint32(bytes, centralCursor + 38, 'external attrs');
    const localOffset = readUint32(bytes, centralCursor + 42, 'local offset');
    const nameStart = centralCursor + 46;
    const nextCentral = nameStart + nameLength + extraLength + entryCommentLength;
    if (nextCentral > eocdOffset) {
      throw new CanonicalZipError('ZIP_NON_CANONICAL', 'Central record is truncated.');
    }
    const nameBytes = bytes.subarray(nameStart, nameStart + nameLength);
    const centralPath = decodeUtf8Name(nameBytes);
    if (
      versionMadeBy !== ZIP_VERSION_MADE_BY ||
      versionNeeded !== ZIP_VERSION_NEEDED ||
      flag !== ZIP_UTF8_FLAG ||
      method !== ZIP_STORE ||
      dosTime !== ZIP_DOS_TIME ||
      dosDate !== ZIP_DOS_DATE ||
      centralCrc !== local.crc32 ||
      compressedSize !== local.bytes.byteLength ||
      uncompressedSize !== local.bytes.byteLength ||
      nameLength !== local.nameBytes.byteLength ||
      extraLength !== 0 ||
      entryCommentLength !== 0 ||
      startDisk !== 0 ||
      internalAttributes !== 0 ||
      externalAttributes !== ZIP_EXTERNAL_ATTRIBUTES ||
      localOffset !== local.localHeaderOffset ||
      centralPath !== local.path ||
      !Buffer.from(nameBytes).equals(local.nameBytes)
    ) {
      throw new CanonicalZipError(
        'ZIP_NON_CANONICAL',
        `Central metadata diverges for ${local.path}.`
      );
    }
    receipts.push({
      path: local.path,
      utf8NameSha256: sha256Hex(local.nameBytes),
      crc32Hex: local.crc32.toString(16).padStart(8, '0'),
      uncompressedBytes: local.bytes.byteLength,
      compressedBytes: local.bytes.byteLength,
      compressionMethod: 0,
      generalPurposeBitFlag: 0x0800,
      versionNeeded: 20,
      versionMadeBy: 0x031e,
      dosTime: 0x0000,
      dosDate: 0x0021,
      internalFileAttributes: 0,
      externalFileAttributes: 0x81a40000,
      localExtraFieldBytes: 0,
      centralExtraFieldBytes: 0,
      entryCommentBytes: 0,
      localHeaderOffset: local.localHeaderOffset,
    });
    centralCursor = nextCentral;
  }
  if (centralCursor !== eocdOffset || centralCursor - centralOffset !== centralSize) {
    throw new CanonicalZipError('ZIP_NON_CANONICAL', 'Central directory size is invalid.');
  }
  try {
    const paths = validateCanonicalRelativePaths(localEntries.map(({ path }) => path));
    if (paths.some((path, index) => path !== localEntries[index]?.path)) {
      throw new Error('ZIP order differs from unsigned UTF-8 order.');
    }
  } catch (error) {
    throw new CanonicalZipError('ZIP_UNSAFE_PATH', 'ZIP path inventory is unsafe.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const receipt = makeZipReceipt(bytes, receipts);
  return {
    receipt,
    files: localEntries.map(({ path, bytes: fileBytes }) => ({ path, bytes: fileBytes })),
  };
}

export function createChecksumSidecar(zipSha256: Sha256): {
  readonly bytes: Buffer;
  readonly receipt: ChecksumSidecarReceiptV1;
} {
  if (!/^[a-f0-9]{64}$/.test(zipSha256)) {
    throw new PackageOnlyError('PACKAGE_INPUT_INVALID', 'ZIP digest is not canonical SHA-256.');
  }
  const bytes = Buffer.from(`${zipSha256}  missionpulse.zip\n`, 'ascii');
  if (bytes.byteLength !== 83) {
    throw new PackageOnlyError('PACKAGE_VALIDATION_FAILED', 'Checksum sidecar length is invalid.');
  }
  return {
    bytes,
    receipt: { filename: 'missionpulse.zip.sha256', bytes: 83, sha256: sha256Hex(bytes) },
  };
}

async function readPackageInputNoFollow(path: string, maxBytes = ZIP_MAX_BYTES): Promise<Buffer> {
  let handle;
  try {
    handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  } catch (error) {
    throw new PackageOnlyError('PACKAGE_INPUT_INVALID', `Package input is unsafe: ${path}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      before.size < 0n ||
      before.size > BigInt(maxBytes)
    ) {
      throw new PackageOnlyError('PACKAGE_INPUT_INVALID', `Package input is not regular: ${path}`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      bytes.byteLength !== Number(before.size)
    ) {
      throw new PackageOnlyError('PACKAGE_INPUT_INVALID', `Package input changed: ${path}`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function fsyncDirectory(path: string): Promise<void> {
  const handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0));
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

const DESCRIPTOR_READ_PROTOCOL = 'missionpulse.descriptor-read.v1';
const DESCRIPTOR_WRITE_PROTOCOL = 'missionpulse.descriptor-write.v1';

async function readExpectedEntriesFromDescriptor(
  rootHandle: FileHandle,
  entries: readonly BundleInventoryEntry[],
  options: {
    readonly exactRootNames: boolean;
    readonly sync: boolean;
    readonly errorCode: 'SOURCE_TREE_DRIFT' | 'PACKAGE_BUNDLE_DRIFT';
  }
): Promise<CanonicalZipInputEntry[]> {
  const python = String.raw`
import hashlib, json, os, platform, stat, sys
request = json.loads(sys.stdin.buffer.read())
if request.get("protocol") != "missionpulse.descriptor-read.v1":
    raise SystemExit(64)
if platform.python_version() != "${RELEASE_DESCRIPTOR_SCANNER.pythonVersion}":
    raise SystemExit(65)
root_fd = 3
root_stat = os.fstat(root_fd)
if not stat.S_ISDIR(root_stat.st_mode):
    raise SystemExit(66)
entries = request.get("entries")
if not isinstance(entries, list):
    raise SystemExit(67)
if request.get("exactRootNames"):
    expected_names = [entry.get("path") for entry in entries]
    if any(not isinstance(name, str) or "/" in name for name in expected_names):
        raise SystemExit(68)
    observed_names = os.listdir(root_fd)
    if sorted(observed_names, key=os.fsencode) != sorted(expected_names, key=os.fsencode):
        raise SystemExit(69)
for entry in entries:
    path = entry.get("path")
    expected_bytes = entry.get("bytes")
    expected_sha256 = entry.get("sha256")
    if not isinstance(path, str) or not isinstance(expected_bytes, int) or not isinstance(expected_sha256, str):
        raise SystemExit(70)
    segments = path.split("/")
    if any(segment in ("", ".", "..") for segment in segments):
        raise SystemExit(71)
    parent_fd = os.dup(root_fd)
    try:
        for segment in segments[:-1]:
            child_fd = os.open(
                segment,
                os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0),
                dir_fd=parent_fd,
            )
            child_stat = os.fstat(child_fd)
            if not stat.S_ISDIR(child_stat.st_mode):
                os.close(child_fd)
                raise SystemExit(72)
            os.close(parent_fd)
            parent_fd = child_fd
        file_fd = os.open(
            segments[-1],
            os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0),
            dir_fd=parent_fd,
        )
        try:
            before = os.fstat(file_fd)
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size != expected_bytes:
                raise SystemExit(73)
            digest = hashlib.sha256()
            observed_bytes = 0
            while True:
                chunk = os.read(file_fd, 1024 * 1024)
                if not chunk:
                    break
                observed_bytes += len(chunk)
                digest.update(chunk)
                sys.stdout.buffer.write(chunk)
            after = os.fstat(file_fd)
            if (
                before.st_dev != after.st_dev
                or before.st_ino != after.st_ino
                or before.st_size != after.st_size
                or before.st_mtime_ns != after.st_mtime_ns
                or before.st_ctime_ns != after.st_ctime_ns
                or observed_bytes != expected_bytes
                or digest.hexdigest() != expected_sha256
            ):
                raise SystemExit(74)
            if request.get("sync"):
                os.fsync(file_fd)
        finally:
            os.close(file_fd)
    finally:
        os.close(parent_fd)
if request.get("sync"):
    os.fsync(root_fd)
`;
  const requestBytes = Buffer.from(
    jcsCanonicalize({
      protocol: DESCRIPTOR_READ_PROTOCOL,
      exactRootNames: options.exactRootNames,
      sync: options.sync,
      entries,
    })
  );
  const expectedBytes = entries.reduce((total, entry) => total + entry.bytes, 0);
  let pinnedPython;
  try {
    pinnedPython = await attestPinnedPythonRuntime(
      process.env.PULSE_RELEASE_PYTHON ?? 'python3',
      RELEASE_DESCRIPTOR_SCANNER.pythonVersion
    );
  } catch (error) {
    throw new PackageOnlyError(options.errorCode, 'Descriptor reader runtime is unsafe.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    const child = await spawnPinnedPython(pinnedPython, ['-c', python, DESCRIPTOR_READ_PROTOCOL], {
      stdio: ['pipe', 'pipe', 'pipe', rootHandle.fd],
    });
    if (child.stdin === null || child.stdout === null || child.stderr === null) {
      child.kill('SIGKILL');
      throw new PackageOnlyError(options.errorCode, 'Descriptor reader streams unavailable.');
    }
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let overflow = false;
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > expectedBytes) {
        overflow = true;
        child.kill('SIGKILL');
      } else {
        stdout.push(chunk);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > 16 * 1024) {
        overflow = true;
        child.kill('SIGKILL');
      } else {
        stderr.push(chunk);
      }
    });
    child.stdin.end(requestBytes);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 120_000);
    const closed = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolveClose, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => resolveClose({ code, signal }));
      }
    ).finally(() => clearTimeout(timeout));
    await assertPinnedPythonIdentity(pinnedPython);
    if (
      closed.code !== 0 ||
      closed.signal !== null ||
      timedOut ||
      overflow ||
      stderrBytes !== 0 ||
      stdoutBytes !== expectedBytes
    ) {
      throw new PackageOnlyError(options.errorCode, 'Descriptor reader failed closed.', {
        exitCode: closed.code,
        signal: closed.signal,
        timedOut,
        overflow,
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    }
    const payload = Buffer.concat(stdout);
    let offset = 0;
    return entries.map((entry) => {
      const bytes = payload.subarray(offset, offset + entry.bytes);
      offset += entry.bytes;
      if (bytes.byteLength !== entry.bytes || sha256Hex(bytes) !== entry.sha256) {
        throw new PackageOnlyError(options.errorCode, `Descriptor bytes drifted: ${entry.path}`);
      }
      return { path: entry.path, bytes: Buffer.from(bytes) };
    });
  } catch (error) {
    if (error instanceof PackageOnlyError) {
      throw error;
    }
    throw new PackageOnlyError(options.errorCode, 'Descriptor reader execution failed.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await pinnedPython.handle.close();
  }
}

async function writeFileToDescriptor(
  rootHandle: FileHandle,
  name: string,
  bytes: Uint8Array,
  errorCode: 'SNAPSHOT_TREE_DRIFT' | 'TWIN_ARCHIVE_MISMATCH' | 'PACKAGE_BUNDLE_DRIFT'
): Promise<void> {
  if (!/^[A-Za-z0-9.][A-Za-z0-9._-]{0,254}$/.test(name) || name === '.' || name === '..') {
    throw new PackageOnlyError(errorCode, `Descriptor target name is unsafe: ${name}`);
  }
  const python = String.raw`
import hashlib, os, platform, stat, sys
if sys.argv[1] != "${DESCRIPTOR_WRITE_PROTOCOL}":
    raise SystemExit(64)
if platform.python_version() != "${RELEASE_DESCRIPTOR_SCANNER.pythonVersion}":
    raise SystemExit(65)
root_fd = 3
name = sys.argv[2]
expected_sha256 = sys.argv[3]
expected_bytes = int(sys.argv[4])
if not name or "/" in name or "\\" in name or name in (".", ".."):
    raise SystemExit(66)
target_fd = os.open(
    name,
    os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0),
    0o644,
    dir_fd=root_fd,
)
try:
    digest = hashlib.sha256()
    observed_bytes = 0
    while True:
        chunk = sys.stdin.buffer.read(1024 * 1024)
        if not chunk:
            break
        digest.update(chunk)
        observed_bytes += len(chunk)
        view = memoryview(chunk)
        while view:
            written = os.write(target_fd, view)
            if written <= 0:
                raise SystemExit(68)
            view = view[written:]
    if observed_bytes != expected_bytes or digest.hexdigest() != expected_sha256:
        raise SystemExit(67)
    os.fchmod(target_fd, 0o644)
    os.fsync(target_fd)
    observed = os.fstat(target_fd)
    if not stat.S_ISREG(observed.st_mode) or observed.st_nlink != 1 or observed.st_size != expected_bytes:
        raise SystemExit(69)
finally:
    os.close(target_fd)
os.fsync(root_fd)
`;
  let pinnedPython;
  try {
    pinnedPython = await attestPinnedPythonRuntime(
      process.env.PULSE_RELEASE_PYTHON ?? 'python3',
      RELEASE_DESCRIPTOR_SCANNER.pythonVersion
    );
  } catch (error) {
    throw new PackageOnlyError(errorCode, 'Descriptor writer runtime is unsafe.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    const child = await spawnPinnedPython(
      pinnedPython,
      ['-c', python, DESCRIPTOR_WRITE_PROTOCOL, name, sha256Hex(bytes), String(bytes.byteLength)],
      { stdio: ['pipe', 'pipe', 'pipe', rootHandle.fd] }
    );
    if (child.stdin === null || child.stdout === null || child.stderr === null) {
      child.kill('SIGKILL');
      throw new PackageOnlyError(errorCode, 'Descriptor writer streams unavailable.');
    }
    const stderr: Buffer[] = [];
    let stderrBytes = 0;
    let unexpectedStdout = false;
    child.stdout.on('data', () => {
      unexpectedStdout = true;
      child.kill('SIGKILL');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > 16 * 1024) {
        child.kill('SIGKILL');
      } else {
        stderr.push(chunk);
      }
    });
    child.stdin.end(Buffer.from(bytes));
    const closed = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolveClose, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => resolveClose({ code, signal }));
      }
    );
    await assertPinnedPythonIdentity(pinnedPython);
    if (closed.code !== 0 || closed.signal !== null || unexpectedStdout || stderrBytes !== 0) {
      throw new PackageOnlyError(errorCode, `Descriptor writer failed for ${name}.`, {
        exitCode: closed.code,
        signal: closed.signal,
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    }
  } catch (error) {
    if (error instanceof PackageOnlyError) {
      throw error;
    }
    throw new PackageOnlyError(errorCode, `Descriptor writer failed for ${name}.`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await pinnedPython.handle.close();
  }
}

async function readTreeBytesNoFollow(
  root: string,
  tree: CanonicalTreeReceiptV2
): Promise<CanonicalZipInputEntry[]> {
  const rootHandle = await openDirectoryNoFollow(root);
  try {
    const result = await readExpectedEntriesFromDescriptor(rootHandle, tree.entries, {
      exactRootNames: false,
      sync: false,
      errorCode: 'SOURCE_TREE_DRIFT',
    });
    await assertDirectoryPathIdentity(rootHandle, root);
    return result;
  } finally {
    await rootHandle.close();
  }
}

async function ensureDirectories(root: string, path: string): Promise<void> {
  let current = root;
  const segments = path.split('/').slice(0, -1);
  for (const segment of segments) {
    current = join(current, segment);
    try {
      await mkdir(current, { mode: 0o755 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
    const stats = await lstat(current);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new CanonicalZipError('ZIP_UNSAFE_PATH', `Extraction parent is unsafe: ${path}`);
    }
  }
}

export interface CanonicalExtractionHooks {
  readonly beforeFileCreate?: (value: { readonly path: string }) => void | Promise<void>;
}

async function extractWithPinnedDescriptorHelper(
  bytes: Uint8Array,
  root: string,
  rootHandle: FileHandle
): Promise<void> {
  const python = String.raw`
import io, json, os, platform, stat, sys, zipfile
protocol = sys.argv[1]
if protocol != "missionpulse.safe-extraction.v1":
    raise SystemExit(64)
if platform.python_version() != "${RELEASE_DESCRIPTOR_SCANNER.pythonVersion}":
    raise SystemExit(65)
root_fd = 3
root_stat = os.fstat(root_fd)
if not stat.S_ISDIR(root_stat.st_mode):
    raise SystemExit(66)
archive = sys.stdin.buffer.read()
with zipfile.ZipFile(io.BytesIO(archive), "r") as source:
    for info in source.infolist():
        path = info.filename
        if not path or path.startswith("/") or path.endswith("/") or "\\" in path or "\x00" in path:
            raise SystemExit(67)
        segments = path.split("/")
        if any(segment in ("", ".", "..") for segment in segments):
            raise SystemExit(67)
        parent_fd = os.dup(root_fd)
        try:
            for segment in segments[:-1]:
                try:
                    os.mkdir(segment, 0o755, dir_fd=parent_fd)
                except FileExistsError:
                    pass
                child_fd = os.open(
                    segment,
                    os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0),
                    dir_fd=parent_fd,
                )
                child_stat = os.fstat(child_fd)
                if not stat.S_ISDIR(child_stat.st_mode):
                    os.close(child_fd)
                    raise SystemExit(68)
                os.close(parent_fd)
                parent_fd = child_fd
            target_fd = os.open(
                segments[-1],
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0),
                0o644,
                dir_fd=parent_fd,
            )
            try:
                with source.open(info, "r") as payload:
                    while True:
                        chunk = payload.read(1024 * 1024)
                        if not chunk:
                            break
                        view = memoryview(chunk)
                        while view:
                            written = os.write(target_fd, view)
                            if written <= 0:
                                raise SystemExit(69)
                            view = view[written:]
                os.fchmod(target_fd, 0o644)
                os.utime(target_fd, (315532800, 315532800))
                os.fsync(target_fd)
            finally:
                os.close(target_fd)
            os.fsync(parent_fd)
        finally:
            os.close(parent_fd)
os.fsync(root_fd)
sys.stdout.write(json.dumps({"protocol": protocol, "status": "ok"}, separators=(",", ":"), sort_keys=True))
`;
  let pinnedPython;
  try {
    pinnedPython = await attestPinnedPythonRuntime(
      process.env.PULSE_RELEASE_PYTHON ?? 'python3',
      RELEASE_DESCRIPTOR_SCANNER.pythonVersion
    );
  } catch (error) {
    throw new CanonicalZipError(
      'ZIP_UNSAFE_PATH',
      'Safe extraction Python runtime is not an attested native binary.',
      { cause: error instanceof Error ? error.message : String(error) }
    );
  }
  try {
    const child = await spawnPinnedPython(pinnedPython, ['-c', python, SAFE_EXTRACTION_PROTOCOL], {
      stdio: ['pipe', 'pipe', 'pipe', rootHandle.fd],
    });
    if (child.stdin === null || child.stdout === null || child.stderr === null) {
      child.kill('SIGKILL');
      throw new CanonicalZipError('ZIP_UNSAFE_PATH', 'Safe extraction helper streams unavailable.');
    }
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let overflow = false;
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > 4096) {
        overflow = true;
        child.kill('SIGKILL');
      } else {
        stdout.push(chunk);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > 16 * 1024) {
        overflow = true;
        child.kill('SIGKILL');
      } else {
        stderr.push(chunk);
      }
    });
    let inputError: Error | null = null;
    child.stdin.on('error', (error) => {
      inputError = error;
    });
    child.stdin.end(Buffer.from(bytes));
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 120_000);
    let closed: { code: number | null; signal: NodeJS.Signals | null };
    try {
      closed = await new Promise((resolveClose, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => resolveClose({ code, signal }));
      });
    } catch (error) {
      throw new CanonicalZipError('ZIP_UNSAFE_PATH', 'Safe extraction helper failed to start.', {
        cause: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeout);
    }
    const expectedOutput = jcsCanonicalize({ protocol: SAFE_EXTRACTION_PROTOCOL, status: 'ok' });
    if (
      closed.code !== 0 ||
      closed.signal !== null ||
      timedOut ||
      overflow ||
      inputError !== null ||
      Buffer.concat(stdout).toString('utf8') !== expectedOutput ||
      stderrBytes !== 0
    ) {
      throw new CanonicalZipError(
        'ZIP_UNSAFE_PATH',
        'Descriptor-anchored extraction failed closed.',
        {
          exitCode: closed.code,
          signal: closed.signal,
          timedOut,
          overflow,
          stderr: Buffer.concat(stderr).toString('utf8'),
        }
      );
    }
    await assertPinnedPythonIdentity(pinnedPython);
    await assertDirectoryPathIdentity(rootHandle, root);
  } finally {
    await pinnedPython.handle.close();
  }
}

async function openDirectoryNoFollow(path: string): Promise<FileHandle> {
  try {
    const handle = await open(
      path,
      fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0)
    );
    const stats = await handle.stat({ bigint: true });
    if (!stats.isDirectory()) {
      await handle.close();
      throw new Error('not a directory');
    }
    return handle;
  } catch (error) {
    throw new CanonicalZipError('ZIP_UNSAFE_PATH', `Directory admission failed: ${path}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

async function assertDirectoryPathIdentity(handle: FileHandle, path: string): Promise<void> {
  const admitted = await handle.stat({ bigint: true });
  let reopened: FileHandle;
  try {
    reopened = await open(
      path,
      fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0)
    );
  } catch {
    throw new CanonicalZipError('ZIP_UNSAFE_PATH', `Directory pathname changed: ${path}`);
  }
  try {
    const observed = await reopened.stat({ bigint: true });
    if (admitted.dev !== observed.dev || admitted.ino !== observed.ino) {
      throw new CanonicalZipError('ZIP_UNSAFE_PATH', `Directory identity changed: ${path}`);
    }
  } finally {
    await reopened.close();
  }
}

export async function extractCanonicalStoreZip(
  bytes: Uint8Array,
  destination: string,
  hooks: CanonicalExtractionHooks = {}
): Promise<CanonicalTreeReceiptV2> {
  const parsed = inspectCanonicalStoreZip(bytes);
  const root = resolve(destination);
  await mkdir(root, { mode: 0o755 });
  const rootHandle = await openDirectoryNoFollow(root);
  if (hooks.beforeFileCreate === undefined) {
    try {
      await extractWithPinnedDescriptorHelper(bytes, root, rootHandle);
    } finally {
      await rootHandle.close();
    }
    return inspectCanonicalTree(root);
  }
  try {
    for (const file of parsed.files) {
      await ensureDirectories(root, file.path);
      const target = join(root, ...file.path.split('/'));
      const relativeTarget = relative(root, target).split(sep).join('/');
      if (relativeTarget !== file.path) {
        throw new CanonicalZipError('ZIP_UNSAFE_PATH', `Extraction escaped root: ${file.path}`);
      }
      const parentPath = dirname(target);
      const parentHandle = await openDirectoryNoFollow(parentPath);
      try {
        await hooks.beforeFileCreate?.({ path: file.path });
        await assertDirectoryPathIdentity(parentHandle, parentPath);
        await assertDirectoryPathIdentity(rootHandle, root);
        const handle = await open(
          target,
          fsConstants.O_WRONLY |
            fsConstants.O_CREAT |
            fsConstants.O_EXCL |
            (fsConstants.O_NOFOLLOW ?? 0),
          0o644
        );
        try {
          await handle.writeFile(file.bytes);
          await handle.chmod(0o644);
          await handle.utimes(NORMALIZED_DATE, NORMALIZED_DATE);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await assertDirectoryPathIdentity(parentHandle, parentPath);
      } finally {
        await parentHandle.close();
      }
    }
    await rootHandle.sync();
    await assertDirectoryPathIdentity(rootHandle, root);
  } finally {
    await rootHandle.close();
  }
  return inspectCanonicalTree(root);
}

interface PackageJournalEntryV1 {
  readonly phase:
    | 'reserved'
    | 'staging_created'
    | 'snapshot_verified'
    | 'archive_built'
    | 'archive_verified'
    | 'bundle_renamed'
    | 'published';
  readonly at: string;
  readonly renameIntentAt: string | null;
  readonly ownedDirectoryIdentitySha256: string | null;
  readonly ownershipMarkerSha256: string | null;
  readonly treeSha256: string | null;
  readonly archiveSha256: string | null;
  readonly bundleInventorySha256: string | null;
}

interface PackageJournalV1 {
  readonly schema: 'missionpulse.package-journal';
  readonly version: 1;
  readonly journalId: string;
  readonly releaseId: string;
  readonly sealId: string;
  readonly artifactId: string;
  readonly releaseNamespace: string;
  readonly ownershipTokenSha256: string;
  readonly stagingBundlePath: string;
  readonly finalBundlePath: string;
  readonly ownershipMarkerRelativePath: '.missionpulse-owner.json';
  readonly workRelativePath: '.missionpulse-work';
  readonly zipRelativePath: 'missionpulse.zip';
  readonly sidecarRelativePath: 'missionpulse.zip.sha256';
  readonly validationRelativePath: 'validation.json';
  readonly verifiedZipReceipt: CanonicalZipReceiptV1 | null;
  readonly history: readonly PackageJournalEntryV1[];
}

export interface PackageSealedDistOptions {
  readonly seal: TestedDistSealV1;
  readonly distPath: string;
  readonly releasesPath: string;
  readonly artifactId: string;
  readonly journalId: string;
  readonly ownershipToken?: string;
  readonly now?: () => string;
  readonly probeAtomicRenameNoReplace?: () => Promise<void>;
  readonly atomicRenameNoReplace?: (source: string, destination: string) => Promise<void>;
  readonly afterReservedJournalDurable?: (value: {
    readonly releasesPath: string;
    readonly stagingPath: string;
    readonly journalPath: string;
  }) => Promise<void>;
  readonly afterStagingCreated?: (value: { readonly stagingPath: string }) => Promise<void>;
  readonly onTwinArchivePersisted?: (value: {
    readonly label: 'zip-a' | 'zip-b';
    readonly path: string;
    readonly sha256: string;
  }) => Promise<void>;
  readonly beforePublication?: (value: {
    readonly markerPath: string;
    readonly zipPath: string;
    readonly sidecarPath: string;
    readonly validationPath: string;
  }) => Promise<void>;
  readonly afterPublicationIdentityVerified?: (value: {
    readonly stagingPath: string;
  }) => Promise<void>;
}

function canonicalNow(now: () => string): string {
  const value = now();
  const epoch = Date.parse(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isSafeInteger(epoch) ||
    epoch < 946_684_800_000 ||
    epoch > 253_402_300_799_999 ||
    new Date(epoch).toISOString() !== value
  ) {
    throw new PackageOnlyError('PACKAGE_INPUT_INVALID', `Noncanonical timestamp: ${value}`);
  }
  return value;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function appendJournal(handle: FileHandle, journal: PackageJournalV1): Promise<void> {
  const line = `${jcsCanonicalize(journal)}\n`;
  await handle.writeFile(line);
  await handle.sync();
}

async function openJournal(path: string): Promise<FileHandle> {
  return open(
    path,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_APPEND,
    0o600
  );
}

async function directoryIdentitySha256(path: string): Promise<string> {
  const handle = await open(
    path,
    fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0)
  );
  try {
    const stats = await handle.stat({ bigint: true });
    if (!stats.isDirectory()) {
      throw new PackageOnlyError('PACKAGE_FOREIGN_PATH', 'Owned staging path is not a directory.');
    }
    return sha256Hex(
      jcsCanonicalize({
        deviceDecimal: stats.dev.toString(10),
        inodeDecimal: stats.ino.toString(10),
        kind: 'directory',
      })
    );
  } finally {
    await handle.close();
  }
}

async function nativeAtomicRenameNoReplace(source: string, destination: string): Promise<void> {
  const python = String.raw`
import ctypes, errno, os, platform, sys
if sys.argv[1] != "missionpulse.atomic-rename-no-replace.v1":
    raise SystemExit(64)
if platform.python_version() != "${RELEASE_DESCRIPTOR_SCANNER.pythonVersion}":
    raise SystemExit(65)
source = os.fsencode(sys.argv[2])
destination = os.fsencode(sys.argv[3])
libc = ctypes.CDLL(None, use_errno=True)
if sys.platform.startswith("linux"):
    fn = getattr(libc, "renameat2", None)
    if fn is None:
        raise SystemExit(70)
    result = fn(-100, source, -100, destination, 1)
elif sys.platform == "darwin":
    fn = getattr(libc, "renamex_np", None)
    if fn is None:
        raise SystemExit(70)
    result = fn(source, destination, 4)
else:
    raise SystemExit(70)
if result != 0:
    value = ctypes.get_errno()
    if value == errno.EEXIST:
        raise SystemExit(17)
    raise OSError(value, os.strerror(value))
`;
  try {
    await runPinnedPython(
      process.env.PULSE_RELEASE_PYTHON ?? 'python3',
      RELEASE_DESCRIPTOR_SCANNER.pythonVersion,
      ['-c', python, ATOMIC_RENAME_PROTOCOL, source, destination],
      { timeout: 10_000, maxBuffer: 16 * 1024 }
    );
  } catch (error) {
    const exitCode = (error as { code?: unknown }).code;
    if (exitCode === 17) {
      throw new PackageOnlyError(
        'PACKAGE_DESTINATION_EXISTS',
        'Release namespace was occupied at atomic publication.'
      );
    }
    throw new PackageOnlyError(
      'ATOMIC_NO_REPLACE_UNAVAILABLE',
      'Atomic no-replace directory rename is unavailable.',
      { cause: error instanceof Error ? error.message : String(error) }
    );
  }
}

async function nativeAtomicRenameNoReplaceAt(
  parentHandle: FileHandle,
  sourceName: string,
  destinationName: string,
  expectedSource: { readonly device: bigint; readonly inode: bigint }
): Promise<void> {
  const python = String.raw`
import ctypes, errno, os, platform, stat, sys
if sys.argv[1] != "missionpulse.atomic-rename-no-replace.v1":
    raise SystemExit(64)
if platform.python_version() != "${RELEASE_DESCRIPTOR_SCANNER.pythonVersion}":
    raise SystemExit(65)
parent_fd = 3
source = os.fsencode(sys.argv[2])
destination = os.fsencode(sys.argv[3])
expected_device = int(sys.argv[4])
expected_inode = int(sys.argv[5])
observed = os.stat(source, dir_fd=parent_fd, follow_symlinks=False)
if not stat.S_ISDIR(observed.st_mode) or observed.st_dev != expected_device or observed.st_ino != expected_inode:
    raise SystemExit(72)
libc = ctypes.CDLL(None, use_errno=True)
if sys.platform.startswith("linux"):
    fn = getattr(libc, "renameat2", None)
    if fn is None:
        raise SystemExit(70)
    result = fn(parent_fd, source, parent_fd, destination, 1)
elif sys.platform == "darwin":
    fn = getattr(libc, "renameatx_np", None)
    if fn is None:
        raise SystemExit(70)
    result = fn(parent_fd, source, parent_fd, destination, 4)
else:
    raise SystemExit(70)
if result != 0:
    value = ctypes.get_errno()
    if value == errno.EEXIST:
        raise SystemExit(17)
    raise OSError(value, os.strerror(value))
os.fsync(parent_fd)
`;
  let pinnedPython;
  try {
    pinnedPython = await attestPinnedPythonRuntime(
      process.env.PULSE_RELEASE_PYTHON ?? 'python3',
      RELEASE_DESCRIPTOR_SCANNER.pythonVersion
    );
  } catch (error) {
    throw new PackageOnlyError(
      'ATOMIC_NO_REPLACE_UNAVAILABLE',
      'Descriptor-relative rename runtime is unsafe.',
      { cause: error instanceof Error ? error.message : String(error) }
    );
  }
  try {
    const child = await spawnPinnedPython(
      pinnedPython,
      [
        '-c',
        python,
        ATOMIC_RENAME_PROTOCOL,
        sourceName,
        destinationName,
        expectedSource.device.toString(10),
        expectedSource.inode.toString(10),
      ],
      { stdio: ['ignore', 'pipe', 'pipe', parentHandle.fd] }
    );
    if (child.stdout === null || child.stderr === null) {
      child.kill('SIGKILL');
      throw new PackageOnlyError(
        'ATOMIC_NO_REPLACE_UNAVAILABLE',
        'Descriptor-relative rename streams unavailable.'
      );
    }
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let overflow = false;
    let outputBytes = 0;
    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > 16 * 1024) {
        overflow = true;
        child.kill('SIGKILL');
      } else {
        target.push(chunk);
      }
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    const closed = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolveClose, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => resolveClose({ code, signal }));
      }
    );
    await assertPinnedPythonIdentity(pinnedPython);
    if (closed.code === 17) {
      throw new PackageOnlyError(
        'PACKAGE_DESTINATION_EXISTS',
        'Release namespace was occupied at atomic publication.'
      );
    }
    if (closed.code === 72) {
      throw new PackageOnlyError(
        'PACKAGE_FOREIGN_PATH',
        'Staging basename no longer identifies the held directory descriptor.'
      );
    }
    if (
      closed.code !== 0 ||
      closed.signal !== null ||
      overflow ||
      Buffer.concat(stdout).byteLength !== 0 ||
      Buffer.concat(stderr).byteLength !== 0
    ) {
      throw new PackageOnlyError(
        'ATOMIC_NO_REPLACE_UNAVAILABLE',
        'Descriptor-relative atomic no-replace rename failed.',
        {
          exitCode: closed.code,
          signal: closed.signal,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        }
      );
    }
  } catch (error) {
    if (error instanceof PackageOnlyError) {
      throw error;
    }
    throw new PackageOnlyError(
      'ATOMIC_NO_REPLACE_UNAVAILABLE',
      'Descriptor-relative atomic no-replace rename could not start.',
      { cause: error instanceof Error ? error.message : String(error) }
    );
  } finally {
    await pinnedPython.handle.close();
  }
}

async function probeNativeAtomicRenameNoReplace(releasesPath: string): Promise<void> {
  const parent = dirname(releasesPath);
  const probeRoot = await mkdtemp(join(parent, '.missionpulse-rename-probe-'));
  const source = join(probeRoot, 'source');
  const destination = join(probeRoot, 'destination');
  try {
    await mkdir(source, { mode: 0o755 });
    await mkdir(destination, { mode: 0o755 });
    await writeFile(join(source, 'source.txt'), 'source', { flag: 'wx', mode: 0o600 });
    await writeFile(join(destination, 'destination.txt'), 'destination', {
      flag: 'wx',
      mode: 0o600,
    });
    let refused = false;
    try {
      await nativeAtomicRenameNoReplace(source, destination);
    } catch (error) {
      if (error instanceof PackageOnlyError && error.code === 'PACKAGE_DESTINATION_EXISTS') {
        refused = true;
      } else {
        throw error;
      }
    }
    if (!refused) {
      throw new PackageOnlyError(
        'ATOMIC_NO_REPLACE_UNAVAILABLE',
        'Atomic no-replace probe replaced a pre-existing destination.'
      );
    }
    if (
      (await readFile(join(source, 'source.txt'), 'utf8')) !== 'source' ||
      (await readFile(join(destination, 'destination.txt'), 'utf8')) !== 'destination'
    ) {
      throw new PackageOnlyError(
        'ATOMIC_NO_REPLACE_UNAVAILABLE',
        'Atomic no-replace probe did not preserve both directory identities.'
      );
    }
  } finally {
    await rm(probeRoot, { force: true, recursive: true });
  }
}

async function copySnapshot(
  sourceRoot: string,
  snapshotRoot: string,
  tree: CanonicalTreeReceiptV2
): Promise<CanonicalTreeReceiptV2> {
  const sourceFiles = await readTreeBytesNoFollow(sourceRoot, tree);
  const receipt = await extractCanonicalStoreZip(
    buildCanonicalStoreZip(sourceFiles).bytes,
    snapshotRoot
  );
  if (!canonicalReceiptsEqual(receipt, tree)) {
    throw new PackageOnlyError('SNAPSHOT_TREE_DRIFT', 'Snapshot differs from sealed source tree.');
  }
  return receipt;
}

interface BundleInventoryEntry {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

async function assertExactBundle(
  handle: FileHandle,
  expectedInventory: readonly BundleInventoryEntry[]
): Promise<void> {
  await readExpectedEntriesFromDescriptor(handle, expectedInventory, {
    exactRootNames: true,
    sync: true,
    errorCode: 'PACKAGE_BUNDLE_DRIFT',
  });
}

export async function packageSealedDist(
  options: PackageSealedDistOptions
): Promise<ValidatedZipArtifactV1> {
  assertValidTestedDistSeal(options.seal);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(options.artifactId)) {
    throw new PackageOnlyError('PACKAGE_INPUT_INVALID', 'artifactId is not canonical.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(options.journalId)) {
    throw new PackageOnlyError('PACKAGE_INPUT_INVALID', 'journalId is not canonical.');
  }
  const now = options.now ?? (() => new Date().toISOString());
  const distPath = resolve(options.distPath);
  const releasesPath = resolve(options.releasesPath);
  const releaseNamespace = `v${options.seal.committedVersion}`;
  const stagingPath = join(releasesPath, `.${releaseNamespace}.${options.artifactId}.staging`);
  const finalPath = join(releasesPath, releaseNamespace);
  const journalPath = join(releasesPath, `.${releaseNamespace}.${options.journalId}.journal.jsonl`);
  const lockPath = join(releasesPath, '.package.lock');
  const sealedAtMs = Date.parse(options.seal.sealedAt);
  let lastProtocolTimestampMs: number | null = null;
  const sampleProtocolTimestamp = (): string => {
    const value = canonicalNow(now);
    const epoch = Date.parse(value);
    if (
      epoch < sealedAtMs ||
      (lastProtocolTimestampMs !== null && epoch <= lastProtocolTimestampMs)
    ) {
      throw new PackageOnlyError(
        'PACKAGE_CHRONOLOGY_INVALID',
        'Package protocol timestamps must be strictly ordered after the seal.'
      );
    }
    lastProtocolTimestampMs = epoch;
    return value;
  };
  const reservedAt = sampleProtocolTimestamp();
  try {
    await (
      options.probeAtomicRenameNoReplace ?? (() => probeNativeAtomicRenameNoReplace(releasesPath))
    )();
  } catch (error) {
    if (error instanceof PackageOnlyError) {
      throw error;
    }
    throw new PackageOnlyError(
      'ATOMIC_NO_REPLACE_UNAVAILABLE',
      'Atomic no-replace capability probe failed before release mutation.',
      { cause: error instanceof Error ? error.message : String(error) }
    );
  }
  await mkdir(releasesPath, { recursive: true, mode: 0o755 });
  for (const path of [stagingPath, finalPath, journalPath]) {
    if (await pathExists(path)) {
      throw new PackageOnlyError(
        path === journalPath ? 'PACKAGE_RECOVERY_REQUIRED' : 'PACKAGE_FOREIGN_PATH',
        `Package path already exists and will not be adopted: ${path}`
      );
    }
  }
  const namespaceResidue = (await readdir(releasesPath)).filter(
    (name) =>
      name.startsWith(`.${releaseNamespace}.`) &&
      (name.endsWith('.staging') || name.endsWith('.journal.jsonl'))
  );
  if (namespaceResidue.length > 0) {
    throw new PackageOnlyError(
      'PACKAGE_RECOVERY_REQUIRED',
      `Owned or foreign crash residue requires a correlated observation: ${namespaceResidue
        .sort(compareUnsignedUtf8)
        .join(', ')}`
    );
  }

  let lockHandle;
  try {
    lockHandle = await open(
      lockPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
      0o600
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new PackageOnlyError('PACKAGE_LOCK_HELD', 'Another package runner owns the lock.');
    }
    throw error;
  }
  const lockIdentity = await lockHandle.stat({ bigint: true });
  await lockHandle.writeFile(
    jcsCanonicalize({ journalId: options.journalId, releaseId: options.seal.releaseId })
  );
  await lockHandle.sync();

  let artifact: ValidatedZipArtifactV1 | undefined;
  let operationError: unknown;
  let journalHandle: FileHandle | undefined;
  let stagingHandle: FileHandle | undefined;
  try {
    const sourceBefore = await inspectCanonicalTree(distPath);
    if (!canonicalReceiptsEqual(sourceBefore, options.seal.testedTree)) {
      throw new PackageOnlyError('SOURCE_TREE_DRIFT', 'dist no longer matches its tested seal.');
    }
    const history: PackageJournalEntryV1[] = [];
    const ownershipTokenSha256 = sha256Hex(
      options.ownershipToken ?? randomBytes(32).toString('base64url')
    );
    let ownedDirectoryIdentitySha256: string | null = null;
    let ownershipMarkerSha256: string | null = null;
    let verifiedZipReceipt: CanonicalZipReceiptV1 | null = null;
    const journalBase = {
      schema: 'missionpulse.package-journal' as const,
      version: 1 as const,
      journalId: options.journalId,
      releaseId: options.seal.releaseId,
      sealId: options.seal.sealId,
      artifactId: options.artifactId,
      releaseNamespace,
      ownershipTokenSha256,
      stagingBundlePath: stagingPath,
      finalBundlePath: finalPath,
      ownershipMarkerRelativePath: '.missionpulse-owner.json' as const,
      workRelativePath: '.missionpulse-work' as const,
      zipRelativePath: 'missionpulse.zip' as const,
      sidecarRelativePath: 'missionpulse.zip.sha256' as const,
      validationRelativePath: 'validation.json' as const,
    };
    const currentJournal = (): PackageJournalV1 => ({
      ...journalBase,
      verifiedZipReceipt,
      history: [...history],
    });
    const recordPhase = async (
      phase: PackageJournalEntryV1['phase'],
      values: Omit<
        PackageJournalEntryV1,
        'phase' | 'at' | 'ownedDirectoryIdentitySha256' | 'ownershipMarkerSha256'
      >,
      at = sampleProtocolTimestamp()
    ): Promise<string> => {
      history.push({
        phase,
        at,
        ownedDirectoryIdentitySha256,
        ownershipMarkerSha256,
        ...values,
      });
      if (journalHandle === undefined) {
        journalHandle = await openJournal(journalPath);
      }
      await appendJournal(journalHandle, currentJournal());
      return at;
    };
    await recordPhase(
      'reserved',
      { renameIntentAt: null, treeSha256: null, archiveSha256: null, bundleInventorySha256: null },
      reservedAt
    );
    await fsyncDirectory(releasesPath);
    await options.afterReservedJournalDurable?.({ releasesPath, stagingPath, journalPath });

    await mkdir(stagingPath, { mode: 0o755 });
    stagingHandle = await openDirectoryNoFollow(stagingPath);
    const marker = {
      schema: 'missionpulse.package-owner',
      version: 1,
      journalId: options.journalId,
      releaseId: options.seal.releaseId,
      sealId: options.seal.sealId,
      artifactId: options.artifactId,
      releaseNamespace,
      ownershipTokenSha256,
    };
    const markerBytes = Buffer.from(jcsCanonicalize(marker));
    const markerPath = join(stagingPath, '.missionpulse-owner.json');
    await writeFileToDescriptor(
      stagingHandle,
      '.missionpulse-owner.json',
      markerBytes,
      'PACKAGE_BUNDLE_DRIFT'
    );
    ownedDirectoryIdentitySha256 = await directoryIdentitySha256(stagingPath);
    ownershipMarkerSha256 = sha256Hex(markerBytes);
    await recordPhase('staging_created', {
      renameIntentAt: null,
      treeSha256: null,
      archiveSha256: null,
      bundleInventorySha256: null,
    });
    await options.afterStagingCreated?.({ stagingPath });
    try {
      await assertDirectoryPathIdentity(stagingHandle, stagingPath);
    } catch (error) {
      throw new PackageOnlyError('PACKAGE_FOREIGN_PATH', 'Owned staging identity changed.', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }

    const workRoot = join(stagingPath, '.missionpulse-work');
    const snapshotRoot = join(workRoot, 'snapshot');
    await mkdir(workRoot, { mode: 0o755 });
    const snapshotTree = await copySnapshot(distPath, snapshotRoot, options.seal.testedTree);
    const sourceAfterCopy = await inspectCanonicalTree(distPath);
    if (!canonicalReceiptsEqual(sourceAfterCopy, options.seal.testedTree)) {
      throw new PackageOnlyError('SOURCE_TREE_DRIFT', 'dist changed during snapshot copy.');
    }
    await recordPhase('snapshot_verified', {
      renameIntentAt: null,
      treeSha256: snapshotTree.treeSha256,
      archiveSha256: null,
      bundleInventorySha256: null,
    });

    const zipA = join(workRoot, 'zip-a');
    const zipB = join(workRoot, 'zip-b');
    await mkdir(zipA, { mode: 0o755 });
    await mkdir(zipB, { mode: 0o755 });
    const buildPersistedTwin = async (label: 'zip-a' | 'zip-b', directory: string) => {
      const directoryHandle = await openDirectoryNoFollow(directory);
      try {
        const independentlyObservedSnapshot = await inspectCanonicalTree(snapshotRoot);
        if (!canonicalReceiptsEqual(independentlyObservedSnapshot, snapshotTree)) {
          throw new PackageOnlyError(
            'SNAPSHOT_TREE_DRIFT',
            `${label} observed a drifting snapshot.`
          );
        }
        const independentInputs = await readTreeBytesNoFollow(
          snapshotRoot,
          independentlyObservedSnapshot
        );
        const built = buildCanonicalStoreZip(independentInputs);
        const path = join(directory, 'missionpulse.zip');
        await writeFileToDescriptor(
          directoryHandle,
          'missionpulse.zip',
          built.bytes,
          'TWIN_ARCHIVE_MISMATCH'
        );
        const [persistedEntry] = await readExpectedEntriesFromDescriptor(
          directoryHandle,
          [
            {
              path: 'missionpulse.zip',
              bytes: built.bytes.byteLength,
              sha256: built.receipt.zipSha256,
            },
          ],
          { exactRootNames: true, sync: true, errorCode: 'PACKAGE_BUNDLE_DRIFT' }
        );
        if (persistedEntry === undefined) {
          throw new PackageOnlyError('TWIN_ARCHIVE_MISMATCH', `${label} archive disappeared.`);
        }
        const persistedBytes = Buffer.from(persistedEntry.bytes);
        const persisted = inspectCanonicalStoreZip(persistedBytes);
        if (
          !persistedBytes.equals(built.bytes) ||
          jcsCanonicalize(persisted.receipt) !== jcsCanonicalize(built.receipt)
        ) {
          throw new PackageOnlyError(
            'TWIN_ARCHIVE_MISMATCH',
            `${label} changed between independent build and persisted verification.`
          );
        }
        await options.onTwinArchivePersisted?.({
          label,
          path,
          sha256: persisted.receipt.zipSha256,
        });
        return { bytes: persistedBytes, receipt: persisted.receipt };
      } finally {
        await directoryHandle.close();
      }
    };
    const first = await buildPersistedTwin('zip-a', zipA);
    const second = await buildPersistedTwin('zip-b', zipB);
    if (
      !first.bytes.equals(second.bytes) ||
      first.receipt.zipSha256 !== second.receipt.zipSha256 ||
      jcsCanonicalize(first.receipt) !== jcsCanonicalize(second.receipt)
    ) {
      throw new PackageOnlyError(
        'TWIN_ARCHIVE_MISMATCH',
        'Independently persisted canonical ZIP builds differ.'
      );
    }
    await recordPhase('archive_built', {
      renameIntentAt: null,
      treeSha256: snapshotTree.treeSha256,
      archiveSha256: first.receipt.zipSha256,
      bundleInventorySha256: null,
    });

    const extractedRoot = join(workRoot, 'extracted');
    const extractedTree = await extractCanonicalStoreZip(first.bytes, extractedRoot);
    const sourceAfterArchive = await inspectCanonicalTree(distPath);
    if (
      !canonicalReceiptsEqual(snapshotTree, options.seal.testedTree) ||
      !canonicalReceiptsEqual(extractedTree, options.seal.testedTree) ||
      !canonicalReceiptsEqual(sourceAfterArchive, options.seal.testedTree)
    ) {
      throw new PackageOnlyError(
        'PACKAGE_VALIDATION_FAILED',
        'Source/snapshot/extraction trees diverge.'
      );
    }
    const extractedManifest = JSON.parse(
      await readFile(join(extractedRoot, 'manifest.json'), 'utf8')
    ) as { manifest_version?: unknown; version?: unknown };
    if (
      extractedManifest.manifest_version !== 3 ||
      extractedManifest.version !== options.seal.committedVersion
    ) {
      throw new PackageOnlyError(
        'PACKAGE_VALIDATION_FAILED',
        'Extracted manifest identity is invalid.'
      );
    }

    const checksum = createChecksumSidecar(first.receipt.zipSha256);
    const validatedAt = sampleProtocolTimestamp();
    const validationRecord: PackageValidationRecordV1 = {
      schema: 'missionpulse.package-validation',
      version: 1,
      artifactId: options.artifactId,
      releaseId: options.seal.releaseId,
      sealId: options.seal.sealId,
      sealSha256: options.seal.sealSha256,
      committedVersion: options.seal.committedVersion,
      releaseNamespace,
      sourceTreeSha256: options.seal.testedTree.treeSha256,
      extractedTreeSha256: extractedTree.treeSha256,
      ownershipMarkerSha256: sha256Hex(markerBytes),
      zipSha256: first.receipt.zipSha256,
      sidecarSha256: checksum.receipt.sha256,
      entryInventorySha256: first.receipt.entryInventorySha256,
      canonicalZipReceiptSha256: sha256Hex(jcsCanonicalize(first.receipt)),
      validatedAt,
    };
    const validationBytes = Buffer.from(jcsCanonicalize(validationRecord));
    const zipPath = join(stagingPath, 'missionpulse.zip');
    const sidecarPath = join(stagingPath, 'missionpulse.zip.sha256');
    const validationPath = join(stagingPath, 'validation.json');
    await writeFileToDescriptor(
      stagingHandle,
      'missionpulse.zip',
      first.bytes,
      'PACKAGE_BUNDLE_DRIFT'
    );
    await writeFileToDescriptor(
      stagingHandle,
      'missionpulse.zip.sha256',
      checksum.bytes,
      'PACKAGE_BUNDLE_DRIFT'
    );
    await writeFileToDescriptor(
      stagingHandle,
      'validation.json',
      validationBytes,
      'PACKAGE_BUNDLE_DRIFT'
    );
    await rm(workRoot, { recursive: true });
    const bundleInventory = [
      {
        path: '.missionpulse-owner.json',
        bytes: markerBytes.byteLength,
        sha256: sha256Hex(markerBytes),
      },
      { path: 'missionpulse.zip', bytes: first.bytes.byteLength, sha256: first.receipt.zipSha256 },
      {
        path: 'missionpulse.zip.sha256',
        bytes: checksum.bytes.byteLength,
        sha256: checksum.receipt.sha256,
      },
      {
        path: 'validation.json',
        bytes: validationBytes.byteLength,
        sha256: sha256Hex(validationBytes),
      },
    ];
    const bundleInventorySha256 = sha256Hex(jcsCanonicalize(bundleInventory));
    if (stagingHandle === undefined) {
      throw new PackageOnlyError('PACKAGE_VALIDATION_FAILED', 'Staging descriptor was lost.');
    }
    await assertExactBundle(stagingHandle, bundleInventory);
    const renameIntentAt = sampleProtocolTimestamp();
    verifiedZipReceipt = first.receipt;
    history.push({
      phase: 'archive_verified',
      at: renameIntentAt,
      renameIntentAt,
      ownedDirectoryIdentitySha256,
      ownershipMarkerSha256,
      treeSha256: snapshotTree.treeSha256,
      archiveSha256: first.receipt.zipSha256,
      bundleInventorySha256,
    });
    if (journalHandle === undefined || stagingHandle === undefined) {
      throw new PackageOnlyError('PACKAGE_VALIDATION_FAILED', 'Package descriptors were lost.');
    }
    await appendJournal(journalHandle, currentJournal());
    await options.beforePublication?.({ markerPath, zipPath, sidecarPath, validationPath });
    try {
      await assertDirectoryPathIdentity(stagingHandle, stagingPath);
    } catch (error) {
      throw new PackageOnlyError('PACKAGE_FOREIGN_PATH', 'Owned staging identity changed.', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    await options.afterPublicationIdentityVerified?.({ stagingPath });
    await assertExactBundle(stagingHandle, bundleInventory);
    try {
      await assertDirectoryPathIdentity(stagingHandle, stagingPath);
    } catch (error) {
      throw new PackageOnlyError(
        'PACKAGE_FOREIGN_PATH',
        'Owned staging pathname changed before publication.',
        { cause: error instanceof Error ? error.message : String(error) }
      );
    }
    if (options.atomicRenameNoReplace !== undefined) {
      await options.atomicRenameNoReplace(stagingPath, finalPath);
      await fsyncDirectory(releasesPath);
    } else {
      const releasesHandle = await openDirectoryNoFollow(releasesPath);
      try {
        await assertDirectoryPathIdentity(releasesHandle, releasesPath);
        const sourceIdentity = await stagingHandle.stat({ bigint: true });
        await nativeAtomicRenameNoReplaceAt(
          releasesHandle,
          basename(stagingPath),
          basename(finalPath),
          { device: sourceIdentity.dev, inode: sourceIdentity.ino }
        );
        await assertDirectoryPathIdentity(releasesHandle, releasesPath);
      } finally {
        await releasesHandle.close();
      }
    }
    history.push({
      phase: 'bundle_renamed',
      at: renameIntentAt,
      renameIntentAt,
      ownedDirectoryIdentitySha256,
      ownershipMarkerSha256,
      treeSha256: snapshotTree.treeSha256,
      archiveSha256: first.receipt.zipSha256,
      bundleInventorySha256,
    });
    await appendJournal(journalHandle, currentJournal());
    try {
      await assertDirectoryPathIdentity(stagingHandle, finalPath);
    } catch (error) {
      throw new PackageOnlyError('PACKAGE_FOREIGN_PATH', 'Published bundle identity changed.', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    await assertExactBundle(stagingHandle, bundleInventory);
    const artifactValidatedAt = await recordPhase('published', {
      renameIntentAt,
      treeSha256: snapshotTree.treeSha256,
      archiveSha256: first.receipt.zipSha256,
      bundleInventorySha256,
    });
    artifact = {
      schema: 'missionpulse.validated-zip-artifact',
      version: 1,
      artifactId: options.artifactId,
      releaseId: options.seal.releaseId,
      sealId: options.seal.sealId,
      sealSha256: options.seal.sealSha256,
      sourceCommit: options.seal.sourceCommit,
      committedVersion: options.seal.committedVersion,
      releaseNamespace,
      manifest: options.seal.manifest,
      sourceTree: options.seal.testedTree,
      snapshotTree,
      extractedTree,
      zip: first.receipt,
      checksumSidecar: checksum.receipt,
      bundleDirectoryPath: finalPath,
      zipPath: join(finalPath, 'missionpulse.zip'),
      sidecarPath: join(finalPath, 'missionpulse.zip.sha256'),
      validationPath: join(finalPath, 'validation.json'),
      validationRecord,
      validationJsonSha256: sha256Hex(validationBytes),
      bundleInventorySha256,
      journalId: options.journalId,
      publishedAt: renameIntentAt,
      validatedAt: artifactValidatedAt,
    };
  } catch (error) {
    operationError = error;
  }

  let cleanupError: unknown;
  const descriptorCleanupErrors: unknown[] = [];
  for (const handle of [journalHandle, stagingHandle]) {
    if (handle === undefined) {
      continue;
    }
    try {
      await handle.close();
    } catch (error) {
      descriptorCleanupErrors.push(error);
    }
  }
  if (descriptorCleanupErrors.length > 0) {
    cleanupError = new AggregateError(
      descriptorCleanupErrors,
      'Package descriptor cleanup failed.'
    );
  }
  try {
    const pathStats = await lstat(lockPath, { bigint: true }).catch(() => null);
    if (
      pathStats === null ||
      pathStats.dev !== lockIdentity.dev ||
      pathStats.ino !== lockIdentity.ino
    ) {
      await lockHandle.close();
      const lockLost = new PackageOnlyError('PACKAGE_LOCK_LOST', 'Package lock identity changed.');
      cleanupError =
        cleanupError === undefined
          ? lockLost
          : new AggregateError([cleanupError, lockLost], 'Package cleanup failed.');
    } else {
      await lockHandle.close();
      await unlink(lockPath);
      await fsyncDirectory(releasesPath);
    }
  } catch (error) {
    cleanupError =
      cleanupError === undefined
        ? error
        : new AggregateError([cleanupError, error], 'Package cleanup failed.');
  }

  if (operationError !== undefined && cleanupError !== undefined) {
    throw new AggregateError(
      [operationError, cleanupError],
      'Package operation failed and its lock cleanup also failed.'
    );
  }
  if (operationError !== undefined) {
    throw operationError;
  }
  if (cleanupError !== undefined) {
    throw cleanupError;
  }
  if (artifact === undefined) {
    throw new PackageOnlyError('PACKAGE_VALIDATION_FAILED', 'Package runner produced no artifact.');
  }
  return artifact;
}

function parsePackageCliArgs(args: readonly string[]): {
  sealPath: string;
  distPath: string;
  releasesPath: string;
  artifactId: string;
  journalId: string;
} {
  const values = new Map<string, string>();
  const allowed = new Set(['--seal', '--dist', '--releases', '--artifact-id', '--journal-id']);
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!allowed.has(flag) || value === undefined) {
      throw new PackageOnlyError(
        'PACKAGE_INPUT_INVALID',
        `Unknown or incomplete argument: ${flag}`
      );
    }
    values.set(flag, value);
  }
  const sealPath = values.get('--seal');
  const distPath = values.get('--dist');
  const releasesPath = values.get('--releases');
  const artifactId = values.get('--artifact-id');
  const journalId = values.get('--journal-id');
  if (
    [sealPath, distPath, releasesPath, artifactId, journalId].some((value) => value === undefined)
  ) {
    throw new PackageOnlyError(
      'PACKAGE_INPUT_INVALID',
      'Required: --seal --dist --releases --artifact-id --journal-id. Build/install/version flags are forbidden.'
    );
  }
  return {
    sealPath: resolve(sealPath as string),
    distPath: resolve(distPath as string),
    releasesPath: resolve(releasesPath as string),
    artifactId: artifactId as string,
    journalId: journalId as string,
  };
}

export async function packageSealedDistCli(
  args: readonly string[] = process.argv.slice(2)
): Promise<void> {
  const options = parsePackageCliArgs(args);
  const sealBytes = await readPackageInputNoFollow(options.sealPath);
  const seal = JSON.parse(sealBytes.toString('utf8')) as TestedDistSealV1;
  if (jcsCanonicalize(seal) !== sealBytes.toString('utf8')) {
    throw new PackageOnlyError(
      'PACKAGE_INPUT_INVALID',
      'Seal bytes must be exact newline-free JCS.'
    );
  }
  if (seal.build.nodeVersion !== process.versions.node) {
    throw new PackageOnlyError(
      'PACKAGE_INPUT_INVALID',
      'Package-only Node version differs from the sealed build toolchain.'
    );
  }
  const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const workspaceRoot = resolve(extensionRoot, '../..');
  const { stdout: head } = await execFile('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot });
  if (head.trim() !== seal.sourceCommit) {
    throw new PackageOnlyError(
      'PACKAGE_INPUT_INVALID',
      'Checked-out commit differs from the tested-dist seal.'
    );
  }
  const committedPackage = JSON.parse(
    (
      await execFile('git', ['show', `${seal.sourceCommit}:apps/extension/package.json`], {
        cwd: workspaceRoot,
      })
    ).stdout
  ) as { version?: unknown };
  if (committedPackage.version !== seal.committedVersion) {
    throw new PackageOnlyError(
      'PACKAGE_INPUT_INVALID',
      'Committed package version diverges from seal.'
    );
  }
  const scenarioBlob = (
    await execFile(
      'git',
      ['show', `${seal.sourceCommit}:apps/extension/tests/mv3/scenarios.v1.json`],
      { cwd: workspaceRoot }
    )
  ).stdout;
  const committedScenarioIds = parseCommittedScenarioInventory(Buffer.from(scenarioBlob, 'utf8'));
  if (
    jcsCanonicalize(committedScenarioIds) !== jcsCanonicalize(seal.mv3Gate.executedScenarioIds) ||
    sha256Hex(jcsCanonicalize(committedScenarioIds)) !==
      seal.mv3Gate.expectedScenarioInventorySha256
  ) {
    throw new PackageOnlyError(
      'PACKAGE_INPUT_INVALID',
      'Seal does not bind the complete committed packaged-MV3 scenario inventory.'
    );
  }
  const { stdout: pnpmVersion } = await execFile('pnpm', ['--version'], { cwd: workspaceRoot });
  if (pnpmVersion.trim() !== seal.build.pnpmVersion) {
    throw new PackageOnlyError(
      'PACKAGE_INPUT_INVALID',
      'Package-only pnpm version differs from the sealed build toolchain.'
    );
  }
  const artifact = await packageSealedDist({
    seal,
    distPath: options.distPath,
    releasesPath: options.releasesPath,
    artifactId: options.artifactId,
    journalId: options.journalId,
  });
  process.stdout.write(`${jcsCanonicalize(artifact)}\n`);
}

const invokedPath = process.argv[1] === undefined ? null : resolve(process.argv[1]);
if (invokedPath !== null && fileURLToPath(import.meta.url) === invokedPath) {
  packageSealedDistCli().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
