import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  MAX_STREAM_BYTES,
  isConnectorHealthSignal,
  type CapturedChild,
  type CapturedStream,
  type ConnectorHealthSignal,
} from './contracts';

export const HEALTH_TIMEOUT_MS = 900_000;
export const HEALTH_CLOSE_TIMEOUT_MS = 30_000;
export const HEALTH_GROUP_PROBE_INTERVAL_MS = 25;
export const HEALTH_TERMINATION_GRACE_MS = 1_000;

export interface HealthChildInvocation {
  executable: string;
  args: readonly ['--import', 'tsx', 'tests/health/run-health-checks.ts', '--json'];
  cwd: string;
  env: Readonly<{
    CI: 'true';
    HOME: string;
    LANG: 'C';
    LC_ALL: 'C';
    TZ: 'UTC';
    NO_COLOR: '1';
    MISSIONPULSE_CONNECTOR_HEALTH_FIXTURE_ONLY: '1';
  }>;
}

export interface HealthChildProcess {
  readonly pid?: number;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  once(event: 'error', listener: (error: Error) => void): this;
  once(
    event: 'close',
    listener: (exitCode: number | null, signal: NodeJS.Signals | null) => void
  ): this;
}

interface SpawnOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  shell: false;
  detached: true;
  stdio: ['ignore', 'pipe', 'pipe'];
  windowsHide: true;
}

export type SpawnHealthProcess = (
  executable: string,
  args: readonly string[],
  options: SpawnOptions
) => HealthChildProcess;

export type SignalProcess = (pid: number, signal: NodeJS.Signals | 0) => boolean;

export function buildHealthChildInvocation(input: {
  extensionRoot: string;
  nodeExecutable: string;
  home: string;
}): HealthChildInvocation {
  for (const [label, value] of [
    ['extensionRoot', input.extensionRoot],
    ['nodeExecutable', input.nodeExecutable],
    ['home', input.home],
  ] as const) {
    if (!isAbsolute(value)) {
      throw new Error(`${label} must be an absolute path.`);
    }
  }
  return {
    executable: input.nodeExecutable,
    args: ['--import', 'tsx', 'tests/health/run-health-checks.ts', '--json'],
    cwd: input.extensionRoot,
    env: {
      CI: 'true',
      HOME: input.home,
      LANG: 'C',
      LC_ALL: 'C',
      TZ: 'UTC',
      NO_COLOR: '1',
      MISSIONPULSE_CONNECTOR_HEALTH_FIXTURE_ONLY: '1',
    },
  };
}

class PrefixCapture {
  readonly #chunks: Buffer[] = [];
  #length = 0;
  #truncated = false;

  push(chunk: Buffer): boolean {
    if (this.#truncated || chunk.byteLength === 0) {
      return false;
    }
    const remaining = MAX_STREAM_BYTES - this.#length;
    if (chunk.byteLength <= remaining) {
      this.#chunks.push(Buffer.from(chunk));
      this.#length += chunk.byteLength;
      return false;
    }
    if (remaining > 0) {
      this.#chunks.push(Buffer.from(chunk.subarray(0, remaining)));
      this.#length += remaining;
    }
    this.#truncated = true;
    return true;
  }

  result(): CapturedStream {
    return {
      prefix: Buffer.concat(this.#chunks, this.#length),
      truncated: this.#truncated,
    };
  }
}

function defaultSpawn(
  executable: string,
  args: readonly string[],
  options: SpawnOptions
): HealthChildProcess {
  return spawn(executable, [...args], options);
}

function defaultSignalProcess(pid: number, signal: NodeJS.Signals | 0): boolean {
  return process.kill(pid, signal);
}

function positiveDuration(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

export function captureBoundedChild(
  invocation: HealthChildInvocation,
  options: {
    spawnProcess?: SpawnHealthProcess;
    signalProcess?: SignalProcess;
    timeoutMs?: number;
    closeTimeoutMs?: number;
    groupProbeIntervalMs?: number;
    terminationGraceMs?: number;
    abortSignal?: AbortSignal;
  } = {}
): Promise<CapturedChild> {
  const spawnProcess = options.spawnProcess ?? defaultSpawn;
  const signalProcess = options.signalProcess ?? defaultSignalProcess;
  const timeoutMs = positiveDuration(options.timeoutMs ?? HEALTH_TIMEOUT_MS, 'timeoutMs');
  const closeTimeoutMs = positiveDuration(
    options.closeTimeoutMs ?? HEALTH_CLOSE_TIMEOUT_MS,
    'closeTimeoutMs'
  );
  const groupProbeIntervalMs = positiveDuration(
    options.groupProbeIntervalMs ?? HEALTH_GROUP_PROBE_INTERVAL_MS,
    'groupProbeIntervalMs'
  );
  const terminationGraceMs = positiveDuration(
    options.terminationGraceMs ?? HEALTH_TERMINATION_GRACE_MS,
    'terminationGraceMs'
  );

  return new Promise<CapturedChild>((resolve, reject) => {
    let child: HealthChildProcess;
    try {
      child = spawnProcess(invocation.executable, invocation.args, {
        cwd: invocation.cwd,
        env: invocation.env,
        shell: false,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      reject(new Error('Connector health child spawn failed.', { cause: error }));
      return;
    }

    if (!Number.isSafeInteger(child.pid) || (child.pid as number) <= 0) {
      reject(new Error('Connector health child did not expose a positive process-group ID.'));
      return;
    }
    const pgid = child.pid as number;

    const stdout = new PrefixCapture();
    const stderr = new PrefixCapture();
    let settled = false;
    let timedOut = false;
    let cleanupMode: 'none' | 'graceful' | 'force' = 'none';
    let rootCloseObserved = false;
    let streamFailure: Error | undefined;
    let infrastructureFailure: Error | undefined;
    let closeOutcome: { exitCode: number | null; signal: ConnectorHealthSignal | null } | undefined;
    let groupEmpty = false;
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    let probeTimer: ReturnType<typeof setTimeout> | undefined;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      requestForceKill();
    }, timeoutMs);

    function clearTimers(): void {
      clearTimeout(timeoutTimer);
      if (cleanupTimer !== undefined) {
        clearTimeout(cleanupTimer);
      }
      if (probeTimer !== undefined) {
        clearTimeout(probeTimer);
      }
      if (graceTimer !== undefined) {
        clearTimeout(graceTimer);
      }
      options.abortSignal?.removeEventListener('abort', handleAbort);
    }

    function fail(error: Error): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      reject(error);
    }

    function startCleanupDeadline(): void {
      if (cleanupTimer !== undefined) {
        return;
      }
      cleanupTimer = setTimeout(() => {
        fail(
          new Error(
            'Connector health controlled process group missed the bounded cleanup deadline.'
          )
        );
      }, closeTimeoutMs);
    }

    function errno(error: unknown, code: string): boolean {
      return error instanceof Error && 'code' in error && error.code === code;
    }

    function maybeSettle(): void {
      if (settled || !rootCloseObserved || !groupEmpty) {
        return;
      }
      if (streamFailure !== undefined) {
        fail(streamFailure);
        return;
      }
      if (infrastructureFailure !== undefined) {
        fail(infrastructureFailure);
        return;
      }
      if (closeOutcome === undefined) {
        fail(new Error('Connector health child close outcome is unavailable.'));
        return;
      }
      settled = true;
      clearTimers();
      resolve({
        exitCode: closeOutcome.exitCode,
        signal: closeOutcome.signal,
        timedOut,
        stdout: stdout.result(),
        stderr: stderr.result(),
      });
    }

    function scheduleProbe(): void {
      if (settled || groupEmpty || probeTimer !== undefined) {
        return;
      }
      probeTimer = setTimeout(() => {
        probeTimer = undefined;
        probeGroup();
      }, groupProbeIntervalMs);
    }

    function probeGroup(): void {
      if (settled || groupEmpty) {
        return;
      }
      try {
        if (signalProcess(-pgid, 0) !== true) {
          throw new Error('process group probe returned false');
        }
      } catch (error) {
        if (errno(error, 'ESRCH')) {
          groupEmpty = true;
          maybeSettle();
          return;
        }
        fail(new Error('Connector health process group probe failed.', { cause: error }));
        return;
      }
      if (cleanupMode === 'none') {
        requestForceKill();
      } else if (cleanupMode === 'force') {
        scheduleProbe();
      }
    }

    function requestForceKill(): void {
      if (settled || cleanupMode === 'force') {
        return;
      }
      cleanupMode = 'force';
      clearTimeout(timeoutTimer);
      if (graceTimer !== undefined) {
        clearTimeout(graceTimer);
        graceTimer = undefined;
      }
      startCleanupDeadline();
      try {
        if (signalProcess(-pgid, 'SIGKILL') !== true) {
          throw new Error('process group SIGKILL returned false');
        }
      } catch (error) {
        if (errno(error, 'ESRCH')) {
          groupEmpty = true;
          maybeSettle();
          return;
        }
        fail(new Error('Connector health process group SIGKILL failed.', { cause: error }));
        return;
      }
      probeGroup();
    }

    function requestGracefulTermination(error: Error): void {
      if (settled) {
        return;
      }
      infrastructureFailure ??= error;
      if (cleanupMode !== 'none') {
        return;
      }
      cleanupMode = 'graceful';
      clearTimeout(timeoutTimer);
      startCleanupDeadline();
      try {
        if (signalProcess(-pgid, 'SIGTERM') !== true) {
          throw new Error('process group SIGTERM returned false');
        }
      } catch (signalError) {
        if (errno(signalError, 'ESRCH')) {
          groupEmpty = true;
          maybeSettle();
          return;
        }
        fail(new Error('Connector health process group SIGTERM failed.', { cause: signalError }));
        return;
      }
      probeGroup();
      if (settled || groupEmpty) {
        return;
      }
      graceTimer = setTimeout(() => {
        graceTimer = undefined;
        requestForceKill();
      }, terminationGraceMs);
    }

    function handleAbort(): void {
      requestGracefulTermination(new Error('Connector health child capture was cancelled.'));
    }

    child.stdout.on('data', (chunk: Buffer | string) => {
      if (cleanupMode !== 'none') {
        return;
      }
      if (stdout.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))) {
        requestForceKill();
      }
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      if (cleanupMode !== 'none') {
        return;
      }
      if (stderr.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))) {
        requestForceKill();
      }
    });
    child.stdout.once('error', (error) => {
      if (settled) {
        return;
      }
      streamFailure = new Error('Connector health stdout stream error.', { cause: error });
      requestForceKill();
    });
    child.stderr.once('error', (error) => {
      if (settled) {
        return;
      }
      streamFailure = new Error('Connector health stderr stream error.', { cause: error });
      requestForceKill();
    });
    child.once('error', (error) => {
      if (settled) {
        return;
      }
      infrastructureFailure = new Error(
        'Connector health child emitted a spawn or process error.',
        { cause: error }
      );
      requestForceKill();
    });
    child.once('close', (exitCode, signal) => {
      if (settled) {
        return;
      }
      rootCloseObserved = true;
      if ((exitCode === null) === (signal === null)) {
        requestGracefulTermination(new Error('Connector health child close outcome is invalid.'));
        return;
      }
      if (signal !== null && !isConnectorHealthSignal(signal)) {
        requestGracefulTermination(
          new Error(`Connector health child closed with unsupported signal ${signal}.`)
        );
        return;
      }
      closeOutcome = { exitCode, signal };
      clearTimeout(timeoutTimer);
      if (streamFailure !== undefined) {
        requestForceKill();
      } else if (cleanupMode === 'none') {
        probeGroup();
      }
      maybeSettle();
    });

    options.abortSignal?.addEventListener('abort', handleAbort, { once: true });
    if (options.abortSignal?.aborted === true) {
      handleAbort();
    }
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  import('./capture-cli')
    .then(({ runConnectorHealthCaptureCli }) => runConnectorHealthCaptureCli())
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Unknown connector health capture error.';
      process.stderr.write(`connector-health capture infrastructure failure: ${message}\n`);
      process.exitCode = 1;
    });
}
