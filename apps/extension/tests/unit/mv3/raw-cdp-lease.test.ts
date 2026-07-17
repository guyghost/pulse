import { describe, expect, it } from 'vitest';

import { openRawCdpLease, type RootWebSocketLike } from '../../mv3/harness/raw-cdp-lease';

type Listener = (event: { data?: unknown; code?: number; reason?: string }) => void;

class FakeSocket implements RootWebSocketLike {
  readyState = 0;
  readonly #listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.#listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.#listeners.get(type)?.delete(listener);
  }

  send(data: string): void {
    const command = JSON.parse(data) as { id: number; method: string };
    expect(command.method).toBe('Browser.getVersion');
    this.#emit('message', {
      data: JSON.stringify({
        id: command.id,
        result: {
          protocolVersion: '1.3',
          product: 'Chrome/149.0.7827.55',
          revision: '@3188f8a607ae7e067593be8aab7f02d2451fec07',
          userAgent: 'Mozilla/5.0 Chrome/149.0.0.0 Safari/537.36',
          jsVersion: '14.9.207.21',
        },
      }),
    });
  }

  close(): void {
    this.readyState = 3;
    this.#emit('close', { code: 1000, reason: 'normal' });
  }

  open(): void {
    this.readyState = 1;
    this.#emit('open', {});
  }

  #emit(type: string, event: { data?: unknown; code?: number; reason?: string }): void {
    for (const listener of this.#listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe('openRawCdpLease', () => {
  it('opens one tracked raw socket and admits the exact pinned browser response', async () => {
    const socket = new FakeSocket();
    const opening = openRawCdpLease({
      childExited: new Promise(() => undefined),
      createSocket: () => socket,
      endpointUrl: 'ws://127.0.0.1:41234/devtools/browser/11111111-1111-1111-1111-111111111111',
      leaseEpoch: 2,
      openTimeoutMs: 1_000,
      processGeneration: 1,
      transportId: 'raw-1-2',
    });
    socket.open();

    const lease = await opening;

    expect(lease.browserVersion).toMatchObject({
      protocolVersion: '1.3',
      product: 'Chrome/149.0.7827.55',
      revision: '@3188f8a607ae7e067593be8aab7f02d2451fec07',
      jsVersion: '14.9.207.21',
    });
    expect(lease.browserVersionSha256).toMatch(/^[a-f0-9]{64}$/u);
    lease.client.close();
    await expect(lease.client.closed).resolves.toMatchObject({
      processGeneration: 1,
      leaseEpoch: 2,
      transportId: 'raw-1-2',
    });
  });

  it('fails closed when the child exits before the socket opens', async () => {
    const socket = new FakeSocket();
    await expect(
      openRawCdpLease({
        childExited: Promise.resolve(),
        createSocket: () => socket,
        endpointUrl: 'ws://127.0.0.1:41234/devtools/browser/11111111-1111-1111-1111-111111111111',
        leaseEpoch: 1,
        openTimeoutMs: 1_000,
        processGeneration: 1,
        transportId: 'raw-1-1',
      })
    ).rejects.toThrow('exited before raw CDP lease admission');
  });
});
