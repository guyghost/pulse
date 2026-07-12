/**
 * Migration registry — Shell, plain module (no runes, runs in service worker).
 *
 * Append-only ordered lists of structural and data migrations. The
 * orchestrator (`runMigrations` in `db.ts`) is the only caller.
 *
 * Structural migrations run inside `onupgradeneeded` and are keyed by
 * `oldVersion < N`. Data migrations run after a successful open and are keyed
 * by `stored APP_DATA_VERSION < N`.
 *
 * Rules (see `db-migration.model.md` invariants):
 * - Every data migration MUST be idempotent (safe to re-run on already-migrated
 *   records).
 * - No migration decision is delegated to an LLM.
 */

import type { UserProfile } from '../../core/types/profile';
import { UserProfileSchema } from '../../core/types/schemas';
import { appendUniqueNormalized } from '../../core/profile/normalize-profile';

// ============================================================================
// Structural migrations (run inside onupgradeneeded)
// ============================================================================

export type StructuralMigration = (db: IDBDatabase) => void;

/**
 * Ordered structural migrations. Index + 1 === the target DB_VERSION that the
 * migration brings the DB to. Example: migrations[2] runs when oldVersion < 3.
 *
 * Kept in sync with `DB_VERSION` in `db.ts`. Adding a store/index = append one
 * entry and bump `DB_VERSION`.
 */
export const STRUCTURAL_MIGRATIONS: StructuralMigration[] = [
  // → v1: missions + profile
  (db) => {
    const store = db.createObjectStore('missions', { keyPath: 'id' });
    store.createIndex('source', 'source', { unique: false });
    store.createIndex('scrapedAt', 'scrapedAt', { unique: false });
    db.createObjectStore('profile', { keyPath: 'id' });
  },
  // → v2: connector_status
  (db) => {
    db.createObjectStore('connector_status', { keyPath: 'connectorId' });
  },
  // → v3: generated_assets
  (db) => {
    const genStore = db.createObjectStore('generated_assets', { keyPath: 'id' });
    genStore.createIndex('missionId', 'missionId', { unique: false });
  },
  // → v4: mission_tracking (absorbed from tracking.ts)
  (db) => {
    const trackingStore = db.createObjectStore('mission_tracking', {
      keyPath: 'missionId',
    });
    trackingStore.createIndex('currentStatus', 'currentStatus', { unique: false });
  },
  // → v5: quarantine (on-demand invalid-record isolation)
  (db) => {
    if (db.objectStoreNames.contains('quarantine')) {
      return;
    }
    const quarantineStore = db.createObjectStore('quarantine', { keyPath: 'id' });
    quarantineStore.createIndex('originalStore', 'originalStore', { unique: false });
  },
];

// ============================================================================
// Data migrations (run after a successful open)
// ============================================================================

export interface DataMigrationDeps {
  /** The live IDBDatabase handle (already at DB_VERSION). */
  db: IDBDatabase;
  /**
   * Runs a readwrite transaction over `stores`, invokes `fn` with the
   * object stores, and resolves with `fn`'s return value once the
   * transaction completes. Rejects on tx error/abort.
   */
  runRW<T>(stores: string[], fn: (...stores: IDBObjectStore[]) => T | Promise<T>): Promise<T>;
}

export type DataMigration = (deps: DataMigrationDeps) => Promise<void>;

/**
 * Ordered data migrations. Index + 1 === the target APP_DATA_VERSION.
 *
 * v1 → v2 (below): unifies the legacy `stack` + `searchKeywords` profile
 * fields into a single `keywords: string[]`. Idempotent — safe to re-run on
 * already-migrated records (legacy fields are stripped, `keywords` preserved).
 */
export const DATA_MIGRATIONS: DataMigration[] = [
  // v1 → v2: merge `stack` + `searchKeywords` → `keywords` on stored profiles.
  async ({ runRW }) => {
    await runRW(['profile'], (profileStore) => {
      return new Promise<void>((resolve, reject) => {
        const cursorReq = profileStore.openCursor();
        cursorReq.onerror = () => reject(cursorReq.error);
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) {
            resolve();
            return;
          }
          const record = cursor.value as Record<string, unknown>;
          const asStrings = (value: unknown): string[] =>
            Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
          const existingKeywords = asStrings(record.keywords);
          const legacyStack = asStrings(record.stack);
          const legacySearchKeywords = asStrings(record.searchKeywords);
          const merged = appendUniqueNormalized([
            ...existingKeywords,
            ...legacyStack,
            ...legacySearchKeywords,
          ]).slice(0, 40);
          const next: Record<string, unknown> = { ...record, keywords: merged };
          delete next.stack;
          delete next.searchKeywords;
          const parsed = UserProfileSchema.safeParse(next);
          if (!parsed.success) {
            reject(new Error('v1→v2 profile migration produced an invalid profile'));
            return;
          }
          cursor.update({
            ...parsed.data,
            id: record.id ?? cursor.key ?? 'current',
          });
          cursor.continue();
        };
      });
    });
  },
];

// ============================================================================
// Helpers exported for the orchestrator
// ============================================================================

/**
 * Returns the structural migrations that must run when upgrading from
 * `oldVersion`. Empty for a no-op upgrade (e.g. same version).
 */
export function structuralMigrationsFor(oldVersion: number): StructuralMigration[] {
  return STRUCTURAL_MIGRATIONS.slice(oldVersion);
}

/**
 * Returns the data migrations that must run when upgrading APP_DATA_VERSION
 * from `oldVersion`.
 */
export function dataMigrationsFor(oldVersion: number): DataMigration[] {
  return DATA_MIGRATIONS.slice(oldVersion);
}

// Re-export schemas used by future data migrations so they don't drift.
export { UserProfileSchema, type UserProfile };
