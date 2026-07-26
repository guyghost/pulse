import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbHandleRegistry } from '../../../src/lib/shell/storage/db-handle-registry';
import { structuralMigrationsFor } from '../../../src/lib/shell/storage/migration-registry';
import { MIGRATION_KEYS } from '../../../src/lib/shell/storage/migration-types';

const registryCapture = vi.hoisted(() => ({
  current: null as DbHandleRegistry | null,
  liveHandles: new Set<IDBDatabase>(),
  registeredHandles: new Set<IDBDatabase>(),
  releaseCounts: new Map<IDBDatabase, number>(),
}));

vi.mock('../../../src/lib/shell/storage/db-handle-registry', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/lib/shell/storage/db-handle-registry')>();
  return {
    ...actual,
    createDbHandleRegistry: (
      dependencies: Parameters<typeof actual.createDbHandleRegistry>[0]
    ): DbHandleRegistry => {
      const registry = actual.createDbHandleRegistry(dependencies);
      const observed = Object.freeze({
        ...registry,
        register: (...args: Parameters<DbHandleRegistry['register']>) => {
          const registered = registry.register(...args);
          registryCapture.registeredHandles.add(registered.db);
          registryCapture.liveHandles.add(registered.db);
          return registered;
        },
        release: (db: IDBDatabase): void => {
          registryCapture.releaseCounts.set(db, (registryCapture.releaseCounts.get(db) ?? 0) + 1);
          registry.release(db);
          registryCapture.liveHandles.delete(db);
        },
      }) satisfies DbHandleRegistry;
      registryCapture.current = observed;
      return observed;
    },
  };
});

const DB_NAME = 'missionpulse';
let storageValues: Record<string, unknown>;
let storageGet: ReturnType<typeof vi.fn>;

function installChromeStorage(): void {
  storageGet = vi.fn(async (key: string | string[] | undefined) => {
    if (Array.isArray(key)) {
      return Object.fromEntries(
        key
          .filter((entry) => storageValues[entry] !== undefined)
          .map((entry) => [entry, storageValues[entry]])
      );
    }
    return key === undefined ? { ...storageValues } : { [key]: storageValues[key] };
  });
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: storageGet,
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(storageValues, items);
        }),
        remove: vi.fn(async (key: string | string[]) => {
          for (const entry of Array.isArray(key) ? key : [key]) {
            delete storageValues[entry];
          }
        }),
      },
    },
    runtime: { sendMessage: vi.fn(async () => undefined) },
  });
}

async function deleteDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('A leaked DB handle blocked test cleanup.'));
  });
}

function releaseCapturedHandles(): void {
  const registry = registryCapture.current;
  if (!registry) {
    return;
  }
  for (const handle of [...registryCapture.liveHandles]) {
    registry.release(handle);
  }
}

function resetRegistryCapture(): void {
  registryCapture.current = null;
  registryCapture.liveHandles.clear();
  registryCapture.registeredHandles.clear();
  registryCapture.releaseCounts.clear();
}

function expectAllHandlesReleasedExactlyOnce(): void {
  expect(registryCapture.registeredHandles.size).toBeGreaterThan(0);
  expect(registryCapture.liveHandles).toHaveLength(0);
  for (const handle of registryCapture.registeredHandles) {
    expect(registryCapture.releaseCounts.get(handle)).toBe(1);
  }
  expect(registryCapture.current?.snapshot()).toMatchObject({
    reservationCount: 0,
    tombstoneCount: 0,
    handleCount: 0,
  });
}

async function importFreshDb() {
  vi.resetModules();
  return (await import('../../../src/lib/shell/storage/db')) as typeof import('../../../src/lib/shell/storage/db');
}

async function createCurrentDatabaseWithInvalidProfile(targetVersion: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, targetVersion);
    request.onupgradeneeded = () => {
      for (const migration of structuralMigrationsFor(0)) {
        migration(request.result);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('profile', 'readwrite');
      tx.objectStore('profile').put({ id: 'current', invalid: true });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Profile setup aborted.'));
    };
    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => {
  releaseCapturedHandles();
  await deleteDatabase();
  resetRegistryCapture();
  storageValues = {};
  installChromeStorage();
});

afterEach(async () => {
  vi.restoreAllMocks();
  releaseCapturedHandles();
  await deleteDatabase();
  resetRegistryCapture();
  vi.unstubAllGlobals();
});

describe('runMigrations startup handle ownership', () => {
  it('releases its startup handle exactly once after success', async () => {
    storageValues[MIGRATION_KEYS.appDataVersion] = 2;
    const db = await importFreshDb();

    await expect(db.runMigrations()).resolves.toMatchObject({ ok: true });

    expectAllHandlesReleasedExactlyOnce();
  });

  it('releases its startup handle when the stored data-version read rejects', async () => {
    storageGet.mockImplementation(async (key: string | string[] | undefined) => {
      if (key === MIGRATION_KEYS.appDataVersion) {
        throw new Error('hostile chrome.storage read rejection');
      }
      return key === undefined ? { ...storageValues } : {};
    });
    const db = await importFreshDb();

    await expect(db.runMigrations()).resolves.toMatchObject({
      ok: false,
      code: 'unknown',
      message: 'hostile chrome.storage read rejection',
    });

    expectAllHandlesReleasedExactlyOnce();
  });

  it('releases its startup handle when verifyStores rejects', async () => {
    storageValues[MIGRATION_KEYS.appDataVersion] = 2;
    const db = await importFreshDb();
    const originalTransaction = IDBDatabase.prototype.transaction;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
      this: IDBDatabase,
      ...args: Parameters<IDBDatabase['transaction']>
    ): IDBTransaction {
      if (args[1] === 'readonly') {
        throw new Error('hostile verifyStores rejection');
      }
      return originalTransaction.apply(this, args);
    });

    await expect(db.runMigrations()).resolves.toMatchObject({
      ok: false,
      code: 'unknown',
      message: 'hostile verifyStores rejection',
    });

    expectAllHandlesReleasedExactlyOnce();
  });

  it('releases its startup handle exactly once after a data transaction abort', async () => {
    const db = await importFreshDb();
    await createCurrentDatabaseWithInvalidProfile(db.DB_VERSION);
    const abort = vi.spyOn(IDBTransaction.prototype, 'abort');

    await expect(db.runMigrations()).resolves.toMatchObject({
      ok: false,
      code: 'data_throw',
    });
    expect(abort).toHaveBeenCalled();

    expectAllHandlesReleasedExactlyOnce();
  });
});
