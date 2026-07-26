import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetLocalData } from '../../../src/lib/shell/storage/local-data-reset';

describe('local data reset shell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fails closed before mutating storage while the model-owned reset ports are unavailable', async () => {
    const clear = vi.fn(async () => undefined);
    const deleteDatabase = vi.fn();

    vi.stubGlobal('chrome', { storage: { local: { clear } } });
    vi.stubGlobal('indexedDB', { deleteDatabase });

    await expect(resetLocalData()).rejects.toMatchObject({
      code: 'LOCAL_DATA_RESET_MODEL_PORTS_UNAVAILABLE',
    });

    expect(clear).not.toHaveBeenCalled();
    expect(deleteDatabase).not.toHaveBeenCalled();
  });
});
