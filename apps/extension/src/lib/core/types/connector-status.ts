/**
 * Types de statut des connecteurs pour le modèle d'acteurs XState 5
 *
 * Règles Core : pure, pas d'I/O, pas de Date.now()
 */

import type { AppError } from '../errors/app-error';

// ============================================================================
// Types
// ============================================================================

export type ConnectorState = 'pending' | 'detecting' | 'fetching' | 'retrying' | 'done' | 'error';

export interface ConnectorStatus {
  readonly connectorId: string;
  readonly connectorName: string;
  readonly state: ConnectorState;
  readonly missionsCount: number;
  readonly error: AppError | null;
  readonly retryCount: number;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
}

export interface PersistedConnectorStatus {
  readonly connectorId: string;
  readonly connectorName: string;
  readonly lastState: 'done' | 'error';
  readonly missionsCount: number;
  readonly error: Record<string, unknown> | null;
  readonly lastSyncAt: number;
  readonly lastSuccessAt: number | null;
}

// ============================================================================
// Factory functions
// ============================================================================

/** Crée un statut initial pour un connecteur (état 'pending', tout à zéro) */
export function createInitialStatus(connectorId: string, connectorName: string): ConnectorStatus {
  return {
    connectorId,
    connectorName,
    state: 'pending',
    missionsCount: 0,
    error: null,
    retryCount: 0,
    startedAt: null,
    completedAt: null,
  };
}

/** Convertit un ConnectorStatus terminal en PersistedConnectorStatus sérialisable */
export function toPersistedStatus(status: ConnectorStatus, now: number): PersistedConnectorStatus {
  const lastState: 'done' | 'error' = status.state === 'error' ? 'error' : 'done';

  return {
    connectorId: status.connectorId,
    connectorName: status.connectorName,
    lastState,
    missionsCount: status.missionsCount,
    error: status.error ? ({ ...status.error } as unknown as Record<string, unknown>) : null,
    lastSyncAt: now,
    lastSuccessAt: lastState === 'done' ? now : null,
  };
}
