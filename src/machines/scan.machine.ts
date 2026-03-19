/**
 * Machine orchestratrice de scan XState 5
 *
 * Spawne les connector actors séquentiellement et agrège leurs états.
 * Cycle : idle → preparing → scanning → checkNext → (loop ou) done
 * Également : cancelled
 */

import { setup, assign, sendTo, type ActorRefFrom } from 'xstate';
import { connectorActorMachine, type ConnectorActorInput, type ConnectorActorOutput } from './connector.actor';
import type { Mission } from '../lib/core/types/mission';
import type { ConnectorStatus, ConnectorState } from '../lib/core/types/connector-status';
import { createInitialStatus } from '../lib/core/types/connector-status';

// ============================================================================
// Types
// ============================================================================

export type ConnectorDeps = ConnectorActorInput;

export type ScanOrchestratorInput = {
  connectorDeps: ConnectorDeps[];
  isOnline: () => boolean;
};

type ScanOrchestratorContext = {
  connectorStatuses: Map<string, ConnectorStatus>;
  currentConnectorIndex: number;
  connectorDeps: ConnectorDeps[];
  missions: Mission[];
  globalError: string | null;
  isOnline: () => boolean;
};

type ScanOrchestratorEvent =
  | { type: 'START_SCAN' }
  | { type: 'CANCEL' }
  | { type: 'RESET' };

// ============================================================================
// Helpers
// ============================================================================

/** Mappe l'état interne du child actor vers un ConnectorState */
function mapChildStateToConnectorState(childStateValue: string): ConnectorState | null {
  switch (childStateValue) {
    case 'detecting':
      return 'detecting';
    case 'fetching':
      return 'fetching';
    case 'retrying':
      return 'retrying';
    default:
      return null;
  }
}

/** Contexte initial vide pour les resets */
function createEmptyContext(input: ScanOrchestratorInput): ScanOrchestratorContext {
  return {
    connectorStatuses: new Map(),
    currentConnectorIndex: 0,
    connectorDeps: input.connectorDeps,
    missions: [],
    globalError: null,
    isOnline: input.isOnline,
  };
}

// ============================================================================
// Machine
// ============================================================================

export const scanOrchestratorMachine = setup({
  types: {
    context: {} as ScanOrchestratorContext,
    input: {} as ScanOrchestratorInput,
    events: {} as ScanOrchestratorEvent,
  },
  actors: {
    connectorActor: connectorActorMachine,
  },
}).createMachine({
  id: 'scanOrchestrator',
  initial: 'idle',
  context: ({ input }) => createEmptyContext(input),
  states: {
    idle: {
      on: {
        START_SCAN: [
          {
            guard: ({ context }) => context.connectorDeps.length === 0,
            target: 'done',
          },
          {
            guard: ({ context }) => !context.isOnline(),
            target: 'done',
            actions: assign({
              globalError: () => 'Pas de connexion internet',
            }),
          },
          {
            target: 'preparing',
          },
        ],
      },
    },

    preparing: {
      entry: assign({
        connectorStatuses: ({ context }) => {
          const map = new Map<string, ConnectorStatus>();
          for (const dep of context.connectorDeps) {
            map.set(dep.connectorId, createInitialStatus(dep.connectorId, dep.connectorName));
          }
          return map;
        },
        currentConnectorIndex: () => 0,
        missions: () => [],
        globalError: () => null,
      }),
      always: { target: 'scanning' },
    },

    scanning: {
      invoke: {
        id: 'currentConnector',
        src: 'connectorActor',
        input: ({ context }) => context.connectorDeps[context.currentConnectorIndex],
        onSnapshot: {
          actions: assign({
            connectorStatuses: ({ context, event }) => {
              const snapshot = event.snapshot;
              const stateValue = snapshot.value as string;
              const mappedState = mapChildStateToConnectorState(stateValue);

              if (!mappedState) return context.connectorStatuses;

              const dep = context.connectorDeps[context.currentConnectorIndex];
              const current = context.connectorStatuses.get(dep.connectorId);
              if (!current) return context.connectorStatuses;

              const childCtx = snapshot.context as { retryCount: number };
              const updated = new Map(context.connectorStatuses);
              updated.set(dep.connectorId, {
                ...current,
                state: mappedState,
                startedAt: current.startedAt ?? Date.now(),
                retryCount: childCtx.retryCount,
              });
              return updated;
            },
          }),
        },
        onDone: {
          target: 'checkNext',
          actions: assign({
            connectorStatuses: ({ context, event }) => {
              const dep = context.connectorDeps[context.currentConnectorIndex];
              const childOutput = event.output as ConnectorActorOutput;

              const updated = new Map(context.connectorStatuses);
              const current = context.connectorStatuses.get(dep.connectorId);
              if (!current) return updated;

              updated.set(dep.connectorId, {
                ...current,
                state: childOutput.error ? 'error' : 'done',
                missionsCount: childOutput.missions.length,
                error: childOutput.error,
                retryCount: childOutput.retryCount,
                completedAt: childOutput.completedAt ?? Date.now(),
              });
              return updated;
            },
            missions: ({ context, event }) => {
              const childOutput = event.output as ConnectorActorOutput;
              return [...context.missions, ...childOutput.missions];
            },
            currentConnectorIndex: ({ context }) => context.currentConnectorIndex + 1,
          }),
        },
      },
      entry: sendTo('currentConnector', { type: 'START' }),
      on: {
        CANCEL: { target: 'cancelled' },
      },
    },

    checkNext: {
      always: [
        {
          guard: ({ context }) => context.currentConnectorIndex < context.connectorDeps.length,
          target: 'scanning',
        },
        {
          target: 'done',
        },
      ],
    },

    done: {
      on: {
        RESET: {
          target: 'idle',
          actions: assign(({ context }) => ({
            connectorStatuses: new Map<string, ConnectorStatus>(),
            currentConnectorIndex: 0,
            missions: [],
            globalError: null,
            connectorDeps: context.connectorDeps,
            isOnline: context.isOnline,
          })),
        },
        START_SCAN: {
          target: 'preparing',
          actions: assign(({ context }) => ({
            connectorStatuses: new Map<string, ConnectorStatus>(),
            currentConnectorIndex: 0,
            missions: [],
            globalError: null,
            connectorDeps: context.connectorDeps,
            isOnline: context.isOnline,
          })),
        },
      },
    },

    cancelled: {
      on: {
        RESET: {
          target: 'idle',
          actions: assign(({ context }) => ({
            connectorStatuses: new Map<string, ConnectorStatus>(),
            currentConnectorIndex: 0,
            missions: [],
            globalError: null,
            connectorDeps: context.connectorDeps,
            isOnline: context.isOnline,
          })),
        },
      },
    },
  },
});

// ============================================================================
// Types exportés
// ============================================================================

export type ScanOrchestratorMachine = typeof scanOrchestratorMachine;
export type ScanOrchestratorActor = ActorRefFrom<typeof scanOrchestratorMachine>;
