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
  // → v4: mission_tracking (absorbed from tracking.ts) + quarantine (on-demand)
  (db) => {
    const trackingStore = db.createObjectStore('mission_tracking', {
      keyPath: 'missionId',
    });
    trackingStore.createIndex('currentStatus', 'currentStatus', { unique: false });
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
 * Today: APP_DATA_VERSION = 1, no data migrations yet. The registry exists so
 * the next schema change (e.g. adding a required field to Mission) is a
 * one-line append + version bump.
 */
export const DATA_MIGRATIONS: DataMigration[] = [
  // v0 → v1: example shape — currently a no-op placeholder.
  // Replace with a real migration when MissionSchema/UserProfileSchema change.
  // async (_deps) => { /* idempotent transform */ },
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
