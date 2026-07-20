import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { constants as fsConstants, type BigIntStats } from 'node:fs';
import {
  chmod,
  lstat,
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  unlink,
  type FileHandle,
} from 'node:fs/promises';
import { isAbsolute, join, normalize, posix, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

import { RELEASE_RUNTIME_CONTRACT, assertSha256, createIsolatedPythonInvocation } from './contract';
import type {
  EffectiveLoadedObjectEntry,
  EffectiveLoadedObjectsProof,
  PythonRuntimeInventoryProof,
  ReleaseRuntimeObservation,
  VerifiedExecutionImageAuthorityV1,
} from './proof';
import {
  assertReleaseRuntimePrelude,
  assertVerifiedExecutionImageAuthority,
  authorizeReleaseRuntimeObservation,
} from './proof';

const MAX_FILE_BYTES = 536_870_912;
const MAX_ENTRIES = 20_000;
const MAX_LOADED_OBJECTS = 8_192;
const MAX_LOADED_OBJECT_OUTPUT_BYTES = 16_777_216;
const MAX_INVENTORY_OUTPUT_BYTES = 16_777_216;
const SHA256 = /^[a-f0-9]{64}$/;
const DENIED_MUTATION_CODES = new Set(['EACCES', 'EBUSY', 'EPERM', 'EROFS', 'ETXTBSY']);
const execFile = promisify(execFileCallback);

export const EFFECTIVE_LOADED_OBJECT_PROBE_SOURCE = String.raw`import base64
import binascii
import hashlib
import json
import os
import pathlib
import stat
import struct
import sys
import tarfile
import tempfile
import unicodedata
import zipfile
import zlib

MAX_OBJECT_BYTES = 536870912

def identity(value):
    return (value.st_dev, value.st_ino, value.st_mode, value.st_size, value.st_mtime_ns, value.st_ctime_ns)

def capture(path):
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_size <= 0 or before.st_size > MAX_OBJECT_BYTES:
            raise RuntimeError("unbounded mapped object")
        digest = hashlib.sha256()
        total = 0
        while True:
            chunk = os.read(descriptor, min(1048576, before.st_size - total))
            if not chunk:
                break
            digest.update(chunk)
            total += len(chunk)
        after = os.fstat(descriptor)
        if total != before.st_size or identity(before) != identity(after):
            raise RuntimeError("mapped object changed during capture")
        return {"path": path, "bytes": total, "sha256": digest.hexdigest()}
    finally:
        os.close(descriptor)

paths = set()
with open("/proc/self/maps", "r", encoding="ascii", errors="strict") as maps:
    for line in maps:
        fields = line.rstrip("\n").split(None, 5)
        if len(fields) == 6 and fields[5].startswith("/"):
            if fields[5].endswith(" (deleted)"):
                raise RuntimeError("deleted mapped object")
            fields[5].encode("utf-8", "strict")
            paths.add(fields[5])

entries = [capture(path) for path in sorted(paths, key=lambda value: value.encode("utf-8"))]
print(json.dumps({"schema": "missionpulse.effective-loaded-objects-probe", "version": 1, "entries": entries}, ensure_ascii=False, separators=(",", ":")), end="")`;

export const PYTHON_RUNTIME_INVENTORY_PROBE_SOURCE = String.raw`import hashlib
import json
import os
import posixpath
import stat

ROOT_PARENT = "/opt/missionpulse-python"
MAX_FILE_BYTES = 536870912
MAX_ENTRIES = 20000
entries = []
regular_inodes = set()

def identity(value):
    return (value.st_dev, value.st_ino, value.st_mode, value.st_size, value.st_mtime_ns, value.st_ctime_ns)

def canonical_mode(value):
    mode = value.st_mode & 0o7777
    if mode & 0o222:
        raise RuntimeError("writable runtime object")
    return format(mode, "04o")

def valid_name(value):
    value.encode("utf-8", "strict")
    if not value or value in (".", "..") or "/" in value or "\\" in value or "\x00" in value:
        raise RuntimeError("invalid directory entry name")

def safe_symlink(entry_path, target):
    target.encode("utf-8", "strict")
    if not target or target.startswith("/") or "\\" in target or "\x00" in target:
        raise RuntimeError("unsafe symlink target")
    resolved = posixpath.normpath(posixpath.join(posixpath.dirname(entry_path), target))
    if resolved != "python" and not resolved.startswith("python/"):
        raise RuntimeError("escaping symlink target")

def scan_directory(parent_descriptor, name, entry_path, include_self=True):
    flags = os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    directory_descriptor = os.open(name, flags, dir_fd=parent_descriptor)
    try:
        before = os.fstat(directory_descriptor)
        if not stat.S_ISDIR(before.st_mode):
            raise RuntimeError("runtime directory changed type")
        directory_mode = canonical_mode(before)
        if include_self:
            entries.append([entry_path, "d", directory_mode, 0, ""])
        names = sorted(os.listdir(directory_descriptor), key=lambda value: value.encode("utf-8"))
        for child in names:
            if len(entries) >= MAX_ENTRIES:
                raise RuntimeError("runtime inventory exceeds entry bound")
            valid_name(child)
            child_path = entry_path + "/" + child
            observed = os.stat(child, dir_fd=directory_descriptor, follow_symlinks=False)
            if stat.S_ISDIR(observed.st_mode):
                scan_directory(directory_descriptor, child, child_path)
            elif stat.S_ISREG(observed.st_mode):
                inode = (observed.st_dev, observed.st_ino)
                if inode in regular_inodes:
                    raise RuntimeError("hard-link alias")
                regular_inodes.add(inode)
                file_descriptor = os.open(child, os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0), dir_fd=directory_descriptor)
                try:
                    opened = os.fstat(file_descriptor)
                    if identity(opened) != identity(observed) or opened.st_size < 0 or opened.st_size > MAX_FILE_BYTES:
                        raise RuntimeError("runtime file changed before capture")
                    digest = hashlib.sha256()
                    total = 0
                    while total < opened.st_size:
                        chunk = os.read(file_descriptor, min(1048576, opened.st_size - total))
                        if not chunk:
                            break
                        digest.update(chunk)
                        total += len(chunk)
                    after = os.fstat(file_descriptor)
                    if total != opened.st_size or identity(after) != identity(opened):
                        raise RuntimeError("runtime file changed during capture")
                    entries.append([child_path, "f", canonical_mode(opened), total, digest.hexdigest()])
                finally:
                    os.close(file_descriptor)
            elif stat.S_ISLNK(observed.st_mode):
                target = os.readlink(child, dir_fd=directory_descriptor)
                after = os.stat(child, dir_fd=directory_descriptor, follow_symlinks=False)
                if identity(after) != identity(observed):
                    raise RuntimeError("runtime symlink changed during capture")
                safe_symlink(child_path, target)
                entries.append([child_path, "l", "link", len(target.encode("utf-8")), target])
            else:
                raise RuntimeError("forbidden runtime object")
        after = os.fstat(directory_descriptor)
        if identity(after) != identity(before):
            raise RuntimeError("runtime directory changed during traversal")
    finally:
        os.close(directory_descriptor)

parent_descriptor = os.open(ROOT_PARENT, os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0))
try:
    scan_directory(parent_descriptor, "python", "python", include_self=False)
finally:
    os.close(parent_descriptor)
entries.sort(key=lambda value: value[0].encode("utf-8"))
print(json.dumps({"schema": "missionpulse.python-runtime-inventory-probe", "version": 1, "entries": entries}, ensure_ascii=False, separators=(",", ":")), end="")`;

export class ReleaseRuntimeProbeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ReleaseRuntimeProbeError';
  }
}

export type PythonRuntimeInventoryEntry = readonly [
  path: string,
  kind: 'd' | 'f' | 'l',
  mode: string,
  bytes: number,
  content: string,
];

export interface CollectedPythonRuntimeInventory {
  readonly absoluteParent: string;
  readonly absoluteRuntimeRoot: string;
  readonly proof: PythonRuntimeInventoryProof;
  readonly entries: readonly PythonRuntimeInventoryEntry[];
}

export interface AttestedPythonExecutable {
  readonly executionPath: string;
  readonly revalidate: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export interface LinuxProcessPrivilegeProof {
  readonly effectiveCapabilitiesHex: '0000000000000000';
  readonly noNewPrivileges: true;
}

function fail(message: string, cause?: unknown): never {
  throw new ReleaseRuntimeProbeError(message, cause === undefined ? undefined : { cause });
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
  keys: readonly string[],
  label: string
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} has an unexpected shape.`);
  }
}

function compareUnsignedUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

export function parseLinuxProcessStatus(raw: string): LinuxProcessPrivilegeProof {
  if (raw.length === 0 || Buffer.byteLength(raw, 'utf8') > 262_144 || raw.includes('\0')) {
    fail('/proc/self/status is missing or unbounded.');
  }
  const capabilities = raw.match(/^CapEff:\s*([a-f0-9]{16})$/gm) ?? [];
  const noNewPrivileges = raw.match(/^NoNewPrivs:\s*([01])$/gm) ?? [];
  if (capabilities.length !== 1 || noNewPrivileges.length !== 1) {
    fail('/proc/self/status contains ambiguous privilege authority.');
  }
  const capabilitiesValue = capabilities[0].replace(/^CapEff:\s*/, '');
  const noNewPrivilegesValue = noNewPrivileges[0].replace(/^NoNewPrivs:\s*/, '');
  if (capabilitiesValue !== '0000000000000000' || noNewPrivilegesValue !== '1') {
    fail('The release controller retains capabilities or allows new privileges.');
  }
  return Object.freeze({
    effectiveCapabilitiesHex: '0000000000000000',
    noNewPrivileges: true,
  });
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

async function captureExecutableHandle(
  handle: FileHandle
): Promise<{ readonly identity: BigIntStats; readonly bytes: Buffer; readonly sha256: string }> {
  const before = await handle.stat({ bigint: true });
  const mode = Number(before.mode & 0o7777n);
  if (
    !before.isFile() ||
    before.size < 4n ||
    before.size > BigInt(MAX_FILE_BYTES) ||
    (mode & 0o222) !== 0 ||
    (mode & 0o111) === 0
  ) {
    fail('Content-authorized Python executable has invalid type, size, or mode.');
  }
  const bytes = Buffer.alloc(Number(before.size));
  let offset = 0;
  while (offset < bytes.byteLength) {
    const result = await handle.read(
      bytes,
      offset,
      Math.min(1_048_576, bytes.byteLength - offset),
      offset
    );
    if (result.bytesRead === 0) {
      break;
    }
    offset += result.bytesRead;
  }
  const after = await handle.stat({ bigint: true });
  if (
    offset !== bytes.byteLength ||
    !sameIdentity(before, after) ||
    !bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
  ) {
    fail('Content-authorized Python executable changed or is not ELF.');
  }
  return Object.freeze({
    identity: before,
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

export async function attestPythonExecutableAtPath(
  path: string,
  expectedSha256: string
): Promise<AttestedPythonExecutable> {
  try {
    assertSha256(expectedSha256, 'expectedPythonExecutableSha256');
  } catch (error) {
    fail('Expected Python executable digest is malformed.', error);
  }
  if (
    !isAbsolute(path) ||
    normalize(path) !== path ||
    resolve(path) !== path ||
    path.includes('\0')
  ) {
    fail('Python executable path is not one canonical absolute path.');
  }
  let handle: FileHandle | undefined;
  try {
    if ((await realpath(path)) !== path) {
      fail('Python executable path contains a link alias.');
    }
    const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
    handle = await open(path, flags);
    const initial = await captureExecutableHandle(handle);
    if (initial.sha256 !== expectedSha256) {
      fail('Python executable bytes differ from content authority.');
    }
    const heldHandle = handle;
    handle = undefined;
    let closed = false;
    return Object.freeze({
      executionPath: `/proc/${process.pid}/fd/${heldHandle.fd}`,
      revalidate: async () => {
        if (closed) {
          fail('Python executable attestation is closed.');
        }
        let reopened: FileHandle | undefined;
        try {
          if ((await realpath(path)) !== path) {
            fail('Python executable path became an alias.');
          }
          const held = await captureExecutableHandle(heldHandle);
          reopened = await open(path, flags);
          const current = await captureExecutableHandle(reopened);
          if (
            !sameIdentity(initial.identity, held.identity) ||
            !sameIdentity(initial.identity, current.identity) ||
            held.sha256 !== expectedSha256 ||
            current.sha256 !== expectedSha256
          ) {
            fail('Python executable changed across helper execution.');
          }
        } finally {
          await reopened?.close();
        }
      },
      close: async () => {
        if (closed) {
          return;
        }
        closed = true;
        await heldHandle.close();
      },
    });
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (error instanceof ReleaseRuntimeProbeError) {
      throw error;
    }
    fail('Python executable could not be opened without following links.', error);
  }
}

function canonicalRelativePath(parent: string, absolutePath: string): string {
  const value = relative(parent, absolutePath).split('\\').join('/');
  if (
    value.length === 0 ||
    value.startsWith('/') ||
    value.startsWith('../') ||
    value.includes('\0') ||
    value
      .split('/')
      .some((segment) => segment.length === 0 || segment === '.' || segment === '..') ||
    Buffer.from(value, 'utf8').toString('utf8') !== value
  ) {
    fail('Python runtime contains a non-canonical path.');
  }
  return value;
}

function canonicalMode(stats: BigIntStats): string {
  const mode = Number(stats.mode & 0o7777n);
  if ((mode & 0o222) !== 0) {
    fail('Python runtime contains a writable directory or regular file.');
  }
  return mode.toString(8).padStart(4, '0');
}

async function readBoundedRegularFile(
  path: string
): Promise<{ readonly bytes: Buffer; readonly stats: BigIntStats }> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size < 0n || before.size > BigInt(MAX_FILE_BYTES)) {
      fail(`${path} is not a bounded regular file.`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (!sameIdentity(before, after) || bytes.byteLength !== Number(before.size)) {
      fail(`${path} changed while its bytes were captured.`);
    }
    return { bytes, stats: before };
  } catch (error) {
    if (error instanceof ReleaseRuntimeProbeError) {
      throw error;
    }
    throw new ReleaseRuntimeProbeError(`${path} could not be opened without following links.`, {
      cause: error,
    });
  } finally {
    await handle?.close();
  }
}

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }
  return typeof error.code === 'string' ? error.code : null;
}

async function requireBlockedMutation(
  label: keyof ReleaseRuntimeObservation['mutationAttempts'],
  mutation: () => Promise<void>
): Promise<'blocked'> {
  try {
    await mutation();
  } catch (error) {
    const code = errorCode(error);
    if (code !== null && DENIED_MUTATION_CODES.has(code)) {
      return 'blocked';
    }
    fail(`Runtime ${label} mutation failed ambiguously.`, error);
  }
  fail(`Runtime ${label} mutation unexpectedly succeeded.`);
}

async function probeRuntimeMutations(): Promise<ReleaseRuntimeObservation['mutationAttempts']> {
  const root = RELEASE_RUNTIME_CONTRACT.python.rootPath;
  const executable = RELEASE_RUNTIME_CONTRACT.python.executablePath;
  const probePath = join(root, '.missionpulse-runtime-write-probe');
  const renamedExecutable = `${executable}.missionpulse-rename-probe`;

  const create = await requireBlockedMutation('create', async () => {
    const handle = await open(
      probePath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
      0o600
    );
    await handle.close();
    await unlink(probePath).catch(() => undefined);
  });

  const executableStats = await lstat(executable, { bigint: true });
  const originalMode = Number(executableStats.mode & 0o7777n);
  const chmodResult = await requireBlockedMutation('chmod', async () => {
    await chmod(executable, originalMode | 0o200);
    await chmod(executable, originalMode).catch(() => undefined);
  });

  const sameSizeWrite = await requireBlockedMutation('sameSizeWrite', async () => {
    const handle = await open(executable, fsConstants.O_RDWR | (fsConstants.O_NOFOLLOW ?? 0));
    try {
      const byte = Buffer.alloc(1);
      const read = await handle.read(byte, 0, 1, 0);
      if (read.bytesRead !== 1) {
        fail('Python executable cannot support the same-size mutation probe.');
      }
      await handle.write(byte, 0, 1, 0);
      await handle.sync();
    } finally {
      await handle.close();
    }
  });

  const renameResult = await requireBlockedMutation('rename', async () => {
    await rename(executable, renamedExecutable);
    await rename(renamedExecutable, executable).catch(() => undefined);
  });

  const unlinkResult = await requireBlockedMutation('unlink', async () => {
    await unlink(executable);
  });

  return Object.freeze({
    create,
    rename: renameResult,
    unlink: unlinkResult,
    chmod: chmodResult,
    sameSizeWrite,
  });
}

function processEnvironment(): Readonly<Record<string, string>> {
  const entries = Object.entries(process.env)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .sort((left, right) => compareUnsignedUtf8(left[0], right[0]));
  return Object.freeze(Object.fromEntries(entries));
}

async function runEffectiveLoadedObjectProbe(
  runtimeInventory: CollectedPythonRuntimeInventory,
  executionImageAuthority: VerifiedExecutionImageAuthorityV1,
  executable: AttestedPythonExecutable
): Promise<EffectiveLoadedObjectsProof> {
  const invocation = createIsolatedPythonInvocation(EFFECTIVE_LOADED_OBJECT_PROBE_SOURCE);
  let result: Awaited<ReturnType<typeof execFile>>;
  try {
    result = await execFile(executable.executionPath, [...invocation.args], {
      cwd: '/tmp',
      env: { ...invocation.env },
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: MAX_LOADED_OBJECT_OUTPUT_BYTES,
      windowsHide: true,
    });
  } catch (error) {
    fail('Content-authorized Python loaded-object probe failed.', error);
  }
  if (typeof result.stdout !== 'string' || result.stderr !== '') {
    fail('Content-authorized Python loaded-object probe returned ambiguous output.');
  }
  return verifyEffectiveLoadedObjectProbe(result.stdout, runtimeInventory, executionImageAuthority);
}

export async function observeReleaseRuntime(
  rawExecutionImageAuthority: unknown
): Promise<ReleaseRuntimeObservation> {
  const executionImageAuthority = assertVerifiedExecutionImageAuthority(rawExecutionImageAuthority);
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    fail('Release execution is supported only on linux/amd64.');
  }
  if (typeof process.getuid !== 'function' || typeof process.getgid !== 'function') {
    fail('Release execution lacks a Unix process identity.');
  }

  const [statusRaw, mountInfo] = await Promise.all([
    readFile('/proc/self/status', 'utf8'),
    readFile('/proc/self/mountinfo', 'utf8'),
  ]);
  const privilegeProof = parseLinuxProcessStatus(statusRaw);
  const ambientEnvironment = processEnvironment();
  const executable = await attestPythonExecutableAtPath(
    RELEASE_RUNTIME_CONTRACT.python.executablePath,
    RELEASE_RUNTIME_CONTRACT.python.executableSha256
  );
  try {
    await executable.revalidate();
    const beforeInventory = await runPythonRuntimeInventoryProbe(executable);
    await executable.revalidate();
    const prelude = Object.freeze({
      platform: process.platform,
      architecture: process.arch,
      uid: process.getuid(),
      gid: process.getgid(),
      noNewPrivileges: privilegeProof.noNewPrivileges,
      effectiveCapabilitiesHex: privilegeProof.effectiveCapabilitiesHex,
      ambientEnvironment,
      mountInfo,
      beforeMutationInventory: beforeInventory.proof,
    });
    assertReleaseRuntimePrelude(prelude);

    const mutationAttempts = await probeRuntimeMutations();
    await executable.revalidate();
    const afterInventory = await runPythonRuntimeInventoryProbe(executable);
    await executable.revalidate();
    const loadedObjects = await runEffectiveLoadedObjectProbe(
      afterInventory,
      executionImageAuthority,
      executable
    );
    await executable.revalidate();
    const observation = Object.freeze({
      ...prelude,
      mutationAttempts,
      afterMutationInventory: afterInventory.proof,
      loadedObjects,
    }) satisfies ReleaseRuntimeObservation;
    authorizeReleaseRuntimeObservation(observation, executionImageAuthority);
    return observation;
  } finally {
    await executable.close();
  }
}

function assertSymlinkTargetInsideRuntime(entryPath: string, target: string): void {
  if (
    target.length === 0 ||
    target.includes('\0') ||
    isAbsolute(target) ||
    Buffer.from(target, 'utf8').toString('utf8') !== target
  ) {
    fail(`Python runtime symlink ${entryPath} has an invalid target.`);
  }
  const resolvedTarget = posix.normalize(posix.join(posix.dirname(entryPath), target));
  if (resolvedTarget !== 'python' && !resolvedTarget.startsWith('python/')) {
    fail(`Python runtime symlink ${entryPath} escapes the authorized root.`);
  }
}

export function verifyPythonRuntimeInventoryProbe(
  rawOutput: string,
  runtimeParentPath: string = '/opt/missionpulse-python'
): CollectedPythonRuntimeInventory {
  if (
    rawOutput.length === 0 ||
    Buffer.byteLength(rawOutput, 'utf8') > MAX_INVENTORY_OUTPUT_BYTES ||
    rawOutput.includes('\0')
  ) {
    fail('Python runtime inventory probe output is missing or unbounded.');
  }
  if (
    !isAbsolute(runtimeParentPath) ||
    normalize(runtimeParentPath) !== runtimeParentPath ||
    resolve(runtimeParentPath) !== runtimeParentPath ||
    runtimeParentPath.includes('\0')
  ) {
    fail('Python runtime parent must be one canonical absolute path.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawOutput);
  } catch (error) {
    fail('Python runtime inventory probe output is not strict JSON.', error);
  }
  if (!isPlainRecord(parsed)) {
    fail('Python runtime inventory probe output is not a detached object.');
  }
  assertExactKeys(parsed, ['schema', 'version', 'entries'], 'pythonRuntimeInventoryProbe');
  if (
    parsed.schema !== 'missionpulse.python-runtime-inventory-probe' ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.entries) ||
    parsed.entries.length === 0 ||
    parsed.entries.length > MAX_ENTRIES
  ) {
    fail('Python runtime inventory probe header is invalid.');
  }

  const entries: PythonRuntimeInventoryEntry[] = [];
  let previousPath: string | null = null;
  let fileCount = 0;
  let directoryCount = 0;
  let symlinkCount = 0;
  let regularFileBytes = 0;
  for (const [index, rawEntry] of parsed.entries.entries()) {
    if (!Array.isArray(rawEntry) || rawEntry.length !== 5) {
      fail(`Python runtime inventory entry ${index} has an unexpected shape.`);
    }
    const [entryPath, kind, mode, bytes, content] = rawEntry;
    if (
      typeof entryPath !== 'string' ||
      entryPath.includes('\0') ||
      entryPath.includes('\\') ||
      posix.normalize(entryPath) !== entryPath ||
      (entryPath !== 'python' && !entryPath.startsWith('python/')) ||
      typeof mode !== 'string' ||
      !Number.isSafeInteger(bytes) ||
      Number(bytes) < 0 ||
      Number(bytes) > MAX_FILE_BYTES ||
      typeof content !== 'string' ||
      content.includes('\0')
    ) {
      fail(`Python runtime inventory entry ${index} is malformed.`);
    }
    if (previousPath !== null && compareUnsignedUtf8(previousPath, entryPath) >= 0) {
      fail('Python runtime inventory entries are not unique and canonically ordered.');
    }
    previousPath = entryPath;
    if (kind === 'd') {
      if (
        !/^[0-7]{4}$/.test(mode) ||
        (Number.parseInt(mode, 8) & 0o222) !== 0 ||
        bytes !== 0 ||
        content !== ''
      ) {
        fail(`Python runtime directory entry ${index} is malformed.`);
      }
      directoryCount += 1;
    } else if (kind === 'f') {
      if (
        !/^[0-7]{4}$/.test(mode) ||
        (Number.parseInt(mode, 8) & 0o222) !== 0 ||
        typeof content !== 'string' ||
        !SHA256.test(content)
      ) {
        fail(`Python runtime file entry ${index} is malformed.`);
      }
      fileCount += 1;
      regularFileBytes += Number(bytes);
      if (!Number.isSafeInteger(regularFileBytes)) {
        fail('Python runtime inventory byte total exceeds the safe-integer bound.');
      }
    } else if (kind === 'l') {
      if (mode !== 'link' || bytes !== Buffer.byteLength(content, 'utf8')) {
        fail(`Python runtime symlink entry ${index} is malformed.`);
      }
      assertSymlinkTargetInsideRuntime(entryPath, content);
      symlinkCount += 1;
    } else {
      fail(`Python runtime inventory entry ${index} has a forbidden type.`);
    }
    entries.push(Object.freeze([entryPath, kind, mode, Number(bytes), content]));
  }
  const executable = entries.find(
    (entry) => entry[0] === 'python/bin/python3.14' && entry[1] === 'f'
  );
  if (!executable) {
    fail('Python runtime executable is absent from helper inventory.');
  }
  const treeSha256 = createHash('sha256')
    .update(JSON.stringify(['missionpulse-python-runtime-tree', 1, entries]))
    .digest('hex');
  return Object.freeze({
    absoluteParent: runtimeParentPath,
    absoluteRuntimeRoot: join(runtimeParentPath, 'python'),
    proof: Object.freeze({
      entryCount: entries.length,
      fileCount,
      directoryCount,
      symlinkCount,
      regularFileBytes,
      treeSha256,
      executableSha256: executable[4],
    }),
    entries: Object.freeze(entries),
  });
}

async function runPythonRuntimeInventoryProbe(
  executable: AttestedPythonExecutable
): Promise<CollectedPythonRuntimeInventory> {
  const invocation = createIsolatedPythonInvocation(PYTHON_RUNTIME_INVENTORY_PROBE_SOURCE);
  let result: Awaited<ReturnType<typeof execFile>>;
  try {
    result = await execFile(executable.executionPath, [...invocation.args], {
      cwd: '/tmp',
      env: { ...invocation.env },
      encoding: 'utf8',
      timeout: 20_000,
      maxBuffer: MAX_INVENTORY_OUTPUT_BYTES,
      windowsHide: true,
    });
  } catch (error) {
    fail('Descriptor-relative Python runtime inventory probe failed.', error);
  }
  if (typeof result.stdout !== 'string' || result.stderr !== '') {
    fail('Descriptor-relative Python runtime inventory probe returned ambiguous output.');
  }
  return verifyPythonRuntimeInventoryProbe(result.stdout);
}

export async function collectPythonRuntimeInventory(
  runtimeParentPath: string
): Promise<CollectedPythonRuntimeInventory> {
  if (
    !isAbsolute(runtimeParentPath) ||
    normalize(runtimeParentPath) !== runtimeParentPath ||
    resolve(runtimeParentPath) !== runtimeParentPath ||
    runtimeParentPath.includes('\0')
  ) {
    fail('Python runtime parent must be one canonical absolute path.');
  }

  const runtimeRoot = join(runtimeParentPath, 'python');
  const entries: PythonRuntimeInventoryEntry[] = [];
  const regularInodes = new Set<string>();
  let fileCount = 0;
  let directoryCount = 0;
  let symlinkCount = 0;
  let regularFileBytes = 0;

  async function scan(path: string, includeSelf = true): Promise<void> {
    if (entries.length >= MAX_ENTRIES) {
      fail('Python runtime inventory exceeds its entry bound.');
    }
    const stats = await lstat(path, { bigint: true });
    const entryPath = canonicalRelativePath(runtimeParentPath, path);

    if (stats.isDirectory()) {
      const mode = canonicalMode(stats);
      if (includeSelf) {
        entries.push([entryPath, 'd', mode, 0, '']);
        directoryCount += 1;
      }
      const children = await readdir(path, { encoding: 'utf8' });
      children.sort(compareUnsignedUtf8);
      for (const child of children) {
        if (
          child.length === 0 ||
          child === '.' ||
          child === '..' ||
          child.includes('/') ||
          child.includes('\\') ||
          Buffer.from(child, 'utf8').toString('utf8') !== child
        ) {
          fail('Python runtime contains an invalid directory entry name.');
        }
        await scan(join(path, child));
      }
      return;
    }

    if (stats.isFile()) {
      const mode = canonicalMode(stats);
      const inodeKey = `${stats.dev.toString(10)}:${stats.ino.toString(10)}`;
      if (regularInodes.has(inodeKey)) {
        fail('Python runtime contains a hard-link alias.');
      }
      regularInodes.add(inodeKey);
      const captured = await readBoundedRegularFile(path);
      if (!sameIdentity(stats, captured.stats)) {
        fail(`${entryPath} changed between traversal and capture.`);
      }
      const digest = createHash('sha256').update(captured.bytes).digest('hex');
      entries.push([entryPath, 'f', mode, captured.bytes.byteLength, digest]);
      fileCount += 1;
      regularFileBytes += captured.bytes.byteLength;
      if (!Number.isSafeInteger(regularFileBytes)) {
        fail('Python runtime byte total exceeds the safe-integer bound.');
      }
      return;
    }

    if (stats.isSymbolicLink()) {
      const target = await readlink(path, { encoding: 'utf8' });
      assertSymlinkTargetInsideRuntime(entryPath, target);
      entries.push([entryPath, 'l', 'link', Buffer.byteLength(target, 'utf8'), target]);
      symlinkCount += 1;
      return;
    }

    fail(`Python runtime entry ${entryPath} has a forbidden type.`);
  }

  await scan(runtimeRoot, false);
  entries.sort((left, right) => compareUnsignedUtf8(left[0], right[0]));
  const executable = entries.find(
    (entry) => entry[0] === 'python/bin/python3.14' && entry[1] === 'f'
  );
  if (!executable) {
    fail('Python runtime executable is missing or is not a regular file.');
  }
  const treeSha256 = createHash('sha256')
    .update(JSON.stringify(['missionpulse-python-runtime-tree', 1, entries]))
    .digest('hex');

  return Object.freeze({
    absoluteParent: runtimeParentPath,
    absoluteRuntimeRoot: runtimeRoot,
    proof: Object.freeze({
      entryCount: entries.length,
      fileCount,
      directoryCount,
      symlinkCount,
      regularFileBytes,
      treeSha256,
      executableSha256: executable[4],
    }),
    entries: Object.freeze(entries),
  });
}

export async function verifyEffectiveLoadedObjectProbe(
  rawOutput: string,
  runtimeInventory: CollectedPythonRuntimeInventory,
  rawExecutionImageAuthority: unknown
): Promise<EffectiveLoadedObjectsProof> {
  const executionImageAuthority = assertVerifiedExecutionImageAuthority(rawExecutionImageAuthority);
  if (
    rawOutput.length === 0 ||
    Buffer.byteLength(rawOutput, 'utf8') > MAX_LOADED_OBJECT_OUTPUT_BYTES ||
    rawOutput.includes('\0')
  ) {
    fail('Effective-loaded-object probe output is missing or unbounded.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawOutput);
  } catch (error) {
    fail('Effective-loaded-object probe output is not strict JSON.', error);
  }
  if (!isPlainRecord(parsed)) {
    fail('Effective-loaded-object probe output is not a detached object.');
  }
  assertExactKeys(parsed, ['schema', 'version', 'entries'], 'loadedObjectProbe');
  if (
    parsed.schema !== 'missionpulse.effective-loaded-objects-probe' ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.entries) ||
    parsed.entries.length === 0 ||
    parsed.entries.length > MAX_LOADED_OBJECTS
  ) {
    fail('Effective-loaded-object probe header is invalid.');
  }

  const runtimeFiles = new Map(
    runtimeInventory.entries
      .filter((entry) => entry[1] === 'f')
      .map((entry) => [join(runtimeInventory.absoluteParent, entry[0]), entry] as const)
  );
  const baseImageObjects = new Map(
    executionImageAuthority.baseImageObjects.map((entry) => [entry.path, entry] as const)
  );
  const verified: EffectiveLoadedObjectEntry[] = [];
  let previousPath: string | null = null;

  for (const [index, rawEntry] of parsed.entries.entries()) {
    if (!isPlainRecord(rawEntry)) {
      fail(`Effective-loaded-object probe entry ${index} is not detached.`);
    }
    assertExactKeys(rawEntry, ['path', 'bytes', 'sha256'], `loadedObjectProbe.entries[${index}]`);
    if (
      typeof rawEntry.path !== 'string' ||
      !isAbsolute(rawEntry.path) ||
      normalize(rawEntry.path) !== rawEntry.path ||
      rawEntry.path.includes('\0') ||
      !Number.isSafeInteger(rawEntry.bytes) ||
      Number(rawEntry.bytes) <= 0 ||
      Number(rawEntry.bytes) > MAX_FILE_BYTES ||
      typeof rawEntry.sha256 !== 'string' ||
      !SHA256.test(rawEntry.sha256)
    ) {
      fail(`Effective-loaded-object probe entry ${index} is malformed.`);
    }
    if (previousPath !== null && compareUnsignedUtf8(previousPath, rawEntry.path) >= 0) {
      fail('Effective-loaded-object probe entries are not unique and ordered.');
    }
    previousPath = rawEntry.path;

    const captured = await readBoundedRegularFile(rawEntry.path);
    const digest = createHash('sha256').update(captured.bytes).digest('hex');
    if (captured.bytes.byteLength !== rawEntry.bytes || digest !== rawEntry.sha256) {
      fail(`Effective-loaded-object ${rawEntry.path} changed after the child probe.`);
    }
    const runtimeEntry = runtimeFiles.get(rawEntry.path);
    if (
      runtimeEntry &&
      (runtimeEntry[3] !== captured.bytes.byteLength || runtimeEntry[4] !== digest)
    ) {
      fail(`Effective-loaded-object ${rawEntry.path} differs from the runtime inventory.`);
    }
    const baseImageEntry = baseImageObjects.get(rawEntry.path);
    if (
      runtimeEntry === undefined &&
      (baseImageEntry === undefined ||
        baseImageEntry.bytes !== captured.bytes.byteLength ||
        baseImageEntry.sha256 !== digest)
    ) {
      fail(`Effective-loaded-object ${rawEntry.path} is absent from image authority.`);
    }
    verified.push({
      path: rawEntry.path,
      source: runtimeEntry ? 'python-runtime' : 'base-image',
      bytes: captured.bytes.byteLength,
      sha256: digest,
    });
  }

  const objectsSha256 = createHash('sha256')
    .update(JSON.stringify(['missionpulse-effective-loaded-objects', 1, verified]))
    .digest('hex');
  return Object.freeze({
    schema: 'missionpulse.effective-loaded-objects',
    version: 1,
    entries: Object.freeze(verified),
    objectsSha256,
  });
}
