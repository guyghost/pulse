/**
 * ScanOrchestrator — remplace scanOrchestratorMachine (XState) par des runes Svelte 5
 *
 * Itère les connecteurs séquentiellement, collecte les missions et suit la progression.
 */

import type { Mission } from '$lib/core/types/mission';
import type { ConnectorStatus } from '$lib/core/types/connector-status';
import { createInitialStatus } from '$lib/core/types/connector-status';
import { ConnectorRunner, type ConnectorActorInput } from './connector-runner.svelte';

// ============================================================================
// Types
// ============================================================================

export type ConnectorDeps = ConnectorActorInput;

export type ScanOrchestratorInput = {
  connectorDeps: ConnectorDeps[];
  isOnline: () => boolean;
};

export type ScanOrchestratorState = 'idle' | 'scanning' | 'done' | 'cancelled';

// ============================================================================
// ScanOrchestrator
// ============================================================================

export class ScanOrchestrator {
  state = $state<ScanOrchestratorState>('idle');
  connectorStatuses = $state<Map<string, ConnectorStatus>>(new Map());
  currentConnectorIndex = $state(0);
  missions = $state<Mission[]>([]);
  globalError = $state<string | null>(null);

  private readonly connectorDeps: ConnectorDeps[];
  private readonly isOnline: () => boolean;
  private cancelled = false;

  constructor(input: ScanOrchestratorInput) {
    this.connectorDeps = input.connectorDeps;
    this.isOnline = input.isOnline;
  }

  async startScan(): Promise<void> {
    // Garde : aucun connecteur
    if (this.connectorDeps.length === 0) {
      this.state = 'done';
      return;
    }

    // Garde : hors ligne
    if (!this.isOnline()) {
      this.globalError = 'Pas de connexion internet';
      this.state = 'done';
      return;
    }

    // Initialisation
    this.cancelled = false;
    this.currentConnectorIndex = 0;
    this.missions = [];
    this.globalError = null;

    const statuses = new Map<string, ConnectorStatus>();
    for (const dep of this.connectorDeps) {
      statuses.set(dep.connectorId, createInitialStatus(dep.connectorId, dep.connectorName));
    }
    this.connectorStatuses = statuses;
    this.state = 'scanning';

    // Itération séquentielle
    for (let i = 0; i < this.connectorDeps.length; i++) {
      if (this.cancelled) {
        this.state = 'cancelled';
        return;
      }

      this.currentConnectorIndex = i;
      const dep = this.connectorDeps[i];

      const runner = new ConnectorRunner({
        ...dep,
        onProgress: ({ state, retryCount }) => {
          if (this.cancelled) return;
          const current = this.connectorStatuses.get(dep.connectorId);
          if (!current) return;

          // Mapper l'état runner vers ConnectorState
          if (state === 'detecting' || state === 'fetching' || state === 'retrying') {
            const updated = new Map(this.connectorStatuses);
            updated.set(dep.connectorId, {
              ...current,
              state,
              startedAt: current.startedAt ?? Date.now(),
              retryCount,
            });
            this.connectorStatuses = updated;
          }
        },
      });

      const output = await runner.run();

      if (this.cancelled) {
        this.state = 'cancelled';
        return;
      }

      // Mise à jour du statut final du connecteur
      const current = this.connectorStatuses.get(dep.connectorId);
      const updated = new Map(this.connectorStatuses);
      updated.set(dep.connectorId, {
        ...(current ?? createInitialStatus(dep.connectorId, dep.connectorName)),
        state: output.error ? 'error' : 'done',
        missionsCount: output.missions.length,
        error: output.error,
        retryCount: output.retryCount,
        completedAt: output.completedAt ?? Date.now(),
      });
      this.connectorStatuses = updated;

      // Agrégation des missions
      if (output.missions.length > 0) {
        this.missions = [...this.missions, ...output.missions];
      }
    }

    this.state = 'done';
  }

  cancel(): void {
    if (this.state === 'scanning') {
      this.cancelled = true;
      this.state = 'cancelled';
    }
  }

  reset(): void {
    this.cancelled = false;
    this.state = 'idle';
    this.connectorStatuses = new Map();
    this.currentConnectorIndex = 0;
    this.missions = [];
    this.globalError = null;
  }
}
