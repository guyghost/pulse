/**
 * Projection de présentation pure pour la carte « Scans de la semaine ».
 *
 * Règles Core : pure — pas d'I/O, pas d'async, pas de Date.now()/Math.random()/console.
 * `now` et `weekStart` sont toujours injectés en paramètre par le Shell.
 *
 * Modèle : src/models/scan-runs-week.model.md
 * - Aucune transition d'état : lecture seule des statuts persistés/live.
 * - Fusion : le statut live gagne sur le persisté ; `lastSyncAt` retombe sur le
 *   persisté si le live n'en fournit pas (connecteur `pending` en file).
 * - Un item = un connecteur avec un `runAt` datable dans [weekStart, now].
 */

import type {
  ConnectorState,
  ConnectorStatus,
  PersistedConnectorStatus,
} from '../types/connector-status';

// ============================================================================
// Types
// ============================================================================

export type ScanRunTone = 'done' | 'active' | 'attention' | 'waiting';

/** Enregistrement unifié : fusion live/persisté, un par connecteur. */
export interface ScanRunRecord {
  readonly connectorId: string;
  readonly connectorName: string;
  readonly state: ConnectorState;
  readonly missionsCount: number;
  readonly startedAt: number | null;
  readonly lastSyncAt: number | null;
}

/** Item de présentation consommé par l'UI (molecule/organism). */
export interface ScanRunItem {
  readonly connectorId: string;
  readonly name: string;
  readonly state: ConnectorState;
  readonly missionsCount: number;
  readonly tone: ScanRunTone;
  /** Progression indicative 0..1, bornée ; le rendu segmenté est un choix UI. */
  readonly progress: number;
  /** Horodatage brut du run (toujours résolu : les items non datables sont exclus) ; l'UI formate. */
  readonly runAt: number;
}

// ============================================================================
// Constantes de projection (mapping pur état → présentation)
// ============================================================================

const TONE_BY_STATE: Readonly<Record<ConnectorState, ScanRunTone>> = {
  done: 'done',
  fetching: 'active',
  retrying: 'active',
  detecting: 'active',
  error: 'attention',
  pending: 'waiting',
};

const PROGRESS_BY_STATE: Readonly<Record<ConnectorState, number>> = {
  done: 1,
  fetching: 0.5,
  retrying: 0.5,
  detecting: 0.25,
  error: 0,
  pending: 0,
};

/** Priorité de tri : actifs → erreur → done → en attente. */
const SORT_RANK_BY_TONE: Readonly<Record<ScanRunTone, number>> = {
  active: 0,
  attention: 1,
  done: 2,
  waiting: 3,
};

// ============================================================================
// Bornes de semaine
// ============================================================================

/**
 * Début de semaine (00:00:00.000 local) contenant `now`.
 * `weekStartsOn` : 1 = lundi (défaut), 0 = dimanche.
 */
export function getWeekStart(now: number, weekStartsOn: 0 | 1 = 1): number {
  const date = new Date(now);
  const diff = (date.getDay() - weekStartsOn + 7) % 7;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

// ============================================================================
// Fusion live / persisté
// ============================================================================

/** Statut persisté → enregistrement unifié (état terminal borné done/error). */
function fromPersisted(status: PersistedConnectorStatus): ScanRunRecord {
  return {
    connectorId: status.connectorId,
    connectorName: status.connectorName,
    state: status.lastState,
    missionsCount: status.missionsCount,
    startedAt: null,
    lastSyncAt: Number.isFinite(status.lastSyncAt) ? status.lastSyncAt : null,
  };
}

/** Statut live → enregistrement unifié (lastSyncAt retombe sur le persisté si absent). */
function mergeLive(
  live: ConnectorStatus,
  persisted: PersistedConnectorStatus | undefined
): ScanRunRecord {
  const completedAt =
    live.completedAt !== null && Number.isFinite(live.completedAt) ? live.completedAt : null;
  const startedAt =
    live.startedAt !== null && Number.isFinite(live.startedAt) ? live.startedAt : null;
  const persistedLastSyncAt =
    persisted && Number.isFinite(persisted.lastSyncAt) ? persisted.lastSyncAt : null;

  return {
    connectorId: live.connectorId,
    connectorName: live.connectorName,
    state: live.state,
    missionsCount: live.missionsCount,
    startedAt,
    lastSyncAt: completedAt ?? persistedLastSyncAt,
  };
}

/**
 * Fusionne statuts live (en cours de scan) et persistés. Le live gagne par
 * `connectorId` ; les connecteurs uniquement persistés complètent la liste.
 */
export function mergeScanRunRecords(
  liveStatuses: readonly ConnectorStatus[],
  persistedStatuses: readonly PersistedConnectorStatus[]
): ScanRunRecord[] {
  const persistedById = new Map(persistedStatuses.map((status) => [status.connectorId, status]));
  const merged = new Map<string, ScanRunRecord>();

  for (const persisted of persistedStatuses) {
    merged.set(persisted.connectorId, fromPersisted(persisted));
  }
  for (const live of liveStatuses) {
    merged.set(live.connectorId, mergeLive(live, persistedById.get(live.connectorId)));
  }

  return [...merged.values()];
}

// ============================================================================
// Projection
// ============================================================================

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Résout l'horodatage du run selon l'état (modèle : « Définition d'un run de la semaine »). */
function resolveRunAt(record: ScanRunRecord): number | null {
  if (record.state === 'done' || record.state === 'error') {
    return record.lastSyncAt;
  }
  return record.startedAt ?? record.lastSyncAt;
}

/**
 * Projette les enregistrements en items de la carte, filtrés sur la semaine
 * courante `[weekStart, now]` et triés : actifs → erreur → done récents → en attente.
 */
export function buildScanRunSummaries(
  records: readonly ScanRunRecord[],
  weekStart: number,
  now: number
): ScanRunItem[] {
  const items: ScanRunItem[] = [];

  for (const record of records) {
    const runAt = resolveRunAt(record);
    if (runAt === null || runAt < weekStart || runAt > now) {
      continue;
    }

    const state = record.state;
    items.push({
      connectorId: record.connectorId,
      name: record.connectorName,
      state,
      missionsCount: Number.isFinite(record.missionsCount) ? Math.max(0, record.missionsCount) : 0,
      tone: TONE_BY_STATE[state],
      progress: clamp01(PROGRESS_BY_STATE[state]),
      runAt,
    });
  }

  return items.sort((a, b) => {
    const rankDiff = SORT_RANK_BY_TONE[a.tone] - SORT_RANK_BY_TONE[b.tone];
    if (rankDiff !== 0) {
      return rankDiff;
    }
    const timeDiff = b.runAt - a.runAt;
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return a.connectorId.localeCompare(b.connectorId);
  });
}
