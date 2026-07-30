import { createHash } from 'node:crypto';
import { ChildProcess } from 'node:child_process';
import { constants as fsConstants, type BigIntStats } from 'node:fs';
import { open, readdir, realpath, type FileHandle } from 'node:fs/promises';
import { isAbsolute, normalize } from 'node:path';

const SHA256 = /^[a-f0-9]{64}$/;
const MAX_HELPER_BYTES = 262_144;
const MAX_OCI_LAYERS = 128;
const MAX_BASE_IMAGE_OBJECTS = 8_192;
const MAX_SNAPSHOT_ENTRIES = 40_032;
const MAX_SNAPSHOT_FILE_BYTES = 536_870_912;
const MAX_SNAPSHOT_TOTAL_BYTES = 1_073_741_824;
const MAX_SNAPSHOT_PATH_BYTES = 16_777_216;
const EXECUTION_IMAGE_REPOSITORY = 'missionpulse-release-runtime';

export class ReleaseRuntimeContractError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ReleaseRuntimeContractError';
  }
}

const nodeAuthority = Object.freeze({
  version: '22.23.1',
  manifestSha256: '8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27',
  image:
    'node:22.23.1-bookworm-slim@sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27',
});

const pythonAuthority = Object.freeze({
  version: '3.14.5',
  release: '20260510',
  archiveName: 'cpython-3.14.5+20260510-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz',
  archiveBytes: 35_955_046,
  archiveSha256: 'dc10977b0db3bef1ee2275107fde6fe9c148135b556fa352e83c6baa67d17ed6',
  runtimeEntryCount: 4_758,
  runtimeFileCount: 3_510,
  runtimeDirectoryCount: 201,
  runtimeSymlinkCount: 1_047,
  runtimeBytes: 100_940_658,
  runtimeTreeSha256: '82db8156fbb2fb988df9b609747e3e07b125133e702b55d076dd73419da10ba8',
  executableSha256: 'a1512f9a07029c4a9b02a1bb63bbd156d36b0dcb26f49cb7f5ee175f19b222da',
  rootPath: '/opt/missionpulse-python/python',
  executablePath: '/opt/missionpulse-python/python/bin/python3.14',
});

export const RELEASE_RUNTIME_CONTRACT = Object.freeze({
  platform: 'linux/amd64',
  node: nodeAuthority,
  python: pythonAuthority,
  controllerPath: '/inputs/release-controller.bundle.mjs',
  candidatePath: '/inputs/dist',
  evidencePath: '/inputs/evidence',
  outputPath: '/outputs',
  uid: 65_532,
  gid: 65_532,
});

export interface IsolatedDockerRunInput {
  readonly executionImageAuthority: ExecutionImageGraphAuthority;
  readonly inspectExecutionImage: (request: ExecutionImageInspectionRequest) => Promise<unknown>;
  readonly runDocker: (args: readonly string[]) => StartedDockerRun;
  readonly frozenDistHostPath: string;
  readonly controllerBundleHostPath: string;
  readonly evidenceHostPath: string;
  readonly invocationPolicySha256: string;
  readonly controllerBundleSha256: string;
  readonly candidateArtifactTree: CandidateArtifactTreeAuthority;
  readonly evidenceInventory: readonly AuthorizedMountFile[];
}

export interface DockerRunCompletion {
  readonly exitCode: number;
  readonly signal: string | null;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
}

export interface StartedDockerRun {
  readonly child: ChildProcess;
  readonly completion: Promise<void>;
}

export interface AuthorizedMountFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface CandidateArtifactTreeAuthority {
  readonly algorithm: 'missionpulse-tree-sha256-v2';
  readonly fileCount: number;
  readonly treeSha256: string;
  readonly manifestSha256: string;
  readonly entries: readonly (AuthorizedMountFile & { readonly mode: '0644' })[];
}

export interface ObservedReleasePayload {
  readonly candidateArtifactTree: CandidateArtifactTreeAuthority;
  readonly evidenceInventory: readonly AuthorizedMountFile[];
  readonly controllerBundleSha256: string;
}

export interface IsolatedDockerInvocationPolicyInput {
  readonly manifestSha256: string;
  readonly frozenDistHostPath: string;
  readonly controllerBundleHostPath: string;
  readonly evidenceHostPath: string;
}

export interface ExecutionImageGraph {
  readonly platform: 'linux/amd64';
  readonly indexSha256: string;
  readonly manifestSha256: string;
  readonly configSha256: string;
  readonly layerSha256: readonly string[];
  readonly diffIdSha256: readonly string[];
}

export interface ExecutionImageGraphAuthority extends ExecutionImageGraph {
  readonly schema: 'missionpulse.verified-execution-image-authority';
  readonly version: 1;
  readonly finalRootInventorySha256: string;
  readonly baseImageObjects: readonly unknown[];
  readonly baseImageObjectsSha256: string;
}

export interface ExecutionImageInspectionRequest {
  readonly reference: string;
  readonly platform: 'linux/amd64';
}

export interface LocalExecutionImageInspectionV1 extends ExecutionImageGraph {
  readonly schema: 'missionpulse.local-execution-image-inspection';
  readonly version: 1;
}

export interface PreparedIsolatedDockerRun {
  readonly effectiveInvocationPolicySha256: string;
  readonly execute: () => Promise<void>;
  readonly close: () => Promise<void>;
}

interface OpenedMountSource {
  readonly label: string;
  readonly path: string;
  readonly kind: 'directory' | 'file';
  readonly flags: number;
  readonly handle: FileHandle;
  readonly identity: BigIntStats;
}

interface SnapshotBudget {
  entries: number;
  fileBytes: number;
  pathBytes: number;
}

type SnapshotEntry = readonly [
  path: string,
  kind: 'd' | 'f',
  mode: string,
  bytes: number,
  sha256: string,
  dev: string,
  ino: string,
  mtimeNs: string,
  ctimeNs: string,
];

interface MountSourceSnapshot {
  readonly sha256: string;
  readonly entries: readonly SnapshotEntry[];
}

function assertMountSource(label: string, value: string): void {
  if (
    value.length === 0 ||
    value.length > 4_096 ||
    !isAbsolute(value) ||
    normalize(value) !== value ||
    /[\0\r\n,]/.test(value)
  ) {
    throw new ReleaseRuntimeContractError(`${label} must be one canonical absolute path.`);
  }

  if (
    value === '/var/run/docker.sock' ||
    value === '/run/docker.sock' ||
    value === '/var/lib/docker' ||
    value.startsWith('/var/lib/docker/')
  ) {
    throw new ReleaseRuntimeContractError(`${label} cannot expose the host container runtime.`);
  }
}

function sourcesOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
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

function assertDigestArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_OCI_LAYERS) {
    throw new ReleaseRuntimeContractError(`${label} must be one bounded non-empty digest array.`);
  }
  const digests = value.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new ReleaseRuntimeContractError(`${label}[${index}] must be one SHA-256 digest.`);
    }
    assertSha256(entry, `${label}[${index}]`);
    return entry;
  });
  return Object.freeze(digests);
}

function assertExecutionImageGraph(
  raw: unknown,
  label: string,
  inspectionHeader: boolean
): ExecutionImageGraph {
  if (!isPlainRecord(raw)) {
    throw new ReleaseRuntimeContractError(`${label} is not a detached object.`);
  }
  const graphKeys = [
    'platform',
    'indexSha256',
    'manifestSha256',
    'configSha256',
    'layerSha256',
    'diffIdSha256',
  ];
  if (inspectionHeader) {
    assertExactKeys(raw, ['schema', 'version', ...graphKeys], label);
  } else {
    assertExactKeys(
      raw,
      [
        'schema',
        'version',
        ...graphKeys,
        'finalRootInventorySha256',
        'baseImageObjects',
        'baseImageObjectsSha256',
      ],
      label
    );
  }
  if (
    (inspectionHeader
      ? raw.schema !== 'missionpulse.local-execution-image-inspection' || raw.version !== 1
      : raw.schema !== 'missionpulse.verified-execution-image-authority' || raw.version !== 1) ||
    raw.platform !== RELEASE_RUNTIME_CONTRACT.platform ||
    typeof raw.indexSha256 !== 'string' ||
    typeof raw.manifestSha256 !== 'string' ||
    typeof raw.configSha256 !== 'string'
  ) {
    throw new ReleaseRuntimeContractError(`${label} header is invalid.`);
  }
  assertSha256(raw.indexSha256, `${label}.indexSha256`);
  assertSha256(raw.manifestSha256, `${label}.manifestSha256`);
  assertSha256(raw.configSha256, `${label}.configSha256`);
  if (
    raw.indexSha256 === raw.manifestSha256 ||
    raw.indexSha256 === raw.configSha256 ||
    raw.manifestSha256 === raw.configSha256
  ) {
    throw new ReleaseRuntimeContractError(
      `${label} must bind distinct OCI index, manifest and config objects.`
    );
  }
  const layerSha256 = assertDigestArray(raw.layerSha256, `${label}.layerSha256`);
  const diffIdSha256 = assertDigestArray(raw.diffIdSha256, `${label}.diffIdSha256`);
  if (layerSha256.length !== diffIdSha256.length) {
    throw new ReleaseRuntimeContractError(`${label} layer and diff-ID graphs differ in length.`);
  }
  if (!inspectionHeader) {
    if (
      typeof raw.finalRootInventorySha256 !== 'string' ||
      typeof raw.baseImageObjectsSha256 !== 'string' ||
      !Array.isArray(raw.baseImageObjects) ||
      raw.baseImageObjects.length > MAX_BASE_IMAGE_OBJECTS
    ) {
      throw new ReleaseRuntimeContractError(`${label} existing image graph is invalid.`);
    }
    assertSha256(raw.finalRootInventorySha256, `${label}.finalRootInventorySha256`);
    assertSha256(raw.baseImageObjectsSha256, `${label}.baseImageObjectsSha256`);
  }
  return Object.freeze({
    platform: RELEASE_RUNTIME_CONTRACT.platform,
    indexSha256: raw.indexSha256,
    manifestSha256: raw.manifestSha256,
    configSha256: raw.configSha256,
    layerSha256,
    diffIdSha256,
  });
}

function assertSameExecutionImageGraph(
  expected: ExecutionImageGraph,
  actual: ExecutionImageGraph
): void {
  if (
    actual.platform !== expected.platform ||
    actual.indexSha256 !== expected.indexSha256 ||
    actual.manifestSha256 !== expected.manifestSha256 ||
    actual.configSha256 !== expected.configSha256 ||
    actual.layerSha256.length !== expected.layerSha256.length ||
    actual.layerSha256.some((digest, index) => digest !== expected.layerSha256[index]) ||
    actual.diffIdSha256.length !== expected.diffIdSha256.length ||
    actual.diffIdSha256.some((digest, index) => digest !== expected.diffIdSha256[index])
  ) {
    throw new ReleaseRuntimeContractError(
      'The re-inspected local image differs from the captured OCI execution authority.'
    );
  }
}

function executionImageReference(authority: ExecutionImageGraph): string {
  return `${EXECUTION_IMAGE_REPOSITORY}@sha256:${authority.manifestSha256}`;
}

function buildIsolatedDockerRunArgs(input: IsolatedDockerInvocationPolicyInput): readonly string[] {
  assertSha256(input.manifestSha256, 'manifestSha256');
  assertMountSource('frozenDistHostPath', input.frozenDistHostPath);
  assertMountSource('controllerBundleHostPath', input.controllerBundleHostPath);
  assertMountSource('evidenceHostPath', input.evidenceHostPath);
  const sources = [
    input.frozenDistHostPath,
    input.controllerBundleHostPath,
    input.evidenceHostPath,
  ];
  for (let left = 0; left < sources.length; left += 1) {
    for (let right = left + 1; right < sources.length; right += 1) {
      if (sourcesOverlap(sources[left], sources[right])) {
        throw new ReleaseRuntimeContractError(
          'Release bind sources must be pairwise disjoint to preserve read-only inputs.'
        );
      }
    }
  }

  return Object.freeze([
    'run',
    '--rm',
    '--pull=never',
    '--platform=linux/amd64',
    '--read-only',
    '--network=none',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true',
    '--user=65532:65532',
    '--pids-limit=64',
    '--mount',
    `type=bind,src=${input.frozenDistHostPath},dst=/inputs/dist,readonly`,
    '--mount',
    `type=bind,src=${input.controllerBundleHostPath},dst=/inputs/release-controller.bundle.mjs,readonly`,
    '--mount',
    `type=bind,src=${input.evidenceHostPath},dst=/inputs/evidence,readonly`,
    '--tmpfs',
    '/outputs:rw,noexec,nosuid,nodev,size=67108864,mode=0700,uid=65532,gid=65532',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,nodev,size=67108864,mode=0700,uid=65532,gid=65532',
    `${EXECUTION_IMAGE_REPOSITORY}@sha256:${input.manifestSha256}`,
  ]);
}

export function deriveIsolatedDockerInvocationPolicySha256(
  input: IsolatedDockerInvocationPolicyInput
): string {
  if (!isPlainRecord(input)) {
    throw new ReleaseRuntimeContractError(
      'Docker invocation policy input is not a detached object.'
    );
  }
  assertExactKeys(
    input as unknown as Record<string, unknown>,
    ['manifestSha256', 'frozenDistHostPath', 'controllerBundleHostPath', 'evidenceHostPath'],
    'Docker invocation policy input'
  );
  const args = buildIsolatedDockerRunArgs(input);
  return createHash('sha256')
    .update(JSON.stringify(['missionpulse-docker-invocation-policy', 1, 'docker', args]))
    .digest('hex');
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

async function openMountSource(
  label: string,
  path: string,
  kind: 'directory' | 'file'
): Promise<OpenedMountSource> {
  const flags =
    fsConstants.O_RDONLY |
    (fsConstants.O_NOFOLLOW ?? 0) |
    (kind === 'directory' ? (fsConstants.O_DIRECTORY ?? 0) : 0);
  let handle: FileHandle | undefined;
  try {
    const canonicalPath = await realpath(path);
    if (canonicalPath !== path) {
      throw new ReleaseRuntimeContractError(`${label} must already be its no-link real path.`);
    }
    handle = await open(path, flags);
    const identity = await handle.stat({ bigint: true });
    if (
      (kind === 'directory' && !identity.isDirectory()) ||
      (kind === 'file' && (!identity.isFile() || identity.size <= 0n))
    ) {
      throw new ReleaseRuntimeContractError(`${label} has the wrong host object type.`);
    }
    return Object.freeze({ label, path, kind, flags, handle, identity });
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (error instanceof ReleaseRuntimeContractError) {
      throw error;
    }
    throw new ReleaseRuntimeContractError(
      `${label} could not be opened as one canonical no-follow host object.`,
      { cause: error }
    );
  }
}

async function revalidateMountSource(source: OpenedMountSource): Promise<void> {
  try {
    const heldIdentity = await source.handle.stat({ bigint: true });
    if (
      !sameIdentity(source.identity, heldIdentity) ||
      (source.kind === 'directory' && !heldIdentity.isDirectory()) ||
      (source.kind === 'file' && !heldIdentity.isFile())
    ) {
      throw new ReleaseRuntimeContractError(`${source.label} changed after descriptor admission.`);
    }
  } catch (error) {
    if (error instanceof ReleaseRuntimeContractError) {
      throw error;
    }
    throw new ReleaseRuntimeContractError(
      `${source.label} could not be revalidated without following links.`,
      { cause: error }
    );
  }
}

function snapshotIdentityFields(stats: BigIntStats): readonly [string, string, string, string] {
  return [
    stats.dev.toString(10),
    stats.ino.toString(10),
    stats.mtimeNs.toString(10),
    stats.ctimeNs.toString(10),
  ];
}

function consumeSnapshotBudget(
  budget: SnapshotBudget,
  relativePath: string,
  fileBytes: number
): void {
  budget.entries += 1;
  budget.pathBytes += Buffer.byteLength(relativePath, 'utf8');
  budget.fileBytes += fileBytes;
  if (
    budget.entries > MAX_SNAPSHOT_ENTRIES ||
    budget.pathBytes > MAX_SNAPSHOT_PATH_BYTES ||
    budget.fileBytes > MAX_SNAPSHOT_TOTAL_BYTES
  ) {
    throw new ReleaseRuntimeContractError('A recursive mount snapshot exceeds its bound.');
  }
}

async function snapshotRegularFile(
  handle: FileHandle,
  relativePath: string
): Promise<SnapshotEntry> {
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size < 0n || before.size > BigInt(MAX_SNAPSHOT_FILE_BYTES)) {
      throw new ReleaseRuntimeContractError(
        `Recursive mount entry ${relativePath} is not one bounded regular file.`
      );
    }
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.byteLength) {
      const read = await handle.read({
        buffer: bytes,
        offset,
        length: bytes.byteLength - offset,
        position: offset,
      });
      if (read.bytesRead === 0) {
        break;
      }
      offset += read.bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (!sameIdentity(before, after) || offset !== bytes.byteLength) {
      throw new ReleaseRuntimeContractError(
        `Recursive mount entry ${relativePath} changed during snapshot.`
      );
    }
    return Object.freeze([
      relativePath,
      'f',
      (Number(before.mode & 0o7777n) >>> 0).toString(8).padStart(4, '0'),
      bytes.byteLength,
      createHash('sha256').update(bytes).digest('hex'),
      ...snapshotIdentityFields(before),
    ]);
  } catch (error) {
    if (error instanceof ReleaseRuntimeContractError) {
      throw error;
    }
    throw new ReleaseRuntimeContractError(
      `Recursive mount entry ${relativePath} could not be captured without following links.`,
      { cause: error }
    );
  }
}

function strictDirectoryEntryName(raw: Buffer): string {
  let name: string;
  try {
    name = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch (error) {
    throw new ReleaseRuntimeContractError('A recursive mount entry name is not strict UTF-8.', {
      cause: error,
    });
  }
  if (
    name.length === 0 ||
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('\0') ||
    Buffer.from(name, 'utf8').compare(raw) !== 0
  ) {
    throw new ReleaseRuntimeContractError('A recursive mount entry name is not canonical.');
  }
  return name;
}

function descriptorTraversalPath(handle: FileHandle, admittedPath: string): string {
  if (process.platform === 'linux') {
    return `/proc/self/fd/${handle.fd}`;
  }
  if (process.env.VITEST === 'true') {
    return admittedPath;
  }
  throw new ReleaseRuntimeContractError(
    'Descriptor-relative traversal requires the admitted Linux /proc capability.'
  );
}

async function snapshotDirectory(
  handle: FileHandle,
  admittedPath: string,
  relativePath: string,
  budget: SnapshotBudget,
  entries: SnapshotEntry[]
): Promise<void> {
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isDirectory()) {
      throw new ReleaseRuntimeContractError(
        `Recursive mount entry ${relativePath} is not a directory.`
      );
    }
    consumeSnapshotBudget(budget, relativePath, 0);
    entries.push(
      Object.freeze([
        relativePath,
        'd',
        (Number(before.mode & 0o7777n) >>> 0).toString(8).padStart(4, '0'),
        0,
        '',
        ...snapshotIdentityFields(before),
      ])
    );
    const descriptorPath = descriptorTraversalPath(handle, admittedPath);
    const children = await readdir(descriptorPath, { withFileTypes: true, encoding: 'buffer' });
    children.sort((left, right) => Buffer.compare(left.name, right.name));
    for (const child of children) {
      const name = strictDirectoryEntryName(child.name);
      const childRelativePath = relativePath.length === 0 ? name : `${relativePath}/${name}`;
      if (Buffer.byteLength(childRelativePath, 'utf8') > 65_535) {
        throw new ReleaseRuntimeContractError('A recursive mount path exceeds its bound.');
      }
      const childPath = `${descriptorPath}/${name}`;
      let childHandle: FileHandle | undefined;
      try {
        childHandle = await open(childPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
        const childStats = await childHandle.stat({ bigint: true });
        if (childStats.isDirectory()) {
          await snapshotDirectory(childHandle, childPath, childRelativePath, budget, entries);
        } else if (childStats.isFile()) {
          const entry = await snapshotRegularFile(childHandle, childRelativePath);
          consumeSnapshotBudget(budget, childRelativePath, entry[3]);
          entries.push(entry);
        } else {
          throw new ReleaseRuntimeContractError(
            `Recursive mount entry ${childRelativePath} is a link or special object.`
          );
        }
      } finally {
        await childHandle?.close().catch(() => undefined);
      }
    }
    const heldAfter = await handle.stat({ bigint: true });
    if (!sameIdentity(before, heldAfter)) {
      throw new ReleaseRuntimeContractError(
        `Recursive mount directory ${relativePath || '.'} changed during snapshot.`
      );
    }
  } catch (error) {
    if (error instanceof ReleaseRuntimeContractError) {
      throw error;
    }
    throw new ReleaseRuntimeContractError(
      `Recursive mount directory ${relativePath || '.'} could not be snapshotted safely.`,
      { cause: error }
    );
  }
}

async function snapshotMountSource(source: OpenedMountSource): Promise<MountSourceSnapshot> {
  await revalidateMountSource(source);
  const entries: SnapshotEntry[] = [];
  const budget: SnapshotBudget = { entries: 0, fileBytes: 0, pathBytes: 0 };
  if (source.kind === 'file') {
    const entry = await snapshotRegularFile(source.handle, '.');
    consumeSnapshotBudget(budget, '.', entry[3]);
    entries.push(entry);
  } else {
    await snapshotDirectory(source.handle, source.path, '', budget, entries);
  }
  await revalidateMountSource(source);
  return Object.freeze({
    entries: Object.freeze(entries),
    sha256: createHash('sha256')
      .update(JSON.stringify(['missionpulse-recursive-mount-snapshot', 1, entries]))
      .digest('hex'),
  });
}

function assertSameMountSnapshot(
  source: OpenedMountSource,
  before: MountSourceSnapshot,
  after: MountSourceSnapshot
): void {
  if (
    before.sha256 !== after.sha256 ||
    before.entries.length !== after.entries.length ||
    JSON.stringify(before.entries) !== JSON.stringify(after.entries)
  ) {
    throw new ReleaseRuntimeContractError(
      `${source.label} or one of its descendants changed during Docker inspection.`
    );
  }
}

function assertControllerBundleSnapshot(
  source: OpenedMountSource,
  snapshot: MountSourceSnapshot,
  expectedSha256: string
): void {
  if (
    source.kind !== 'file' ||
    snapshot.entries.length !== 1 ||
    snapshot.entries[0][0] !== '.' ||
    snapshot.entries[0][1] !== 'f' ||
    snapshot.entries[0][4] !== expectedSha256
  ) {
    throw new ReleaseRuntimeContractError(
      'The captured release controller bundle differs from execution authority.'
    );
  }
}

function snapshotFiles(snapshot: MountSourceSnapshot): readonly AuthorizedMountFile[] {
  return Object.freeze(
    snapshot.entries
      .filter((entry) => entry[1] === 'f')
      .map((entry) => Object.freeze({ path: entry[0], bytes: entry[3], sha256: entry[4] }))
      .sort((left, right) => compareUtf8(left.path, right.path))
  );
}

export function assertAuthorizedMountFile(raw: unknown, label: string): AuthorizedMountFile {
  if (!isPlainRecord(raw)) {
    throw new ReleaseRuntimeContractError(`${label} is not one file authority.`);
  }
  assertExactKeys(raw, ['path', 'bytes', 'sha256'], label);
  if (
    typeof raw.path !== 'string' ||
    raw.path.length === 0 ||
    raw.path.startsWith('/') ||
    raw.path.includes('\\') ||
    raw.path.includes('\0') ||
    raw.path
      .split('/')
      .some((segment) => segment.length === 0 || segment === '.' || segment === '..') ||
    !Number.isSafeInteger(raw.bytes) ||
    (raw.bytes as number) < 0 ||
    (raw.bytes as number) > MAX_SNAPSHOT_FILE_BYTES ||
    typeof raw.sha256 !== 'string'
  ) {
    throw new ReleaseRuntimeContractError(`${label} is not one bounded canonical file authority.`);
  }
  assertSha256(raw.sha256, `${label}.sha256`);
  return Object.freeze({ path: raw.path, bytes: raw.bytes as number, sha256: raw.sha256 });
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

export function assertCandidateArtifactTreeAuthority(raw: unknown): CandidateArtifactTreeAuthority {
  if (!isPlainRecord(raw)) {
    throw new ReleaseRuntimeContractError('Candidate artifact tree authority is not detached.');
  }
  assertExactKeys(
    raw,
    ['algorithm', 'fileCount', 'treeSha256', 'manifestSha256', 'entries'],
    'Candidate artifact tree authority'
  );
  if (
    raw.algorithm !== 'missionpulse-tree-sha256-v2' ||
    !Number.isSafeInteger(raw.fileCount) ||
    !Array.isArray(raw.entries) ||
    raw.fileCount !== raw.entries.length ||
    raw.entries.length === 0 ||
    raw.entries.length > MAX_SNAPSHOT_ENTRIES ||
    typeof raw.treeSha256 !== 'string' ||
    typeof raw.manifestSha256 !== 'string'
  ) {
    throw new ReleaseRuntimeContractError('Candidate artifact tree authority header is invalid.');
  }
  assertSha256(raw.treeSha256, 'candidateArtifactTree.treeSha256');
  assertSha256(raw.manifestSha256, 'candidateArtifactTree.manifestSha256');
  const entries = raw.entries.map((entry, index) => {
    if (!isPlainRecord(entry)) {
      throw new ReleaseRuntimeContractError(`candidateArtifactTree.entries[${index}] is invalid.`);
    }
    assertExactKeys(
      entry,
      ['path', 'bytes', 'sha256', 'mode'],
      `candidateArtifactTree.entries[${index}]`
    );
    if (entry.mode !== '0644') {
      throw new ReleaseRuntimeContractError('Candidate artifact modes must be exactly 0644.');
    }
    return Object.freeze({
      ...assertAuthorizedMountFile(
        { path: entry.path, bytes: entry.bytes, sha256: entry.sha256 },
        `candidateArtifactTree.entries[${index}]`
      ),
      mode: '0644' as const,
    });
  });
  if (
    entries.some(
      (entry, index) => index > 0 && compareUtf8(entries[index - 1].path, entry.path) >= 0
    )
  ) {
    throw new ReleaseRuntimeContractError(
      'Candidate artifact entries are not unique UTF-8 sorted.'
    );
  }
  const manifest = entries.find((entry) => entry.path === 'manifest.json');
  const framed = entries
    .map((entry) => `${entry.path}\0${String(entry.bytes)}\0${entry.sha256}\n`)
    .join('');
  if (
    manifest?.sha256 !== raw.manifestSha256 ||
    createHash('sha256').update(framed).digest('hex') !== raw.treeSha256
  ) {
    throw new ReleaseRuntimeContractError('Candidate artifact tree digest binding is invalid.');
  }
  return Object.freeze({
    algorithm: 'missionpulse-tree-sha256-v2',
    fileCount: entries.length,
    treeSha256: raw.treeSha256,
    manifestSha256: raw.manifestSha256,
    entries: Object.freeze(entries),
  });
}

function assertExactAuthorizedContent(
  label: string,
  actual: readonly AuthorizedMountFile[],
  expected: readonly AuthorizedMountFile[]
): void {
  if (
    actual.length !== expected.length ||
    actual.some(
      (entry, index) =>
        entry.path !== expected[index].path ||
        entry.bytes !== expected[index].bytes ||
        entry.sha256 !== expected[index].sha256
    )
  ) {
    throw new ReleaseRuntimeContractError(
      `${label} has a missing, extra, reordered or content-drifting file.`
    );
  }
}

export async function observeReleasePayloadFromDescriptors(input: {
  readonly candidatePath: string;
  readonly evidencePath: string;
  readonly controllerPath: string;
  readonly ignoredEvidencePath: string;
}): Promise<ObservedReleasePayload> {
  const sources: OpenedMountSource[] = [];
  try {
    sources.push(await openMountSource('candidatePath', input.candidatePath, 'directory'));
    sources.push(await openMountSource('evidencePath', input.evidencePath, 'directory'));
    sources.push(await openMountSource('controllerPath', input.controllerPath, 'file'));
    const [candidateSnapshot, evidenceSnapshot, controllerSnapshot] = await Promise.all(
      sources.map(snapshotMountSource)
    );
    const candidateFiles = snapshotFiles(candidateSnapshot);
    const entries = candidateFiles.map((entry) =>
      Object.freeze({ ...entry, mode: '0644' as const })
    );
    const manifest = entries.find((entry) => entry.path === 'manifest.json');
    if (manifest === undefined) {
      throw new ReleaseRuntimeContractError('Observed candidate is missing manifest.json.');
    }
    const framed = entries
      .map((entry) => `${entry.path}\0${String(entry.bytes)}\0${entry.sha256}\n`)
      .join('');
    const controllerFiles = snapshotFiles(controllerSnapshot);
    if (controllerFiles.length !== 1 || controllerFiles[0].path !== '.') {
      throw new ReleaseRuntimeContractError('Observed controller bundle is not one regular file.');
    }
    return Object.freeze({
      candidateArtifactTree: Object.freeze({
        algorithm: 'missionpulse-tree-sha256-v2',
        fileCount: entries.length,
        treeSha256: createHash('sha256').update(framed).digest('hex'),
        manifestSha256: manifest.sha256,
        entries: Object.freeze(entries),
      }),
      evidenceInventory: Object.freeze(
        snapshotFiles(evidenceSnapshot).filter((entry) => entry.path !== input.ignoredEvidencePath)
      ),
      controllerBundleSha256: controllerFiles[0].sha256,
    });
  } finally {
    await Promise.all(sources.map(async (source) => source.handle.close().catch(() => undefined)));
  }
}

function assertStartedDockerRun(raw: unknown): StartedDockerRun {
  if (!isPlainRecord(raw)) {
    throw new ReleaseRuntimeContractError(
      'Docker execution must synchronously return one started-process handle.'
    );
  }
  assertExactKeys(raw, ['child', 'completion'], 'Docker started-process handle');
  if (
    !(raw.child instanceof ChildProcess) ||
    !Number.isSafeInteger(raw.child.pid) ||
    (raw.child.pid ?? 0) <= 0 ||
    raw.child.exitCode !== null ||
    !(raw.completion instanceof Promise) ||
    typeof (raw.completion as Promise<unknown>).then !== 'function'
  ) {
    throw new ReleaseRuntimeContractError(
      'Docker execution did not synchronously return one live spawned-process handle.'
    );
  }
  return raw as unknown as StartedDockerRun;
}

export async function prepareIsolatedDockerRun(
  input: IsolatedDockerRunInput
): Promise<PreparedIsolatedDockerRun> {
  if (!isPlainRecord(input)) {
    throw new ReleaseRuntimeContractError('Docker invocation input is not a detached object.');
  }
  assertExactKeys(
    input as unknown as Record<string, unknown>,
    [
      'executionImageAuthority',
      'inspectExecutionImage',
      'runDocker',
      'frozenDistHostPath',
      'controllerBundleHostPath',
      'evidenceHostPath',
      'invocationPolicySha256',
      'controllerBundleSha256',
      'candidateArtifactTree',
      'evidenceInventory',
    ],
    'Docker invocation input'
  );
  if (typeof input.inspectExecutionImage !== 'function' || typeof input.runDocker !== 'function') {
    throw new ReleaseRuntimeContractError('Docker inspection or execution adapter is missing.');
  }
  const authority = assertExecutionImageGraph(
    input.executionImageAuthority,
    'executionImageAuthority',
    false
  );
  const inspectExecutionImage = input.inspectExecutionImage;
  const runDocker = input.runDocker;
  const reference = executionImageReference(authority);
  const authorizedInvocationInput = Object.freeze({
    manifestSha256: authority.manifestSha256,
    frozenDistHostPath: input.frozenDistHostPath,
    controllerBundleHostPath: input.controllerBundleHostPath,
    evidenceHostPath: input.evidenceHostPath,
  });
  if (typeof input.invocationPolicySha256 !== 'string') {
    throw new ReleaseRuntimeContractError('Docker invocation policy digest is missing.');
  }
  assertSha256(input.invocationPolicySha256, 'invocationPolicySha256');
  if (typeof input.controllerBundleSha256 !== 'string') {
    throw new ReleaseRuntimeContractError('Controller bundle digest is missing.');
  }
  assertSha256(input.controllerBundleSha256, 'controllerBundleSha256');
  if (
    deriveIsolatedDockerInvocationPolicySha256(authorizedInvocationInput) !==
    input.invocationPolicySha256
  ) {
    throw new ReleaseRuntimeContractError(
      'The effective Docker command differs from its authorized invocation policy.'
    );
  }
  const candidateArtifactTree = assertCandidateArtifactTreeAuthority(input.candidateArtifactTree);
  if (!Array.isArray(input.evidenceInventory)) {
    throw new ReleaseRuntimeContractError('Evidence inventory must be one file list.');
  }
  const evidenceInventory = Object.freeze(
    input.evidenceInventory.map((entry, index) =>
      assertAuthorizedMountFile(entry, `evidenceInventory[${index}]`)
    )
  );
  if (
    evidenceInventory.some(
      (entry, index) => index > 0 && compareUtf8(evidenceInventory[index - 1].path, entry.path) >= 0
    )
  ) {
    throw new ReleaseRuntimeContractError('Evidence inventory is not unique UTF-8 sorted.');
  }
  const sources: OpenedMountSource[] = [];
  try {
    sources.push(
      await openMountSource('frozenDistHostPath', input.frozenDistHostPath, 'directory')
    );
    sources.push(
      await openMountSource('controllerBundleHostPath', input.controllerBundleHostPath, 'file')
    );
    sources.push(await openMountSource('evidenceHostPath', input.evidenceHostPath, 'directory'));
  } catch (error) {
    await Promise.all(sources.map(async (source) => source.handle.close().catch(() => undefined)));
    throw error;
  }
  const descriptorInvocationInput = Object.freeze({
    manifestSha256: authority.manifestSha256,
    frozenDistHostPath: `/proc/${process.pid}/fd/${sources[0].handle.fd}`,
    controllerBundleHostPath: `/proc/${process.pid}/fd/${sources[1].handle.fd}`,
    evidenceHostPath: `/proc/${process.pid}/fd/${sources[2].handle.fd}`,
  });
  const args = buildIsolatedDockerRunArgs(descriptorInvocationInput);
  const effectiveInvocationPolicySha256 = createHash('sha256')
    .update(JSON.stringify(['missionpulse-docker-invocation-policy', 1, 'docker', args]))
    .digest('hex');
  let baselineSnapshots: readonly MountSourceSnapshot[];
  try {
    baselineSnapshots = Object.freeze(await Promise.all(sources.map(snapshotMountSource)));
    assertControllerBundleSnapshot(sources[1], baselineSnapshots[1], input.controllerBundleSha256);
    const candidateFiles = snapshotFiles(baselineSnapshots[0]);
    assertExactAuthorizedContent(
      'Frozen candidate artifact',
      candidateFiles,
      candidateArtifactTree.entries
    );
    assertExactAuthorizedContent(
      'Release evidence directory',
      snapshotFiles(baselineSnapshots[2]),
      evidenceInventory
    );
  } catch (error) {
    await Promise.all(sources.map(async (source) => source.handle.close().catch(() => undefined)));
    throw error;
  }

  let closed = false;
  let executionStarted = false;
  let closeRequested = false;
  let executionCompletion: Promise<void> | null = null;

  const closeSources = async (): Promise<void> => {
    if (closed) {
      return;
    }
    closed = true;
    await Promise.all(sources.map(async (source) => source.handle.close()));
  };

  const execute = (): Promise<void> => {
    if (closed || closeRequested || executionStarted) {
      return Promise.reject(
        new ReleaseRuntimeContractError(
          'The prepared Docker invocation is closed or has already been consumed.'
        )
      );
    }
    executionStarted = true;
    const operation = (async () => {
      try {
        let rawInspection: unknown;
        try {
          rawInspection = await inspectExecutionImage(
            Object.freeze({ reference, platform: RELEASE_RUNTIME_CONTRACT.platform })
          );
        } catch (error) {
          throw new ReleaseRuntimeContractError(
            'The local execution image could not be re-inspected before invocation.',
            { cause: error }
          );
        }
        const inspection = assertExecutionImageGraph(
          rawInspection,
          'localExecutionImageInspection',
          true
        );
        assertSameExecutionImageGraph(authority, inspection);
        const afterSnapshots = await Promise.all(sources.map(snapshotMountSource));
        for (let index = 0; index < sources.length; index += 1) {
          assertSameMountSnapshot(sources[index], baselineSnapshots[index], afterSnapshots[index]);
        }
        assertControllerBundleSnapshot(sources[1], afterSnapshots[1], input.controllerBundleSha256);
        assertExactAuthorizedContent(
          'Frozen candidate artifact',
          snapshotFiles(afterSnapshots[0]),
          candidateArtifactTree.entries
        );
        assertExactAuthorizedContent(
          'Release evidence directory',
          snapshotFiles(afterSnapshots[2]),
          evidenceInventory
        );
        if (closeRequested) {
          throw new ReleaseRuntimeContractError(
            'The prepared Docker invocation was closed during revalidation.'
          );
        }
        const started = assertStartedDockerRun(runDocker(args));
        await started.completion;
      } finally {
        await closeSources();
      }
    })();
    executionCompletion = operation;
    return operation;
  };

  return Object.freeze({
    effectiveInvocationPolicySha256,
    execute,
    close: async () => {
      if (closed) {
        return;
      }
      closeRequested = true;
      if (executionCompletion !== null) {
        await executionCompletion.catch(() => undefined);
        return;
      }
      await closeSources();
    },
  });
}

export const RELEASE_CONTROLLER_ENVIRONMENT = Object.freeze({
  HOME: '/nonexistent',
  LANG: 'C',
  LC_ALL: 'C',
  TZ: 'UTC',
});

export interface IsolatedPythonInvocation {
  readonly executable: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export function createIsolatedPythonInvocation(source: string): IsolatedPythonInvocation {
  const bytes = Buffer.byteLength(source, 'utf8');
  if (bytes === 0 || bytes > MAX_HELPER_BYTES || source.includes('\0')) {
    throw new ReleaseRuntimeContractError('Python helper source is not a bounded literal payload.');
  }

  return Object.freeze({
    executable: RELEASE_RUNTIME_CONTRACT.python.executablePath,
    args: Object.freeze(['-I', '-E', '-S', '-B', '-c', source]),
    env: RELEASE_CONTROLLER_ENVIRONMENT,
  });
}

export function assertSha256(value: string, label: string): void {
  if (!SHA256.test(value)) {
    throw new ReleaseRuntimeContractError(`${label} must be one lower-case SHA-256 digest.`);
  }
}
