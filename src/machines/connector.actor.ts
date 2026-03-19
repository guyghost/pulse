/**
 * Machine acteur XState 5 pour un connecteur individuel
 *
 * Cycle de vie : idle → detecting → fetching → done
 * Avec boucle de retry (backoff exponentiel + jitter) depuis fetching
 *
 * Pas d'I/O direct : detectSession et fetchMissions sont injectés via input
 */

import { setup, assign, fromPromise } from 'xstate';
import type { Mission } from '../lib/core/types/mission';
import type { AppError } from '../lib/core/errors/app-error';
import { createConnectorError, isRetryable } from '../lib/core/errors/app-error';
import type { Result } from '../lib/core/errors/result';

// ============================================================================
// Types d'entrée et de contexte
// ============================================================================

type DetectFn = (now: number) => Promise<Result<boolean, AppError>>;
type FetchFn = (now: number) => Promise<Result<Mission[], AppError>>;

export type ConnectorActorInput = {
  connectorId: string;
  connectorName: string;
  detectSession: DetectFn;
  fetchMissions: FetchFn;
  maxRetries?: number;
};

export type ConnectorActorContext = {
  connectorId: string;
  connectorName: string;
  missions: Mission[];
  error: AppError | null;
  retryCount: number;
  maxRetries: number;
  startedAt: number;
  completedAt: number | null;
  detectSession: DetectFn;
  fetchMissions: FetchFn;
};

// ============================================================================
// Helpers
// ============================================================================

/** Calcule le délai de backoff exponentiel avec jitter (max 10s) */
function computeBackoff(retryCount: number): number {
  const base = Math.min(1000 * Math.pow(2, retryCount), 10_000);
  const jitter = base * 0.3 * Math.random();
  return base + jitter;
}

// ============================================================================
// Acteurs asynchrones (fromPromise)
// ============================================================================

const detectSessionActor = fromPromise<Result<boolean, AppError>, { detectSession: DetectFn }>(
  async ({ input }) => {
    return input.detectSession(Date.now());
  },
);

const fetchMissionsActor = fromPromise<Result<Mission[], AppError>, { fetchMissions: FetchFn }>(
  async ({ input }) => {
    return input.fetchMissions(Date.now());
  },
);

const retryDelayActor = fromPromise<void, { retryCount: number }>(
  async ({ input }) => {
    const delay = computeBackoff(input.retryCount);
    await new Promise((resolve) => setTimeout(resolve, delay));
  },
);

// ============================================================================
// Machine
// ============================================================================

export const connectorActorMachine = setup({
  types: {
    context: {} as ConnectorActorContext,
    input: {} as ConnectorActorInput,
    events: {} as { type: 'START' },
  },
  actors: {
    detectSession: detectSessionActor,
    fetchMissions: fetchMissionsActor,
    retryDelay: retryDelayActor,
  },
}).createMachine({
  id: 'connectorActor',
  initial: 'idle',
  context: ({ input }) => ({
    connectorId: input.connectorId,
    connectorName: input.connectorName,
    missions: [],
    error: null,
    retryCount: 0,
    maxRetries: input.maxRetries ?? 3,
    startedAt: Date.now(),
    completedAt: null,
    detectSession: input.detectSession,
    fetchMissions: input.fetchMissions,
  }),
  states: {
    idle: {
      on: {
        START: { target: 'detecting' },
      },
    },

    detecting: {
      invoke: {
        src: 'detectSession',
        input: ({ context }) => ({ detectSession: context.detectSession }),
        onDone: [
          {
            // ok: true, value: true → session active, on passe au fetch
            guard: ({ event }) => event.output.ok === true && event.output.value === true,
            target: 'fetching',
          },
          {
            // ok: true, value: false → session expirée
            guard: ({ event }) => event.output.ok === true && event.output.value === false,
            target: 'done',
            actions: assign({
              error: ({ context }) =>
                createConnectorError('Session non détectée', {
                  connectorId: context.connectorId,
                  phase: 'detect',
                  recoverable: true,
                }, Date.now()),
              completedAt: () => Date.now(),
            }),
          },
          {
            // ok: false → erreur retournée par le connecteur
            target: 'done',
            actions: assign({
              error: ({ event }) => (event.output as Result<boolean, AppError> & { ok: false }).error,
              completedAt: () => Date.now(),
            }),
          },
        ],
        onError: {
          target: 'done',
          actions: assign({
            error: ({ context, event }) =>
              createConnectorError(
                event.error instanceof Error ? event.error.message : 'Erreur inattendue lors de la détection',
                { connectorId: context.connectorId, phase: 'detect', recoverable: false },
                Date.now(),
              ),
            completedAt: () => Date.now(),
          }),
        },
      },
    },

    fetching: {
      invoke: {
        src: 'fetchMissions',
        input: ({ context }) => ({ fetchMissions: context.fetchMissions }),
        onDone: [
          {
            // ok: true → missions récupérées
            guard: ({ event }) => event.output.ok === true,
            target: 'done',
            actions: assign({
              missions: ({ event }) => (event.output as Result<Mission[], AppError> & { ok: true }).value,
              error: () => null,
              completedAt: () => Date.now(),
            }),
          },
          {
            // ok: false, retryable et sous le max → on retry
            guard: ({ event, context }) =>
              event.output.ok === false &&
              isRetryable((event.output as Result<Mission[], AppError> & { ok: false }).error) &&
              context.retryCount < context.maxRetries,
            target: 'retrying',
            actions: assign({
              error: ({ event }) => (event.output as Result<Mission[], AppError> & { ok: false }).error,
              retryCount: ({ context }) => context.retryCount + 1,
            }),
          },
          {
            // ok: false, non retryable ou max atteint → done avec erreur
            target: 'done',
            actions: assign({
              error: ({ event }) => (event.output as Result<Mission[], AppError> & { ok: false }).error,
              completedAt: () => Date.now(),
            }),
          },
        ],
        onError: {
          target: 'done',
          actions: assign({
            error: ({ context, event }) =>
              createConnectorError(
                event.error instanceof Error ? event.error.message : 'Erreur inattendue lors du fetch',
                { connectorId: context.connectorId, phase: 'fetch', recoverable: false },
                Date.now(),
              ),
            completedAt: () => Date.now(),
          }),
        },
      },
    },

    retrying: {
      invoke: {
        src: 'retryDelay',
        input: ({ context }) => ({ retryCount: context.retryCount }),
        onDone: {
          target: 'fetching',
        },
        onError: {
          // Si le delay échoue (improbable), on retente directement
          target: 'fetching',
        },
      },
    },

    done: {
      type: 'final',
    },
  },
});

export type ConnectorActorMachine = typeof connectorActorMachine;
