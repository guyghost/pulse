/**
 * Source health signals (Functional Core).
 *
 * Derives the 4 aggregate risk signals shown in the "Santé des sources" card:
 * duplicates, suspicious parsers, stale sources and off-target missions.
 * See `src/models/source-health-signals.model.md` for the authoritative
 * definitions, thresholds and invariants.
 *
 * This module is PURE: no I/O, no async, no `Date.now()`, no `console`,
 * no `chrome.*`. `now` is injected by the Shell caller.
 */

import type { Mission } from '../types/mission';
import type { PersistedConnectorStatus } from '../types/connector-status';
import { BROKEN_PARSER_THRESHOLD } from './parser-health-logic';

// ============================================================================
// Constants (model §3)
// ============================================================================

/** Rate of merged missions (last scan) above which the duplicates signal is `warn` (%) */
export const DUPLICATES_WARN_RATE = 5;
/** Rate of merged missions (last scan) above which the duplicates signal is `alert` (%) */
export const DUPLICATES_ALERT_RATE = 15;
/** Delay after which a source without success is considered stale */
export const STALE_SOURCE_THRESHOLD_MS = 48 * 60 * 60 * 1000;
/** Rate of off-target missions above which the signal is `warn` (%) */
export const OFFTARGET_WARN_RATE = 20;
/** Rate of off-target missions above which the signal is `alert` (%) */
export const OFFTARGET_ALERT_RATE = 40;
/** Missions with a score below this grade boundary (D/F) are off-target */
export const SCORE_OUT_OF_TARGET = 40;
const DAY_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// Types
// ============================================================================

export type SourceHealthSeverity = 'ok' | 'warn' | 'alert';

export type SourceHealthSignalId = 'duplicates' | 'parsers' | 'stale' | 'offtarget';

export type SourceHealthUnit = '%' | 'count';

export interface SourceHealthSignal {
  id: SourceHealthSignalId;
  label: string;
  detail: string;
  value: number;
  unit: SourceHealthUnit;
  severity: SourceHealthSeverity;
  /** 0..1 — length of the gauge arc */
  ratio: number;
}

/** Persisted dedup statistics for the last scan (shell: scan_signal_stats). */
export interface DedupStats {
  lastScanAt: number;
  /** Missions scraped before deduplication */
  rawCount: number;
  /** Missions merged away by deduplication */
  mergedCount: number;
  /** 'YYYY-MM' the monthly counter belongs to */
  monthKey: string;
  /** Missions merged during the current month */
  monthMergedCount: number;
}

/** Aggregated score statistics derived from the mission catalogue. */
export interface ScoreStats {
  /** Missions with a non-null score */
  totalScored: number;
  /** Scored missions below SCORE_OUT_OF_TARGET */
  outOfTarget: number;
  /** Distinct mission sources among scored missions */
  connectorCount: number;
}

export interface SourceHealthSignalsInput {
  healthRecords: ConnectorHealthRecordInput[];
  persistedStatuses: PersistedConnectorStatus[];
  dedupStats: DedupStats | null;
  scoreStats: ScoreStats | null;
}

/** Structural subset of ConnectorHealthRecord needed for the derivation. */
export interface ConnectorHealthRecordInput {
  connectorId: string;
  lastSuccessAt: number | null;
  consecutiveZeros: number;
}

export interface SourceHealthSignalsResult {
  signals: SourceHealthSignal[];
  /** Distinct active connectors (union of records and persisted statuses) */
  activeConnectorCount: number;
}

// ============================================================================
// Pure helpers
// ============================================================================

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function ratePercent(part: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((part / total) * 100);
}

function formatMonthKey(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count > 1 ? pluralForm : singular;
}

/**
 * Derives ScoreStats from the (deduplicated, scored) mission catalogue.
 * Pure — used by the UI shell before calling computeSourceHealthSignals.
 */
export function computeScoreStats(missions: Mission[]): ScoreStats {
  let totalScored = 0;
  let outOfTarget = 0;
  const sources = new Set<string>();
  for (const mission of missions) {
    if (mission.score === null || mission.score === undefined) {
      continue;
    }
    totalScored++;
    sources.add(mission.source);
    if (mission.score < SCORE_OUT_OF_TARGET) {
      outOfTarget++;
    }
  }
  return { totalScored, outOfTarget, connectorCount: sources.size };
}

/**
 * Merges a new scan's dedup counts into the persisted stats, rolling the
 * monthly counter over when the month changed. Pure.
 */
export function buildDedupStatsUpdate(
  prev: DedupStats | null,
  next: { rawCount: number; mergedCount: number },
  now: Date
): DedupStats {
  const monthKey = formatMonthKey(now);
  const monthMergedCount =
    prev !== null && prev.monthKey === monthKey
      ? prev.monthMergedCount + next.mergedCount
      : next.mergedCount;
  return {
    lastScanAt: now.getTime(),
    rawCount: next.rawCount,
    mergedCount: next.mergedCount,
    monthKey,
    monthMergedCount,
  };
}

// ============================================================================
// Signal derivations
// ============================================================================

function deriveDuplicatesSignal(dedupStats: DedupStats | null): SourceHealthSignal {
  const rawCount = dedupStats?.rawCount ?? 0;
  const mergedCount = dedupStats?.mergedCount ?? 0;
  const value = ratePercent(mergedCount, rawCount);
  const severity: SourceHealthSeverity =
    value >= DUPLICATES_ALERT_RATE ? 'alert' : value >= DUPLICATES_WARN_RATE ? 'warn' : 'ok';
  const monthMergedCount = dedupStats?.monthMergedCount ?? 0;
  return {
    id: 'duplicates',
    label: 'Doublons',
    detail: `${monthMergedCount} ${plural(monthMergedCount, 'fusionnée', 'fusionnées')} ce mois`,
    value,
    unit: '%',
    severity,
    ratio: clamp01(value / 100),
  };
}

function deriveParsersSignal(healthRecords: ConnectorHealthRecordInput[]): SourceHealthSignal {
  let suspects = 0;
  let maxZeros = 0;
  for (const record of healthRecords) {
    if (record.consecutiveZeros > 0) {
      suspects++;
      if (record.consecutiveZeros > maxZeros) {
        maxZeros = record.consecutiveZeros;
      }
    }
  }
  const severity: SourceHealthSeverity =
    maxZeros >= BROKEN_PARSER_THRESHOLD ? 'alert' : suspects > 0 ? 'warn' : 'ok';
  return {
    id: 'parsers',
    label: 'Parsers suspects',
    detail: `Seuil d'alerte à ${BROKEN_PARSER_THRESHOLD}`,
    value: suspects,
    unit: 'count',
    severity,
    ratio: clamp01(maxZeros / BROKEN_PARSER_THRESHOLD),
  };
}

function deriveStaleSignal(
  activeConnectors: string[],
  lastSuccessByConnector: Map<string, number | null>,
  now: Date
): SourceHealthSignal {
  let staleCount = 0;
  let maxDelayMs = 0;
  let hasNeverSucceeded = false;
  for (const connectorId of activeConnectors) {
    const lastSuccessAt = lastSuccessByConnector.get(connectorId) ?? null;
    if (lastSuccessAt === null) {
      staleCount++;
      hasNeverSucceeded = true;
      continue;
    }
    const delay = now.getTime() - lastSuccessAt;
    if (delay > STALE_SOURCE_THRESHOLD_MS) {
      staleCount++;
      if (delay > maxDelayMs) {
        maxDelayMs = delay;
      }
    }
  }

  let detail: string;
  if (staleCount === 0) {
    detail = 'Dernier succès < 48h';
  } else if (hasNeverSucceeded && maxDelayMs === 0) {
    detail = 'Dernier succès : jamais';
  } else if (hasNeverSucceeded) {
    detail = `Dernier succès : jamais · il y a ${Math.floor(maxDelayMs / DAY_MS)}j`;
  } else {
    detail = `Dernier succès il y a ${Math.floor(maxDelayMs / DAY_MS)}j`;
  }

  const severity: SourceHealthSeverity =
    staleCount >= 2 ? 'alert' : staleCount === 1 ? 'warn' : 'ok';
  return {
    id: 'stale',
    label: 'Sources en retard',
    detail,
    value: staleCount,
    unit: 'count',
    severity,
    ratio: clamp01(staleCount / activeConnectors.length),
  };
}

function deriveOffTargetSignal(scoreStats: ScoreStats | null): SourceHealthSignal {
  const totalScored = scoreStats?.totalScored ?? 0;
  const outOfTarget = scoreStats?.outOfTarget ?? 0;
  const connectorCount = scoreStats?.connectorCount ?? 0;
  const value = ratePercent(outOfTarget, totalScored);
  const severity: SourceHealthSeverity =
    value >= OFFTARGET_ALERT_RATE ? 'alert' : value >= OFFTARGET_WARN_RATE ? 'warn' : 'ok';
  return {
    id: 'offtarget',
    label: 'Hors-cible',
    detail: `${outOfTarget} ${plural(outOfTarget, 'mission', 'missions')} · ${connectorCount} ${plural(connectorCount, 'connecteur', 'connecteurs')}`,
    value,
    unit: '%',
    severity,
    ratio: clamp01(value / 100),
  };
}

// ============================================================================
// Public entry point
// ============================================================================

const CANONICAL_ORDER: SourceHealthSignalId[] = ['duplicates', 'parsers', 'stale', 'offtarget'];

const SEVERITY_RANK: Record<SourceHealthSeverity, number> = { alert: 0, warn: 1, ok: 2 };

/**
 * Computes the source health signals from persisted records.
 * Pure and deterministic: same (input, now) ⇒ same output.
 * Returns an empty signal list when no active connector exists.
 */
export function computeSourceHealthSignals(
  input: SourceHealthSignalsInput,
  now: Date
): SourceHealthSignalsResult {
  const activeSet = new Set<string>();
  for (const record of input.healthRecords) {
    activeSet.add(record.connectorId);
  }
  for (const status of input.persistedStatuses) {
    activeSet.add(status.connectorId);
  }
  const activeConnectors = [...activeSet];

  if (activeConnectors.length === 0) {
    return { signals: [], activeConnectorCount: 0 };
  }

  const lastSuccessByConnector = new Map<string, number | null>();
  for (const record of input.healthRecords) {
    lastSuccessByConnector.set(record.connectorId, record.lastSuccessAt);
  }
  for (const status of input.persistedStatuses) {
    const existing = lastSuccessByConnector.get(status.connectorId);
    if (existing === undefined || existing === null) {
      lastSuccessByConnector.set(status.connectorId, status.lastSuccessAt);
    }
  }

  const signals: SourceHealthSignal[] = [
    deriveDuplicatesSignal(input.dedupStats),
    deriveParsersSignal(input.healthRecords),
    deriveStaleSignal(activeConnectors, lastSuccessByConnector, now),
    deriveOffTargetSignal(input.scoreStats),
  ];

  // Model §4: severity desc → ratio desc → canonical order (full determinism).
  signals.sort((a, b) => {
    const severityDelta = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }
    if (b.ratio !== a.ratio) {
      return b.ratio - a.ratio;
    }
    return CANONICAL_ORDER.indexOf(a.id) - CANONICAL_ORDER.indexOf(b.id);
  });

  return { signals, activeConnectorCount: activeConnectors.length };
}
