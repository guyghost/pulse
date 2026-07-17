import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildHealthChildInvocation,
  captureBoundedChild,
  type HealthChildProcess,
} from '../../../scripts/connector-health/capture';
import {
  CONNECTOR_HEALTH_SIGNALS,
  MAX_STREAM_BYTES,
} from '../../../scripts/connector-health/contracts';

class FakeChild extends EventEmitter implements HealthChildProcess {
  pid = 4242;
  stdout = new PassThrough();
  stderr = new PassThrough();
}

function emptyGroupSignal() {
  return vi.fn((pid: number, signal: NodeJS.Signals | 0) => {
    if (pid !== -4242) {
      throw new Error(`unexpected pid ${pid}`);
    }
    if (signal === 0) {
      const error = new Error('group empty') as NodeJS.ErrnoException;
      error.code = 'ESRCH';
      throw error;
    }
    return true;
  });
}

const invocation = buildHealthChildInvocation({
  extensionRoot: '/workspace/apps/extension',
  nodeExecutable: '/runner-tool-cache/node/22.23.1/x64/bin/node',
  home: '/runner-temp/connector-health-home',
});

afterEach(() => {
  vi.useRealTimers();
});

describe('connector-health bounded child capture', () => {
  it('builds the exact no-shell fixture-only invocation and empty-base environment', () => {
    expect(invocation).toEqual({
      executable: '/runner-tool-cache/node/22.23.1/x64/bin/node',
      args: ['--import', 'tsx', 'tests/health/run-health-checks.ts', '--json'],
      cwd: '/workspace/apps/extension',
      env: {
        CI: 'true',
        HOME: '/runner-temp/connector-health-home',
        LANG: 'C',
        LC_ALL: 'C',
        TZ: 'UTC',
        NO_COLOR: '1',
        MISSIONPULSE_CONNECTOR_HEALTH_FIXTURE_ONLY: '1',
      },
    });
  });

  it('spawns the health child exactly once and retains its closed outcome', async () => {
    const child = new FakeChild();
    const spawnProcess = vi.fn(() => child);
    const signalProcess = emptyGroupSignal();
    const capture = captureBoundedChild(invocation, {
      spawnProcess,
      signalProcess,
      timeoutMs: 1_000,
    });

    child.stdout.write('report');
    child.stderr.end();
    child.stdout.end();
    child.emit('close', 0, null);

    await expect(capture).resolves.toMatchObject({
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: { truncated: false },
      stderr: { truncated: false },
    });
    expect(spawnProcess).toHaveBeenCalledTimes(1);
    expect(spawnProcess).toHaveBeenCalledWith(invocation.executable, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      shell: false,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    expect(signalProcess).toHaveBeenCalledWith(-4242, 0);
  });

  it('retains only the capped prefix and sends SIGKILL synchronously to the process group', async () => {
    const child = new FakeChild();
    const signalProcess = emptyGroupSignal();
    const capture = captureBoundedChild(invocation, {
      spawnProcess: () => child,
      signalProcess,
      timeoutMs: 1_000,
    });
    const oversized = Buffer.alloc(MAX_STREAM_BYTES + 64, 0x61);

    child.stdout.write(oversized);
    expect(signalProcess).toHaveBeenCalledWith(-4242, 'SIGKILL');
    child.stdout.write(Buffer.alloc(32, 0x62));
    child.emit('close', null, 'SIGKILL');

    const result = await capture;
    expect(result.stdout.prefix).toHaveLength(MAX_STREAM_BYTES);
    expect(Buffer.from(result.stdout.prefix).equals(oversized.subarray(0, MAX_STREAM_BYTES))).toBe(
      true
    );
    expect(result.stdout.truncated).toBe(true);
    expect(signalProcess.mock.calls.filter(([, signal]) => signal === 'SIGKILL')).toHaveLength(1);
  });

  it('records timeout when the deadline wins but accepts a racing clean exit code', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const signalProcess = emptyGroupSignal();
    const capture = captureBoundedChild(invocation, {
      spawnProcess: () => child,
      signalProcess,
      timeoutMs: 50,
      closeTimeoutMs: 100,
    });

    await vi.advanceTimersByTimeAsync(50);
    expect(signalProcess).toHaveBeenCalledWith(-4242, 'SIGKILL');
    child.emit('close', 0, null);

    await expect(capture).resolves.toMatchObject({
      exitCode: 0,
      signal: null,
      timedOut: true,
    });
  });

  it('retains any allowlisted Linux close signal', async () => {
    const child = new FakeChild();
    const capture = captureBoundedChild(invocation, {
      spawnProcess: () => child,
      signalProcess: emptyGroupSignal(),
      timeoutMs: 1_000,
    });

    child.emit('close', null, 'SIGSEGV');

    await expect(capture).resolves.toMatchObject({ exitCode: null, signal: 'SIGSEGV' });
  });

  it.each(CONNECTOR_HEALTH_SIGNALS)('retains allowlisted close signal %s', async (signal) => {
    const child = new FakeChild();
    const capture = captureBoundedChild(invocation, {
      spawnProcess: () => child,
      signalProcess: emptyGroupSignal(),
      timeoutMs: 1_000,
    });

    child.emit('close', null, signal);

    await expect(capture).resolves.toMatchObject({ exitCode: null, signal });
  });

  it('fails as infrastructure when a killed child never closes', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const capture = captureBoundedChild(invocation, {
      spawnProcess: () => child,
      signalProcess: emptyGroupSignal(),
      timeoutMs: 50,
      closeTimeoutMs: 25,
    });

    const rejection = capture.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(75);
    const error = await rejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/cleanup deadline/i);
  });

  it('fails as infrastructure when a captured stream emits an I/O error', async () => {
    const child = new FakeChild();
    const signalProcess = emptyGroupSignal();
    const capture = captureBoundedChild(invocation, {
      spawnProcess: () => child,
      signalProcess,
      timeoutMs: 1_000,
    });

    child.stdout.emit('error', new Error('broken stdout'));
    expect(signalProcess).toHaveBeenCalledWith(-4242, 'SIGKILL');
    child.emit('close', null, 'SIGKILL');

    await expect(capture).rejects.toThrow(/stream error/i);
  });

  it('kills a surviving controlled group after root close and proves ESRCH before resolving', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    let probes = 0;
    const signalProcess = vi.fn((pid: number, signal: NodeJS.Signals | 0) => {
      expect(pid).toBe(-4242);
      if (signal === 0) {
        probes += 1;
        if (probes === 1) {
          return true;
        }
        const error = new Error('empty') as NodeJS.ErrnoException;
        error.code = 'ESRCH';
        throw error;
      }
      return true;
    });
    const capture = captureBoundedChild(invocation, {
      spawnProcess: () => child,
      signalProcess,
      timeoutMs: 1_000,
      closeTimeoutMs: 100,
      groupProbeIntervalMs: 10,
    });

    child.emit('close', 0, null);
    await vi.advanceTimersByTimeAsync(10);

    await expect(capture).resolves.toMatchObject({ exitCode: 0 });
    expect(signalProcess.mock.calls).toEqual([
      [-4242, 0],
      [-4242, 'SIGKILL'],
      [-4242, 0],
    ]);
  });

  it('fails infrastructure on EPERM or a missing positive PGID', async () => {
    const child = new FakeChild();
    const permissionDenied = new Error('denied') as NodeJS.ErrnoException;
    permissionDenied.code = 'EPERM';
    const capture = captureBoundedChild(invocation, {
      spawnProcess: () => child,
      signalProcess: () => {
        throw permissionDenied;
      },
      timeoutMs: 1_000,
    });
    child.emit('close', 0, null);
    await expect(capture).rejects.toThrow(/process group/i);

    const pidless = new FakeChild();
    pidless.pid = undefined as unknown as number;
    await expect(
      captureBoundedChild(invocation, {
        spawnProcess: () => pidless,
        signalProcess: emptyGroupSignal(),
        timeoutMs: 1_000,
      })
    ).rejects.toThrow(/positive process-group/i);
  });

  it.each([
    [null, null, 'invalid close'],
    [null, 'SIGINFO' as NodeJS.Signals, 'unsupported signal'],
  ])('runs bounded SIGTERM to SIGKILL group cleanup for %s/%s (%s)', async (exitCode, signal) => {
    vi.useFakeTimers();
    const child = new FakeChild();
    let killed = false;
    const signalProcess = vi.fn((pid: number, requested: NodeJS.Signals | 0) => {
      expect(pid).toBe(-4242);
      if (requested === 'SIGKILL') {
        killed = true;
        return true;
      }
      if (requested === 0 && killed) {
        const error = new Error('empty') as NodeJS.ErrnoException;
        error.code = 'ESRCH';
        throw error;
      }
      return true;
    });
    const capture = captureBoundedChild(invocation, {
      spawnProcess: () => child,
      signalProcess,
      timeoutMs: 1_000,
      closeTimeoutMs: 100,
      terminationGraceMs: 10,
      groupProbeIntervalMs: 5,
    });
    const rejection = capture.catch((error: unknown) => error);

    child.emit('close', exitCode, signal);
    await vi.advanceTimersByTimeAsync(15);

    expect(await rejection).toBeInstanceOf(Error);
    expect(signalProcess.mock.calls).toEqual([
      [-4242, 'SIGTERM'],
      [-4242, 0],
      [-4242, 'SIGKILL'],
      [-4242, 0],
    ]);
  });

  it('wires cooperative AbortSignal cancellation through group cleanup and rejects', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const controller = new AbortController();
    let killed = false;
    const signalProcess = vi.fn((pid: number, requested: NodeJS.Signals | 0) => {
      expect(pid).toBe(-4242);
      if (requested === 'SIGKILL') {
        killed = true;
        return true;
      }
      if (requested === 0 && killed) {
        const error = new Error('empty') as NodeJS.ErrnoException;
        error.code = 'ESRCH';
        throw error;
      }
      return true;
    });
    const capture = captureBoundedChild(invocation, {
      spawnProcess: () => child,
      signalProcess,
      abortSignal: controller.signal,
      timeoutMs: 1_000,
      closeTimeoutMs: 100,
      terminationGraceMs: 10,
      groupProbeIntervalMs: 5,
    });
    const rejection = capture.catch((error: unknown) => error);

    controller.abort();
    child.emit('close', null, 'SIGTERM');
    await vi.advanceTimersByTimeAsync(15);

    const error = await rejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/cancel/i);
    expect(signalProcess.mock.calls).toEqual([
      [-4242, 'SIGTERM'],
      [-4242, 0],
      [-4242, 'SIGKILL'],
      [-4242, 0],
    ]);
  });
});
