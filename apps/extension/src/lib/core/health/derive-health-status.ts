import type { ConnectorHealthSnapshot, ConnectorHealthStatus } from '../types/health';

/**
 * Translate low-level circuit breaker state into a user-facing health status.
 * Pure function — zero I/O, zero side effects.
 */
export function deriveHealthStatus(
  snapshot: ConnectorHealthSnapshot,
  threshold = 3
): ConnectorHealthStatus {
  if (snapshot.circuitState === 'open' || snapshot.consecutiveFailures >= threshold) {
    return 'broken';
  }

  if (snapshot.circuitState === 'half-open' || snapshot.consecutiveFailures > 0) {
    return 'degraded';
  }

  return 'healthy';
}
