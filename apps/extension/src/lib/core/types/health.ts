/**
 * Types pour le système de circuit breaker et health monitoring des connecteurs.
 *
 * Règles Core : pure, pas d'I/O, pas de Date.now(), pas d'import Shell.
 */

// ============================================================================
// Circuit Breaker States
// ============================================================================

/**
 * États du circuit breaker :
 * - `closed`    : connecteur opérationnel, les appels passent normalement
 * - `open`      : connecteur en échec, les appels sont bloqués
 * - `half-open` : en phase de sonde pour tester la récupération
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
 * Snapshot complet de l'état de santé d'un connecteur.
 * Toutes les timestamps sont en ms (Unix epoch), injectées depuis le Shell.
 */
export interface ConnectorHealthSnapshot {
  readonly connectorId: string;
  /** État courant du circuit */
  readonly circuitState: CircuitState;
  /** Échecs consécutifs depuis le dernier succès */
  readonly consecutiveFailures: number;
  /** Total d'échecs depuis la création */
  readonly totalFailures: number;
  /** Total de succès depuis la création */
  readonly totalSuccesses: number;
  /** Timestamp du dernier succès (null si jamais réussi) */
  readonly lastSuccessAt: number | null;
  /** Timestamp du dernier échec (null si jamais échoué) */
  readonly lastFailureAt: number | null;
  /** Timestamp du dernier changement d'état du circuit */
  readonly lastStateChangeAt: number;
  /** Latences récentes en ms (fenêtre glissante, max 100 entrées) */
  readonly recentLatenciesMs: readonly number[];
}

// ============================================================================
// Connector Result (input for health computation)
// ============================================================================

/**
 * Résultat d'un appel connecteur, utilisé pour mettre à jour le health snapshot.
 */
export type ConnectorCallResult =
  | { readonly success: true; readonly latencyMs: number }
  | { readonly success: false; readonly latencyMs: number };

// ============================================================================
// Health Thresholds (configuration)
// ============================================================================

/**
 * Seuils configurables du circuit breaker.
 * Valeurs par défaut raisonnables définies dans le Shell.
 */
export interface HealthThresholds {
  /** Nombre d'échecs consécutifs pour passer closed → open (défaut: 3) */
  readonly failureThreshold: number;
  /** Durée minimale en état open avant de tenter half-open, en ms (défaut: 30 min) */
  readonly probeIntervalMs: number;
  /** Fenêtre glissante pour les latences (défaut: 100) */
  readonly latencyWindowSize: number;
}

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  failureThreshold: 5, // 5 échecs persistants (chacun après 3 retries) pour ouvrir
  probeIntervalMs: 5 * 60 * 1000, // Sonde toutes les 5min (au lieu de 30min)
  latencyWindowSize: 100,
};

// ============================================================================
// Health Metrics (computed from snapshot)
// ============================================================================

/**
 * Métriques calculées depuis un snapshot (latences, taux d'erreur).
 */
export interface HealthMetrics {
  /** Latence médiane (p50) en ms, null si aucune donnée */
  readonly p50LatencyMs: number | null;
  /** Latence p95 en ms, null si aucune donnée */
  readonly p95LatencyMs: number | null;
  /** Taux d'échec global 0-1 */
  readonly failureRate: number;
  /** Nombre total d'appels */
  readonly totalCalls: number;
  /** Temps écoulé depuis le dernier succès en ms, null si jamais réussi */
  readonly msSinceLastSuccess: number | null;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Crée un health snapshot initial (circuit fermé, aucune donnée).
 * Le `now` est injecté depuis le Shell.
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
