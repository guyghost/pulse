#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertPinnedPythonIdentity,
  attestPinnedPythonRuntime,
  spawnPinnedPython,
} from './pinned-python-runtime';

export type Sha256 = string;

export interface CanonicalFileEntryV2 {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: Sha256;
  readonly mode: '0644';
}

export interface CanonicalTreeReceiptV2 {
  readonly algorithm: 'missionpulse-tree-sha256-v2';
  readonly fileCount: number;
  readonly treeSha256: Sha256;
  readonly manifestSha256: Sha256;
  readonly entries: readonly CanonicalFileEntryV2[];
}

export interface CanonicalTreeLimits {
  readonly maxFiles: number;
  readonly maxDirectories: number;
  readonly maxPathBytes: number;
  readonly maxTotalPathBytes: number;
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
}

export const DEFAULT_CANONICAL_TREE_LIMITS: CanonicalTreeLimits = Object.freeze({
  maxFiles: 20_000,
  maxDirectories: 20_000,
  maxPathBytes: 65_535,
  maxTotalPathBytes: 16 * 1024 * 1024,
  maxFileBytes: 512 * 1024 * 1024,
  maxTotalBytes: 2 * 1024 * 1024 * 1024 - 1,
});

export const RELEASE_DESCRIPTOR_SCANNER = Object.freeze({
  protocol: 'missionpulse.descriptor-scanner.v1',
  pythonVersion: '3.14.5',
  scriptSha256: 'e440610e7d2c490a7ebb1b70746ae2a9c243eccd7e4e845f95262ef3e4794c1a',
  timeoutMs: 30_000,
});

export interface CanonicalScannerRuntime {
  readonly executablePath: string;
  readonly scriptPath: string;
  readonly expectedProtocol: typeof RELEASE_DESCRIPTOR_SCANNER.protocol;
  readonly expectedPythonVersion: string;
  readonly expectedScriptSha256: Sha256;
  readonly timeoutMs: number;
}

export interface CanonicalTreeInspectionHooks {
  readonly afterRootOpened?: () => void | Promise<void>;
}

export type CanonicalArtifactErrorCode =
  | 'TREE_ROOT_INVALID'
  | 'TREE_NON_REGULAR_ENTRY'
  | 'TREE_HARD_LINK_ALIAS'
  | 'TREE_SPARSE_FILE'
  | 'TREE_CHANGED_DURING_READ'
  | 'TREE_LIMIT_EXCEEDED'
  | 'TREE_MANIFEST_MISSING'
  | 'PATH_INVALID_UTF8'
  | 'PATH_UNSAFE'
  | 'PATH_COLLISION';

export class CanonicalArtifactError extends Error {
  readonly code: CanonicalArtifactErrorCode;
  readonly detail?: Readonly<Record<string, unknown>>;

  constructor(
    code: CanonicalArtifactErrorCode,
    message: string,
    detail?: Readonly<Record<string, unknown>>
  ) {
    super(`${code}: ${message}`);
    this.name = 'CanonicalArtifactError';
    this.code = code;
    this.detail = detail;
  }
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UNPAIRED_SURROGATE_PATTERN =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

export function sha256Hex(bytes: string | Uint8Array): Sha256 {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Minimal RFC 8785/JCS serializer for JSON data. Object properties whose value
 * is undefined are omitted, matching JSON object serialization. Non-JSON
 * values fail closed instead of being silently coerced.
 */
export function jcsCanonicalize(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('JCS accepts finite JSON numbers only.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((entry) => {
        if (entry === undefined || typeof entry === 'function' || typeof entry === 'symbol') {
          throw new TypeError('JCS arrays cannot contain non-JSON values.');
        }
        return jcsCanonicalize(entry);
      })
      .join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const properties = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${jcsCanonicalize(record[key])}`);
    return `{${properties.join(',')}}`;
  }
  throw new TypeError(`JCS cannot serialize ${typeof value}.`);
}

export function compareUnsignedUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function canonicalPathCollisionKey(path: string): string {
  return path.normalize('NFC').toLowerCase();
}

function assertCanonicalRelativePath(path: string, limits: CanonicalTreeLimits): void {
  if (
    path.length === 0 ||
    path.startsWith('/') ||
    path.endsWith('/') ||
    path.includes('\\') ||
    path.includes('\0')
  ) {
    throw new CanonicalArtifactError('PATH_UNSAFE', `Unsafe relative path ${JSON.stringify(path)}`);
  }
  if (UNPAIRED_SURROGATE_PATTERN.test(path)) {
    throw new CanonicalArtifactError('PATH_INVALID_UTF8', `Path is not valid Unicode: ${path}`);
  }
  const segments = path.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new CanonicalArtifactError('PATH_UNSAFE', `Path contains traversal: ${path}`);
  }
  const utf8 = Buffer.from(path, 'utf8');
  if (utf8.byteLength === 0 || utf8.byteLength > limits.maxPathBytes) {
    throw new CanonicalArtifactError('TREE_LIMIT_EXCEEDED', `Path is outside byte limits: ${path}`);
  }
}

export function validateCanonicalRelativePaths(
  paths: readonly string[],
  limits: CanonicalTreeLimits = DEFAULT_CANONICAL_TREE_LIMITS
): readonly string[] {
  if (paths.length > limits.maxFiles) {
    throw new CanonicalArtifactError('TREE_LIMIT_EXCEEDED', 'Canonical file-count limit exceeded.');
  }

  let totalPathBytes = 0;
  const exactPaths = new Set<string>();
  const collisionKeys = new Map<string, string>();
  for (const path of paths) {
    assertCanonicalRelativePath(path, limits);
    totalPathBytes += Buffer.byteLength(path, 'utf8');
    if (totalPathBytes > limits.maxTotalPathBytes) {
      throw new CanonicalArtifactError(
        'TREE_LIMIT_EXCEEDED',
        'Canonical path-byte limit exceeded.'
      );
    }
    if (exactPaths.has(path)) {
      throw new CanonicalArtifactError('PATH_COLLISION', `Duplicate path: ${path}`);
    }
    exactPaths.add(path);

    const collisionKey = canonicalPathCollisionKey(path);
    const previous = collisionKeys.get(collisionKey);
    if (previous !== undefined) {
      throw new CanonicalArtifactError(
        'PATH_COLLISION',
        `Case/Unicode-colliding paths: ${previous} and ${path}`
      );
    }
    collisionKeys.set(collisionKey, path);
  }

  return [...paths].sort(compareUnsignedUtf8);
}

interface DescriptorScanResult {
  readonly directoryCount: number;
  readonly entries: readonly CanonicalFileEntryV2[];
  readonly totalBytes: number;
  readonly totalPathBytes: number;
}

interface BoundedChildResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: Buffer;
  readonly stdout: Buffer;
  readonly timedOut: boolean;
  readonly outputOverflow: boolean;
}

async function collectBoundedChild(
  child: ReturnType<typeof spawn>,
  limits: {
    readonly maxStdoutBytes: number;
    readonly maxStderrBytes: number;
    readonly timeoutMs: number;
  }
): Promise<BoundedChildResult> {
  const stdoutStream = child.stdout;
  const stderrStream = child.stderr;
  if (stdoutStream === null || stderrStream === null) {
    child.kill('SIGKILL');
    throw new CanonicalArtifactError(
      'TREE_CHANGED_DURING_READ',
      'Descriptor scanner streams were not isolated.'
    );
  }
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let outputOverflow = false;
  let timedOut = false;
  stdoutStream.on('data', (chunk: Buffer) => {
    stdoutBytes += chunk.byteLength;
    if (stdoutBytes > limits.maxStdoutBytes) {
      outputOverflow = true;
      child.kill('SIGKILL');
      return;
    }
    stdout.push(chunk);
  });
  stderrStream.on('data', (chunk: Buffer) => {
    stderrBytes += chunk.byteLength;
    if (stderrBytes > limits.maxStderrBytes) {
      outputOverflow = true;
      child.kill('SIGKILL');
      return;
    }
    stderr.push(chunk);
  });
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, limits.timeoutMs);
  const closed = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolveClose, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolveClose({ code, signal }));
    }
  ).finally(() => clearTimeout(timeout));
  return {
    ...closed,
    stdout: Buffer.concat(stdout),
    stderr: Buffer.concat(stderr),
    timedOut,
    outputOverflow,
  };
}

export function scannerScriptDescriptorPath(
  platform: NodeJS.Platform,
  childDescriptor = 4
): string {
  if (platform === 'linux') {
    return `/proc/self/fd/${childDescriptor}`;
  }
  if (platform === 'darwin') {
    return `/dev/fd/${childDescriptor}`;
  }
  throw new CanonicalArtifactError(
    'TREE_ROOT_INVALID',
    `Descriptor scanner is unsupported on ${platform}.`
  );
}

function defaultScannerRuntime(): CanonicalScannerRuntime {
  return {
    executablePath: process.env.PULSE_RELEASE_PYTHON ?? 'python3',
    scriptPath: resolve(dirname(fileURLToPath(import.meta.url)), 'canonical-artifact-scan.py'),
    expectedProtocol: RELEASE_DESCRIPTOR_SCANNER.protocol,
    expectedPythonVersion: RELEASE_DESCRIPTOR_SCANNER.pythonVersion,
    expectedScriptSha256: RELEASE_DESCRIPTOR_SCANNER.scriptSha256,
    timeoutMs: RELEASE_DESCRIPTOR_SCANNER.timeoutMs,
  };
}

function validateDescriptorScanResult(
  parsed: unknown,
  limits: CanonicalTreeLimits
): DescriptorScanResult {
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.keys(parsed).sort().join(',') !== 'directoryCount,entries,totalBytes,totalPathBytes'
  ) {
    throw new CanonicalArtifactError(
      'TREE_CHANGED_DURING_READ',
      'Descriptor scanner result has an invalid shape.'
    );
  }
  const value = parsed as Record<string, unknown>;
  for (const key of ['directoryCount', 'totalBytes', 'totalPathBytes'] as const) {
    if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 0) {
      throw new CanonicalArtifactError(
        'TREE_CHANGED_DURING_READ',
        `Descriptor scanner returned invalid ${key}.`
      );
    }
  }
  if (!Array.isArray(value.entries) || value.entries.length > limits.maxFiles) {
    throw new CanonicalArtifactError(
      'TREE_LIMIT_EXCEEDED',
      'Descriptor scanner entry bound failed.'
    );
  }
  const entries: CanonicalFileEntryV2[] = value.entries.map((entry) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      Array.isArray(entry) ||
      Object.keys(entry).sort().join(',') !== 'bytes,mode,path,sha256'
    ) {
      throw new CanonicalArtifactError(
        'TREE_CHANGED_DURING_READ',
        'Descriptor scanner entry shape is invalid.'
      );
    }
    const item = entry as Record<string, unknown>;
    if (
      typeof item.path !== 'string' ||
      !Number.isSafeInteger(item.bytes) ||
      (item.bytes as number) < 0 ||
      (item.bytes as number) > limits.maxFileBytes ||
      item.mode !== '0644' ||
      typeof item.sha256 !== 'string' ||
      !SHA256_PATTERN.test(item.sha256)
    ) {
      throw new CanonicalArtifactError(
        'TREE_CHANGED_DURING_READ',
        'Descriptor scanner entry values are invalid.'
      );
    }
    return {
      path: item.path,
      bytes: item.bytes as number,
      sha256: item.sha256,
      mode: '0644',
    };
  });
  const sorted = validateCanonicalRelativePaths(
    entries.map(({ path }) => path),
    limits
  );
  if (sorted.some((path, index) => path !== entries[index]?.path)) {
    throw new CanonicalArtifactError('PATH_COLLISION', 'Scanner entries are not byte-sorted.');
  }
  const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  if (
    totalBytes !== value.totalBytes ||
    (value.directoryCount as number) < 1 ||
    (value.directoryCount as number) > limits.maxDirectories ||
    (value.totalPathBytes as number) > limits.maxTotalPathBytes ||
    totalBytes > limits.maxTotalBytes
  ) {
    throw new CanonicalArtifactError(
      'TREE_LIMIT_EXCEEDED',
      'Descriptor scanner totals are outside canonical bounds.'
    );
  }
  return {
    directoryCount: value.directoryCount as number,
    entries,
    totalBytes,
    totalPathBytes: value.totalPathBytes as number,
  };
}

async function scanDescriptorTree(
  rootHandle: FileHandle,
  limits: CanonicalTreeLimits,
  runtime: CanonicalScannerRuntime
): Promise<DescriptorScanResult> {
  let scriptHandle: FileHandle;
  try {
    scriptHandle = await open(
      runtime.scriptPath,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)
    );
  } catch (error) {
    throw new CanonicalArtifactError(
      'TREE_ROOT_INVALID',
      'Descriptor scanner script is unavailable.',
      {
        cause: error instanceof Error ? error.message : String(error),
      }
    );
  }
  try {
    const scriptBefore = await scriptHandle.stat({ bigint: true });
    if (!scriptBefore.isFile() || scriptBefore.nlink !== 1n || scriptBefore.size > 256_000n) {
      throw new CanonicalArtifactError('TREE_ROOT_INVALID', 'Descriptor scanner script is unsafe.');
    }
    const scriptBytes = Buffer.alloc(Number(scriptBefore.size));
    let scriptOffset = 0;
    while (scriptOffset < scriptBytes.byteLength) {
      const { bytesRead } = await scriptHandle.read(
        scriptBytes,
        scriptOffset,
        scriptBytes.byteLength - scriptOffset,
        scriptOffset
      );
      if (bytesRead === 0) {
        break;
      }
      scriptOffset += bytesRead;
    }
    const scriptAfter = await scriptHandle.stat({ bigint: true });
    if (
      scriptBefore.dev !== scriptAfter.dev ||
      scriptBefore.ino !== scriptAfter.ino ||
      scriptBefore.size !== scriptAfter.size ||
      scriptBefore.mtimeNs !== scriptAfter.mtimeNs ||
      scriptBefore.ctimeNs !== scriptAfter.ctimeNs ||
      scriptOffset !== Number(scriptBefore.size) ||
      sha256Hex(scriptBytes) !== runtime.expectedScriptSha256
    ) {
      throw new CanonicalArtifactError(
        'TREE_CHANGED_DURING_READ',
        'Descriptor scanner script digest or identity changed.'
      );
    }

    let pinnedPython;
    try {
      pinnedPython = await attestPinnedPythonRuntime(
        runtime.executablePath,
        runtime.expectedPythonVersion
      );
    } catch (error) {
      throw new CanonicalArtifactError(
        'TREE_ROOT_INVALID',
        'Descriptor scanner interpreter is not an attested native binary.',
        { cause: error instanceof Error ? error.message : String(error) }
      );
    }
    try {
      const args = [
        scannerScriptDescriptorPath(process.platform),
        runtime.expectedProtocol,
        String(limits.maxFiles),
        String(limits.maxDirectories),
        String(limits.maxPathBytes),
        String(limits.maxTotalPathBytes),
        String(limits.maxFileBytes),
        String(limits.maxTotalBytes),
      ];
      const child = await spawnPinnedPython(pinnedPython, args, {
        stdio: ['ignore', 'pipe', 'pipe', rootHandle.fd, scriptHandle.fd],
      });
      const maxOutputBytes = Math.min(64 * 1024 * 1024, limits.maxTotalPathBytes + 8 * 1024 * 1024);
      let result: BoundedChildResult;
      try {
        result = await collectBoundedChild(child, {
          maxStdoutBytes: maxOutputBytes,
          maxStderrBytes: 64 * 1024,
          timeoutMs: runtime.timeoutMs,
        });
        await assertPinnedPythonIdentity(pinnedPython);
      } catch (error) {
        throw new CanonicalArtifactError(
          'TREE_CHANGED_DURING_READ',
          'Descriptor scanner could not be started.',
          { cause: error instanceof Error ? error.message : String(error) }
        );
      }
      if (result.code !== 0 || result.signal !== null || result.timedOut || result.outputOverflow) {
        let failure: { code?: unknown; message?: unknown } = {};
        try {
          failure = JSON.parse(result.stderr.toString('utf8')) as typeof failure;
        } catch {
          // The bounded stderr is never trusted when it is not exact JSON.
        }
        const code =
          typeof failure.code === 'string' &&
          [
            'TREE_ROOT_INVALID',
            'TREE_NON_REGULAR_ENTRY',
            'TREE_HARD_LINK_ALIAS',
            'TREE_SPARSE_FILE',
            'TREE_CHANGED_DURING_READ',
            'TREE_LIMIT_EXCEEDED',
            'PATH_INVALID_UTF8',
            'PATH_UNSAFE',
            'PATH_COLLISION',
          ].includes(failure.code)
            ? (failure.code as CanonicalArtifactErrorCode)
            : 'TREE_CHANGED_DURING_READ';
        throw new CanonicalArtifactError(
          code,
          typeof failure.message === 'string'
            ? failure.message
            : 'Descriptor-relative scanner failed closed.',
          {
            exitCode: result.code,
            signal: result.signal,
            timedOut: result.timedOut,
            outputOverflow: result.outputOverflow,
          }
        );
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(result.stdout.toString('utf8'));
      } catch {
        throw new CanonicalArtifactError(
          'TREE_CHANGED_DURING_READ',
          'Descriptor scanner returned invalid JSON.'
        );
      }
      return validateDescriptorScanResult(parsed, limits);
    } finally {
      await pinnedPython.handle.close();
    }
  } finally {
    await scriptHandle.close();
  }
}

export function assertCanonicalTreeReceipt(
  receipt: CanonicalTreeReceiptV2,
  limits: CanonicalTreeLimits = DEFAULT_CANONICAL_TREE_LIMITS
): void {
  if (receipt.algorithm !== 'missionpulse-tree-sha256-v2') {
    throw new CanonicalArtifactError('TREE_CHANGED_DURING_READ', 'Tree algorithm is invalid.');
  }
  if (!Number.isSafeInteger(receipt.fileCount) || receipt.fileCount !== receipt.entries.length) {
    throw new CanonicalArtifactError('TREE_CHANGED_DURING_READ', 'Tree file count is invalid.');
  }
  const sorted = validateCanonicalRelativePaths(
    receipt.entries.map(({ path }) => path),
    limits
  );
  if (sorted.some((path, index) => path !== receipt.entries[index]?.path)) {
    throw new CanonicalArtifactError('PATH_COLLISION', 'Tree entries are not in UTF-8 byte order.');
  }
  let totalBytes = 0;
  for (const entry of receipt.entries) {
    if (
      entry.mode !== '0644' ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      entry.bytes > limits.maxFileBytes ||
      !SHA256_PATTERN.test(entry.sha256)
    ) {
      throw new CanonicalArtifactError(
        'TREE_CHANGED_DURING_READ',
        `Malformed canonical entry: ${entry.path}`
      );
    }
    totalBytes += entry.bytes;
  }
  if (totalBytes > limits.maxTotalBytes) {
    throw new CanonicalArtifactError('TREE_LIMIT_EXCEEDED', 'Canonical total-byte limit exceeded.');
  }
  const manifest = receipt.entries.find(({ path }) => path === 'manifest.json');
  if (manifest === undefined || manifest.sha256 !== receipt.manifestSha256) {
    throw new CanonicalArtifactError(
      'TREE_MANIFEST_MISSING',
      'Manifest receipt binding is invalid.'
    );
  }
  const framedTree = receipt.entries
    .map(({ path, bytes, sha256 }) => `${path}\0${String(bytes)}\0${sha256}\n`)
    .join('');
  if (
    !SHA256_PATTERN.test(receipt.treeSha256) ||
    !SHA256_PATTERN.test(receipt.manifestSha256) ||
    sha256Hex(framedTree) !== receipt.treeSha256
  ) {
    throw new CanonicalArtifactError('TREE_CHANGED_DURING_READ', 'Tree digest binding is invalid.');
  }
}

export async function inspectCanonicalTree(
  rootPath: string,
  limits: CanonicalTreeLimits = DEFAULT_CANONICAL_TREE_LIMITS,
  hooks: CanonicalTreeInspectionHooks = {},
  scannerRuntime: CanonicalScannerRuntime = defaultScannerRuntime()
): Promise<CanonicalTreeReceiptV2> {
  const root = resolve(rootPath);
  let rootHandle: FileHandle;
  try {
    rootHandle = await open(
      root,
      fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0)
    );
  } catch (error) {
    throw new CanonicalArtifactError('TREE_ROOT_INVALID', `Tree root is unavailable: ${root}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    const rootStats = await rootHandle.stat({ bigint: true });
    if (!rootStats.isDirectory()) {
      throw new CanonicalArtifactError('TREE_ROOT_INVALID', 'Tree root must be a real directory.');
    }
    if (!Number.isSafeInteger(limits.maxDirectories) || limits.maxDirectories < 1) {
      throw new CanonicalArtifactError('TREE_LIMIT_EXCEEDED', 'Directory limit must be positive.');
    }
    await hooks.afterRootOpened?.();

    const scanned = await scanDescriptorTree(rootHandle, limits, scannerRuntime);
    const rootStatsAfter = await rootHandle.stat({ bigint: true });
    let reopenedRoot: FileHandle;
    try {
      reopenedRoot = await open(
        root,
        fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0)
      );
    } catch {
      throw new CanonicalArtifactError(
        'TREE_CHANGED_DURING_READ',
        'Tree root pathname changed after descriptor admission.'
      );
    }
    try {
      const reopenedStats = await reopenedRoot.stat({ bigint: true });
      if (
        rootStats.dev !== rootStatsAfter.dev ||
        rootStats.ino !== rootStatsAfter.ino ||
        rootStats.mtimeNs !== rootStatsAfter.mtimeNs ||
        rootStats.ctimeNs !== rootStatsAfter.ctimeNs ||
        rootStats.dev !== reopenedStats.dev ||
        rootStats.ino !== reopenedStats.ino
      ) {
        throw new CanonicalArtifactError(
          'TREE_CHANGED_DURING_READ',
          'Tree root identity changed during descriptor-relative scan.'
        );
      }
    } finally {
      await reopenedRoot.close();
    }
    const entries = [...scanned.entries];
    if (
      scanned.directoryCount < 1 ||
      scanned.directoryCount > limits.maxDirectories ||
      scanned.totalBytes < 0 ||
      scanned.totalBytes > limits.maxTotalBytes ||
      scanned.totalPathBytes < 0 ||
      scanned.totalPathBytes > limits.maxTotalPathBytes
    ) {
      throw new CanonicalArtifactError(
        'TREE_LIMIT_EXCEEDED',
        'Descriptor scanner returned values outside canonical bounds.'
      );
    }
    const sortedPaths = validateCanonicalRelativePaths(
      entries.map(({ path }) => path),
      limits
    );
    const byPath = new Map(entries.map((entry) => [entry.path, entry]));
    const sortedEntries = sortedPaths.map((path) => {
      const entry = byPath.get(path);
      if (entry === undefined) {
        throw new CanonicalArtifactError(
          'TREE_CHANGED_DURING_READ',
          `Inventory lost path: ${path}`
        );
      }
      return entry;
    });
    const manifest = sortedEntries.find(({ path }) => path === 'manifest.json');
    if (manifest === undefined) {
      throw new CanonicalArtifactError(
        'TREE_MANIFEST_MISSING',
        'Canonical extension tree must contain manifest.json.'
      );
    }
    const framedTree = sortedEntries
      .map(({ path, bytes, sha256 }) => `${path}\0${String(bytes)}\0${sha256}\n`)
      .join('');
    const receipt: CanonicalTreeReceiptV2 = {
      algorithm: 'missionpulse-tree-sha256-v2',
      fileCount: sortedEntries.length,
      treeSha256: sha256Hex(framedTree),
      manifestSha256: manifest.sha256,
      entries: sortedEntries,
    };
    assertCanonicalTreeReceipt(receipt, limits);
    return receipt;
  } finally {
    await rootHandle.close();
  }
}

export function canonicalReceiptsEqual(
  left: CanonicalTreeReceiptV2,
  right: CanonicalTreeReceiptV2
): boolean {
  return jcsCanonicalize(left) === jcsCanonicalize(right);
}
