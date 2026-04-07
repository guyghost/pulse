/**
 * Singleton connection store — shared across App and all pages.
 *
 * Avoids duplicate subscribeToConnection() calls.
 */
import { createConnectionStore, type ConnectionStore } from '$lib/state/connection.svelte';

let instance: ConnectionStore | null = null;

export function getConnectionStore(): ConnectionStore {
  if (!instance) {
    instance = createConnectionStore();
  }
  return instance;
}
