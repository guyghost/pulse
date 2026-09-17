/**
 * State store of the "Scans of the week" card (Svelte 5 runes).
 *
 * Shell only: `Date.now()` is called here, never in the core.
 * Pure derivation via `buildScanRunSummaries` — no state transitions.
 * Model: src/models/scan-runs-week.model.md
 */

import {
  buildScanRunSummaries,
  getWeekStart,
  mergeScanRunRecords,
  type ScanRunItem,
} from '$lib/core/scan/scan-runs-presentation';
import type { ConnectorStatus, PersistedConnectorStatus } from '$lib/core/types/connector-status';

export interface ScanRunsStoreInputs {
  /** Live statuses of the running scan (reactive map from the feed controller). */
  getLiveStatuses: () => Map<string, ConnectorStatus>;
  /** Persisted statuses of the last run per connector. */
  getPersistedStatuses: () => PersistedConnectorStatus[];
}

export interface ScanRunsStore {
  /** Items of the current week, sorted per the model. */
  readonly items: ScanRunItem[];
  /** Number of displayed runs (= items.length, limit: 1 run max per connector). */
  readonly runCount: number;
}

export function createScanRunsStore(inputs: ScanRunsStoreInputs): ScanRunsStore {
  const items = $derived.by(() => {
    const now = Date.now();
    const records = mergeScanRunRecords(
      [...inputs.getLiveStatuses().values()],
      inputs.getPersistedStatuses()
    );
    return buildScanRunSummaries(records, getWeekStart(now), now);
  });

  return {
    get items() {
      return items;
    },
    get runCount() {
      return items.length;
    },
  };
}
