import { describe, expect, it, vi } from 'vitest';

import {
  openTrackedCdpTransport,
  type TrackedSocketEvent,
  type TrackedSocketLike,
} from '../../mv3/harness/tracked-cdp-transport';

class FakeSocket implements TrackedSocketLike {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly sent: string[] = [];
  readonly listeners = new Map<string, Set<(event: TrackedSocketEvent) => void>>();
  readyState = FakeSocket.CONNECTING;
  closeCalls = 0;

  addEventListener(type: string, listener: (event: TrackedSocketEvent) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: TrackedSocketEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCalls += 1;
    if (this.readyState === FakeSocket.CLOSED) {
      return;
    }
    this.readyState = FakeSocket.CLOSED;
    this.emit('close', { code: 1000, reason: 'closed' });
  }

  emitOpen(): void {
    this.readyState = FakeSocket.OPEN;
    this.emit('open', {});
  }

  emitMessage(data: unknown): void {
    this.emit('message', { data });
  }

  emit(type: string, event: TrackedSocketEvent): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const identity = {
  leaseEpoch: 4,
  processGeneration: 2,
  transportId: 'transport-4',
} as const;

async function open(fake: FakeSocket, onProtocolFailure = vi.fn()) {
  const pending = openTrackedCdpTransport({
    createSocket: () => fake,
    endpointUrl: 'ws://127.0.0.1:9222/devtools/browser/test',
    identity,
    maxInboundMessageBytes: 1_024,
    onProtocolFailure,
    openTimeoutMs: 100,
  });
  fake.emitOpen();
  return { onProtocolFailure, transport: await pending };
}

describe('tracked public ConnectOverCDP transport', () => {
  it('serializes outbound objects and schema-parses inbound objects', async () => {
    const fake = new FakeSocket();
    const { transport } = await open(fake);
    const onmessage = vi.fn();
    transport.onmessage = onmessage;

    transport.send({ id: 7, method: 'Browser.getVersion' });
    fake.emitMessage('{"id":7,"result":{"product":"Chrome/149.0.7827.55"}}');

    expect(fake.sent).toEqual(['{"id":7,"method":"Browser.getVersion"}']);
    expect(onmessage).toHaveBeenCalledWith({
      id: 7,
      result: { product: 'Chrome/149.0.7827.55' },
    });
    expect(transport.openReceipt).toEqual({
      ...identity,
      schemaVersion: 1,
    });
    expect(Object.isFrozen(transport.openReceipt)).toBe(true);
  });

  it('closes idempotently and freezes one identity-bound close receipt', async () => {
    const fake = new FakeSocket();
    const { transport } = await open(fake);
    const onclose = vi.fn();
    transport.onclose = onclose;

    transport.close();
    transport.close();
    const receipt = await transport.closed;

    expect(fake.closeCalls).toBe(1);
    expect(onclose).toHaveBeenCalledTimes(1);
    expect(receipt).toEqual({
      ...identity,
      code: 1000,
      reason: 'closed',
      schemaVersion: 1,
    });
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it.each(['{not-json', '[]', '"primitive"', JSON.stringify({ payload: 'x'.repeat(1_100) })])(
    'fails closed on malformed or oversized inbound CDP data %#',
    async (data) => {
      const fake = new FakeSocket();
      const { onProtocolFailure, transport } = await open(fake);

      fake.emitMessage(data);
      await transport.closed;

      expect(onProtocolFailure).toHaveBeenCalledTimes(1);
      expect(fake.closeCalls).toBe(1);
    }
  );

  it('fails closed on non-text inbound CDP data', async () => {
    const fake = new FakeSocket();
    const { onProtocolFailure, transport } = await open(fake);

    fake.emitMessage(new Uint8Array([1, 2, 3]));
    await transport.closed;

    expect(onProtocolFailure).toHaveBeenCalledTimes(1);
    expect(fake.closeCalls).toBe(1);
  });
});
