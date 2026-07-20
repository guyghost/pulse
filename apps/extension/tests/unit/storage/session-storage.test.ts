import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScanCheckpoint } from '../../../src/models/scan-lifecycle.machine';

const sessionStore: Record<string, unknown> = {};

function readSessionKeys(keys: string | string[]): Record<string, unknown> {
  const keyList = typeof keys === 'string' ? [keys] : keys;
  const result: Record<string, unknown> = {};
  for (const key of keyList) {
    if (key in sessionStore) {
      result[key] = sessionStore[key];
    }
  }
  return result;
}

function makeCheckpoint(
  operationId: string,
  state: ScanCheckpoint['state'] = 'scanning'
): ScanCheckpoint {
  const connectorResults: ScanCheckpoint['connectorResults'] =
    state === 'completed' || state === 'persisting'
      ? { 'free-work': 'succeeded' }
      : state === 'partial'
        ? { 'free-work': 'succeeded', lehibou: 'failed' }
        : state === 'failed'
          ? { 'free-work': 'failed' }
          : { 'free-work': state === 'starting' ? 'pending' : 'running' };
  return {
    version: 1,
    operationId,
    state,
    trigger: 'manual',
    connectorResults,
    cancellationRequested: state === 'cancelling' || state === 'cancelled',
    terminal:
      state === 'completed' || state === 'partial'
        ? { type: 'SCAN_COMPLETE', missionIds: ['mission-1'] }
        : state === 'failed'
          ? { type: 'SCAN_ERROR', code: 'UNKNOWN', message: 'failed' }
          : state === 'cancelled'
            ? { type: 'SCAN_CANCELLED' }
            : null,
  };
}

vi.stubGlobal('chrome', {
  storage: {
    session: {
      get: vi.fn(async (keys: string | string[]) => readSessionKeys(keys)),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(sessionStore, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const keyList = typeof keys === 'string' ? [keys] : keys;
        for (const k of keyList) {
          delete sessionStore[k];
        }
      }),
    },
  },
});

import {
  getScanState,
  setScanState,
  getNewMissionCount,
  setNewMissionCount,
  resetNewMissionCount,
  setDeepLinkIntent,
  consumeDeepLinkIntent,
  clearScanCheckpoint,
  loadScanCheckpoint,
  saveScanCheckpoint,
} from '../../../src/lib/shell/storage/session-storage';

describe('session-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(sessionStore)) {
      delete sessionStore[key];
    }
    vi.mocked(chrome.storage.session.get).mockImplementation(async (keys) =>
      readSessionKeys(keys as string | string[])
    );
    vi.mocked(chrome.storage.session.set).mockImplementation(async (items) => {
      Object.assign(sessionStore, items);
    });
    vi.mocked(chrome.storage.session.remove).mockImplementation(async (keys) => {
      const keyList = typeof keys === 'string' ? [keys] : keys;
      for (const key of keyList) {
        delete sessionStore[key];
      }
    });
  });

  it('returns idle scan state by default', async () => {
    expect(await getScanState()).toBe('idle');
  });

  it('persists scan state', async () => {
    await setScanState('scanning');
    expect(await getScanState()).toBe('scanning');
  });

  it('returns 0 new missions by default', async () => {
    expect(await getNewMissionCount()).toBe(0);
  });

  it('persists and resets new mission count', async () => {
    await setNewMissionCount(5);
    expect(await getNewMissionCount()).toBe(5);
    await resetNewMissionCount();
    expect(await getNewMissionCount()).toBe(0);
  });

  it('hands a pending intent to exactly one concurrent consumer', async () => {
    const intent = {
      focusMissionIds: ['m1', 'm2'],
      source: 'notification' as const,
      triggeredAt: 1_700_000_000_000,
    };
    await setDeepLinkIntent(intent);

    // Two CONSUME requests racing in the same service worker (two panel
    // windows). The module mutex must serialize them so only the first wins.
    const [first, second] = await Promise.all([consumeDeepLinkIntent(), consumeDeepLinkIntent()]);

    expect(first ?? second).toEqual(intent);
    expect(first ? second : first).toBeNull();
  });

  it('round-trips a versioned scan checkpoint', async () => {
    const checkpoint = makeCheckpoint('operation-round-trip');

    await saveScanCheckpoint(checkpoint);

    expect(await loadScanCheckpoint()).toEqual(checkpoint);
  });

  it('serializes checkpoint writes in call order', async () => {
    let releaseFirstWrite: (() => void) | undefined;
    let observeFirstWrite: (() => void) | undefined;
    const firstWriteStarted = new Promise<void>((resolve) => {
      observeFirstWrite = resolve;
    });
    vi.mocked(chrome.storage.session.set)
      .mockImplementationOnce(async (items) => {
        observeFirstWrite?.();
        await new Promise<void>((resolve) => {
          releaseFirstWrite = resolve;
        });
        Object.assign(sessionStore, items);
      })
      .mockImplementationOnce(async (items) => {
        Object.assign(sessionStore, items);
      });

    const first = saveScanCheckpoint(makeCheckpoint('operation-first'));
    await firstWriteStarted;
    const second = saveScanCheckpoint(makeCheckpoint('operation-second'));
    await Promise.resolve();

    try {
      expect(chrome.storage.session.set).toHaveBeenCalledTimes(1);
    } finally {
      releaseFirstWrite?.();
    }
    await Promise.all([first, second]);
    expect(await loadScanCheckpoint()).toMatchObject({ operationId: 'operation-second' });
  });

  it('does not let an old operation clear a newer checkpoint', async () => {
    await saveScanCheckpoint(makeCheckpoint('operation-new'));

    await expect(clearScanCheckpoint('operation-old')).resolves.toBe(false);
    expect(await loadScanCheckpoint()).toMatchObject({ operationId: 'operation-new' });
    await expect(clearScanCheckpoint('operation-new')).resolves.toBe(true);
    expect(await loadScanCheckpoint()).toBeNull();
  });

  it('rejects and removes unsupported or incoherent checkpoint data', async () => {
    sessionStore.scanLifecycleCheckpoint = {
      ...makeCheckpoint('operation-invalid'),
      version: 2,
    };

    expect(await loadScanCheckpoint()).toBeNull();
    expect(sessionStore.scanLifecycleCheckpoint).toBeUndefined();
  });

  it.each([
    {
      name: 'completed without a successful connector',
      checkpoint: {
        ...makeCheckpoint('operation-completed-invalid', 'completed'),
        connectorResults: { 'free-work': 'failed' as const },
      },
    },
    {
      name: 'partial without a failed connector',
      checkpoint: {
        ...makeCheckpoint('operation-partial-invalid', 'partial'),
        connectorResults: { 'free-work': 'succeeded' as const },
      },
    },
    {
      name: 'persisting while a connector is pending',
      checkpoint: {
        ...makeCheckpoint('operation-persisting-invalid', 'persisting'),
        connectorResults: {
          'free-work': 'succeeded' as const,
          lehibou: 'pending' as const,
        },
      },
    },
    {
      name: 'cancelling without a cancellation request',
      checkpoint: {
        ...makeCheckpoint('operation-cancelling-invalid', 'cancelling'),
        cancellationRequested: false,
      },
    },
    {
      name: 'completed with a cancellation request',
      checkpoint: {
        ...makeCheckpoint('operation-completed-cancel-invalid', 'completed'),
        connectorResults: { 'free-work': 'succeeded' as const },
        cancellationRequested: true,
      },
    },
    {
      name: 'completion with an empty mission id',
      checkpoint: {
        ...makeCheckpoint('operation-completed-empty-id', 'completed'),
        terminal: { type: 'SCAN_COMPLETE' as const, missionIds: [''] },
      },
    },
    {
      name: 'completion with duplicate mission ids',
      checkpoint: {
        ...makeCheckpoint('operation-completed-duplicate-ids', 'completed'),
        terminal: {
          type: 'SCAN_COMPLETE' as const,
          missionIds: ['mission-1', 'mission-1'],
        },
      },
    },
  ])('rejects a semantically impossible checkpoint: $name', async ({ checkpoint }) => {
    await expect(saveScanCheckpoint(checkpoint)).rejects.toThrow(
      'Invalid scan lifecycle checkpoint.'
    );
    expect(sessionStore.scanLifecycleCheckpoint).toBeUndefined();
  });

  it('keeps the checkpoint queue usable after a storage rejection', async () => {
    vi.mocked(chrome.storage.session.set).mockRejectedValueOnce(new Error('session unavailable'));

    await expect(saveScanCheckpoint(makeCheckpoint('operation-failed'))).rejects.toThrow(
      'session unavailable'
    );
    await saveScanCheckpoint(makeCheckpoint('operation-after-failure'));

    expect(await loadScanCheckpoint()).toMatchObject({ operationId: 'operation-after-failure' });
  });
});
