/**
 * Migration orchestrator tests — `src/models/db-migration.model.md` (Verify).
 *
 * Covers the key transitions and invariants of the state model:
 *  - Structural cascade v0 → DB_VERSION (all stores created)        [Inv-1, T-struct]
 *  - Idempotency (second run is a no-op)                            [Inv-3]
 *  - Downgrade detection (stored > DB_VERSION → no data loss)       [Inv-4]
 *  - Quarantine is non-destructive (>10% invalid → move, not wipe)  [Inv-6]
 *  - Verify is migration-gated (skipped when no migration pending)   [Inv-6b]
 *  - Concurrent runMigrations() dedup (cold-start guard)            [Inv-9]
 *
 * Module singletons (migrationSnapshot, migrationInProgress, tracked opener)
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
    vi.restoreAllMocks();
    await dropDatabase();
  });

  it('returns a non-destructive open failure and never calls deleteDatabase', async () => {
    const db = await importFresh();
    const originalOpen = indexedDB.open.bind(indexedDB);
    let versionedOpenFailed = false;
    vi.spyOn(indexedDB, 'open').mockImplementation((name: string, version?: number) => {
      if (version === db.DB_VERSION && !versionedOpenFailed) {
        versionedOpenFailed = true;
        throw new Error('synthetic open failure');
      }
      return version === undefined ? originalOpen(name) : originalOpen(name, version);
    });
    const deleteDatabase = vi.spyOn(indexedDB, 'deleteDatabase');

    const result = await db.runMigrations();

    expect(versionedOpenFailed).toBe(true);
    expect(deleteDatabase).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      code: 'corrupt',
      message: 'synthetic open failure',
    });
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
    db.releaseDB(handle);

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
    expect(db.DB_VERSION).toBe(5);
  });

  it('keeps the non-cutover schema at DB5/data2 without epoch or bootstrap writes', async () => {
    const db = await importFresh();

    const result = await db.runMigrations();

    expect(result.ok).toBe(true);
    expect(db.DB_VERSION).toBe(5);
    expect(db.APP_DATA_VERSION).toBe(2);
    if (!result.ok) {
      return;
    }
    expect(result.to).toEqual({ db: 5, data: 2 });

    const handle = await db.openDB();
    const stores = Array.from(handle.objectStoreNames);
    db.releaseDB(handle);

    expect(stores).not.toContain('tracking_meta');
    expect(stores).not.toContain('tracking_mutations');
    expect(stores).not.toContain('tracking_outbox');
    expect(Object.keys(mockStorage)).not.toEqual(
      expect.arrayContaining(['missionpulse.datasetEpoch', 'missionpulse.localDatasetBootstrap'])
    );
  });

  it('upgrades legacy tracking v4 databases by adding quarantine at v5', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 4);
      req.onupgradeneeded = () => {
        const handle = req.result;
        const missionStore = handle.createObjectStore('missions', { keyPath: 'id' });
        missionStore.createIndex('source', 'source', { unique: false });
        missionStore.createIndex('scrapedAt', 'scrapedAt', { unique: false });
        handle.createObjectStore('profile', { keyPath: 'id' });
        handle.createObjectStore('connector_status', { keyPath: 'connectorId' });
        const genStore = handle.createObjectStore('generated_assets', { keyPath: 'id' });
        genStore.createIndex('missionId', 'missionId', { unique: false });
        const trackingStore = handle.createObjectStore('mission_tracking', {
          keyPath: 'missionId',
        });
        trackingStore.createIndex('currentStatus', 'currentStatus', { unique: false });
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });

    const db = await importFresh();
    const result = await db.runMigrations();
    expect(result.ok).toBe(true);

    const handle = await db.openDB();
    const stores = Array.from(handle.objectStoreNames);
    db.releaseDB(handle);
    expect(stores).toEqual(expect.arrayContaining(['mission_tracking', 'quarantine']));
  });

  it('preserves the profile object-store key during the v1→v2 profile data migration', async () => {
    const db = await importFresh();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, db.DB_VERSION);
      req.onupgradeneeded = () => {
        const handle = req.result;
        const missionStore = handle.createObjectStore('missions', { keyPath: 'id' });
        missionStore.createIndex('source', 'source', { unique: false });
        missionStore.createIndex('scrapedAt', 'scrapedAt', { unique: false });
        handle.createObjectStore('profile', { keyPath: 'id' });
        handle.createObjectStore('connector_status', { keyPath: 'connectorId' });
        const genStore = handle.createObjectStore('generated_assets', { keyPath: 'id' });
        genStore.createIndex('missionId', 'missionId', { unique: false });
        const trackingStore = handle.createObjectStore('mission_tracking', {
          keyPath: 'missionId',
        });
        trackingStore.createIndex('currentStatus', 'currentStatus', { unique: false });
        const quarantineStore = handle.createObjectStore('quarantine', { keyPath: 'id' });
        quarantineStore.createIndex('originalStore', 'originalStore', { unique: false });
      };
      req.onsuccess = () => {
        const handle = req.result;
        const tx = handle.transaction('profile', 'readwrite');
        tx.objectStore('profile').put({
          id: 'current',
          firstName: 'Guy',
          stack: ['Svelte'],
          searchKeywords: ['Chrome extension'],
          keywords: ['TypeScript'],
          tjmMin: 600,
          tjmMax: 800,
          location: 'Paris',
          remote: 'hybrid',
          seniority: 'senior',
          jobTitle: 'Lead Frontend',
        });
        tx.oncomplete = () => {
          handle.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    const result = await db.runMigrations();
    expect(result.ok).toBe(true);

    const migrated = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, db.DB_VERSION);
      req.onsuccess = () => {
        const handle = req.result;
        const tx = handle.transaction('profile', 'readonly');
        const get = tx.objectStore('profile').get('current');
        get.onsuccess = () => {
          handle.close();
          resolve(get.result as Record<string, unknown> | undefined);
        };
        get.onerror = () => reject(get.error);
      };
      req.onerror = () => reject(req.error);
    });

    expect(migrated).toEqual(
      expect.objectContaining({
        id: 'current',
        keywords: ['TypeScript', 'Svelte', 'Chrome extension'],
        experiences: [],
        availability: null,
      })
    );
    expect(migrated).not.toHaveProperty('stack');
    expect(migrated).not.toHaveProperty('searchKeywords');
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
      const req = indexedDB.open(DB_NAME, 6);
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
    expect(storedBefore).toBe(6);

    const result = await db.runMigrations();

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe('downgrade');
    expect(db.getMigrationStatus().state).toBe('downgrade');

    // Data MUST still be there — downgrade never destroys.
    const preserved = await new Promise<unknown>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 6);
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

    // Build the v4 schema WITHOUT running the orchestrator, so the app-data
    // version marker stays unset. The next runMigrations() will therefore see
    // `dataPending === true`, enter `verifying`, and run the quarantine sweep.
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
    db.releaseDB(handle);

    // First orchestrator run: dataPending=true → verify runs → 2/10 = 20% > 10%.
    const result = await db.runMigrations();
    expect(result.ok).toBe(true);

    // Valid missions remain readable.
    const survivors = await db.getMissions();
    const survivorIds = survivors.map((m) => m.id).sort();
    expect(survivorIds).toEqual(valid.map((m) => m.id).sort());

    // Invalid records were moved to the quarantine store (not deleted into the void).
    const quarantined = await new Promise<unknown[]>((resolve, reject) => {
      const h = indexedDB.open(DB_NAME, db.DB_VERSION);
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

  it('skips verifyStores on a steady-state cold start (no migration pending) [Inv-6b]', async () => {
    const db = await importFresh();

    // Bring the DB fully up to date (versions current).
    const first = await db.runMigrations();
    expect(first.ok).toBe(true);

    // Inject valid + bad records AFTER the DB is at steady state.
    const { generateMockMissions } = await import('../../../src/dev/mocks');
    const valid = generateMockMissions(8);
    await db.saveMissions(valid);

    const handle = await db.openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = handle.transaction('missions', 'readwrite');
      const store = tx.objectStore('missions');
      store.put({ id: 'bad-1' }); // missing required fields
      store.put({ id: 'bad-2', garbage: true });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.releaseDB(handle);

    // Second run: nothing pending → verify is skipped → bad records stay in place.
    const second = await db.runMigrations();
    expect(second.ok).toBe(true);

    // Valid missions still readable (runtime parse skips the bad ones).
    const survivors = await db.getMissions();
    expect(survivors.map((m) => m.id).sort()).toEqual(valid.map((m) => m.id).sort());

    // Quarantine stays EMPTY — proving verify did not run (20% bad would otherwise
    // trigger quarantine).
    const quarantined = await new Promise<unknown[]>((resolve, reject) => {
      const h = indexedDB.open(DB_NAME, db.DB_VERSION);
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
    expect(quarantined).toEqual([]);
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
