/**
 * AI diagnostics — pure aggregates for the AI engines panel.
 *
 * Each scan that runs the Jev classifier appends one entry; the panel reads
 * a rolling window (30 days) and derives totals. Pure module: no I/O, no
 * async, deterministic pruning.
 */

export interface AiScanDiagnosticsEntry {
  /** Epoch milliseconds of the scan that produced this entry. */
  scanAt: number;
  /** Missions that needed a classification (uncached candidates). */
  candidates: number;
  /** Classifications actually applied (confidence above threshold). */
  classified: number;
  /** Evaluated answers dropped because confidence was below threshold. */
  rejectedLowConfidence: number;
  /** Gateway/parse failures after retries. */
  failures: number;
  /** Gateway evaluations performed (cache hits excluded). */
  evaluations: number;
  /** Mean confidence of applied classifications in [0, 1]; null when none. */
  averageConfidence: number | null;
}

export const AI_DIAGNOSTICS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_AI_DIAGNOSTICS_ENTRIES = 60;

/**
 * Append one scan entry to the retained window: prune entries older than
 * 30 days (relative to the newest scan), cap the list length.
 */
export const buildAiDiagnosticsUpdate = (
  prev: readonly AiScanDiagnosticsEntry[],
  entry: AiScanDiagnosticsEntry
): AiScanDiagnosticsEntry[] => {
  const next = [...prev, entry];
  const windowStart = entry.scanAt - AI_DIAGNOSTICS_WINDOW_MS;
  const retained = next.filter((candidate) => candidate.scanAt >= windowStart);
  const overflow = Math.max(0, retained.length - MAX_AI_DIAGNOSTICS_ENTRIES);
  return retained.slice(overflow);
};

export interface AiDiagnosticsSummary {
  /** Scan entries retained in the window. */
  scans: number;
  candidates: number;
  classified: number;
  rejectedLowConfidence: number;
  failures: number;
  evaluations: number;
  /** Confidence mean over every applied classification; null when none. */
  averageConfidence: number | null;
}

/** Totals over the retained window. `averageConfidence` is scan-count weighted. */
export const summarizeAiDiagnostics = (
  entries: readonly AiScanDiagnosticsEntry[]
): AiDiagnosticsSummary => {
  const summary: AiDiagnosticsSummary = {
    scans: entries.length,
    candidates: 0,
    classified: 0,
    rejectedLowConfidence: 0,
    failures: 0,
    evaluations: 0,
    averageConfidence: null,
  };

  let confidenceSum = 0;
  let confidenceWeight = 0;
  for (const entry of entries) {
    summary.candidates += entry.candidates;
    summary.classified += entry.classified;
    summary.rejectedLowConfidence += entry.rejectedLowConfidence;
    summary.failures += entry.failures;
    summary.evaluations += entry.evaluations;
    if (entry.averageConfidence !== null && entry.classified > 0) {
      confidenceSum += entry.averageConfidence * entry.classified;
      confidenceWeight += entry.classified;
    }
  }
  summary.averageConfidence = confidenceWeight > 0 ? confidenceSum / confidenceWeight : null;

  return summary;
};
