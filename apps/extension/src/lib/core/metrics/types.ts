/**
 * Performance metric types
 * Core = pure, zero I/O, zero side effects
 */

export type MetricUnit = 'ms' | 'bytes' | 'count' | 'percent';

export interface Metric {
  name: string;
  value: number;
  unit: MetricUnit;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface ScanMetrics {
  durationMs: number;
  totalMissions: number;
  missionsPerConnector: Record<string, number>;
  errors: Array<{ connectorId: string; errorType: string }>;
  dedupRatio: number; // % of deduplicated missions
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
}

export interface TimingMetric {
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
}

/**
 * Computes the hit rate from hits and misses
 * Pure function, testable without mocks
 */
export function calculateHitRate(hits: number, misses: number): number {
  const total = hits + misses;
  if (total === 0) {
    return 0;
  }
  return Math.round((hits / total) * 100 * 100) / 100; // Rounded to 2 decimals
}

/**
 * Computes the deduplication ratio
 * Pure function
 */
export function calculateDedupRatio(beforeCount: number, afterCount: number): number {
  if (beforeCount === 0) {
    return 0;
  }
  const removed = beforeCount - afterCount;
  return Math.round((removed / beforeCount) * 100 * 100) / 100;
}
