/**
 * Migration orchestrator tests — `src/models/db-migration.model.md` (Verify).
 *
 * Covers the key transitions and invariants of the state model:
 *  - Structural cascade v0 → DB_VERSION (all stores created)        [Inv-1, T-struct]
 *  - Idempotency (second run is a no-op)                            [Inv-3]
 *  - Downgrade detection (stored > DB_VERSION → no data loss)       [Inv-4]
 *  - Quarantine is non-destructive (>10% invalid → move, not wipe)  [Inv-6]
 *  - Concurrent runMigrations() dedup (cold-start guard)            [Inv-9]
 *
 * Module singletons (migrationSnapshot, migrationInProgress, inFlightOpen)
 * are reset between tests via `vi.resetModules()` + dynamic import.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Shared chrome.storage.local mock (resettable) ----------------------------
const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string | string[]) => {
        if (Array.isArray(key)) {
          const out: Record<string, unknown> = {};
          for (const k of key) {
            if (mockStorage[k] !== undefined) {
              out[k] = mockStorage[k];
            }
          }
          return out;
        }
        return key === undefined ? { ...mockStorage } : { [key]: mockStorage[key] };
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
      remove: vi.fn(async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        for (const k of keys) {
          delete mockStorage[k];
        }
      }),
    },
  },
  runtime: {
    sendMessage: vi.fn(async () => undefined),
  },
});

const DB_NAME = 'missionpulse';

/** Deletes the fake-indexeddb database fully between tests. */
async function dropDatabase(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/** Fresh-imports the db module so module-level singletons reset per test. */
async function importFresh() {
  vi.resetModules();
  return (await import('../../../src/lib/shell/storage/db')) as typeof import('../../../src/lib/shell/storage/db');
}

describe('DB migration orchestrator', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockStorage)) {
      delete mockStorage[k];
    }
  });

  afterEach(async () => {
    await dropDatabase();
  });

  it('structural cascade v0 → DB_VERSION creates every store [Inv-1]', async () => {
    const db = await importFresh();
    const result = await db.runMigrations();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    } // narrow

    const handle = await db.openDB();
    const stores = Array.from(handle.objectStoreNames);
    handle.close();

    expect(stores).toEqual(
      expect.arrayContaining([
        'missions',
        'profile',
        'connector_status',
        'generated_assets',
        'mission_tracking',
        'quarantine',
      ])
    );
    expect(db.DB_VERSION).toBe(4);
  });

  it('is idempotent — a second run is a no-op success [Inv-3]', async () => {
    const db = await importFresh();

    const first = await db.runMigrations();
    const statusAfterFirst = db.getMigrationStatus();
    const second = await db.runMigrations();
    const statusAfterSecond = db.getMigrationStatus();

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    // Terminal state is idle both times.
    expect(statusAfterFirst.state === 'idle' || statusAfterFirst.state === 'quarantine').toBe(true);
    expect(statusAfterSecond.state).toBe(statusAfterFirst.state);
  });

  it('detects downgrade without data loss (no deleteDatabase) [Inv-4]', async () => {
    // Pre-create the DB at a version higher than DB_VERSION with user data.
    const userRecord = { id: 'precious', payload: 'do-not-destroy' };
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 5);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('future_store', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const handle = req.result;
        const tx = handle.transaction('future_store', 'readwrite');
        tx.objectStore('future_store').put(userRecord);
        tx.oncomplete = () => {
          handle.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    const db = await importFresh();
    const storedBefore = await db.probeStoredDbVersion();
    expect(storedBefore).toBe(5);

    const result = await db.runMigrations();

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe('downgrade');
    expect(db.getMigrationStatus().state).toBe('downgrade');

    // Data MUST still be there — downgrade never destroys.
    const preserved = await new Promise<unknown>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 5);
      req.onsuccess = () => {
        const handle = req.result;
        if (!handle.objectStoreNames.contains('future_store')) {
          handle.close();
          resolve(null);
          return;
        }
        const tx = handle.transaction('future_store', 'readonly');
        const get = tx.objectStore('future_store').get('precious');
        get.onsuccess = () => {
          handle.close();
          resolve(get.result);
        };
        get.onerror = () => reject(get.error);
      };
      req.onerror = () => reject(req.error);
    });
    expect(preserved).toEqual(userRecord);
  });

  it('quarantine is non-destructive: keeps valid, moves invalid [Inv-6]', async () => {
    const db = await importFresh();

    // First run brings the DB to v4 + idle.
    await db.runMigrations();

    // Inject 8 valid missions via the validated writer...
    const { generateMockMissions } = await import('../../../src/dev/mocks');
    const valid = generateMockMissions(8);
    await db.saveMissions(valid);

    // ...and 2 malformed records directly into the store (>10% invalid).
    const handle = await db.openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = handle.transaction('missions', 'readwrite');
      const store = tx.objectStore('missions');
      store.put({ id: 'bad-1' }); // missing required fields
      store.put({ id: 'bad-2', garbage: true });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    handle.close();

    // Second run: verifyStores finds the invalid records, ratio = 2/10 = 20% > 10%.
    const result = await db.runMigrations();
    expect(result.ok).toBe(true);

    // Valid missions remain readable.
    const survivors = await db.getMissions();
    const survivorIds = survivors.map((m) => m.id).sort();
    expect(survivorIds).toEqual(valid.map((m) => m.id).sort());

    // Invalid records were moved to the quarantine store (not deleted into the void).
    const quarantined = await new Promise<unknown[]>((resolve, reject) => {
      const h = indexedDB.open(DB_NAME, 4);
      h.onsuccess = () => {
        const tx = h.result.transaction('quarantine', 'readonly');
        const req = tx.objectStore('quarantine').getAll();
        req.onsuccess = () => {
          h.result.close();
          resolve(req.result);
        };
        req.onerror = () => reject(req.error);
      };
      h.onerror = () => reject(h.error);
    });
    const quarantinedIds = (quarantined as Array<{ id: string }>).map((q) => q.id).sort();
    expect(quarantinedIds).toEqual(['missions:bad-1', 'missions:bad-2']);
  });

  it('concurrent runMigrations() calls share a single in-flight promise [Inv-9]', async () => {
    const db = await importFresh();

    const p1 = db.runMigrations();
    const p2 = db.runMigrations();

    // Cold-start guard: identical promise reference (dedup).
    expect(p1).toBe(p2);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.ok).toBe(true);
    expect(r2).toBe(r1);
  });
});
