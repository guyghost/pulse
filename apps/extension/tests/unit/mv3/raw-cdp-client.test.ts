import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  MAX_CDP_CLEANUP_COMMANDS,
  MAX_CDP_MESSAGE_BYTES,
  MAX_CDP_OPERATIONAL_COMMANDS,
  RawCdpClient,
  reserveRawCdpCommandRange,
  type RawCdpDiagnostic,
  type RawCdpSocketEvent,
  type RawCdpRootSocket,
} from '../../mv3/harness/raw-cdp-client';

class FakeRootSocket implements RawCdpRootSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readonly sent: string[] = [];
  readonly listeners = new Map<string, Set<(event: RawCdpSocketEvent) => void>>();
  readyState = FakeRootSocket.OPEN;
  closeCalls = 0;
  failOnSendIndex: number | null = null;

  addEventListener(type: string, listener: (event: RawCdpSocketEvent) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: RawCdpSocketEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string): void {
    if (this.failOnSendIndex === this.sent.length) {
      this.failOnSendIndex = null;
      throw new Error('scripted socket send failure');
    }
    this.sent.push(data);
  }

  close(): void {
    this.closeCalls += 1;
    if (this.readyState === FakeRootSocket.CLOSED) {
      return;
    }
    this.readyState = FakeRootSocket.CLOSED;
    this.emit('close', { code: 1000, reason: 'client-close' });
  }

  emitMessage(data: unknown): void {
    this.emit('message', { data });
  }

  emit(type: string, event: RawCdpSocketEvent): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const identity = {
  leaseEpoch: 7,
  processGeneration: 3,
  transportId: 'raw-root-7',
} as const;

function createClient() {
  const diagnostics: RawCdpDiagnostic[] = [];
  const socket = new FakeRootSocket();
  const client = new RawCdpClient({
    identity,
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    socket,
  });
  return { client, diagnostics, socket };
}

function sentCommand(socket: FakeRootSocket, index = socket.sent.length - 1) {
  return JSON.parse(socket.sent[index] ?? '') as {
    id: number;
    method: string;
    params?: Record<string, unknown>;
    sessionId?: string;
  };
}

function respond(
  socket: FakeRootSocket,
  command: { readonly id: number; readonly sessionId?: string },
  result: Record<string, unknown>
): void {
  socket.emitMessage(
    JSON.stringify({
      id: command.id,
      result,
      ...(command.sessionId === undefined ? {} : { sessionId: command.sessionId }),
    })
  );
}

describe('raw root CDP client', () => {
  it('rejects an injected root socket that is not already open', () => {
    const socket = new FakeRootSocket();
    socket.readyState = FakeRootSocket.CLOSED;

    expect(() => new RawCdpClient({ identity, socket })).toThrow(/must already be open/i);
  });

  it('injects one open root socket and correlates out-of-order responses by command ID', async () => {
    const { client, socket } = createClient();

    const version = client.sendCommand({ method: 'Browser.getVersion' });
    const runtime = client.sendCommand({
      method: 'Runtime.enable',
      sessionId: 'worker-session-1',
    });
    const versionCommand = sentCommand(socket, 0);
    const runtimeCommand = sentCommand(socket, 1);

    respond(socket, runtimeCommand, { enabled: true });
    respond(socket, versionCommand, { product: 'Chrome/149.0.7827.55' });

    await expect(version).resolves.toEqual({
      ...identity,
      schemaVersion: 1,
      id: versionCommand.id,
      method: 'Browser.getVersion',
      result: { product: 'Chrome/149.0.7827.55' },
    });
    await expect(runtime).resolves.toEqual({
      ...identity,
      schemaVersion: 1,
      id: runtimeCommand.id,
      method: 'Runtime.enable',
      result: { enabled: true },
      sessionId: 'worker-session-1',
    });
  });

  it('atomically reserves and synchronously emits an ordered operational command batch', async () => {
    const { client, socket } = createClient();

    const receipts = client.sendCommandBatch([
      {
        method: 'Runtime.runIfWaitingForDebugger',
        params: {},
        sessionId: 'worker-session-1',
      },
      {
        method: 'Runtime.evaluate',
        params: { expression: 'globalThis.location.href' },
        sessionId: 'worker-session-1',
      },
      {
        method: 'Runtime.evaluate',
        params: { expression: '1 + 1' },
        sessionId: 'worker-session-1',
      },
    ]);

    expect(socket.sent).toHaveLength(3);
    const sent = [0, 1, 2].map((index) => sentCommand(socket, index));
    expect(sent.map(({ id, method }) => ({ id, method }))).toEqual([
      { id: 1, method: 'Runtime.runIfWaitingForDebugger' },
      { id: 2, method: 'Runtime.evaluate' },
      { id: 3, method: 'Runtime.evaluate' },
    ]);

    respond(socket, sent[2]!, { result: { type: 'number', value: 2 } });
    respond(socket, sent[0]!, {});
    respond(socket, sent[1]!, { result: { type: 'string', value: 'worker' } });
    await expect(Promise.all(receipts)).resolves.toMatchObject([
      { id: 1, method: 'Runtime.runIfWaitingForDebugger' },
      { id: 2, method: 'Runtime.evaluate' },
      { id: 3, method: 'Runtime.evaluate' },
    ]);
  });

  it('rejects a malformed or over-capacity batch before emitting any batch byte', async () => {
    const { client, socket } = createClient();

    expect(() =>
      client.sendCommandBatch([
        { method: 'Runtime.enable' },
        { method: 'Runtime.evaluate', params: [] as never },
      ])
    ).toThrow(/params must be an object/i);
    expect(socket.sent).toEqual([]);

    const pending = Array.from({ length: MAX_CDP_OPERATIONAL_COMMANDS - 1 }, () =>
      client.sendCommand({ method: 'Runtime.enable' })
    );
    expect(() =>
      client.sendCommandBatch([
        { method: 'Runtime.evaluate', params: { expression: '1' } },
        { method: 'Runtime.runIfWaitingForDebugger' },
      ])
    ).toThrow(/operational command capacity/i);
    expect(socket.sent).toHaveLength(MAX_CDP_OPERATIONAL_COMMANDS - 1);

    const settled = Promise.allSettled(pending);
    client.close();
    await settled;
  });

  it('retains a typed immutable sent prefix after a synchronous partial batch send failure', async () => {
    const { client, socket } = createClient();
    socket.failOnSendIndex = 1;

    const batch = client.sendCommandBatch([
      {
        method: 'Runtime.runIfWaitingForDebugger',
        params: {},
        sessionId: 'worker-session-1',
      },
      {
        method: 'Runtime.evaluate',
        params: { expression: 'identity' },
        sessionId: 'worker-session-1',
      },
      {
        method: 'Runtime.evaluate',
        params: { expression: 'probe' },
        sessionId: 'worker-session-1',
      },
    ]);
    expect(socket.sent).toHaveLength(1);
    const failure: unknown = await Promise.all(batch).then(
      () => undefined,
      (error: unknown) => error
    );
    expect(failure).toMatchObject({
      name: 'RawCdpBatchSendError',
      message: 'scripted socket send failure',
      schemaVersion: 1,
      processGeneration: identity.processGeneration,
      leaseEpoch: identity.leaseEpoch,
      transportId: identity.transportId,
      sentPrefix: [
        {
          id: 1,
          method: 'Runtime.runIfWaitingForDebugger',
          params: {},
          sessionId: 'worker-session-1',
        },
      ],
    });
    const sentPrefix = (failure as { readonly sentPrefix: readonly unknown[] }).sentPrefix;
    expect(Object.isFrozen(sentPrefix)).toBe(true);

    const next = client.sendCommand({ method: 'Browser.getVersion' });
    const nextCommand = sentCommand(socket);
    expect(nextCommand.id).toBe(4);
    respond(socket, nextCommand, { product: 'Chrome/149.0.7827.55' });
    await expect(next).resolves.toMatchObject({ id: 4, method: 'Browser.getVersion' });
  });

  it('fails a command-range overflow before allocating an unsafe integer ID', () => {
    expect(reserveRawCdpCommandRange(41, 3)).toEqual({
      firstCommandId: 41,
      lastCommandId: 43,
      nextCommandId: 44,
    });
    expect(() => reserveRawCdpCommandRange(Number.MAX_SAFE_INTEGER, 2)).toThrow(
      /command ID range/i
    );
  });

  it('preserves sequential event delivery even when an earlier listener is asynchronous', async () => {
    const { client, socket } = createClient();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    client.onEvent(async (event) => {
      order.push(`start:${event.method}`);
      if (event.method === 'Target.first') {
        await firstBlocked;
      }
      order.push(`end:${event.method}`);
    });

    socket.emitMessage(JSON.stringify({ method: 'Target.first', params: { ordinal: 1 } }));
    socket.emitMessage(JSON.stringify({ method: 'Target.second', params: { ordinal: 2 } }));
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['start:Target.first']);

    releaseFirst();
    const barrier = client.sendCommand({ method: 'Browser.getVersion' });
    respond(socket, sentCommand(socket), { product: 'Chrome/149.0.7827.55' });
    await barrier;

    expect(order).toEqual([
      'start:Target.first',
      'end:Target.first',
      'start:Target.second',
      'end:Target.second',
    ]);
  });

  it('diagnoses unknown, stale and session-crossed responses without settling another command', async () => {
    const { client, diagnostics, socket } = createClient();

    socket.emitMessage(JSON.stringify({ id: 999, result: {} }));
    const pending = client.sendCommand({
      method: 'Runtime.enable',
      sessionId: 'worker-session-1',
    });
    const command = sentCommand(socket);
    socket.emitMessage(
      JSON.stringify({ id: command.id, result: {}, sessionId: 'worker-session-other' })
    );
    respond(socket, command, { enabled: true });
    await pending;
    respond(socket, command, { duplicate: true });

    const barrier = client.sendCommand({ method: 'Browser.getVersion' });
    respond(socket, sentCommand(socket), { product: 'Chrome/149.0.7827.55' });
    await barrier;

    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toEqual([
      'unknown-response',
      'response-session-mismatch',
      'stale-response',
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.responseId)).toEqual([
      999,
      command.id,
      command.id,
    ]);
  });

  it('keeps 32 cleanup slots inaccessible to 224 operational commands', async () => {
    const { client, socket } = createClient();
    const operational = Array.from({ length: MAX_CDP_OPERATIONAL_COMMANDS }, (_, index) =>
      client.sendCommand({ method: 'Runtime.evaluate', params: { expression: String(index) } })
    );

    expect(socket.sent).toHaveLength(224);
    await expect(client.sendCommand({ method: 'Runtime.enable' })).rejects.toThrow(
      /operational command capacity/i
    );

    const cleanup = Array.from({ length: MAX_CDP_CLEANUP_COMMANDS }, () =>
      client.sendCleanupCommand({ method: 'Runtime.runIfWaitingForDebugger' })
    );
    expect(socket.sent).toHaveLength(256);
    await expect(
      client.sendCleanupCommand({ method: 'Target.setAutoAttach', params: { autoAttach: false } })
    ).rejects.toThrow(/cleanup command capacity/i);

    const first = sentCommand(socket, 0);
    respond(socket, first, { value: 0 });
    await operational[0];
    const reused = client.sendCommand({ method: 'Runtime.disable' });
    expect(socket.sent).toHaveLength(257);

    const allPending = Promise.allSettled([...operational.slice(1), ...cleanup, reused]);
    client.close();
    await allPending;
  });

  it.each([
    { label: 'binary', value: new Uint8Array([1, 2, 3]) },
    { label: 'invalid JSON', value: '{not-json' },
    { label: 'array', value: '[]' },
    { label: 'primitive', value: '"value"' },
    { label: 'invalid response ID', value: '{"id":0,"result":{}}' },
    { label: 'mixed response and event', value: '{"id":1,"method":"Runtime.enable"}' },
    { label: 'invalid event params', value: '{"method":"Runtime.event","params":[]}' },
    {
      label: 'oversized message',
      value: JSON.stringify({ method: 'Runtime.event', params: { value: 'x'.repeat(1_048_576) } }),
    },
  ])('fails closed on $label inbound data', async ({ value }) => {
    const { client, diagnostics, socket } = createClient();
    socket.emitMessage(value);

    const receipt = await client.closed;
    expect(socket.closeCalls).toBe(1);
    expect(receipt).toMatchObject(identity);
    expect(diagnostics.at(-1)?.kind).toBe('protocol-failure');
  });

  it('rejects non-object and oversized outbound commands before sending', async () => {
    const { client, socket } = createClient();

    await expect(
      client.sendCommand({ method: 'Runtime.evaluate', params: [] as never })
    ).rejects.toThrow(/params must be an object/i);
    await expect(
      client.sendCommand({
        method: 'Runtime.evaluate',
        params: { expression: 'x'.repeat(MAX_CDP_MESSAGE_BYTES) },
      })
    ).rejects.toThrow(/byte limit/i);
    expect(socket.sent).toEqual([]);
  });

  it('rejects every pending command on close and freezes one identity-bound receipt', async () => {
    const { client, socket } = createClient();
    const first = client.sendCommand({ method: 'Browser.getVersion' });
    const second = client.sendCleanupCommand({ method: 'Target.setDiscoverTargets' });
    const rejected = Promise.all([
      expect(first).rejects.toThrow(/raw-root-7.*closed/i),
      expect(second).rejects.toThrow(/raw-root-7.*closed/i),
    ]);

    client.close();
    client.close();
    const receipt = await client.closed;
    await rejected;

    expect(socket.closeCalls).toBe(1);
    expect(receipt).toEqual({
      ...identity,
      code: 1000,
      reason: 'client-close',
      schemaVersion: 1,
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect([...socket.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
    await expect(client.sendCommand({ method: 'Browser.getVersion' })).rejects.toThrow(/closed/i);
  });

  it('accepts one explicitly pre-authorized remote close without a protocol diagnostic', async () => {
    const { client, diagnostics, socket } = createClient();

    client.expectRemoteClose();
    socket.readyState = FakeRootSocket.CLOSED;
    socket.emit('close', { code: 1001, reason: 'browser-close' });

    await expect(client.closed).resolves.toMatchObject({ code: 1001, reason: 'browser-close' });
    expect(diagnostics).toEqual([]);
  });

  it('has no Playwright or process-control dependency', () => {
    const sourcePath = resolve('tests/mv3/harness/raw-cdp-client.ts');
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).not.toMatch(/from\s+['"](?:@?playwright|playwright-core)/u);
    expect(source).not.toMatch(/node:child_process|\bspawnSync?\b|\bexecFileSync?\b/u);
  });
});
