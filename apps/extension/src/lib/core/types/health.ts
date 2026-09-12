/**
 * Types for the connector circuit breaker and health monitoring system.
 *
 * Core rules: pure, no I/O, no Date.now(), no Shell imports.
 */

// ============================================================================
// Circuit Breaker States
// ============================================================================

/**
 * Circuit breaker states:
 * - `closed`    : connector operational, calls go through normally
 * - `open`      : connector failing, calls are blocked
 * - `half-open` : probing phase to test recovery
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * User-facing health status derived from the circuit breaker snapshot.
 */
export type ConnectorHealthStatus = 'healthy' | 'degraded' | 'broken';

// ============================================================================
// Health Snapshot
// ============================================================================

/**
 * Complete health snapshot of a connector.
 * All timestamps are in ms (Unix epoch), injected from the Shell.
 */
export interface ConnectorHealthSnapshot {
  readonly connectorId: string;
  /** Current circuit state */
  readonly circuitState: CircuitState;
  /** Consecutive failures since the last success */
  readonly consecutiveFailures: number;
  /** Total failures since creation */
  readonly totalFailures: number;
  /** Total successes since creation */
  readonly totalSuccesses: number;
  /** Timestamp of the last success (null if never succeeded) */
  readonly lastSuccessAt: number | null;
  /** Timestamp of the last failure (null if never failed) */
  readonly lastFailureAt: number | null;
  /** Timestamp of the last circuit state change */
  readonly lastStateChangeAt: number;
  /** Recent latencies in ms (rolling window, max 100 entries) */
  readonly recentLatenciesMs: readonly number[];
}

// ============================================================================
// Connector Result (input for health computation)
// ============================================================================

/**
 * Result of a connector call, used to update the health snapshot.
 */
export type ConnectorCallResult =
  | { readonly success: true; readonly latencyMs: number }
  | { readonly success: false; readonly latencyMs: number };

// ============================================================================
// Health Thresholds (configuration)
// ============================================================================

/**
 * Configurable circuit breaker thresholds.
 * Reasonable defaults defined in the Shell.
 */
export interface HealthThresholds {
  /** Number of consecutive failures to move closed → open (default: 3) */
  readonly failureThreshold: number;
  /** Minimum time in open state before attempting half-open, in ms (default: 30 min) */
  readonly probeIntervalMs: number;
  /** Rolling window for latencies (default: 100) */
  readonly latencyWindowSize: number;
}

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  failureThreshold: 5, // 5 persistent failures (each after 3 retries) to open
  probeIntervalMs: 5 * 60 * 1000, // Probe every 5min (instead of 30min)
  latencyWindowSize: 100,
};

// ============================================================================
// Health Metrics (computed from snapshot)
// ============================================================================

/**
 * Metrics computed from a snapshot (latencies, error rate).
 */
export interface HealthMetrics {
  /** Median latency (p50) in ms, null if no data */
  readonly p50LatencyMs: number | null;
  /** p95 latency in ms, null if no data */
  readonly p95LatencyMs: number | null;
  /** Overall failure rate 0-1 */
  readonly failureRate: number;
  /** Total number of calls */
  readonly totalCalls: number;
  /** Time elapsed since the last success in ms, null if never succeeded */
  readonly msSinceLastSuccess: number | null;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates an initial health snapshot (closed circuit, no data).
 * `now` is injected from the Shell.
 */
export function createInitialHealthSnapshot(
  connectorId: string,
  now: number
): ConnectorHealthSnapshot {
  return {
    connectorId,
    circuitState: 'closed',
    consecutiveFailures: 0,
    totalFailures: 0,
    totalSuccesses: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastStateChangeAt: now,
    recentLatenciesMs: [],
  };
}
