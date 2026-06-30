/**
 * Pure parser-health decision logic (Functional Core).
 *
 * Tracks per-connector health to detect suspicious patterns:
 * - A connector returning 0 missions after previously returning >0
 * - Too many consecutive zero-results (possibly a broken parser)
 *
 * This module is PURE: no I/O, no async, no `Date.now()`, no `console`, no `chrome.*`.
 * The `now` timestamp and previous record are injected by the Shell caller.
 */

/**
 * Threshold at which consecutive zero-results suggest a broken parser
 * (e.g. the platform DOM changed and the parser no longer matches).
 */
export const BROKEN_PARSER_THRESHOLD = 5;

/**
 * Persisted health record for a single connector.
 * Owned by Core; the Shell loads/saves it via chrome.storage.
 */
export interface ConnectorHealthRecord {
  connectorId: string;
  lastMissionCount: number;
  lastSuccessAt: number | null;
  consecutiveZeros: number;
}

/**
 * Status returned to the caller after evaluating one connector result.
 */
export interface ParserHealthStatus {
  connectorId: string;
  missionCount: number;
  previousCount: number;
  isSuspicious: boolean;
  /** Non-null message when a suspicious pattern is detected */
  warning?: string;
}

/**
 * Result of evaluating parser health: the updated record (to persist)
 * plus the observable status (to return to the caller).
 */
export interface ParserHealthEvaluation {
  record: ConnectorHealthRecord;
  status: ParserHealthStatus;
}

/**
 * Build the warning message for the ">0 → 0" anomaly.
 * Pure string construction.
 */
export const buildParserWarning = (connectorId: string, previousCount: number): string =>
  `Parser anomaly: ${connectorId} returned 0 missions after previously returning ${previousCount}`;

/**
 * Evaluate parser health for a single connector result.
 *
 * Pure decision function: given the previous record (or null on first run),
 * the new mission count, and an injected `now` timestamp, computes the updated
 * record and a status describing whether the result is suspicious.
 *
 * @param connectorId The connector identifier
 * @param prev Previous health record, or null on first run
 * @param missionCount Number of missions returned by the connector this scan
 * @param now Current timestamp (injected; ms since epoch)
 * @returns Updated record (to persist) + status (to return)
 */
export const evaluateParserHealth = (
  connectorId: string,
  prev: ConnectorHealthRecord | null,
  missionCount: number,
  now: number
): ParserHealthEvaluation => {
  const previousCount = prev?.lastMissionCount ?? 0;
  const consecutiveZeros = missionCount === 0 ? (prev?.consecutiveZeros ?? 0) + 1 : 0;

  // Detect suspicious pattern: went from >0 to 0
  const isSuspicious = previousCount > 0 && missionCount === 0;

  const record: ConnectorHealthRecord = {
    connectorId,
    lastMissionCount: missionCount,
    lastSuccessAt: missionCount > 0 ? now : (prev?.lastSuccessAt ?? null),
    consecutiveZeros,
  };

  const status: ParserHealthStatus = {
    connectorId,
    missionCount,
    previousCount,
    isSuspicious,
  };

  if (isSuspicious) {
    status.warning = buildParserWarning(connectorId, previousCount);
  }

  return { record, status };
};

export interface ParserHealthAlert {
  severity: 'attention' | 'incident';
  statusLabel: string;
  impact: string;
  action: string;
}

/**
 * Derives a user-facing parser health alert from a persisted record.
 * Pure — no I/O.
 */
export const deriveParserHealthAlert = (
  record: ConnectorHealthRecord
): ParserHealthAlert | null => {
  if (record.consecutiveZeros >= BROKEN_PARSER_THRESHOLD) {
    return {
      severity: 'incident',
      statusLabel: 'Parser probablement cassé',
      impact: `${record.consecutiveZeros} scans consécutifs sans mission — le format de la plateforme a peut-être changé.`,
      action: 'Exportez un diagnostic depuis Paramètres et signalez le problème.',
    };
  }

  if (record.lastMissionCount === 0 && record.lastSuccessAt !== null) {
    return {
      severity: 'attention',
      statusLabel: 'Signal parser anormal',
      impact: 'La source a déjà produit des missions mais le dernier scan est vide.',
      action: 'Relancez le diagnostic ou vérifiez la plateforme.',
    };
  }

  return null;
};
