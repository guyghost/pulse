import { describe, expect, it, vi } from 'vitest';

import {
  NestedCdpSession,
  type BrowserCdpSessionLike,
  type ReceivedMessageFromTarget,
} from '../../mv3/harness/nested-cdp-session';

class FakeBrowserSession implements BrowserCdpSessionLike {
  readonly sent: Array<{ method: string; params: Record<string, unknown> }> = [];
  readonly listeners = new Set<(event: ReceivedMessageFromTarget) => void>();

  on(
    event: 'Target.receivedMessageFromTarget',
    listener: (event: ReceivedMessageFromTarget) => void
  ): void {
    expect(event).toBe('Target.receivedMessageFromTarget');
    this.listeners.add(listener);
  }

  off(
    event: 'Target.receivedMessageFromTarget',
    listener: (event: ReceivedMessageFromTarget) => void
  ): void {
    expect(event).toBe('Target.receivedMessageFromTarget');
    this.listeners.delete(listener);
  }

  async send(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.sent.push({ method, params });
    return {};
  }

  emit(sessionId: string, message: object): void {
    for (const listener of this.listeners) {
      listener({ message: JSON.stringify(message), sessionId });
    }
  }
}

describe('non-flatten nested CDP session', () => {
  it('correlates nested command responses through Target.sendMessageToTarget', async () => {
    const browser = new FakeBrowserSession();
    const nested = new NestedCdpSession({
      browserSession: browser,
      nestedSessionId: 'nested-1',
      onProtocolFailure: vi.fn(),
    });

    const pending = nested.sendCommand('Runtime.enable');
    expect(browser.sent).toHaveLength(1);
    const envelope = JSON.parse(browser.sent[0]!.params.message as string) as {
      id: number;
      method: string;
    };
    expect(browser.sent[0]).toMatchObject({
      method: 'Target.sendMessageToTarget',
      params: { sessionId: 'nested-1' },
    });
    expect(envelope.method).toBe('Runtime.enable');

    browser.emit('nested-1', { id: envelope.id, result: { enabled: true } });

    await expect(pending).resolves.toEqual({ enabled: true });
  });

  it('delivers current nested events sequentially and ignores other sessions', async () => {
    const browser = new FakeBrowserSession();
    const failures = vi.fn();
    const nested = new NestedCdpSession({
      browserSession: browser,
      nestedSessionId: 'nested-1',
      onProtocolFailure: failures,
    });
    const observed: string[] = [];
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    nested.onEvent(async (event) => {
      observed.push(`start:${event.method}`);
      if (event.method === 'Runtime.first') {
        await blocked;
      }
      observed.push(`end:${event.method}`);
    });

    browser.emit('other', { method: 'Runtime.foreign', params: {} });
    browser.emit('nested-1', { method: 'Runtime.first', params: {} });
    browser.emit('nested-1', { method: 'Runtime.second', params: {} });
    await Promise.resolve();
    expect(observed).toEqual(['start:Runtime.first']);
    release();
    await nested.drainEvents();

    expect(observed).toEqual([
      'start:Runtime.first',
      'end:Runtime.first',
      'start:Runtime.second',
      'end:Runtime.second',
    ]);
    expect(failures).not.toHaveBeenCalled();
  });

  it('fails closed on malformed nested protocol and rejects pending commands on dispose', async () => {
    const browser = new FakeBrowserSession();
    const failures = vi.fn();
    const nested = new NestedCdpSession({
      browserSession: browser,
      nestedSessionId: 'nested-1',
      onProtocolFailure: failures,
    });
    const pending = nested.sendCommand('Runtime.enable');
    const rejection = expect(pending).rejects.toThrow(/disposed/i);

    browser.emit('nested-1', { method: 'Runtime.event', params: [] });
    nested.dispose();

    await rejection;
    expect(failures).toHaveBeenCalledTimes(1);
    expect(browser.listeners).toHaveLength(0);
  });
});
