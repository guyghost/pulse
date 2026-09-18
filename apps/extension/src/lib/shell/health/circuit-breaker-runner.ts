/**
 * CircuitBreakerRunner — Shell wrapper that:
 *  1. Measures the latency of each connector call
 *  2. Delegates the transition computation to the Core (computeNextHealth)
 *  3. Persists the updated snapshot
 *  4. Determines whether the circuit should be probed (half-open probe)
 *
 * Shell only: I/O, async, chrome.storage. Core never imports this module.
 */

import type { Mission } from '../../core/types/mission';
import type { Result, AppError } from '../../core/errors';
import type { ConnectorSearchContext } from '../../core/connectors/search-context';
import type { ConnectorHealthSnapshot, HealthThresholds } from '../../core/types/health';
import { DEFAULT_HEALTH_THRESHOLDS } from '../../core/types/health';
import {
  computeNextHealth,
  shouldAttemptProbe,
  transitionToHalfOpen,
} from '../../core/health/circuit-breaker';
import { getHealthSnapshot, saveHealthSnapshot } from '../storage/connector-health';
import type { PlatformConnector } from '../connectors/platform-connector';
import { withResultRetry } from '../utils/retry-strategy';

// ============================================================================
// Types
// ============================================================================

export type CircuitRunResult =
  | { status: 'executed'; result: Result<Mission[], AppError>; snapshot: ConnectorHealthSnapshot }
  | { status: 'skipped'; snapshot: ConnectorHealthSnapshot; reason: 'circuit-open' };

export interface CircuitRunLifecycleObserver {
  onRetryableFailure?(error: AppError, attempt: number): void;
  onRetryTimerFired?(attempt: number): void;
}

// ============================================================================
// CircuitBreakerRunner
// ============================================================================

/**
 * Runs a connector's fetchMissions through the circuit breaker.
 *
 * - If the circuit is `open` and the probe interval hasn't elapsed → returns `skipped`
 * - If the circuit is `open` and the probe interval has elapsed → attempts a probe (half-open)
 * - If the circuit is `closed` or `half-open` → executes normally
 *
 * @param connector   The connector to call
 * @param now         Current timestamp in ms
 * @param context     Optional search context
 * @param signal      Optional AbortSignal
 * @param thresholds  Configurable thresholds (default: DEFAULT_HEALTH_THRESHOLDS)
 */
export async function runWithCircuitBreaker(
  connector: PlatformConnector,
  now: number,
  context?: ConnectorSearchContext,
  signal?: AbortSignal,
  lifecycle?: CircuitRunLifecycleObserver,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): Promise<CircuitRunResult> {
  const throwIfAborted = (): void => {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
  };

  throwIfAborted();
  // Load the current snapshot (or create an initial snapshot on first run)
  let snapshot = await getHealthSnapshot(connector.id, now);
  throwIfAborted();

  // Check whether the circuit is open
  if (snapshot.circuitState === 'open') {
    if (!shouldAttemptProbe(snapshot, now, thresholds)) {
      // Circuit open, probe interval not yet elapsed → skip
      return { status: 'skipped', snapshot, reason: 'circuit-open' };
    }

    // Probe interval elapsed → move to half-open to attempt the probe
    snapshot = transitionToHalfOpen(snapshot, now);
    throwIfAborted();
    await saveHealthSnapshot(snapshot);
    throwIfAborted();

    if (import.meta.env.DEV) {
      console.debug(`[CircuitBreaker] ${connector.id}: open → half-open (probe attempt)`);
    }
  }

  // Execute the call with retry for transient errors,
  // then measure the total latency for the circuit breaker
  const startTime = performance.now();
  const result = await withResultRetry(
    () => connector.fetchMissions(now, context, signal),
    {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10_000,
    },
    signal,
    lifecycle
  );
  throwIfAborted();
  const latencyMs = Math.round(performance.now() - startTime);

  // Compute the next health state (pure function)
  const callResult = result.ok
    ? { success: true as const, latencyMs }
    : { success: false as const, latencyMs };

  const nextSnapshot = computeNextHealth(snapshot, callResult, now, thresholds);

  // Log state transitions in dev
  if (import.meta.env.DEV && nextSnapshot.circuitState !== snapshot.circuitState) {
    console.debug(
      `[CircuitBreaker] ${connector.id}: ${snapshot.circuitState} → ${nextSnapshot.circuitState}` +
        ` (failures: ${nextSnapshot.consecutiveFailures}, latency: ${latencyMs}ms)`
    );
  }

  // Persist the updated snapshot
  throwIfAborted();
  await saveHealthSnapshot(nextSnapshot);
  throwIfAborted();

  return { status: 'executed', result, snapshot: nextSnapshot };
}

/**
 * Reads a connector's current snapshot without executing it.
 * Useful for UI display without triggering a scan.
 */
export async function getConnectorHealth(
  connectorId: string,
  now: number
): Promise<ConnectorHealthSnapshot> {
  return getHealthSnapshot(connectorId, now);
}
