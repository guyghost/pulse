/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installChromeStubs } from '../../../src/dev/chrome-stubs';

type DevMessage = { type: string; payload?: unknown };

describe('dev chrome stub — scan protocol parity', () => {
  let received: DevMessage[];

  beforeEach(() => {
    vi.useFakeTimers();
    received = [];
    const globalRecord = globalThis as unknown as Record<string, unknown>;
    delete globalRecord.chrome;
    window.localStorage.clear();
    installChromeStubs();
    chrome.runtime.onMessage.addListener((message: DevMessage) => {
      received.push(message);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('acknowledges start immediately and broadcasts the terminal separately', async () => {
    const operationId = 'dev-scan-start';
    const startPromise = chrome.runtime.sendMessage({
      type: 'SCAN_START',
      payload: { operationId, trigger: 'manual' },
    });

    expect(await Promise.race([startPromise, Promise.resolve(null)])).toEqual({
      type: 'SCAN_STARTED',
      payload: { operationId },
    });
    expect(received.filter((message) => message.type === 'SCAN_COMPLETE')).toHaveLength(0);

    await vi.runAllTimersAsync();

    expect(received.filter((message) => message.type === 'SCAN_COMPLETE')).toEqual([
      expect.objectContaining({
        type: 'SCAN_COMPLETE',
        payload: expect.objectContaining({ operationId }),
      }),
    ]);
  });

  it('acknowledges cancellation before broadcasting one cancelled terminal', async () => {
    const operationId = 'dev-scan-cancel';
    await chrome.runtime.sendMessage({
      type: 'SCAN_START',
      payload: { operationId, trigger: 'manual' },
    });

    const response = await chrome.runtime.sendMessage({
      type: 'SCAN_CANCEL',
      payload: { operationId },
    });

    expect(response).toEqual({
      type: 'SCAN_CANCEL_REQUESTED',
      payload: { operationId },
    });
    await vi.runAllTimersAsync();
    expect(received.filter((message) => message.type === 'SCAN_CANCELLED')).toEqual([
      { type: 'SCAN_CANCELLED', payload: { operationId } },
    ]);
    expect(received.filter((message) => message.type === 'SCAN_COMPLETE')).toHaveLength(0);
  });
});
