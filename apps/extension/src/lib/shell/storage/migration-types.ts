/**
 * Migration orchestrator types — Shell only.
 *
 * These types describe the lifecycle of IndexedDB structural + data migrations
 * as defined in `src/models/db-migration.model.md`. They must never be imported
 * from `src/lib/core/`.
 *
 * Shell module: pure types, no I/O.
 */

export type MigrationState =
  | 'checking'
  | 'readVersions'
  | 'downgrade'
  | 'migratingStruct'
  | 'migratingData'
  | 'verifying'
  | 'quarantine'
  | 'corruptRepair'
  | 'idle'
  | 'failed';

export type MigrationErrorCode =
  | 'downgrade'
  | 'corrupt'
  | 'quota'
  | 'structural_throw'
  | 'data_throw'
  | 'unknown';

export interface MigrationError {
  code: MigrationErrorCode;
  message: string;
}

export interface MigrationSnapshot {
  state: MigrationState;
  storedDbVersion: number | null;
  storedDataVersion: number | null;
  lastError: MigrationError | null;
  rejectedCount: number;
}

export interface MigrationVersions {
  from: { db: number | null; data: number | null };
  to: { db: number; data: number };
}

export type MigrationResult =
  | ({ ok: true } & MigrationVersions)
  | { ok: false; code: MigrationErrorCode; message: string };

/**
 * Storage keys used by the orchestrator in `chrome.storage.local`.
 * Kept here so the dev panel and tests can reference them.
 */
export const MIGRATION_KEYS = {
  appDataVersion: 'missionpulse.appDataVersion',
  backup: 'missionpulse.backup',
  downgrade: 'missionpulse.downgrade',
  migrationError: 'missionpulse.migrationError',
  rejectedCount: 'missionpulse.rejectedCount',
} as const;

/** Threshold above which validation rejects trigger non-destructive quarantine. */
export const QUARANTINE_REJECT_RATIO = 0.1;

/** Hard cap for the dev-panel toast on cumulative runtime rejects. */
export const RUNTIME_REJECT_TOAST_THRESHOLD = 50;

/** Backup size cap (bytes). Leaves headroom under the 10 MB quota. */
export const BACKUP_MAX_BYTES = 4 * 1024 * 1024;
