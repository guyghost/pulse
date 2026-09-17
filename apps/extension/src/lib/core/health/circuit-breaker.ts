/**
 * Circuit Breaker — Pure state transition function.
 *
 * Core rules: zero I/O, zero async, zero side effects.
 * `now` is always injected from the Shell — never Date.now() here.
 */

import type {
  ConnectorHealthSnapshot,
  ConnectorCallResult,
  HealthThresholds,
} from '../types/health';
import { DEFAULT_HEALTH_THRESHOLDS } from '../types/health';

/**
 * Computes the next health snapshot after a connector call.
 *
 * State transitions:
 *   closed    + failure × N   → open
 *   open      + elapsed > T   → half-open  (via timestamp, no direct call)
 *   half-open + success       → closed
 *   half-open + failure       → open
 *
 * @param current   Current snapshot
 * @param result    Call result (success/failure + latency)
 * @param now       Current timestamp in ms (injected from Shell)
 * @param thresholds Configurable thresholds (default: DEFAULT_HEALTH_THRESHOLDS)
 */
export function computeNextHealth(
  current: ConnectorHealthSnapshot,
  result: ConnectorCallResult,
  now: number,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): ConnectorHealthSnapshot {
  // Update the rolling latency window
  const latencies = appendLatency(
    current.recentLatenciesMs,
    result.latencyMs,
    thresholds.latencyWindowSize
  );

  if (result.success) {
    return handleSuccess(current, latencies, now);
  } else {
    return handleFailure(current, latencies, now, thresholds.failureThreshold);
  }
}

/**
 * Determines whether an `open` circuit should move to `half-open`.
 * Call before each attempt on an open circuit.
 *
 * @param snapshot  Snapshot courant
 * @param now       Timestamp courant en ms
 * @param thresholds Seuils configurables
 */
export function shouldAttemptProbe(
  snapshot: ConnectorHealthSnapshot,
  now: number,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): boolean {
  if (snapshot.circuitState !== 'open') {
    return false;
  }
  return now - snapshot.lastStateChangeAt >= thresholds.probeIntervalMs;
}

/**
 * Returns an identical snapshot with the state moved to `half-open`.
 * Used by the Shell to mark that a probe is about to be attempted.
 */
export function transitionToHalfOpen(
  snapshot: ConnectorHealthSnapshot,
  now: number
): ConnectorHealthSnapshot {
  return {
    ...snapshot,
    circuitState: 'half-open',
    lastStateChangeAt: now,
  };
}

// ============================================================================
// Helpers internes (purs)
// ============================================================================

function handleSuccess(
  current: ConnectorHealthSnapshot,
  latencies: readonly number[],
  now: number
): ConnectorHealthSnapshot {
  const wasOpenOrHalfOpen = current.circuitState === 'open' || current.circuitState === 'half-open';

  return {
    ...current,
    circuitState: 'closed',
    consecutiveFailures: 0,
    totalSuccesses: current.totalSuccesses + 1,
    lastSuccessAt: now,
    recentLatenciesMs: latencies,
    // Update lastStateChangeAt only when the state actually changes
    lastStateChangeAt: wasOpenOrHalfOpen ? now : current.lastStateChangeAt,
  };
}

function handleFailure(
  current: ConnectorHealthSnapshot,
  latencies: readonly number[],
  now: number,
  failureThreshold: number
): ConnectorHealthSnapshot {
  const consecutiveFailures = current.consecutiveFailures + 1;
  const totalFailures = current.totalFailures + 1;

  // half-open + failure → open immediately
  if (current.circuitState === 'half-open') {
    return {
      ...current,
      circuitState: 'open',
      consecutiveFailures,
      totalFailures,
      lastFailureAt: now,
      lastStateChangeAt: now,
      recentLatenciesMs: latencies,
    };
  }

  // closed + atteint le seuil → open
  const shouldOpen = current.circuitState === 'closed' && consecutiveFailures >= failureThreshold;

  return {
    ...current,
    circuitState: shouldOpen ? 'open' : current.circuitState,
    consecutiveFailures,
    totalFailures,
    lastFailureAt: now,
    lastStateChangeAt: shouldOpen ? now : current.lastStateChangeAt,
    recentLatenciesMs: latencies,
  };
}

function appendLatency(
  latencies: readonly number[],
  newLatencyMs: number,
  windowSize: number
): readonly number[] {
  const updated = [...latencies, newLatencyMs];
  if (updated.length > windowSize) {
    return updated.slice(updated.length - windowSize);
  }
  return updated;
}
