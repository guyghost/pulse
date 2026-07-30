import { createHash } from 'node:crypto';
import { posix } from 'node:path';

import {
  RELEASE_CONTROLLER_ENVIRONMENT,
  RELEASE_RUNTIME_CONTRACT,
  assertSha256,
  type ExecutionImageGraphAuthority,
} from './contract';

const MAX_MOUNT_INFO_BYTES = 262_144;
const MAX_EFFECTIVE_LOADED_OBJECTS = 8_192;
const MAX_OBJECT_BYTES = 536_870_912;
const MAX_OCI_LAYERS = 128;
const capabilityBrand = Symbol('missionpulse.release-runtime-capability');

export class ReleaseRuntimeAuthorizationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ReleaseRuntimeAuthorizationError';
  }
}

export interface PythonRuntimeInventoryProof {
  readonly entryCount: number;
  readonly fileCount: number;
  readonly directoryCount: number;
  readonly symlinkCount: number;
  readonly regularFileBytes: number;
  readonly treeSha256: string;
  readonly executableSha256: string;
}

export interface RuntimeMutationAttempts {
  readonly create: 'blocked' | 'succeeded';
  readonly rename: 'blocked' | 'succeeded';
  readonly unlink: 'blocked' | 'succeeded';
  readonly chmod: 'blocked' | 'succeeded';
  readonly sameSizeWrite: 'blocked' | 'succeeded';
}

export interface EffectiveLoadedObjectEntry {
  readonly path: string;
  readonly source: 'python-runtime' | 'base-image';
  readonly bytes: number;
  readonly sha256: string;
}

export interface EffectiveLoadedObjectsProof {
  readonly schema: 'missionpulse.effective-loaded-objects';
  readonly version: 1;
  readonly entries: readonly EffectiveLoadedObjectEntry[];
  readonly objectsSha256: string;
}

export interface VerifiedBaseImageObjectEntry {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface VerifiedExecutionImageAuthorityV1 extends ExecutionImageGraphAuthority {
  readonly finalRootInventorySha256: string;
  readonly baseImageObjects: readonly VerifiedBaseImageObjectEntry[];
  readonly baseImageObjectsSha256: string;
}

export interface ReleaseRuntimeObservation {
  readonly platform: string;
  readonly architecture: string;
  readonly uid: number;
  readonly gid: number;
  readonly noNewPrivileges: boolean;
  readonly effectiveCapabilitiesHex: string;
  readonly ambientEnvironment: Readonly<Record<string, string>>;
  readonly mountInfo: string;
  readonly beforeMutationInventory: PythonRuntimeInventoryProof;
  readonly mutationAttempts: RuntimeMutationAttempts;
  readonly afterMutationInventory: PythonRuntimeInventoryProof;
  readonly loadedObjects: EffectiveLoadedObjectsProof;
}

export interface ReleaseRuntimePreludeObservation {
  readonly platform: string;
  readonly architecture: string;
  readonly uid: number;
  readonly gid: number;
  readonly noNewPrivileges: boolean;
  readonly effectiveCapabilitiesHex: string;
  readonly ambientEnvironment: Readonly<Record<string, string>>;
  readonly mountInfo: string;
  readonly beforeMutationInventory: PythonRuntimeInventoryProof;
}

export interface ReleaseRuntimeCapability {
  readonly platform: 'linux/amd64';
  readonly executionImageIndexSha256: string;
  readonly executionImageManifestSha256: string;
  readonly executionImageConfigSha256: string;
  readonly executionImageLayerSha256: readonly string[];
  readonly executionImageDiffIdSha256: readonly string[];
  readonly finalRootInventorySha256: string;
  readonly baseImageObjectsSha256: string;
  readonly pythonRuntimeTreeSha256: string;
  readonly pythonExecutableSha256: string;
  readonly effectiveLoadedObjectsSha256: string;
  readonly [capabilityBrand]: true;
}

interface MountInfoEntry {
  readonly mountPoint: string;
  readonly mountOptions: ReadonlySet<string>;
  readonly fsType: string;
  readonly source: string;
  readonly superOptions: ReadonlySet<string>;
}

function fail(message: string, cause?: unknown): never {
  throw new ReleaseRuntimeAuthorizationError(message, cause === undefined ? undefined : { cause });
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

function decodeMountField(value: string): string {
  return value.replace(/\\(040|011|012|134)/g, (_match, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8))
  );
}

function parseMountInfo(raw: string): readonly MountInfoEntry[] {
  if (
    raw.length === 0 ||
    Buffer.byteLength(raw, 'utf8') > MAX_MOUNT_INFO_BYTES ||
    raw.includes('\0')
  ) {
    fail('/proc/self/mountinfo is missing or unbounded.');
  }

  const body = raw.endsWith('\n') ? raw.slice(0, -1) : raw;
  if (body.length === 0 || body.endsWith('\n') || body.includes('\n\n')) {
    fail('/proc/self/mountinfo contains an ambiguous empty record.');
  }

  const entries = body.split('\n').map((line) => {
    const separator = line.indexOf(' - ');
    if (separator <= 0 || line.indexOf(' - ', separator + 3) !== -1) {
      fail('/proc/self/mountinfo contains a malformed record.');
    }
    const left = line.slice(0, separator).split(' ');
    const right = line.slice(separator + 3).split(' ');
    if (left.length < 6 || right.length < 3) {
      fail('/proc/self/mountinfo contains a truncated record.');
    }
    const mountPoint = decodeMountField(left[4]);
    if (!mountPoint.startsWith('/') || posix.normalize(mountPoint) !== mountPoint) {
      fail('/proc/self/mountinfo contains a non-canonical mount point.');
    }
    return Object.freeze({
      mountPoint,
      mountOptions: new Set(left[5].split(',')),
      fsType: right[0],
      source: decodeMountField(right[1]),
      superOptions: new Set(right[2].split(',')),
    });
  });

  return Object.freeze(entries);
}

function tmpfsSizeBytes(options: ReadonlySet<string>, path: string): number {
  const sizeOptions = [...options].filter((option) => option.startsWith('size='));
  if (sizeOptions.length !== 1) {
    fail(`${path} does not declare one bounded tmpfs size.`);
  }
  const match = /^size=([1-9]\d*)([kKmMgG]?)$/.exec(sizeOptions[0]);
  if (!match) {
    fail(`${path} declares a malformed tmpfs size.`);
  }
  const multiplier =
    match[2].toLowerCase() === 'k'
      ? 1_024
      : match[2].toLowerCase() === 'm'
        ? 1_048_576
        : match[2].toLowerCase() === 'g'
          ? 1_073_741_824
          : 1;
  const bytes = Number(match[1]) * multiplier;
  if (!Number.isSafeInteger(bytes)) {
    fail(`${path} tmpfs size exceeds the safe-integer bound.`);
  }
  return bytes;
}

function assertBoundedControllerTmpfs(entries: readonly MountInfoEntry[], path: string): void {
  assertMountMode(entries, path, 'rw', true);
  const mount = effectiveMount(entries, path);
  if (mount.fsType !== 'tmpfs' || mount.source !== 'tmpfs') {
    fail(`${path} is not backed by a fresh tmpfs.`);
  }
  if (tmpfsSizeBytes(mount.superOptions, path) !== 67_108_864) {
    fail(`${path} does not have the exact bounded tmpfs size.`);
  }
  for (const expected of ['mode=700', 'uid=65532', 'gid=65532']) {
    if (!mount.superOptions.has(expected)) {
      fail(`${path} is not owned by the fixed controller identity.`);
    }
  }
}

function mountCoversPath(mountPoint: string, path: string): boolean {
  return mountPoint === '/' || path === mountPoint || path.startsWith(`${mountPoint}/`);
}

function effectiveMount(entries: readonly MountInfoEntry[], path: string): MountInfoEntry {
  const matching = entries
    .filter((entry) => mountCoversPath(entry.mountPoint, path))
    .sort((left, right) => right.mountPoint.length - left.mountPoint.length);
  if (matching.length === 0) {
    fail(`No mount authority covers ${path}.`);
  }
  if (matching.length > 1 && matching[0].mountPoint.length === matching[1].mountPoint.length) {
    fail(`Ambiguous mount authority covers ${path}.`);
  }
  return matching[0];
}

function assertMountMode(
  entries: readonly MountInfoEntry[],
  path: string,
  expected: 'ro' | 'rw',
  exactMount: boolean
): void {
  const mount = effectiveMount(entries, path);
  if (exactMount && mount.mountPoint !== path) {
    fail(`${path} is not an explicit mount.`);
  }
  if (
    !mount.mountOptions.has(expected) ||
    mount.mountOptions.has(expected === 'ro' ? 'rw' : 'ro')
  ) {
    fail(`${path} is not mounted ${expected}.`);
  }
  if (expected === 'rw') {
    for (const option of ['nosuid', 'nodev', 'noexec']) {
      if (!mount.mountOptions.has(option)) {
        fail(`${path} lacks the ${option} mount restriction.`);
      }
    }
  }
}

function assertMountPolicy(raw: string): void {
  const entries = parseMountInfo(raw);
  assertMountMode(entries, '/', 'ro', true);
  assertMountMode(entries, RELEASE_RUNTIME_CONTRACT.python.rootPath, 'ro', false);
  assertMountMode(entries, RELEASE_RUNTIME_CONTRACT.candidatePath, 'ro', true);
  assertMountMode(entries, RELEASE_RUNTIME_CONTRACT.controllerPath, 'ro', true);
  assertMountMode(entries, RELEASE_RUNTIME_CONTRACT.evidencePath, 'ro', true);
  assertBoundedControllerTmpfs(entries, RELEASE_RUNTIME_CONTRACT.outputPath);
  assertBoundedControllerTmpfs(entries, '/tmp');

  const runtimeRoot = RELEASE_RUNTIME_CONTRACT.python.rootPath;
  if (
    entries.some(
      (entry) =>
        entry.mountPoint.startsWith(`${runtimeRoot}/`) &&
        (entry.mountOptions.has('rw') || entry.superOptions.has('rw'))
    )
  ) {
    fail('A writable submount shadows part of the content-authorized Python runtime.');
  }

  for (const forbidden of ['/var/run/docker.sock', '/run/docker.sock']) {
    if (entries.some((entry) => entry.mountPoint === forbidden)) {
      fail('The host container runtime is mounted into the release image.');
    }
  }
}

function assertSafeInteger(value: unknown, expected: number, label: string): void {
  if (!Number.isSafeInteger(value) || value !== expected) {
    fail(`${label} does not match the content-authorized runtime.`);
  }
}

function assertInventory(value: unknown, label: string): PythonRuntimeInventoryProof {
  if (!isPlainRecord(value)) {
    fail(`${label} is not a detached inventory proof.`);
  }
  assertExactKeys(
    value,
    [
      'entryCount',
      'fileCount',
      'directoryCount',
      'symlinkCount',
      'regularFileBytes',
      'treeSha256',
      'executableSha256',
    ],
    label
  );
  const python = RELEASE_RUNTIME_CONTRACT.python;
  assertSafeInteger(value.entryCount, python.runtimeEntryCount, `${label}.entryCount`);
  assertSafeInteger(value.fileCount, python.runtimeFileCount, `${label}.fileCount`);
  assertSafeInteger(value.directoryCount, python.runtimeDirectoryCount, `${label}.directoryCount`);
  assertSafeInteger(value.symlinkCount, python.runtimeSymlinkCount, `${label}.symlinkCount`);
  assertSafeInteger(value.regularFileBytes, python.runtimeBytes, `${label}.regularFileBytes`);
  if (
    value.treeSha256 !== python.runtimeTreeSha256 ||
    value.executableSha256 !== python.executableSha256
  ) {
    fail(`${label} digest does not match the content-authorized runtime.`);
  }
  return value as unknown as PythonRuntimeInventoryProof;
}

function compareUnsignedUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function assertOciDigestArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_OCI_LAYERS) {
    fail(`${label} is not one bounded non-empty digest array.`);
  }
  const result = value.map((entry, index) => {
    if (typeof entry !== 'string') {
      fail(`${label}[${index}] is not a SHA-256 digest.`);
    }
    try {
      assertSha256(entry, `${label}[${index}]`);
    } catch (error) {
      fail(`${label}[${index}] is malformed.`, error);
    }
    return entry;
  });
  return Object.freeze(result);
}

export function assertVerifiedExecutionImageAuthority(
  value: unknown
): VerifiedExecutionImageAuthorityV1 {
  if (!isPlainRecord(value)) {
    fail('Verified execution-image authority is not a detached object.');
  }
  assertExactKeys(
    value,
    [
      'schema',
      'version',
      'platform',
      'indexSha256',
      'manifestSha256',
      'configSha256',
      'layerSha256',
      'diffIdSha256',
      'finalRootInventorySha256',
      'baseImageObjects',
      'baseImageObjectsSha256',
    ],
    'executionImageAuthority'
  );
  if (
    value.schema !== 'missionpulse.verified-execution-image-authority' ||
    value.version !== 1 ||
    value.platform !== RELEASE_RUNTIME_CONTRACT.platform ||
    !Array.isArray(value.baseImageObjects) ||
    value.baseImageObjects.length > MAX_EFFECTIVE_LOADED_OBJECTS ||
    typeof value.indexSha256 !== 'string' ||
    typeof value.manifestSha256 !== 'string' ||
    typeof value.configSha256 !== 'string' ||
    typeof value.finalRootInventorySha256 !== 'string' ||
    typeof value.baseImageObjectsSha256 !== 'string'
  ) {
    fail('Verified execution-image authority header is invalid.');
  }
  try {
    assertSha256(value.indexSha256, 'executionImageAuthority.indexSha256');
    assertSha256(value.manifestSha256, 'executionImageAuthority.manifestSha256');
    assertSha256(value.configSha256, 'executionImageAuthority.configSha256');
    assertSha256(
      value.finalRootInventorySha256,
      'executionImageAuthority.finalRootInventorySha256'
    );
    assertSha256(value.baseImageObjectsSha256, 'executionImageAuthority.baseImageObjectsSha256');
  } catch (error) {
    fail('Verified execution-image authority digest is malformed.', error);
  }
  if (
    value.indexSha256 === value.manifestSha256 ||
    value.indexSha256 === value.configSha256 ||
    value.manifestSha256 === value.configSha256
  ) {
    fail('Verified execution-image authority does not bind three distinct OCI objects.');
  }
  const layerSha256 = assertOciDigestArray(
    value.layerSha256,
    'executionImageAuthority.layerSha256'
  );
  const diffIdSha256 = assertOciDigestArray(
    value.diffIdSha256,
    'executionImageAuthority.diffIdSha256'
  );
  if (layerSha256.length !== diffIdSha256.length) {
    fail('Verified execution-image layer and diff-ID graphs differ in length.');
  }

  let previousPath: string | null = null;
  const baseImageObjects: VerifiedBaseImageObjectEntry[] = [];
  for (const [index, entry] of value.baseImageObjects.entries()) {
    if (!isPlainRecord(entry)) {
      fail(`Verified base-image object ${index} is not detached.`);
    }
    assertExactKeys(entry, ['path', 'bytes', 'sha256'], `baseImageObjects[${index}]`);
    if (
      typeof entry.path !== 'string' ||
      !entry.path.startsWith('/') ||
      posix.normalize(entry.path) !== entry.path ||
      entry.path.includes('\0') ||
      entry.path.startsWith(`${RELEASE_RUNTIME_CONTRACT.python.rootPath}/`) ||
      !Number.isSafeInteger(entry.bytes) ||
      Number(entry.bytes) <= 0 ||
      Number(entry.bytes) > MAX_OBJECT_BYTES ||
      typeof entry.sha256 !== 'string'
    ) {
      fail(`Verified base-image object ${index} is malformed.`);
    }
    try {
      assertSha256(entry.sha256, `baseImageObjects[${index}].sha256`);
    } catch (error) {
      fail(`Verified base-image object ${index} digest is malformed.`, error);
    }
    if (previousPath !== null && compareUnsignedUtf8(previousPath, entry.path) >= 0) {
      fail('Verified base-image objects are not unique and canonically ordered.');
    }
    previousPath = entry.path;
    baseImageObjects.push(
      Object.freeze({ path: entry.path, bytes: Number(entry.bytes), sha256: entry.sha256 })
    );
  }
  const expectedDigest = createHash('sha256')
    .update(JSON.stringify(['missionpulse-verified-base-image-objects', 1, baseImageObjects]))
    .digest('hex');
  if (value.baseImageObjectsSha256 !== expectedDigest) {
    fail('Verified base-image object inventory digest mismatch.');
  }
  return Object.freeze({
    schema: 'missionpulse.verified-execution-image-authority',
    version: 1,
    platform: RELEASE_RUNTIME_CONTRACT.platform,
    indexSha256: value.indexSha256,
    manifestSha256: value.manifestSha256,
    configSha256: value.configSha256,
    layerSha256,
    diffIdSha256,
    finalRootInventorySha256: value.finalRootInventorySha256,
    baseImageObjects: Object.freeze(baseImageObjects),
    baseImageObjectsSha256: value.baseImageObjectsSha256,
  });
}

function assertLoadedObjects(
  value: unknown,
  authority: VerifiedExecutionImageAuthorityV1
): EffectiveLoadedObjectsProof {
  if (!isPlainRecord(value)) {
    fail('Effective-loaded-object proof is not a detached object.');
  }
  assertExactKeys(value, ['schema', 'version', 'entries', 'objectsSha256'], 'loadedObjects');
  if (
    value.schema !== 'missionpulse.effective-loaded-objects' ||
    value.version !== 1 ||
    !Array.isArray(value.entries) ||
    value.entries.length === 0 ||
    value.entries.length > MAX_EFFECTIVE_LOADED_OBJECTS
  ) {
    fail('Effective-loaded-object proof header is invalid.');
  }

  const authorizedBaseObjects = new Map(
    authority.baseImageObjects.map((entry) => [entry.path, entry] as const)
  );
  let previousPath: string | null = null;
  for (const [index, rawEntry] of value.entries.entries()) {
    if (!isPlainRecord(rawEntry)) {
      fail(`Effective-loaded-object entry ${index} is not detached.`);
    }
    assertExactKeys(
      rawEntry,
      ['path', 'source', 'bytes', 'sha256'],
      `loadedObjects.entries[${index}]`
    );
    if (
      typeof rawEntry.path !== 'string' ||
      !rawEntry.path.startsWith('/') ||
      posix.normalize(rawEntry.path) !== rawEntry.path ||
      rawEntry.path.includes('\0') ||
      (rawEntry.source !== 'python-runtime' && rawEntry.source !== 'base-image') ||
      !Number.isSafeInteger(rawEntry.bytes) ||
      Number(rawEntry.bytes) <= 0 ||
      Number(rawEntry.bytes) > MAX_OBJECT_BYTES ||
      typeof rawEntry.sha256 !== 'string'
    ) {
      fail(`Effective-loaded-object entry ${index} is malformed.`);
    }
    try {
      assertSha256(rawEntry.sha256, `loadedObjects.entries[${index}].sha256`);
    } catch (error) {
      fail(`Effective-loaded-object entry ${index} digest is malformed.`, error);
    }
    const insidePythonRuntime = rawEntry.path.startsWith(
      `${RELEASE_RUNTIME_CONTRACT.python.rootPath}/`
    );
    if (
      (rawEntry.source === 'python-runtime' && !insidePythonRuntime) ||
      (rawEntry.source === 'base-image' && insidePythonRuntime)
    ) {
      fail(`Effective-loaded-object entry ${index} has the wrong content authority.`);
    }
    if (!insidePythonRuntime) {
      const authorized = authorizedBaseObjects.get(rawEntry.path);
      if (
        authorized === undefined ||
        authorized.bytes !== rawEntry.bytes ||
        authorized.sha256 !== rawEntry.sha256
      ) {
        fail(`Effective-loaded-object entry ${index} is absent from image authority.`);
      }
    }
    if (previousPath !== null && compareUnsignedUtf8(previousPath, rawEntry.path) >= 0) {
      fail('Effective-loaded-object entries are not unique and canonically ordered.');
    }
    previousPath = rawEntry.path;
  }

  if (typeof value.objectsSha256 !== 'string') {
    fail('Effective-loaded-object digest is missing.');
  }
  const expectedDigest = createHash('sha256')
    .update(JSON.stringify(['missionpulse-effective-loaded-objects', 1, value.entries]))
    .digest('hex');
  if (value.objectsSha256 !== expectedDigest) {
    fail('Effective-loaded-object digest mismatch.');
  }
  return value as unknown as EffectiveLoadedObjectsProof;
}

function assertExactControllerEnvironment(environment: unknown): void {
  if (!isPlainRecord(environment)) {
    fail('Runtime environment is not a detached string map.');
  }
  assertExactKeys(environment, Object.keys(RELEASE_CONTROLLER_ENVIRONMENT), 'runtimeEnvironment');
  for (const [key, value] of Object.entries(environment)) {
    if (
      typeof value !== 'string' ||
      key.includes('\0') ||
      value.includes('\0') ||
      value !== RELEASE_CONTROLLER_ENVIRONMENT[key as keyof typeof RELEASE_CONTROLLER_ENVIRONMENT]
    ) {
      fail('Runtime environment contains a malformed entry.');
    }
  }
}

export function assertReleaseRuntimePrelude(raw: unknown): PythonRuntimeInventoryProof {
  if (!isPlainRecord(raw)) {
    fail('Release runtime prelude is not a detached object.');
  }
  assertExactKeys(
    raw,
    [
      'platform',
      'architecture',
      'uid',
      'gid',
      'noNewPrivileges',
      'effectiveCapabilitiesHex',
      'ambientEnvironment',
      'mountInfo',
      'beforeMutationInventory',
    ],
    'runtimePrelude'
  );
  if (raw.platform !== 'linux' || raw.architecture !== 'x64') {
    fail('Release execution is supported only on linux/amd64.');
  }
  if (raw.uid !== RELEASE_RUNTIME_CONTRACT.uid || raw.gid !== RELEASE_RUNTIME_CONTRACT.gid) {
    fail('Release execution must run as the fixed non-root identity.');
  }
  if (raw.noNewPrivileges !== true || raw.effectiveCapabilitiesHex !== '0000000000000000') {
    fail('Release execution retains privileges or Linux capabilities.');
  }
  assertExactControllerEnvironment(raw.ambientEnvironment);
  if (typeof raw.mountInfo !== 'string') {
    fail('/proc/self/mountinfo is unavailable.');
  }
  assertMountPolicy(raw.mountInfo);
  return assertInventory(raw.beforeMutationInventory, 'beforeMutationInventory');
}

export function authorizeReleaseRuntimeObservation(
  raw: unknown,
  executionImageAuthority: unknown
): ReleaseRuntimeCapability {
  const authority = assertVerifiedExecutionImageAuthority(executionImageAuthority);
  if (!isPlainRecord(raw)) {
    fail('Release runtime observation is not a detached object.');
  }
  assertExactKeys(
    raw,
    [
      'platform',
      'architecture',
      'uid',
      'gid',
      'noNewPrivileges',
      'effectiveCapabilitiesHex',
      'ambientEnvironment',
      'mountInfo',
      'beforeMutationInventory',
      'mutationAttempts',
      'afterMutationInventory',
      'loadedObjects',
    ],
    'runtimeObservation'
  );
  const before = assertReleaseRuntimePrelude({
    platform: raw.platform,
    architecture: raw.architecture,
    uid: raw.uid,
    gid: raw.gid,
    noNewPrivileges: raw.noNewPrivileges,
    effectiveCapabilitiesHex: raw.effectiveCapabilitiesHex,
    ambientEnvironment: raw.ambientEnvironment,
    mountInfo: raw.mountInfo,
    beforeMutationInventory: raw.beforeMutationInventory,
  });

  if (!isPlainRecord(raw.mutationAttempts)) {
    fail('Runtime mutation attempts are missing.');
  }
  assertExactKeys(
    raw.mutationAttempts,
    ['create', 'rename', 'unlink', 'chmod', 'sameSizeWrite'],
    'mutationAttempts'
  );
  if (Object.values(raw.mutationAttempts).some((result) => result !== 'blocked')) {
    fail('The Python runtime accepted a write mutation.');
  }

  const after = assertInventory(raw.afterMutationInventory, 'afterMutationInventory');
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    fail('The Python runtime inventory changed during mutation probes.');
  }
  const loadedObjects = assertLoadedObjects(raw.loadedObjects, authority);

  return Object.freeze({
    platform: RELEASE_RUNTIME_CONTRACT.platform,
    executionImageIndexSha256: authority.indexSha256,
    executionImageManifestSha256: authority.manifestSha256,
    executionImageConfigSha256: authority.configSha256,
    executionImageLayerSha256: authority.layerSha256,
    executionImageDiffIdSha256: authority.diffIdSha256,
    finalRootInventorySha256: authority.finalRootInventorySha256,
    baseImageObjectsSha256: authority.baseImageObjectsSha256,
    pythonRuntimeTreeSha256: before.treeSha256,
    pythonExecutableSha256: before.executableSha256,
    effectiveLoadedObjectsSha256: loadedObjects.objectsSha256,
    [capabilityBrand]: true as const,
  });
}
