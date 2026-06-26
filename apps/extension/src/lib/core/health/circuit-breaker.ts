/**
 * Circuit Breaker — Fonction pure de transition d'état.
 *
 * Règles Core : zéro I/O, zéro async, zéro side effect.
 * `now` est toujours injecté depuis le Shell — jamais Date.now() ici.
 */

import type {
  ConnectorHealthSnapshot,
  ConnectorCallResult,
  HealthThresholds,
} from '../types/health';
import { DEFAULT_HEALTH_THRESHOLDS } from '../types/health';

/**
 * Calcule le prochain health snapshot après un appel connecteur.
 *
 * Transitions d'état :
 *   closed    + failure × N   → open
 *   open      + elapsed > T   → half-open  (via timestamp, pas d'appel direct)
 *   half-open + success       → closed
 *   half-open + failure       → open
 *
 * @param current   Snapshot courant
 * @param result    Résultat de l'appel (success/failure + latence)
 * @param now       Timestamp courant en ms (injecté depuis Shell)
 * @param thresholds Seuils configurables (défaut: DEFAULT_HEALTH_THRESHOLDS)
 */
export function computeNextHealth(
  current: ConnectorHealthSnapshot,
  result: ConnectorCallResult,
  now: number,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): ConnectorHealthSnapshot {
  // Mise à jour fenêtre glissante des latences
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
 * Détermine si un circuit en état `open` doit passer en `half-open`.
 * À appeler avant chaque tentative d'appel sur un circuit ouvert.
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
 * Retourne un snapshot identique mais avec l'état passé à `half-open`.
 * Utilisé par le Shell pour marquer qu'une sonde va être tentée.
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
    // On met à jour lastStateChangeAt uniquement si on change d'état
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

  // half-open + failure → open immédiatement
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
