import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { ScanCheckpoint } from '../../../src/models/scan-lifecycle.machine';

const { getMissions, sessionStore } = vi.hoisted(() => ({
  getMissions: vi.fn(),
  sessionStore: {} as Record<string, unknown>,
}));

function makeMission(id: string): Mission {
  return {
    id,
    title: id,
    client: null,
    description: 'Description',
    stack: ['TypeScript'],
    tjm: 700,
    location: 'Paris',
    remote: 'hybrid',
    duration: '6 mois',
    url: `https://example.com/${id}`,
    source: 'free-work',
    scrapedAt: new Date('2026-07-15T10:00:00.000Z'),
    score: 80,
    semanticScore: null,
    semanticReason: null,
  };
}

function checkpoint(
  state: ScanCheckpoint['state'],
  terminal: ScanCheckpoint['terminal'] = null
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
    operationId: `operation-${state}`,
    state,
    trigger: 'manual',
    connectorResults,
    cancellationRequested: state === 'cancelling' || state === 'cancelled',
    terminal,
  };
}

vi.stubGlobal('chrome', {
  storage: {
    session: {
      get: vi.fn(async (keys: string | string[]) => {
        const keyList = typeof keys === 'string' ? [keys] : keys;
        return Object.fromEntries(
          keyList.filter((key) => key in sessionStore).map((key) => [key, sessionStore[key]])
        );
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(sessionStore, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        for (const key of typeof keys === 'string' ? [keys] : keys) {
          delete sessionStore[key];
        }
      }),
    },
  },
  runtime: {
    sendMessage: vi.fn(async () => undefined),
  },
});

vi.mock('../../../src/lib/shell/storage/db', () => ({ getMissions }));

describe('scan recovery bootstrap gate', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    for (const key of Object.keys(sessionStore)) {
      delete sessionStore[key];
    }
    getMissions.mockResolvedValue([]);
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(undefined);
  });

  it('blocks bootstrap on a deferred session read, reports an interrupted active scan, and replays only once', async () => {
    sessionStore.scanLifecycleCheckpoint = checkpoint('scanning');
    let releaseRead: (() => void) | undefined;
    let observeRead: (() => void) | undefined;
    const readStarted = new Promise<void>((resolve) => {
      observeRead = resolve;
    });
    vi.mocked(chrome.storage.session.get).mockImplementationOnce(async (keys) => {
      observeRead?.();
      await new Promise<void>((resolve) => {
        releaseRead = resolve;
      });
      const keyList = typeof keys === 'string' ? [keys] : keys;
      return Object.fromEntries(
        keyList.filter((key) => key in sessionStore).map((key) => [key, sessionStore[key]])
      );
    });

    const recovery = await import('../../../src/background/scan-recovery');
    await readStarted;
    let recoverySettled = false;
    const firstGate = recovery.waitForScanRecovery().then(() => {
      recoverySettled = true;
    });
    await Promise.resolve();

    expect(recoverySettled).toBe(false);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    releaseRead?.();
    await firstGate;

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'SCAN_ERROR',
      payload: {
        operationId: 'operation-scanning',
        code: 'WORKER_RESTARTED',
        message: 'Le service worker a redémarré pendant le scan.',
      },
    });
    expect(sessionStore.scanLifecycleCheckpoint).toBeUndefined();
    expect(getMissions).not.toHaveBeenCalled();

    vi.resetModules();
    const secondWorker = await import('../../../src/background/scan-recovery');
    await secondWorker.waitForScanRecovery();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('replays a committed completion with exactly its checkpoint mission ids', async () => {
    sessionStore.scanLifecycleCheckpoint = checkpoint('completed', {
      type: 'SCAN_COMPLETE',
      missionIds: ['mission-b', 'mission-a'],
    });
    getMissions.mockResolvedValue([
      makeMission('mission-a'),
      makeMission('unrelated-history'),
      makeMission('mission-b'),
    ]);

    const recovery = await import('../../../src/background/scan-recovery');
    await recovery.waitForScanRecovery();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'SCAN_COMPLETE',
      payload: {
        operationId: 'operation-completed',
        missions: [makeMission('mission-b'), makeMission('mission-a')],
      },
    });
    expect(sessionStore.scanLifecycleCheckpoint).toBeUndefined();
  });

  it.each([
    [
      checkpoint('cancelling'),
      { type: 'SCAN_CANCELLED', payload: { operationId: 'operation-cancelling' } },
    ],
    [
      checkpoint('failed', {
        type: 'SCAN_ERROR',
        code: 'OFFLINE',
        message: 'Connexion indisponible.',
      }),
      {
        type: 'SCAN_ERROR',
        payload: {
          operationId: 'operation-failed',
          code: 'OFFLINE',
          message: 'Connexion indisponible.',
        },
      },
    ],
    [
      checkpoint('cancelled', { type: 'SCAN_CANCELLED' }),
      { type: 'SCAN_CANCELLED', payload: { operationId: 'operation-cancelled' } },
    ],
  ] as const)(
    'settles or replays checkpoint %# without resuming effects',
    async (stored, terminal) => {
      sessionStore.scanLifecycleCheckpoint = stored;

      const recovery = await import('../../../src/background/scan-recovery');
      await recovery.waitForScanRecovery();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(terminal);
      expect(sessionStore.scanLifecycleCheckpoint).toBeUndefined();
      expect(getMissions).not.toHaveBeenCalled();
    }
  );

  it('keeps the terminal checkpoint when payload reconstruction fails before a send attempt', async () => {
    const stored = checkpoint('completed', {
      type: 'SCAN_COMPLETE',
      missionIds: ['mission-unavailable'],
    });
    sessionStore.scanLifecycleCheckpoint = stored;
    getMissions.mockRejectedValueOnce(new Error('IndexedDB unavailable'));

    const recovery = await import('../../../src/background/scan-recovery');
    await expect(recovery.waitForScanRecovery()).rejects.toThrow('IndexedDB unavailable');

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(sessionStore.scanLifecycleCheckpoint).toEqual(stored);

    await expect(recovery.waitForScanRecovery()).resolves.toBe('operation-completed');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'SCAN_COMPLETE',
      payload: { operationId: 'operation-completed', missions: [] },
    });
    expect(sessionStore.scanLifecycleCheckpoint).toBeUndefined();
  });

  it('clears the terminal checkpoint after a rejected transport attempt', async () => {
    sessionStore.scanLifecycleCheckpoint = checkpoint('cancelled', { type: 'SCAN_CANCELLED' });
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValueOnce(new Error('panel unavailable'));

    const recovery = await import('../../../src/background/scan-recovery');
    await expect(recovery.waitForScanRecovery()).resolves.toBe('operation-cancelled');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(sessionStore.scanLifecycleCheckpoint).toBeUndefined();
  });

  it('cleans an unknown checkpoint version without blocking the gate', async () => {
    sessionStore.scanLifecycleCheckpoint = {
      ...checkpoint('scanning'),
      version: 99,
    };

    const recovery = await import('../../../src/background/scan-recovery');
    await expect(recovery.waitForScanRecovery()).resolves.toBeNull();

    expect(sessionStore.scanLifecycleCheckpoint).toBeUndefined();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});
