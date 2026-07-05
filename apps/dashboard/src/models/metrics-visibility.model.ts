/**
 * M2 — Metrics visibility model (source of truth).
 *
 * Pure function. Kills the four-giant-N/A credibility failure on first run:
 * empty metrics are OMITTED, never shown as "0 / N/A / Aucun".
 *
 * Invariants (asserted in tests/unit/models/metrics-visibility.model.test.ts):
 *  - `hidden` when there is no application data at all → the metrics region is
 *    not rendered; the feed's own count line carries it.
 *  - `partial` when some cards have data and some do not → render ONLY the
 *    non-empty cards.
 *  - `ready` when every card has a meaningful value.
 *  - A metric with value `0` / `null` / empty is `empty`, never `has_data`.
 *
 * FC&IS: zero I/O, zero async, fully testable without mocks.
 */

import type { MissionApplication } from '$lib/core/dashboard';

export type MetricsPhase = 'hidden' | 'partial' | 'ready';

export type MetricAvailability = 'has_data' | 'empty';

export type MetricKey = 'applications' | 'averageScore' | 'interviews' | 'nextFollowUp';

export type MetricAvailabilityMap = Record<MetricKey, MetricAvailability>;

export interface MetricsVisibilityInput {
  applicationCount: number;
  averageScore: number;
  interviewCount: number;
  nextFollowUp: MissionApplication | null;
}

/**
 * Per-metric availability. A metric "has data" only when it carries a
 * meaningful, non-vacuous value.
 */
export function deriveMetricAvailability(input: MetricsVisibilityInput): MetricAvailabilityMap {
  return {
    applications: input.applicationCount > 0 ? 'has_data' : 'empty',
    averageScore: input.applicationCount > 0 && input.averageScore > 0 ? 'has_data' : 'empty',
    interviews: input.interviewCount > 0 ? 'has_data' : 'empty',
    nextFollowUp: input.nextFollowUp ? 'has_data' : 'empty',
  };
}

/**
 * Derive the metrics-region phase from per-metric availability.
 *  - all empty    → hidden (region not rendered)
 *  - all has_data → ready
 *  - mixed        → partial (render only the non-empty cards)
 */
export function deriveMetricsPhase(availability: MetricAvailabilityMap): MetricsPhase {
  const values = Object.values(availability);
  const hasAny = values.some((v) => v === 'has_data');
  const allHave = values.every((v) => v === 'has_data');
  if (allHave) return 'ready';
  if (!hasAny) return 'hidden';
  return 'partial';
}

/** Convenience: full visibility decision in one call. */
export function deriveMetricsVisibility(input: MetricsVisibilityInput): {
  phase: MetricsPhase;
  availability: MetricAvailabilityMap;
} {
  const availability = deriveMetricAvailability(input);
  return { phase: deriveMetricsPhase(availability), availability };
}
