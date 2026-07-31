import {
  execFile as execFileCallback,
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants, type BigIntStats } from 'node:fs';
import { access, open, realpath, type FileHandle } from 'node:fs/promises';
import { delimiter, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const MAX_PYTHON_EXECUTABLE_BYTES = 256 * 1024 * 1024;
const NATIVE_MAGICS = new Set([
  '7f454c46', // ELF
  'cffaedfe',
  'feedfacf',
  'cefaedfe',
  'feedface', // Mach-O
  'cafebabe',
  'bebafeca',
  'cafebabf',
  'bfbafeca', // universal Mach-O
]);

export const PINNED_PYTHON_ENV = Object.freeze({
  LANG: 'C',
  LC_ALL: 'C',
  PATH: '/usr/bin:/bin',
  TZ: 'UTC',
});

interface PythonExecutableIdentity {
  readonly device: bigint;
  readonly inode: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

export interface PinnedPythonRuntime {
  readonly executablePath: string;
  readonly expectedVersion: string;
  readonly executableSha256: string;
  readonly identity: PythonExecutableIdentity;
  readonly handle: FileHandle;
}

export class PinnedPythonRuntimeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PinnedPythonRuntimeError';
  }
}

export function isolatedPythonArgs(args: readonly string[]): string[] {
  return ['-I', '-E', '-S', ...args];
}

async function resolveExecutable(command: string): Promise<string> {
  const candidates =
    isAbsolute(command) || command.includes('/')
      ? [resolve(command)]
      : (process.env.PATH ?? '')
          .split(delimiter)
          .filter((entry) => entry.length > 0)
          .map((entry) => join(entry, command));
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return await realpath(candidate);
    } catch {
      // Continue until one exact executable is found.
    }
  }
  throw new PinnedPythonRuntimeError(`Pinned Python executable is unavailable: ${command}`);
}

function identityFrom(stats: BigIntStats): PythonExecutableIdentity {
  return {
    device: stats.dev,
    inode: stats.ino,
    size: stats.size,
    mtimeNs: stats.mtimeNs,
    ctimeNs: stats.ctimeNs,
  };
}

function identitiesEqual(left: PythonExecutableIdentity, right: PythonExecutableIdentity): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

export async function assertPinnedPythonIdentity(runtime: PinnedPythonRuntime): Promise<void> {
  const held = await runtime.handle.stat({ bigint: true });
  let reopened: FileHandle;
  try {
    reopened = await open(
      runtime.executablePath,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)
    );
  } catch (error) {
    throw new PinnedPythonRuntimeError('Pinned Python executable path changed.', {
      cause: error,
    });
  }
  try {
    const current = await reopened.stat({ bigint: true });
    if (
      !identitiesEqual(runtime.identity, identityFrom(held)) ||
      !identitiesEqual(runtime.identity, identityFrom(current))
    ) {
      throw new PinnedPythonRuntimeError('Pinned Python executable identity changed.');
    }
  } finally {
    await reopened.close();
  }
}

export async function attestPinnedPythonRuntime(
  command: string,
  expectedVersion: string
): Promise<PinnedPythonRuntime> {
  const executablePath = await resolveExecutable(command);
  const handle = await open(executablePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size < 4n || before.size > BigInt(MAX_PYTHON_EXECUTABLE_BYTES)) {
      throw new PinnedPythonRuntimeError('Pinned Python executable is not a bounded regular file.');
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const identity = identityFrom(before);
    if (
      !identitiesEqual(identity, identityFrom(after)) ||
      bytes.byteLength !== Number(before.size) ||
      !NATIVE_MAGICS.has(bytes.subarray(0, 4).toString('hex'))
    ) {
      throw new PinnedPythonRuntimeError(
        'Pinned Python executable is a wrapper or changed during attestation.'
      );
    }
    const executableSha256 = createHash('sha256').update(bytes).digest('hex');
    const { stdout, stderr } = await execFile(
      executablePath,
      isolatedPythonArgs(['-c', 'import platform; print(platform.python_version(), end="")']),
      {
        env: PINNED_PYTHON_ENV,
        timeout: 5_000,
        maxBuffer: 4_096,
        encoding: 'utf8',
      }
    );
    if (stdout !== expectedVersion || stderr !== '') {
      throw new PinnedPythonRuntimeError(
        `Pinned Python version mismatch: expected ${expectedVersion}.`
      );
    }
    const runtime = {
      executablePath,
      expectedVersion,
      executableSha256,
      identity,
      handle,
    } satisfies PinnedPythonRuntime;
    await assertPinnedPythonIdentity(runtime);
    return runtime;
  } catch (error) {
    await handle.close();
    if (error instanceof PinnedPythonRuntimeError) {
      throw error;
    }
    throw new PinnedPythonRuntimeError('Pinned Python attestation failed.', { cause: error });
  }
}

export async function spawnPinnedPython(
  runtime: PinnedPythonRuntime,
  args: readonly string[],
  options: Omit<SpawnOptions, 'env'> = {}
): Promise<ChildProcess> {
  await assertPinnedPythonIdentity(runtime);
  return spawn(runtime.executablePath, isolatedPythonArgs(args), {
    ...options,
    env: PINNED_PYTHON_ENV,
  });
}

export async function runPinnedPython(
  command: string,
  expectedVersion: string,
  args: readonly string[],
  options: { readonly timeout?: number; readonly maxBuffer?: number } = {}
): Promise<{ stdout: string; stderr: string }> {
  const runtime = await attestPinnedPythonRuntime(command, expectedVersion);
  try {
    const result = await execFile(runtime.executablePath, isolatedPythonArgs(args), {
      env: PINNED_PYTHON_ENV,
      timeout: options.timeout,
      maxBuffer: options.maxBuffer,
      encoding: 'utf8',
    });
    await assertPinnedPythonIdentity(runtime);
    return result;
  } finally {
    await runtime.handle.close();
  }
}
