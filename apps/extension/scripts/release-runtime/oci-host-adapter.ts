import { ChildProcess, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import {
  RELEASE_RUNTIME_CONTRACT,
  ReleaseRuntimeContractError,
  assertSha256,
  prepareIsolatedDockerRun,
  type DockerRunCompletion,
  type ExecutionImageGraph,
  type LocalExecutionImageInspectionV1,
  type StartedDockerRun,
} from './contract';
import {
  assertReleaseControllerExecutionAuthority,
  assertReleaseRuntimeEvidence,
  type ReleaseControllerExecutionAuthorityV1,
  type ReleaseRuntimeEvidenceV1,
} from './controller';
import { captureBoundedRegularFile } from './secure-capture';
import { parseStrictJsonBytes } from './strict-json';

const MAX_OCI_ARCHIVE_BYTES = 536_870_912;
const MAX_OCI_OBJECTS = 8_192;
const MAX_OCI_LAYERS = 128;
const MAX_OCI_JSON_BYTES = 16_777_216;
const MAX_AUTHORITY_BYTES = 1_048_576;
const MAX_CONTROLLER_BUNDLE_BYTES = 16_777_216;
const MAX_DOCKER_OUTPUT_BYTES = 1_048_576;
const EXECUTION_REPOSITORY = 'missionpulse-release-runtime';
const EXECUTION_TAG = `${EXECUTION_REPOSITORY}:sealed-candidate`;
const EXECUTION_INDEX_NAME = 'docker.io/library/missionpulse-release-runtime:sealed-candidate';
const AUTHORITY_FILE_NAME = 'release-controller-execution-authority.json';
const OCI_INDEX_MEDIA_TYPE = 'application/vnd.oci.image.index.v1+json';
const OCI_MANIFEST_MEDIA_TYPE = 'application/vnd.oci.image.manifest.v1+json';
const OCI_CONFIG_MEDIA_TYPE = 'application/vnd.oci.image.config.v1+json';
const OCI_LAYER_MEDIA_TYPE = 'application/vnd.oci.image.layer.v1.tar+gzip';
const EXPECTED_IMAGE_ENVIRONMENT = Object.freeze([
  'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  'NODE_VERSION=22.23.1',
  'YARN_VERSION=1.22.22',
  'HOME=/nonexistent',
  'LANG=C',
  'LC_ALL=C',
  'TZ=UTC',
]);
const EXPECTED_IMAGE_ENTRYPOINT = Object.freeze([
  '/usr/bin/env',
  '-i',
  'HOME=/nonexistent',
  'LANG=C',
  'LC_ALL=C',
  'TZ=UTC',
  '/usr/local/bin/node',
  '/inputs/release-controller.bundle.mjs',
]);

export class DockerHostAdapterError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DockerHostAdapterError';
  }
}

export interface DockerStartRequest {
  readonly args: readonly string[];
  readonly stdin?: Buffer;
  readonly maxStdoutBytes: number;
  readonly maxStderrBytes: number;
}

export interface DockerStartedProcess {
  readonly child: ChildProcess;
  readonly completion: Promise<DockerRunCompletion>;
}

export interface DockerHostPort {
  readonly start: (request: DockerStartRequest) => DockerStartedProcess;
}

export interface VerifiedOciImageLayout extends ExecutionImageGraph {
  readonly archiveSha256: string;
  readonly archiveBytes: number;
  readonly manifestBytes: number;
}

interface ExecuteVerifiedOciRuntimeInput {
  readonly ociArchivePath: string;
  readonly expectedOciArchiveBytes: number;
  readonly expectedOciArchiveSha256: string;
  readonly frozenDistHostPath: string;
  readonly controllerBundleHostPath: string;
  readonly evidenceHostPath: string;
}

const verifiedTransportPayloadBrand: unique symbol = Symbol(
  'missionpulse.verified-transport-payload'
);
const releaseRuntimeHostAdmissionBrand: unique symbol = Symbol(
  'missionpulse.release-runtime-host-admission'
);

export interface VerifiedTransportPayloadCapabilityV1 {
  readonly [verifiedTransportPayloadBrand]: true;
}

export interface ReleaseRuntimeHostAdmissionCapabilityV1 {
  readonly [releaseRuntimeHostAdmissionBrand]: true;
}

interface VerifiedTransportPayloadRecordV1 {
  readonly executionInput: ExecuteVerifiedOciRuntimeInput;
}

interface ReleaseRuntimeHostAdmissionRecordV1 {
  readonly executionInput: ExecuteVerifiedOciRuntimeInput;
}

// Intentionally has no public issuer in this slice. Only the future real transport
// consumer may populate these module-private registries after full verification.
const verifiedTransportPayloads = new WeakSet<object>();
const verifiedTransportPayloadRecords = new WeakMap<object, VerifiedTransportPayloadRecordV1>();
const runtimeHostAdmissions = new WeakSet<object>();
const runtimeHostAdmissionRecords = new WeakMap<object, ReleaseRuntimeHostAdmissionRecordV1>();

interface TarEntry {
  readonly path: string;
  readonly type: 'file' | 'directory';
  readonly bytes: Buffer;
}

interface OciDescriptor {
  readonly digest: string;
  readonly size: number;
}

interface DockerInspectionProjection {
  readonly id: string;
  readonly repoTags: readonly string[];
  readonly repoDigests: readonly string[];
  readonly architecture: string;
  readonly os: string;
  readonly rootFs: {
    readonly type: string;
    readonly diffIds: readonly string[];
  };
  readonly descriptor: {
    readonly mediaType: string;
    readonly digest: string;
    readonly size: number;
    readonly annotations: Readonly<Record<string, unknown>>;
  };
}

const DOCKER_INSPECTION_FORMAT = [
  '{"schema":"missionpulse.docker-image-inspection","version":1',
  ',"id":{{json .Id}}',
  ',"repoTags":{{json .RepoTags}}',
  ',"repoDigests":{{json .RepoDigests}}',
  ',"architecture":{{json .Architecture}}',
  ',"os":{{json .Os}}',
  ',"rootFs":{"type":{{json .RootFS.Type}},"diffIds":{{json .RootFS.Layers}}}',
  ',"descriptor":{{json .Descriptor}}}',
].join('');

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
    throw new DockerHostAdapterError(`${label} has an unexpected shape.`);
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseTarString(header: Buffer, offset: number, length: number, label: string): string {
  const field = header.subarray(offset, offset + length);
  const terminator = field.indexOf(0);
  const bytes = terminator < 0 ? field : field.subarray(0, terminator);
  if (terminator >= 0 && field.subarray(terminator + 1).some((byte) => byte !== 0)) {
    throw new DockerHostAdapterError(`${label} has non-zero bytes after its terminator.`);
  }
  let value: string;
  try {
    value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new DockerHostAdapterError(`${label} is not strict UTF-8.`, { cause: error });
  }
  if (Buffer.from(value, 'utf8').compare(bytes) !== 0 || value.includes('\0')) {
    throw new DockerHostAdapterError(`${label} is not canonical UTF-8.`);
  }
  return value;
}

function parseTarOctal(header: Buffer, offset: number, length: number, label: string): number {
  const raw = header.subarray(offset, offset + length).toString('ascii');
  const stripped = raw.replace(/[\0 ]+$/g, '');
  if (!/^[0-7]+$/.test(stripped)) {
    throw new DockerHostAdapterError(`${label} is not strict tar octal.`);
  }
  const value = Number.parseInt(stripped, 8);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DockerHostAdapterError(`${label} exceeds its numeric bound.`);
  }
  return value;
}

function assertTarChecksum(header: Buffer): void {
  const expected = parseTarOctal(header, 148, 8, 'tar checksum');
  const copy = Buffer.from(header);
  copy.fill(0x20, 148, 156);
  const actual = copy.reduce((total, byte) => total + byte, 0);
  if (actual !== expected) {
    throw new DockerHostAdapterError('OCI tar header checksum mismatch.');
  }
}

function canonicalTarPath(raw: string, directory: boolean): string {
  const path = directory && raw.endsWith('/') ? raw.slice(0, -1) : raw;
  const segments = path.split('/');
  if (
    path.length === 0 ||
    Buffer.byteLength(path, 'utf8') > 65_535 ||
    path.startsWith('/') ||
    raw.includes('\\') ||
    raw.includes('\0') ||
    (!directory && raw.endsWith('/')) ||
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new DockerHostAdapterError('OCI tar contains an unsafe or non-canonical path.');
  }
  return directory ? `${path}/` : path;
}

function parseOciTar(archive: Buffer): ReadonlyMap<string, TarEntry> {
  if (archive.byteLength === 0 || archive.byteLength % 512 !== 0) {
    throw new DockerHostAdapterError('OCI tar does not have an exact 512-byte block boundary.');
  }
  const entries = new Map<string, TarEntry>();
  let offset = 0;
  let zeroBlocks = 0;
  while (offset + 512 <= archive.byteLength) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      zeroBlocks += 1;
      offset += 512;
      continue;
    }
    if (zeroBlocks > 0) {
      throw new DockerHostAdapterError('OCI tar contains data after its zero-block terminator.');
    }
    if (entries.size >= MAX_OCI_OBJECTS) {
      throw new DockerHostAdapterError('OCI tar contains too many objects.');
    }
    assertTarChecksum(header);
    const magic = header.subarray(257, 263);
    const version = header.subarray(263, 265);
    if (
      magic.compare(Buffer.from([0x75, 0x73, 0x74, 0x61, 0x72, 0x00])) !== 0 ||
      version.compare(Buffer.from('00', 'ascii')) !== 0
    ) {
      throw new DockerHostAdapterError('OCI tar is not one strict ustar archive.');
    }
    if (parseTarString(header, 345, 155, 'tar prefix') !== '') {
      throw new DockerHostAdapterError('OCI tar uses a forbidden prefix extension.');
    }
    const typeFlag = header[156];
    if (typeFlag !== 0 && typeFlag !== 0x30 && typeFlag !== 0x35) {
      throw new DockerHostAdapterError('OCI tar contains a link or special object.');
    }
    if (parseTarString(header, 157, 100, 'tar link target') !== '') {
      throw new DockerHostAdapterError('OCI tar contains an unexpected link target.');
    }
    const directory = typeFlag === 0x35;
    const path = canonicalTarPath(parseTarString(header, 0, 100, 'tar path'), directory);
    const size = parseTarOctal(header, 124, 12, 'tar entry size');
    if (directory && size !== 0) {
      throw new DockerHostAdapterError('OCI tar directory has a payload.');
    }
    const bodyOffset = offset + 512;
    const paddedSize = Math.ceil(size / 512) * 512;
    const nextOffset = bodyOffset + paddedSize;
    if (nextOffset > archive.byteLength) {
      throw new DockerHostAdapterError('OCI tar contains a truncated entry.');
    }
    if (archive.subarray(bodyOffset + size, nextOffset).some((byte) => byte !== 0)) {
      throw new DockerHostAdapterError('OCI tar contains non-zero entry padding.');
    }
    if (entries.has(path)) {
      throw new DockerHostAdapterError(`OCI tar repeats canonical path ${path}.`);
    }
    const bytes = directory ? Buffer.alloc(0) : archive.subarray(bodyOffset, bodyOffset + size);
    entries.set(path, Object.freeze({ path, type: directory ? 'directory' : 'file', bytes }));
    offset = nextOffset;
  }
  if (zeroBlocks < 2 || offset !== archive.byteLength) {
    throw new DockerHostAdapterError('OCI tar has an incomplete terminator.');
  }
  return entries;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw new DockerHostAdapterError(`${label} is not one detached JSON object.`);
  }
  return value;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new DockerHostAdapterError(`${label} is not one JSON array.`);
  }
  return value;
}

function assertExactStringArray(value: unknown, expected: readonly string[], label: string): void {
  const actual = requireArray(value, label);
  if (
    actual.length !== expected.length ||
    actual.some((entry, index) => typeof entry !== 'string' || entry !== expected[index])
  ) {
    throw new DockerHostAdapterError(`${label} differs from the reviewed image recipe.`);
  }
}

function requireDescriptor(value: unknown, label: string, mediaType: string): OciDescriptor {
  const descriptor = requireRecord(value, label);
  assertExactKeys(descriptor, ['mediaType', 'digest', 'size'], label);
  if (
    descriptor.mediaType !== mediaType ||
    typeof descriptor.digest !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(descriptor.digest) ||
    !Number.isSafeInteger(descriptor.size) ||
    (descriptor.size as number) <= 0 ||
    (descriptor.size as number) > MAX_OCI_ARCHIVE_BYTES
  ) {
    throw new DockerHostAdapterError(`${label} is not one bounded SHA-256 descriptor.`);
  }
  return Object.freeze({
    digest: descriptor.digest.slice('sha256:'.length),
    size: descriptor.size as number,
  });
}

function requiredFile(entries: ReadonlyMap<string, TarEntry>, path: string): Buffer {
  const entry = entries.get(path);
  if (!entry || entry.type !== 'file') {
    throw new DockerHostAdapterError(`OCI archive is missing regular file ${path}.`);
  }
  return entry.bytes;
}

function requiredBlob(entries: ReadonlyMap<string, TarEntry>, descriptor: OciDescriptor): Buffer {
  const bytes = requiredFile(entries, `blobs/sha256/${descriptor.digest}`);
  if (bytes.byteLength !== descriptor.size || sha256(bytes) !== descriptor.digest) {
    throw new DockerHostAdapterError(
      `OCI blob ${descriptor.digest} differs from its descriptor name or size.`
    );
  }
  return bytes;
}

function parseOciJson(bytes: Buffer, label: string): unknown {
  try {
    return parseStrictJsonBytes(bytes, label, MAX_OCI_JSON_BYTES);
  } catch (error) {
    throw new DockerHostAdapterError(`${label} is not strict unambiguous JSON.`, {
      cause: error,
    });
  }
}

function prefixedSha256Array(value: unknown, label: string): readonly string[] {
  const values = requireArray(value, label);
  if (values.length === 0 || values.length > MAX_OCI_LAYERS) {
    throw new DockerHostAdapterError(`${label} is empty or exceeds its layer bound.`);
  }
  return Object.freeze(
    values.map((entry, index) => {
      if (typeof entry !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(entry)) {
        throw new DockerHostAdapterError(`${label}[${index}] is not one SHA-256 digest.`);
      }
      return entry.slice('sha256:'.length);
    })
  );
}

export function verifyCapturedOciImageLayout(
  archive: Buffer,
  expectedArchiveSha256: string,
  expectedArchiveBytes: number
): VerifiedOciImageLayout {
  if (!Buffer.isBuffer(archive)) {
    throw new DockerHostAdapterError('Captured OCI archive is not one detached byte buffer.');
  }
  try {
    assertSha256(expectedArchiveSha256, 'expectedOciArchiveSha256');
  } catch (error) {
    throw new DockerHostAdapterError('Expected OCI archive digest is invalid.', { cause: error });
  }
  if (
    !Number.isSafeInteger(expectedArchiveBytes) ||
    expectedArchiveBytes <= 0 ||
    expectedArchiveBytes > MAX_OCI_ARCHIVE_BYTES ||
    archive.byteLength !== expectedArchiveBytes ||
    sha256(archive) !== expectedArchiveSha256
  ) {
    throw new DockerHostAdapterError('Captured OCI archive differs from its immutable reference.');
  }
  const entries = parseOciTar(archive);
  if (
    entries.get('blobs/')?.type !== 'directory' ||
    entries.get('blobs/sha256/')?.type !== 'directory'
  ) {
    throw new DockerHostAdapterError('OCI tar is missing its exact blob directories.');
  }
  const layoutBytes = requiredFile(entries, 'oci-layout');
  const layout = requireRecord(parseOciJson(layoutBytes, 'oci-layout'), 'oci-layout');
  assertExactKeys(layout, ['imageLayoutVersion'], 'oci-layout');
  if (layout.imageLayoutVersion !== '1.0.0') {
    throw new DockerHostAdapterError('OCI layout version is not exactly 1.0.0.');
  }

  const indexBytes = requiredFile(entries, 'index.json');
  const index = requireRecord(parseOciJson(indexBytes, 'OCI index'), 'OCI index');
  assertExactKeys(index, ['schemaVersion', 'mediaType', 'manifests'], 'OCI index');
  const manifests = requireArray(index.manifests, 'OCI index manifests');
  if (
    index.schemaVersion !== 2 ||
    index.mediaType !== OCI_INDEX_MEDIA_TYPE ||
    manifests.length !== 1
  ) {
    throw new DockerHostAdapterError(
      'OCI index must name exactly one OCI image manifest at schema version 2.'
    );
  }
  const selected = requireRecord(manifests[0], 'OCI selected manifest descriptor');
  assertExactKeys(
    selected,
    ['mediaType', 'digest', 'size', 'annotations', 'platform'],
    'OCI selected manifest descriptor'
  );
  const selectedDescriptor = requireDescriptor(
    {
      mediaType: selected.mediaType,
      digest: selected.digest,
      size: selected.size,
    },
    'OCI selected manifest descriptor',
    OCI_MANIFEST_MEDIA_TYPE
  );
  const annotations = requireRecord(selected.annotations, 'OCI load annotations');
  assertExactKeys(
    annotations,
    ['io.containerd.image.name', 'org.opencontainers.image.ref.name'],
    'OCI load annotations'
  );
  if (
    annotations['io.containerd.image.name'] !== EXECUTION_INDEX_NAME ||
    annotations['org.opencontainers.image.ref.name'] !== 'sealed-candidate'
  ) {
    throw new DockerHostAdapterError('OCI load annotations do not create the approved local tag.');
  }
  const platform = requireRecord(selected.platform, 'OCI selected platform');
  assertExactKeys(platform, ['architecture', 'os'], 'OCI selected platform');
  if (platform.architecture !== 'amd64' || platform.os !== 'linux') {
    throw new DockerHostAdapterError('OCI selected platform is not exactly linux/amd64.');
  }

  const manifestBytes = requiredBlob(entries, selectedDescriptor);
  const manifest = requireRecord(
    parseOciJson(manifestBytes, 'OCI image manifest'),
    'OCI image manifest'
  );
  assertExactKeys(
    manifest,
    ['schemaVersion', 'mediaType', 'config', 'layers'],
    'OCI image manifest'
  );
  if (manifest.schemaVersion !== 2 || manifest.mediaType !== OCI_MANIFEST_MEDIA_TYPE) {
    throw new DockerHostAdapterError('OCI image manifest header is invalid.');
  }
  const configDescriptor = requireDescriptor(
    manifest.config,
    'OCI config descriptor',
    OCI_CONFIG_MEDIA_TYPE
  );
  const rawLayers = requireArray(manifest.layers, 'OCI layer descriptors');
  if (rawLayers.length === 0 || rawLayers.length > MAX_OCI_LAYERS) {
    throw new DockerHostAdapterError('OCI layer graph is empty or exceeds its bound.');
  }
  const layerDescriptors = rawLayers.map((value, index) =>
    requireDescriptor(value, `OCI layer descriptor ${index}`, OCI_LAYER_MEDIA_TYPE)
  );
  const configBytes = requiredBlob(entries, configDescriptor);
  for (const descriptor of layerDescriptors) {
    requiredBlob(entries, descriptor);
  }
  const config = requireRecord(parseOciJson(configBytes, 'OCI image config'), 'OCI image config');
  const configKeys = Object.keys(config).sort();
  const allowedConfigKeys = ['architecture', 'config', 'created', 'history', 'os', 'rootfs'];
  if (
    configKeys.some((key) => !allowedConfigKeys.includes(key)) ||
    !['architecture', 'config', 'os', 'rootfs'].every((key) => configKeys.includes(key))
  ) {
    throw new DockerHostAdapterError('OCI image config has an unexpected top-level shape.');
  }
  if (config.architecture !== 'amd64' || config.os !== 'linux') {
    throw new DockerHostAdapterError('OCI image config is not exactly linux/amd64.');
  }
  const runtimeConfig = requireRecord(config.config, 'OCI runtime config');
  assertExactKeys(runtimeConfig, ['Env', 'Entrypoint', 'User', 'WorkingDir'], 'OCI runtime config');
  if (runtimeConfig.User !== '65532:65532' || runtimeConfig.WorkingDir !== '/outputs') {
    throw new DockerHostAdapterError('OCI runtime user or working directory is unauthorized.');
  }
  assertExactStringArray(
    runtimeConfig.Entrypoint,
    EXPECTED_IMAGE_ENTRYPOINT,
    'OCI runtime entrypoint'
  );
  assertExactStringArray(runtimeConfig.Env, EXPECTED_IMAGE_ENVIRONMENT, 'OCI runtime environment');
  const rootfs = requireRecord(config.rootfs, 'OCI config rootfs');
  assertExactKeys(rootfs, ['type', 'diff_ids'], 'OCI config rootfs');
  if (rootfs.type !== 'layers') {
    throw new DockerHostAdapterError('OCI image config rootfs is not a layer graph.');
  }
  const diffIdSha256 = prefixedSha256Array(rootfs.diff_ids, 'OCI config diff IDs');
  if (diffIdSha256.length !== layerDescriptors.length) {
    throw new DockerHostAdapterError('OCI layer and diff-ID graphs differ in length.');
  }

  const requiredPaths = new Set([
    'blobs/',
    'blobs/sha256/',
    'index.json',
    'oci-layout',
    `blobs/sha256/${selectedDescriptor.digest}`,
    `blobs/sha256/${configDescriptor.digest}`,
    ...layerDescriptors.map((descriptor) => `blobs/sha256/${descriptor.digest}`),
  ]);
  if (
    entries.size !== requiredPaths.size ||
    [...entries.keys()].some((path) => !requiredPaths.has(path))
  ) {
    throw new DockerHostAdapterError('OCI tar contains an unreferenced or extra object.');
  }

  return Object.freeze({
    archiveSha256: expectedArchiveSha256,
    archiveBytes: expectedArchiveBytes,
    platform: 'linux/amd64',
    indexSha256: sha256(indexBytes),
    manifestSha256: selectedDescriptor.digest,
    configSha256: configDescriptor.digest,
    layerSha256: Object.freeze(layerDescriptors.map((descriptor) => descriptor.digest)),
    diffIdSha256,
    manifestBytes: manifestBytes.byteLength,
  });
}

function assertSameGraph(
  expected: ExecutionImageGraph,
  actual: ExecutionImageGraph,
  label: string
): void {
  if (
    expected.platform !== actual.platform ||
    expected.indexSha256 !== actual.indexSha256 ||
    expected.manifestSha256 !== actual.manifestSha256 ||
    expected.configSha256 !== actual.configSha256 ||
    expected.layerSha256.length !== actual.layerSha256.length ||
    expected.layerSha256.some((digest, index) => digest !== actual.layerSha256[index]) ||
    expected.diffIdSha256.length !== actual.diffIdSha256.length ||
    expected.diffIdSha256.some((digest, index) => digest !== actual.diffIdSha256[index])
  ) {
    throw new DockerHostAdapterError(`${label} differs from the captured OCI descriptor graph.`);
  }
}

function assertStartedProcess(raw: unknown): DockerStartedProcess {
  if (!isPlainRecord(raw)) {
    throw new DockerHostAdapterError(
      'Docker port must synchronously return one started-process handle.'
    );
  }
  assertExactKeys(raw, ['child', 'completion'], 'Docker started-process handle');
  if (
    !(raw.child instanceof ChildProcess) ||
    !Number.isSafeInteger(raw.child.pid) ||
    (raw.child.pid ?? 0) <= 0 ||
    raw.child.exitCode !== null ||
    !(raw.completion instanceof Promise)
  ) {
    throw new DockerHostAdapterError(
      'Docker port did not synchronously return one live spawned Docker process.'
    );
  }
  return raw as unknown as DockerStartedProcess;
}

async function completedDockerProcess(
  docker: DockerHostPort,
  request: DockerStartRequest,
  label: string
): Promise<DockerRunCompletion> {
  const started = assertStartedProcess(docker.start(Object.freeze(request)));
  let result: DockerRunCompletion;
  try {
    result = await started.completion;
  } catch (error) {
    throw new DockerHostAdapterError(`${label} did not complete successfully.`, { cause: error });
  }
  if (
    !isPlainRecord(result) ||
    Object.keys(result).sort().join(',') !== 'exitCode,signal,stderr,stdout' ||
    !Number.isSafeInteger(result.exitCode) ||
    (result.signal !== null && typeof result.signal !== 'string') ||
    !Buffer.isBuffer(result.stdout) ||
    !Buffer.isBuffer(result.stderr) ||
    result.stdout.byteLength > request.maxStdoutBytes ||
    result.stderr.byteLength > request.maxStderrBytes
  ) {
    throw new DockerHostAdapterError(`${label} returned an invalid bounded process receipt.`);
  }
  if (result.exitCode !== 0 || result.signal !== null || result.stderr.byteLength !== 0) {
    throw new DockerHostAdapterError(`${label} failed or emitted unexpected diagnostics.`);
  }
  return result;
}

function dockerInspectionArgs(reference: string): readonly string[] {
  return Object.freeze([
    'image',
    'inspect',
    '--platform=linux/amd64',
    `--format=${DOCKER_INSPECTION_FORMAT}`,
    reference,
  ]);
}

function parseStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new DockerHostAdapterError(`${label} is not one exact string array.`);
  }
  return Object.freeze([...value] as string[]);
}

function parseDockerInspection(raw: Buffer): DockerInspectionProjection {
  const value = requireRecord(
    parseStrictJsonBytes(raw, 'Docker image inspection', MAX_DOCKER_OUTPUT_BYTES),
    'Docker image inspection'
  );
  assertExactKeys(
    value,
    [
      'schema',
      'version',
      'id',
      'repoTags',
      'repoDigests',
      'architecture',
      'os',
      'rootFs',
      'descriptor',
    ],
    'Docker image inspection'
  );
  if (
    value.schema !== 'missionpulse.docker-image-inspection' ||
    value.version !== 1 ||
    typeof value.id !== 'string' ||
    typeof value.architecture !== 'string' ||
    typeof value.os !== 'string'
  ) {
    throw new DockerHostAdapterError('Docker image inspection header is invalid.');
  }
  const rootFs = requireRecord(value.rootFs, 'Docker image rootfs');
  assertExactKeys(rootFs, ['type', 'diffIds'], 'Docker image rootfs');
  if (typeof rootFs.type !== 'string') {
    throw new DockerHostAdapterError('Docker image rootfs type is invalid.');
  }
  const descriptor = requireRecord(value.descriptor, 'Docker selected descriptor');
  assertExactKeys(
    descriptor,
    ['mediaType', 'digest', 'size', 'annotations'],
    'Docker selected descriptor'
  );
  if (
    typeof descriptor.mediaType !== 'string' ||
    typeof descriptor.digest !== 'string' ||
    !Number.isSafeInteger(descriptor.size)
  ) {
    throw new DockerHostAdapterError('Docker selected descriptor is invalid.');
  }
  return Object.freeze({
    id: value.id,
    repoTags: parseStringArray(value.repoTags, 'Docker RepoTags'),
    repoDigests: parseStringArray(value.repoDigests, 'Docker RepoDigests'),
    architecture: value.architecture,
    os: value.os,
    rootFs: Object.freeze({
      type: rootFs.type,
      diffIds: parseStringArray(rootFs.diffIds, 'Docker rootfs diff IDs'),
    }),
    descriptor: Object.freeze({
      mediaType: descriptor.mediaType,
      digest: descriptor.digest,
      size: descriptor.size as number,
      annotations: requireRecord(descriptor.annotations, 'Docker descriptor annotations'),
    }),
  });
}

function validateDockerInspection(
  inspection: DockerInspectionProjection,
  captured: VerifiedOciImageLayout
): LocalExecutionImageInspectionV1 {
  const manifestReference = `sha256:${captured.manifestSha256}`;
  const configReference = `sha256:${captured.configSha256}`;
  const repositoryDigest = `${EXECUTION_REPOSITORY}@${manifestReference}`;
  if (
    (inspection.id !== manifestReference && inspection.id !== configReference) ||
    inspection.repoTags.length !== 1 ||
    inspection.repoTags[0] !== EXECUTION_TAG ||
    inspection.repoDigests.length !== 1 ||
    inspection.repoDigests[0] !== repositoryDigest ||
    inspection.architecture !== 'amd64' ||
    inspection.os !== 'linux' ||
    inspection.rootFs.type !== 'layers' ||
    inspection.rootFs.diffIds.length !== captured.diffIdSha256.length ||
    inspection.rootFs.diffIds.some(
      (digest, index) => digest !== `sha256:${captured.diffIdSha256[index]}`
    ) ||
    inspection.descriptor.mediaType !== OCI_MANIFEST_MEDIA_TYPE ||
    inspection.descriptor.digest !== manifestReference ||
    inspection.descriptor.size !== captured.manifestBytes
  ) {
    throw new DockerHostAdapterError(
      'The local linux/amd64 image selection differs from the captured OCI graph.'
    );
  }
  assertExactKeys(
    inspection.descriptor.annotations as Record<string, unknown>,
    ['io.containerd.image.name', 'org.opencontainers.image.ref.name'],
    'Docker selected descriptor annotations'
  );
  if (
    inspection.descriptor.annotations['io.containerd.image.name'] !== EXECUTION_INDEX_NAME ||
    inspection.descriptor.annotations['org.opencontainers.image.ref.name'] !== 'sealed-candidate'
  ) {
    throw new DockerHostAdapterError(
      'Docker selected descriptor does not retain the approved load annotations.'
    );
  }
  return Object.freeze({
    schema: 'missionpulse.local-execution-image-inspection',
    version: 1,
    platform: 'linux/amd64',
    indexSha256: captured.indexSha256,
    manifestSha256: captured.manifestSha256,
    configSha256: captured.configSha256,
    layerSha256: captured.layerSha256,
    diffIdSha256: captured.diffIdSha256,
  });
}

async function inspectLocalImage(
  docker: DockerHostPort,
  reference: string,
  captured: VerifiedOciImageLayout
): Promise<LocalExecutionImageInspectionV1> {
  const receipt = await completedDockerProcess(
    docker,
    {
      args: dockerInspectionArgs(reference),
      maxStdoutBytes: MAX_DOCKER_OUTPUT_BYTES,
      maxStderrBytes: MAX_DOCKER_OUTPUT_BYTES,
    },
    'Docker image inspection'
  );
  return validateDockerInspection(parseDockerInspection(receipt.stdout), captured);
}

function assertEvidenceMatchesAuthority(
  evidence: ReleaseRuntimeEvidenceV1,
  authority: ReleaseControllerExecutionAuthorityV1,
  captured: VerifiedOciImageLayout
): void {
  const evidenceByPath = new Map(authority.evidenceInventory.map((entry) => [entry.path, entry]));
  const expected: ReadonlyArray<readonly [unknown, unknown]> = [
    [evidence.verificationId, authority.payload.verificationId],
    [evidence.releaseId, authority.payload.releaseId],
    [evidence.sealId, authority.payload.sealId],
    [evidence.sealSha256, authority.payload.sealSha256],
    [evidence.sourceCommit, authority.payload.sourceCommit],
    [evidence.transportSha256, authority.payload.transportSha256],
    [evidence.transportZipReceiptSha256, authority.payload.transportZipReceiptSha256],
    [evidence.payloadInventorySha256, authority.payload.payloadInventorySha256],
    [evidence.ociArchiveSha256, captured.archiveSha256],
    [evidence.ociIndexSha256, authority.executionImage.indexSha256],
    [evidence.ociManifestSha256, authority.executionImage.manifestSha256],
    [evidence.ociConfigSha256, authority.executionImage.configSha256],
    [evidence.layerSha256, authority.executionImage.layerSha256],
    [evidence.diffIdSha256, authority.executionImage.diffIdSha256],
    [evidence.finalRootInventorySha256, authority.executionImage.finalRootInventorySha256],
    [evidence.controllerBundleSha256, authority.controllerBundleSha256],
    [evidence.controllerBundleSourceInventorySha256, authority.controllerSourceInventorySha256],
    [evidence.buildMetadataSha256, evidenceByPath.get('build-metadata.json')?.sha256],
    [evidence.buildProvenanceSha256, evidenceByPath.get('build-provenance.json')?.sha256],
    [
      evidence.executionAuthoritySha256,
      evidenceByPath.get('release-execution-authority.json')?.sha256,
    ],
    [evidence.controllerExecutionAuthoritySha256, authority.authoritySha256],
    [evidence.effectiveLoadedObjectsSha256, authority.effectiveLoadedObjectsSha256],
    [evidence.pythonRuntimeTreeSha256, RELEASE_RUNTIME_CONTRACT.python.runtimeTreeSha256],
    [evidence.pythonExecutableSha256, RELEASE_RUNTIME_CONTRACT.python.executableSha256],
    [evidence.verifiedAt, authority.payload.verifiedAt],
  ];
  if (expected.some(([left, right]) => JSON.stringify(left) !== JSON.stringify(right))) {
    throw new DockerHostAdapterError(
      'Release runtime evidence differs from its captured execution authority.'
    );
  }
}

function assertLinuxX64Host(): void {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new DockerHostAdapterError(
      'Release OCI execution requires an admitted linux/x64 host before candidate access.'
    );
  }
}

function opaqueObjectIdentity(value: unknown): object | null {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
    return null;
  }
  return value as object;
}

export async function authorizeReleaseRuntimeHostAdmission(
  verifiedPayload: VerifiedTransportPayloadCapabilityV1
): Promise<ReleaseRuntimeHostAdmissionCapabilityV1> {
  assertLinuxX64Host();
  const identity = opaqueObjectIdentity(verifiedPayload);
  const record = identity === null ? undefined : verifiedTransportPayloadRecords.get(identity);
  if (identity === null || !verifiedTransportPayloads.has(identity) || record === undefined) {
    throw new DockerHostAdapterError(
      'Release runtime host admission requires one live verified transport capability.'
    );
  }

  verifiedTransportPayloads.delete(identity);
  verifiedTransportPayloadRecords.delete(identity);
  const admission = Object.freeze({
    [releaseRuntimeHostAdmissionBrand]: true as const,
  }) as ReleaseRuntimeHostAdmissionCapabilityV1;
  runtimeHostAdmissions.add(admission);
  runtimeHostAdmissionRecords.set(
    admission,
    Object.freeze({ executionInput: record.executionInput })
  );
  return admission;
}

export async function executeVerifiedOciRuntime(
  admission: ReleaseRuntimeHostAdmissionCapabilityV1
): Promise<ReleaseRuntimeEvidenceV1> {
  assertLinuxX64Host();
  const identity = opaqueObjectIdentity(admission);
  const record = identity === null ? undefined : runtimeHostAdmissionRecords.get(identity);
  if (identity === null || !runtimeHostAdmissions.has(identity) || record === undefined) {
    throw new DockerHostAdapterError(
      'Release OCI execution requires one live runtime host-admission capability.'
    );
  }

  runtimeHostAdmissions.delete(identity);
  runtimeHostAdmissionRecords.delete(identity);
  return executeVerifiedOciRuntimeRecord(record.executionInput, createNodeDockerHostPort());
}

async function executeVerifiedOciRuntimeRecord(
  input: ExecuteVerifiedOciRuntimeInput,
  docker: DockerHostPort
): Promise<ReleaseRuntimeEvidenceV1> {
  if (!isPlainRecord(input)) {
    throw new DockerHostAdapterError('OCI host-adapter input is not a detached object.');
  }
  assertExactKeys(
    input as unknown as Record<string, unknown>,
    [
      'ociArchivePath',
      'expectedOciArchiveBytes',
      'expectedOciArchiveSha256',
      'frozenDistHostPath',
      'controllerBundleHostPath',
      'evidenceHostPath',
    ],
    'OCI host-adapter input'
  );
  if (
    typeof input.ociArchivePath !== 'string' ||
    typeof input.expectedOciArchiveSha256 !== 'string' ||
    typeof input.frozenDistHostPath !== 'string' ||
    typeof input.controllerBundleHostPath !== 'string' ||
    typeof input.evidenceHostPath !== 'string'
  ) {
    throw new DockerHostAdapterError('OCI host-adapter paths or digest are missing.');
  }
  const capturedArchive = await captureBoundedRegularFile(
    input.ociArchivePath,
    'release execution OCI archive',
    MAX_OCI_ARCHIVE_BYTES
  ).catch((error: unknown) => {
    throw new DockerHostAdapterError('Release execution OCI archive capture failed.', {
      cause: error,
    });
  });
  const captured = verifyCapturedOciImageLayout(
    capturedArchive.bytes,
    input.expectedOciArchiveSha256,
    input.expectedOciArchiveBytes
  );
  const authorityPath = join(input.evidenceHostPath, AUTHORITY_FILE_NAME);
  const capturedAuthority = await captureBoundedRegularFile(
    authorityPath,
    'release controller execution authority',
    MAX_AUTHORITY_BYTES
  ).catch((error: unknown) => {
    throw new DockerHostAdapterError('Release controller execution authority capture failed.', {
      cause: error,
    });
  });
  let authority: ReleaseControllerExecutionAuthorityV1;
  try {
    authority = assertReleaseControllerExecutionAuthority(
      parseStrictJsonBytes(
        capturedAuthority.bytes,
        'release controller execution authority',
        MAX_AUTHORITY_BYTES
      )
    );
  } catch (error) {
    throw new DockerHostAdapterError('Release controller execution authority is invalid.', {
      cause: error,
    });
  }
  assertSameGraph(authority.executionImage, captured, 'Execution authority image graph');
  if (authority.payload.ociArchiveSha256 !== captured.archiveSha256) {
    throw new DockerHostAdapterError('Payload authority names a different captured OCI archive.');
  }
  const controllerBundle = await captureBoundedRegularFile(
    input.controllerBundleHostPath,
    'release controller bundle',
    MAX_CONTROLLER_BUNDLE_BYTES
  ).catch((error: unknown) => {
    throw new DockerHostAdapterError('Release controller bundle capture failed.', { cause: error });
  });
  if (controllerBundle.sha256 !== authority.controllerBundleSha256) {
    throw new DockerHostAdapterError('Release controller bundle digest differs from authority.');
  }

  let runtimeEvidence: ReleaseRuntimeEvidenceV1 | null = null;
  let runClaimed = false;
  const prepared = await prepareIsolatedDockerRun({
    executionImageAuthority: authority.executionImage,
    invocationPolicySha256: authority.invocationPolicySha256,
    controllerBundleSha256: authority.controllerBundleSha256,
    candidateArtifactTree: authority.candidateArtifactTree,
    evidenceInventory: Object.freeze(
      [
        ...authority.evidenceInventory,
        Object.freeze({
          path: AUTHORITY_FILE_NAME,
          bytes: capturedAuthority.bytes.byteLength,
          sha256: capturedAuthority.sha256,
        }),
      ].sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)))
    ),
    inspectExecutionImage: async (request) => {
      const expectedReference = `${EXECUTION_REPOSITORY}@sha256:${captured.manifestSha256}`;
      if (
        request.reference !== expectedReference ||
        request.platform !== RELEASE_RUNTIME_CONTRACT.platform
      ) {
        throw new DockerHostAdapterError('Atomic Docker contract requested a different image.');
      }
      return inspectLocalImage(docker, request.reference, captured);
    },
    runDocker: (args): StartedDockerRun => {
      if (runClaimed) {
        throw new DockerHostAdapterError('Release Docker execution callback was replayed.');
      }
      runClaimed = true;
      const started = assertStartedProcess(
        docker.start(
          Object.freeze({
            args,
            maxStdoutBytes: MAX_DOCKER_OUTPUT_BYTES,
            maxStderrBytes: MAX_DOCKER_OUTPUT_BYTES,
          })
        )
      );
      return Object.freeze({
        child: started.child,
        completion: started.completion.then((result) => {
          if (
            !isPlainRecord(result) ||
            Object.keys(result).sort().join(',') !== 'exitCode,signal,stderr,stdout' ||
            result.exitCode !== 0 ||
            result.signal !== null ||
            !Buffer.isBuffer(result.stdout) ||
            !Buffer.isBuffer(result.stderr) ||
            result.stdout.byteLength > MAX_DOCKER_OUTPUT_BYTES ||
            result.stderr.byteLength !== 0
          ) {
            throw new DockerHostAdapterError(
              'Release Docker invocation failed or returned an invalid receipt.'
            );
          }
          try {
            const evidence = assertReleaseRuntimeEvidence(
              parseStrictJsonBytes(
                result.stdout,
                'release runtime evidence',
                MAX_DOCKER_OUTPUT_BYTES
              )
            );
            assertEvidenceMatchesAuthority(evidence, authority, captured);
            runtimeEvidence = evidence;
          } catch (error) {
            if (error instanceof DockerHostAdapterError) {
              throw error;
            }
            throw new DockerHostAdapterError('Release runtime evidence is invalid.', {
              cause: error,
            });
          }
        }),
      });
    },
    frozenDistHostPath: input.frozenDistHostPath,
    controllerBundleHostPath: input.controllerBundleHostPath,
    evidenceHostPath: input.evidenceHostPath,
  }).catch((error: unknown) => {
    if (error instanceof DockerHostAdapterError) {
      throw error;
    }
    throw new DockerHostAdapterError('Isolated Docker invocation preparation failed.', {
      cause: error,
    });
  });
  try {
    const loaded = await completedDockerProcess(
      docker,
      {
        args: Object.freeze(['load']),
        stdin: capturedArchive.bytes,
        maxStdoutBytes: MAX_DOCKER_OUTPUT_BYTES,
        maxStderrBytes: MAX_DOCKER_OUTPUT_BYTES,
      },
      'Docker OCI load'
    );
    if (loaded.stdout.toString('utf8') !== `Loaded image: ${EXECUTION_TAG}\n`) {
      throw new DockerHostAdapterError(
        'Docker load did not create exactly the approved sealed-candidate tag.'
      );
    }
    await inspectLocalImage(docker, EXECUTION_TAG, captured);
    await prepared.execute();
  } catch (error) {
    if (error instanceof DockerHostAdapterError) {
      throw error;
    }
    if (error instanceof ReleaseRuntimeContractError) {
      throw new DockerHostAdapterError('Atomic isolated Docker invocation was rejected.', {
        cause: error,
      });
    }
    throw new DockerHostAdapterError('Isolated release Docker invocation failed.', {
      cause: error,
    });
  } finally {
    await prepared.close();
  }
  if (runtimeEvidence === null) {
    throw new DockerHostAdapterError('Release Docker invocation emitted no runtime evidence.');
  }
  return runtimeEvidence;
}

function boundedCollector(
  stream: NodeJS.ReadableStream,
  maxBytes: number,
  onOverflow: () => void
): { readonly chunks: Buffer[]; readonly done: Promise<void> } {
  const chunks: Buffer[] = [];
  let total = 0;
  const done = new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.byteLength;
      if (total > maxBytes) {
        onOverflow();
        reject(new DockerHostAdapterError('Docker output exceeded its byte bound.'));
        return;
      }
      chunks.push(bytes);
    });
    stream.once('end', resolve);
    stream.once('error', reject);
  });
  return { chunks, done };
}

export function createNodeDockerHostPort(): DockerHostPort {
  return Object.freeze({
    start: (request: DockerStartRequest): DockerStartedProcess => {
      if (
        !isPlainRecord(request) ||
        !Array.isArray(request.args) ||
        request.args.length === 0 ||
        request.args.some((arg) => typeof arg !== 'string' || /[\0\r\n]/.test(arg)) ||
        !Number.isSafeInteger(request.maxStdoutBytes) ||
        !Number.isSafeInteger(request.maxStderrBytes) ||
        request.maxStdoutBytes <= 0 ||
        request.maxStderrBytes <= 0 ||
        (request.stdin !== undefined && !Buffer.isBuffer(request.stdin))
      ) {
        throw new DockerHostAdapterError('Docker start request is invalid.');
      }
      assertExactKeys(
        request as unknown as Record<string, unknown>,
        request.stdin === undefined
          ? ['args', 'maxStdoutBytes', 'maxStderrBytes']
          : ['args', 'stdin', 'maxStdoutBytes', 'maxStderrBytes'],
        'Docker start request'
      );
      const child = spawn('docker', [...request.args], {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          HOME: process.env.HOME ?? '/nonexistent',
          LANG: 'C',
          LC_ALL: 'C',
          PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
          TZ: 'UTC',
        },
      });
      const kill = (): void => {
        child.kill('SIGKILL');
      };
      const stdout = boundedCollector(child.stdout, request.maxStdoutBytes, kill);
      const stderr = boundedCollector(child.stderr, request.maxStderrBytes, kill);
      if (request.stdin === undefined) {
        child.stdin.end();
      } else {
        child.stdin.end(request.stdin);
      }
      const completion = new Promise<DockerRunCompletion>((resolve, reject) => {
        child.once('error', reject);
        child.stdin.once('error', reject);
        child.once('close', (exitCode, signal) => {
          Promise.all([stdout.done, stderr.done]).then(
            () =>
              resolve(
                Object.freeze({
                  exitCode: exitCode ?? -1,
                  signal,
                  stdout: Buffer.concat(stdout.chunks),
                  stderr: Buffer.concat(stderr.chunks),
                })
              ),
            reject
          );
        });
      });
      return Object.freeze({ child, completion });
    },
  });
}
