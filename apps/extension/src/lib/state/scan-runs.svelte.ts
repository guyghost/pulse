/**
 * Store d'état de la carte « Scans de la semaine » (Svelte 5 runes).
 *
 * Shell uniquement : `Date.now()` est appelé ici, jamais dans le core.
 * Dérivation pure via `buildScanRunSummaries` — aucune transition d'état.
 * Modèle : src/models/scan-runs-week.model.md
 */

import {
  buildScanRunSummaries,
  getWeekStart,
  mergeScanRunRecords,
  type ScanRunItem,
} from '$lib/core/scan/scan-runs-presentation';
import type { ConnectorStatus, PersistedConnectorStatus } from '$lib/core/types/connector-status';

export interface ScanRunsStoreInputs {
  /** Statuts live du scan en cours (map réactive du feed controller). */
  getLiveStatuses: () => Map<string, ConnectorStatus>;
  /** Statuts persistés du dernier run par connecteur. */
  getPersistedStatuses: () => PersistedConnectorStatus[];
}

export interface ScanRunsStore {
  /** Items de la semaine courante, triés selon le modèle. */
  readonly items: ScanRunItem[];
  /** Nombre de runs affichés (= items.length, limite : 1 run max par connecteur). */
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
