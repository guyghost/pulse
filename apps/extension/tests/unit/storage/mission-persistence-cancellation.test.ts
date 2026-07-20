import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mission } from '../../../src/lib/core/types/mission';

const DB_NAME = 'missionpulse';

function makeMission(): Mission {
  return {
    id: 'mission-abortable-commit',
    title: 'Mission transactionnelle',
    client: null,
    description: 'Persistence cancellation regression',
    stack: ['TypeScript'],
    tjm: 700,
    location: 'Paris',
    remote: 'hybrid',
    duration: '3 mois',
    url: 'https://example.com/mission-abortable-commit',
    source: 'free-work',
    scrapedAt: new Date('2026-07-15T10:00:00.000Z'),
    score: 80,
    semanticScore: null,
    semanticReason: null,
  };
}

async function dropDatabase(): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

describe('mission persistence cancellation', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await dropDatabase();
  });

  it('aborts an in-flight mission transaction and rejects only after rollback', async () => {
    vi.resetModules();
    const db = await import('../../../src/lib/shell/storage/db');
    const originalTransaction = IDBDatabase.prototype.transaction;
    let observeTransaction: ((transaction: IDBTransaction) => void) | undefined;
    const transactionCreated = new Promise<IDBTransaction>((resolve) => {
      observeTransaction = resolve;
    });

    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
      this: IDBDatabase,
      storeNames: string | string[],
      mode?: IDBTransactionMode,
      options?: IDBTransactionOptions
    ) {
      const transaction = originalTransaction.call(this, storeNames, mode, options);
      if (storeNames === 'missions' && mode === 'readwrite') {
        observeTransaction?.(transaction);
      }
      return transaction;
    });

    const controller = new AbortController();
    const commit = db.saveMissions([makeMission()], controller.signal);
    const transaction = await transactionCreated;
    let transactionAborted = false;
    transaction.addEventListener('abort', () => {
      transactionAborted = true;
    });

    controller.abort();
    const rejection = await commit.then(
      () => null,
      (error: unknown) => error
    );
    const storedMissionCount = await db.getMissionCount();

    expect(transactionAborted).toBe(true);
    expect(rejection).toBeInstanceOf(DOMException);
    expect((rejection as DOMException).name).toBe('AbortError');
    expect(storedMissionCount).toBe(0);
  });
});
