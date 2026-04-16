/**
 * CircuitBreakerRunner — Wrapper Shell qui :
 *  1. Mesure la latence de chaque appel connecteur
 *  2. Délègue le calcul de la transition au Core (computeNextHealth)
 *  3. Persiste le snapshot mis à jour
 *  4. Détermine si le circuit doit être sondé (half-open probe)
 *
 * Shell only : I/O, async, chrome.storage. Core n'importe jamais ce module.
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
import {
  getHealthSnapshot,
  saveHealthSnapshot,
} from '../storage/connector-health';
import type { PlatformConnector } from '../connectors/platform-connector';
import { err } from '../../core/errors/result';

// ============================================================================
// Types
// ============================================================================

export type CircuitRunResult =
  | { status: 'executed'; result: Result<Mission[], AppError>; snapshot: ConnectorHealthSnapshot }
  | { status: 'skipped'; snapshot: ConnectorHealthSnapshot; reason: 'circuit-open' };

// ============================================================================
// CircuitBreakerRunner
// ============================================================================

/**
 * Exécute fetchMissions d'un connecteur en passant par le circuit breaker.
 *
 * - Si le circuit est `open` et que le probe interval n'est pas écoulé → retourne `skipped`
 * - Si le circuit est `open` et que le probe interval est écoulé → tente une sonde (half-open)
 * - Si le circuit est `closed` ou `half-open` → exécute normalement
 *
 * @param connector   Le connecteur à appeler
 * @param now         Timestamp courant en ms
 * @param context     Contexte de recherche optionnel
 * @param signal      AbortSignal optionnel
 * @param thresholds  Seuils configurables (défaut: DEFAULT_HEALTH_THRESHOLDS)
 */
export async function runWithCircuitBreaker(
  connector: PlatformConnector,
  now: number,
  context?: ConnectorSearchContext,
  signal?: AbortSignal,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): Promise<CircuitRunResult> {
  // Charger le snapshot courant (ou créer un snapshot initial si premier run)
  let snapshot = await getHealthSnapshot(connector.id, now);

  // Vérifier si le circuit est ouvert
  if (snapshot.circuitState === 'open') {
    if (!shouldAttemptProbe(snapshot, now, thresholds)) {
      // Circuit ouvert, probe interval pas encore écoulé → skip
      return { status: 'skipped', snapshot, reason: 'circuit-open' };
    }

    // Probe interval écoulé → passer en half-open pour tenter la sonde
    snapshot = transitionToHalfOpen(snapshot, now);
    await saveHealthSnapshot(snapshot);

    if (import.meta.env.DEV) {
      console.log(`[CircuitBreaker] ${connector.id}: open → half-open (probe attempt)`);
    }
  }

  // Exécuter l'appel et mesurer la latence
  const startTime = performance.now();
  const result = await connector.fetchMissions(now, context, signal);
  const latencyMs = Math.round(performance.now() - startTime);

  // Calculer le prochain état de santé (pure function)
  const callResult = result.ok
    ? { success: true as const, latencyMs }
    : { success: false as const, latencyMs };

  const nextSnapshot = computeNextHealth(snapshot, callResult, now, thresholds);

  // Loguer les transitions d'état en dev
  if (import.meta.env.DEV && nextSnapshot.circuitState !== snapshot.circuitState) {
    console.log(
      `[CircuitBreaker] ${connector.id}: ${snapshot.circuitState} → ${nextSnapshot.circuitState}` +
        ` (failures: ${nextSnapshot.consecutiveFailures}, latency: ${latencyMs}ms)`
    );
  }

  // Persister le snapshot mis à jour
  await saveHealthSnapshot(nextSnapshot);

  return { status: 'executed', result, snapshot: nextSnapshot };
}

/**
 * Lit le snapshot courant d'un connecteur sans l'exécuter.
 * Utile pour l'affichage UI sans déclencher de scan.
 */
export async function getConnectorHealth(
  connectorId: string,
  now: number
): Promise<ConnectorHealthSnapshot> {
  return getHealthSnapshot(connectorId, now);
}
