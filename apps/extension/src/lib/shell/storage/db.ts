import type { Mission, MissionSource } from '../../core/types/mission';
import type { PersistedConnectorStatus } from '../../core/types/connector-status';
import type { UserProfile } from '../../core/types/profile';
import { UserProfileSchema } from '../../core/types/schemas';
import { parseMission, parseUserProfile } from '../../core/types/type-guards';
import { clearSemanticCache } from './semantic-cache';
import { createDbHandleRegistry } from './db-handle-registry';
import { createDbOpener } from './db-opener';
import {
  dataMigrationsFor,
  structuralMigrationsFor,
  type DataMigrationDeps,
} from './migration-registry';
import {
  MIGRATION_KEYS,
  QUARANTINE_REJECT_RATIO,
  type MigrationError,
  type MigrationErrorCode,
  type MigrationResult,
  type MigrationSnapshot,
  type MigrationState,
} from './migration-types';

// ============================================================================
// Types for Pagination and Querying
// ============================================================================

// MissionSortBy is now defined in core/scoring/sort-missions.ts
import { sortMissions, type MissionSortBy } from '../../core/scoring/sort-missions';
export type { MissionSortBy };

export interface PaginatedMissions {
  missions: Mission[];
  total: number;
  hasMore: boolean;
}

export interface PaginatedQueryOptions {
  page: number;
  pageSize: number;
  sortBy?: MissionSortBy;
  filterSource?: MissionSource;
}

export const MISSIONPULSE_DB_NAME = 'missionpulse';
const DB_NAME = MISSIONPULSE_DB_NAME;

const deserializeStoredDate = (value: string): Date | null => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Structural IndexedDB version. Bump when a store/index is added or removed.
 * Must equal `STRUCTURAL_MIGRATIONS.length` in `migration-registry.ts`.
 */
export const DB_VERSION = 5;

/**
 * Applicative data version. Bump when an entity Zod schema changes shape and
 * a data migration is appended to `DATA_MIGRATIONS`.
 */
export const APP_DATA_VERSION = 2;

// ============================================================================
// Tracked single opener (non-cutover DB5/data2 adapter)
// ============================================================================

const OPEN_BLOCKED_TIMEOUT_MS = 750;

// Deliberately dormant until LocalDataReset and StartupBarrier cut over
// atomically. A null provider is tracking-only and proves no reset readiness.
const dbHandleRegistry = createDbHandleRegistry({ getActiveResetToken: () => null });
const dbOpener = createDbOpener({
  registry: dbHandleRegistry,
  databaseName: DB_NAME,
  targetVersion: DB_VERSION,
  allocateOwnerId: () => crypto.randomUUID(),
  openRequest: (name, version) =>
    version === undefined ? indexedDB.open(name) : indexedDB.open(name, version),
  scheduleBlockedTimeout: (effect, delayMs) => setTimeout(effect, delayMs),
  cancelBlockedTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  blockedTimeoutMs: OPEN_BLOCKED_TIMEOUT_MS,
  applyStructuralUpgrade: (request, event) => {
    const migrations = structuralMigrationsFor(event.oldVersion);
    for (const migration of migrations) {
      migration(request.result);
    }
  },
});

/**
 * Opens the MissionPulse database at `DB_VERSION`. THE ONLY OPENER in the
 * extension (see db-migration.model.md invariant 1).
 *
 * The tracked opener reserves before the native request, registers before
 * delivery, closes on versionchange through the registry and never retries a
 * blocked request automatically.
 *
 * NOTE: callers that need to detect a downgrade (stored version > DB_VERSION)
 * must call `probeStoredDbVersion()` first. `openDB()` itself throws
 * `VersionError` if the stored version is higher — the orchestrator handles
 * that case.
 */
export function openDB(): Promise<IDBDatabase> {
  return dbOpener.openBusiness();
}

function openStartupDB(): Promise<IDBDatabase> {
  return dbOpener.openStartup();
}

export function releaseDB(db: IDBDatabase): void {
  dbOpener.release(db);
}

/**
 * Probes the actual stored DB version without requesting an upgrade.
 * Uses `indexedDB.databases()` when available (Chrome ≥ 71), else opens
 * without a version and reads `db.version`.
 *
 * Returns 0 if the DB does not exist yet.
 */
export async function probeStoredDbVersion(): Promise<number> {
  const databases = (
    indexedDB as unknown as { databases?: () => Promise<{ name: string; version: number }[]> }
  ).databases;

  if (typeof databases === 'function') {
    try {
      const list = await databases.call(indexedDB);
      const entry = list.find((d) => d.name === DB_NAME);
      return entry?.version ?? 0;
    } catch {
      // fall through to unversioned open
    }
  }

  return dbOpener.probeStoredVersion();
}

// ============================================================================
// Migration orchestrator
// ============================================================================

let migrationSnapshot: MigrationSnapshot = {
  state: 'idle',
  storedDbVersion: null,
  storedDataVersion: null,
  lastError: null,
  rejectedCount: 0,
};

let migrationInProgress: Promise<MigrationResult> | null = null;

/**
 * Reactive accessor for the current migration state. UI/dev panel reads this.
 */
export function getMigrationStatus(): MigrationSnapshot {
  return migrationSnapshot;
}

/**
 * Subscribers notified on every snapshot change (simple pub/sub, no runes so
 * it works in the service worker too).
 */
const listeners = new Set<(snapshot: MigrationSnapshot) => void>();

export function subscribeMigrationState(
  listener: (snapshot: MigrationSnapshot) => void
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(state: MigrationState, extra?: Partial<MigrationSnapshot>): void {
  migrationSnapshot = { ...migrationSnapshot, state, ...extra };
  for (const listener of listeners) {
    try {
      listener(migrationSnapshot);
    } catch {
      // listener errors must not break the orchestrator
    }
  }
}

function isVersionError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'VersionError';
}

function isQuotaError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === 'QuotaExceededError';
  }
  if (err instanceof Error) {
    return err.message.includes('QUOTA_BYTES') || err.message.includes('quota');
  }
  return false;
}

async function readStoredDataVersion(): Promise<number | null> {
  const stored = await chrome.storage.local.get(MIGRATION_KEYS.appDataVersion);
  const raw = stored[MIGRATION_KEYS.appDataVersion];
  return typeof raw === 'number' ? raw : null;
}

async function writeStoredDataVersion(version: number): Promise<void> {
  await chrome.storage.local.set({ [MIGRATION_KEYS.appDataVersion]: version });
}

async function bumpRejectedCount(delta: number): Promise<void> {
  if (delta <= 0) {
    return;
  }
  const current = migrationSnapshot.rejectedCount;
  const next = Math.min(Number.MAX_SAFE_INTEGER, current + delta);
  migrationSnapshot = { ...migrationSnapshot, rejectedCount: next };
  try {
    await chrome.storage.local.set({ [MIGRATION_KEYS.rejectedCount]: next });
  } catch {
    // non-critical
  }
}

async function loadInitialRejectedCount(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get(MIGRATION_KEYS.rejectedCount);
    const raw = stored[MIGRATION_KEYS.rejectedCount];
    if (typeof raw === 'number') {
      migrationSnapshot = { ...migrationSnapshot, rejectedCount: raw };
    }
  } catch {
    // non-critical
  }
}

/**
 * Runtime reader guard (model invariant 10): when `parseMission` rejects a
 * stored record at read time, surface it to the orchestrator's reject
 * counter instead of silently dropping it. Fire-and-forget — readers stay
 * non-blocking.
 */
function trackRuntimeReject(raw: unknown): void {
  bumpRejectedCount(1).catch(() => {
    // non-critical
  });
  if (import.meta.env.DEV) {
    console.warn('[DB] Runtime parseMission reject', raw);
  }
}

/**
 * Runs the migration orchestrator end-to-end. Safe to call concurrently —
 * the same promise is returned to all callers (db-migration.model.md:
 * "cold-start guard").
 *
 * State machine: see `src/models/db-migration.model.md`.
 */
export function runMigrations(): Promise<MigrationResult> {
  if (migrationInProgress) {
    return migrationInProgress;
  }

  migrationInProgress = (async () => {
    await loadInitialRejectedCount();
    return runMigrationLoop(0);
  })()
    .catch((err): MigrationResult => {
      const code: MigrationErrorCode = isVersionError(err)
        ? 'downgrade'
        : isQuotaError(err)
          ? 'quota'
          : 'unknown';
      const message = err instanceof Error ? err.message : String(err);
      setState('failed', {
        lastError: { code, message },
      });
      void persistMigrationError({ code, message });
      return { ok: false, code, message };
    })
    .finally(() => {
      migrationInProgress = null;
    });

  return migrationInProgress;
}

async function runMigrationLoop(versionRaceAttempt: number): Promise<MigrationResult> {
  setState('checking');

  const storedDbVersion = await probeStoredDbVersion();

  // Downgrade detection — must happen BEFORE any versioned open.
  if (storedDbVersion > DB_VERSION) {
    setState('downgrade', {
      storedDbVersion,
      lastError: {
        code: 'downgrade',
        message: `Stored DB version ${storedDbVersion} > expected ${DB_VERSION}`,
      },
    });
    await chrome.storage.local.set({
      [MIGRATION_KEYS.downgrade]: { stored: storedDbVersion, expected: DB_VERSION },
    });
    return {
      ok: false,
      code: 'downgrade',
      message: `Downgrade detected: stored ${storedDbVersion} > expected ${DB_VERSION}`,
    };
  }

  // Open with version. May throw on structural failure or corruption.
  let db: IDBDatabase;
  try {
    db = await openStartupDB();
  } catch (err) {
    if (isVersionError(err)) {
      // Race: another context upgraded beneath us. Re-probe and retry once.
      if (versionRaceAttempt === 0) {
        return runMigrationLoop(1);
      }
      setState('downgrade', {
        lastError: { code: 'downgrade', message: 'VersionError during open' },
      });
      return { ok: false, code: 'downgrade', message: 'VersionError during open' };
    }
    const message = err instanceof Error ? err.message : String(err);
    setState('failed', {
      lastError: { code: 'corrupt', message },
    });
    return { ok: false, code: 'corrupt', message };
  }

  const fromDbVersion = storedDbVersion;
  const storedDataVersion = await readStoredDataVersion();
  const fromDataVersion = storedDataVersion ?? 0;

  setState('readVersions', { storedDbVersion: fromDbVersion, storedDataVersion });

  const structuralPending = fromDbVersion < DB_VERSION;
  const dataPending = fromDataVersion < APP_DATA_VERSION;

  if (structuralPending) {
    // Already applied during openDB()'s onupgradeneeded; just reflect the state.
    setState('migratingStruct');
  }

  if (dataPending) {
    setState('migratingData');
    try {
      await runDataMigrations(fromDataVersion, db);
      await writeStoredDataVersion(APP_DATA_VERSION);
    } catch (err) {
      releaseDB(db);
      const code: MigrationErrorCode = isQuotaError(err) ? 'quota' : 'data_throw';
      const message = err instanceof Error ? err.message : String(err);
      setState('failed', { lastError: { code, message } });
      return { ok: false, code, message };
    }
  }

  // Post-migration integrity sweep. Only runs when a structural or data
  // migration was actually applied this session (the realistic corruption
  // window: schema/data drift). On steady-state cold starts — both versions
  // current — the O(n) scan is skipped; day-to-day corruption is still
  // caught lazily by the runtime parse-on-read guard (`trackRuntimeReject`).
  const migrationApplied = structuralPending || dataPending;
  if (migrationApplied) {
    setState('verifying');
    const verifyResult = await verifyStores(db);
    releaseDB(db);

    if (verifyResult.quarantineNeeded) {
      setState('quarantine');
      try {
        await quarantineInvalidRecords(verifyResult.invalidByStore);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState('failed', { lastError: { code: 'data_throw', message } });
        return { ok: false, code: 'data_throw', message };
      }
    }
  } else {
    releaseDB(db);
  }

  await chrome.storage.local.remove(MIGRATION_KEYS.downgrade);

  setState('idle', {
    storedDbVersion: DB_VERSION,
    storedDataVersion: APP_DATA_VERSION,
    lastError: null,
  });

  return {
    ok: true,
    from: { db: fromDbVersion || null, data: storedDataVersion },
    to: { db: DB_VERSION, data: APP_DATA_VERSION },
  };
}

async function runDataMigrations(fromVersion: number, db: IDBDatabase): Promise<void> {
  const migrations = dataMigrationsFor(fromVersion);
  if (migrations.length === 0) {
    return;
  }

  const deps: DataMigrationDeps = {
    db,
    runRW: (stores, fn) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(stores, 'readwrite');
        const objectStores = stores.map((s) => tx.objectStore(s));
        let result: unknown;
        Promise.resolve()
          .then(() => fn(...objectStores))
          .then((value) => {
            result = value;
          })
          .catch((err) => {
            try {
              tx.abort();
            } catch {
              // ignore
            }
            reject(err);
          });
        tx.oncomplete = () => resolve(result as never);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
      }),
  };

  for (const migration of migrations) {
    await migration(deps);
  }
}

interface VerifyResult {
  quarantineNeeded: boolean;
  invalidByStore: Record<string, unknown[]>;
}

async function verifyStores(db: IDBDatabase): Promise<VerifyResult> {
  const checks: Array<{ store: string; validate: (record: unknown) => boolean }> = [
    { store: 'missions', validate: (r) => parseMission(r, deserializeStoredDate) !== null },
    {
      store: 'profile',
      validate: (r) => {
        if (typeof r !== 'object' || r === null) {
          return false;
        }
        const { id: _id, ...rest } = r as Record<string, unknown>;
        return parseUserProfile(rest) !== null;
      },
    },
  ];

  const invalidByStore: Record<string, unknown[]> = {};
  let totalChecked = 0;
  let totalInvalid = 0;

  for (const { store, validate } of checks) {
    if (!db.objectStoreNames.contains(store)) {
      continue;
    }

    const records = await readAllFromStore(db, store);
    const invalid: unknown[] = [];
    for (const record of records) {
      totalChecked += 1;
      if (!validate(record)) {
        invalid.push(record);
        totalInvalid += 1;
      }
    }
    if (invalid.length > 0) {
      invalidByStore[store] = invalid;
    }
  }

  if (totalInvalid > 0) {
    await bumpRejectedCount(totalInvalid);
  }

  const ratio = totalChecked > 0 ? totalInvalid / totalChecked : 0;
  return {
    quarantineNeeded: totalInvalid > 0 && ratio > QUARANTINE_REJECT_RATIO,
    invalidByStore,
  };
}

function readAllFromStore(db: IDBDatabase, store: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function quarantineInvalidRecords(invalidByStore: Record<string, unknown[]>): Promise<void> {
  const db = await openStartupDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['quarantine', ...Object.keys(invalidByStore)], 'readwrite');
      const quarantineStore = tx.objectStore('quarantine');

      for (const [originalStore, records] of Object.entries(invalidByStore)) {
        const sourceStore = tx.objectStore(originalStore);
        for (const record of records) {
          const id =
            (record as { id?: unknown }).id ?? (record as { missionId?: unknown }).missionId;
          if (id === undefined) {
            continue;
          }
          quarantineStore.put({
            id: `${originalStore}:${String(id)}`,
            originalStore,
            originalId: id,
            record,
            quarantinedAt: Date.now(),
          });
          sourceStore.delete(id as IDBValidKey);
        }
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Quarantine tx aborted'));
    });
  } finally {
    releaseDB(db);
  }
}

async function persistMigrationError(error: MigrationError): Promise<void> {
  try {
    await chrome.storage.local.set({ [MIGRATION_KEYS.migrationError]: error });
  } catch {
    // non-critical
  }
}

// Generic helper for store operations
export function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  return openDB().then((db) => {
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result: T | undefined;
      const request = fn(store);
      request.onsuccess = () => {
        result = request.result as T;
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => {
        releaseDB(db);
        resolve(result as T);
      };
      tx.onerror = () => {
        releaseDB(db);
        reject(tx.error);
      };
      tx.onabort = () => {
        releaseDB(db);
        reject(tx.error);
      };
    });
  });
}

// Missions
/**
 * Save missions to IndexedDB with deduplication.
 * Uses put() which is idempotent (insert or update).
 * Missions with the same ID are deduplicated before writing.
 */
function createTransactionAbortError(): DOMException {
  return new DOMException('The IndexedDB transaction was aborted.', 'AbortError');
}

function throwIfTransactionAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createTransactionAbortError();
  }
}

export async function saveMissions(missions: Mission[], signal?: AbortSignal): Promise<void> {
  throwIfTransactionAborted(signal);
  if (missions.length === 0) {
    return;
  }

  const db = await openDB();
  try {
    throwIfTransactionAborted(signal);
  } catch (error) {
    releaseDB(db);
    throw error;
  }
  const tx = db.transaction('missions', 'readwrite');
  const store = tx.objectStore('missions');

  // Deduplicate by ID before writing
  const missionMap = new Map<string, Mission>();
  for (const mission of missions) {
    missionMap.set(mission.id, mission);
  }

  const uniqueMissions = Array.from(missionMap.values());

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      signal?.removeEventListener('abort', onAbortRequested);
      releaseDB(db);
    };
    const resolveOnce = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };
    const rejectOnce = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbortRequested = (): void => {
      if (settled) {
        return;
      }
      try {
        tx.abort();
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'InvalidStateError')) {
          rejectOnce(error);
        }
        // InvalidStateError means the transaction already committed or aborted;
        // its terminal event remains the deterministic winner.
      }
    };

    signal?.addEventListener('abort', onAbortRequested, { once: true });
    tx.oncomplete = () => {
      if (import.meta.env.DEV && uniqueMissions.length > 0) {
        const dedupedCount = missions.length - uniqueMissions.length;
        if (dedupedCount > 0) {
          console.debug(
            `[DB] Saved ${uniqueMissions.length} missions (${dedupedCount} duplicates deduped)`
          );
        }
      }
      resolveOnce();
    };
    tx.onerror = () => {
      // IndexedDB follows a request/transaction error with `abort`; wait for
      // that event so callers observe rollback quiescence before rejection.
    };
    tx.onabort = () => {
      rejectOnce(
        signal?.aborted
          ? createTransactionAbortError()
          : (tx.error ?? createTransactionAbortError())
      );
    };

    if (signal?.aborted) {
      onAbortRequested();
      return;
    }

    try {
      for (const mission of uniqueMissions) {
        store.put(mission);
      }
    } catch (error) {
      try {
        tx.abort();
      } catch {
        rejectOnce(error);
      }
    }
  });
}

export async function getMissions(): Promise<Mission[]> {
  // Use paginated query with large page size for backwards compatibility
  const result = await getMissionsPaginated({
    page: 0,
    pageSize: 10000,
    sortBy: 'date',
  });
  return result.missions;
}

// ============================================================================
// Optimized Query Functions
// ============================================================================

/**
 * Get the total count of missions without loading all data into memory.
 * Uses store.count() which is much faster than getAll().length for large datasets.
 */
export async function getMissionCount(): Promise<number> {
  return withStore<number>('missions', 'readonly', (store) => store.count());
}

/**
 * Get missions for a specific source using the source index.
 * Efficient filtered query that doesn't load all missions.
 */
export async function getMissionsBySource(source: MissionSource): Promise<Mission[]> {
  const db = await openDB();
  const tx = db.transaction('missions', 'readonly');
  const store = tx.objectStore('missions');
  const index = store.index('source');

  return new Promise((resolve, reject) => {
    const request = index.getAll(source);
    request.onsuccess = () => {
      const rawMissions = request.result as unknown[];
      const validMissions: Mission[] = [];

      for (const raw of rawMissions) {
        const mission = parseMission(raw, deserializeStoredDate);
        if (mission) {
          validMissions.push(mission);
        } else {
          trackRuntimeReject(raw);
        }
      }

      resolve(validMissions);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get recent missions within a time window using the scrapedAt index.
 * Uses IDBKeyRange for efficient filtered query.
 * @param maxAgeDays Maximum age in days
 */
export async function getRecentMissions(maxAgeDays: number): Promise<Mission[]> {
  const db = await openDB();
  const tx = db.transaction('missions', 'readonly');
  const store = tx.objectStore('missions');
  const index = store.index('scrapedAt');

  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const range = IDBKeyRange.lowerBound(cutoff);

  return new Promise((resolve, reject) => {
    const request = index.getAll(range);
    request.onsuccess = () => {
      const rawMissions = request.result as unknown[];
      const validMissions: Mission[] = [];

      for (const raw of rawMissions) {
        const mission = parseMission(raw, deserializeStoredDate);
        if (mission) {
          validMissions.push(mission);
        } else {
          trackRuntimeReject(raw);
        }
      }

      resolve(validMissions);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get missions with pagination and optional filtering/sorting.
 *
 * NOTE: For 'score' and 'tjm' sorting, we must load all missions into memory
 * because IndexedDB cannot sort by arbitrary JS properties. The 'date' sort
 * could use the scrapedAt index with cursor-based pagination for better perf,
 * but for consistency and simplicity we use the same approach for all sorts.
 * At typical dataset sizes (<5000 missions with 90-day purge), this is fine.
 *
 * @param options Pagination options:
 *   - page: 0-indexed page number
 *   - pageSize: Number of items per page
 *   - sortBy: 'date' (default), 'score', or 'tjm'
 *   - filterSource: Optional source filter
 *
 * @returns PaginatedMissions with missions, total count, and hasMore flag
 */
export async function getMissionsPaginated(
  options: PaginatedQueryOptions
): Promise<PaginatedMissions> {
  const { page, pageSize, sortBy = 'date', filterSource } = options;

  const db = await openDB();
  const tx = db.transaction('missions', 'readonly');
  const store = tx.objectStore('missions');

  // Get total count first
  const totalRequest = store.count();
  const totalCount = await new Promise<number>((resolve, reject) => {
    totalRequest.onsuccess = () => resolve(totalRequest.result);
    totalRequest.onerror = () => reject(totalRequest.error);
  });

  // Fetch all missions (we need to sort in memory for score/tjm)
  // For date sorting with source filter, we can use index
  let rawMissions: unknown[];

  if (filterSource) {
    const index = store.index('source');
    rawMissions = await new Promise<unknown[]>((resolve, reject) => {
      const request = index.getAll(filterSource);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } else {
    rawMissions = await new Promise<unknown[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Parse and validate missions
  const validMissions: Mission[] = [];
  for (const raw of rawMissions) {
    const mission = parseMission(raw, deserializeStoredDate);
    if (mission) {
      validMissions.push(mission);
    } else {
      trackRuntimeReject(raw);
    }
  }

  // Sort missions
  const sortedMissions = sortMissions(validMissions, sortBy);

  // Paginate
  const startIndex = page * pageSize;
  const paginatedMissions = sortedMissions.slice(startIndex, startIndex + pageSize);
  const hasMore = startIndex + pageSize < sortedMissions.length;

  return {
    missions: paginatedMissions,
    total: filterSource ? sortedMissions.length : totalCount,
    hasMore,
  };
}

// sortMissions is imported from core/scoring/sort-missions.ts (FC&IS compliant)

/**
 * Batch upsert missions with deduplication.
 * Uses put() which is idempotent (insert or update).
 * Only writes missions that are new or have changed.
 */
export async function upsertMissions(newMissions: Mission[]): Promise<number> {
  if (newMissions.length === 0) {
    return 0;
  }

  const db = await openDB();
  const tx = db.transaction('missions', 'readwrite');
  const store = tx.objectStore('missions');

  // Deduplicate by ID
  const missionMap = new Map<string, Mission>();
  for (const mission of newMissions) {
    missionMap.set(mission.id, mission);
  }

  const uniqueMissions = Array.from(missionMap.values());
  let writtenCount = 0;

  return new Promise((resolve, reject) => {
    for (const mission of uniqueMissions) {
      store.put(mission);
      writtenCount++;
    }

    tx.oncomplete = () => {
      if (import.meta.env.DEV && writtenCount > 0) {
        console.debug(
          `[DB] Upserted ${writtenCount} missions (${newMissions.length - uniqueMissions.length} duplicates deduped)`
        );
      }
      resolve(writtenCount);
    };

    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get a single mission by ID.
 * Returns null if not found or if the stored data is invalid.
 */
export async function getMissionById(id: string): Promise<Mission | null> {
  const raw = await withStore<unknown>('missions', 'readonly', (store) => store.get(id));
  if (!raw) {
    return null;
  }
  const mission = parseMission(raw, deserializeStoredDate);
  if (!mission) {
    trackRuntimeReject(raw);
    return null;
  }
  return mission;
}

export function clearMissions(): Promise<void> {
  return withStore<void>('missions', 'readwrite', (store) => store.clear());
}

// Profile
export async function saveProfile(profile: UserProfile): Promise<void> {
  const result = UserProfileSchema.safeParse(profile);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message).join(', ');
    throw new Error(`[DB] Profil invalide : ${messages}`);
  }

  await withStore<IDBValidKey>('profile', 'readwrite', (store) =>
    store.put({ ...profile, id: 'current' })
  );

  // Invalider le cache sémantique : les scores doivent être recalculés avec le nouveau profil
  try {
    await clearSemanticCache();
  } catch {
    // Le cache est non-critique, on ne bloque pas la sauvegarde du profil
    if (import.meta.env.DEV) {
      console.warn('[DB] Impossible de vider le cache sémantique après sauvegarde du profil');
    }
  }
}

export async function clearProfile(): Promise<void> {
  await withStore<void>('profile', 'readwrite', (store) => store.delete('current'));

  try {
    await clearSemanticCache();
  } catch {
    if (import.meta.env.DEV) {
      console.warn('[DB] Impossible de vider le cache sémantique après suppression du profil');
    }
  }
}

export async function getProfile(): Promise<UserProfile | null> {
  const result = await withStore<unknown>('profile', 'readonly', (store) => store.get('current'));

  if (!result) {
    return null;
  }

  // Vérifier que c'est un objet avec un id
  if (typeof result !== 'object' || result === null) {
    console.error('[DB] Profil corrompu: données non-objet', result);
    return null;
  }

  // Extraire l'id et le reste des propriétés
  const { id: _, ...profileData } = result as Record<string, unknown>;

  // Valider avec Zod
  const profile = parseUserProfile(profileData);

  if (!profile) {
    console.error('[DB] Profil invalide détecté dans IndexedDB:', profileData);
    return null;
  }

  return profile;
}

// Connector Statuses
export async function saveConnectorStatuses(statuses: PersistedConnectorStatus[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('connector_status', 'readwrite');
  const store = tx.objectStore('connector_status');
  for (const status of statuses) {
    store.put(status);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getConnectorStatuses(): Promise<PersistedConnectorStatus[]> {
  return withStore<PersistedConnectorStatus[]>('connector_status', 'readonly', (store) =>
    store.getAll()
  );
}

export async function clearConnectorStatuses(): Promise<void> {
  return withStore<void>('connector_status', 'readwrite', (store) => store.clear());
}

/**
 * Purge missions older than the specified number of days (based on scrapedAt)
 * @param maxAgeDays Maximum age in days (default: 90)
 * @returns Number of missions purged
 */
export async function purgeOldMissions(maxAgeDays = 90): Promise<number> {
  const db = await openDB();
  const tx = db.transaction('missions', 'readwrite');
  const store = tx.objectStore('missions');
  const index = store.index('scrapedAt');

  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const range = IDBKeyRange.upperBound(new Date(cutoff));

  return new Promise((resolve, reject) => {
    const request = index.openCursor(range);
    let purged = 0;

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        purged++;
        cursor.continue();
      }
    };

    request.onerror = () => {
      reject(request.error);
    };

    tx.oncomplete = () => {
      releaseDB(db);
      if (purged > 0 && import.meta.env.DEV) {
        console.debug(`[DB] Purged ${purged} missions older than ${maxAgeDays} days`);
      }
      resolve(purged);
    };

    tx.onerror = () => {
      releaseDB(db);
      reject(tx.error);
    };

    tx.onabort = () => {
      releaseDB(db);
      reject(tx.error ?? createTransactionAbortError());
    };
  });
}
