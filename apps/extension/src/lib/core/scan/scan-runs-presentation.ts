/**
 * Pure presentation projection for the "Scans of the week" card.
 *
 * Core rules: pure — no I/O, no async, no Date.now()/Math.random()/console.
 * `now` and `weekStart` are always injected as parameters by the Shell.
 *
 * Model: src/models/scan-runs-week.model.md
 * - No state transition: read-only view of persisted/live statuses.
 * - Merge: the live status wins over the persisted one; `lastSyncAt` falls
 *   back to the persisted one if the live doesn't provide it (queued `pending`
 *   connector).
 * - One item = one connector with a datable `runAt` within [weekStart, now].
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

/** Unified record: live/persisted merge, one per connector. */
export interface ScanRunRecord {
  readonly connectorId: string;
  readonly connectorName: string;
  readonly state: ConnectorState;
  readonly missionsCount: number;
  readonly startedAt: number | null;
  readonly lastSyncAt: number | null;
}

/** Presentation item consumed by the UI (molecule/organism). */
export interface ScanRunItem {
  readonly connectorId: string;
  readonly name: string;
  readonly state: ConnectorState;
  readonly missionsCount: number;
  readonly tone: ScanRunTone;
  /** Indicative progress 0..1, bounded; the segmented rendering is a UI choice. */
  readonly progress: number;
  /** Raw run timestamp (always resolved: non-datable items are excluded); the UI formats it. */
  readonly runAt: number;
}

// ============================================================================
// Projection constants (pure state → presentation mapping)
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

/** Sort priority: active → error → done → waiting. */
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
 * Start of the week (00:00:00.000 local time) containing `now`.
 * `weekStartsOn`: 1 = Monday (default), 0 = Sunday.
 */
export function getWeekStart(now: number, weekStartsOn: 0 | 1 = 1): number {
  const date = new Date(now);
  const diff = (date.getDay() - weekStartsOn + 7) % 7;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

// ============================================================================
// Live / persisted merge
// ============================================================================

/** Persisted status → unified record (terminal state bounded to done/error). */
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

/** Live status → unified record (lastSyncAt falls back to persisted when absent). */
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
 * Merges live (in-scan) and persisted statuses. Live wins per `connectorId`;
 * persisted-only connectors complete the list.
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

/** Resolves the run timestamp per state (model: "Définition d'un run de la semaine"). */
function resolveRunAt(record: ScanRunRecord): number | null {
  if (record.state === 'done' || record.state === 'error') {
    return record.lastSyncAt;
  }
  return record.startedAt ?? record.lastSyncAt;
}

/**
 * Projects records into card items, filtered to the current week
 * `[weekStart, now]` and sorted: active → error → recent done → waiting.
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
