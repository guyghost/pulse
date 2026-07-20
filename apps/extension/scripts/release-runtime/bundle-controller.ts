import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  writeFile,
  type FileHandle,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const MAX_BUNDLE_BYTES = 16_777_216;
const MAX_CONTROLLER_SOURCES = 256;
const execFile = promisify(execFileCallback);

export const CONTROLLER_SOURCE_ALLOWLIST = Object.freeze([
  'contract.ts',
  'controller-entry.ts',
  'controller.ts',
  'proof.ts',
  'runtime-probe.ts',
  'secure-capture.ts',
  'strict-json.ts',
] as const);

interface EsbuildMetafile {
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly outputs: Readonly<
    Record<
      string,
      {
        readonly imports: readonly { readonly path: string; readonly kind: string }[];
      }
    >
  >;
}

export class ReleaseControllerBundleError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ReleaseControllerBundleError';
  }
}

export interface ReleaseControllerSourceReceipt {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ReleaseControllerBundleReceipt {
  readonly outputPath: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly sources: readonly ReleaseControllerSourceReceipt[];
  readonly sourceInventorySha256: string;
  readonly esbuildSha256: string;
  readonly externalImports: readonly string[];
}

interface CapturedSource {
  readonly receipt: ReleaseControllerSourceReceipt;
  readonly bytes: Buffer;
  readonly executable: boolean;
}

function compareUnsignedUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function parseMetafile(raw: string): EsbuildMetafile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ReleaseControllerBundleError('esbuild metafile is not strict JSON.', {
      cause: error,
    });
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    typeof (parsed as { inputs?: unknown }).inputs !== 'object' ||
    (parsed as { inputs?: unknown }).inputs === null ||
    Array.isArray((parsed as { inputs?: unknown }).inputs) ||
    typeof (parsed as { outputs?: unknown }).outputs !== 'object' ||
    (parsed as { outputs?: unknown }).outputs === null ||
    Array.isArray((parsed as { outputs?: unknown }).outputs)
  ) {
    throw new ReleaseControllerBundleError('esbuild metafile has an invalid shape.');
  }
  return parsed as EsbuildMetafile;
}

async function captureSource(
  path: string,
  displayPath: string,
  executable = false
): Promise<CapturedSource> {
  let handle: FileHandle | undefined;
  try {
    if ((await realpath(path)) !== path) {
      throw new ReleaseControllerBundleError(
        `Controller build input ${displayPath} contains a link alias.`
      );
    }
    handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size <= 0n || before.size > BigInt(MAX_BUNDLE_BYTES)) {
      throw new ReleaseControllerBundleError(`Controller source ${displayPath} is not bounded.`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      bytes.byteLength !== Number(before.size)
    ) {
      throw new ReleaseControllerBundleError(
        `Controller source ${displayPath} changed during capture.`
      );
    }
    if (executable && Number(before.mode & 0o111n) === 0) {
      throw new ReleaseControllerBundleError(
        `Controller build executable ${displayPath} has unsafe mode bits.`
      );
    }
    return Object.freeze({
      receipt: Object.freeze({
        path: displayPath,
        bytes: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }),
      bytes,
      executable,
    });
  } finally {
    await handle?.close();
  }
}

export async function bundleReleaseController(
  outputPath: string
): Promise<ReleaseControllerBundleReceipt> {
  if (
    !isAbsolute(outputPath) ||
    resolve(outputPath) !== outputPath ||
    extname(outputPath) !== '.mjs' ||
    outputPath.includes('\0')
  ) {
    throw new ReleaseControllerBundleError(
      'Controller output must be one canonical absolute .mjs path.'
    );
  }

  const sourceRoot = await realpath(dirname(fileURLToPath(import.meta.url)));
  const repositoryRoot = resolve(sourceRoot, '../../../..');
  const esbuildExecutable = await realpath(
    resolve(repositoryRoot, 'node_modules/esbuild/bin/esbuild')
  );
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'missionpulse-esbuild-'));
  const temporarySourceRoot = resolve(temporaryDirectory, 'sources');
  const snapshotEsbuildExecutable = resolve(temporaryDirectory, 'esbuild');
  const temporaryOutput = resolve(temporaryDirectory, 'release-controller.bundle.mjs');
  const temporaryMetafile = resolve(temporaryDirectory, 'metafile.json');
  const capturedSources = await Promise.all(
    CONTROLLER_SOURCE_ALLOWLIST.map(async (displayPath) =>
      captureSource(resolve(sourceRoot, displayPath), displayPath)
    )
  );
  const sources = Object.freeze(capturedSources.map((source) => source.receipt));
  const totalSourceBytes = sources.reduce((total, source) => total + source.bytes, 0);
  if (!Number.isSafeInteger(totalSourceBytes) || totalSourceBytes > MAX_BUNDLE_BYTES) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw new ReleaseControllerBundleError('Controller source inventory exceeds its byte bound.');
  }
  const sourceInventorySha256 = createHash('sha256')
    .update(JSON.stringify(['missionpulse-release-controller-sources', 1, sources]))
    .digest('hex');
  const capturedEsbuild = await captureSource(esbuildExecutable, 'esbuild', true).catch(
    async (error: unknown) => {
      await rm(temporaryDirectory, { recursive: true, force: true });
      throw error;
    }
  );
  let bundleBytes: Buffer;
  let metafile: EsbuildMetafile;
  try {
    await mkdir(temporarySourceRoot, { recursive: false, mode: 0o700 });
    for (const captured of capturedSources) {
      const snapshotPath = resolve(temporarySourceRoot, captured.receipt.path);
      if (!snapshotPath.startsWith(`${temporarySourceRoot}${sep}`)) {
        throw new ReleaseControllerBundleError('Controller snapshot path escaped its root.');
      }
      await mkdir(dirname(snapshotPath), { recursive: true, mode: 0o700 });
      await writeFile(snapshotPath, captured.bytes, { flag: 'wx', mode: 0o444 });
    }
    await writeFile(snapshotEsbuildExecutable, capturedEsbuild.bytes, {
      flag: 'wx',
      mode: 0o555,
    });
    const snapshotEntryPoint = resolve(temporarySourceRoot, 'controller-entry.ts');
    await execFile(
      snapshotEsbuildExecutable,
      [
        snapshotEntryPoint,
        '--bundle',
        '--platform=node',
        '--format=esm',
        '--target=node22.23',
        '--charset=utf8',
        '--legal-comments=none',
        '--tree-shaking=true',
        `--outfile=${temporaryOutput}`,
        `--metafile=${temporaryMetafile}`,
      ],
      {
        cwd: temporarySourceRoot,
        env: { HOME: '/nonexistent', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' },
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 1_048_576,
      }
    );
    bundleBytes = await readFile(temporaryOutput);
    const metafileBytes = await readFile(temporaryMetafile);
    if (metafileBytes.byteLength === 0 || metafileBytes.byteLength > MAX_BUNDLE_BYTES) {
      throw new ReleaseControllerBundleError('esbuild metafile is empty or unbounded.');
    }
    metafile = parseMetafile(metafileBytes.toString('utf8'));
  } catch (error) {
    if (error instanceof ReleaseControllerBundleError) {
      throw error;
    }
    throw new ReleaseControllerBundleError('The lockfile-bound esbuild binary failed.', {
      cause: error,
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  if (bundleBytes.byteLength === 0 || bundleBytes.byteLength > MAX_BUNDLE_BYTES) {
    throw new ReleaseControllerBundleError('Controller bundle is empty or exceeds its size bound.');
  }

  const inputPaths = Object.keys(metafile.inputs);
  if (inputPaths.length === 0 || inputPaths.length > MAX_CONTROLLER_SOURCES) {
    throw new ReleaseControllerBundleError('Controller source inventory exceeds its bound.');
  }
  const metafileSources = inputPaths.map((inputPath) => {
    const absolute = resolve(temporarySourceRoot, inputPath);
    const display = relative(temporarySourceRoot, absolute).split(sep).join('/');
    if (display.startsWith('../') || display.length === 0) {
      throw new ReleaseControllerBundleError(
        'Controller imports a source outside its reviewed root.'
      );
    }
    return display;
  });
  metafileSources.sort(compareUnsignedUtf8);
  if (
    metafileSources.length !== CONTROLLER_SOURCE_ALLOWLIST.length ||
    metafileSources.some((source, index) => source !== CONTROLLER_SOURCE_ALLOWLIST[index])
  ) {
    throw new ReleaseControllerBundleError(
      'Controller import graph differs from the pre-build source digest allowlist.'
    );
  }

  const outputMetadata = Object.values(metafile.outputs);
  if (outputMetadata.length !== 1) {
    throw new ReleaseControllerBundleError('Controller metadata names an ambiguous output set.');
  }
  const externalImports = Object.freeze(
    outputMetadata[0].imports.map((entry) => entry.path).sort(compareUnsignedUtf8)
  );
  if (externalImports.some((value) => !value.startsWith('node:'))) {
    throw new ReleaseControllerBundleError('Controller bundle retains a non-Node external import.');
  }

  try {
    await writeFile(outputPath, bundleBytes, { flag: 'wx', mode: 0o444 });
  } catch (error) {
    throw new ReleaseControllerBundleError(
      'Controller bundle could not be published without replacement.',
      {
        cause: error,
      }
    );
  }
  const bundleSha256 = createHash('sha256').update(bundleBytes).digest('hex');
  return Object.freeze({
    outputPath,
    bytes: bundleBytes.byteLength,
    sha256: bundleSha256,
    sources,
    sourceInventorySha256,
    esbuildSha256: capturedEsbuild.receipt.sha256,
    externalImports,
  });
}
