import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetLocalData } from '../../../src/lib/shell/storage/local-data-reset';

function createDeleteRequest(): IDBOpenDBRequest {
  const request: Partial<IDBOpenDBRequest> = {
    error: null,
    onsuccess: null,
    onerror: null,
    onblocked: null,
  };
  queueMicrotask(() => {
    request.onsuccess?.(new Event('success'));
  });
  return request as IDBOpenDBRequest;
}

describe('local data reset shell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears chrome storage and deletes the MissionPulse IndexedDB database', async () => {
    const clear = vi.fn(async () => undefined);
    const deleteDatabase = vi.fn(createDeleteRequest);

    vi.stubGlobal('chrome', { storage: { local: { clear } } });
    vi.stubGlobal('indexedDB', { deleteDatabase });

    await resetLocalData();

    expect(clear).toHaveBeenCalled();
    expect(deleteDatabase).toHaveBeenCalledWith('missionpulse');
  });

  it('rejects when IndexedDB deletion is blocked', async () => {
    const clear = vi.fn(async () => undefined);
    const deleteDatabase = vi.fn(() => {
      const request: Partial<IDBOpenDBRequest> = {
        error: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };
      queueMicrotask(() => {
        request.onblocked?.(new Event('blocked') as IDBVersionChangeEvent);
      });
      return request as IDBOpenDBRequest;
    });

    vi.stubGlobal('chrome', { storage: { local: { clear } } });
    vi.stubGlobal('indexedDB', { deleteDatabase });

    await expect(resetLocalData()).rejects.toThrow('MissionPulse IndexedDB deletion is blocked.');
  });
});
