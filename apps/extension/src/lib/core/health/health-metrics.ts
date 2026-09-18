/**
 * Health Metrics — Metric computation from a snapshot.
 *
 * Core rules: zero I/O, zero async, zero side effects.
 * `now` is always injected from the Shell.
 */

import type { ConnectorHealthSnapshot, HealthMetrics } from '../types/health';

/**
 * Computes health metrics from a snapshot.
 *
 * @param snapshot  Current snapshot
 * @param now       Current timestamp in ms (injected from Shell)
 */
export function computeHealthMetrics(
  snapshot: ConnectorHealthSnapshot,
  now: number
): HealthMetrics {
  const latencies = snapshot.recentLatenciesMs;
  const totalCalls = snapshot.totalSuccesses + snapshot.totalFailures;

  return {
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    failureRate: totalCalls === 0 ? 0 : snapshot.totalFailures / totalCalls,
    totalCalls,
    msSinceLastSuccess: snapshot.lastSuccessAt !== null ? now - snapshot.lastSuccessAt : null,
  };
}

// ============================================================================
// Helpers internes (purs)
// ============================================================================

/**
 * Calcule le percentile P d'un tableau de valeurs.
 * Retourne null si le tableau est vide.
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  // Linear interpolation
  const fraction = index - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}
