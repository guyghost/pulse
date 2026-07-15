import { assign, setup } from 'xstate';
import type { Mission } from '../lib/core/types/mission';

export type ScanLifecycleState =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'retrying'
  | 'cancelling'
  | 'cancelled'
  | 'persisting'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'busy';

export type ScanTrigger = 'manual' | 'alarm' | 'first_scan';

export interface ConnectorScanError {
  connectorId: string;
  code: string;
  message: string;
}

export interface ScanLifecycleError {
  code: string;
  message: string;
}

export interface ScanCheckpoint {
  operationId: string;
  state: Exclude<ScanLifecycleState, 'idle' | 'busy'>;
  trigger: ScanTrigger;
  connectorResults: Readonly<Record<string, 'pending' | 'running' | 'succeeded' | 'failed'>>;
  cancellationRequested: boolean;
}

export interface ScanLifecycleContext {
  operationId: string | null;
  trigger: ScanTrigger | null;
  startedAt: number | null;
  connectorIds: readonly string[];
  pendingConnectorIds: readonly string[];
  retryPendingConnectorIds: readonly string[];
  connectorResults: Readonly<Record<string, 'pending' | 'running' | 'succeeded' | 'failed'>>;
  retryCountByConnector: Readonly<Record<string, number>>;
  maxRetries: number;
  missions: readonly Mission[];
  errors: readonly ConnectorScanError[];
  persistenceStarted: boolean;
  persistenceCommitted: boolean;
  cancellationRequested: boolean;
  networkOnline: boolean;
  activeLeaseOperationId: string | null;
  error: ScanLifecycleError | null;
}

export interface ScanLifecycleInput {
  now: number;
  maxRetries: number;
  activeLeaseOperationId: string | null;
}

export type ScanLifecycleEvent =
  | { type: 'START'; operationId: string; trigger: ScanTrigger }
  | { type: 'START_READY'; operationId: string; connectorIds: readonly string[] }
  | { type: 'START_FAILED'; operationId: string; error: ScanLifecycleError }
  | { type: 'CONNECTOR_STARTED'; operationId: string; connectorId: string }
  | {
      type: 'CONNECTOR_SUCCEEDED';
      operationId: string;
      connectorId: string;
      missions: readonly Mission[];
    }
  | {
      type: 'CONNECTOR_FAILED';
      operationId: string;
      connectorId: string;
      error: ConnectorScanError;
      retryable: boolean;
    }
  | { type: 'RETRY_SCHEDULED'; operationId: string; connectorId: string }
  | { type: 'RETRY_TIMER_FIRED'; operationId: string; connectorId: string }
  | { type: 'CONNECTORS_SETTLED'; operationId: string }
  | { type: 'PERSIST_SUCCEEDED'; operationId: string }
  | { type: 'PERSIST_FAILED'; operationId: string; error: ScanLifecycleError }
  | { type: 'CANCEL'; operationId: string }
  | { type: 'ABORT_CONFIRMED'; operationId: string }
  | { type: 'NETWORK_OFFLINE'; operationId: string }
  | { type: 'NETWORK_ONLINE'; operationId: string }
  | { type: 'SERVICE_WORKER_RESTARTED'; checkpoint: ScanCheckpoint | null }
  | { type: 'RESET' };

function isOperationEvent(
  event: ScanLifecycleEvent
): event is Exclude<ScanLifecycleEvent, { type: 'SERVICE_WORKER_RESTARTED' } | { type: 'RESET' }> {
  return 'operationId' in event;
}

function isMatchingOperation(context: ScanLifecycleContext, event: ScanLifecycleEvent): boolean {
  return isOperationEvent(event) && context.operationId === event.operationId;
}

function isConnectorUnsettled(context: ScanLifecycleContext, connectorId: string): boolean {
  const state = context.connectorResults[connectorId];
  return state === 'pending' || state === 'running';
}

function without(values: readonly string[], value: string): string[] {
  return values.filter((item) => item !== value);
}

function restoredContext(
  context: ScanLifecycleContext,
  checkpoint: ScanCheckpoint
): Partial<ScanLifecycleContext> {
  return {
    operationId: checkpoint.operationId,
    trigger: checkpoint.trigger,
    connectorIds: Object.keys(checkpoint.connectorResults),
    connectorResults: checkpoint.connectorResults,
    cancellationRequested: checkpoint.cancellationRequested,
    activeLeaseOperationId: null,
    error:
      checkpoint.state === 'starting' ||
      checkpoint.state === 'scanning' ||
      checkpoint.state === 'retrying' ||
      checkpoint.state === 'persisting'
        ? { code: 'WORKER_RESTARTED', message: 'Le service worker a redémarré pendant le scan.' }
        : null,
  };
}

const lifecycleSetup = setup({
  types: {
    context: {} as ScanLifecycleContext,
    events: {} as ScanLifecycleEvent,
    input: {} as ScanLifecycleInput,
  },
  guards: {
    leaseAvailable: ({ context }) => context.activeLeaseOperationId === null,
    leaseHeld: ({ context }) => context.activeLeaseOperationId !== null,
    matchingOperation: ({ context, event }) => isMatchingOperation(context, event),
    connectorUnsettled: ({ context, event }) =>
      (event.type === 'CONNECTOR_STARTED' || event.type === 'CONNECTOR_SUCCEEDED') &&
      isMatchingOperation(context, event) &&
      isConnectorUnsettled(context, event.connectorId),
    retryAllowed: ({ context, event }) =>
      event.type === 'CONNECTOR_FAILED' &&
      isMatchingOperation(context, event) &&
      isConnectorUnsettled(context, event.connectorId) &&
      event.retryable &&
      (context.retryCountByConnector[event.connectorId] ?? 0) < context.maxRetries &&
      context.networkOnline &&
      !context.cancellationRequested,
    terminalConnectorFailure: ({ context, event }) =>
      event.type === 'CONNECTOR_FAILED' &&
      isMatchingOperation(context, event) &&
      isConnectorUnsettled(context, event.connectorId) &&
      (!event.retryable ||
        (context.retryCountByConnector[event.connectorId] ?? 0) >= context.maxRetries ||
        !context.networkOnline ||
        context.cancellationRequested),
    retryScheduledForPendingFailure: ({ context, event }) =>
      event.type === 'RETRY_SCHEDULED' &&
      isMatchingOperation(context, event) &&
      isConnectorUnsettled(context, event.connectorId) &&
      (context.retryCountByConnector[event.connectorId] ?? 0) <= context.maxRetries &&
      context.networkOnline &&
      !context.cancellationRequested,
    otherRetriesPending: ({ context, event }) =>
      event.type === 'RETRY_TIMER_FIRED' &&
      isMatchingOperation(context, event) &&
      context.retryPendingConnectorIds.includes(event.connectorId) &&
      context.retryPendingConnectorIds.some((id) => id !== event.connectorId),
    lastRetryPending: ({ context, event }) =>
      event.type === 'RETRY_TIMER_FIRED' &&
      isMatchingOperation(context, event) &&
      context.retryPendingConnectorIds.length === 1 &&
      context.retryPendingConnectorIds[0] === event.connectorId,
    allConnectorsSettledWithSuccess: ({ context, event }) =>
      event.type === 'CONNECTORS_SETTLED' &&
      isMatchingOperation(context, event) &&
      context.connectorIds.length > 0 &&
      context.connectorIds.every((id) => {
        const state = context.connectorResults[id];
        return state === 'succeeded' || state === 'failed';
      }) &&
      context.retryPendingConnectorIds.length === 0 &&
      context.connectorIds.some((id) => context.connectorResults[id] === 'succeeded'),
    allConnectorsFailed: ({ context, event }) =>
      event.type === 'CONNECTORS_SETTLED' &&
      isMatchingOperation(context, event) &&
      context.connectorIds.length > 0 &&
      context.connectorIds.every((id) => context.connectorResults[id] === 'failed'),
    allConnectorsSucceeded: ({ context, event }) =>
      event.type === 'PERSIST_SUCCEEDED' &&
      isMatchingOperation(context, event) &&
      context.connectorIds.length > 0 &&
      context.connectorIds.every((id) => context.connectorResults[id] === 'succeeded'),
    someConnectorsFailed: ({ context, event }) =>
      event.type === 'PERSIST_SUCCEEDED' &&
      isMatchingOperation(context, event) &&
      context.connectorIds.some((id) => context.connectorResults[id] === 'succeeded') &&
      context.connectorIds.some((id) => context.connectorResults[id] === 'failed'),
    canCancelPersisting: ({ context, event }) =>
      event.type === 'CANCEL' &&
      isMatchingOperation(context, event) &&
      !context.persistenceCommitted,
    noCheckpoint: ({ event }) =>
      event.type === 'SERVICE_WORKER_RESTARTED' && event.checkpoint === null,
    recoverableCheckpoint: ({ event }) =>
      event.type === 'SERVICE_WORKER_RESTARTED' &&
      event.checkpoint !== null &&
      ['starting', 'scanning', 'retrying', 'persisting'].includes(event.checkpoint.state),
    cancellingCheckpoint: ({ event }) =>
      event.type === 'SERVICE_WORKER_RESTARTED' && event.checkpoint?.state === 'cancelling',
    completedCheckpoint: ({ event }) =>
      event.type === 'SERVICE_WORKER_RESTARTED' && event.checkpoint?.state === 'completed',
    partialCheckpoint: ({ event }) =>
      event.type === 'SERVICE_WORKER_RESTARTED' && event.checkpoint?.state === 'partial',
    failedCheckpoint: ({ event }) =>
      event.type === 'SERVICE_WORKER_RESTARTED' && event.checkpoint?.state === 'failed',
    cancelledCheckpoint: ({ event }) =>
      event.type === 'SERVICE_WORKER_RESTARTED' && event.checkpoint?.state === 'cancelled',
  },
  actions: {
    startOperation: assign(({ context, event }) => {
      if (event.type !== 'START') {
        return {};
      }
      return {
        operationId: event.operationId,
        trigger: event.trigger,
        startedAt: context.startedAt,
        activeLeaseOperationId: event.operationId,
        cancellationRequested: false,
        error: null,
      };
    }),
    initializeConnectors: assign(({ event }) => {
      if (event.type !== 'START_READY') {
        return {};
      }
      return {
        connectorIds: [...event.connectorIds],
        pendingConnectorIds: [...event.connectorIds],
        retryPendingConnectorIds: [],
        connectorResults: Object.fromEntries(
          event.connectorIds.map((id) => [id, 'pending' as const])
        ),
        retryCountByConnector: {},
      };
    }),
    setFailure: assign(({ event }) => {
      if (event.type !== 'START_FAILED' && event.type !== 'PERSIST_FAILED') {
        return {};
      }
      return { error: event.error, activeLeaseOperationId: null };
    }),
    markConnectorRunning: assign(({ context, event }) => {
      if (event.type !== 'CONNECTOR_STARTED') {
        return {};
      }
      return {
        connectorResults: { ...context.connectorResults, [event.connectorId]: 'running' as const },
      };
    }),
    markConnectorSucceeded: assign(({ context, event }) => {
      if (event.type !== 'CONNECTOR_SUCCEEDED') {
        return {};
      }
      return {
        connectorResults: {
          ...context.connectorResults,
          [event.connectorId]: 'succeeded' as const,
        },
        pendingConnectorIds: without(context.pendingConnectorIds, event.connectorId),
        retryPendingConnectorIds: without(context.retryPendingConnectorIds, event.connectorId),
        missions: [...context.missions, ...event.missions],
      };
    }),
    recordRetryableFailure: assign(({ context, event }) => {
      if (event.type !== 'CONNECTOR_FAILED') {
        return {};
      }
      return {
        retryCountByConnector: {
          ...context.retryCountByConnector,
          [event.connectorId]: (context.retryCountByConnector[event.connectorId] ?? 0) + 1,
        },
        errors: [
          ...context.errors.filter((error) => error.connectorId !== event.connectorId),
          event.error,
        ],
      };
    }),
    settleConnectorFailure: assign(({ context, event }) => {
      if (event.type !== 'CONNECTOR_FAILED') {
        return {};
      }
      return {
        connectorResults: { ...context.connectorResults, [event.connectorId]: 'failed' as const },
        pendingConnectorIds: without(context.pendingConnectorIds, event.connectorId),
        retryPendingConnectorIds: without(context.retryPendingConnectorIds, event.connectorId),
        errors: [
          ...context.errors.filter((error) => error.connectorId !== event.connectorId),
          event.error,
        ],
      };
    }),
    scheduleRetry: assign(({ context, event }) => {
      if (event.type !== 'RETRY_SCHEDULED') {
        return {};
      }
      return {
        retryPendingConnectorIds: context.retryPendingConnectorIds.includes(event.connectorId)
          ? context.retryPendingConnectorIds
          : [...context.retryPendingConnectorIds, event.connectorId],
      };
    }),
    consumeRetry: assign(({ context, event }) => {
      if (event.type !== 'RETRY_TIMER_FIRED') {
        return {};
      }
      return {
        retryPendingConnectorIds: without(context.retryPendingConnectorIds, event.connectorId),
        connectorResults: { ...context.connectorResults, [event.connectorId]: 'pending' as const },
      };
    }),
    settleUnfinishedOffline: assign(({ context }) => {
      const unfinishedIds = context.connectorIds.filter((id) => isConnectorUnsettled(context, id));
      return {
        networkOnline: false,
        pendingConnectorIds: [],
        retryPendingConnectorIds: [],
        connectorResults: unfinishedIds.reduce(
          (results, id) => ({ ...results, [id]: 'failed' as const }),
          { ...context.connectorResults }
        ),
        errors: [
          ...context.errors.filter((error) => !unfinishedIds.includes(error.connectorId)),
          ...unfinishedIds.map((connectorId) => ({
            connectorId,
            code: 'OFFLINE',
            message: 'Connexion interrompue pendant le scan.',
          })),
        ],
      };
    }),
    markOnline: assign({ networkOnline: true }),
    beginPersistence: assign({ persistenceStarted: true }),
    commitPersistence: assign({
      persistenceCommitted: true,
      activeLeaseOperationId: null,
    }),
    requestCancellation: assign({ cancellationRequested: true }),
    confirmCancellation: assign({ activeLeaseOperationId: null }),
    restoreCheckpoint: assign(({ context, event }) =>
      event.type === 'SERVICE_WORKER_RESTARTED' && event.checkpoint
        ? restoredContext(context, event.checkpoint)
        : {}
    ),
  },
});

const activeConnectorTransitions = {
  CONNECTOR_STARTED: { guard: 'connectorUnsettled', actions: 'markConnectorRunning' },
  CONNECTOR_SUCCEEDED: { guard: 'connectorUnsettled', actions: 'markConnectorSucceeded' },
  CONNECTOR_FAILED: [
    { guard: 'retryAllowed', actions: 'recordRetryableFailure' },
    { guard: 'terminalConnectorFailure', actions: 'settleConnectorFailure' },
  ],
  NETWORK_OFFLINE: { guard: 'matchingOperation', actions: 'settleUnfinishedOffline' },
  NETWORK_ONLINE: { guard: 'matchingOperation', actions: 'markOnline' },
  CONNECTORS_SETTLED: [
    {
      guard: 'allConnectorsSettledWithSuccess',
      target: 'persisting',
      actions: 'beginPersistence',
    },
    { guard: 'allConnectorsFailed', target: 'failed' },
  ],
  CANCEL: { guard: 'matchingOperation', target: 'cancelling', actions: 'requestCancellation' },
} as const;

export const scanLifecycleMachine = lifecycleSetup.createMachine({
  id: 'scanLifecycle',
  initial: 'idle',
  context: ({ input }) => ({
    operationId: null,
    trigger: null,
    startedAt: input.now,
    connectorIds: [],
    pendingConnectorIds: [],
    retryPendingConnectorIds: [],
    connectorResults: {},
    retryCountByConnector: {},
    maxRetries: input.maxRetries,
    missions: [],
    errors: [],
    persistenceStarted: false,
    persistenceCommitted: false,
    cancellationRequested: false,
    networkOnline: true,
    activeLeaseOperationId: input.activeLeaseOperationId,
    error: null,
  }),
  states: {
    idle: {
      on: {
        START: [
          { guard: 'leaseAvailable', target: 'starting', actions: 'startOperation' },
          { guard: 'leaseHeld', target: 'busy' },
        ],
        SERVICE_WORKER_RESTARTED: [
          { guard: 'noCheckpoint', target: 'idle' },
          { guard: 'recoverableCheckpoint', target: 'failed', actions: 'restoreCheckpoint' },
          { guard: 'cancellingCheckpoint', target: 'cancelled', actions: 'restoreCheckpoint' },
          { guard: 'completedCheckpoint', target: 'completed', actions: 'restoreCheckpoint' },
          { guard: 'partialCheckpoint', target: 'partial', actions: 'restoreCheckpoint' },
          { guard: 'failedCheckpoint', target: 'failed', actions: 'restoreCheckpoint' },
          { guard: 'cancelledCheckpoint', target: 'cancelled', actions: 'restoreCheckpoint' },
        ],
      },
    },
    starting: {
      on: {
        START_READY: {
          guard: 'matchingOperation',
          target: 'scanning',
          actions: 'initializeConnectors',
        },
        START_FAILED: { guard: 'matchingOperation', target: 'failed', actions: 'setFailure' },
        NETWORK_OFFLINE: { guard: 'matchingOperation', target: 'failed' },
        CANCEL: {
          guard: 'matchingOperation',
          target: 'cancelling',
          actions: 'requestCancellation',
        },
      },
    },
    scanning: {
      on: {
        ...activeConnectorTransitions,
        RETRY_SCHEDULED: {
          guard: 'retryScheduledForPendingFailure',
          target: 'retrying',
          actions: 'scheduleRetry',
        },
      },
    },
    retrying: {
      on: {
        ...activeConnectorTransitions,
        RETRY_SCHEDULED: {
          guard: 'retryScheduledForPendingFailure',
          actions: 'scheduleRetry',
        },
        RETRY_TIMER_FIRED: [
          { guard: 'otherRetriesPending', actions: 'consumeRetry' },
          { guard: 'lastRetryPending', target: 'scanning', actions: 'consumeRetry' },
        ],
      },
    },
    persisting: {
      on: {
        PERSIST_SUCCEEDED: [
          { guard: 'allConnectorsSucceeded', target: 'completed', actions: 'commitPersistence' },
          { guard: 'someConnectorsFailed', target: 'partial', actions: 'commitPersistence' },
        ],
        PERSIST_FAILED: { guard: 'matchingOperation', target: 'failed', actions: 'setFailure' },
        CANCEL: {
          guard: 'canCancelPersisting',
          target: 'cancelling',
          actions: 'requestCancellation',
        },
      },
    },
    cancelling: {
      on: {
        ABORT_CONFIRMED: {
          guard: 'matchingOperation',
          target: 'cancelled',
          actions: 'confirmCancellation',
        },
      },
    },
    cancelled: { type: 'final' },
    completed: { type: 'final' },
    partial: { type: 'final' },
    failed: { type: 'final' },
    busy: { type: 'final' },
  },
});
