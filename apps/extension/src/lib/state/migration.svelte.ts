/**
 * Migration state store — Svelte 5 runes wrapper around the migration
 * orchestrator pub/sub (db.ts). Lets the UI / dev panel react to DB
 * migration state changes without polling.
 *
 * This is a UI-only projection: it holds no business logic. The single
 * source of truth is `db.ts` + `db-migration.model.md`.
 */

import { getMigrationStatus, subscribeMigrationState, runMigrations } from '$lib/shell/storage/db';
import type { MigrationSnapshot } from '$lib/shell/storage/migration-types';

export interface MigrationStore {
  readonly snapshot: MigrationSnapshot;
  /** Re-runs the orchestrator. Safe to call on every cold start. */
  run(): Promise<void>;
  /** Tears down the subscription. Call on component destroy. */
  destroy(): void;
}

/**
 * Create a reactive migration store. Subscribes immediately and keeps the
 * snapshot in sync via runes.
 */
export function createMigrationStore(): MigrationStore {
  let snapshot = $state<MigrationSnapshot>(getMigrationStatus());

  const unsubscribe = subscribeMigrationState((next) => {
    snapshot = next;
  });

  return {
    get snapshot() {
      return snapshot;
    },
    async run() {
      await runMigrations();
    },
    destroy() {
      unsubscribe();
    },
  };
}
