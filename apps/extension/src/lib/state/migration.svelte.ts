/**
 * Migration state store — Svelte 5 runes wrapper around the migration
 * orchestrator bridge messages. Lets the UI / dev panel react to DB
 * migration state changes without polling and without importing IndexedDB
 * storage directly.
 *
 * This is a UI-only projection: it holds no business logic. The single
 * source of truth is the service worker's `db.ts` + `db-migration.model.md`.
 */

import { sendMessage, subscribeMessages } from '$lib/shell/messaging/bridge';
import type { MigrationSnapshot } from '$lib/shell/storage/migration-types';

export interface MigrationStore {
  readonly snapshot: MigrationSnapshot;
  /** Re-runs the orchestrator via the bridge. Safe to call on every cold start. */
  run(): Promise<void>;
  /** Tears down the subscription. Call on component destroy. */
  destroy(): void;
}

const INITIAL_SNAPSHOT: MigrationSnapshot = {
  state: 'idle',
  storedDbVersion: null,
  storedDataVersion: null,
  lastError: null,
  rejectedCount: 0,
};

/**
 * Create a reactive migration store. Requests the current status immediately
 * and keeps the snapshot in sync by subscribing to migration bridge messages.
 */
export function createMigrationStore(): MigrationStore {
  let snapshot = $state<MigrationSnapshot>(INITIAL_SNAPSHOT);

  // Bootstrap: fetch current status from the service worker.
  sendMessage({ type: 'GET_MIGRATION_STATUS' })
    .then((response) => {
      if (response.type === 'MIGRATION_STATUS_RESULT') {
        snapshot = response.payload;
      }
    })
    .catch(() => {
      // Service worker not yet available — snapshot stays at initial value.
    });

  // Stay in sync with migration events pushed by the service worker.
  const unsubscribe = subscribeMessages((message) => {
    if (message.type === 'MIGRATION_STATUS_RESULT') {
      snapshot = message.payload;
    } else if (message.type === 'MIGRATION_DONE') {
      // Reflect the completed state by fetching the current snapshot.
      sendMessage({ type: 'GET_MIGRATION_STATUS' })
        .then((response) => {
          if (response.type === 'MIGRATION_STATUS_RESULT') {
            snapshot = response.payload;
          }
        })
        .catch(() => {});
    } else if (message.type === 'MIGRATION_FAILED') {
      snapshot = message.payload;
    }
  });

  return {
    get snapshot() {
      return snapshot;
    },
    async run() {
      const response = await sendMessage({ type: 'RUN_MIGRATIONS' });
      if (response.type === 'MIGRATION_STATUS_RESULT') {
        snapshot = response.payload;
      } else if (response.type === 'MIGRATION_FAILED') {
        snapshot = response.payload;
      }
    },
    destroy() {
      unsubscribe();
    },
  };
}
